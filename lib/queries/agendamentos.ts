import { createClient } from "@/lib/supabase/client";
import { getManausDateString } from "@/lib/utils";
import type {
  Agendamento,
  ConflitoAgenda,
  ListaEsperaProfissional,
  DashboardMetrics,
  FaturamentoMensal,
  PagamentoPorMetodo,
} from "@/types/database";

const STATUS_EXCLUIDOS = ["Cancelado", "Não Compareceu"];

export async function getAgendamentos(): Promise<Agendamento[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("agendamentos")
    .select(
      `
      *,
      clientes ( id, nome, whatsapp ),
      servicos ( id, nome, categoria, preco_base, duracao_minutos )
    `
    )
    .order("data_hora", { ascending: false });

  if (error) throw error;
  return (data as Agendamento[]) ?? [];
}

export async function createAgendamento(
  payload: Omit<Agendamento, "id" | "user_id" | "criado_em" | "atualizado_em" | "clientes" | "servicos">
): Promise<Agendamento> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("agendamentos")
    .insert({ ...payload, user_id: user!.id })
    .select(`*, clientes(id,nome,whatsapp), servicos(id,nome,categoria,preco_base,duracao_minutos)`)
    .single();

  if (error) throw error;
  return data as Agendamento;
}

export async function updateAgendamento(
  id: string,
  payload: Partial<Omit<Agendamento, "id" | "user_id" | "criado_em" | "atualizado_em" | "clientes" | "servicos">>
): Promise<Agendamento> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("agendamentos")
    .update(payload)
    .eq("id", id)
    .select(`*, clientes(id,nome,whatsapp), servicos(id,nome,categoria,preco_base,duracao_minutos)`)
    .single();

  if (error) throw error;
  return data as Agendamento;
}

export async function deleteAgendamento(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("agendamentos").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// Dashboard queries (RN02 — exclui Cancelado e Não Compareceu)
// ============================================================
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = createClient();

  const [concluidos, pendentes] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("valor_final")
      .eq("status", "Concluído"),
    supabase
      .from("agendamentos")
      .select("valor_final, status")
      .in("status", ["Agendado", "Confirmado"]),
  ]);

  const faturamentoRealizado = (concluidos.data ?? []).reduce(
    (acc, a) => acc + (a.valor_final ?? 0),
    0
  );
  const faturamentoPrevisto = (pendentes.data ?? []).reduce(
    (acc, a) => acc + (a.valor_final ?? 0),
    0
  );
  const atendimentosConcluidos = concluidos.data?.length ?? 0;
  const agendamentosPendentes = pendentes.data?.length ?? 0;

  return {
    faturamentoRealizado,
    faturamentoPrevisto,
    atendimentosConcluidos,
    agendamentosPendentes,
  };
}

export async function getFaturamentoMensal(): Promise<FaturamentoMensal[]> {
  const supabase = createClient();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);

  const { data, error } = await supabase
    .from("agendamentos")
    .select("data_hora, valor_final, status")
    .eq("status", "Concluído")
    .gte("data_hora", sixMonthsAgo.toISOString());

  if (error) throw error;

  // Group by month
  const byMonth: Record<string, number> = {};
  (data ?? []).forEach((a) => {
    const key = a.data_hora.slice(0, 7); // "YYYY-MM"
    byMonth[key] = (byMonth[key] ?? 0) + (a.valor_final ?? 0);
  });

  // Build last 6 months
  const result: FaturamentoMensal[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    result.push({ mes: label, valor: byMonth[key] ?? 0 });
  }
  return result;
}

export async function getPagamentoPorMetodo(): Promise<PagamentoPorMetodo[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("agendamentos")
    .select("forma_pagamento, valor_final")
    .eq("status", "Concluído")
    .not("forma_pagamento", "is", null);

  if (error) throw error;

  const byMethod: Record<string, { valor: number; count: number }> = {};
  (data ?? []).forEach((a) => {
    const m = a.forma_pagamento as string;
    if (!byMethod[m]) byMethod[m] = { valor: 0, count: 0 };
    byMethod[m].valor += a.valor_final ?? 0;
    byMethod[m].count += 1;
  });

  return Object.entries(byMethod).map(([metodo, { valor, count }]) => ({
    metodo: metodo as PagamentoPorMetodo["metodo"],
    valor,
    count,
  }));
}

// ============================================================
// Agenda: conflitos, horário liberado e lista de espera
// ============================================================

/** Conflitos do horário na agenda do profissional logado (agendamentos, bloqueios, expediente). */
export async function getConflitosAgenda(
  dataHoraIso: string,
  duracaoMinutos: number,
  ignorarAgendamentoId?: string | null
): Promise<ConflitoAgenda[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("conflitos_agenda", {
    p_data_hora: dataHoraIso,
    p_duracao_minutos: duracaoMinutos,
    p_ignorar_agendamento: ignorarAgendamentoId ?? null,
  });
  if (error) throw error;
  return (data as ConflitoAgenda[]) ?? [];
}

/**
 * Avisa a lista de espera de que um dia ganhou vaga. Não bloqueia a interface:
 * falhas apenas são registradas no console.
 */
export function avisarHorarioLiberado(dataHoraIso: string | null | undefined): void {
  if (!dataHoraIso) return;
  fetch("/api/agenda/horario-liberado", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: getManausDateString(dataHoraIso) }),
    keepalive: true,
  }).catch((err) => console.warn("[lista de espera]", err));
}

export async function getListaEsperaProfissional(): Promise<ListaEsperaProfissional[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("lista_espera_do_profissional");
  if (error) throw error;
  return (data as ListaEsperaProfissional[]) ?? [];
}

export async function removerDaListaEspera(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("lista_espera").delete().eq("id", id);
  if (error) throw error;
}
