import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notificarAgendamento } from "@/lib/email";

// Usamos o client com chave de serviço (ou anon fallback) para permitir a criação pública segura
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
        { error: "Dados obrigatórios não informados." },
        { status: 400 }
      );
    }

    const supabase = getApiClient();

    // 1. Busca profissional pelo código
    const { data: profissional, error: profError } = await supabase
      .from("perfis")
      .select("id, nome, nome_studio, email, whatsapp, codigo_profissional")
      .eq("codigo_profissional", String(codigo_profissional).trim())
      .single();

    if (profError || !profissional) {
      return NextResponse.json(
        { error: "Profissional não encontrado." },
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

    // 3. Localiza ou cria o registro do cliente na carteira do profissional
    let clienteId: string | null = null;
    const cleanWhatsapp = (cliente_whatsapp || "").replace(/\D/g, "");

    if (cleanWhatsapp) {
      const { data: existingClient } = await supabase
        .from("clientes")
        .select("id")
        .eq("user_id", profissional.id)
        .eq("whatsapp", cleanWhatsapp)
        .limit(1)
        .maybeSingle();

      if (existingClient) {
        clienteId = existingClient.id;
      }
    }

    if (!clienteId) {
      const { data: newClient, error: clientInsertError } = await supabase
        .from("clientes")
        .insert({
          user_id: profissional.id,
          nome: cliente_nome.trim(),
          whatsapp: cleanWhatsapp || null,
        })
        .select("id")
        .single();

      if (!clientInsertError && newClient) {
        clienteId = newClient.id;
      }
    }

    // 4. Cria o agendamento
    const { data: agendamento, error: agendamentoError } = await supabase
      .from("agendamentos")
      .insert({
        user_id: profissional.id,
        cliente_id: clienteId,
        cliente_user_id: cliente_user_id || null,
        servico_id: servico.id,
        data_hora: new Date(data_hora).toISOString(),
        valor_final: servico.preco_base,
        forma_pagamento: forma_pagamento || null,
        status: "Agendado",
        local: local,
        observacoes: observacoes || null,
      })
      .select(`*, servicos ( id, nome, categoria, preco_base )`)
      .single();

    if (agendamentoError || !agendamento) {
      console.error("[Erro ao criar agendamento público]:", agendamentoError);
      return NextResponse.json(
        { error: "Erro ao registrar agendamento no sistema." },
        { status: 500 }
      );
    }

    // 5. Dispara as notificações por e-mail em segundo plano
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
      dataHora: data_hora,
      local: local,
      formaPagamento: forma_pagamento,
    }).catch((err) => {
      console.error("[Erro background email]:", err);
    });

    return NextResponse.json({
      success: true,
      agendamento,
      profissional: {
        nome: profissional.nome,
        nome_studio: profissional.nome_studio,
        whatsapp: profissional.whatsapp,
      },
    });
  } catch (error: any) {
    console.error("[POST /api/agendamentos/publico]", error);
    return NextResponse.json(
      { error: error?.message || "Erro interno do servidor." },
      { status: 500 }
    );
  }
}
