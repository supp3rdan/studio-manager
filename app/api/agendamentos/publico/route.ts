import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { notificarAgendamento } from "@/lib/email";
import { rpcErrorResponse, validationErrorResponse } from "@/lib/api-errors";

const bodySchema = z.object({
  codigo_profissional: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .pipe(z.string().regex(/^\d{4}$/, "Código do profissional inválido.")),
  servico_id: z.string().uuid("Serviço inválido."),
  data_hora: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Data/hora inválida."),
  local: z.enum(["Studio", "Domicílio"]).catch("Studio"),
  forma_pagamento: z.string().trim().max(120).nullish(),
  cliente_nome: z
    .string({ required_error: "Informe seu nome." })
    .trim()
    .min(1, "Informe seu nome.")
    .max(120, "Nome muito longo."),
  cliente_whatsapp: z.string().trim().max(30).nullish(),
  cliente_email: z.string().trim().email("E-mail inválido.").max(254).nullish().or(z.literal("")),
  observacoes: z.string().trim().max(1000, "Observações muito longas.").nullish(),
  // `cliente_user_id` enviado pelo navegador é ignorado: a cliente é
  // identificada pela sessão (cookie).
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const body = parsed.data;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error:
            "É necessário se cadastrar como cliente e estar logado para agendar um horário.",
        },
        { status: 401 }
      );
    }

    const cleanWhatsapp = (body.cliente_whatsapp || "").replace(/\D/g, "");
    const clienteEmail = body.cliente_email || user.email || null;
    const dataHoraIso = new Date(body.data_hora).toISOString();

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "criar_agendamento_publico",
      {
        p_codigo_profissional: body.codigo_profissional,
        p_servico_id: body.servico_id,
        p_data_hora: dataHoraIso,
        p_local: body.local,
        p_forma_pagamento: body.forma_pagamento || null,
        p_cliente_nome: body.cliente_nome,
        p_cliente_whatsapp: cleanWhatsapp || null,
        p_cliente_email: clienteEmail,
        // Mantido por compatibilidade com a RPC anterior à migration 012
        // (a nova versão usa auth.uid() e ignora este valor).
        p_cliente_user_id: user.id,
        p_observacoes: body.observacoes || null,
      }
    );

    if (rpcError || !rpcResult) {
      return rpcErrorResponse(
        rpcError ?? {},
        "Não foi possível confirmar o agendamento. Tente novamente."
      );
    }

    // Aguarda o envio: na Vercel, promessas soltas após a resposta podem ser
    // interrompidas quando a função é congelada.
    await notificarAgendamento({
      clienteNome: body.cliente_nome,
      clienteEmail,
      clienteWhatsapp: cleanWhatsapp || null,
      profissionalNome: rpcResult.profissional?.nome || "Profissional",
      profissionalEmail: rpcResult.profissional?.email,
      profissionalWhatsapp: rpcResult.profissional?.whatsapp,
      nomeStudio: rpcResult.profissional?.nome_studio,
      servicoNome: rpcResult.servicos?.nome || "Procedimento",
      servicoCategoria: rpcResult.servicos?.categoria,
      valorFinal: rpcResult.valor_final || 0,
      dataHora: dataHoraIso,
      local: body.local,
      formaPagamento: body.forma_pagamento,
    }).catch((err) => {
      console.error("[Erro email agendamento]:", err);
    });

    // Não devolve o e-mail do profissional ao navegador da cliente.
    const { email: _email, ...profissionalPublico } = rpcResult.profissional ?? {};

    return NextResponse.json({
      success: true,
      agendamento: { ...rpcResult, profissional: profissionalPublico },
      profissional: profissionalPublico,
    });
  } catch (error) {
    console.error("[POST /api/agendamentos/publico]", error);
    return NextResponse.json(
      { error: "Erro inesperado ao confirmar agendamento." },
      { status: 500 }
    );
  }
}
