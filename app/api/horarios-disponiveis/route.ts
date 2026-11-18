import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const TIMEZONE = "America/Manaus";

function getApiClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  return createClient(url, key, {
    auth: { persistSession: false },
  });
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profissionalId = searchParams.get("profissional_id");
    const dataStr = searchParams.get("data"); // "yyyy-MM-dd"
    const duracaoMinutos = Number(searchParams.get("duracao") || "30");

    if (!profissionalId || !dataStr) {
      return NextResponse.json(
        { error: "Parâmetros profissional_id e data são obrigatórios." },
        { status: 400 }
      );
    }

    const supabase = getApiClient();

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
              return NextResponse.json({ slots: [] }); // Dia inteiro bloqueado
            }
          }
          // Bloqueio recorrente no dia da semana
          if (b.recorrente && b.dia_semana === diaSemana) {
            return NextResponse.json({ slots: [] }); // Dia inteiro bloqueado
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

    if (!rpcError && Array.isArray(rpcData)) {
      agendamentosOcupados = rpcData;
    } else {
      // Fallback para query direta caso a migration 009 ainda não tenha sido executada
      const { data: directData } = await supabase
        .from("agendamentos")
        .select("data_hora, servicos ( duracao_minutos )")
        .eq("user_id", profissionalId)
        .in("status", ["Agendado", "Confirmado", "Concluído"])
        .gte("data_hora", startRange.toISOString())
        .lte("data_hora", endRange.toISOString());

      if (directData && directData.length > 0) {
        agendamentosOcupados = directData.map((d: any) => ({
          data_hora: d.data_hora,
          duracao_minutos: d.servicos?.duracao_minutos ?? 30,
        }));
      }
    }

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

    return NextResponse.json({ slots: availableSlots });
  } catch (err: any) {
    console.error("[GET /api/horarios-disponiveis]", err);
    return NextResponse.json({ slots: [] });
  }
}
