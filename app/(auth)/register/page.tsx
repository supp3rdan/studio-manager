"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  UserPlus,
  CheckCircle,
  Briefcase,
  Heart,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const registerSchema = z
  .object({
    tipo_usuario: z.enum(["profissional", "cliente"]),
    nome: z.string().min(2, "Informe seu nome completo"),
    whatsapp: z.string().min(10, "Informe um WhatsApp válido com DDD"),
    nome_studio: z.string().optional(),
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
  const [tipoUsuario, setTipoUsuario] = useState<"profissional" | "cliente">(
    "cliente"
  );
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      tipo_usuario: "cliente",
      nome: "",
      whatsapp: "",
      nome_studio: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const handleTipoChange = (tipo: "profissional" | "cliente") => {
    setTipoUsuario(tipo);
    setValue("tipo_usuario", tipo);
  };

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
          data: {
            tipo_usuario: data.tipo_usuario,
            nome: data.nome.trim(),
            whatsapp: data.whatsapp.replace(/\D/g, ""),
            nome_studio:
              data.tipo_usuario === "profissional"
                ? data.nome_studio?.trim() || null
                : null,
          },
        },
      });

      if (error) {
        let description = error.message;
        if (error.message.toLowerCase().includes("already registered")) {
          description = "Este e-mail já está cadastrado. Tente fazer login.";
        } else if (error.message.toLowerCase().includes("invalid email")) {
          description = "E-mail inválido.";
        } else if (error.message.toLowerCase().includes("weak password")) {
          description =
            "Senha muito fraca. Use ao menos 8 caracteres com letras e números.";
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
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden py-12 px-4">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#C9A84C]/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C9A84C]/10 border border-[#C9A84C]/20 mb-4">
            <Sparkles className="w-8 h-8 text-[#C9A84C]" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Studio Manager
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie sua conta para começar
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-2xl">
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
                Enviamos um link de confirmação para o seu e-mail. Basta clicar
                no link recebido para ativar sua conta e acessar seu portal.
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
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Você deseja se cadastrar como:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleTipoChange("cliente")}
                    className={cn(
                      "flex flex-col items-center justify-center p-3.5 rounded-xl border text-sm font-medium transition-all text-center",
                      tipoUsuario === "cliente"
                        ? "border-[#C9A84C] bg-[#C9A84C]/10 text-foreground ring-1 ring-[#C9A84C]"
                        : "border-border bg-background text-muted-foreground hover:bg-white/5"
                    )}
                  >
                    <Heart
                      className={cn(
                        "w-5 h-5 mb-1.5",
                        tipoUsuario === "cliente"
                          ? "text-[#C9A84C]"
                          : "text-muted-foreground"
                      )}
                    />
                    <span className="font-semibold text-sm">Sou Cliente</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5">
                      Agendar serviços
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTipoChange("profissional")}
                    className={cn(
                      "flex flex-col items-center justify-center p-3.5 rounded-xl border text-sm font-medium transition-all text-center",
                      tipoUsuario === "profissional"
                        ? "border-[#C9A84C] bg-[#C9A84C]/10 text-foreground ring-1 ring-[#C9A84C]"
                        : "border-border bg-background text-muted-foreground hover:bg-white/5"
                    )}
                  >
                    <Briefcase
                      className={cn(
                        "w-5 h-5 mb-1.5",
                        tipoUsuario === "profissional"
                          ? "text-[#C9A84C]"
                          : "text-muted-foreground"
                      )}
                    />
                    <span className="font-semibold text-sm">Sou Profissional</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5">
                      Gerenciar estúdio
                    </span>
                  </button>
                </div>
              </div>

              {/* Nome */}
              <div>
                <label
                  htmlFor="nome"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Nome Completo *
                </label>
                <input
                  id="nome"
                  type="text"
                  placeholder="Seu nome completo"
                  {...register("nome")}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition-colors text-sm"
                />
                {errors.nome && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.nome.message}
                  </p>
                )}
              </div>

              {/* WhatsApp */}
              <div>
                <label
                  htmlFor="whatsapp"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  WhatsApp *
                </label>
                <input
                  id="whatsapp"
                  type="tel"
                  placeholder="(99) 99999-9999"
                  {...register("whatsapp")}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition-colors text-sm"
                />
                {errors.whatsapp && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.whatsapp.message}
                  </p>
                )}
              </div>

              {/* Nome do Studio (apenas se profissional) */}
              {tipoUsuario === "profissional" && (
                <div className="animate-in fade-in duration-200">
                  <label
                    htmlFor="nome_studio"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    Nome do Studio{" "}
                    <span className="text-xs text-muted-foreground font-normal">
                      (opcional)
                    </span>
                  </label>
                  <input
                    id="nome_studio"
                    type="text"
                    placeholder="Ex: Studio Bella Estética"
                    {...register("nome_studio")}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition-colors text-sm"
                  />
                </div>
              )}

              {/* E-mail */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  E-mail *
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="seuemail@exemplo.com"
                  {...register("email")}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition-colors text-sm"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Senhas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    Senha *
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    {...register("password")}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition-colors text-sm"
                  />
                  {errors.password && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    Confirmar Senha *
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repita a senha"
                    {...register("confirmPassword")}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition-colors text-sm"
                  />
                  {errors.confirmPassword && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                A senha deve conter ao menos 8 caracteres, uma letra maiúscula e
                um número.
              </p>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-semibold text-sm transition-all duration-200 bg-[#C9A84C] hover:bg-[#E8C97A] text-[#0A0A0A] disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-[#C9A84C]/20 mt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Criando conta...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    {tipoUsuario === "profissional"
                      ? "Cadastrar como Profissional"
                      : "Cadastrar como Cliente"}
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
          Seus dados estão protegidos · Studio Manager
        </p>
      </div>
    </div>
  );
}
