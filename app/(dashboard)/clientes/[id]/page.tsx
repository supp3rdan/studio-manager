"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Phone,
  User,
  Clock,
  MapPin,
  CreditCard,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClienteForm } from "@/components/clientes/cliente-form";
import {
  getClienteById,
  getAtendimentosByClienteId,
} from "@/lib/queries/clientes";
import {
  formatCurrency,
  formatDateTime,
  formatWhatsApp,
  getStatusColor,
  cn,
} from "@/lib/utils";
import type { Cliente, Agendamento } from "@/types/database";

export default function ClienteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params.id as string;

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [atendimentos, setAtendimentos] = useState<Agendamento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!clienteId) return;
    try {
      const [cliData, atData] = await Promise.all([
        getClienteById(clienteId),
        getAtendimentosByClienteId(clienteId),
      ]);
      if (!cliData) {
        toast.error("Cliente não encontrado");
        router.push("/clientes");
        return;
      }
      setCliente(cliData);
      setAtendimentos(atData as Agendamento[]);
    } catch {
      toast.error("Erro ao carregar detalhes do cliente");
    } finally {
      setIsLoading(false);
    }
  }, [clienteId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 bg-white/5 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-44 bg-surface rounded-xl border border-border animate-pulse" />
          <div className="md:col-span-2 h-64 bg-surface rounded-xl border border-border animate-pulse" />
        </div>
      </div>
    );
  }

  if (!cliente) return null;

  const totalGasto = atendimentos
    .filter((a) => a.status === "Concluído")
    .reduce((acc, a) => acc + (a.valor_final ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/clientes"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-[#C9A84C] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Clientes
        </Link>
        <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
          <Pencil className="w-3.5 h-3.5 mr-1.5" />
          Editar Dados
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Client Profile Card */}
        <Card className="bg-surface border-border">
          <CardHeader>
            <div className="w-14 h-14 rounded-2xl bg-[#C9A84C]/10 border border-[#C9A84C]/20 flex items-center justify-center mb-2">
              <User className="w-7 h-7 text-[#C9A84C]" />
            </div>
            <CardTitle className="text-xl text-foreground">
              {cliente.nome}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">WhatsApp</span>
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#C9A84C]" />
                {cliente.whatsapp ? formatWhatsApp(cliente.whatsapp) : "Não informado"}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Cadastrado em</span>
              <p className="text-sm text-muted-foreground">
                {new Date(cliente.criado_em).toLocaleDateString("pt-BR")}
              </p>
            </div>

            <div className="pt-4 border-t border-border grid grid-cols-2 gap-2 text-center">
              <div className="p-3 bg-background rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Atendimentos</span>
                <p className="text-lg font-bold text-foreground mt-0.5">
                  {atendimentos.length}
                </p>
              </div>
              <div className="p-3 bg-background rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Total Investido</span>
                <p className="text-lg font-bold text-[#C9A84C] mt-0.5">
                  {formatCurrency(totalGasto)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Appointment History */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#C9A84C]" />
              Histórico de Atendimentos
            </h3>
            <span className="text-xs text-muted-foreground">
              {atendimentos.length} registro{atendimentos.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data / Hora</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atendimentos.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-10 text-muted-foreground"
                    >
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Nenhum atendimento registrado para este cliente
                    </TableCell>
                  </TableRow>
                ) : (
                  atendimentos.map((ag) => (
                    <TableRow key={ag.id}>
                      <TableCell className="font-medium text-foreground text-sm whitespace-nowrap">
                        {formatDateTime(ag.data_hora)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {ag.servicos?.nome ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-[#C9A84C]">
                        {formatCurrency(ag.valor_final)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ag.forma_pagamento ?? "—"}
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <ClienteForm
        open={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          loadData();
        }}
        cliente={cliente}
      />
    </div>
  );
}
