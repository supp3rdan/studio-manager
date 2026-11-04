"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Search, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getProfissionalByCodigo } from "@/lib/queries/perfis";

export default function BuscarProfissionalPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const cleanCode = codigo.replace(/\D/g, "");
    if (cleanCode.length !== 4) {
      toast.error("O código do profissional deve ter 4 dígitos numéricos.");
      return;
    }

    setIsLoading(true);
    try {
      const prof = await getProfissionalByCodigo(cleanCode);
      if (!prof) {
        toast.error(`Profissional com código #${cleanCode} não encontrado.`);
        return;
      }

      router.push(`/p/${cleanCode}`);
    } catch {
      toast.error("Erro ao verificar código");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 4);
    setCodigo(digits);
    if (digits.length === 4) {
      // Auto submit when 4 digits are entered
      setTimeout(() => {
        setIsLoading(true);
        getProfissionalByCodigo(digits)
          .then((prof) => {
            if (prof) {
              router.push(`/p/${digits}`);
            } else {
              toast.error(`Profissional com código #${digits} não encontrado.`);
            }
          })
          .catch(() => {
            toast.error("Erro ao verificar código.");
          })
          .finally(() => {
            setIsLoading(false);
          });
      }, 200);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden px-4">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#C9A84C]/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Back navigation */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Link>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C9A84C]/10 border border-[#C9A84C]/20 mb-4">
            <Sparkles className="w-8 h-8 text-[#C9A84C]" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Buscar Profissional
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Digite o código de 4 números fornecido pelo seu estúdio
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="codigo"
                className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3"
              >
                Código de 4 dígitos
              </label>

              <div className="relative flex justify-center">
                <input
                  id="codigo"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoFocus
                  placeholder="0000"
                  value={codigo}
                  onChange={(e) => handleInputChange(e.target.value)}
                  className="w-48 text-center text-3xl font-mono font-black tracking-[0.5em] px-4 py-3 rounded-2xl bg-background border-2 border-[#C9A84C]/40 text-[#C9A84C] placeholder:text-muted-foreground/30 focus:outline-none focus:ring-4 focus:ring-[#C9A84C]/20 focus:border-[#C9A84C] transition-all"
                />
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                Exemplo: se o seu profissional forneceu o código <strong>4821</strong>, digite acima.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || codigo.length !== 4}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-semibold text-sm transition-all duration-200 bg-[#C9A84C] hover:bg-[#E8C97A] text-[#0A0A0A] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#C9A84C]/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Localizando estúdio...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Acessar Página de Agendamento
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <Link href="/register" className="hover:text-[#C9A84C] transition-colors">
              Criar uma conta
            </Link>
            <span>·</span>
            <Link href="/login" className="hover:text-[#C9A84C] transition-colors">
              Já sou cadastrado
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Studio Manager · Conectando você aos melhores profissionais
        </p>
      </div>
    </div>
  );
}
