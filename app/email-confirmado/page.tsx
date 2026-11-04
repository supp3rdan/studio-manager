"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, CheckCircle, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function EmailConfirmadoPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isClientUser, setIsClientUser] = useState(false);
  const [isError, setIsError] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    // Check search params or hash for status
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("status") === "erro" || params.get("error")) {
        setIsError(true);
      }
    }

    // Check if user session was already established
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user) {
          setIsAuthenticated(true);
          const { data: perfil } = await supabase
            .from("perfis")
            .select("tipo_usuario")
            .eq("id", session.user.id)
            .maybeSingle();

          if (perfil?.tipo_usuario === "cliente") {
            setIsClientUser(true);
          }
        } else {
          setIsAuthenticated(false);
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
      });
  }, [supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden px-4">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#C9A84C]/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C9A84C]/10 border border-[#C9A84C]/20 mb-4">
            <Sparkles className="w-8 h-8 text-[#C9A84C]" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Studio Manager
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirmação de Cadastro
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-2xl text-center">
          {isError ? (
            <div className="space-y-5">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-amber-400" />
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-foreground">
                  Aviso de Confirmação
                </h2>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  O link de confirmação pode já ter sido utilizado ou expirado. Se você já confirmou seu e-mail anteriormente, basta entrar normalmente.
                </p>
              </div>

              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full py-3 px-6 rounded-lg font-semibold text-sm bg-[#C9A84C] hover:bg-[#E8C97A] text-[#0A0A0A] transition-all duration-200 shadow-lg shadow-[#C9A84C]/20"
              >
                Fazer Login
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-foreground">
                  E-mail Confirmado! ✨
                </h2>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Sua conta foi ativada com sucesso. Você já tem acesso completo a todas as funcionalidades do Studio Manager.
                </p>
              </div>

              <div>
                {isAuthenticated === null ? (
                  <div className="flex items-center justify-center py-2 text-muted-foreground text-sm gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[#C9A84C]" />
                    <span>Carregando sua sessão...</span>
                  </div>
                ) : isAuthenticated ? (
                  <Link
                    href={isClientUser ? "/cliente/agendamentos" : "/dashboard"}
                    className="inline-flex items-center justify-center gap-2 w-full py-3 px-6 rounded-lg font-semibold text-sm bg-[#C9A84C] hover:bg-[#E8C97A] text-[#0A0A0A] transition-all duration-200 shadow-lg shadow-[#C9A84C]/20"
                  >
                    {isClientUser ? "Acessar Meus Agendamentos" : "Acessar o Painel"}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 w-full py-3 px-6 rounded-lg font-semibold text-sm bg-[#C9A84C] hover:bg-[#E8C97A] text-[#0A0A0A] transition-all duration-200 shadow-lg shadow-[#C9A84C]/20"
                  >
                    Fazer Login na Conta
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Studio Manager · Gestão de Estúdio de Beleza & Agendamentos
        </p>
      </div>
    </div>
  );
}
