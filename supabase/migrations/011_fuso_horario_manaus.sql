-- Studio Manager — Migração 011: Fuso Horário Padrão de Manaus/AM (America/Manaus, UTC-4)
-- =============================================================================
-- Atualiza a função get_horarios_disponiveis para converter e comparar datas
-- explicitamente no fuso horário 'America/Manaus' (sem horário de verão, UTC-4).
-- Execute no SQL Editor do Supabase se desejar atualizar a função no banco.

CREATE OR REPLACE FUNCTION public.get_horarios_disponiveis(
  p_profissional_id UUID,
  p_data DATE,
  p_duracao_minutos INTEGER DEFAULT 30
)
RETURNS TABLE (horario TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dia_semana INTEGER;
  v_hora INTEGER;
  v_min INTEGER;
  v_slot_str TEXT;
  v_slot_inicio TIMESTAMPTZ;
  v_slot_fim TIMESTAMPTZ;
  v_ocupado BOOLEAN;
BEGIN
  -- Extrai dia da semana com base na data no fuso de Manaus
  v_dia_semana := EXTRACT(DOW FROM ((p_data::TEXT || ' 12:00:00')::TIMESTAMP AT TIME ZONE 'America/Manaus'));

  -- 1. Verifica se o dia inteiro está bloqueado
  IF EXISTS (
    SELECT 1 FROM public.indisponibilidades
    WHERE user_id = p_profissional_id
      AND tipo = 'dia_inteiro'
      AND (
        (recorrente = false AND (data_inicio AT TIME ZONE 'America/Manaus')::DATE = p_data)
        OR
        (recorrente = true AND dia_semana = v_dia_semana)
      )
  ) THEN
    RETURN; -- Nenhum horário disponível
  END IF;

  -- 2. Gera slots das 07:00 às 22:00 (a cada 30 min)
  FOR v_hora IN 7..22 LOOP
    FOR v_min IN 0..1 LOOP
      -- Pula 22:30 se passar das 22h
      IF v_hora = 22 AND v_min = 1 THEN
        EXIT;
      END IF;

      v_slot_str := LPAD(v_hora::TEXT, 2, '0') || ':' || CASE WHEN v_min = 0 THEN '00' ELSE '30' END;

      -- Slot em TIMESTAMPTZ explícito no fuso horário de Manaus
      v_slot_inicio := ((p_data::TEXT || ' ' || v_slot_str || ':00')::TIMESTAMP AT TIME ZONE 'America/Manaus');
      v_slot_fim := v_slot_inicio + (p_duracao_minutos || ' minutes')::INTERVAL;

      -- Verifica conflito com agendamentos (qualquer status ativo)
      v_ocupado := EXISTS (
        SELECT 1 FROM public.agendamentos ag
        JOIN public.servicos sv ON sv.id = ag.servico_id
        WHERE ag.user_id = p_profissional_id
          AND ag.status NOT IN ('Cancelado', 'Não Compareceu')
          AND ag.data_hora < v_slot_fim
          AND ag.data_hora + (COALESCE(sv.duracao_minutos, 30) || ' minutes')::INTERVAL > v_slot_inicio
      );

      -- Verifica conflito com indisponibilidades de horário
      IF NOT v_ocupado THEN
        v_ocupado := EXISTS (
          SELECT 1 FROM public.indisponibilidades
          WHERE user_id = p_profissional_id
            AND tipo = 'horario'
            AND (
              (recorrente = false AND data_inicio < v_slot_fim AND data_fim > v_slot_inicio)
              OR
              (recorrente = true AND dia_semana = v_dia_semana
                AND (data_inicio AT TIME ZONE 'America/Manaus')::TIME < (v_slot_str || ':00')::TIME + (p_duracao_minutos || ' minutes')::INTERVAL
                AND (data_fim AT TIME ZONE 'America/Manaus')::TIME > (v_slot_str || ':00')::TIME)
            )
        );
      END IF;

      IF NOT v_ocupado THEN
        horario := v_slot_str;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_horarios_disponiveis TO anon, authenticated, service_role;
