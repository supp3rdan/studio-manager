"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ServicoForm } from "@/components/servicos/servico-form";
import { getServicos, deleteServico } from "@/lib/queries/servicos";
import { formatCurrency, getCategoriaColor, cn } from "@/lib/utils";
import type { Servico, CategoriaServico } from "@/types/database";

const categorias: CategoriaServico[] = ["Cílios", "Sobrancelhas", "Depilação"];

export default function ServicosPage() {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingServico, setEditingServico] = useState<Servico | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getServicos();
      setServicos(data);
    } catch {
      toast.error("Erro ao carregar serviços");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    try {
      await deleteServico(id);
      toast.success("Serviço removido");
      load();
    } catch {
      toast.error("Erro ao remover serviço");
    }
  };

  const handleEdit = (servico: Servico) => {
    setEditingServico(servico);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingServico(null);
    load();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Serviços</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Catálogo de procedimentos e valores
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          Novo Serviço
        </Button>
      </div>

      {/* Categories */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-surface border border-border animate-pulse" />
          ))}
        </div>
      ) : (
        categorias.map((categoria) => {
          const items = servicos.filter((s) => s.categoria === categoria);
          if (items.length === 0 && !isLoading) return null;

          return (
            <div key={categoria} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs font-semibold px-2.5 py-1 rounded-full border",
                  getCategoriaColor(categoria)
                )}>
                  {categoria}
                </span>
                <span className="text-xs text-muted-foreground">
                  {items.length} serviço{items.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((servico) => (
                  <div
                    key={servico.id}
                    className="group relative bg-surface border border-border rounded-xl p-4 hover:border-[#C9A84C]/30 transition-colors"
                  >
                    {/* Promo badge */}
                    {servico.tipo === "Promoção" && (
                      <div className="absolute top-3 right-3">
                        <span className="flex items-center gap-1 text-xs font-semibold text-[#C9A84C] bg-[#C9A84C]/10 border border-[#C9A84C]/20 px-2 py-0.5 rounded-full">
                          <Star className="w-3 h-3" />
                          Promo
                        </span>
                      </div>
                    )}

                    <p className="font-medium text-foreground text-sm pr-16 leading-snug">
                      {servico.nome}
                    </p>
                    <p className="text-xl font-bold text-[#C9A84C] mt-2">
                      {formatCurrency(servico.preco_base)}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(servico)}
                        className="h-7 px-2 text-xs"
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Editar
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive">
                            <Trash2 className="w-3 h-3 mr-1" />
                            Remover
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover serviço?</AlertDialogTitle>
                            <AlertDialogDescription>
                              O serviço <strong className="text-foreground">{servico.nome}</strong> será
                              permanentemente removido do catálogo.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(servico.id)}>
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {!isLoading && servicos.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum serviço cadastrado ainda.</p>
          <p className="text-sm mt-1">Comece adicionando os procedimentos do seu estúdio.</p>
        </div>
      )}

      <ServicoForm
        open={formOpen}
        onClose={handleFormClose}
        servico={editingServico}
      />
    </div>
  );
}
