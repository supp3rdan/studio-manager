import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { notificarReagendamentoCliente } from "@/lib/email";
import { notificarListaEspera } from "@/lib/lista-espera";
import { rpcErrorResponse, validationErrorResponse } from "@/lib/api-errors";
import { getManausDateString } from "@/lib/utils";

const bodySchema = z.object({
  data_hora: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data/hora inválida."),
});

type Relacao<T> = T | T[] | null;
function primeiro<T>(rel: Relacao<T>): T | null {
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

interface AgendamentoDetalhe {
  id: string;
  local: string;
  clientes: Relacao<{ nome: string | null; whatsapp: string | null }>;
  servicos: Relacao<{ nome: string | null }>;
  profissional: Relacao<{
    nome: string | null;
    nome_studio: string | null;
    email: string | null;
    whatsapp: string | null;
  }>;
}

/** Remarcação feita pela própria cliente (mínimo de 2h de antecedência). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const idParse = z.string().uuid().safeParse(params.id);
  if (!idParse.success) {
    return NextResponse.json({ error: "Agendamento inválido." }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Faça login para remarcar." }, { status: 401 });
    }

    const novaDataHora = new Date(parsed.data.data_hora).toISOString();
    const { data: rpcResult, error } = await supabase.rpc("reagendar_agendamento_cliente", {
      p_agendamento_id: idParse.data,
      p_nova_data_hora: novaDataHora,
    });
    if (error || !rpcResult) {
      return rpcErrorResponse(error ?? {}, "Erro ao remarcar agendamento.");
    }

    const { data: ag } = await supabase
      .from("agendamentos")
      .select(
        `id, local,
         clientes ( nome, whatsapp ),
         servicos ( nome ),
         profissional:perfis!agendamentos_user_id_fkey ( nome, nome_studio, email, whatsapp )`
      )
      .eq("id", idParse.data)
      .maybeSingle<AgendamentoDetalhe>();

    const { data: perfilCliente } = await supabase
      .from("perfis")
      .select("nome, email")
      .eq("id", user.id)
      .maybeSingle();

    if (ag) {
      const cliente = primeiro(ag.clientes);
      const prof = primeiro(ag.profissional);
      await notificarReagendamentoCliente({
        clienteNome: cliente?.nome || perfilCliente?.nome || "Cliente",
        clienteEmail: perfilCliente?.email || user.email || null,
        clienteWhatsapp: cliente?.whatsapp || null,
        profissionalNome: prof?.nome || "Profissional",
        profissionalEmail: prof?.email || null,
        profissionalWhatsapp: prof?.whatsapp || null,
        nomeStudio: prof?.nome_studio || null,
        servicoNome: primeiro(ag.servicos)?.nome || "Procedimento",
        dataHoraAnterior: rpcResult.data_hora_anterior,
        novaDataHora,
        local: ag.local,
      }).catch((err) => console.error("[Email remarcação]:", err));
    }

    // O dia anterior pode ter ganhado vaga para quem está na lista de espera
    await notificarListaEspera(
      rpcResult.profissional_id,
      getManausDateString(rpcResult.data_hora_anterior)
    ).catch((err) => console.error("[Lista de espera]:", err));

    return NextResponse.json({ success: true, nova_data_hora: novaDataHora });
  } catch (error) {
    console.error("[POST /api/agendamentos/[id]/reagendar]:", error);
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
