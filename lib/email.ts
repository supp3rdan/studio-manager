import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface EmailAgendamentoParams {
  clienteNome: string;
  clienteEmail?: string | null;
  clienteWhatsapp?: string | null;
  profissionalNome: string;
  profissionalEmail?: string | null;
  profissionalWhatsapp?: string | null;
  nomeStudio?: string | null;
  servicoNome: string;
  servicoCategoria?: string | null;
  valorFinal: number;
  dataHora: string;
  local: string;
  formaPagamento?: string | null;
}

function formatBrl(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

function formatData(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

/**
 * Envia um e-mail através da API da Resend (ou realiza mock estruturado caso não haja chave).
 */
async function sendResendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log("────────────────────────────────────────────────────────────");
    console.log(`[EMAIL SIMULADO - RESEND_API_KEY não configurada]`);
    console.log(`Para: ${params.to}`);
    console.log(`Assunto: ${params.subject}`);
    console.log("────────────────────────────────────────────────────────────");
    return true;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Studio Manager <agendamentos@resend.dev>",
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Resend Error]:", err);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Erro ao enviar e-mail via Resend]:", error);
    return false;
  }
}

export async function notificarAgendamento(params: EmailAgendamentoParams): Promise<void> {
  const studioOuProfissional = params.nomeStudio || params.profissionalNome || "Studio";
  const dataFormatada = formatData(params.dataHora);
  const valorFormatado = formatBrl(params.valorFinal);

  // ── 1. E-mail para a Cliente (se informou e-mail) ──
  if (params.clienteEmail) {
    const assuntoCliente = `✨ Agendamento Confirmado — ${studioOuProfissional}`;
    const htmlCliente = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #0A0A0A; color: #FFFFFF; max-width: 600px; margin: 0 auto; padding: 32px 24px; border-radius: 16px; border: 1px solid #262626;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #C9A84C; font-size: 24px; margin: 0;">Studio Manager</h1>
          <p style="color: #A3A3A3; font-size: 14px; margin-top: 4px;">Confirmação de Agendamento</p>
        </div>

        <div style="background-color: #171717; border: 1px solid #2E2E2E; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <h2 style="color: #FFFFFF; font-size: 18px; margin-top: 0; margin-bottom: 16px;">Olá, ${params.clienteNome}! 👋</h2>
          <p style="color: #D4D4D4; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            Seu agendamento foi registrado com sucesso em <strong>${studioOuProfissional}</strong>. Confira os detalhes abaixo:
          </p>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #E5E5E5;">
            <tr>
              <td style="padding: 8px 0; color: #A3A3A3;">Procedimento:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #C9A84C;">${params.servicoNome}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #A3A3A3;">Profissional:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${params.profissionalNome}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #A3A3A3;">Data e Horário:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${dataFormatada}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #A3A3A3;">Local:</td>
              <td style="padding: 8px 0; text-align: right;">${params.local}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #A3A3A3;">Forma de Pagamento:</td>
              <td style="padding: 8px 0; text-align: right;">${params.formaPagamento || "A combinar"}</td>
            </tr>
            <tr style="border-top: 1px solid #2E2E2E;">
              <td style="padding: 12px 0; color: #A3A3A3; font-weight: bold;">Valor:</td>
              <td style="padding: 12px 0; font-weight: bold; font-size: 16px; text-align: right; color: #C9A84C;">${valorFormatado}</td>
            </tr>
          </table>
        </div>

        ${
          params.profissionalWhatsapp
            ? `<div style="text-align: center; margin-bottom: 24px;">
                <p style="font-size: 13px; color: #A3A3A3; margin-bottom: 8px;">Dúvidas ou imprevistos? Fale com seu profissional:</p>
                <a href="https://wa.me/${params.profissionalWhatsapp.replace(/\D/g, "")}" style="display: inline-block; background-color: #25D366; color: #000; font-weight: bold; font-size: 13px; text-decoration: none; padding: 10px 20px; border-radius: 8px;">Conversar no WhatsApp</a>
              </div>`
            : ""
        }

        <p style="text-align: center; font-size: 12px; color: #737373; margin: 0;">
          Studio Manager · Gestão de Estúdio de Beleza
        </p>
      </div>
    `;

    await sendResendEmail({
      to: params.clienteEmail,
      subject: assuntoCliente,
      html: htmlCliente,
    });
  }

  // ── 2. E-mail para o Profissional ──
  if (params.profissionalEmail) {
    const assuntoProfissional = `📅 Novo Agendamento Recebido — ${params.clienteNome}`;
    const htmlProfissional = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #0A0A0A; color: #FFFFFF; max-width: 600px; margin: 0 auto; padding: 32px 24px; border-radius: 16px; border: 1px solid #262626;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #C9A84C; font-size: 24px; margin: 0;">Studio Manager</h1>
          <p style="color: #A3A3A3; font-size: 14px; margin-top: 4px;">Novo Agendamento Recebido</p>
        </div>

        <div style="background-color: #171717; border: 1px solid #2E2E2E; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <h2 style="color: #FFFFFF; font-size: 18px; margin-top: 0; margin-bottom: 16px;">Parabéns, ${params.profissionalNome}! 🎉</h2>
          <p style="color: #D4D4D4; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            Um novo horário foi agendado diretamente pelo seu portal público. Veja os detalhes:
          </p>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #E5E5E5;">
            <tr>
              <td style="padding: 8px 0; color: #A3A3A3;">Cliente:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #FFFFFF;">${params.clienteNome}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #A3A3A3;">WhatsApp:</td>
              <td style="padding: 8px 0; text-align: right;">${params.clienteWhatsapp || "Não informado"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #A3A3A3;">Procedimento:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #C9A84C;">${params.servicoNome}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #A3A3A3;">Data e Horário:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${dataFormatada}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #A3A3A3;">Local:</td>
              <td style="padding: 8px 0; text-align: right;">${params.local}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #A3A3A3;">Pagamento:</td>
              <td style="padding: 8px 0; text-align: right;">${params.formaPagamento || "A combinar"}</td>
            </tr>
            <tr style="border-top: 1px solid #2E2E2E;">
              <td style="padding: 12px 0; color: #A3A3A3; font-weight: bold;">Valor:</td>
              <td style="padding: 12px 0; font-weight: bold; font-size: 16px; text-align: right; color: #C9A84C;">${valorFormatado}</td>
            </tr>
          </table>
        </div>

        ${
          params.clienteWhatsapp
            ? `<div style="text-align: center; margin-bottom: 24px;">
                <a href="https://wa.me/${params.clienteWhatsapp.replace(/\D/g, "")}" style="display: inline-block; background-color: #25D366; color: #000; font-weight: bold; font-size: 13px; text-decoration: none; padding: 10px 20px; border-radius: 8px;">Enviar mensagem no WhatsApp do Cliente</a>
              </div>`
            : ""
        }

        <p style="text-align: center; font-size: 12px; color: #737373; margin: 0;">
          Studio Manager · O agendamento já está disponível no seu painel.
        </p>
      </div>
    `;

    await sendResendEmail({
      to: params.profissionalEmail,
      subject: assuntoProfissional,
      html: htmlProfissional,
    });
  }
}
