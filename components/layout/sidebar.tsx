"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Scissors,
  CalendarDays,
  Sparkles,
  X,
  Search,
  CalendarCheck,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getPerfilAtual } from "@/lib/queries/perfis";
import type { Perfil } from "@/types/database";

const professionalNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/servicos", label: "Serviços", icon: Scissors },
  { href: "/agendamentos", label: "Agendamentos", icon: CalendarDays },
];

const clientNavItems = [
  { href: "/cliente/agendamentos", label: "Meus Agendamentos", icon: CalendarCheck },
  { href: "/buscar", label: "Buscar Profissional", icon: Search },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getPerfilAtual().then(setPerfil).catch(() => {});
  }, []);

  const isClient = perfil?.tipo_usuario === "cliente";
  const navItems = isClient ? clientNavItems : professionalNavItems;

  const handleCopyCode = () => {
    if (!perfil?.codigo_profissional) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/p/${perfil.codigo_profissional}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copiado!", { description: url });
    setTimeout(() => setCopied(false), 2500);
  };

  const NavContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/20">
            <Sparkles className="w-5 h-5 text-[#C9A84C]" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm leading-none">
              Studio Manager
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isClient ? "Portal do Cliente" : "Painel Profissional"}
            </p>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="md:hidden p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/15"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <item.icon
                className={cn(
                  "w-5 h-5 md:w-4 md:h-4 shrink-0",
                  isActive ? "text-[#C9A84C]" : "text-muted-foreground"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border space-y-3">
        {perfil?.tipo_usuario === "profissional" && perfil.codigo_profissional && (
          <div className="p-3 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/25 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-[#C9A84C]">
                Código
              </span>
              <span className="text-xs font-mono font-bold text-foreground">
                #{perfil.codigo_profissional}
              </span>
            </div>
            <button
              onClick={handleCopyCode}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-semibold bg-[#C9A84C] text-[#0A0A0A] hover:bg-[#E8C97A] transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copiar Link
                </>
              )}
            </button>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
          <span>Studio Manager</span>
          <span>v1.2.0</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-surface border-r border-border shrink-0">
        <NavContent />
      </aside>

      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-72 flex flex-col bg-surface border-r border-border transition-transform duration-300 ease-in-out md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <NavContent />
      </aside>
    </>
  );
}
