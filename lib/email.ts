import { formatDateTime, getWhatsAppUrl } from "@/lib/utils";
import { getAppUrl } from "@/lib/app-url";

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

/** Escapa texto digitado por usuários antes de inserir no HTML do e-mail. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Remove quebras de linha (evita header injection no assunto). */
function plainSubject(value: string): string {
  return value.replace(/[\r\n]+/g, " ").slice(0, 200);
}

/** Retorna uma cópia com todos os campos de texto escapados para HTML. */
function escapeParams<T extends object>(params: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = typeof v === "string" ? escapeHtml(v) : v;
  }
  return out as T;
}

function formatBrl(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

function formatData(iso: string): string {
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}

const RESEND_API = "https://api.resend.com";
const REMETENTE_PADRAO = "Studio Manager <onboarding@resend.dev>";

export interface EmailMontado {
  to: string;
  subject: string;
  html: string;
}

function getRemetente(): string {
  const from = process.env.RESEND_FROM_EMAIL || REMETENTE_PADRAO;
  if (/@resend\.dev>?\s*$/i.test(from)) {
    console.warn(
      "[Resend] Remetente em resend.dev: só entrega para o e-mail dono da conta Resend. " +
        "Verifique um domínio em resend.com/domains e defina RESEND_FROM_EMAIL (ex.: \"Studio <agenda@seudominio.com.br>\")."
    );
  }
  return from;
}

async function resendFetch(
  path: string,
  body: unknown,
  idempotencyKey?: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[EMAIL SIMULADO - RESEND_API_KEY não configurada]", path);
    return true;
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // A Resend rejeita (403) requisições sem User-Agent.
      "User-Agent": "studio-manager/1.0",
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey.slice(0, 256);

    const res = await fetch(`${RESEND_API}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[Resend ${res.status}]:`, await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Erro ao enviar e-mail via Resend]:", error);
    return false;
  }
}

/** Envia um e-mail pela Resend (ou simula no log se não houver chave). */
export async function sendResendEmail(
  params: EmailMontado & { idempotencyKey?: string }
): Promise<boolean> {
  return resendFetch(
    "/emails",
    { from: getRemetente(), to: [params.to], subject: params.subject, html: params.html },
    params.idempotencyKey
  );
}

/** Envia até 100 e-mails numa única chamada (endpoint /emails/batch). */
export async function sendResendBatch(
  emails: EmailMontado[],
  idempotencyKey?: string
): Promise<boolean> {
  if (emails.length === 0) return true;
  const from = getRemetente();
  let ok = true;
  for (let i = 0; i < emails.length; i += 100) {
    const lote = emails.slice(i, i + 100).map((e) => ({ from, to: [e.to], subject: e.subject, html: e.html }));
    const enviado = await resendFetch(
      "/emails/batch",
      lote,
      idempotencyKey ? `${idempotencyKey}/${i}` : undefined
    );
    ok = ok && enviado;
  }
  return ok;
}

