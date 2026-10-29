import { createClient } from "@/lib/supabase/client";
import type { Servico } from "@/types/database";

export async function getServicos(): Promise<Servico[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("servicos")
    .select("*")
    .order("categoria", { ascending: true })
    .order("nome", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createServico(
  payload: Omit<Servico, "id" | "user_id" | "criado_em" | "atualizado_em">
): Promise<Servico> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("servicos")
    .insert({ ...payload, user_id: user!.id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateServico(
  id: string,
  payload: Partial<Omit<Servico, "id" | "user_id" | "criado_em" | "atualizado_em">>
): Promise<Servico> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("servicos")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteServico(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("servicos").delete().eq("id", id);
  if (error) throw error;
}
