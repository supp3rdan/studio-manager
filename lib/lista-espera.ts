import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/url";
import { montarEmailListaEspera, podeEnviarParaClientes, sendResendBatch } from "@/lib/email";

/**
 * Cliente para as RPCs de sistema (sm_*). Usa a chave anon: a autorização é
 * o CRON_SECRET, validado dentro do banco (tabela sm_config).
 */
export function getSistemaClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false },
  });
}

export function getCronSecret(): string | null {
  const s = process.env.CRON_SECRET;
  return s && s.length >= 32 ? s : null;
}

interface VagaRow {
  id: string;
  data: string;
  cliente_nome: string;
  cliente_email: string | null;
  servico_nome: string;
  studio_nome: string;
  codigo_profissional: string;
  primeiro_horario: string;
}

/**
 * Marca como "vaga aberta" as entradas da lista de espera cujo dia voltou a ter
 * horário livre (a cliente vê na tela dela e a profissional vê no painel, com
 * botão de WhatsApp). Se houver domínio verificado na Resend, também envia
 * e-mail. Sem filtros, varre todas as listas (usado pelo cron).
 * Retorna quantas entradas ganharam vaga.
 */
export async function notificarListaEspera(
  profissionalId?: string | null,
  data?: string | null
): Promise<number> {
  const segredo = getCronSecret();
  if (!segredo) {
    console.warn("[Lista de espera] CRON_SECRET não configurado; aviso não enviado.");
    return 0;
  }

  const { data: vagas, error } = await getSistemaClient().rpc("sm_lista_espera_notificar", {
    p_segredo: segredo,
    p_profissional_id: profissionalId ?? null,
    p_data: data ?? null,
  });

  if (error) {
    console.error("[Lista de espera] RPC falhou:", error);
    return 0;
  }

  const linhas = (vagas ?? []) as VagaRow[];
  if (!podeEnviarParaClientes()) return linhas.length;

  const emails = linhas
    .filter((v) => v.cliente_email)
    .map((v) =>
      montarEmailListaEspera({
        clienteNome: v.cliente_nome,
        clienteEmail: v.cliente_email!,
        servicoNome: v.servico_nome,
        studioNome: v.studio_nome,
        codigoProfissional: v.codigo_profissional,
        data: v.data,
        primeiroHorario: v.primeiro_horario,
      })
    );

  if (emails.length > 0) {
    const ids = ((vagas ?? []) as VagaRow[]).map((v) => v.id).sort().join(",");
    const chave = createHash("sha256").update(ids).digest("hex");
    await sendResendBatch(emails, `lista-espera/${chave}`);
  }
  return linhas.length;
}
