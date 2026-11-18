import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Fuso horário padrão do sistema: Manaus / AM (UTC-4) */
export const TIMEZONE_DEFAULT = "America/Manaus";
export const TIMEZONE_OFFSET = "-04:00";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/** Formata data para dd/MM/yyyy no fuso de Manaus */
export function formatDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return "—";
  try {
    const d = typeof dateString === "string" ? new Date(dateString) : dateString;
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: TIMEZONE_DEFAULT,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return String(dateString);
  }
}

/** Formata horário para HH:mm no fuso de Manaus */
export function formatTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return "—";
  try {
    const d = typeof dateString === "string" ? new Date(dateString) : dateString;
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: TIMEZONE_DEFAULT,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return String(dateString);
  }
}

/** Formata data e horário para dd/MM/yyyy às HH:mm no fuso de Manaus */
export function formatDateTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return "—";
  try {
    const d = typeof dateString === "string" ? new Date(dateString) : dateString;
    if (isNaN(d.getTime())) return "—";
    const dataFmt = formatDate(d);
    const horaFmt = formatTime(d);
    return `${dataFmt} às ${horaFmt}`;
  } catch {
    return String(dateString);
  }
}

/** Retorna string YYYY-MM-DD no fuso de Manaus */
export function getManausDateString(dateString: string | Date): string {
  const d = typeof dateString === "string" ? new Date(dateString) : dateString;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_DEFAULT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Retorna a hora (0-23) no fuso de Manaus */
export function getManausHour(dateString: string | Date): number {
  const horaStr = formatTime(dateString);
  const hourNum = Number(horaStr.split(":")[0]);
  return isNaN(hourNum) ? 0 : hourNum;
}

/** Cria um ISO timestamp com offset explícito de Manaus (-04:00) */
export function toManausISO(dataStr: string, horaStr?: string | null): string {
  if (horaStr && horaStr.trim()) {
    const horaLimpa = horaStr.trim().length === 5 ? horaStr.trim() : horaStr.trim().slice(0, 5);
    return new Date(`${dataStr}T${horaLimpa}:00${TIMEZONE_OFFSET}`).toISOString();
  }
  return new Date(`${dataStr}T12:00:00${TIMEZONE_OFFSET}`).toISOString();
}

export function formatWhatsApp(whatsapp: string | null | undefined): string {
  if (!whatsapp) return "—";
  const digits = whatsapp.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return whatsapp;
}

export function getWhatsAppUrl(whatsapp: string | null | undefined): string | null {
  if (!whatsapp) return null;
  const digits = whatsapp.replace(/\D/g, "");
  if (!digits) return null;
  // Se for número brasileiro sem DDI (10 ou 11 dígitos), prefixa com 55
  const fullNumber =
    digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return `https://wa.me/${fullNumber}`;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    Agendado: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    Confirmado: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    Concluído: "text-gold bg-gold/10 border-gold/20",
    Cancelado: "text-red-400 bg-red-400/10 border-red-400/20",
    "Não Compareceu": "text-orange-400 bg-orange-400/10 border-orange-400/20",
  };
  return colors[status] ?? "text-muted-foreground bg-muted border-border";
}

export function getCategoriaColor(categoria: string): string {
  const colors: Record<string, string> = {
    Cílios: "text-purple-400 bg-purple-400/10 border-purple-400/20",
    Sobrancelhas: "text-pink-400 bg-pink-400/10 border-pink-400/20",
    Depilação: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  };
  return colors[categoria] ?? "text-muted-foreground bg-muted border-border";
}
