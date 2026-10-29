"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { createCliente, updateCliente } from "@/lib/queries/clientes";
import type { Cliente } from "@/types/database";

const schema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  whatsapp: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ClienteFormProps {
  open: boolean;
  onClose: () => void;
  cliente?: Cliente | null;
}

export function ClienteForm({ open, onClose, cliente }: ClienteFormProps) {
  const isEditing = !!cliente;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", whatsapp: "" },
  });

  useEffect(() => {
    if (open) {
      reset({
        nome: cliente?.nome ?? "",
        whatsapp: cliente?.whatsapp ?? "",
      });
    }
  }, [open, cliente, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      const payload = {
        nome: data.nome,
        whatsapp: data.whatsapp || null,
      };

      if (isEditing) {
        await updateCliente(cliente.id, payload);
        toast.success("Cliente atualizado com sucesso ✓");
      } else {
        await createCliente(payload);
        toast.success("Cliente cadastrado com sucesso ✓");
      }
      onClose();
    } catch (err: any) {
      toast.error("Erro ao salvar cliente", {
        description: err?.message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Cliente" : "Novo Cliente"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize os dados do cliente."
              : "Preencha os dados para cadastrar um novo cliente."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              placeholder="Nome completo"
              {...register("nome")}
            />
            {errors.nome && (
              <p className="text-xs text-destructive">{errors.nome.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input
              id="whatsapp"
              placeholder="(92) 99999-9999"
              {...register("whatsapp")}
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : isEditing ? (
                "Salvar Alterações"
              ) : (
                "Cadastrar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
