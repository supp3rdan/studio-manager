import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { montarEmailLembrete, podeEnviarParaClientes, sendResendBatch } from "@/lib/email";
import { getCronSecret, getSistemaClient, notificarListaEspera } from "@/lib/lista-espera";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tarefa diária (Vercel Cron, 13:00 UTC = 09:00 em Manaus — ver vercel.json):
 *  1. Lembrete por e-mail com botão de confirmação — SÓ se houver domínio
 *     verificado na Resend (sem isso, a confirmação é pedida pelo WhatsApp
 *     no painel, com o link /a/[token]).
 *  2. Varredura da lista de espera (marca dias que voltaram a ter vaga).
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
  const resultado = { lembretes: 0, lembretesFalharam: false, lembretesDesativados: false, listaEspera: 0 };

  // 1. Lembretes (precisam de e-mail para clientes)
  const { data, error } = podeEnviarParaClientes()
    ? await supabase.rpc("sm_lembretes_pendentes", { p_segredo: segredo })
    : { data: [], error: null };
  resultado.lembretesDesativados = !podeEnviarParaClientes();
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
