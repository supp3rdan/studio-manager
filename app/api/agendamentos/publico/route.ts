import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notificarAgendamento } from "@/lib/email";

function getApiClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      codigo_profissional,
      servico_id,
      data_hora,
      local = "Studio",
      forma_pagamento,
      cliente_nome,
      cliente_whatsapp,
      cliente_email,
      cliente_user_id,
      observacoes,
    } = body;

    if (!codigo_profissional || !servico_id || !data_hora || !cliente_nome) {
      return NextResponse.json(
        { error: "Dados obrigatórios não preenchidos (código, serviço, data ou nome)." },
        { status: 400 }
      );
    }

    const supabase = getApiClient();
    const cleanWhatsapp = (cliente_whatsapp || "").replace(/\D/g, "");
    const dataHoraIso = new Date(data_hora).toISOString();

    // ── ESTRATÉGIA 1: Tenta executar via Função RPC com SECURITY DEFINER ──
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "criar_agendamento_publico",
      {
        p_codigo_profissional: String(codigo_profissional).trim(),
        p_servico_id: servico_id,
        p_data_hora: dataHoraIso,
        p_local: local || "Studio",
        p_forma_pagamento: forma_pagamento || null,
        p_cliente_nome: cliente_nome.trim(),
        p_cliente_whatsapp: cleanWhatsapp || null,
        p_cliente_email: cliente_email || null,
        p_cliente_user_id: cliente_user_id || null,
        p_observacoes: observacoes || null,
      }
    );

    if (!rpcError && rpcResult) {
      // Dispara e-mails em segundo plano
      notificarAgendamento({
        clienteNome: cliente_nome.trim(),
        clienteEmail: cliente_email || null,
        clienteWhatsapp: cleanWhatsapp || null,
        profissionalNome: rpcResult.profissional?.nome || "Profissional",
        profissionalEmail: rpcResult.profissional?.email,
        profissionalWhatsapp: rpcResult.profissional?.whatsapp,
        nomeStudio: rpcResult.profissional?.nome_studio,
        servicoNome: rpcResult.servicos?.nome || "Procedimento",
        servicoCategoria: rpcResult.servicos?.categoria,
        valorFinal: rpcResult.valor_final || 0,
        dataHora: dataHoraIso,
        local: local,
        formaPagamento: forma_pagamento,
      }).catch((err) => {
        console.error("[Erro email background RPC]:", err);
      });

      return NextResponse.json({
        success: true,
        agendamento: rpcResult,
        profissional: rpcResult.profissional,
      });
    }

    if (rpcError) {
      console.warn(
        "[RPC criar_agendamento_publico indisponível ou falhou, tentando fallback direto]:",
        rpcError.message
      );
    }

    // ── ESTRATÉGIA 2: Fallback direto via tabelas ──
    // 1. Busca profissional pelo código
    const { data: profissional, error: profError } = await supabase
      .from("perfis")
      .select("id, nome, nome_studio, email, whatsapp, codigo_profissional")
      .eq("codigo_profissional", String(codigo_profissional).trim())
      .single();

    if (profError || !profissional) {
      return NextResponse.json(
        { error: `Profissional #${codigo_profissional} não encontrado.` },
        { status: 404 }
      );
    }

    // 2. Busca e valida o serviço
    const { data: servico, error: servError } = await supabase
      .from("servicos")
      .select("id, nome, categoria, preco_base, ativo")
      .eq("id", servico_id)
      .eq("user_id", profissional.id)
      .single();

    if (servError || !servico || !servico.ativo) {
      return NextResponse.json(
        { error: "Serviço não encontrado ou inativo." },
        { status: 404 }
      );
    }

    // 3. Tenta localizar ou criar cliente (ignora erro se RLS bloquear)
    let clienteId: string | null = null;
    try {
      if (cleanWhatsapp) {
        const { data: existingClient } = await supabase
          .from("clientes")
          .select("id")
          .eq("user_id", profissional.id)
          .eq("whatsapp", cleanWhatsapp)
          .limit(1)
          .maybeSingle();

        if (existingClient) clienteId = existingClient.id;
      }

      if (!clienteId) {
        const { data: newClient } = await supabase
          .from("clientes")
          .insert({
            user_id: profissional.id,
            nome: cliente_nome.trim(),
            whatsapp: cleanWhatsapp || null,
          })
          .select("id")
          .maybeSingle();

        if (newClient) clienteId = newClient.id;
      }
    } catch {
      // Ignora erro de RLS na tabela de clientes
    }

    // 4. Cria o agendamento
    const payloadAgendamento = {
      user_id: profissional.id,
      cliente_id: clienteId,
      cliente_user_id: cliente_user_id || null,
      servico_id: servico.id,
      data_hora: dataHoraIso,
      valor_final: servico.preco_base,
      forma_pagamento: forma_pagamento || null,
      status: "Agendado",
      local: local === "Domicílio" ? "Domicílio" : "Studio",
      observacoes: observacoes || null,
    };

    const { error: agendamentoInsertError } = await supabase
      .from("agendamentos")
      .insert(payloadAgendamento);

    if (agendamentoInsertError) {
      console.error("[Erro ao inserir agendamento]:", agendamentoInsertError);
      return NextResponse.json(
        {
          error:
            agendamentoInsertError.message ||
            "Erro de permissão no banco de dados ao confirmar agendamento.",
        },
        { status: 500 }
      );
    }

    // 5. Notificações por e-mail
    notificarAgendamento({
      clienteNome: cliente_nome.trim(),
      clienteEmail: cliente_email || null,
      clienteWhatsapp: cleanWhatsapp || null,
      profissionalNome: profissional.nome,
      profissionalEmail: profissional.email,
      profissionalWhatsapp: profissional.whatsapp,
      nomeStudio: profissional.nome_studio,
      servicoNome: servico.nome,
      servicoCategoria: servico.categoria,
      valorFinal: servico.preco_base,
      dataHora: dataHoraIso,
      local: local,
      formaPagamento: forma_pagamento,
    }).catch((err) => {
      console.error("[Erro email background fallback]:", err);
    });

    return NextResponse.json({
      success: true,
      agendamento: {
        ...payloadAgendamento,
        servicos: servico,
      },
      profissional: {
        nome: profissional.nome,
        nome_studio: profissional.nome_studio,
        whatsapp: profissional.whatsapp,
      },
    });
  } catch (error: any) {
    console.error("[POST /api/agendamentos/publico]", error);
    return NextResponse.json(
      { error: error?.message || "Erro inesperado ao confirmar agendamento." },
      { status: 500 }
    );
  }
}
