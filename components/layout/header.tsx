"use client";

import { usePathname, useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import { LogOut, User as UserIcon, Menu } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/clientes": "Clientes",
  "/servicos": "Serviços",
  "/agendamentos": "Agendamentos",
};

interface HeaderProps {
  user: User;
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const pageTitle =
    Object.entries(routeLabels).find(([path]) =>
      pathname.startsWith(path)
    )?.[1] ?? "Studio Manager";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="flex items-center justify-between px-4 md:px-6 h-16 border-b border-border bg-surface shrink-0">
      <div className="flex items-center gap-4">
        <button className="md:hidden p-2 rounded-lg hover:bg-white/5 transition-colors">
          <Menu className="w-5 h-5 text-muted-foreground" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">{pageTitle}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background border border-border">
          <div className="w-6 h-6 rounded-full bg-[#C9A84C]/20 flex items-center justify-center">
            <UserIcon className="w-3.5 h-3.5 text-[#C9A84C]" />
          </div>
          <span className="text-xs text-muted-foreground max-w-[140px] truncate">
            {user.email}
          </span>
        </div>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}
