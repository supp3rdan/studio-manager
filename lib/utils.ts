import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

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

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  return format(parseISO(dateString), "dd/MM/yyyy", { locale: ptBR });
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  return format(parseISO(dateString), "dd/MM/yyyy 'às' HH:mm", {
    locale: ptBR,
  });
}

export function formatWhatsApp(whatsapp: string | null | undefined): string {
  if (!whatsapp) return "—";
  const digits = whatsapp.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return whatsapp;
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
