import { createClient } from "@/lib/supabase/client";
import type { Expediente } from "@/types/database";

export interface DiaExpediente {
  dia_semana: number;
  ativo: boolean;
  inicio: string; // "HH:mm"
  fim: string; // "HH:mm"
}

export interface ConfigExpediente {
  dias: DiaExpediente[];
  intervaloMin: number;
  bufferMin: number;
  personalizado: boolean; // false = usando o padrão 07:00–22:30
}

const PADRAO: DiaExpediente[] = Array.from({ length: 7 }, (_, d) => ({
  dia_semana: d,
  ativo: true,
  inicio: "07:00",
  fim: "22:30",
}));

export async function getConfigExpediente(): Promise<ConfigExpediente> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const [{ data: linhas, error }, { data: perfil }] = await Promise.all([
    supabase.from("expedientes").select("*").eq("user_id", user.id),
    supabase.from("perfis").select("agenda_intervalo_min, agenda_buffer_min").eq("id", user.id).maybeSingle(),
  ]);
  if (error) throw error;

  const porDia = new Map(((linhas ?? []) as Expediente[]).map((l) => [l.dia_semana, l]));
  const personalizado = porDia.size > 0;
  const dias = PADRAO.map((p) => {
    if (!personalizado) return p;
    const l = porDia.get(p.dia_semana);
    return l
      ? { dia_semana: p.dia_semana, ativo: l.ativo, inicio: l.inicio.slice(0, 5), fim: l.fim.slice(0, 5) }
      : { ...p, ativo: false };
  });

  return {
    dias,
    intervaloMin: perfil?.agenda_intervalo_min ?? 30,
    bufferMin: perfil?.agenda_buffer_min ?? 0,
    personalizado,
  };
}

export async function salvarConfigExpediente(cfg: Omit<ConfigExpediente, "personalizado">): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("salvar_expediente", {
    p_dias: cfg.dias,
    p_intervalo_min: cfg.intervaloMin,
    p_buffer_min: cfg.bufferMin,
  });
  if (error) throw error;
}
