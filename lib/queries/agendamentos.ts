import { createClient } from "@/lib/supabase/client";
import type {
  Agendamento,
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
      servicos ( id, nome, categoria, preco_base )
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
    .select(`*, clientes(id,nome,whatsapp), servicos(id,nome,categoria,preco_base)`)
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
    .select(`*, clientes(id,nome,whatsapp), servicos(id,nome,categoria,preco_base)`)
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
