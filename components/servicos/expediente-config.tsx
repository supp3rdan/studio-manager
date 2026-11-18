"use client";

import { useEffect, useState } from "react";
import { Clock, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getConfigExpediente, salvarConfigExpediente, type DiaExpediente } from "@/lib/queries/expediente";

const NOMES_DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
// Exibe de segunda a domingo
const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const INTERVALOS = [10, 15, 20, 30, 40, 45, 60];
const BUFFERS = [0, 5, 10, 15, 20, 30, 45, 60];

export function ExpedienteConfig() {
  const [dias, setDias] = useState<DiaExpediente[]>([]);
  const [intervalo, setIntervalo] = useState(30);
  const [buffer, setBuffer] = useState(0);
  const [personalizado, setPersonalizado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    getConfigExpediente()
      .then((cfg) => {
        setDias(cfg.dias);
        setIntervalo(cfg.intervaloMin);
        setBuffer(cfg.bufferMin);
        setPersonalizado(cfg.personalizado);
      })
      .catch(() => toast.error("Erro ao carregar expediente"))
      .finally(() => setCarregando(false));
  }, []);

  const atualizarDia = (dia: number, patch: Partial<DiaExpediente>) =>
    setDias((prev) => prev.map((d) => (d.dia_semana === dia ? { ...d, ...patch } : d)));

  const salvar = async () => {
    const invalido = dias.find((d) => d.ativo && d.fim <= d.inicio);
    if (invalido) {
      toast.error(`${NOMES_DIAS[invalido.dia_semana]}: o fim deve ser depois do início.`);
      return;
    }
    setSalvando(true);
    try {
      await salvarConfigExpediente({ dias, intervaloMin: intervalo, bufferMin: buffer });
      setPersonalizado(true);
      toast.success("Expediente salvo! Os horários do seu link já foram atualizados.");
    } catch (err) {
      toast.error("Erro ao salvar expediente", { description: (err as Error)?.message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#C9A84C]" />
            Expediente
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dias e horários em que suas clientes podem agendar.
            {!personalizado && !carregando && " Hoje você usa o padrão: todos os dias, das 07:00 às 22:30."}
          </p>
        </div>
        <Button size="sm" onClick={salvar} disabled={salvando || carregando} className="gap-2 shrink-0">
          {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Salvar
        </Button>
      </div>

      {carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {ORDEM.map((d) => {
              const dia = dias.find((x) => x.dia_semana === d)!;
              return (
                <div
                  key={d}
                  className={cn(
                    "flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg border border-border",
                    !dia.ativo && "opacity-60"
                  )}
                >
                  <label className="flex items-center gap-2 w-28 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={dia.ativo}
                      onChange={(e) => atualizarDia(d, { ativo: e.target.checked })}
                      className="h-4 w-4 accent-[#C9A84C]"
                    />
                    <span className="text-sm">{NOMES_DIAS[d]}</span>
                  </label>
                  {dia.ativo ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Input
                        type="time"
                        value={dia.inicio}
                        onChange={(e) => atualizarDia(d, { inicio: e.target.value })}
                        className="h-8 w-28 bg-background"
                        aria-label={`Início ${NOMES_DIAS[d]}`}
                      />
                      <span className="text-muted-foreground">até</span>
                      <Input
                        type="time"
                        value={dia.fim}
                        onChange={(e) => atualizarDia(d, { fim: e.target.value })}
                        className="h-8 w-28 bg-background"
                        aria-label={`Fim ${NOMES_DIAS[d]}`}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Fechado</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Horários oferecidos a cada</Label>
              <Select value={String(intervalo)} onValueChange={(v) => setIntervalo(Number(v))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERVALOS.map((m) => (
                    <SelectItem key={m} value={String(m)}>{m} minutos</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Intervalo entre atendimentos (limpeza, preparo)</Label>
              <Select value={String(buffer)} onValueChange={(v) => setBuffer(Number(v))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUFFERS.map((m) => (
                    <SelectItem key={m} value={String(m)}>{m === 0 ? "Sem intervalo" : `${m} minutos`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            O horário final é o limite para o atendimento <strong>terminar</strong>. Para pausas no meio do dia (almoço), use um bloqueio recorrente abaixo.
          </p>
        </>
      )}
    </div>
  );
}
