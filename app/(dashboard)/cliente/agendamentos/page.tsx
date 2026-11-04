"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Phone,
  Sparkles,
  Search,
  Clock,
  MapPin,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAgendamentosDoCliente } from "@/lib/queries/perfis";
import {
  formatCurrency,
  formatDateTime,
  getStatusColor,
  getWhatsAppUrl,
  cn,
} from "@/lib/utils";
import type { Agendamento } from "@/types/database";

export default function ClienteAgendamentosPage() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getAgendamentosDoCliente();
      setAgendamentos(data);
    } catch {
      toast.error("Erro ao carregar seus agendamentos");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Meus Agendamentos</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Acompanhe o status dos seus procedimentos agendados
          </p>
        </div>
        <Link href="/buscar">
          <Button className="w-full sm:w-auto gap-2">
            <Search className="w-4 h-4" />
            Agendar com Profissional
          </Button>
        </Link>
      </div>

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
              <TableHead className="text-right">Contato</TableHead>
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
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

