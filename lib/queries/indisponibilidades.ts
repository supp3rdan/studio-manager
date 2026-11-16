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

/** Busca horários disponíveis via RPC (usado pelo cliente no modal de agendamento) */
export async function getHorariosDisponiveis(
  profissionalId: string,
  data: string, // "yyyy-MM-dd"
  duracaoMinutos: number = 30
): Promise<string[]> {
  const supabase = createClient();
  const { data: result, error } = await supabase.rpc("get_horarios_disponiveis", {
    p_profissional_id: profissionalId,
    p_data: data,
    p_duracao_minutos: duracaoMinutos,
  });

  if (error) {
    console.warn("get_horarios_disponiveis RPC error:", error.message);
    // Fallback: gera slots 08-22 sem verificação
    return generateSlots(data);
  }

  if (!result || result.length === 0) return [];

  return (result as Array<{ horario: string }>).map((r) => r.horario);
}

/** Fallback: gera slots de 30 em 30 minutos das 08h às 21h30 */
function generateSlots(data: string): string[] {
  const slots: string[] = [];
  for (let h = 8; h < 22; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      slots.push(`${data}T${hh}:${mm}:00.000Z`);
    }
  }
  return slots;
}
