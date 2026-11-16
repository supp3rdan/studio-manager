"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Loader2,
  CalendarIcon,
  Clock,
  Sparkles,
  CheckCircle,
  Phone,
  Tag,
} from "lucide-react";
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
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, getWhatsAppUrl, cn } from "@/lib/utils";
import { getHorariosDisponiveis } from "@/lib/queries/indisponibilidades";
import { PaymentSelector } from "@/components/ui/payment-selector";
import type { Perfil, Servico } from "@/types/database";

const schema = z.object({
  data: z.string().min(1, "Selecione a data"),
  slot: z.string().min(1, "Selecione um horário disponível"),
  local: z.enum(["Studio", "Domicílio"]),
  forma_pagamento: z.string().optional().nullable(),
  cliente_nome: z.string().min(2, "Informe seu nome"),
  cliente_whatsapp: z.string().min(10, "Informe seu WhatsApp com DDD"),
  cliente_email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  observacoes: z.string().optional().nullable(),
});

type FormData = z.infer<typeof schema>;

interface AgendamentoModalProps {
  open: boolean;
  onClose: () => void;
  servico: Servico | null;
  profissional: Perfil;
  onSuccess?: () => void;
}

export function AgendamentoModal({
  open,
  onClose,
  servico,
  profissional,
  onSuccess,
}: AgendamentoModalProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [agendamentoCriado, setAgendamentoCriado] = useState<any>(null);
  const [clienteUserId, setClienteUserId] = useState<string | null>(null);
  const [horarios, setHorarios] = useState<string[]>([]);
  const [loadingHorarios, setLoadingHorarios] = useState(false);

  const supabase = createClient();

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
      data: "",
      slot: "",
      local: "Studio",
      forma_pagamento: "Pix",
      cliente_nome: "",
      cliente_whatsapp: "",
      cliente_email: "",
      observacoes: "",
    },
  });

  // Pre-fill if current user is logged in
  useEffect(() => {
    if (open) {
      setIsSuccess(false);
      setAgendamentoCriado(null);
      setHorarios([]);

      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (user) {
          setClienteUserId(user.id);
          const { data: perfil } = await supabase
            .from("perfis")
            .select("nome, whatsapp, email")
            .eq("id", user.id)
            .maybeSingle();

          if (perfil) {
            setValue("cliente_nome", perfil.nome || "");
            setValue("cliente_whatsapp", perfil.whatsapp || "");
            setValue("cliente_email", perfil.email || user.email || "");
          } else {
            setValue("cliente_email", user.email || "");
          }
        }
      });
    }
  }, [open, supabase, setValue]);

  const watchedData = watch("data");
  const watchedSlot = watch("slot");

  // Load available time slots when date changes
  useEffect(() => {
    if (!watchedData || !profissional?.id) {
      setHorarios([]);
      setValue("slot", "");
      return;
    }

    setLoadingHorarios(true);
    setValue("slot", "");

    getHorariosDisponiveis(
      profissional.id,
      watchedData,
      servico?.duracao_minutos ?? 30
    )
      .then((slots) => {
        // Filter out past slots for today
        const now = new Date();
        const isToday = watchedData === format(now, "yyyy-MM-dd");
        const filtered = slots.filter((s) => {
          if (!isToday) return true;
          const horaStr = s.length === 5 ? s : format(new Date(s), "HH:mm");
          const [h, m] = horaStr.split(":").map(Number);
          const slotDateTime = new Date(
            `${watchedData}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`
          );
          return slotDateTime > now;
        });
        setHorarios(filtered);
      })
      .catch(() => setHorarios([]))
      .finally(() => setLoadingHorarios(false));
  }, [watchedData, profissional?.id, servico?.duracao_minutos, setValue]);

  const precoFinal = servico?.promocao_ativa && servico.preco_promocional != null
    ? servico.preco_promocional
    : servico?.preco_base ?? 0;

  const onSubmit = async (data: FormData) => {
    if (!servico) return;

    try {
      // Extrai horário "HH:mm" (seja slot formato direto "HH:mm" ou ISO)
      const horaStr = data.slot.length === 5 ? data.slot : format(new Date(data.slot), "HH:mm");
      const [hh, mm] = horaStr.split(":");
      const localDt = new Date(`${data.data}T${hh}:${mm}:00`);
      const dataHoraIso = localDt.toISOString();

      const response = await fetch("/api/agendamentos/publico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo_profissional: profissional.codigo_profissional,
          servico_id: servico.id,
          data_hora: dataHoraIso,
          local: data.local,
          forma_pagamento: data.forma_pagamento,
          cliente_nome: data.cliente_nome,
          cliente_whatsapp: data.cliente_whatsapp,
          cliente_email: data.cliente_email || null,
          cliente_user_id: clienteUserId,
          observacoes: data.observacoes || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Falha ao salvar agendamento");
      }

      setAgendamentoCriado(result.agendamento);
      setIsSuccess(true);
      toast.success("Agendamento confirmado com sucesso! ✨");
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao solicitar agendamento");
    }
  };

  const handleClose = () => {
    reset();
    setIsSuccess(false);
    setHorarios([]);
    onClose();
  };

  if (!servico) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        {isSuccess ? (
          // ── Sucesso ──
          <div className="py-6 text-center space-y-5 animate-in fade-in duration-200">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-emerald-400" />
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-foreground">
                Agendamento Confirmado! ✨
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Seu horário em{" "}
                <strong className="text-foreground">
                  {profissional.nome_studio || profissional.nome}
                </strong>{" "}
                foi registrado.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-surface border border-border text-left space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Procedimento:</span>
                <span className="font-semibold text-[#C9A84C]">{servico.nome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Data e Horário:</span>
                <span className="font-medium text-foreground">
                  {watchedData
                    ? format(new Date(watchedData + "T12:00:00"), "dd/MM/yyyy")
                    : ""}
                  {watchedSlot
                    ? ` às ${
                        watchedSlot.length === 5
                          ? watchedSlot
                          : format(new Date(watchedSlot), "HH:mm")
                      }`
                    : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor:</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(precoFinal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Local:</span>
                <span className="text-foreground">{watch("local")}</span>
              </div>
            </div>

            {profissional.whatsapp && (
              <a
                href={getWhatsAppUrl(profissional.whatsapp) ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-semibold text-sm bg-emerald-500 hover:bg-emerald-600 text-black transition-colors"
              >
                <Phone className="w-4 h-4" />
                Falar com o Studio no WhatsApp
              </a>
            )}

            <Button variant="outline" onClick={handleClose} className="w-full">
              Concluir
            </Button>
          </div>
        ) : (
          // ── Formulário ──
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/25 text-[#C9A84C]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <DialogTitle>Agendar Horário</DialogTitle>
                  <DialogDescription className="text-xs">
                    {profissional.nome_studio || profissional.nome} · Código #{profissional.codigo_profissional}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Resumo do serviço */}
            <div className="p-3 rounded-xl bg-background border border-border flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {servico.categoria}
                </span>
                <p className="text-sm font-semibold text-foreground">{servico.nome}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  {servico.duracao_minutos ?? 30} min
                </p>
              </div>
              <div className="text-right">
                {servico.promocao_ativa && servico.preco_promocional != null ? (
                  <>
                    <p className="text-xs text-muted-foreground line-through">
                      {formatCurrency(servico.preco_base)}
                    </p>
                    <p className="text-base font-bold text-[#C9A84C]">
                      {formatCurrency(servico.preco_promocional)}
                    </p>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-400 bg-red-400/10 border border-red-400/20 px-1.5 py-0.5 rounded-full">
                      <Tag className="w-3 h-3" />
                      Promoção
                    </span>
                  </>
                ) : (
                  <p className="text-base font-bold text-[#C9A84C]">
                    {formatCurrency(servico.preco_base)}
                  </p>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                              ? format(new Date(field.value + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
                              : "Selecionar data"}
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
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                />
                {errors.data && <p className="text-xs text-destructive">{errors.data.message}</p>}
              </div>

              {/* Horários disponíveis */}
              {watchedData && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    Horário disponível *
                  </Label>
                  {loadingHorarios ? (
                    <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-xs">Verificando disponibilidade...</span>
                    </div>
                  ) : horarios.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                      Nenhum horário disponível nesta data. Escolha outra data.
                    </div>
                  ) : (
                    <Controller
                      name="slot"
                      control={control}
                      render={({ field }) => (
                        <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                          {horarios.map((h) => {
                            const label =
                              h.length === 5
                                ? h
                                : format(new Date(h), "HH:mm");
                            const isSelected = field.value === h;
                            return (
                              <button
                                key={h}
                                type="button"
                                onClick={() => field.onChange(h)}
                                className={cn(
                                  "py-2 px-1 rounded-lg border text-xs font-medium transition-all",
                                  isSelected
                                    ? "border-[#C9A84C] bg-[#C9A84C] text-[#0A0A0A] shadow-md shadow-[#C9A84C]/20"
                                    : "border-border bg-background text-foreground hover:border-[#C9A84C]/40 hover:bg-[#C9A84C]/5"
                                )}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    />
                  )}
                  {errors.slot && <p className="text-xs text-destructive">{errors.slot.message}</p>}
                </div>
              )}

              {/* Local de Atendimento */}
              <div className="space-y-1.5">
                <Label>Local *</Label>
                <Controller
                  name="local"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Studio">No Studio</SelectItem>
                        <SelectItem value="Domicílio">A Domicílio</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Forma de Pagamento (suporte a pagamento misto) */}
              <div className="space-y-1.5">
                <Label>Forma de Pagamento (escolha uma ou mais)</Label>
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

              {/* Dados do cliente */}
              <div className="pt-2 border-t border-border space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Seus Dados de Contato
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="cliente_nome">Seu Nome Completo *</Label>
                  <Input
                    id="cliente_nome"
                    placeholder="Como podemos te chamar?"
                    className="bg-background"
                    {...register("cliente_nome")}
                  />
                  {errors.cliente_nome && (
                    <p className="text-xs text-destructive">{errors.cliente_nome.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cliente_whatsapp">WhatsApp *</Label>
                    <Input
                      id="cliente_whatsapp"
                      type="tel"
                      placeholder="(99) 99999-9999"
                      className="bg-background"
                      {...register("cliente_whatsapp")}
                    />
                    {errors.cliente_whatsapp && (
                      <p className="text-xs text-destructive">{errors.cliente_whatsapp.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cliente_email">
                      E-mail{" "}
                      <span className="text-xs text-muted-foreground font-normal">(confirmação)</span>
                    </Label>
                    <Input
                      id="cliente_email"
                      type="email"
                      placeholder="seu@email.com"
                      className="bg-background"
                      {...register("cliente_email")}
                    />
                    {errors.cliente_email && (
                      <p className="text-xs text-destructive">{errors.cliente_email.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="observacoes">Observações (opcional)</Label>
                  <Textarea
                    id="observacoes"
                    placeholder="Preferências, alergias ou detalhes..."
                    rows={2}
                    className="bg-background"
                    {...register("observacoes")}
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting || !watchedSlot}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Agendando...
                    </>
                  ) : (
                    "Confirmar Agendamento"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
