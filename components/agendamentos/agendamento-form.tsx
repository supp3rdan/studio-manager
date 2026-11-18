"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, CalendarIcon, Clock, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createAgendamento, updateAgendamento, getConflitosAgenda, avisarHorarioLiberado,
} from "@/lib/queries/agendamentos";
import { getClientes } from "@/lib/queries/clientes";
import { getServicos } from "@/lib/queries/servicos";
import { cn, getManausDateString, formatTime, toManausISO } from "@/lib/utils";
import { PaymentSelector } from "@/components/ui/payment-selector";
import type { Agendamento, Cliente, ConflitoAgenda, Servico } from "@/types/database";

const schema = z.object({
  cliente_id: z.string().min(1, "Selecione um cliente"),
  servico_id: z.string().min(1, "Selecione um serviço"),
  // We store the date as YYYY-MM-DD string internally
  data: z.string().min(1, "Informe a data"),
  // Optional HH:MM string
  hora: z.string().optional().nullable(),
  valor_final: z.number().min(0, "Valor deve ser positivo"),
  forma_pagamento: z.string().nullable().optional(),
  status: z.enum(["Agendado", "Confirmado", "Concluído", "Cancelado", "Não Compareceu"]),
  local: z.enum(["Studio", "Domicílio"]),
  observacoes: z.string().optional().nullable(),
});

type FormData = z.infer<typeof schema>;

type Payload = Omit<Agendamento, "id" | "user_id" | "criado_em" | "atualizado_em" | "clientes" | "servicos">;

const STATUS_ATIVOS = ["Agendado", "Confirmado"];

interface AgendamentoFormProps {
  open: boolean;
  onClose: () => void;
  agendamento?: Agendamento | null;
}

/** Convert ISO timestamp to { data: "YYYY-MM-DD", hora: "HH:MM" } no fuso de Manaus */
function splitDataHora(iso: string): { data: string; hora: string } {
  return {
    data: getManausDateString(iso),
    hora: formatTime(iso),
  };
}

/** Build ISO string com offset de Manaus (-04:00) */
function buildISOString(data: string, hora?: string | null): string {
  return toManausISO(data, hora);
}

