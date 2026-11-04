"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Phone,
  CheckCircle2,
  Calendar,
  Search,
  Tag,
  ArrowRight,
  Loader2,
  Clock,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getProfissionalByCodigo,
  getServicosDoProfissional,
} from "@/lib/queries/perfis";
import { createClient } from "@/lib/supabase/client";
import {
  formatCurrency,
  formatWhatsApp,
  getWhatsAppUrl,
  getCategoriaColor,
  cn,
} from "@/lib/utils";
import { AgendamentoModal } from "@/components/publico/agendamento-modal";
import type { Perfil, Servico, CategoriaServico } from "@/types/database";

const CATEGORIAS: ("Todos" | CategoriaServico)[] = [
  "Todos",
  "Cílios",
  "Sobrancelhas",
  "Depilação",
];

export default function PaginaPublicaProfissional() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code as string) || "";

  const [profissional, setProfissional] = useState<Perfil | null>(null);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState<"Todos" | CategoriaServico>("Todos");
  const [selectedServico, setSelectedServico] = useState<Servico | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
    });
  }, [supabase]);

  useEffect(() => {
    if (!code) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    getProfissionalByCodigo(code)
      .then(async (prof) => {
        if (!prof) {
          setProfissional(null);
          setIsLoading(false);
          return;
        }
        setProfissional(prof);
        const servs = await getServicosDoProfissional(prof.id);
        setServicos(servs);
      })
      .catch((err) => {
        console.error(err);
        setProfissional(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [code]);

  const servicosFiltrados = servicos.filter(
    (s) => categoriaAtiva === "Todos" || s.categoria === categoriaAtiva
  );

  const handleOpenAgendamento = (s: Servico) => {
    setSelectedServico(s);
    setModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">
          Carregando informações do profissional...
        </p>
      </div>
    );
  }

  if (!profissional) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
          <Search className="w-8 h-8 text-amber-400" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">
          Profissional não encontrado
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          Não localizamos nenhum profissional com o código{" "}
          <strong className="text-foreground">#{code}</strong>. Verifique o número digitado e tente novamente.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Link
            href="/buscar"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-[#C9A84C] hover:bg-[#E8C97A] text-[#0A0A0A] transition-all"
          >
            <Search className="w-4 h-4" />
            Digitar outro código
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl font-semibold text-sm border border-border text-foreground hover:bg-white/5 transition-all"
          >
            Página Inicial
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top Bar ── */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#C9A84C]/15 border border-[#C9A84C]/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#C9A84C]" />
            </div>
            <span className="font-bold text-sm text-foreground">
              Studio Manager
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {currentUser ? (
              <Link
                href="/cliente/agendamentos"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#C9A84C]/10 border border-[#C9A84C]/25 text-[#C9A84C] hover:bg-[#C9A84C]/20 transition-all"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Meus Agendamentos</span>
              </Link>
            ) : (
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
              >
                Entrar
              </Link>
            )}
            <Link
              href="/buscar"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
              title="Buscar outro código"
            >
              <Search className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Profile Banner */}
        <div className="p-6 sm:p-8 rounded-3xl bg-surface border border-border shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#C9A84C]/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-start sm:items-center gap-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#C9A84C]/15 border border-[#C9A84C]/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-[#C9A84C]" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                    {profissional.nome_studio || profissional.nome}
                  </h1>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    Verificado
                  </span>
                </div>

                {profissional.nome_studio && (
                  <p className="text-sm text-muted-foreground">
                    Profissional: <span className="text-foreground">{profissional.nome}</span>
                  </p>
                )}

                <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-mono font-bold text-[#C9A84C] bg-[#C9A84C]/10 px-2.5 py-0.5 rounded-md border border-[#C9A84C]/20">
                    #{profissional.codigo_profissional}
                  </span>
                  <span>{servicos.length} procedimentos cadastrados</span>
                </div>
              </div>
            </div>

            {/* Direct WhatsApp Contact Button */}
            {profissional.whatsapp && (
              <a
                href={getWhatsAppUrl(profissional.whatsapp) ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-xs sm:text-sm bg-emerald-500 hover:bg-emerald-600 text-black transition-all shadow-lg shadow-emerald-500/20"
              >
                <Phone className="w-4 h-4" />
                Conversar no WhatsApp
              </a>
            )}
          </div>
        </div>

        {/* Categories Tab Navigation */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">
              Catálogo de Procedimentos
            </h2>
            <span className="text-xs text-muted-foreground">
              {servicosFiltrados.length} disponível{servicosFiltrados.length !== 1 ? "is" : ""}
            </span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {CATEGORIAS.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoriaAtiva(cat)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all duration-150 border",
                  categoriaAtiva === cat
                    ? "bg-[#C9A84C] text-[#0A0A0A] font-semibold border-[#C9A84C] shadow-md shadow-[#C9A84C]/20"
                    : "bg-surface border-border text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Service Cards Grid */}
          {servicosFiltrados.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-border bg-surface text-muted-foreground">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
              Nenhum procedimento encontrado nesta categoria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {servicosFiltrados.map((s) => (
                <Card
                  key={s.id}
                  className="bg-surface border-border hover:border-[#C9A84C]/40 transition-all flex flex-col justify-between"
                >
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                              getCategoriaColor(s.categoria)
                            )}
                          >
                            {s.categoria}
                          </span>
                          {s.tipo === "Promoção" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 text-red-400">
                              <Tag className="w-3 h-3" />
                              Promoção
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-base text-foreground">
                          {s.nome}
                        </h3>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-lg font-bold text-[#C9A84C]">
                          {formatCurrency(s.preco_base)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Agendamento online
                      </span>

                      <Button
                        size="sm"
                        onClick={() => handleOpenAgendamento(s)}
                        className="h-9 px-4 text-xs font-semibold gap-1.5 shadow-md shadow-[#C9A84C]/20"
                      >
                        Agendar Horário
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-surface/50 py-6 text-center text-xs text-muted-foreground mt-auto">
        <p>Studio Manager · Plataforma de Gestão e Agendamentos</p>
      </footer>

      {/* ── Modal de Agendamento ── */}
      <AgendamentoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        servico={selectedServico}
        profissional={profissional}
      />
    </div>
  );
}

