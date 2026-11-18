-- Migration 010: Cancelamento pelo cliente e reagendamento pelo profissional
-- ============================================================

-- ── 1. RPC: cancelar_agendamento_cliente ────────────────────────────────────
-- Permite que um cliente cancele seu próprio agendamento desde que seja
-- com mais de 2 horas de antecedência. Retorna erro se já passou do prazo.
CREATE OR REPLACE FUNCTION public.cancelar_agendamento_cliente(
  p_agendamento_id UUID,
  p_cliente_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag RECORD;
  v_limite TIMESTAMPTZ;
BEGIN
  -- Busca o agendamento verificando que pertence ao cliente
  SELECT id, user_id, cliente_user_id, data_hora, status, servico_id
  INTO v_ag
  FROM public.agendamentos
  WHERE id = p_agendamento_id
    AND cliente_user_id = p_cliente_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado ou sem permissão.';
  END IF;

  -- Só pode cancelar se status for Agendado ou Confirmado
  IF v_ag.status NOT IN ('Agendado', 'Confirmado') THEN
    RAISE EXCEPTION 'Este agendamento não pode ser cancelado (status: %).', v_ag.status;
  END IF;

  -- Regra: só pode cancelar com 2h+ de antecedência
  v_limite := NOW() + INTERVAL '2 hours';
  IF v_ag.data_hora <= v_limite THEN
    RAISE EXCEPTION 'Não é possível cancelar com menos de 2 horas de antecedência. Entre em contato com o profissional pelo WhatsApp.';
  END IF;

  -- Atualiza status para Cancelado
  UPDATE public.agendamentos
  SET status = 'Cancelado', atualizado_em = NOW()
  WHERE id = p_agendamento_id;

  RETURN jsonb_build_object(
    'success', true,
    'agendamento_id', p_agendamento_id,
    'status', 'Cancelado'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_agendamento_cliente(UUID, UUID)
  TO authenticated;

-- ── 2. RPC: reagendar_agendamento ────────────────────────────────────────────
-- Permite que o profissional reagende (mude data_hora) de um agendamento
-- existente, mantendo todos os outros dados intactos.
CREATE OR REPLACE FUNCTION public.reagendar_agendamento(
  p_agendamento_id UUID,
  p_profissional_user_id UUID,
  p_nova_data_hora TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag RECORD;
BEGIN
  -- Verifica que o agendamento pertence ao profissional
  SELECT id, user_id, status, data_hora
  INTO v_ag
  FROM public.agendamentos
  WHERE id = p_agendamento_id
    AND user_id = p_profissional_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado ou sem permissão.';
  END IF;

  IF v_ag.status IN ('Concluído', 'Cancelado', 'Não Compareceu') THEN
    RAISE EXCEPTION 'Não é possível reagendar um agendamento com status: %.', v_ag.status;
  END IF;

  -- Atualiza a data/hora
  UPDATE public.agendamentos
  SET data_hora = p_nova_data_hora,
      status = 'Agendado',
      atualizado_em = NOW()
  WHERE id = p_agendamento_id;

  RETURN jsonb_build_object(
    'success', true,
    'agendamento_id', p_agendamento_id,
    'nova_data_hora', p_nova_data_hora
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reagendar_agendamento(UUID, UUID, TIMESTAMPTZ)
  TO authenticated;
