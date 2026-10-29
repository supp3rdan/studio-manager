"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, CalendarDays, Filter } from "lucide-react";
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
import { AgendamentoForm } from "@/components/agendamentos/agendamento-form";
import { getAgendamentos, deleteAgendamento } from "@/lib/queries/agendamentos";
import {
  formatCurrency,
  formatDateTime,
  getStatusColor,
  cn,
} from "@/lib/utils";
import type { Agendamento, StatusAgendamento } from "@/types/database";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "Agendado", label: "Agendado" },
  { value: "Confirmado", label: "Confirmado" },
  { value: "Concluído", label: "Concluído" },
  { value: "Cancelado", label: "Cancelado" },
  { value: "Não Compareceu", label: "Não Compareceu" },
];

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
                  <TableCell>
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full border",
                      getStatusColor(ag.status)
                    )}>
                      {ag.status}
                    </span>
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
