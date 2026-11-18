"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { differenceInHours, parseISO } from "date-fns";
import {
  CalendarDays, Phone, Sparkles, Search, Clock,
  MapPin, CreditCard, XCircle, Loader2, AlertTriangle, CalendarClock, Hourglass, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getAgendamentosDoCliente, getMinhaListaEspera, sairDaListaEspera, type MinhaListaEspera,
} from "@/lib/queries/perfis";
import { ReagendamentoModal } from "@/components/agendamentos/reagendamento-modal";
import {
  formatCurrency, formatDate, formatDateTime, getStatusColor, getWhatsAppUrl, cn,
} from "@/lib/utils";
import type { Agendamento } from "@/types/database";

/** Verifica se o agendamento pode ser cancelado pelo cliente (> 2h de antecedência) */
function podeCancelar(ag: Agendamento): boolean {
  if (!["Agendado", "Confirmado"].includes(ag.status)) return false;
  const horasAte = differenceInHours(parseISO(ag.data_hora), new Date());
  return horasAte > 2;
}

/** Verifica se tem menos de 2h (avisa que não pode cancelar online) */
function dentroJanelaCancelamento(ag: Agendamento): boolean {
  if (!["Agendado", "Confirmado"].includes(ag.status)) return false;
  const horasAte = differenceInHours(parseISO(ag.data_hora), new Date());
  return horasAte <= 2 && horasAte > 0;
}

