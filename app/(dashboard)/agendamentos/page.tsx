"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, CalendarDays, Filter, ChevronDown,
  FileDown, Loader2, List, CalendarRange, RefreshCw, Phone, BellRing, Hourglass, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AgendamentoForm } from "@/components/agendamentos/agendamento-form";
import { ReagendamentoModal } from "@/components/agendamentos/reagendamento-modal";
import { CalendarioSemanal } from "@/components/agendamentos/calendario-semanal";
import {
  getAgendamentos, deleteAgendamento, updateAgendamento, avisarHorarioLiberado,
  getListaEsperaProfissional, removerDaListaEspera,
} from "@/lib/queries/agendamentos";
import { generateAgendamentosPDF } from "@/lib/pdf-report";
import { createClient } from "@/lib/supabase/client";
import {
  formatCurrency, formatDateTime, formatDate, getStatusColor, getWhatsAppUrl, cn,
} from "@/lib/utils";
import type { Agendamento, ListaEsperaProfissional, StatusAgendamento } from "@/types/database";

const ALL_STATUSES: StatusAgendamento[] = [
  "Agendado", "Confirmado", "Concluído", "Cancelado", "Não Compareceu",
];

const FILTRO_AGUARDANDO = "aguardando_confirmacao";

const STATUS_OPTIONS = [
  { value: "all", label: "Todos os status" },
  { value: FILTRO_AGUARDANDO, label: "⏳ Aguardando confirmação" },
  ...ALL_STATUSES.map((s) => ({ value: s, label: s })),
];

const STATUS_ATIVOS: StatusAgendamento[] = ["Agendado", "Confirmado"];

/** Agendado (ainda não confirmado) nas próximas 48 horas. */
function aguardandoConfirmacao(ag: Agendamento): boolean {
  if (ag.status !== "Agendado") return false;
  const diff = new Date(ag.data_hora).getTime() - Date.now();
  return diff > 0 && diff <= 48 * 60 * 60 * 1000;
}

function linkWhatsAppConfirmacao(ag: Agendamento): string | null {
  const base = getWhatsAppUrl(ag.clientes?.whatsapp);
  if (!base) return null;
  const nome = (ag.clientes?.nome ?? "").split(" ")[0];
  const texto =
    `Oi${nome ? `, ${nome}` : ""}! Tudo bem? 💛 Passando para confirmar seu horário de ` +
    `${ag.servicos?.nome ?? "atendimento"} em ${formatDateTime(ag.data_hora)}. Posso confirmar?`;
  return `${base}?text=${encodeURIComponent(texto)}`;
}

type ViewMode = "lista" | "calendario";

