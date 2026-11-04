"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Sparkles, UserPlus, CheckCircle } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const registerSchema = z
  .object({
    email: z.string().email("E-mail inválido"),
    password: z
      .string()
      .min(8, "A senha deve ter pelo menos 8 caracteres")
      .regex(/[A-Z]/, "A senha deve conter ao menos uma letra maiúscula")
      .regex(/[0-9]/, "A senha deve conter ao menos um número"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/api/auth/callback?next=/email-confirmado`
          : undefined;

      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo,
        },
      });

      if (error) {
        let description = error.message;
        if (error.message.toLowerCase().includes("already registered")) {
          description = "Este e-mail já está cadastrado. Tente fazer login.";
        } else if (error.message.toLowerCase().includes("invalid email")) {
          description = "E-mail inválido.";
        } else if (error.message.toLowerCase().includes("weak password")) {
          description = "Senha muito fraca. Use ao menos 8 caracteres com letras e números.";
        }
        toast.error("Erro ao criar conta", { description });
        return;
      }

      setSuccess(true);
    } catch {
      toast.error("Erro inesperado. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#C9A84C]/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C9A84C]/10 border border-[#C9A84C]/20 mb-4">
            <Sparkles className="w-8 h-8 text-[#C9A84C]" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Studio Manager
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Crie sua conta gratuitamente
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-2xl">
          {success ? (
            // ── Success state ──
            <div className="text-center space-y-4 py-4">
              <div className="flex justify-center">
                <CheckCircle className="w-14 h-14 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                Conta criada com sucesso!
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Enviamos um link de confirmação para o seu e-mail.
                Basta clicar no link recebido para ativar sua conta e acessar o painel.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center w-full py-3 px-6 rounded-lg font-semibold text-sm bg-[#C9A84C] hover:bg-[#E8C97A] text-[#0A0A0A] transition-all duration-200 mt-2 shadow-lg shadow-[#C9A84C]/20"
              >
                Ir para o login
              </Link>
            </div>
          ) : (
            // ── Form ──
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="seuemail@exemplo.com"
                  {...register("email")}
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition-colors text-sm"
                />
                {errors.email && (
                  <p className="mt-1.5 text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  {...register("password")}
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition-colors text-sm"
                />
                {errors.password && (
                  <p className="mt-1.5 text-xs text-destructive">{errors.password.message}</p>
                )}
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Mínimo 8 caracteres, uma maiúscula e um número.
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Confirmar senha
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repita a senha"
                  {...register("confirmPassword")}
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition-colors text-sm"
                />
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
                    Criando conta...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Criar conta
                  </>
                )}
              </button>

              <p className="text-center text-sm text-muted-foreground pt-1">
                Já tem uma conta?{" "}
                <Link
                  href="/login"
                  className="text-[#C9A84C] hover:underline font-medium"
                >
                  Fazer login
                </Link>
              </p>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Seus dados são protegidos · Studio Manager
        </p>
      </div>
    </div>
  );
}
