import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { notificarCancelamento } from "@/lib/email";
import { rpcErrorResponse } from "@/lib/api-errors";

type Relacao<T> = T | T[] | null;
function primeiro<T>(rel: Relacao<T>): T | null {
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

interface AgendamentoParaNotificar {
  id: string;
  data_hora: string;
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

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const idParse = z.string().uuid().safeParse(params.id);
  if (!idParse.success) {
    return NextResponse.json({ error: "Agendamento inválido." }, { status: 400 });
  }
  const agendamentoId = idParse.data;

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    // Dados para a notificação (RLS garante que só a própria cliente lê)
    const { data: agBefore } = await supabase
      .from("agendamentos")
      .select(
        `
        id, data_hora, local,
        clientes ( nome, whatsapp ),
        servicos ( nome ),
        profissional:perfis!agendamentos_user_id_fkey ( nome, nome_studio, email, whatsapp )
      `
      )
      .eq("id", agendamentoId)
      .eq("cliente_user_id", user.id)
      .maybeSingle<AgendamentoParaNotificar>();

    // RPC SECURITY DEFINER valida dono e antecedência mínima de 2h
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "cancelar_agendamento_cliente",
      {
        p_agendamento_id: agendamentoId,
        // Compatibilidade com a versão anterior à migration 012 (a nova usa auth.uid()).
        p_cliente_user_id: user.id,
      }
    );

    if (rpcError) {
      return rpcErrorResponse(rpcError, "Erro ao cancelar agendamento.");
    }

    if (agBefore) {
      const { data: perfilCliente } = await supabase
        .from("perfis")
        .select("email, nome")
        .eq("id", user.id)
        .maybeSingle();

      const cliente = primeiro(agBefore.clientes);
      const servico = primeiro(agBefore.servicos);
      const prof = primeiro(agBefore.profissional);

      notificarCancelamento({
        clienteNome: cliente?.nome || perfilCliente?.nome || "Cliente",
        clienteEmail: perfilCliente?.email || user.email || null,
        clienteWhatsapp: cliente?.whatsapp || null,
        profissionalNome: prof?.nome || "Profissional",
        profissionalEmail: prof?.email || null,
        profissionalWhatsapp: prof?.whatsapp || null,
        nomeStudio: prof?.nome_studio || null,
        servicoNome: servico?.nome || "Procedimento",
        dataHora: agBefore.data_hora,
        local: agBefore.local,
      }).catch((err) => console.error("[Email cancelamento]:", err));
    }

    return NextResponse.json({ success: true, ...(rpcResult ?? {}) });
  } catch (error) {
    console.error("[POST /api/agendamentos/[id]/cancelar]:", error);
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
