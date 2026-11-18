import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/url";
import { ConfirmacaoAgendamento, type AgendamentoPublico } from "@/components/publico/confirmacao-agendamento";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seu agendamento · Studio Manager", robots: { index: false } };

export default async function AgendamentoTokenPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { acao?: string };
}) {
  const token = z.string().uuid().safeParse(params.token);
  let agendamento: AgendamentoPublico | null = null;

  if (token.success) {
    const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: { persistSession: false },
    });
    const { data } = await supabase.rpc("agendamento_por_token", { p_token: token.data });
    agendamento = (data as AgendamentoPublico | null) ?? null;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <ConfirmacaoAgendamento
        token={token.success ? token.data : ""}
        agendamento={agendamento}
        acao={searchParams.acao === "remarcar" ? "remarcar" : "confirmar"}
      />
    </main>
  );
}