export function AgendamentoForm({ open, onClose, agendamento }: AgendamentoFormProps) {
  const isEditing = !!agendamento;
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [conflitos, setConflitos] = useState<ConflitoAgenda[]>([]);
  const [payloadPendente, setPayloadPendente] = useState<Payload | null>(null);
  const [salvandoForcado, setSalvandoForcado] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      cliente_id: "",
      servico_id: "",
      data: "",
      hora: "",
      valor_final: 0,
      forma_pagamento: null,
      status: "Agendado",
      local: "Studio",
      observacoes: "",
    },
  });

  // Load reference data
  useEffect(() => {
    if (open) {
      getClientes().then(setClientes).catch(() => {});
      getServicos().then(setServicos).catch(() => {});
    }
  }, [open]);

  // Populate form on edit
  useEffect(() => {
    if (open) {
      if (agendamento?.data_hora) {
        const { data, hora } = splitDataHora(agendamento.data_hora);
        reset({
          cliente_id: agendamento.cliente_id ?? "",
          servico_id: agendamento.servico_id ?? "",
          data,
          hora,
          valor_final: agendamento.valor_final ?? 0,
          forma_pagamento: agendamento.forma_pagamento ?? null,
          status: agendamento.status ?? "Agendado",
          local: agendamento.local ?? "Studio",
          observacoes: agendamento.observacoes ?? "",
        });
      } else {
        reset({
          cliente_id: "",
          servico_id: "",
          data: "",
          hora: "",
          valor_final: 0,
          forma_pagamento: null,
          status: "Agendado",
          local: "Studio",
          observacoes: "",
        });
      }
    }
  }, [open, agendamento, reset]);

  // RN01 — Auto-fill valor_final when service is selected
  const servicoId = watch("servico_id");
  useEffect(() => {
    if (servicoId) {
      const servico = servicos.find((s) => s.id === servicoId);
      if (servico) setValue("valor_final", servico.preco_base);
    }
  }, [servicoId, servicos, setValue]);

  const watchedData = watch("data");

  /** Grava e avisa a lista de espera se um horário antigo foi liberado. */
  const salvar = async (payload: Payload) => {
    if (isEditing && agendamento) {
      await updateAgendamento(agendamento.id, payload);
      const mudouHorario = payload.data_hora !== agendamento.data_hora;
      const liberou =
        STATUS_ATIVOS.includes(agendamento.status) &&
        (mudouHorario || !STATUS_ATIVOS.includes(payload.status));
      if (liberou) avisarHorarioLiberado(agendamento.data_hora);
      toast.success("Agendamento atualizado ✓");
    } else {
      await createAgendamento(payload);
      toast.success("Agendamento criado com sucesso ✓");
    }
    onClose();
  };

  const onSubmit = async (data: FormData) => {
    const payload: Payload = {
      cliente_id: data.cliente_id,
      servico_id: data.servico_id,
      data_hora: buildISOString(data.data, data.hora),
      valor_final: data.valor_final,
      forma_pagamento: data.forma_pagamento ?? null,
      status: data.status,
      local: data.local,
      observacoes: data.observacoes ?? null,
    };

    try {
      // Checa conflito só quando há horário definido e o agendamento está ativo
      if (data.hora && STATUS_ATIVOS.includes(data.status)) {
        const duracao = servicos.find((s) => s.id === data.servico_id)?.duracao_minutos ?? 30;
        try {
          const encontrados = await getConflitosAgenda(payload.data_hora, duracao, agendamento?.id);
          if (encontrados.length > 0) {
            setConflitos(encontrados);
            setPayloadPendente(payload);
            return;
          }
        } catch (err) {
          console.warn("[conflitos_agenda] checagem indisponível:", err);
        }
      }
      await salvar(payload);
    } catch (err: any) {
      toast.error("Erro ao salvar agendamento", { description: err?.message });
    }
  };

  const encaixarMesmoAssim = async () => {
    if (!payloadPendente) return;
    setSalvandoForcado(true);
    try {
      await salvar(payloadPendente);
    } catch (err: any) {
      toast.error("Erro ao salvar agendamento", { description: err?.message });
    } finally {
      setSalvandoForcado(false);
      setConflitos([]);
      setPayloadPendente(null);
    }
  };

  /** Displayed date label */
  const displayDate = watchedData
    ? format(new Date(watchedData + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : "Selecionar data...";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Agendamento" : "Novo Agendamento"}
          </DialogTitle>
          <DialogDescription>Preencha os dados do agendamento.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">

          {/* ── Data (calendar picker) + Hora (optional) ── */}
          <div className="grid grid-cols-2 gap-3">
            {/* Data */}
            <div className="space-y-1.5">
              <Label>Data *</Label>
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
                          "hover:border-[#C9A84C]/40 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 transition-colors",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="w-4 h-4 text-[#C9A84C] shrink-0" />
                        <span className="truncate">
                          {field.value
                            ? format(new Date(field.value + "T12:00:00"), "dd/MM/yyyy")
                            : "dd/mm/aaaa"}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="p-0">
                      <Calendar
                        mode="single"
                        selected={field.value ? new Date(field.value + "T12:00:00") : undefined}
                        onSelect={(date) => {
                          if (date) {
                            field.onChange(format(date, "yyyy-MM-dd"));
                          } else {
                            field.onChange("");
                          }
                          setCalendarOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {errors.data && (
                <p className="text-xs text-destructive">{errors.data.message}</p>
              )}
            </div>

            {/* Hora (opcional) */}
            <div className="space-y-1.5">
              <Label htmlFor="hora" className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Hora
                <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="hora"
                type="time"
                className="bg-background"
                {...register("hora")}
              />
            </div>
          </div>

          {/* Resumo da data selecionada */}
          {watchedData && (
            <p className="text-xs text-muted-foreground -mt-2 px-0.5">
              📅 {displayDate}
            </p>
          )}

          {/* Cliente */}
          <div className="space-y-1.5">
            <Label>Cliente *</Label>
            <Controller
              name="cliente_id"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.cliente_id && (
              <p className="text-xs text-destructive">{errors.cliente_id.message}</p>
            )}
          </div>

          {/* Serviço */}
          <div className="space-y-1.5">
            <Label>Serviço *</Label>
            <Controller
              name="servico_id"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar serviço..." />
                  </SelectTrigger>
                  <SelectContent>
                    {servicos.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.categoria} — {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.servico_id && (
              <p className="text-xs text-destructive">{errors.servico_id.message}</p>
            )}
          </div>

          {/* Valor Final */}
          <div className="space-y-1.5">
            <Label htmlFor="valor_final">
              Valor Final (R\$){" "}
              <span className="text-xs text-muted-foreground font-normal">
                — preenchido automaticamente, editável
              </span>
            </Label>
            <Input
              id="valor_final"
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              {...register("valor_final", { valueAsNumber: true })}
            />
            {errors.valor_final && (
              <p className="text-xs text-destructive">{errors.valor_final.message}</p>
            )}
          </div>

          {/* Forma de Pagamento (suporte a pagamento misto) */}
          <div className="space-y-1.5">
            <Label>Forma de Pagamento</Label>
            <Controller
              name="forma_pagamento"
              control={control}
              render={({ field }) => (
                <PaymentSelector
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          {/* Status + Local */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status *</Label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Agendado">Agendado</SelectItem>
                      <SelectItem value="Confirmado">Confirmado</SelectItem>
                      <SelectItem value="Concluído">Concluído</SelectItem>
                      <SelectItem value="Cancelado">Cancelado</SelectItem>
                      <SelectItem value="Não Compareceu">Não Compareceu</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Local *</Label>
              <Controller
                name="local"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Studio">Studio</SelectItem>
                      <SelectItem value="Domicílio">Domicílio</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              placeholder="Notas adicionais sobre o atendimento..."
              rows={3}
              {...register("observacoes")}
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</>
              ) : isEditing ? "Salvar Alterações" : "Criar Agendamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <AlertDialog
        open={conflitos.length > 0}
        onOpenChange={(o) => {
          if (!o) {
            setConflitos([]);
            setPayloadPendente(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Esse horário tem conflito
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <ul className="space-y-1.5">
                  {conflitos.map((c, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-border shrink-0">
                        {c.tipo === "agendamento" ? "Agendamento" : c.tipo === "bloqueio" ? "Bloqueio" : "Expediente"}
                      </span>
                      <span className="text-foreground">
                        {c.descricao}
                        {c.tipo === "agendamento" && (
                          <span className="text-muted-foreground"> · {formatTime(c.inicio)}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <p>Quer encaixar mesmo assim?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvandoForcado}>Escolher outro horário</AlertDialogCancel>
            <AlertDialogAction onClick={encaixarMesmoAssim} disabled={salvandoForcado}>
              {salvandoForcado ? <Loader2 className="w-4 h-4 animate-spin" /> : "Encaixar mesmo assim"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
