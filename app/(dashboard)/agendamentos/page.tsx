"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, CalendarDays, Filter, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AgendamentoForm } from "@/components/agendamentos/agendamento-form";
import { getAgendamentos, deleteAgendamento, updateAgendamento } from "@/lib/queries/agendamentos";
import {
  formatCurrency,
  formatDateTime,
  getStatusColor,
  cn,
} from "@/lib/utils";
import type { Agendamento, StatusAgendamento } from "@/types/database";

const ALL_STATUSES: StatusAgendamento[] = [
  "Agendado",
  "Confirmado",
  "Concluído",
  "Cancelado",
  "Não Compareceu",
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todos os status" },
  ...ALL_STATUSES.map((s) => ({ value: s, label: s })),
];

// ── Inline status selector per row ─────────────────────────────────────────
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
    if (status === agendamento.status) {
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      await updateAgendamento(agendamento.id, { status });
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
                isActive
                  ? "bg-white/5 cursor-default"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              {/* Radio-style indicator */}
              <span
                className={cn(
                  "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  isActive ? "border-[#C9A84C]" : "border-border"
                )}
              >
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]" />
                )}
              </span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-full border text-[10px]",
                  getStatusColor(s)
                )}
              >
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
  const [formOpen, setFormOpen] = useState(false);
  const [editingAgendamento, setEditingAgendamento] = useState<Agendamento | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAgendamentos();
      setAgendamentos(data);
    } catch {
      toast.error("Erro ao carregar agendamentos");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = agendamentos.filter(
    (a) => statusFilter === "all" || a.status === statusFilter
  );

  const handleDelete = async (id: string) => {
    try {
      await deleteAgendamento(id);
      toast.success("Agendamento removido");
      load();
    } catch {
      toast.error("Erro ao remover agendamento");
    }
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
        <Button onClick={() => setFormOpen(true)} className="w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          Novo Agendamento
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
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
                  {/* ── Status (inline selector) ── */}
                  <TableCell>
                    <StatusSelector agendamento={ag} onUpdated={load} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
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

      <AgendamentoForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingAgendamento(null);
          load();
        }}
        agendamento={editingAgendamento}
      />
    </div>
  );
}