// ── Inline status selector per row ──────────────────────────────────────────
function StatusSelector({
  agendamento,
  onUpdated,
}: {
  agendamento: Agendamento;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSelect = async (status: StatusAgendamento) => {
    if (status === agendamento.status) { setOpen(false); return; }
    setLoading(true);
    try {
      await updateAgendamento(agendamento.id, { status });
      if (STATUS_ATIVOS.includes(agendamento.status) && !STATUS_ATIVOS.includes(status)) {
        avisarHorarioLiberado(agendamento.data_hora);
      }
      toast.success(`Status alterado para "${status}"`);
      onUpdated();
    } catch {
      toast.error("Erro ao alterar status");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={loading}
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border transition-opacity",
            "hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30",
            loading && "opacity-50 pointer-events-none",
            getStatusColor(agendamento.status)
          )}
        >
          {agendamento.status}
          <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-1.5 w-48">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-2 pb-1">
          Alterar status
        </p>
        {ALL_STATUSES.map((s) => {
          const isActive = s === agendamento.status;
          return (
            <button
              key={s}
              onClick={() => handleSelect(s)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium text-left transition-colors",
                isActive ? "bg-white/5 cursor-default" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <span
                className={cn(
                  "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  isActive ? "border-[#C9A84C]" : "border-border"
                )}
              >
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]" />}
              </span>
              <span className={cn("px-1.5 py-0.5 rounded-full border text-[10px]", getStatusColor(s))}>
                {s}
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function AgendamentosPage() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingAgendamento, setEditingAgendamento] = useState<Agendamento | null>(null);
  const [reagendamentoOpen, setReagendamentoOpen] = useState(false);
  const [reagendamentoTarget, setReagendamentoTarget] = useState<Agendamento | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [listaEspera, setListaEspera] = useState<ListaEsperaProfissional[]>([]);

  const load = useCallback(async () => {
    getListaEsperaProfissional().then(setListaEspera).catch(() => setListaEspera([]));
    try {
      const data = await getAgendamentos();
      setAgendamentos(data);
    } catch {
      toast.error("Erro ao carregar agendamentos");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Pega o user_id do profissional para o reagendamento
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setProfissionalId(user.id);
    });
  }, [load]);

  const filtered = agendamentos.filter((a) =>
    statusFilter === "all"
      ? true
      : statusFilter === FILTRO_AGUARDANDO
        ? aguardandoConfirmacao(a)
        : a.status === statusFilter
  );
  if (statusFilter === FILTRO_AGUARDANDO) {
    filtered.sort((a, b) => a.data_hora.localeCompare(b.data_hora));
  }
  const qtdAguardando = agendamentos.filter(aguardandoConfirmacao).length;

  const handleRemoverEspera = async (id: string) => {
    try {
      await removerDaListaEspera(id);
      setListaEspera((prev) => prev.filter((e) => e.id !== id));
    } catch {
      toast.error("Erro ao remover da lista de espera");
    }
  };

  const handleDelete = async (id: string) => {
    const alvo = agendamentos.find((a) => a.id === id);
    try {
      await deleteAgendamento(id);
      if (alvo && STATUS_ATIVOS.includes(alvo.status)) avisarHorarioLiberado(alvo.data_hora);
      toast.success("Agendamento removido");
      load();
    } catch {
      toast.error("Erro ao remover agendamento");
    }
  };

  const handleGeneratePDF = async () => {
    if (filtered.length === 0) { toast.error("Nenhum agendamento para exportar."); return; }
    setIsGeneratingPDF(true);
    try {
      await generateAgendamentosPDF(filtered);
      toast.success("Relatório gerado e baixado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao gerar relatório", { description: err?.message });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleOpenReagendamento = (ag: Agendamento) => {
    setReagendamentoTarget(ag);
    setReagendamentoOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Agendamentos</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {agendamentos.length} agendamento{agendamentos.length !== 1 ? "s" : ""} no total
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleGeneratePDF}
            disabled={isGeneratingPDF || isLoading}
            className="w-full sm:w-auto"
          >
            {isGeneratingPDF ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Gerando...</>
            ) : (
              <><FileDown className="w-4 h-4" />Gerar relatório</>
            )}
          </Button>
          <Button onClick={() => setFormOpen(true)} className="w-full sm:w-auto">
            <Plus className="w-4 h-4" />
            Novo Agendamento
          </Button>
        </div>
      </div>

      {/* Aguardando confirmação */}
      {qtdAguardando > 0 && statusFilter !== FILTRO_AGUARDANDO && (
        <button
          onClick={() => setStatusFilter(FILTRO_AGUARDANDO)}
          className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-blue-400/10 border border-blue-400/25 text-left text-sm hover:bg-blue-400/15 transition-colors"
        >
          <Hourglass className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{qtdAguardando}</strong>{" "}
            {qtdAguardando === 1 ? "cliente ainda não confirmou" : "clientes ainda não confirmaram"} o horário das próximas 48h.{" "}
            <span className="text-blue-400 font-medium">Ver e chamar no WhatsApp →</span>
          </span>
        </button>
      )}

      {/* Lista de espera */}
      {listaEspera.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">
            Lista de espera <span className="text-muted-foreground font-normal">({listaEspera.length})</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Quando um horário desses dias é liberado, avisamos por e-mail automaticamente.
          </p>
          <div className="divide-y divide-border">
            {listaEspera.map((e) => {
              const whats = getWhatsAppUrl(e.cliente_whatsapp);
              return (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <span className="font-medium text-foreground">{e.cliente_nome}</span>
                    <span className="text-muted-foreground"> · {e.servico_nome} · {formatDate(e.data + "T12:00:00-04:00")}</span>
                    {e.status === "notificado" && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-400/30 text-emerald-400">
                        avisada
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {whats && (
                      <a href={whats} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-400" title="WhatsApp">
                          <Phone className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      title="Remover da lista"
                      onClick={() => handleRemoverEspera(e.id)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros + Toggle de visualização */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {statusFilter !== "all" && (
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">{filtered.length}</strong> agendamento{filtered.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Toggle lista / calendário */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-surface border border-border">
          <button
            onClick={() => setViewMode("lista")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              viewMode === "lista"
                ? "bg-[#C9A84C] text-[#0A0A0A]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="w-3.5 h-3.5" />
            Lista
          </button>
          <button
            onClick={() => setViewMode("calendario")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              viewMode === "calendario"
                ? "bg-[#C9A84C] text-[#0A0A0A]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarRange className="w-3.5 h-3.5" />
            Calendário
          </button>
        </div>
      </div>

      {/* ── View: Calendário ── */}
      {viewMode === "calendario" && (
        <CalendarioSemanal
          agendamentos={filtered}
          onClickAgendamento={(ag) => {
            setEditingAgendamento(ag);
            setFormOpen(true);
          }}
        />
      )}

      {/* ── View: Lista ── */}
      {viewMode === "lista" && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data / Hora</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 rounded bg-white/5 animate-pulse w-3/4" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Nenhum agendamento encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((ag) => (
                  <TableRow key={ag.id}>
                    <TableCell className="font-medium text-foreground text-sm whitespace-nowrap">
                      {formatDateTime(ag.data_hora)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {ag.clientes?.nome ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ag.servicos?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-[#C9A84C]">
                      {formatCurrency(ag.valor_final)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ag.forma_pagamento ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ag.local}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <StatusSelector agendamento={ag} onUpdated={load} />
                        {ag.status === "Agendado" && ag.lembrete_enviado_em && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                            title={`Lembrete enviado em ${formatDateTime(ag.lembrete_enviado_em)}`}
                          >
                            <BellRing className="w-3 h-3" /> lembrete enviado
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* WhatsApp para quem não confirmou */}
                        {aguardandoConfirmacao(ag) && linkWhatsAppConfirmacao(ag) && (
                          <a href={linkWhatsAppConfirmacao(ag)!} target="_blank" rel="noopener noreferrer">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10"
                              title="Pedir confirmação no WhatsApp"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </Button>
                          </a>
                        )}
                        {/* Reagendar */}
                        {!["Concluído", "Cancelado", "Não Compareceu"].includes(ag.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[#C9A84C] hover:text-[#C9A84C] hover:bg-[#C9A84C]/10"
                            title="Reagendar"
                            onClick={() => handleOpenReagendamento(ag)}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {/* Editar */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingAgendamento(ag);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {/* Excluir */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover agendamento?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O agendamento de{" "}
                                <strong className="text-foreground">
                                  {ag.clientes?.nome ?? "cliente desconhecido"}
                                </strong>{" "}
                                será permanentemente removido.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(ag.id)}>
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modais */}
      <AgendamentoForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingAgendamento(null);
          load();
        }}
        agendamento={editingAgendamento}
      />

      <ReagendamentoModal
        open={reagendamentoOpen}
        onClose={() => {
          setReagendamentoOpen(false);
          setReagendamentoTarget(null);
          load();
        }}
        agendamento={reagendamentoTarget}
        profissionalId={profissionalId ?? ""}
      />
    </div>
  );
}
