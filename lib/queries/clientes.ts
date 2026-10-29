import { createClient } from "@/lib/supabase/client";
import type { Cliente } from "@/types/database";

export async function getClientes(): Promise<Cliente[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("nome", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createCliente(
  payload: Omit<Cliente, "id" | "user_id" | "criado_em" | "atualizado_em">
): Promise<Cliente> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("clientes")
    .insert({ ...payload, user_id: user!.id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCliente(
  id: string,
  payload: Partial<Omit<Cliente, "id" | "user_id" | "criado_em" | "atualizado_em">>
): Promise<Cliente> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clientes")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCliente(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) throw error;
}

export async function getClienteById(id: string): Promise<Cliente | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function getAtendimentosByClienteId(clienteId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("agendamentos")
    .select(
      `
      *,
      servicos ( id, nome, categoria, preco_base )
    `
    )
    .eq("cliente_id", clienteId)
    .order("data_hora", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

