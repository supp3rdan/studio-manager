import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles, Search, ArrowRight, ShieldCheck, Heart, Scissors } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

interface HomePageProps {
  searchParams?: { code?: string };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  // If ?code=XXXX is passed in the URL, redirect to /p/XXXX
  if (searchParams?.code) {
    const cleanCode = searchParams.code.trim();
    if (cleanCode) {
      redirect(`/p/${cleanCode}`);
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is logged in, redirect according to role
  if (user) {
    const { data: perfil } = await supabase
      .from("perfis")
      .select("tipo_usuario")
      .eq("id", user.id)
      .maybeSingle();

    if (perfil?.tipo_usuario === "cliente") {
      redirect("/cliente/agendamentos");
    } else {
      redirect("/dashboard");
    }
  }

  // Public portal landing with 4-digit code input
  return (
    <div className="min-h-screen bg-background flex flex-col justify-between relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-[#C9A84C]/5 blur-[140px]" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 border-b border-border bg-surface/50 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#C9A84C]/15 border border-[#C9A84C]/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#C9A84C]" />
            </div>
            <span className="font-bold text-base text-foreground tracking-tight">
              Studio Manager
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="text-xs sm:text-sm font-semibold px-4 py-2 rounded-xl bg-[#C9A84C] hover:bg-[#E8C97A] text-[#0A0A0A] transition-all shadow-md shadow-[#C9A84C]/20"
            >
              Criar Conta
            </Link>
          </div>
        </div>
      </header>

      {/* Hero with Search by Code */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 py-12 sm:py-20 text-center space-y-8 my-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#C9A84C]/10 border border-[#C9A84C]/25 text-[#C9A84C] text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Portal de Agendamentos & Gestão</span>
        </div>

        <div className="space-y-4 max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-5xl font-black text-foreground tracking-tight leading-tight">
            Agende seu horário com seu{" "}
            <span className="text-[#C9A84C]">profissional de beleza</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            Seja para cílios, sobrancelhas ou estética — digite o código de 4 números fornecido pelo seu estúdio para visualizar procedimentos e marcar seu horário online.
          </p>
        </div>

        {/* 4-digit Code Search Box */}
        <div className="max-w-md mx-auto p-6 rounded-3xl bg-surface border border-border shadow-2xl space-y-4 text-left">
          <label
            htmlFor="home-codigo"
            className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          >
            Código do Profissional (4 números)
          </label>

          <form action="/buscar" method="GET" className="space-y-3">
            <div className="flex gap-2">
              <input
                id="home-codigo"
                name="codigo"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="Ex: 4821"
                className="flex-1 text-xl font-mono font-bold tracking-widest px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition-all"
              />
              <Link
                href="/buscar"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm bg-[#C9A84C] hover:bg-[#E8C97A] text-[#0A0A0A] transition-all shadow-md shadow-[#C9A84C]/20"
              >
                <Search className="w-4 h-4" />
                Buscar
              </Link>
            </div>
          </form>

          <p className="text-[11px] text-muted-foreground">
            Você também pode acessar diretamente digitando <code className="text-[#C9A84C] bg-white/5 px-1 py-0.5 rounded">/p/CODIGO</code> na barra de endereços.
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto pt-6">
          <div className="p-4 rounded-2xl bg-surface/60 border border-border/80 text-left space-y-2">
            <Scissors className="w-5 h-5 text-[#C9A84C]" />
            <h3 className="font-semibold text-sm text-foreground">Catálogo Atualizado</h3>
            <p className="text-xs text-muted-foreground">
              Veja procedimentos, valores e promoções em tempo real.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-surface/60 border border-border/80 text-left space-y-2">
            <Heart className="w-5 h-5 text-[#C9A84C]" />
            <h3 className="font-semibold text-sm text-foreground">Agendamento Fácil</h3>
            <p className="text-xs text-muted-foreground">
              Escolha dia, horário e forma de pagamento sem complicações.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-surface/60 border border-border/80 text-left space-y-2">
            <ShieldCheck className="w-5 h-5 text-[#C9A84C]" />
            <h3 className="font-semibold text-sm text-foreground">Confirmação Instantânea</h3>
            <p className="text-xs text-muted-foreground">
              Receba confirmação por e-mail e fale direto pelo WhatsApp.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border bg-surface/40 py-6 text-center text-xs text-muted-foreground">
        <p>Studio Manager · Gestão Profissional para Estúdios de Beleza & Clientes</p>
      </footer>
    </div>
  );
}
