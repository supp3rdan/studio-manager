"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Sparkles, CheckCircle2, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const redefinirSchema = z
  .object({
    password: z
      .string()
      .min(8, "A senha deve ter pelo menos 8 caracteres")
      .regex(/[A-Za-z]/, "A senha deve conter pelo menos uma letra")
      .regex(/[0-9]/, "A senha deve conter pelo menos um número"),
    confirmPassword: z.string().min(1, "Confirme sua senha"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type RedefinirForm = z.infer<typeof redefinirSchema>;

export default function RedefinirSenhaPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RedefinirForm>({
    resolver: zodResolver(redefinirSchema),
  });

  useEffect(() => {
    async function checkSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          setHasSession(true);
        } else {
          // Listen for recovery event if hash was parsed client-side
          const { data: authListener } = supabase.auth.onAuthStateChange(
            (event, session) => {
              if (event === "PASSWORD_RECOVERY" || session) {
                setHasSession(true);
              }
            }
          );
          // Wait briefly in case token hash exchange is in flight
          setTimeout(async () => {
            const {
              data: { session: retrySession },
            } = await supabase.auth.getSession();
            if (retrySession) {
              setHasSession(true);
            }
            setIsVerifying(false);
          }, 1200);

          return () => {
            authListener.subscription.unsubscribe();
          };
        }
      } catch (err) {
        console.error("Erro ao verificar sessão:", err);
      } finally {
        setIsVerifying(false);
      }
    }

    checkSession();
  }, [supabase]);

  const onSubmit = async (data: RedefinirForm) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) {
        toast.error("Erro ao redefinir senha", {
          description: error.message,
        });
        return;
      }

      setSuccess(true);
      toast.success("Senha alterada com sucesso! 🎉");
    } catch (err: any) {
      toast.error("Erro inesperado", {
        description: err?.message || "Tente novamente mais tarde.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden py-10">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#C9A84C]/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C9A84C]/10 border border-[#C9A84C]/20 mb-4">
            <Sparkles className="w-8 h-8 text-[#C9A84C]" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Studio Manager
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Redefinição de senha
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-2xl">
          {isVerifying ? (
            <div className="py-12 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C] mx-auto" />
              <p className="text-xs text-muted-foreground">
                Validando seu link de acesso seguro...
              </p>
            </div>
          ) : success ? (
            <div className="text-center space-y-5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#C9A84C]/15 border border-[#C9A84C]/30 text-[#C9A84C] mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-foreground">
                  Senha atualizada!
                </h2>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Sua senha foi redefinida com sucesso. Você já pode fazer login com as novas credenciais.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/login"
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-semibold text-sm transition-all duration-200 bg-[#C9A84C] hover:bg-[#E8C97A] text-[#0A0A0A] shadow-lg shadow-[#C9A84C]/20"
                >
                  Fazer Login
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : !hasSession ? (
            <div className="text-center space-y-4">
              <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive text-left leading-relaxed">
                <p className="font-semibold mb-1">Sessão de recuperação não encontrada</p>
                O link acessado é inválido ou já expirou. Por motivos de segurança, solicite um novo link de recuperação.
              </div>

              <Link
                href="/recuperar-senha"
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-semibold text-sm transition-all duration-200 bg-[#C9A84C] hover:bg-[#E8C97A] text-[#0A0A0A] shadow-lg shadow-[#C9A84C]/20"
              >
                Solicitar novo link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  Criar nova senha
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Escolha uma senha forte com no mínimo 8 caracteres, incluindo letras e números.
                </p>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Nova senha
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    {...register("password")}
                    className="w-full pl-10 pr-10 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition-colors text-sm"
                  />
                  <Lock className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3.5 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Confirmar nova senha
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    {...register("confirmPassword")}
                    className="w-full pl-10 pr-10 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition-colors text-sm"
                  />
                  <Lock className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3.5 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-semibold text-sm transition-all duration-200 bg-[#C9A84C] hover:bg-[#E8C97A] text-[#0A0A0A] disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-[#C9A84C]/20"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando nova senha...
                  </>
                ) : (
                  "Salvar nova senha"
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Acesso seguro · Studio Manager
        </p>
      </div>
    </div>
  );
}

