-- Studio Manager — Migração 012: Segurança e integridade da agenda
-- =============================================================================
-- Execute no SQL Editor do Supabase DEPOIS que o deploy da versão 0.12.0
-- estiver no ar. O script é idempotente (pode ser executado mais de uma vez)
-- e roda dentro de uma transação: se algo falhar, nada é alterado.
--
-- O que muda:
--   1. Validação de conflito de horário NO BANCO (com lock por profissional),
--      impedindo agendamentos duplicados/sobrepostos, no passado ou em
--      horários bloqueados.
--   2. As RPCs passam a usar auth.uid() em vez de confiar no id enviado pelo
--      navegador (criar, cancelar e reagendar). As assinaturas foram mantidas
--      para compatibilidade, mas os parâmetros de id de usuário são ignorados.
--   3. Remove políticas RLS que permitiam INSERT irrestrito em `agendamentos`
--      e `clientes` e leitura pública de `indisponibilidades`.
--   4. Nova RPC `horarios_disponiveis_publico`, fonte única do cálculo de
--      horários livres (a API em TypeScript passa a apenas chamá-la).
--   5. Índices para as consultas de agenda.
-- =============================================================================

BEGIN;

-- ── 0. Índices ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agendamentos_user_data
  ON public.agendamentos (user_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente_user
  ON public.agendamentos (cliente_user_id);
CREATE INDEX IF NOT EXISTS idx_indisponibilidades_user
  ON public.indisponibilidades (user_id);
CREATE INDEX IF NOT EXISTS idx_clientes_user_whatsapp
  ON public.clientes (user_id, whatsapp);

-- ── 1. Helper interno: verifica conflito de horário ─────────────────────────
-- Retorna TRUE se o intervalo [p_inicio, p_fim) conflita com algum
-- agendamento ativo do profissional (ignorando p_ignorar_agendamento) e,
-- opcionalmente, com indisponibilidades cadastradas.
CREATE OR REPLACE FUNCTION public.sm_horario_conflita(
  p_profissional_id UUID,
  p_inicio TIMESTAMPTZ,
  p_fim TIMESTAMPTZ,
  p_ignorar_agendamento UUID DEFAULT NULL,
  p_checar_bloqueios BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_inicio TIMESTAMP := p_inicio AT TIME ZONE 'America/Manaus';
  v_data_local DATE := (p_inicio AT TIME ZONE 'America/Manaus')::DATE;
  v_dow INTEGER := EXTRACT(DOW FROM (p_inicio AT TIME ZONE 'America/Manaus'))::INTEGER;
  v_ini_min INTEGER;
  v_fim_min INTEGER;
BEGIN
  -- Conflito com agendamentos ativos
  IF EXISTS (
    SELECT 1
    FROM public.agendamentos ag
    LEFT JOIN public.servicos sv ON sv.id = ag.servico_id
    WHERE ag.user_id = p_profissional_id
      AND ag.status NOT IN ('Cancelado', 'Não Compareceu')
      AND (p_ignorar_agendamento IS NULL OR ag.id <> p_ignorar_agendamento)
      AND ag.data_hora < p_fim
      AND ag.data_hora + make_interval(mins => COALESCE(sv.duracao_minutos, 30)) > p_inicio
  ) THEN
    RETURN TRUE;
  END IF;

  IF NOT p_checar_bloqueios THEN
    RETURN FALSE;
  END IF;

  -- Dia inteiro bloqueado (pontual ou recorrente)
  IF EXISTS (
    SELECT 1 FROM public.indisponibilidades
    WHERE user_id = p_profissional_id
      AND tipo = 'dia_inteiro'
      AND (
        (recorrente = false AND data_inicio IS NOT NULL
          AND (data_inicio AT TIME ZONE 'America/Manaus')::DATE = v_data_local)
        OR (recorrente = true AND dia_semana = v_dow)
      )
  ) THEN
    RETURN TRUE;
  END IF;

  -- Bloqueio de horário pontual (timestamps absolutos)
  IF EXISTS (
    SELECT 1 FROM public.indisponibilidades
    WHERE user_id = p_profissional_id
      AND tipo = 'horario'
      AND recorrente = false
      AND data_inicio IS NOT NULL AND data_fim IS NOT NULL
      AND data_inicio < p_fim
      AND data_fim > p_inicio
  ) THEN
    RETURN TRUE;
  END IF;

  -- Bloqueio de horário recorrente (compara minutos do dia no fuso de Manaus)
  v_ini_min := EXTRACT(HOUR FROM v_local_inicio)::INTEGER * 60 + EXTRACT(MINUTE FROM v_local_inicio)::INTEGER;
  v_fim_min := v_ini_min + (EXTRACT(EPOCH FROM (p_fim - p_inicio)) / 60)::INTEGER;

  IF EXISTS (
    SELECT 1 FROM public.indisponibilidades b,
      LATERAL (
        SELECT
          EXTRACT(HOUR FROM (b.data_inicio AT TIME ZONE 'America/Manaus'))::INTEGER * 60
            + EXTRACT(MINUTE FROM (b.data_inicio AT TIME ZONE 'America/Manaus'))::INTEGER AS b_ini,
          EXTRACT(HOUR FROM (b.data_fim AT TIME ZONE 'America/Manaus'))::INTEGER * 60
            + EXTRACT(MINUTE FROM (b.data_fim AT TIME ZONE 'America/Manaus'))::INTEGER AS b_fim
      ) m
    WHERE b.user_id = p_profissional_id
      AND b.tipo = 'horario'
      AND b.recorrente = true
      AND b.dia_semana = v_dow
      AND b.data_inicio IS NOT NULL AND b.data_fim IS NOT NULL
      AND v_ini_min < m.b_fim
      AND v_fim_min > m.b_ini
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.sm_horario_conflita(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

-- ── 2. RPC pública: horários disponíveis (fonte única do cálculo) ──────────
-- Grade: início entre 07:00 e 22:00 (a cada 30 min), término até 22:30,
-- somente horários futuros. Retorna "HH:mm" no fuso de Manaus.
CREATE OR REPLACE FUNCTION public.horarios_disponiveis_publico(
  p_profissional_id UUID,
  p_data DATE,
  p_duracao_minutos INTEGER DEFAULT 30
)
RETURNS TABLE (horario TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duracao INTEGER := LEAST(GREATEST(COALESCE(p_duracao_minutos, 30), 5), 480);
  v_min INTEGER;
  v_inicio TIMESTAMPTZ;
BEGIN
  FOR v_min IN (7 * 60)..(22 * 60) BY 30 LOOP
    IF v_min + v_duracao > 22 * 60 + 30 THEN
      CONTINUE;
    END IF;

    v_inicio := (p_data::TIMESTAMP + make_interval(mins => v_min)) AT TIME ZONE 'America/Manaus';

    IF v_inicio <= NOW() THEN
      CONTINUE;
    END IF;

    IF NOT public.sm_horario_conflita(
      p_profissional_id, v_inicio, v_inicio + make_interval(mins => v_duracao)
    ) THEN
      horario := LPAD((v_min / 60)::TEXT, 2, '0') || ':' || LPAD((v_min % 60)::TEXT, 2, '0');
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.horarios_disponiveis_publico(UUID, DATE, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.horarios_disponiveis_publico(UUID, DATE, INTEGER)
  TO anon, authenticated;

-- A RPC antiga passa a delegar para a nova (mesmo resultado em todo lugar).
-- Obs.: as migrations 006 e 011 falham com "cannot change return type" se a
-- versão da 004 existir; por isso removemos todas as versões antes.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_horarios_disponiveis'
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;

CREATE FUNCTION public.get_horarios_disponiveis(
  p_profissional_id UUID,
  p_data DATE,
  p_duracao_minutos INTEGER DEFAULT 30
)
RETURNS TABLE (horario TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.horario FROM public.horarios_disponiveis_publico(p_profissional_id, p_data, p_duracao_minutos) h;
$$;

REVOKE ALL ON FUNCTION public.get_horarios_disponiveis(UUID, DATE, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_horarios_disponiveis(UUID, DATE, INTEGER) TO anon, authenticated;

-- ── 3. RPC: criar agendamento público ──────────────────────────────────────
-- Remove TODAS as versões antigas (sobrecargas de migrations anteriores).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'criar_agendamento_publico'
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;

CREATE FUNCTION public.criar_agendamento_publico(
  p_codigo_profissional VARCHAR(4),
  p_servico_id UUID,
  p_data_hora TIMESTAMPTZ,
  p_local TEXT,
  p_forma_pagamento TEXT,
  p_cliente_nome TEXT,
  p_cliente_whatsapp TEXT,
  p_cliente_email TEXT DEFAULT NULL,
  p_cliente_user_id UUID DEFAULT NULL, -- ignorado: usa auth.uid()
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_prof RECORD;
  v_serv RECORD;
  v_cliente_id UUID := NULL;
  v_clean_whatsapp TEXT;
  v_agendamento RECORD;
  v_local local_agendamento;
  v_preco NUMERIC(10,2);
  v_duracao INTEGER;
  v_local_ts TIMESTAMP;
  v_min_dia INTEGER;
  v_nome TEXT := LEFT(TRIM(COALESCE(p_cliente_nome, '')), 120);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'É necessário estar logado(a) para agendar um horário.'
      USING ERRCODE = '28000';
  END IF;

  IF v_nome = '' THEN
    RAISE EXCEPTION 'Informe o nome da cliente.' USING ERRCODE = '22023';
  END IF;

  -- 1. Profissional
  SELECT id, nome, nome_studio, email, whatsapp, codigo_profissional
  INTO v_prof
  FROM public.perfis
  WHERE codigo_profissional = TRIM(p_codigo_profissional)
    AND tipo_usuario = 'profissional';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profissional com código #% não encontrado.', p_codigo_profissional
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Serviço
  SELECT id, nome, categoria, preco_base, preco_promocional, promocao_ativa, duracao_minutos, ativo
  INTO v_serv
  FROM public.servicos
  WHERE id = p_servico_id AND user_id = v_prof.id;

  IF NOT FOUND OR NOT v_serv.ativo THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo.' USING ERRCODE = 'P0002';
  END IF;

  v_duracao := COALESCE(v_serv.duracao_minutos, 30);

  -- 3. Valida data/hora: futura, na grade de 30 min, dentro do expediente
  IF p_data_hora IS NULL OR p_data_hora <= NOW() THEN
    RAISE EXCEPTION 'Escolha um horário futuro.' USING ERRCODE = '22023';
  END IF;

  v_local_ts := p_data_hora AT TIME ZONE 'America/Manaus';
  v_min_dia := EXTRACT(HOUR FROM v_local_ts)::INTEGER * 60 + EXTRACT(MINUTE FROM v_local_ts)::INTEGER;

  IF EXTRACT(SECOND FROM v_local_ts) <> 0
     OR v_min_dia % 30 <> 0
     OR v_min_dia < 7 * 60
     OR v_min_dia > 22 * 60
     OR v_min_dia + v_duracao > 22 * 60 + 30 THEN
    RAISE EXCEPTION 'Horário fora do expediente disponível.' USING ERRCODE = '22023';
  END IF;

  -- 4. Lock por profissional: serializa agendamentos concorrentes
  PERFORM pg_advisory_xact_lock(hashtextextended(v_prof.id::TEXT, 0));

  IF public.sm_horario_conflita(v_prof.id, p_data_hora, p_data_hora + make_interval(mins => v_duracao)) THEN
    RAISE EXCEPTION 'Este horário acabou de ser ocupado. Por favor, escolha outro.'
      USING ERRCODE = '23P01';
  END IF;

  -- 5. Preço (promoção se ativa)
  v_preco := CASE
    WHEN v_serv.promocao_ativa AND v_serv.preco_promocional IS NOT NULL
    THEN v_serv.preco_promocional
    ELSE v_serv.preco_base
  END;

  -- 6. Cliente (localiza por WhatsApp ou cria)
  v_clean_whatsapp := LEFT(REGEXP_REPLACE(COALESCE(p_cliente_whatsapp, ''), '\D', '', 'g'), 20);

  IF v_clean_whatsapp <> '' THEN
    SELECT id INTO v_cliente_id
    FROM public.clientes
    WHERE user_id = v_prof.id AND whatsapp = v_clean_whatsapp
    LIMIT 1;
  END IF;

  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (user_id, nome, whatsapp)
    VALUES (v_prof.id, v_nome, NULLIF(v_clean_whatsapp, ''))
    RETURNING id INTO v_cliente_id;
  END IF;

  v_local := CASE WHEN p_local = 'Domicílio'
    THEN 'Domicílio'::local_agendamento
    ELSE 'Studio'::local_agendamento END;

  -- 7. Agendamento
  INSERT INTO public.agendamentos (
    user_id, cliente_id, cliente_user_id, servico_id,
    data_hora, valor_final, forma_pagamento, status, local, observacoes
  ) VALUES (
    v_prof.id, v_cliente_id, v_uid, v_serv.id,
    p_data_hora, v_preco, NULLIF(LEFT(TRIM(COALESCE(p_forma_pagamento, '')), 120), ''),
    'Agendado'::status_agendamento, v_local,
    NULLIF(LEFT(TRIM(COALESCE(p_observacoes, '')), 1000), '')
  )
  RETURNING * INTO v_agendamento;

  RETURN jsonb_build_object(
    'id', v_agendamento.id,
    'user_id', v_agendamento.user_id,
    'cliente_id', v_agendamento.cliente_id,
    'cliente_user_id', v_agendamento.cliente_user_id,
    'servico_id', v_agendamento.servico_id,
    'data_hora', v_agendamento.data_hora,
    'valor_final', v_agendamento.valor_final,
    'forma_pagamento', v_agendamento.forma_pagamento,
    'status', v_agendamento.status,
    'local', v_agendamento.local,
    'observacoes', v_agendamento.observacoes,
    'profissional', jsonb_build_object(
      'id', v_prof.id, 'nome', v_prof.nome, 'nome_studio', v_prof.nome_studio,
      'whatsapp', v_prof.whatsapp, 'email', v_prof.email
    ),
    'servicos', jsonb_build_object(
      'id', v_serv.id, 'nome', v_serv.nome, 'categoria', v_serv.categoria,
      'preco_base', v_serv.preco_base, 'preco_promocional', v_serv.preco_promocional,
      'promocao_ativa', v_serv.promocao_ativa, 'duracao_minutos', v_serv.duracao_minutos
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.criar_agendamento_publico(VARCHAR, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_agendamento_publico(VARCHAR, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT)
  TO authenticated;

-- ── 4. RPC: cancelamento pela cliente (usa auth.uid()) ──────────────────────
CREATE OR REPLACE FUNCTION public.cancelar_agendamento_cliente(
  p_agendamento_id UUID,
  p_cliente_user_id UUID -- ignorado: usa auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_ag RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '28000';
  END IF;

  SELECT id, data_hora, status
  INTO v_ag
  FROM public.agendamentos
  WHERE id = p_agendamento_id
    AND cliente_user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado ou sem permissão.' USING ERRCODE = 'P0002';
  END IF;

  IF v_ag.status NOT IN ('Agendado', 'Confirmado') THEN
    RAISE EXCEPTION 'Este agendamento não pode ser cancelado (status: %).', v_ag.status
      USING ERRCODE = '22023';
  END IF;

  IF v_ag.data_hora <= NOW() + INTERVAL '2 hours' THEN
    RAISE EXCEPTION 'Não é possível cancelar com menos de 2 horas de antecedência. Entre em contato com o profissional pelo WhatsApp.'
      USING ERRCODE = '22023';
  END IF;

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

REVOKE ALL ON FUNCTION public.cancelar_agendamento_cliente(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_agendamento_cliente(UUID, UUID) TO authenticated;

-- ── 5. RPC: reagendamento pelo profissional (usa auth.uid() + conflito) ─────
CREATE OR REPLACE FUNCTION public.reagendar_agendamento(
  p_agendamento_id UUID,
  p_profissional_user_id UUID, -- ignorado: usa auth.uid()
  p_nova_data_hora TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_ag RECORD;
  v_duracao INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '28000';
  END IF;

  IF p_nova_data_hora IS NULL OR p_nova_data_hora <= NOW() THEN
    RAISE EXCEPTION 'Escolha um horário futuro.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::TEXT, 0));

  SELECT ag.id, ag.status, COALESCE(sv.duracao_minutos, 30) AS duracao
  INTO v_ag
  FROM public.agendamentos ag
  LEFT JOIN public.servicos sv ON sv.id = ag.servico_id
  WHERE ag.id = p_agendamento_id
    AND ag.user_id = v_uid
  FOR UPDATE OF ag;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado ou sem permissão.' USING ERRCODE = 'P0002';
  END IF;

  IF v_ag.status IN ('Concluído', 'Cancelado', 'Não Compareceu') THEN
    RAISE EXCEPTION 'Não é possível reagendar um agendamento com status: %.', v_ag.status
      USING ERRCODE = '22023';
  END IF;

  v_duracao := v_ag.duracao;

  -- Profissional pode reagendar sobre os próprios bloqueios, mas não sobre
  -- outro agendamento ativo.
  IF public.sm_horario_conflita(
       v_uid, p_nova_data_hora, p_nova_data_hora + make_interval(mins => v_duracao),
       p_agendamento_id, FALSE
     ) THEN
    RAISE EXCEPTION 'Já existe outro agendamento nesse horário.' USING ERRCODE = '23P01';
  END IF;

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

REVOKE ALL ON FUNCTION public.reagendar_agendamento(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reagendar_agendamento(UUID, UUID, TIMESTAMPTZ) TO authenticated;

-- ── 6. Políticas RLS permissivas demais ─────────────────────────────────────
-- Inserções públicas passam exclusivamente pela RPC criar_agendamento_publico.
DROP POLICY IF EXISTS "agendamentos_insert_publico" ON public.agendamentos;
DROP POLICY IF EXISTS "clientes_insert_publico" ON public.clientes;
-- Bloqueios só são lidos pelo dono; o público usa horarios_disponiveis_publico.
DROP POLICY IF EXISTS "indisponibilidades_select_publico" ON public.indisponibilidades;

COMMIT;

-- Verificação rápida (opcional): deve listar só políticas com auth.uid().
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('agendamentos', 'clientes', 'indisponibilidades');
