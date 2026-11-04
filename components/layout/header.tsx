"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import {
  LogOut,
  User as UserIcon,
  Menu,
  Copy,
  Check,
  Settings,
  Sparkles,
  Search,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getPerfilAtual } from "@/lib/queries/perfis";
import { PerfilModal } from "@/components/perfil/perfil-modal";
import type { Perfil } from "@/types/database";

const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/clientes": "Clientes",
  "/servicos": "Serviços",
  "/agendamentos": "Agendamentos",
  "/cliente/agendamentos": "Meus Agendamentos",
  "/buscar": "Buscar Profissional",
};

interface HeaderProps {
  user: User;
  onMenuClick?: () => void;
}

export function Header({ user, onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getPerfilAtual().then(setPerfil).catch(() => {});
  }, []);

  const pageTitle =
    Object.entries(routeLabels).find(([path]) =>
      pathname.startsWith(path)
    )?.[1] ?? (perfil?.nome_studio || "Studio Manager");

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    router.push("/login");
    router.refresh();
  };

  const handleCopyCode = () => {
    if (!perfil?.codigo_profissional) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/p/${perfil.codigo_profissional}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link de agendamento copiado! 🌟", {
      description: url,
    });
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 md:px-6 h-16 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3">
          {/* Hamburger — mobile only */}
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5 text-muted-foreground" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
              {pageTitle}
            </h1>
            {perfil?.nome_studio && (
              <p className="text-[11px] text-[#C9A84C] hidden sm:block">
                {perfil.nome_studio}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Professional 4-digit code badge + Copy Link button */}
          {perfil?.tipo_usuario === "profissional" &&
            perfil.codigo_profissional && (
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-background border border-border">
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/25 text-[#C9A84C]">
                  <Sparkles className="w-3.5 h-3.5 hidden sm:inline" />
                  <span className="text-xs font-mono font-bold tracking-wider">
                    #{perfil.codigo_profissional}
                  </span>
                </div>

                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-foreground hover:bg-white/5 transition-colors"
                  title="Copiar link direto para agendamento das clientes"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="hidden md:inline text-emerald-400">
                        Copiado!
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#C9A84C]" />
                      <span className="hidden md:inline">Copiar Link</span>
                    </>
                  )}
                </button>
              </div>
            )}

          {/* Client badge and shortcut */}
          {perfil?.tipo_usuario === "cliente" && (
            <Link
              href="/buscar"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#C9A84C]/10 border border-[#C9A84C]/25 text-[#C9A84C] hover:bg-[#C9A84C]/20 transition-all"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Buscar Profissional</span>
            </Link>
          )}

          {/* Profile pill button to open settings */}
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-background border border-border hover:border-[#C9A84C]/40 transition-colors text-left"
            title="Configurações do Perfil"
          >
            <div className="w-6 h-6 rounded-full bg-[#C9A84C]/20 flex items-center justify-center shrink-0">
              <UserIcon className="w-3.5 h-3.5 text-[#C9A84C]" />
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium text-foreground max-w-[120px] truncate leading-tight">
                {perfil?.nome || user.email?.split("@")[0]}
              </p>
              <p className="text-[10px] text-muted-foreground capitalize leading-none">
                {perfil?.tipo_usuario || "Conta"}
              </p>
            </div>
            <Settings className="w-3.5 h-3.5 text-muted-foreground hidden sm:block ml-0.5" />
          </button>

          {/* Logout */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            aria-label="Sair"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      {/* Profile modal */}
      <PerfilModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        perfil={perfil}
        onUpdated={(updated) => setPerfil(updated)}
      />
    </>
  );
}
