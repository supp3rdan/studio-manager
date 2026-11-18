import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { notificarCancelamento } from "@/lib/email";

function getCleanUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/+$/, "");
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      getCleanUrl(),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const agendamentoId = params.id;

    // Busca dados do agendamento para notificação antes de cancelar
    const { data: agBefore } = await supabase
      .from("agendamentos")
      .select(`
        id, data_hora, local, status, cliente_user_id,
        clientes ( nome, whatsapp ),
        servicos ( nome ),
        profissional:perfis!agendamentos_user_id_fkey ( nome, nome_studio, email, whatsapp )
      `)
      .eq("id", agendamentoId)
      .eq("cliente_user_id", user.id)
      .single();

    // Chama RPC SECURITY DEFINER para cancelar com validação de 2h
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "cancelar_agendamento_cliente",
      {
        p_agendamento_id: agendamentoId,
        p_cliente_user_id: user.id,
      }
    );

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message || "Erro ao cancelar agendamento." },
        { status: 400 }
      );
    }

    // Busca email do cliente para notificação
    const { data: perfilCliente } = await supabase
      .from("perfis")
      .select("email, nome")
      .eq("id", user.id)
      .single();

    // Envia e-mails de notificação em background
    if (agBefore) {
      notificarCancelamento({
        clienteNome: (agBefore.clientes as any)?.nome || perfilCliente?.nome || "Cliente",
        clienteEmail: perfilCliente?.email || null,
        clienteWhatsapp: (agBefore.clientes as any)?.whatsapp || null,
        profissionalNome: (agBefore.profissional as any)?.nome || "Profissional",
        profissionalEmail: (agBefore.profissional as any)?.email || null,
        profissionalWhatsapp: (agBefore.profissional as any)?.whatsapp || null,
        nomeStudio: (agBefore.profissional as any)?.nome_studio || null,
        servicoNome: (agBefore.servicos as any)?.nome || "Procedimento",
        dataHora: agBefore.data_hora,
        local: agBefore.local,
      }).catch((err) => console.error("[Email cancelamento]:", err));
    }

    return NextResponse.json({ success: true, ...rpcResult });
  } catch (error: any) {
    console.error("[POST /api/agendamentos/[id]/cancelar]:", error);
    return NextResponse.json(
      { error: error?.message || "Erro inesperado." },
      { status: 500 }
    );
  }
}
