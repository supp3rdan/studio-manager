"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, CalendarOff, Clock, Repeat } from "lucide-react";
import { format, addHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn, toManausISO } from "@/lib/utils";
import { createIndisponibilidade } from "@/lib/queries/indisponibilidades";

const schema = z
  .object({
    tipo: z.enum(["dia_inteiro", "horario"]),
    recorrente: z.boolean(),
    dia_semana: z.number().min(0).max(6).nullable().optional(),
    data: z.string().optional(),
    hora_inicio: z.string().optional(),
    hora_fim: z.string().optional(),
    titulo: z.string().optional(),
  })
  .refine(
    (d) => {
      if (d.recorrente) return d.dia_semana != null;
      return !!d.data;
    },
    { message: "Selecione a data ou o dia da semana", path: ["data"] }
  )
  .refine(
    (d) =>
      d.tipo === "dia_inteiro" ||
      (d.hora_inicio && d.hora_fim && d.hora_inicio < d.hora_fim),
    { message: "Horário de fim deve ser após o início", path: ["hora_fim"] }
  );

type FormData = z.infer<typeof schema>;

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface IndisponibilidadeModalProps {
  open: boolean;
  onClose: () => void;
}

export function IndisponibilidadeModal({ open, onClose }: IndisponibilidadeModalProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo: "dia_inteiro",
      recorrente: false,
      dia_semana: null,
      data: "",
      hora_inicio: "07:00",
      hora_fim: "08:00",
      titulo: "",
    },
  });

  const tipo = watch("tipo");
  const recorrente = watch("recorrente");

  useEffect(() => {
    if (open) reset({
      tipo: "dia_inteiro",
      recorrente: false,
      dia_semana: null,
      data: "",
      hora_inicio: "07:00",
      hora_fim: "08:00",
      titulo: "",
    });
  }, [open, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      let dataInicio: string;
      let dataFim: string | null = null;

      if (data.recorrente) {
        // Para recorrente, usamos um anchor date fixo no fuso de Manaus — só a hora e dia_semana importam
        const anchorDate = "2000-01-01";
        dataInicio = toManausISO(anchorDate, data.tipo === "horario" ? (data.hora_inicio || "08:00") : "00:00");
        if (data.tipo === "horario") {
          dataFim = toManausISO(anchorDate, data.hora_fim || "09:00");
        }
      } else {
        const dateStr = data.data!;
        if (data.tipo === "dia_inteiro") {
          dataInicio = toManausISO(dateStr, "00:00");
          dataFim = null;
        } else {
          dataInicio = toManausISO(dateStr, data.hora_inicio || "08:00");
          dataFim = toManausISO(dateStr, data.hora_fim || "09:00");
        }
      }

      await createIndisponibilidade({
        tipo: data.tipo,
        recorrente: data.recorrente,
        dia_semana: data.recorrente ? (data.dia_semana ?? null) : null,
        data_inicio: dataInicio,
        data_fim: dataFim,
        titulo: data.titulo || null,
      });

      toast.success("Bloqueio salvo com sucesso!");
      onClose();
    } catch (err: any) {
      toast.error("Erro ao salvar bloqueio", { description: err?.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center">
              <CalendarOff className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <DialogTitle>Bloquear Horário / Dia</DialogTitle>
              <DialogDescription className="text-xs">
                Marque datas ou horários indisponíveis para novos agendamentos.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-1">
          {/* Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo de bloqueio</Label>
            <Controller
              name="tipo"
              control={control}
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "dia_inteiro", label: "Dia inteiro", icon: CalendarOff },
                    { value: "horario", label: "Horário específico", icon: Clock },
                  ].map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => field.onChange(value)}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all",
                        field.value === value
                          ? "border-destructive bg-destructive/10 text-destructive"
                          : "border-border bg-background text-muted-foreground hover:bg-white/5"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          {/* Recorrente toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Recorrente</p>
                <p className="text-xs text-muted-foreground">Repete todo(a) esse dia da semana</p>
              </div>
            </div>
            <Controller
              name="recorrente"
              control={control}
              render={({ field }) => (
                <button
                  type="button"
                  onClick={() => field.onChange(!field.value)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    field.value ? "bg-destructive" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                      field.value ? "translate-x-4" : "translate-x-1"
                    }`}
                  />
                </button>
              )}
            />
          </div>

          {/* Seleção de data ou dia da semana */}
          {recorrente ? (
            <div className="space-y-1.5">
              <Label>Dia da semana</Label>
              <Controller
                name="dia_semana"
                control={control}
                render={({ field }) => (
                  <Select
                    onValueChange={(v) => field.onChange(Number(v))}
                    value={field.value != null ? String(field.value) : ""}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o dia" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIAS_SEMANA.map((d, i) => (
                        <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Controller
                name="data"
                control={control}
                render={({ field }) => (
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "w-full flex items-center gap-2 px-3 h-10 rounded-lg border border-border bg-background text-sm text-left",
                          "hover:border-destructive/40 focus:outline-none focus:ring-2 focus:ring-destructive/30 transition-colors",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="w-4 h-4 text-destructive shrink-0" />
                        {field.value
                          ? format(new Date(field.value + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
                          : "Selecionar data"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="p-0">
                      <Calendar
                        mode="single"
                        selected={field.value ? new Date(field.value + "T12:00:00") : undefined}
                        onSelect={(date) => {
                          field.onChange(date ? format(date, "yyyy-MM-dd") : "");
                          setCalendarOpen(false);
                        }}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {errors.data && <p className="text-xs text-destructive">{errors.data.message}</p>}
            </div>
          )}

          {/* Horários (somente para tipo horario) */}
          {tipo === "horario" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hora_inicio">Início</Label>
                <Input
                  id="hora_inicio"
                  type="time"
                  min="07:00"
                  max="21:30"
                  {...register("hora_inicio")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hora_fim">Fim</Label>
                <Input
                  id="hora_fim"
                  type="time"
                  min="07:30"
                  max="22:00"
                  {...register("hora_fim")}
                />
                {errors.hora_fim && (
                  <p className="text-xs text-destructive">{errors.hora_fim.message}</p>
                )}
              </div>
            </div>
          )}

          {/* Título (opcional) */}
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Motivo / Título (opcional)</Label>
            <Input id="titulo" placeholder="Ex: Feriado, Consulta médica..." {...register("titulo")} />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} variant="destructive">
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</>
              ) : (
                "Bloquear"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
