"use client";

import { useState, useEffect, Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Sparkles, ArrowLeft, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const recuperarSchema = z.object({
  email: z.string().email("Informe um e-mail válido"),
});

type RecuperarForm = z.infer<typeof recuperarSchema>;

function RecuperarSenhaContent() {
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const searchParams = useSearchParams();
  const hasErrorParam = searchParams.get("error");
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RecuperarForm>({
    resolver: zodResolver(recuperarSchema),
  });

  const onSubmit = async (data: RecuperarForm) => {
    setIsLoading(true);
    setSubmittedEmail(data.email);

    try {
      const redirectTo = `${window.location.origin}/api/auth/callback?next=/redefinir-senha`;

      // Chamada padrao Supabase Auth de recuperacao de senha
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo,
      });

      if (error) {
        console.warn("Aviso ao solicitar recuperação:", error.message);
      }

      // Recomendação de segurança: sempre exibir mensagem genérica de sucesso
      // para evitar enumeração de e-mails de usuários cadastrados
      setSubmitted(true);
      toast.success("Solicitação enviada!");
    } catch (err: any) {
      console.error("Erro inesperado:", err);
      // Mantém mensagem genérica por segurança
      setSubmitted(true);
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
            Recuperação segura de conta
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-2xl">
          {hasErrorParam && !submitted && (
            <div className="mb-6 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 flex items-start gap-3 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Link expirado ou inválido</p>
                <p className="mt-0.5 text-muted-foreground">
                  O link de redefinição expirou ou já foi utilizado. Solicite um novo link abaixo.
                </p>
              </div>
            </div>
          )}

          {submitted ? (
            <div className="text-center space-y-5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#C9A84C]/15 border border-[#C9A84C]/30 text-[#C9A84C] mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Verifique sua caixa de entrada
                </h2>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Se o e-mail <span className="font-semibold text-foreground">{submittedEmail}</span> estiver cadastrado em nosso sistema, enviamos um link para redefinir sua senha.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-background border border-border text-left">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  💡 <span className="font-medium text-foreground">Dica:</span> Se não encontrar o e-mail em alguns minutos, verifique sua pasta de <span className="text-[#C9A84C]">Spam</span> ou <span className="text-[#C9A84C]">Lixo Eletrônico</span>.
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="w-full py-2.5 px-4 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:border-[#C9A84C]/40 transition-colors"
                >
                  Tentar outro e-mail
                </button>

                <Link
                  href="/login"
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-semibold text-sm transition-all duration-200 bg-[#C9A84C] hover:bg-[#E8C97A] text-[#0A0A0A] shadow-lg shadow-[#C9A84C]/20"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar para o Login
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  Esqueceu sua senha?
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Digite seu e-mail cadastrado e enviaremos um link para criar uma nova senha.
                </p>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  E-mail cadastrado
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="seuemail@exemplo.com"
                    {...register("email")}
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition-colors text-sm"
                  />
                  <Mail className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3.5 pointer-events-none" />
                </div>
                {errors.email && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {errors.email.message}
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
                    Enviando link...
                  </>
                ) : (
                  "Enviar link de recuperação"
                )}
              </button>

              <div className="pt-2 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[#C9A84C] transition-colors font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Voltar para o Login
                </Link>
              </div>
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

export default function RecuperarSenhaPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
        </div>
      }
    >
      <RecuperarSenhaContent />
    </Suspense>
  );
}

