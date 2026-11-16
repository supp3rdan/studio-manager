"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Star,
  CalendarOff,
  Clock,
  Tag,
  ToggleLeft,
  ToggleRight,
  Repeat,
  X,
  Settings,
  Timer,
} from "lucide-react";
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
import { IndisponibilidadeModal } from "@/components/servicos/indisponibilidade-modal";
import {
  getServicos,
  deleteServico,
  togglePromocao,
  togglePromocaoTodos,
  updateDuracaoPadrao,
} from "@/lib/queries/servicos";
import {
  getIndisponibilidades,
  deleteIndisponibilidade,
} from "@/lib/queries/indisponibilidades";
import { formatCurrency, getCategoriaColor, cn } from "@/lib/utils";
import type { Servico, CategoriaServico, Indisponibilidade } from "@/types/database";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const categorias: CategoriaServico[] = ["Cílios", "Sobrancelhas", "Depilação"];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function ServicosPage() {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [indisponibilidades, setIndisponibilidades] = useState<Indisponibilidade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [bloqueioOpen, setBloqueioOpen] = useState(false);
  const [editingServico, setEditingServico] = useState<Servico | null>(null);
  const [duracaoPadrao, setDuracaoPadrao] = useState(30);
  const [editingDuracao, setEditingDuracao] = useState(false);
  const [duracaoInput, setDuracaoInput] = useState("30");
  const [activeTab, setActiveTab] = useState<"servicos" | "disponibilidade">("servicos");

  const load = useCallback(async () => {
    try {
      const [sData, iData] = await Promise.all([
        getServicos(),
        getIndisponibilidades(),
      ]);
      setServicos(sData);
      setIndisponibilidades(iData);
      if (sData.length > 0) {
        setDuracaoPadrao(sData[0].duracao_minutos ?? 30);
      }
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
      // Atualiza o estado localmente de imediato (sem esperar reload da rede)
      setServicos((prev) => prev.filter((s) => s.id !== id));
      toast.success("Serviço removido com sucesso");
      // Recarrega em background para garantir consistência
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

  const handleTogglePromocao = async (servico: Servico) => {
    try {
      await togglePromocao(servico.id, !servico.promocao_ativa);
      toast.success(
        servico.promocao_ativa ? "Promoção desativada" : "Promoção ativada ✨"
      );
      load();
    } catch (err: any) {
      toast.error("Erro ao alterar promoção", { description: err?.message });
    }
  };

  const handleTogglePromocaoTodos = async (ativar: boolean) => {
    try {
      await togglePromocaoTodos(ativar);
      toast.success(ativar ? "Promoções ativadas para todos ✨" : "Promoções desativadas");
      load();
    } catch (err: any) {
      toast.error("Erro", { description: err?.message });
    }
  };

  const handleSalvarDuracao = async () => {
    const valor = Number(duracaoInput);
    if (isNaN(valor) || valor < 5 || valor > 480) {
      toast.error("Duração inválida (5 a 480 minutos)");
      return;
    }
    try {
      await updateDuracaoPadrao(valor);
      setDuracaoPadrao(valor);
      setEditingDuracao(false);
      toast.success("Duração padrão atualizada para todos os serviços");
      load();
    } catch (err: any) {
      toast.error("Erro", { description: err?.message });
    }
  };

  const handleDeleteBloqueio = async (id: string) => {
    try {
      await deleteIndisponibilidade(id);
      toast.success("Bloqueio removido");
      load();
    } catch {
      toast.error("Erro ao remover bloqueio");
    }
  };

  const temPromocaoAtiva = servicos.some((s) => s.promocao_ativa);
  const temPrecoPromocional = servicos.some((s) => s.preco_promocional != null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Serviços</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Catálogo de procedimentos, disponibilidade e promoções
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setBloqueioOpen(true)}
            className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            <CalendarOff className="w-4 h-4" />
            Bloquear Horário
          </Button>
          <Button onClick={() => setFormOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Serviço
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface rounded-xl border border-border w-fit">
        {[
          { key: "servicos", label: "Serviços e Promoções" },
          { key: "disponibilidade", label: "Disponibilidade" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              activeTab === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Serviços ── */}
      {activeTab === "servicos" && (
        <>
          {/* Duração padrão global */}
          <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-surface">
            <div className="w-8 h-8 rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/20 flex items-center justify-center">
              <Timer className="w-4 h-4 text-[#C9A84C]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Duração padrão dos atendimentos</p>
              <p className="text-xs text-muted-foreground">
                Aplica a todos os serviços (você pode ajustar individualmente no formulário de cada serviço)
              </p>
            </div>
            {editingDuracao ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="480"
                  value={duracaoInput}
                  onChange={(e) => setDuracaoInput(e.target.value)}
                  className="w-20 px-2 py-1 rounded-md border border-border bg-background text-sm text-center"
                />
                <span className="text-xs text-muted-foreground">min</span>
                <Button size="sm" onClick={handleSalvarDuracao} className="h-7 px-3 text-xs">
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setEditingDuracao(false); setDuracaoInput(String(duracaoPadrao)); }}
                  className="h-7 px-2"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#C9A84C]">{duracaoPadrao} min</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setEditingDuracao(true); setDuracaoInput(String(duracaoPadrao)); }}
                  className="h-7 px-2"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Controle global de promoções */}
          {temPrecoPromocional && (
            <div className="flex items-center justify-between p-4 rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/5">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#C9A84C]" />
                <div>
                  <p className="text-sm font-medium text-foreground">Promoções</p>
                  <p className="text-xs text-muted-foreground">
                    {temPromocaoAtiva ? "Alguma promoção está ativa" : "Nenhuma promoção ativa"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {temPromocaoAtiva && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTogglePromocaoTodos(false)}
                    className="h-7 px-3 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                  >
                    Desativar todos
                  </Button>
                )}
                {!temPromocaoAtiva && (
                  <Button
                    size="sm"
                    onClick={() => handleTogglePromocaoTodos(true)}
                    className="h-7 px-3 text-xs"
                  >
                    <Star className="w-3.5 h-3.5" />
                    Ativar todos
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Grid de serviços */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-36 rounded-xl bg-surface border border-border animate-pulse" />
              ))}
            </div>
          ) : (
            categorias.map((categoria) => {
              const items = servicos.filter((s) => s.categoria === categoria);
              if (items.length === 0) return null;

              return (
                <div key={categoria} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border", getCategoriaColor(categoria))}>
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
                        {/* Badge de promoção */}
                        {servico.promocao_ativa && (
                          <div className="absolute top-3 right-3">
                            <span className="flex items-center gap-1 text-xs font-semibold text-[#C9A84C] bg-[#C9A84C]/10 border border-[#C9A84C]/20 px-2 py-0.5 rounded-full">
                              <Star className="w-3 h-3" />
                              Promo Ativa
                            </span>
                          </div>
                        )}
                        {servico.preco_promocional != null && !servico.promocao_ativa && (
                          <div className="absolute top-3 right-3">
                            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground bg-muted/10 border border-border px-2 py-0.5 rounded-full">
                              <Star className="w-3 h-3" />
                              Promo
                            </span>
                          </div>
                        )}

                        <p className="font-medium text-foreground text-sm pr-20 leading-snug">
                          {servico.nome}
                        </p>

                        {/* Preços */}
                        <div className="mt-2 space-y-0.5">
                          {servico.promocao_ativa && servico.preco_promocional != null ? (
                            <>
                              <p className="text-xs text-muted-foreground line-through">
                                {formatCurrency(servico.preco_base)}
                              </p>
                              <p className="text-xl font-bold text-[#C9A84C]">
                                {formatCurrency(servico.preco_promocional)}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-xl font-bold text-[#C9A84C]">
                                {formatCurrency(servico.preco_base)}
                              </p>
                              {servico.preco_promocional != null && (
                                <p className="text-xs text-muted-foreground">
                                  Promo: {formatCurrency(servico.preco_promocional)} (inativa)
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        {/* Duração */}
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {servico.duracao_minutos} min
                        </p>

                        {/* Actions */}
                        <div className="flex items-center gap-1 mt-3 flex-wrap">
                          {/* Toggle promoção */}
                          {servico.preco_promocional != null && (
                            <button
                              onClick={() => handleTogglePromocao(servico)}
                              title={servico.promocao_ativa ? "Desativar promoção" : "Ativar promoção"}
                              className={cn(
                                "h-7 px-2 rounded-md text-xs font-medium flex items-center gap-1 transition-colors",
                                servico.promocao_ativa
                                  ? "bg-[#C9A84C]/15 text-[#C9A84C] hover:bg-[#C9A84C]/25"
                                  : "bg-muted/20 text-muted-foreground hover:bg-[#C9A84C]/10 hover:text-[#C9A84C]"
                              )}
                            >
                              {servico.promocao_ativa ? (
                                <ToggleRight className="w-3.5 h-3.5" />
                              ) : (
                                <ToggleLeft className="w-3.5 h-3.5" />
                              )}
                              {servico.promocao_ativa ? "Desativar" : "Promo"}
                            </button>
                          )}
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
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              >
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
        </>
      )}

      {/* ── Tab: Disponibilidade ── */}
      {activeTab === "disponibilidade" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Bloqueios de Horário</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Datas ou horários em que você não estará disponível para novos agendamentos.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBloqueioOpen(true)}
              className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Bloqueio
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-surface border border-border animate-pulse" />
              ))}
            </div>
          ) : indisponibilidades.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
              <CalendarOff className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum bloqueio cadastrado.</p>
              <p className="text-xs mt-1">Seus clientes podem agendar qualquer horário entre 08h e 22h.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {indisponibilidades.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-surface"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      item.tipo === "dia_inteiro"
                        ? "bg-destructive/10 border border-destructive/20"
                        : "bg-orange-500/10 border border-orange-500/20"
                    )}>
                      {item.tipo === "dia_inteiro" ? (
                        <CalendarOff className="w-4 h-4 text-destructive" />
                      ) : (
                        <Clock className="w-4 h-4 text-orange-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {item.titulo || (item.tipo === "dia_inteiro" ? "Dia bloqueado" : "Horário bloqueado")}
                        </p>
                        {item.recorrente && (
                          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-blue-400 bg-blue-400/10 border border-blue-400/20 px-1.5 py-0.5 rounded-full">
                            <Repeat className="w-3 h-3" />
                            {DIAS_SEMANA[item.dia_semana ?? 0]}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.recorrente ? (
                          `Toda ${DIAS_SEMANA[item.dia_semana ?? 0]}`
                        ) : (
                          <>
                            {format(parseISO(item.data_inicio), "dd/MM/yyyy", { locale: ptBR })}
                            {item.tipo === "horario" && item.data_fim && (
                              ` · ${format(parseISO(item.data_inicio), "HH:mm")} – ${format(parseISO(item.data_fim), "HH:mm")}`
                            )}
                          </>
                        )}
                        {item.tipo === "horario" && item.recorrente && item.data_fim && (
                          ` · ${format(parseISO(item.data_inicio), "HH:mm")} – ${format(parseISO(item.data_fim), "HH:mm")}`
                        )}
                      </p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
                        <X className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover bloqueio?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Este horário voltará a ficar disponível para agendamentos.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteBloqueio(item.id)}>
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <ServicoForm open={formOpen} onClose={handleFormClose} servico={editingServico} />
      <IndisponibilidadeModal
        open={bloqueioOpen}
        onClose={() => { setBloqueioOpen(false); load(); }}
      />
    </div>
  );
}
