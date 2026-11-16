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
  try {
    const res = await fetch(
      `/api/horarios-disponiveis?profissional_id=${encodeURIComponent(
        profissionalId
      )}&data=${encodeURIComponent(data)}&duracao=${duracaoMinutos}`
    );

    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.slots)) {
        return json.slots;
      }
    }
  } catch (err) {
    console.warn("Erro ao buscar horários via API, usando fallback:", err);
  }

  // Fallback seguro: gera slots das 07:00 às 22:00 (a cada 30 min)
  return generateSlots();
}

/** Fallback: gera slots de 30 em 30 minutos das 07h às 22h */
function generateSlots(): string[] {
  const slots: string[] = [];
  for (let h = 7; h <= 22; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 22) {
      slots.push(`${String(h).padStart(2, "0")}:30`);
    }
  }
  return slots;
}
