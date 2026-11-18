import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/url";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  profissional_id: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duracao: z.coerce.number().int().min(5).max(480).catch(30),
});

/** Cliente com a chave anon: a RPC é SECURITY DEFINER e não expõe dados pessoais. */
function getAnonClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    profissional_id: searchParams.get("profissional_id"),
    data: searchParams.get("data"),
    duracao: searchParams.get("duracao") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parâmetros profissional_id e data são obrigatórios." },
      { status: 400 }
    );
  }

  const { profissional_id: profissionalId, data: dataStr, duracao } = parsed.data;
  const supabase = getAnonClient();

  try {
    // Fonte única do cálculo: RPC horarios_disponiveis_publico (migration 012)
    const { data, error } = await supabase.rpc("horarios_disponiveis_publico", {
      p_profissional_id: profissionalId,
      p_data: dataStr,
      p_duracao_minutos: duracao,
    });

    if (error) throw error;

    const slots = (data ?? []).map((r: { horario: string }) => r.horario);
    return NextResponse.json({ slots }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[GET /api/horarios-disponiveis]", err);
    return NextResponse.json(
      { error: "Não foi possível carregar os horários." },
      { status: 500 }
    );
  }
}
