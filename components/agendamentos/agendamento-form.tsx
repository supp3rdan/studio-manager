"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { createAgendamento, updateAgendamento } from "@/lib/queries/agendamentos";
import { getClientes } from "@/lib/queries/clientes";
import { getServicos } from "@/lib/queries/servicos";
import type {
  Agendamento,
  Cliente,
  Servico,
} from "@/types/database";

const schema = z.object({
  cliente_id: z.string().min(1, "Selecione um cliente"),
  servico_id: z.string().min(1, "Selecione um serviço"),
  data_hora: z.string().min(1, "Informe a data e hora"),
  valor_final: z.number().min(0, "Valor deve ser positivo"),
  forma_pagamento: z
    .enum(["Pix", "Cartão Débito", "Cartão Crédito", "Crédito Bemol", "Dinheiro"])
    .optional()
    .nullable(),
  status: z.enum(["Agendado", "Confirmado", "Concluído", "Cancelado", "Não Compareceu"]),
  local: z.enum(["Studio", "Domicílio"]),
  observacoes: z.string().optional().nullable(),
});

type FormData = z.infer<typeof schema>;

interface AgendamentoFormProps {
  open: boolean;
  onClose: () => void;
  agendamento?: Agendamento | null;
}

function toLocalDatetimeString(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AgendamentoForm({ open, onClose, agendamento }: AgendamentoFormProps) {
  const isEditing = !!agendamento;
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);

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
      data_hora: "",
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
      reset({
        cliente_id: agendamento?.cliente_id ?? "",
        servico_id: agendamento?.servico_id ?? "",
        data_hora: agendamento?.data_hora
          ? toLocalDatetimeString(agendamento.data_hora)
          : "",
        valor_final: agendamento?.valor_final ?? 0,
        forma_pagamento: agendamento?.forma_pagamento ?? null,
        status: agendamento?.status ?? "Agendado",
        local: agendamento?.local ?? "Studio",
        observacoes: agendamento?.observacoes ?? "",
      });
    }
  }, [open, agendamento, reset]);

  // RN01 — Auto-fill valor_final when service is selected
  const servicoId = watch("servico_id");
  useEffect(() => {
    if (servicoId) {
      const servico = servicos.find((s) => s.id === servicoId);
      if (servico) {
        setValue("valor_final", servico.preco_base);
      }
    }
  }, [servicoId, servicos, setValue]);

  const onSubmit = async (data: FormData) => {
    try {
      const payload = {
        cliente_id: data.cliente_id,
        servico_id: data.servico_id,
        data_hora: new Date(data.data_hora).toISOString(),
        valor_final: data.valor_final,
        forma_pagamento: data.forma_pagamento ?? null,
        status: data.status,
        local: data.local,
        observacoes: data.observacoes ?? null,
      };

      if (isEditing) {
        await updateAgendamento(agendamento.id, payload);
        toast.success("Agendamento atualizado ✓");
      } else {
        await createAgendamento(payload);
        toast.success("Agendamento criado com sucesso ✓");
      }
      onClose();
    } catch (err: any) {
      toast.error("Erro ao salvar agendamento", { description: err?.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Agendamento" : "Novo Agendamento"}
          </DialogTitle>
          <DialogDescription>
            Preencha os dados do agendamento.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Data e Hora */}
          <div className="space-y-1.5">
            <Label htmlFor="data_hora">Data e Hora *</Label>
            <Input
              id="data_hora"
              type="datetime-local"
              {...register("data_hora")}
            />
            {errors.data_hora && (
              <p className="text-xs text-destructive">{errors.data_hora.message}</p>
            )}
          </div>

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

          {/* Forma de Pagamento + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Forma de Pagamento</Label>
              <Controller
                name="forma_pagamento"
                control={control}
                render={({ field }) => (
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pagamento..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pix">Pix</SelectItem>
                      <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                      <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                      <SelectItem value="Crédito Bemol">Crédito Bemol</SelectItem>
                      <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

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
          </div>

          {/* Local */}
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
    </Dialog>
  );
}
