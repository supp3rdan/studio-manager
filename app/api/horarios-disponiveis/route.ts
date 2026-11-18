import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/url";
import { isMissingFunction } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

const TIMEZONE = "America/Manaus";

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
    // Fonte única do cálculo: RPC da migration 012
    const { data, error } = await supabase.rpc("horarios_disponiveis_publico", {
      p_profissional_id: profissionalId,
      p_data: dataStr,
      p_duracao_minutos: duracao,
    });

    if (!error) {
      const slots = (data ?? []).map((r: { horario: string }) => r.horario);
      return NextResponse.json({ slots }, { headers: { "Cache-Control": "no-store" } });
    }

    if (!isMissingFunction(error)) throw error;

    // Migration 012 ainda não aplicada: usa o cálculo antigo.
    // TODO: remover após aplicar a migration 012 no Supabase.
    const slots = await calcularHorariosLegado(supabase, profissionalId, dataStr, duracao);
    return NextResponse.json({ slots }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[GET /api/horarios-disponiveis]", err);
    return NextResponse.json(
      { error: "Não foi possível carregar os horários." },
      { status: 500 }
    );
  }
}

/** Converte horário "HH:mm" para minutos desde meia-noite */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Formata data para "YYYY-MM-DD" no fuso de Manaus */
function getLocalDateString(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

/** Formata horário para "HH:mm" no fuso de Manaus */
function getLocalTimeString(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleTimeString("pt-BR", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Cálculo antigo (pré-migration 012), mantido só para a transição.
 * Depende da política pública de leitura em `indisponibilidades` e da RPC
 * `get_agendamentos_ocupados` (migration 009).
 */
async function calcularHorariosLegado(
  supabase: ReturnType<typeof getAnonClient>,
  profissionalId: string,
  dataStr: string,
  duracaoMinutos: number
): Promise<string[]> {
  // Grade base: 07:00 às 22:00 a cada 30 minutos
  const ALL_SLOTS: string[] = [];
  for (let h = 7; h <= 22; h++) {
    ALL_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 22) {
      ALL_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
    }
  }

  // Calcula dia da semana para a data (0=Dom, 1=Seg, ..., 6=Sáb)
  const [ano, mes, dia] = dataStr.split("-").map(Number);
  const dateObj = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
  const diaSemana = dateObj.getUTCDay();

  // ── 1. Verifica bloqueios de indisponibilidade cadastrados ──
  const { data: bloqueios } = await supabase
    .from("indisponibilidades")
    .select("*")
    .eq("user_id", profissionalId);

  if (bloqueios && bloqueios.length > 0) {
    for (const b of bloqueios) {
      if (b.tipo === "dia_inteiro") {
        // Bloqueio pontual na data
        if (!b.recorrente && b.data_inicio) {
          const bDate = getLocalDateString(b.data_inicio);
          if (bDate === dataStr) {
            return []; // Dia inteiro bloqueado
          }
        }
        // Bloqueio recorrente no dia da semana
        if (b.recorrente && b.dia_semana === diaSemana) {
          return []; // Dia inteiro bloqueado
        }
      }
    }
  }

  // ── 2. Busca agendamentos ocupados ('Agendado', 'Confirmado', 'Concluído') ──
  // Intervalo seguro de busca (24 horas antes e depois da data requisitada)
  const startRange = new Date(`${dataStr}T00:00:00-04:00`);
  startRange.setHours(startRange.getHours() - 6);
  const endRange = new Date(`${dataStr}T23:59:59-04:00`);
  endRange.setHours(endRange.getHours() + 6);

  let agendamentosOcupados: { data_hora: string; duracao_minutos: number }[] = [];

  // Tenta primeiro via função RPC com SECURITY DEFINER (independente de RLS)
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_agendamentos_ocupados",
    {
      p_profissional_id: profissionalId,
      p_data_inicio: startRange.toISOString(),
      p_data_fim: endRange.toISOString(),
    }
  );

  if (rpcError) throw rpcError;
  if (Array.isArray(rpcData)) agendamentosOcupados = rpcData;

  // ── 3. Filtra apenas os horários realmente livres ──
  const availableSlots = ALL_SLOTS.filter((slotTime) => {
    const slotStartMin = toMinutes(slotTime);
    const slotEndMin = slotStartMin + duracaoMinutos;

    // Não permite slot que termine após as 22h30
    if (slotEndMin > 22 * 60 + 30) {
      return false;
    }

    // Verifica bloqueios de horário específico
    if (bloqueios && bloqueios.length > 0) {
      for (const b of bloqueios) {
        if (b.tipo === "horario" && b.data_inicio && b.data_fim) {
          let matchesDay = false;
          if (b.recorrente && b.dia_semana === diaSemana) {
            matchesDay = true;
          } else if (!b.recorrente) {
            const bDate = getLocalDateString(b.data_inicio);
            if (bDate === dataStr) matchesDay = true;
          }

          if (matchesDay) {
            const bStartMin = toMinutes(getLocalTimeString(b.data_inicio));
            const bEndMin = toMinutes(getLocalTimeString(b.data_fim));

            // Se houver sobreposição entre [slotStartMin, slotEndMin) e [bStartMin, bEndMin)
            if (slotStartMin < bEndMin && slotEndMin > bStartMin) {
              return false; // Horário bloqueado
            }
          }
        }
      }
    }

    // Verifica conflito com agendamentos existentes (mesmo aguardando confirmação)
    if (agendamentosOcupados && agendamentosOcupados.length > 0) {
      for (const ag of agendamentosOcupados) {
        const agLocalDate = getLocalDateString(ag.data_hora);
        if (agLocalDate !== dataStr) continue; // Outro dia

        const agStartMin = toMinutes(getLocalTimeString(ag.data_hora));
        const agDuracao = ag.duracao_minutos || 30;
        const agEndMin = agStartMin + agDuracao;

        // Se houver sobreposição entre [slotStartMin, slotEndMin) e [agStartMin, agEndMin)
        if (slotStartMin < agEndMin && slotEndMin > agStartMin) {
          return false; // Horário ocupado por outro cliente
        }
      }
    }

    return true;
  });

  const agora = Date.now();
  return availableSlots.filter(
    (slot) => new Date(`${dataStr}T${slot}:00-04:00`).getTime() > agora
  );
}
