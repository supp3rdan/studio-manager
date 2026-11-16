"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Tag, Clock } from "lucide-react";
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
import { createServico, updateServico } from "@/lib/queries/servicos";
import type { Servico, CategoriaServico, TipoServico } from "@/types/database";

const schema = z
  .object({
    nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
    categoria: z.enum(["Cílios", "Sobrancelhas", "Depilação"] as const),
    preco_base: z.number().min(0, "Preço deve ser positivo"),
    preco_promocional: z.number().min(0).nullable().optional(),
    promocao_ativa: z.boolean(),
    duracao_minutos: z.number().min(5, "Mínimo de 5 minutos").max(480, "Máximo de 8 horas"),
    tipo: z.enum(["Tabela Padrão", "Promoção"] as const),
    ativo: z.boolean(),
  })
  .refine(
    (d) =>
      !d.promocao_ativa ||
      (d.preco_promocional !== null &&
        d.preco_promocional !== undefined &&
        d.preco_promocional >= 0),
    {
      message: "Informe o preço promocional para ativar a promoção",
      path: ["preco_promocional"],
    }
  );

type FormData = z.infer<typeof schema>;

interface ServicoFormProps {
  open: boolean;
  onClose: () => void;
  servico?: Servico | null;
}

export function ServicoForm({ open, onClose, servico }: ServicoFormProps) {
  const isEditing = !!servico;

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: "",
      categoria: "Cílios",
      preco_base: 0,
      preco_promocional: null,
      promocao_ativa: false,
      duracao_minutos: 30,
      tipo: "Tabela Padrão",
      ativo: true,
    },
  });

  const watchPromocaoAtiva = watch("promocao_ativa");

  useEffect(() => {
    if (open) {
      reset({
        nome: servico?.nome ?? "",
        categoria: servico?.categoria ?? "Cílios",
        preco_base: servico?.preco_base ?? 0,
        preco_promocional: servico?.preco_promocional ?? null,
        promocao_ativa: servico?.promocao_ativa ?? false,
        duracao_minutos: servico?.duracao_minutos ?? 30,
        tipo: servico?.tipo ?? "Tabela Padrão",
        ativo: servico?.ativo ?? true,
      });
    }
  }, [open, servico, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      const payload = {
        ...data,
        preco_promocional: data.preco_promocional ?? null,
        promocao_ativa: data.promocao_ativa && data.preco_promocional != null,
      };
      if (isEditing) {
        await updateServico(servico.id, payload);
        toast.success("Serviço atualizado ✓");
      } else {
        await createServico(payload);
        toast.success("Serviço cadastrado ✓");
      }
      onClose();
    } catch (err: any) {
      toast.error("Erro ao salvar serviço", { description: err?.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Serviço" : "Novo Serviço"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Atualize os dados do serviço." : "Preencha os dados do novo procedimento."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome do Serviço *</Label>
            <Input id="nome" placeholder="Ex: Volume Russo" {...register("nome")} />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Categoria */}
            <div className="space-y-1.5">
              <Label>Categoria *</Label>
              <Controller
                name="categoria"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cílios">Cílios</SelectItem>
                      <SelectItem value="Sobrancelhas">Sobrancelhas</SelectItem>
                      <SelectItem value="Depilação">Depilação</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Duração */}
            <div className="space-y-1.5">
              <Label htmlFor="duracao_minutos" className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Duração (min) *
              </Label>
              <Input
                id="duracao_minutos"
                type="number"
                min="5"
                max="480"
                step="5"
                {...register("duracao_minutos", { valueAsNumber: true })}
              />
              {errors.duracao_minutos && (
                <p className="text-xs text-destructive">{errors.duracao_minutos.message}</p>
              )}
            </div>
          </div>

          {/* Preço base */}
          <div className="space-y-1.5">
            <Label htmlFor="preco_base">Preço Base (R$) *</Label>
            <Input
              id="preco_base"
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              {...register("preco_base", { valueAsNumber: true })}
            />
            {errors.preco_base && (
              <p className="text-xs text-destructive">{errors.preco_base.message}</p>
            )}
          </div>

          {/* Preço Promocional */}
          <div className="p-3 rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#C9A84C]" />
                <span className="text-sm font-medium text-foreground">Preço Promocional</span>
              </div>
              <Controller
                name="promocao_ativa"
                control={control}
                render={({ field }) => (
                  <button
                    type="button"
                    onClick={() => field.onChange(!field.value)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      field.value ? "bg-[#C9A84C]" : "bg-muted-foreground/30"
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

            <div className="space-y-1.5">
              <Label htmlFor="preco_promocional" className="text-xs text-muted-foreground">
                Valor promocional (R$)
              </Label>
              <Input
                id="preco_promocional"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                {...register("preco_promocional", {
                  setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
                })}
              />
              {errors.preco_promocional && (
                <p className="text-xs text-destructive">{errors.preco_promocional.message}</p>
              )}
            </div>

            {watchPromocaoAtiva && (
              <p className="text-xs text-[#C9A84C]">
                ✦ Promoção ativa — clientes verão o preço promocional ao agendar.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</>
              ) : isEditing ? "Salvar Alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
