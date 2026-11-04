"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
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
import { Loader2, Copy, Check, Sparkles } from "lucide-react";
import { updatePerfilAtual } from "@/lib/queries/perfis";
import type { Perfil } from "@/types/database";

const schema = z.object({
  nome: z.string().min(2, "Informe seu nome"),
  nome_studio: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
});

type FormData = z.infer<typeof schema>;

interface PerfilModalProps {
  open: boolean;
  onClose: () => void;
  perfil: Perfil | null;
  onUpdated: (updated: Perfil) => void;
}

export function PerfilModal({
  open,
  onClose,
  perfil,
  onUpdated,
}: PerfilModalProps) {
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: {
      nome: perfil?.nome ?? "",
      nome_studio: perfil?.nome_studio ?? "",
      whatsapp: perfil?.whatsapp ?? "",
    },
  });

  const handleCopyLink = () => {
    if (!perfil?.codigo_profissional) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/p/${perfil.codigo_profissional}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link público copiado com sucesso!", {
      description: url,
    });
    setTimeout(() => setCopied(false), 2500);
  };

  const onSubmit = async (data: FormData) => {
    try {
      const updated = await updatePerfilAtual({
        nome: data.nome.trim(),
        nome_studio: data.nome_studio?.trim() || null,
        whatsapp: data.whatsapp ? data.whatsapp.replace(/\D/g, "") : null,
      });
      toast.success("Perfil atualizado com sucesso!");
      onUpdated(updated);
      onClose();
    } catch {
      toast.error("Erro ao atualizar perfil");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#C9A84C]" />
            Configurações do Perfil
          </DialogTitle>
          <DialogDescription>
            Atualize as informações do seu estúdio e dados de contato.
          </DialogDescription>
        </DialogHeader>

        {perfil?.codigo_profissional && (
          <div className="p-4 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/25 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-[#C9A84C] uppercase tracking-wider">
                  Seu Código de Agendamento
                </span>
                <p className="text-2xl font-black text-foreground tracking-widest mt-0.5">
                  #{perfil.codigo_profissional}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="gap-1.5 border-[#C9A84C]/40 hover:bg-[#C9A84C]/20"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copiar Link
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Envie esse código ou o link direto para suas clientes agendarem horários com você.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Seu Nome *</Label>
            <Input id="nome" {...register("nome")} />
            {errors.nome && (
              <p className="text-xs text-destructive">{errors.nome.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nome_studio">Nome do Studio</Label>
            <Input
              id="nome_studio"
              placeholder="Ex: Studio Elegance"
              {...register("nome_studio")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="whatsapp">WhatsApp de Contato</Label>
            <Input
              id="whatsapp"
              placeholder="(99) 99999-9999"
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
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

