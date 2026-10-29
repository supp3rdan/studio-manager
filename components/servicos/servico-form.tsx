"use client";

import { useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createServico, updateServico } from "@/lib/queries/servicos";
import type { Servico, CategoriaServico, TipoServico } from "@/types/database";

const schema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  categoria: z.enum(["Cílios", "Sobrancelhas", "Depilação"] as const),
  preco_base: z.number().min(0, "Preço deve ser positivo"),
  tipo: z.enum(["Tabela Padrão", "Promoção"] as const),
  ativo: z.boolean(),
});

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
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: "",
      categoria: "Cílios",
      preco_base: 0,
      tipo: "Tabela Padrão",
      ativo: true,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        nome: servico?.nome ?? "",
        categoria: servico?.categoria ?? "Cílios",
        preco_base: servico?.preco_base ?? 0,
        tipo: servico?.tipo ?? "Tabela Padrão",
        ativo: servico?.ativo ?? true,
      });
    }
  }, [open, servico, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      if (isEditing) {
        await updateServico(servico.id, data);
        toast.success("Serviço atualizado ✓");
      } else {
        await createServico(data);
        toast.success("Serviço cadastrado ✓");
      }
      onClose();
    } catch (err: any) {
      toast.error("Erro ao salvar serviço", { description: err?.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Serviço" : "Novo Serviço"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Atualize os dados do serviço." : "Preencha os dados do novo procedimento."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome do Serviço *</Label>
            <Input id="nome" placeholder="Ex: Volume Russo" {...register("nome")} />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
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

            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Controller
                name="tipo"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Tabela Padrão">Tabela Padrão</SelectItem>
                      <SelectItem value="Promoção">Promoção</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="preco_base">Preço Base (R\$) *</Label>
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