// ── Blocos de layout reutilizáveis (dados já devem vir escapados) ─────────────
function layoutEmail(subtitulo: string, corpo: string, rodape = "Studio Manager · Gestão de Estúdio de Beleza"): string {
  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #0A0A0A; color: #FFFFFF; max-width: 600px; margin: 0 auto; padding: 32px 24px; border-radius: 16px; border: 1px solid #262626;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #C9A84C; font-size: 24px; margin: 0;">Studio Manager</h1>
        <p style="color: #A3A3A3; font-size: 14px; margin-top: 4px;">${subtitulo}</p>
      </div>
      ${corpo}
      <p style="text-align: center; font-size: 12px; color: #737373; margin: 0;">${rodape}</p>
    </div>`;
}

function cartao(titulo: string, texto: string, linhas: Array<[string, string]>): string {
  const rows = linhas
    .map(
      ([k, v]) => `<tr>
        <td style="padding: 8px 0; color: #A3A3A3;">${k}</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${v}</td>
      </tr>`
    )
    .join("");
  return `
    <div style="background-color: #171717; border: 1px solid #2E2E2E; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <h2 style="color: #FFFFFF; font-size: 18px; margin-top: 0; margin-bottom: 16px;">${titulo}</h2>
      <p style="color: #D4D4D4; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">${texto}</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #E5E5E5;">${rows}</table>
    </div>`;
}

function botao(href: string, label: string, bg = "#C9A84C", fg = "#0A0A0A"): string {
  return `<a href="${escapeHtml(href)}" style="display: inline-block; background-color: ${bg}; color: ${fg}; font-weight: bold; font-size: 14px; text-decoration: none; padding: 12px 22px; border-radius: 8px; margin: 4px;">${label}</a>`;
}

function blocoBotoes(...botoes: string[]): string {
  return `<div style="text-align: center; margin-bottom: 24px;">${botoes.join(" ")}</div>`;
}

function botaoWhatsApp(numero: string | null | undefined, label: string): string {
  const url = getWhatsAppUrl(numero);
  return url ? blocoBotoes(botao(url, label, "#25D366", "#000000")) : "";
}

// ── Params para cancelamento ──────────────────────────────────────────────────
interface EmailCancelamentoParams {
  clienteNome: string;
  clienteEmail?: string | null;
  clienteWhatsapp?: string | null;
  profissionalNome: string;
  profissionalEmail?: string | null;
  profissionalWhatsapp?: string | null;
  nomeStudio?: string | null;
  servicoNome: string;
  dataHora: string;
  local: string;
}

export async function notificarCancelamento(raw: EmailCancelamentoParams): Promise<void> {
  const params = escapeParams(raw);
  const nomeExibicao = raw.nomeStudio || raw.profissionalNome || "Studio";
  const studioOuProfissional = params.nomeStudio || params.profissionalNome || "Studio";
  const dataFormatada = formatData(params.dataHora);

  // ── E-mail para o cliente ──
  if (params.clienteEmail) {
    const html = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #0A0A0A; color: #FFFFFF; max-width: 600px; margin: 0 auto; padding: 32px 24px; border-radius: 16px; border: 1px solid #262626;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #C9A84C; font-size: 24px; margin: 0;">Studio Manager</h1>
          <p style="color: #A3A3A3; font-size: 14px; margin-top: 4px;">Agendamento Cancelado</p>
        </div>
        <div style="background-color: #171717; border: 1px solid #2E2E2E; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <h2 style="color: #FFFFFF; font-size: 18px; margin-top: 0; margin-bottom: 16px;">Olá, ${params.clienteNome}!</h2>
          <p style="color: #D4D4D4; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            Seu agendamento em <strong>${studioOuProfissional}</strong> foi cancelado com sucesso.
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #E5E5E5;">
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
          </table>
        </div>
        ${params.profissionalWhatsapp
          ? `<div style="text-align: center; margin-bottom: 24px;">
              <p style="font-size: 13px; color: #A3A3A3; margin-bottom: 8px;">Quer reagendar? Fale com o profissional:</p>
              <a href="${getWhatsAppUrl(params.profissionalWhatsapp)}" style="display: inline-block; background-color: #25D366; color: #000; font-weight: bold; font-size: 13px; text-decoration: none; padding: 10px 20px; border-radius: 8px;">Conversar no WhatsApp</a>
            </div>`
          : ""}
        <p style="text-align: center; font-size: 12px; color: #737373; margin: 0;">Studio Manager · Gestão de Estúdio de Beleza</p>
      </div>
    `;
    await sendResendEmail({
      to: raw.clienteEmail!,
      subject: plainSubject(`❌ Agendamento Cancelado — ${nomeExibicao}`),
      html,
    });
  }

  // ── E-mail para o profissional ──
  if (params.profissionalEmail) {
    const html = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #0A0A0A; color: #FFFFFF; max-width: 600px; margin: 0 auto; padding: 32px 24px; border-radius: 16px; border: 1px solid #262626;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #C9A84C; font-size: 24px; margin: 0;">Studio Manager</h1>
          <p style="color: #A3A3A3; font-size: 14px; margin-top: 4px;">Agendamento Cancelado pelo Cliente</p>
        </div>
        <div style="background-color: #171717; border: 1px solid #2E2E2E; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <h2 style="color: #FFFFFF; font-size: 18px; margin-top: 0; margin-bottom: 16px;">Olá, ${params.profissionalNome}!</h2>
          <p style="color: #D4D4D4; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            O cliente <strong>${params.clienteNome}</strong> cancelou o agendamento abaixo. O horário está disponível novamente na sua agenda.
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #E5E5E5;">
            <tr>
              <td style="padding: 8px 0; color: #A3A3A3;">Cliente:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${params.clienteNome}</td>
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
          </table>
        </div>
        ${params.clienteWhatsapp
          ? `<div style="text-align: center; margin-bottom: 24px;">
              <a href="${getWhatsAppUrl(params.clienteWhatsapp)}" style="display: inline-block; background-color: #25D366; color: #000; font-weight: bold; font-size: 13px; text-decoration: none; padding: 10px 20px; border-radius: 8px;">Falar com o Cliente no WhatsApp</a>
            </div>`
          : ""}
        <p style="text-align: center; font-size: 12px; color: #737373; margin: 0;">Studio Manager · Acesse seu painel para ver a agenda atualizada.</p>
      </div>
    `;
    await sendResendEmail({
      to: raw.profissionalEmail!,
      subject: plainSubject(`⚠️ Agendamento Cancelado — ${raw.clienteNome}`),
      html,
    });
  }
}

export async function notificarAgendamento(raw: EmailAgendamentoParams): Promise<void> {
  const params = escapeParams(raw);
  const nomeExibicao = raw.nomeStudio || raw.profissionalNome || "Studio";
  const studioOuProfissional = params.nomeStudio || params.profissionalNome || "Studio";
  const dataFormatada = formatData(params.dataHora);
  const valorFormatado = formatBrl(params.valorFinal);

  // ── 1. E-mail para a Cliente (se informou e-mail) ──
  if (params.clienteEmail) {
    const assuntoCliente = plainSubject(`✨ Agendamento Confirmado — ${nomeExibicao}`);
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
                <a href="${getWhatsAppUrl(params.profissionalWhatsapp)}" style="display: inline-block; background-color: #25D366; color: #000; font-weight: bold; font-size: 13px; text-decoration: none; padding: 10px 20px; border-radius: 8px;">Conversar no WhatsApp</a>
              </div>`
            : ""
        }

        <p style="text-align: center; font-size: 12px; color: #737373; margin: 0;">
          Studio Manager · Gestão de Estúdio de Beleza
        </p>
      </div>
    `;

    await sendResendEmail({
      to: raw.clienteEmail!,
      subject: assuntoCliente,
      html: htmlCliente,
    });
  }

  // ── 2. E-mail para o Profissional ──
  if (params.profissionalEmail) {
    const assuntoProfissional = plainSubject(`📅 Novo Agendamento Recebido — ${raw.clienteNome}`);
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
                <a href="${getWhatsAppUrl(params.clienteWhatsapp)}" style="display: inline-block; background-color: #25D366; color: #000; font-weight: bold; font-size: 13px; text-decoration: none; padding: 10px 20px; border-radius: 8px;">Enviar mensagem no WhatsApp do Cliente</a>
              </div>`
            : ""
        }

        <p style="text-align: center; font-size: 12px; color: #737373; margin: 0;">
          Studio Manager · O agendamento já está disponível no seu painel.
        </p>
      </div>
    `;

    await sendResendEmail({
      to: raw.profissionalEmail!,
      subject: assuntoProfissional,
      html: htmlProfissional,
    });
  }
}


// ── Lembrete da véspera (com confirmação) ─────────────────────────────────────
export interface LembreteParams {
  agendamentoId: string;
  token: string;
  dataHora: string;
  local: string;
  clienteNome: string;
  clienteEmail: string;
  servicoNome: string;
  studioNome: string;
  profissionalWhatsapp?: string | null;
}

export function montarEmailLembrete(raw: LembreteParams): EmailMontado {
  const p = escapeParams(raw);
  const base = getAppUrl();
  const link = `${base}/a/${encodeURIComponent(raw.token)}`;
  const html = layoutEmail(
    "Lembrete de Agendamento",
    cartao(
      `Olá, ${p.clienteNome}! 💛`,
      `Passando para lembrar do seu horário em <strong>${p.studioNome}</strong>. Pode confirmar sua presença com um clique?`,
      [
        ["Procedimento:", `<span style="color:#C9A84C">${p.servicoNome}</span>`],
        ["Data e Horário:", escapeHtml(formatData(raw.dataHora))],
        ["Local:", p.local],
      ]
    ) +
      blocoBotoes(
        botao(`${link}?acao=confirmar`, "✅ Confirmar presença", "#10B981", "#FFFFFF"),
        botao(`${link}?acao=remarcar`, "🔄 Preciso remarcar", "#262626", "#FFFFFF")
      ) +
      botaoWhatsApp(raw.profissionalWhatsapp, "Falar com o studio no WhatsApp")
  );
  return {
    to: raw.clienteEmail,
    subject: plainSubject(`⏰ Lembrete: seu horário em ${raw.studioNome} — ${formatData(raw.dataHora)}`),
    html,
  };
}

// ── Lista de espera: vaga abriu ───────────────────────────────────────────────
export interface VagaListaEsperaParams {
  clienteNome: string;
  clienteEmail: string;
  servicoNome: string;
  studioNome: string;
  codigoProfissional: string;
  data: string; // YYYY-MM-DD
  primeiroHorario: string; // HH:mm
}

export function montarEmailListaEspera(raw: VagaListaEsperaParams): EmailMontado {
  const p = escapeParams(raw);
  const [ano, mes, dia] = raw.data.split("-");
  const dataBr = `${dia}/${mes}/${ano}`;
  const link = `${getAppUrl()}/p/${encodeURIComponent(raw.codigoProfissional)}`;
  const html = layoutEmail(
    "Abriu um horário!",
    cartao(
      `Boa notícia, ${p.clienteNome}! 🎉`,
      `Abriu vaga em <strong>${p.studioNome}</strong> no dia que você queria. Os horários são liberados por ordem de chegada — garanta o seu:`,
      [
        ["Procedimento:", `<span style="color:#C9A84C">${p.servicoNome}</span>`],
        ["Data:", dataBr],
        ["A partir de:", p.primeiroHorario],
      ]
    ) + blocoBotoes(botao(link, "Agendar agora"))
  );
  return {
    to: raw.clienteEmail,
    subject: plainSubject(`🎉 Abriu horário em ${raw.studioNome} — ${dataBr}`),
    html,
  };
}

// ── Remarcação feita pela cliente ─────────────────────────────────────────────
export interface ReagendamentoClienteParams {
  clienteNome: string;
  clienteEmail?: string | null;
  clienteWhatsapp?: string | null;
  profissionalNome: string;
  profissionalEmail?: string | null;
  profissionalWhatsapp?: string | null;
  nomeStudio?: string | null;
  servicoNome: string;
  dataHoraAnterior: string;
  novaDataHora: string;
  local: string;
}

export async function notificarReagendamentoCliente(raw: ReagendamentoClienteParams): Promise<void> {
  const p = escapeParams(raw);
  const studio = raw.nomeStudio || raw.profissionalNome || "Studio";
  const linhas: Array<[string, string]> = [
    ["Procedimento:", `<span style="color:#C9A84C">${p.servicoNome}</span>`],
    ["Antes:", `<span style="text-decoration: line-through; color:#737373">${escapeHtml(formatData(raw.dataHoraAnterior))}</span>`],
    ["Novo horário:", escapeHtml(formatData(raw.novaDataHora))],
    ["Local:", p.local],
  ];

  const envios: Promise<boolean>[] = [];

  if (raw.clienteEmail) {
    envios.push(
      sendResendEmail({
        to: raw.clienteEmail,
        subject: plainSubject(`🔄 Horário remarcado — ${studio}`),
        html: layoutEmail(
          "Agendamento Remarcado",
          cartao(`Olá, ${p.clienteNome}!`, `Seu horário em <strong>${escapeHtml(studio)}</strong> foi remarcado.`, linhas) +
            botaoWhatsApp(raw.profissionalWhatsapp, "Falar com o studio no WhatsApp")
        ),
      })
    );
  }

  if (raw.profissionalEmail) {
    envios.push(
      sendResendEmail({
        to: raw.profissionalEmail,
        subject: plainSubject(`🔄 ${raw.clienteNome} remarcou o horário`),
        html: layoutEmail(
          "Agendamento Remarcado pela Cliente",
          cartao(
            `Olá, ${p.profissionalNome}!`,
            `<strong>${p.clienteNome}</strong> remarcou o atendimento. O horário anterior ficou livre na sua agenda.`,
            linhas
          ) + botaoWhatsApp(raw.clienteWhatsapp, "Falar com a cliente no WhatsApp"),
          "Studio Manager · Acesse seu painel para ver a agenda atualizada."
        ),
      })
    );
  }

  await Promise.allSettled(envios);
}
