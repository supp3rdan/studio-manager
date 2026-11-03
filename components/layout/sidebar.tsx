"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Scissors,
  CalendarDays,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/servicos", label: "Serviços", icon: Scissors },
  { href: "/agendamentos", label: "Agendamentos", icon: CalendarDays },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();

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
            <p className="text-xs text-muted-foreground mt-0.5">Painel</p>
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
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

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
      <div className="px-6 py-4 border-t border-border">
        <p className="text-xs text-muted-foreground">v1.0.0</p>
      </div>
    </>
  );

  return (
    <>
      {/* ── Desktop sidebar ────────────────────────────────────── */}
      <aside className="hidden md:flex w-64 flex-col bg-surface border-r border-border shrink-0">
        <NavContent />
      </aside>

      {/* ── Mobile: backdrop overlay ───────────────────────────── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile: slide-in drawer ────────────────────────────── */}
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
