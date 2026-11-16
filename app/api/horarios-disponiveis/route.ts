import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

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

    // Gera todos os slots padrão das 07:00 às 22:00 (a cada 30 min)
    const ALL_SLOTS: string[] = [];
    for (let h = 7; h <= 22; h++) {
      ALL_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
      if (h < 22) {
        ALL_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
      }
    }

    // Calcula dia da semana para a data (0=Dom, 1=Seg, ..., 6=Sáb)
    const [ano, mes, dia] = dataStr.split("-").map(Number);
    const dateObj = new Date(ano, mes - 1, dia);
    const diaSemana = dateObj.getDay();

    // ── 1. Verifica indisponibilidades cadastradas pelo profissional ──
    const { data: bloqueios } = await supabase
      .from("indisponibilidades")
      .select("*")
      .eq("user_id", profissionalId);

    if (bloqueios && bloqueios.length > 0) {
      for (const b of bloqueios) {
        if (b.tipo === "dia_inteiro") {
          // Bloqueio pontual na data
          if (!b.recorrente && b.data_inicio) {
            const dataInicioStr = b.data_inicio.slice(0, 10);
            if (dataInicioStr === dataStr) {
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

    // ── 2. Busca agendamentos ativos do profissional ──
    // Considera intervalo amplo (para cobrir fusos horários do Brasil)
    const startDateQuery = new Date(`${dataStr}T00:00:00.000Z`);
    startDateQuery.setHours(startDateQuery.getHours() - 12);
    const endDateQuery = new Date(`${dataStr}T23:59:59.999Z`);
    endDateQuery.setHours(endDateQuery.getHours() + 12);

    const { data: agendamentos } = await supabase
      .from("agendamentos")
      .select("data_hora, servicos ( duracao_minutos )")
      .eq("user_id", profissionalId)
      .not("status", "in", '("Cancelado","Não Compareceu")')
      .gte("data_hora", startDateQuery.toISOString())
      .lte("data_hora", endDateQuery.toISOString());

    // ── 3. Filtra slots disponíveis ──
    const availableSlots = ALL_SLOTS.filter((slotTime) => {
      const slotStartMin = toMinutes(slotTime);
      const slotEndMin = slotStartMin + duracaoMinutos;

      // Não permite slot que ultrapasse as 22h30
      if (slotEndMin > 22 * 60 + 30) {
        return false;
      }

      // Verifica bloqueios de horário específico
      if (bloqueios && bloqueios.length > 0) {
        for (const b of bloqueios) {
          if (b.tipo === "horario") {
            let matchesDay = false;
            if (b.recorrente && b.dia_semana === diaSemana) {
              matchesDay = true;
            } else if (!b.recorrente && b.data_inicio && b.data_inicio.slice(0, 10) === dataStr) {
              matchesDay = true;
            }

            if (matchesDay && b.data_inicio && b.data_fim) {
              const startH = new Date(b.data_inicio).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });
              const endH = new Date(b.data_fim).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });
              const bStartMin = toMinutes(startH);
              const bEndMin = toMinutes(endH);

              // Conflito se os intervalos se sobrepõem
              if (slotStartMin < bEndMin && slotEndMin > bStartMin) {
                return false;
              }
            }
          }
        }
      }

      // Verifica conflito com agendamentos existentes
      if (agendamentos && agendamentos.length > 0) {
        for (const ag of agendamentos) {
          const agDate = new Date(ag.data_hora);
          // Extrai data local do agendamento
          const agDataStr = agDate.toISOString().slice(0, 10);
          const agHoraStr = agDate.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

          // Se o agendamento cai no mesmo dia
          const agStartMin = toMinutes(agHoraStr);
          const agDuracao = (ag.servicos as any)?.duracao_minutos || 30;
          const agEndMin = agStartMin + agDuracao;

          // Se sobrepõe com o slot
          if (slotStartMin < agEndMin && slotEndMin > agStartMin) {
            return false;
          }
        }
      }

      return true;
    });

    return NextResponse.json({ slots: availableSlots });
  } catch (err: any) {
    console.error("[GET /api/horarios-disponiveis]", err);
    // Em caso de erro, retorna os slots padrão 07:00 as 22:00
    const fallback: string[] = [];
    for (let h = 7; h <= 22; h++) {
      fallback.push(`${String(h).padStart(2, "0")}:00`);
      if (h < 22) fallback.push(`${String(h).padStart(2, "0")}:30`);
    }
    return NextResponse.json({ slots: fallback });
  }
}