export default function ClienteAgendamentosPage() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [remarcando, setRemarcando] = useState<Agendamento | null>(null);
  const [listaEspera, setListaEspera] = useState<MinhaListaEspera[]>([]);

  const load = useCallback(async () => {
    getMinhaListaEspera().then(setListaEspera).catch(() => setListaEspera([]));
    try {
      const data = await getAgendamentosDoCliente();
      setAgendamentos(data);
      // Link "Preciso remarcar" do e-mail: /cliente/agendamentos?remarcar=<id>
      const alvo = new URLSearchParams(window.location.search).get("remarcar");
      if (alvo) {
        const ag = data.find((a) => a.id === alvo);
        if (ag && podeCancelar(ag)) setRemarcando(ag);
        else if (ag) toast.error("Este agendamento não pode mais ser remarcado pelo app. Fale com o studio pelo WhatsApp.");
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {
      toast.error("Erro ao carregar seus agendamentos");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCancelar = async (agendamentoId: string) => {
    setCancelando(agendamentoId);
    try {
      const res = await fetch(`/api/agendamentos/${agendamentoId}/cancelar`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Erro ao cancelar agendamento");
        return;
      }
      toast.success("Agendamento cancelado com sucesso! O horário foi liberado.");
      load();
    } catch {
      toast.error("Erro de conexão ao cancelar. Tente novamente.");
    } finally {
      setCancelando(null);
    }
  };

  const handleSairEspera = async (id: string) => {
    try {
      await sairDaListaEspera(id);
      setListaEspera((prev) => prev.filter((e) => e.id !== id));
      toast.success("Você saiu da lista de espera.");
    } catch {
      toast.error("Erro ao sair da lista de espera");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Meus Agendamentos</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Acompanhe e gerencie seus procedimentos agendados
          </p>
        </div>
        <Link href="/buscar">
          <Button className="w-full sm:w-auto gap-2">
            <Search className="w-4 h-4" />
            Agendar com Profissional
          </Button>
        </Link>
      </div>

      {/* Aviso sobre política de cancelamento */}
      {agendamentos.some((ag) => ["Agendado", "Confirmado"].includes(ag.status)) && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#C9A84C]/8 border border-[#C9A84C]/20 text-sm">
          <Clock className="w-4 h-4 text-[#C9A84C] shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            <span className="text-foreground font-medium">Política de cancelamento:</span>{" "}
            Você pode remarcar ou cancelar agendamentos com mais de <strong className="text-foreground">2 horas</strong> de antecedência diretamente pelo app.
            Para cancelamentos de última hora, entre em contato com o profissional pelo WhatsApp.
          </p>
        </div>
      )}

      {/* Lista de espera */}
      {listaEspera.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Hourglass className="w-4 h-4 text-[#C9A84C]" />
            Minha lista de espera
          </p>
          <p className="text-xs text-muted-foreground">Quando abrir um horário, aparece aqui o aviso &quot;abriu vaga&quot; e o studio também pode te chamar no WhatsApp.</p>
          <div className="divide-y divide-border">
            {listaEspera.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <span className="font-medium text-foreground">{e.studio_nome}</span>
                  <span className="text-muted-foreground"> · {e.servico_nome} · {formatDate(e.data + "T12:00:00-04:00")}</span>
                  {e.status === "notificado" && (
                    <Link href={`/p/${e.codigo_profissional}`} className="ml-2 text-[11px] text-emerald-400 underline">
                      abriu vaga — agendar
                    </Link>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => handleSairEspera(e.id)}>
                  <X className="w-3 h-3" /> Sair
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data / Hora</TableHead>
              <TableHead>Studio / Profissional</TableHead>
              <TableHead>Procedimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 rounded bg-white/5 animate-pulse w-3/4" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : agendamentos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-14 text-muted-foreground">
                  <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30 text-[#C9A84C]" />
                  <p className="text-base font-semibold text-foreground">
                    Nenhum agendamento encontrado
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto mb-4">
                    Você ainda não possui horários agendados. Digite o código de 4 números do seu profissional para escolher um procedimento.
                  </p>
                  <Link href="/buscar">
                    <Button size="sm" className="gap-1.5">
                      <Search className="w-3.5 h-3.5" />
                      Buscar Profissional pelo Código
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              agendamentos.map((ag) => {
                const whatsUrl = ag.profissional?.whatsapp
                  ? getWhatsAppUrl(ag.profissional.whatsapp)
                  : null;
                const podeCanc = podeCancelar(ag);
                const dentroJanela = dentroJanelaCancelamento(ag);
                const isCancelando = cancelando === ag.id;

                return (
                  <TableRow key={ag.id}>
                    <TableCell className="font-medium text-foreground text-sm whitespace-nowrap">
                      {formatDateTime(ag.data_hora)}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-foreground text-sm leading-tight">
                          {ag.profissional?.nome_studio || ag.profissional?.nome || "Studio"}
                        </p>
                        {ag.profissional?.nome_studio && (
                          <p className="text-xs text-muted-foreground">
                            {ag.profissional.nome}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-medium text-foreground">
                        {ag.servicos?.nome ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-[#C9A84C]">
                      {formatCurrency(ag.valor_final)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ag.local}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full border",
                          getStatusColor(ag.status)
                        )}
                      >
                        {ag.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Botão Remarcar */}
                        {podeCanc && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs border-[#C9A84C]/40 text-[#C9A84C] hover:bg-[#C9A84C]/10"
                            onClick={() => setRemarcando(ag)}
                          >
                            <CalendarClock className="w-3.5 h-3.5" />
                            Remarcar
                          </Button>
                        )}

                        {/* Botão Cancelar */}
                        {podeCanc && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                                disabled={isCancelando}
                              >
                                {isCancelando ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5" />
                                )}
                                Cancelar
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2">
                                  <XCircle className="w-5 h-5 text-destructive" />
                                  Cancelar Agendamento?
                                </AlertDialogTitle>
                                <AlertDialogDescription asChild>
                                  <div className="space-y-3 text-sm text-muted-foreground">
                                    <p>
                                      Você está prestes a cancelar o agendamento de{" "}
                                      <strong className="text-foreground">{ag.servicos?.nome}</strong>{" "}
                                      em{" "}
                                      <strong className="text-foreground">
                                        {ag.profissional?.nome_studio || ag.profissional?.nome}
                                      </strong>.
                                    </p>
                                    <p className="text-xs">{formatDateTime(ag.data_hora)}</p>
                                    <p className="text-xs text-[#C9A84C]">
                                      O horário ficará disponível para outros clientes.
                                    </p>
                                  </div>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Manter Agendamento</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleCancelar(ag.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Sim, Cancelar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}

                        {/* Aviso: dentro da janela de 2h */}
                        {dentroJanela && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] text-amber-400 border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 rounded-full"
                            title="Menos de 2h para o atendimento — entre em contato pelo WhatsApp"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Contate pelo WhatsApp
                          </span>
                        )}

                        {/* WhatsApp do profissional */}
                        {whatsUrl ? (
                          <a
                            href={whatsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition-all"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ReagendamentoModal
        open={!!remarcando}
        onClose={() => {
          setRemarcando(null);
          load();
        }}
        agendamento={remarcando}
        profissionalId={remarcando?.user_id ?? ""}
        modo="cliente"
      />
    </div>
  );
}
