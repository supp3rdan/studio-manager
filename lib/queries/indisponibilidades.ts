import { createClient } from "@/lib/supabase/client";
import type { Indisponibilidade } from "@/types/database";

export async function getIndisponibilidades(): Promise<Indisponibilidade[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("indisponibilidades")
    .select("*")
    .order("data_inicio", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createIndisponibilidade(
  payload: Omit<Indisponibilidade, "id" | "user_id" | "criado_em">
): Promise<Indisponibilidade> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { data, error } = await supabase
    .from("indisponibilidades")
    .insert({ ...payload, user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteIndisponibilidade(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("indisponibilidades")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Busca horários disponíveis (07h às 22h) via API interna */
export async function getHorariosDisponiveis(
  profissionalId: string,
  data: string, // "yyyy-MM-dd"
  duracaoMinutos: number = 30
): Promise<string[]> {
  const res = await fetch(
    `/api/horarios-disponiveis?profissional_id=${encodeURIComponent(
      profissionalId
    )}&data=${encodeURIComponent(data)}&duracao=${duracaoMinutos}`,
    { cache: "no-store" }
  );

  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !Array.isArray(json.slots)) {
    // Nunca exibir a grade inteira como "livre" em caso de erro:
    // isso mostraria horários ocupados ou bloqueados.
    throw new Error(json?.error || "Não foi possível carregar os horários.");
  }
  return json.slots;
}
