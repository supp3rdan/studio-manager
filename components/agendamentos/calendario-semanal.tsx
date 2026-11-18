"use client";

import { useMemo, useState } from "react";
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  parseISO,
  isSameDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStatusColor, cn, getManausDateString, getManausHour, formatTime } from "@/lib/utils";
import type { Agendamento } from "@/types/database";

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 07h às 22h

interface CalendarioSemanalProps {
  agendamentos: Agendamento[];
  onClickAgendamento?: (ag: Agendamento) => void;
}

export function CalendarioSemanal({
  agendamentos,
  onClickAgendamento,
}: CalendarioSemanalProps) {
  const [semanaBase, setSemanaBase] = useState(new Date());

  const inicioSemana = startOfWeek(semanaBase, { weekStartsOn: 1 }); // segunda-feira
  const dias = Array.from({ length: 7 }, (_, i) => addDays(inicioSemana, i));

  const hoje = new Date();

  // Mapeia agendamentos por dia e hora no fuso de Manaus
  const agendamentosPorDia = useMemo(() => {
    const map: Record<string, Agendamento[]> = {};
    agendamentos.forEach((ag) => {
      const dataKey = getManausDateString(ag.data_hora);
      if (!map[dataKey]) map[dataKey] = [];
      map[dataKey].push(ag);
    });
    return map;
  }, [agendamentos]);

  const getAgendamentosNaDia = (dia: Date) => {
    const key = format(dia, "yyyy-MM-dd");
    return agendamentosPorDia[key] ?? [];
  };

  const getHoraAgendamento = (ag: Agendamento) => {
    return getManausHour(ag.data_hora);
  };

  return (
    <div className="space-y-3">
      {/* Nav semana */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setSemanaBase(subWeeks(semanaBase, 1))}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold text-foreground">
          {format(inicioSemana, "d 'de' MMMM", { locale: ptBR })}
          {" — "}
          {format(addDays(inicioSemana, 6), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setSemanaBase(addWeeks(semanaBase, 1))}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Grid */}
      <div className="rounded-xl border border-border bg-surface overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Cabeçalho com dias */}
          <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-border">
            <div className="p-2" /> {/* coluna de horas */}
            {dias.map((dia) => {
              const isHoje = isSameDay(dia, hoje);
              const ags = getAgendamentosNaDia(dia);
              return (
                <div
                  key={dia.toISOString()}
                  className={cn(
                    "p-2 text-center border-l border-border",
                    isHoje && "bg-[#C9A84C]/5"
                  )}
                >
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase",
                      isHoje ? "text-[#C9A84C]" : "text-muted-foreground"
                    )}
                  >
                    {format(dia, "EEE", { locale: ptBR })}
                  </p>
                  <p
                    className={cn(
                      "text-lg font-bold leading-tight",
                      isHoje ? "text-[#C9A84C]" : "text-foreground"
                    )}
                  >
                    {format(dia, "d")}
                  </p>
                  {ags.length > 0 && (
                    <span className="text-[9px] text-muted-foreground">
                      {ags.length} ag.
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Linhas de horas */}
          {HOURS.map((hora) => (
            <div
              key={hora}
              className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-border/40 min-h-[52px]"
            >
              {/* Label da hora */}
              <div className="p-2 text-right pr-3 pt-1.5">
                <span className="text-[11px] text-muted-foreground font-mono">
                  {String(hora).padStart(2, "0")}:00
                </span>
              </div>

              {/* Células por dia */}
              {dias.map((dia) => {
                const isHoje = isSameDay(dia, hoje);
                const ags = getAgendamentosNaDia(dia).filter(
                  (ag) => getHoraAgendamento(ag) === hora
                );

                return (
                  <div
                    key={dia.toISOString()}
                    className={cn(
                      "border-l border-border/40 p-1 space-y-0.5",
                      isHoje && "bg-[#C9A84C]/3"
                    )}
                  >
                    {ags.map((ag) => (
                      <button
                        key={ag.id}
                        onClick={() => onClickAgendamento?.(ag)}
                        className={cn(
                          "w-full text-left rounded-md px-1.5 py-1 text-[10px] font-medium leading-tight",
                          "border transition-opacity hover:opacity-80 focus:outline-none",
                          getStatusColor(ag.status)
                        )}
                      >
                        <span className="block font-semibold truncate">
                          {formatTime(ag.data_hora)}
                          {" "}
                          {ag.clientes?.nome?.split(" ")[0] || "—"}
                        </span>
                        <span className="block opacity-80 truncate">
                          {ag.servicos?.nome || "—"}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-[#C9A84C]" />
          Clique em um agendamento para editar
        </span>
      </div>
    </div>
  );
}
