"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarClock, CheckCircle2, Loader2, MapPin, Phone, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateTime, getStatusColor, getWhatsAppUrl } from "@/lib/utils";

export interface AgendamentoPublico {
  id: string;
  data_hora: string;
  status: string;
  local: string;
  confirmado_em: string | null;
  servico_nome: string | null;
  duracao_minutos: number;
  studio_nome: string | null;
  profissional_whatsapp: string | null;
  cliente_primeiro_nome: string | null;
  pode_confirmar: boolean;
  pode_remarcar: boolean;
}

/**
 * Página aberta pelo link do e-mail de lembrete. A confirmação exige um clique
 * aqui (e não só abrir o link) porque filtros de e-mail visitam links
 * automaticamente e confirmariam sem a cliente saber.
 */
export function ConfirmacaoAgendamento({
  token,
  agendamento,
  acao,
}: {
  token: string;
  agendamento: AgendamentoPublico | null;
  acao: "confirmar" | "remarcar";
}) {
  const [status, setStatus] = useState(agendamento?.status ?? "");
  const [enviando, setEnviando] = useState(false);

  if (!agendamento) {
    return (
      <div className="max-w-md w-full rounded-2xl border border-border bg-surface p-8 text-center space-y-3">
        <XCircle className="w-10 h-10 mx-auto text-destructive" />
        <h1 className="text-lg font-semibold">Link inválido ou expirado</h1>
        <p className="text-sm text-muted-foreground">
          Não encontramos este agendamento. Fale com o studio pelo WhatsApp.
        </p>
      </div>
    );
  }

  const whats = getWhatsAppUrl(agendamento.profissional_whatsapp);
  const confirmado = status === "Confirmado";
  const podeConfirmar = status === "Agendado" && agendamento.pode_confirmar;

  const confirmar = async () => {
    setEnviando(true);
    try {
      const { error } = await createClient().rpc("confirmar_presenca", { p_token: token });
      if (error) throw error;
      setStatus("Confirmado");
      toast.success("Presença confirmada! Até lá 💛");
    } catch (err) {
      toast.error((err as Error)?.message || "Não foi possível confirmar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="max-w-md w-full rounded-2xl border border-border bg-surface p-6 sm:p-8 space-y-6">
      <div className="text-center space-y-1">
        <p className="text-xs uppercase tracking-widest text-[#C9A84C]">{agendamento.studio_nome}</p>
        <h1 className="text-xl font-bold">
          {agendamento.cliente_primeiro_nome ? `Olá, ${agendamento.cliente_primeiro_nome}!` : "Seu agendamento"}
        </h1>
      </div>

      <div className="rounded-xl border border-border bg-background p-4 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-[#C9A84C]">{agendamento.servico_nome ?? "Procedimento"}</span>
          <span className={cn("text-xs px-2 py-0.5 rounded-full border", getStatusColor(status))}>{status}</span>
        </div>
        <p className="flex items-center gap-2 text-foreground">
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
          {formatDateTime(agendamento.data_hora)}
        </p>
        <p className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="w-4 h-4" />
          {agendamento.local}
        </p>
      </div>

      {confirmado ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
          <CheckCircle2 className="w-6 h-6 shrink-0" />
          <p className="text-sm font-medium">Presença confirmada. Te esperamos!</p>
        </div>
      ) : podeConfirmar ? (
        <Button
          onClick={confirmar}
          disabled={enviando}
          className={cn(
            "w-full h-12 text-base gap-2",
            acao === "confirmar" && "ring-2 ring-emerald-400/50"
          )}
        >
          {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CalendarCheck className="w-5 h-5" />}
          Confirmar presença
        </Button>
      ) : null}

      <div className="space-y-2">
        {agendamento.pode_remarcar ? (
          <Link href={`/cliente/agendamentos?remarcar=${agendamento.id}`} className="block">
            <Button variant={acao === "remarcar" ? "default" : "outline"} className="w-full gap-2">
              <CalendarClock className="w-4 h-4" />
              Preciso remarcar
            </Button>
          </Link>
        ) : (
          ["Agendado", "Confirmado"].includes(status) && (
            <p className="text-xs text-center text-muted-foreground">
              Para remarcar com menos de 2 horas de antecedência, fale com o studio.
            </p>
          )
        )}
        {whats && (
          <a href={whats} target="_blank" rel="noopener noreferrer" className="block">
            <Button variant="ghost" className="w-full gap-2 text-emerald-400 hover:text-emerald-300">
              <Phone className="w-4 h-4" />
              Falar no WhatsApp
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
