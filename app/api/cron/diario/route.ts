import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { montarEmailLembrete, sendResendBatch } from "@/lib/email";
import { getCronSecret, getSistemaClient, notificarListaEspera } from "@/lib/lista-espera";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tarefa diária (Vercel Cron, 13:00 UTC = 09:00 em Manaus — ver vercel.json):
 *  1. Lembrete com botão de confirmação para quem tem horário até amanhã.
 *  2. Varredura da lista de espera (dias que voltaram a ter vaga).
 * A Vercel envia `Authorization: Bearer <CRON_SECRET>` automaticamente.
 */
function autorizado(request: Request, segredo: string): boolean {
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

interface LembreteRow {
  agendamento_id: string;
  token_publico: string;
  data_hora: string;
  local: string;
  cliente_nome: string;
  cliente_email: string;
  servico_nome: string;
  studio_nome: string;
  profissional_whatsapp: string | null;
}

export async function GET(request: Request) {
  const segredo = getCronSecret();
  if (!segredo) {
    return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 500 });
  }
  if (!autorizado(request, segredo)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const supabase = getSistemaClient();
  const resultado = { lembretes: 0, lembretesFalharam: false, listaEspera: 0 };

  // 1. Lembretes
  const { data, error } = await supabase.rpc("sm_lembretes_pendentes", { p_segredo: segredo });
  if (error) {
    console.error("[cron] sm_lembretes_pendentes:", error);
  } else {
    const rows = (data ?? []) as LembreteRow[];
    if (rows.length > 0) {
      const emails = rows.map((r) =>
        montarEmailLembrete({
          agendamentoId: r.agendamento_id,
          token: r.token_publico,
          dataHora: r.data_hora,
          local: r.local,
          clienteNome: r.cliente_nome,
          clienteEmail: r.cliente_email,
          servicoNome: r.servico_nome,
          studioNome: r.studio_nome,
          profissionalWhatsapp: r.profissional_whatsapp,
        })
      );
      const ids = rows.map((r) => r.agendamento_id);
      const chave = createHash("sha256").update(ids.slice().sort().join(",")).digest("hex");
      const ok = await sendResendBatch(emails, `lembretes/${chave}`);

      if (ok) {
        const { error: markError } = await supabase.rpc("sm_marcar_lembretes_enviados", {
          p_segredo: segredo,
          p_ids: ids,
        });
        if (markError) console.error("[cron] sm_marcar_lembretes_enviados:", markError);
        resultado.lembretes = rows.length;
      } else {
        resultado.lembretesFalharam = true;
      }
    }
  }

  // 2. Lista de espera
  resultado.listaEspera = await notificarListaEspera();

  console.log("[cron diario]", resultado);
  return NextResponse.json(resultado);
}
