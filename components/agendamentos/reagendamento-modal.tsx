"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, CalendarIcon, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { getHorariosDisponiveis } from "@/lib/queries/indisponibilidades";
import { avisarHorarioLiberado } from "@/lib/queries/agendamentos";
import { formatDateTime, cn, toManausISO } from "@/lib/utils";
import type { Agendamento } from "@/types/database";

const schema = z.object({
  data: z.string().min(1, "Selecione a data"),
  hora: z.string().min(1, "Selecione o horário"),
});
type FormData = z.infer<typeof schema>;

interface ReagendamentoModalProps {
  open: boolean;
  onClose: () => void;
  agendamento: Agendamento | null;
  profissionalId: string;
  /** "cliente": a própria cliente remarca (regra de 2h). */
  modo?: "profissional" | "cliente";
}

export function ReagendamentoModal({
  open,
  onClose,
  agendamento,
  profissionalId,
  modo = "profissional",
}: ReagendamentoModalProps) {
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { data: "", hora: "" },
  });

  const selectedDate = watch("data");
  const selectedHora = watch("hora");

  const handleDateSelect = async (date: Date | undefined) => {
    if (!date || !agendamento) return;
    const dateStr = format(date, "yyyy-MM-dd");
    setValue("data", dateStr);
    setValue("hora", "");
    setSlots([]);
    setLoadingSlots(true);
    try {
      const duracao = agendamento.servicos?.duracao_minutos ?? 30;
      const available = await getHorariosDisponiveis(profissionalId, dateStr, duracao);
      // Converte ISO strings para HH:mm se necessário
      const formatted = available.map((s) => {
        if (s.includes("T")) return format(parseISO(s), "HH:mm");
        return s;
      });
      setSlots(formatted);
    } catch {
      toast.error("Erro ao carregar horários disponíveis");
    } finally {
      setLoadingSlots(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    if (!agendamento) return;
    setSubmitting(true);
    try {
      const novaDataHora = toManausISO(data.data, data.hora);

      if (modo === "cliente") {
        const res = await fetch(`/api/agendamentos/${agendamento.id}/reagendar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data_hora: novaDataHora }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Erro ao remarcar");
        toast.success("Horário remarcado! O studio foi avisado.");
      } else {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Não autenticado");

        const { error } = await supabase.rpc("reagendar_agendamento", {
          p_agendamento_id: agendamento.id,
          p_profissional_user_id: user.id,
          p_nova_data_hora: novaDataHora,
        });
        if (error) throw error;
        avisarHorarioLiberado(agendamento.data_hora);
        toast.success("Agendamento reagendado com sucesso!");
      }

      reset();
      setSlots([]);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao reagendar agendamento");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    setSlots([]);
    onClose();
  };

  if (!agendamento) return null;

  const dataAtual = new Date(agendamento.data_hora);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#C9A84C]" />
            Reagendar Atendimento
          </DialogTitle>
          <DialogDescription>
            {modo === "cliente"
              ? "Escolha um novo dia e horário livre."
              : "Selecione nova data e horário. Os outros dados serão mantidos."}
          </DialogDescription>
        </DialogHeader>

        {/* Info do agendamento atual */}
        <div className="p-3.5 rounded-xl bg-surface border border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
            Agendamento atual
          </p>
          <p className="text-sm font-semibold text-foreground">
            {modo === "cliente"
              ? agendamento.profissional?.nome_studio || agendamento.profissional?.nome || "Studio"
              : agendamento.clientes?.nome || "Cliente"}
            {agendamento.servicos?.nome && (
              <span className="text-[#C9A84C]"> · {agendamento.servicos.nome}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDateTime(agendamento.data_hora)}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Seletor de Data */}
          <div className="space-y-1.5">
            <Label>Nova Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate
                    ? format(new Date(selectedDate + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
                    : "Selecionar data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate ? new Date(selectedDate + "T12:00:00") : undefined}
                  onSelect={handleDateSelect}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {errors.data && <p className="text-xs text-destructive">{errors.data.message}</p>}
          </div>

          {/* Seletor de Horário */}
          <div className="space-y-1.5">
            <Label>Novo Horário</Label>
            {loadingSlots ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando horários disponíveis...
              </div>
            ) : slots.length > 0 ? (
              <Select
                value={selectedHora}
                onValueChange={(v) => setValue("hora", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar horário" />
                </SelectTrigger>
                <SelectContent>
                  {slots.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : selectedDate ? (
              <p className="text-sm text-muted-foreground py-2">
                Nenhum horário disponível nesta data.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                Selecione uma data para ver os horários.
              </p>
            )}
            {errors.hora && <p className="text-xs text-destructive">{errors.hora.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Reagendando...
                </>
              ) : (
                "Confirmar Reagendamento"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
