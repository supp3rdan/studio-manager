-- Studio Manager — Migração 013: Expediente, lembretes, reagendamento pela
-- cliente, checagem de conflito do profissional e lista de espera
-- =============================================================================
-- ORDEM: execute ESTE SQL ANTES do merge da versão 0.13.0.
-- É compatível com o código atual em produção: só acrescenta tabelas,
-- colunas e funções; as funções existentes mantêm assinatura e, sem
-- expediente configurado, o mesmo comportamento (07:00–22:30, a cada 30 min).
-- Idempotente e transacional.
--
-- Ao final, o SQL Editor mostra o valor de `cron_secret`: copie-o para a
-- variável de ambiente CRON_SECRET na Vercel.
-- =============================================================================

BEGIN;

-- ── 0. Configuração interna (segredo do sistema) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.sm_config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.sm_config ENABLE ROW LEVEL SECURITY; -- sem políticas: ninguém lê via API
REVOKE ALL ON public.sm_config FROM anon, authenticated;

INSERT INTO public.sm_config (chave, valor)
VALUES (
  'cron_secret',
  REPLACE(gen_random_uuid()::TEXT, '-', '') || REPLACE(gen_random_uuid()::TEXT, '-', '')
)
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sm_validar_segredo(p_segredo TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_segredo IS NULL OR length(p_segredo) < 32 OR NOT EXISTS (
    SELECT 1 FROM public.sm_config WHERE chave = 'cron_secret' AND valor = p_segredo
  ) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.sm_validar_segredo(TEXT) FROM PUBLIC, anon, authenticated;

-- ── 1. Expediente configurável ──────────────────────────────────────────────
ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS agenda_intervalo_min INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS agenda_buffer_min INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfis_agenda_intervalo_chk') THEN
    ALTER TABLE public.perfis ADD CONSTRAINT perfis_agenda_intervalo_chk
      CHECK (agenda_intervalo_min IN (10, 15, 20, 30, 40, 45, 60));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfis_agenda_buffer_chk') THEN
    ALTER TABLE public.perfis ADD CONSTRAINT perfis_agenda_buffer_chk
      CHECK (agenda_buffer_min BETWEEN 0 AND 120);
  END IF;
END $$;

-- Uma linha por dia da semana. Sem nenhuma linha = padrão 07:00–22:30 todos os dias.
-- `fim` é o horário máximo de TÉRMINO do atendimento.
CREATE TABLE IF NOT EXISTS public.expedientes (
  user_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  inicio TIME NOT NULL,
  fim TIME NOT NULL,
  PRIMARY KEY (user_id, dia_semana),
  CHECK (fim > inicio)
);
ALTER TABLE public.expedientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expedientes_own" ON public.expedientes;
CREATE POLICY "expedientes_own" ON public.expedientes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expedientes TO authenticated;

-- Expediente efetivo de um dia (em minutos desde 00:00, fuso de Manaus)
CREATE OR REPLACE FUNCTION public.sm_expediente_do_dia(p_profissional_id UUID, p_data DATE)
RETURNS TABLE (aberto BOOLEAN, inicio_min INTEGER, fim_min INTEGER, intervalo_min INTEGER, buffer_min INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exp RECORD;
  v_intervalo INTEGER := 30;
  v_buffer INTEGER := 0;
BEGIN
  SELECT COALESCE(p.agenda_intervalo_min, 30), COALESCE(p.agenda_buffer_min, 0)
  INTO v_intervalo, v_buffer
  FROM public.perfis p WHERE p.id = p_profissional_id;

  v_intervalo := COALESCE(v_intervalo, 30);
  v_buffer := COALESCE(v_buffer, 0);

  IF NOT EXISTS (SELECT 1 FROM public.expedientes e WHERE e.user_id = p_profissional_id) THEN
    RETURN QUERY SELECT TRUE, 7 * 60, 22 * 60 + 30, v_intervalo, v_buffer;
    RETURN;
  END IF;

  SELECT * INTO v_exp FROM public.expedientes e
  WHERE e.user_id = p_profissional_id
    AND e.dia_semana = EXTRACT(DOW FROM p_data)::SMALLINT;

  IF NOT FOUND OR NOT v_exp.ativo THEN
    RETURN QUERY SELECT FALSE, 0, 0, v_intervalo, v_buffer;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE,
    (EXTRACT(HOUR FROM v_exp.inicio) * 60 + EXTRACT(MINUTE FROM v_exp.inicio))::INTEGER,
    (EXTRACT(HOUR FROM v_exp.fim) * 60 + EXTRACT(MINUTE FROM v_exp.fim))::INTEGER,
    v_intervalo, v_buffer;
END;
$$;
REVOKE ALL ON FUNCTION public.sm_expediente_do_dia(UUID, DATE) FROM PUBLIC, anon, authenticated;

-- Salvar expediente (profissional logado)
CREATE OR REPLACE FUNCTION public.salvar_expediente(
  p_dias JSONB,           -- [{ "dia_semana":1, "ativo":true, "inicio":"08:00", "fim":"18:00" }, ...]
  p_intervalo_min INTEGER,
  p_buffer_min INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_dia JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.perfis WHERE id = v_uid AND tipo_usuario = 'profissional') THEN
    RAISE EXCEPTION 'Apenas profissionais podem configurar expediente.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_dias) <> 'array' OR jsonb_array_length(p_dias) <> 7 THEN
    RAISE EXCEPTION 'Informe os 7 dias da semana.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.perfis
  SET agenda_intervalo_min = p_intervalo_min,
      agenda_buffer_min = p_buffer_min
  WHERE id = v_uid;

  FOR v_dia IN SELECT * FROM jsonb_array_elements(p_dias) LOOP
    IF (v_dia->>'ativo')::BOOLEAN AND (v_dia->>'fim')::TIME <= (v_dia->>'inicio')::TIME THEN
      RAISE EXCEPTION 'O horário final deve ser depois do inicial.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.expedientes (user_id, dia_semana, ativo, inicio, fim)
    VALUES (
      v_uid,
      (v_dia->>'dia_semana')::SMALLINT,
      (v_dia->>'ativo')::BOOLEAN,
      COALESCE((v_dia->>'inicio')::TIME, '08:00'),
      GREATEST(COALESCE((v_dia->>'fim')::TIME, '18:00'), COALESCE((v_dia->>'inicio')::TIME, '08:00') + INTERVAL '1 minute')
    )
    ON CONFLICT (user_id, dia_semana) DO UPDATE
    SET ativo = EXCLUDED.ativo, inicio = EXCLUDED.inicio, fim = EXCLUDED.fim;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_expediente(JSONB, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_expediente(JSONB, INTEGER, INTEGER) TO authenticated;

-- ── 2. Conflito considera o intervalo entre atendimentos (buffer) ───────────
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
  v_buffer INTERVAL;
  v_ini_min INTEGER;
  v_fim_min INTEGER;
BEGIN
  SELECT make_interval(mins => COALESCE(agenda_buffer_min, 0))
  INTO v_buffer FROM public.perfis WHERE id = p_profissional_id;
  v_buffer := COALESCE(v_buffer, INTERVAL '0');

  IF EXISTS (
    SELECT 1
    FROM public.agendamentos ag
    LEFT JOIN public.servicos sv ON sv.id = ag.servico_id
    WHERE ag.user_id = p_profissional_id
      AND ag.status NOT IN ('Cancelado', 'Não Compareceu')
      AND (p_ignorar_agendamento IS NULL OR ag.id <> p_ignorar_agendamento)
      AND ag.data_hora < p_fim + v_buffer
      AND ag.data_hora + make_interval(mins => COALESCE(sv.duracao_minutos, 30)) + v_buffer > p_inicio
  ) THEN
    RETURN TRUE;
  END IF;

  IF NOT p_checar_bloqueios THEN
    RETURN FALSE;
  END IF;

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

-- ── 3. Slots livres (interno, com opção de ignorar um agendamento) ──────────
CREATE OR REPLACE FUNCTION public.sm_slots_livres(
  p_profissional_id UUID,
  p_data DATE,
  p_duracao_minutos INTEGER,
  p_ignorar_agendamento UUID DEFAULT NULL
)
RETURNS TABLE (horario TEXT, inicio TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duracao INTEGER := LEAST(GREATEST(COALESCE(p_duracao_minutos, 30), 5), 480);
  v_exp RECORD;
  v_min INTEGER;
  v_inicio TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_exp FROM public.sm_expediente_do_dia(p_profissional_id, p_data);
  IF NOT v_exp.aberto THEN
    RETURN;
  END IF;

  v_min := v_exp.inicio_min;
  WHILE v_min + v_duracao <= v_exp.fim_min LOOP
    v_inicio := (p_data::TIMESTAMP + make_interval(mins => v_min)) AT TIME ZONE 'America/Manaus';

    IF v_inicio > NOW() AND NOT public.sm_horario_conflita(
      p_profissional_id, v_inicio, v_inicio + make_interval(mins => v_duracao), p_ignorar_agendamento
    ) THEN
      horario := LPAD((v_min / 60)::TEXT, 2, '0') || ':' || LPAD((v_min % 60)::TEXT, 2, '0');
      inicio := v_inicio;
      RETURN NEXT;
    END IF;

    v_min := v_min + v_exp.intervalo_min;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.sm_slots_livres(UUID, DATE, INTEGER, UUID) FROM PUBLIC, anon, authenticated;

-- Pública (mesma assinatura da 012)
CREATE OR REPLACE FUNCTION public.horarios_disponiveis_publico(
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
  SELECT s.horario FROM public.sm_slots_livres(p_profissional_id, p_data, p_duracao_minutos, NULL) s;
$$;

-- ── 4. Colunas de confirmação/lembrete em agendamentos ──────────────────────
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS token_publico UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS lembrete_enviado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamentos_token_publico ON public.agendamentos (token_publico);
CREATE INDEX IF NOT EXISTS idx_agendamentos_lembrete_pendente
  ON public.agendamentos (data_hora) WHERE lembrete_enviado_em IS NULL AND status = 'Agendado';

-- Mudou a data/hora? O lembrete e a confirmação precisam ser refeitos.
CREATE OR REPLACE FUNCTION public.sm_agendamento_reset_lembrete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.data_hora IS DISTINCT FROM OLD.data_hora THEN
    NEW.lembrete_enviado_em := NULL;
    NEW.confirmado_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_reset_lembrete ON public.agendamentos;
CREATE TRIGGER trg_agendamento_reset_lembrete
  BEFORE UPDATE OF data_hora ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.sm_agendamento_reset_lembrete();

-- ── 5. Criar agendamento público (mesma assinatura; usa expediente) ─────────
CREATE OR REPLACE FUNCTION public.criar_agendamento_publico(
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
  v_nome TEXT := LEFT(TRIM(COALESCE(p_cliente_nome, '')), 120);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'É necessário estar logado(a) para agendar um horário.' USING ERRCODE = '28000';
  END IF;
  IF v_nome = '' THEN
    RAISE EXCEPTION 'Informe o nome da cliente.' USING ERRCODE = '22023';
  END IF;

  SELECT id, nome, nome_studio, email, whatsapp, codigo_profissional INTO v_prof
  FROM public.perfis
  WHERE codigo_profissional = TRIM(p_codigo_profissional) AND tipo_usuario = 'profissional';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profissional com código #% não encontrado.', p_codigo_profissional USING ERRCODE = 'P0002';
  END IF;

  SELECT id, nome, categoria, preco_base, preco_promocional, promocao_ativa, duracao_minutos, ativo INTO v_serv
  FROM public.servicos WHERE id = p_servico_id AND user_id = v_prof.id;
  IF NOT FOUND OR NOT v_serv.ativo THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo.' USING ERRCODE = 'P0002';
  END IF;

  v_duracao := COALESCE(v_serv.duracao_minutos, 30);

  IF p_data_hora IS NULL OR p_data_hora <= NOW() THEN
    RAISE EXCEPTION 'Escolha um horário futuro.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_prof.id::TEXT, 0));

  -- O horário precisa ser exatamente um dos slots livres (expediente + grade + conflito)
  IF NOT EXISTS (
    SELECT 1 FROM public.sm_slots_livres(v_prof.id, (p_data_hora AT TIME ZONE 'America/Manaus')::DATE, v_duracao) s
    WHERE s.inicio = p_data_hora
  ) THEN
    IF public.sm_horario_conflita(v_prof.id, p_data_hora, p_data_hora + make_interval(mins => v_duracao)) THEN
      RAISE EXCEPTION 'Este horário acabou de ser ocupado. Por favor, escolha outro.' USING ERRCODE = '23P01';
    END IF;
    RAISE EXCEPTION 'Horário fora do expediente disponível.' USING ERRCODE = '22023';
  END IF;

  v_preco := CASE
    WHEN v_serv.promocao_ativa AND v_serv.preco_promocional IS NOT NULL THEN v_serv.preco_promocional
    ELSE v_serv.preco_base
  END;

  v_clean_whatsapp := LEFT(REGEXP_REPLACE(COALESCE(p_cliente_whatsapp, ''), '\D', '', 'g'), 20);
  IF v_clean_whatsapp <> '' THEN
    SELECT id INTO v_cliente_id FROM public.clientes
    WHERE user_id = v_prof.id AND whatsapp = v_clean_whatsapp LIMIT 1;
  END IF;
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (user_id, nome, whatsapp)
    VALUES (v_prof.id, v_nome, NULLIF(v_clean_whatsapp, ''))
    RETURNING id INTO v_cliente_id;
  END IF;

  v_local := CASE WHEN p_local = 'Domicílio' THEN 'Domicílio'::local_agendamento ELSE 'Studio'::local_agendamento END;

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

  -- Saiu da lista de espera desse dia, se estava nela
  UPDATE public.lista_espera
  SET status = 'atendido'
  WHERE profissional_id = v_prof.id AND cliente_user_id = v_uid
    AND data = (p_data_hora AT TIME ZONE 'America/Manaus')::DATE
    AND status IN ('aguardando', 'notificado');

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
    'token_publico', v_agendamento.token_publico,
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

-- ── 6. Confirmação de presença pelo link do e-mail ──────────────────────────
CREATE OR REPLACE FUNCTION public.agendamento_por_token(p_token UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', a.id,
    'data_hora', a.data_hora,
    'status', a.status,
    'local', a.local,
    'confirmado_em', a.confirmado_em,
    'servico_nome', s.nome,
    'duracao_minutos', COALESCE(s.duracao_minutos, 30),
    'studio_nome', COALESCE(NULLIF(p.nome_studio, ''), p.nome),
    'profissional_whatsapp', p.whatsapp,
    'cliente_primeiro_nome', split_part(COALESCE(c.nome, ''), ' ', 1),
    'pode_confirmar', a.status = 'Agendado' AND a.data_hora > NOW(),
    'pode_remarcar', a.status IN ('Agendado', 'Confirmado') AND a.data_hora > NOW() + INTERVAL '2 hours'
      AND a.cliente_user_id IS NOT NULL
  )
  FROM public.agendamentos a
  LEFT JOIN public.servicos s ON s.id = a.servico_id
  LEFT JOIN public.perfis p ON p.id = a.user_id
  LEFT JOIN public.clientes c ON c.id = a.cliente_id
  WHERE a.token_publico = p_token;
$$;
REVOKE ALL ON FUNCTION public.agendamento_por_token(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agendamento_por_token(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirmar_presenca(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag RECORD;
BEGIN
  SELECT id, status, data_hora INTO v_ag
  FROM public.agendamentos WHERE token_publico = p_token FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_ag.status = 'Confirmado' THEN
    RETURN jsonb_build_object('success', true, 'status', 'Confirmado', 'ja_confirmado', true);
  END IF;
  IF v_ag.status <> 'Agendado' THEN
    RAISE EXCEPTION 'Este agendamento não pode mais ser confirmado (status: %).', v_ag.status USING ERRCODE = '22023';
  END IF;
  IF v_ag.data_hora <= NOW() THEN
    RAISE EXCEPTION 'Este horário já passou.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.agendamentos
  SET status = 'Confirmado', confirmado_em = NOW(), atualizado_em = NOW()
  WHERE id = v_ag.id;

  RETURN jsonb_build_object('success', true, 'status', 'Confirmado', 'ja_confirmado', false);
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_presenca(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_presenca(UUID) TO anon, authenticated;

-- ── 7. Reagendamento pela própria cliente ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.reagendar_agendamento_cliente(
  p_agendamento_id UUID,
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '28000';
  END IF;

  SELECT a.id, a.user_id, a.status, a.data_hora, COALESCE(s.duracao_minutos, 30) AS duracao
  INTO v_ag
  FROM public.agendamentos a
  LEFT JOIN public.servicos s ON s.id = a.servico_id
  WHERE a.id = p_agendamento_id AND a.cliente_user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado ou sem permissão.' USING ERRCODE = 'P0002';
  END IF;
  IF v_ag.status NOT IN ('Agendado', 'Confirmado') THEN
    RAISE EXCEPTION 'Este agendamento não pode ser remarcado (status: %).', v_ag.status USING ERRCODE = '22023';
  END IF;
  IF v_ag.data_hora <= NOW() + INTERVAL '2 hours' THEN
    RAISE EXCEPTION 'Não é possível remarcar com menos de 2 horas de antecedência. Entre em contato com o profissional pelo WhatsApp.'
      USING ERRCODE = '22023';
  END IF;
  IF p_nova_data_hora IS NULL OR p_nova_data_hora <= NOW() THEN
    RAISE EXCEPTION 'Escolha um horário futuro.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_ag.user_id::TEXT, 0));

  IF NOT EXISTS (
    SELECT 1 FROM public.sm_slots_livres(
      v_ag.user_id, (p_nova_data_hora AT TIME ZONE 'America/Manaus')::DATE, v_ag.duracao, v_ag.id
    ) s WHERE s.inicio = p_nova_data_hora
  ) THEN
    RAISE EXCEPTION 'Este horário não está disponível. Por favor, escolha outro.' USING ERRCODE = '23P01';
  END IF;

  UPDATE public.agendamentos
  SET data_hora = p_nova_data_hora, status = 'Agendado', atualizado_em = NOW()
  WHERE id = v_ag.id;

  RETURN jsonb_build_object(
    'success', true,
    'agendamento_id', v_ag.id,
    'profissional_id', v_ag.user_id,
    'data_hora_anterior', v_ag.data_hora,
    'nova_data_hora', p_nova_data_hora
  );
END;
$$;
REVOKE ALL ON FUNCTION public.reagendar_agendamento_cliente(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reagendar_agendamento_cliente(UUID, TIMESTAMPTZ) TO authenticated;

-- ── 8. Conflitos para o formulário manual do profissional ───────────────────
CREATE OR REPLACE FUNCTION public.conflitos_agenda(
  p_data_hora TIMESTAMPTZ,
  p_duracao_minutos INTEGER,
  p_ignorar_agendamento UUID DEFAULT NULL
)
RETURNS TABLE (tipo TEXT, descricao TEXT, inicio TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_dur INTERVAL := make_interval(mins => LEAST(GREATEST(COALESCE(p_duracao_minutos, 30), 5), 480));
  v_fim TIMESTAMPTZ := p_data_hora + v_dur;
  v_buffer INTERVAL;
  v_data DATE := (p_data_hora AT TIME ZONE 'America/Manaus')::DATE;
  v_dow INTEGER := EXTRACT(DOW FROM (p_data_hora AT TIME ZONE 'America/Manaus'))::INTEGER;
  v_ini_min INTEGER;
  v_fim_min INTEGER;
  v_exp RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '28000';
  END IF;

  SELECT make_interval(mins => COALESCE(agenda_buffer_min, 0)) INTO v_buffer FROM public.perfis WHERE id = v_uid;
  v_buffer := COALESCE(v_buffer, INTERVAL '0');

  RETURN QUERY
  SELECT 'agendamento'::TEXT,
         COALESCE(c.nome, 'Cliente') || ' — ' || COALESCE(s.nome, 'Serviço'),
         a.data_hora
  FROM public.agendamentos a
  LEFT JOIN public.servicos s ON s.id = a.servico_id
  LEFT JOIN public.clientes c ON c.id = a.cliente_id
  WHERE a.user_id = v_uid
    AND a.status NOT IN ('Cancelado', 'Não Compareceu')
    AND (p_ignorar_agendamento IS NULL OR a.id <> p_ignorar_agendamento)
    AND a.data_hora < v_fim + v_buffer
    AND a.data_hora + make_interval(mins => COALESCE(s.duracao_minutos, 30)) + v_buffer > p_data_hora
  ORDER BY a.data_hora;

  v_ini_min := EXTRACT(HOUR FROM (p_data_hora AT TIME ZONE 'America/Manaus'))::INTEGER * 60
             + EXTRACT(MINUTE FROM (p_data_hora AT TIME ZONE 'America/Manaus'))::INTEGER;
  v_fim_min := v_ini_min + (EXTRACT(EPOCH FROM v_dur) / 60)::INTEGER;

  RETURN QUERY
  SELECT 'bloqueio'::TEXT, COALESCE(NULLIF(b.titulo, ''), 'Bloqueio de agenda'), b.data_inicio
  FROM public.indisponibilidades b
  WHERE b.user_id = v_uid AND (
    (b.tipo = 'dia_inteiro' AND (
      (b.recorrente = false AND (b.data_inicio AT TIME ZONE 'America/Manaus')::DATE = v_data)
      OR (b.recorrente = true AND b.dia_semana = v_dow)))
    OR (b.tipo = 'horario' AND b.recorrente = false
        AND b.data_inicio < v_fim AND b.data_fim > p_data_hora)
    OR (b.tipo = 'horario' AND b.recorrente = true AND b.dia_semana = v_dow
        AND v_ini_min < (EXTRACT(HOUR FROM (b.data_fim AT TIME ZONE 'America/Manaus')) * 60
                         + EXTRACT(MINUTE FROM (b.data_fim AT TIME ZONE 'America/Manaus')))::INTEGER
        AND v_fim_min > (EXTRACT(HOUR FROM (b.data_inicio AT TIME ZONE 'America/Manaus')) * 60
                         + EXTRACT(MINUTE FROM (b.data_inicio AT TIME ZONE 'America/Manaus')))::INTEGER)
  );

  SELECT * INTO v_exp FROM public.sm_expediente_do_dia(v_uid, v_data);
  IF NOT v_exp.aberto THEN
    RETURN QUERY SELECT 'expediente'::TEXT, 'Dia fora do seu expediente'::TEXT, p_data_hora;
  ELSIF v_ini_min < v_exp.inicio_min OR v_fim_min > v_exp.fim_min THEN
    RETURN QUERY SELECT 'expediente'::TEXT, 'Fora do horário do seu expediente'::TEXT, p_data_hora;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.conflitos_agenda(TIMESTAMPTZ, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conflitos_agenda(TIMESTAMPTZ, INTEGER, UUID) TO authenticated;

-- ── 9. Lista de espera ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lista_espera (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  cliente_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  servico_id UUID NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando', 'notificado', 'atendido', 'expirado')),
  notificado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profissional_id, cliente_user_id, servico_id, data)
);
CREATE INDEX IF NOT EXISTS idx_lista_espera_prof_data ON public.lista_espera (profissional_id, data) WHERE status = 'aguardando';

ALTER TABLE public.lista_espera ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lista_espera_select_cliente" ON public.lista_espera;
CREATE POLICY "lista_espera_select_cliente" ON public.lista_espera
  FOR SELECT USING (auth.uid() = cliente_user_id);
DROP POLICY IF EXISTS "lista_espera_delete_cliente" ON public.lista_espera;
CREATE POLICY "lista_espera_delete_cliente" ON public.lista_espera
  FOR DELETE USING (auth.uid() = cliente_user_id);
DROP POLICY IF EXISTS "lista_espera_select_profissional" ON public.lista_espera;
CREATE POLICY "lista_espera_select_profissional" ON public.lista_espera
  FOR SELECT USING (auth.uid() = profissional_id);
DROP POLICY IF EXISTS "lista_espera_delete_profissional" ON public.lista_espera;
CREATE POLICY "lista_espera_delete_profissional" ON public.lista_espera
  FOR DELETE USING (auth.uid() = profissional_id);
GRANT SELECT, DELETE ON public.lista_espera TO authenticated;

CREATE OR REPLACE FUNCTION public.entrar_lista_espera(
  p_codigo_profissional VARCHAR(4),
  p_servico_id UUID,
  p_data DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_prof_id UUID;
  v_hoje DATE := (NOW() AT TIME ZONE 'America/Manaus')::DATE;
  v_id UUID;
  v_posicao INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Faça login para entrar na lista de espera.' USING ERRCODE = '28000';
  END IF;

  SELECT id INTO v_prof_id FROM public.perfis
  WHERE codigo_profissional = TRIM(p_codigo_profissional) AND tipo_usuario = 'profissional';
  IF v_prof_id IS NULL THEN
    RAISE EXCEPTION 'Profissional não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_prof_id = v_uid THEN
    RAISE EXCEPTION 'Você não pode entrar na sua própria lista de espera.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.servicos WHERE id = p_servico_id AND user_id = v_prof_id AND ativo) THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo.' USING ERRCODE = 'P0002';
  END IF;

  IF p_data IS NULL OR p_data < v_hoje OR p_data > v_hoje + 90 THEN
    RAISE EXCEPTION 'Escolha uma data entre hoje e os próximos 90 dias.' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*) FROM public.lista_espera
      WHERE cliente_user_id = v_uid AND status = 'aguardando' AND data >= v_hoje) >= 10 THEN
    RAISE EXCEPTION 'Você já está em 10 listas de espera. Saia de alguma para entrar em outra.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.lista_espera (profissional_id, cliente_user_id, servico_id, data)
  VALUES (v_prof_id, v_uid, p_servico_id, p_data)
  ON CONFLICT (profissional_id, cliente_user_id, servico_id, data)
  DO UPDATE SET status = 'aguardando', notificado_em = NULL, criado_em = NOW()
  RETURNING id INTO v_id;

  SELECT count(*) INTO v_posicao FROM public.lista_espera le
  WHERE le.profissional_id = v_prof_id AND le.data = p_data AND le.status = 'aguardando'
    AND le.criado_em <= (SELECT criado_em FROM public.lista_espera WHERE id = v_id);

  RETURN jsonb_build_object('success', true, 'id', v_id, 'posicao', v_posicao);
END;
$$;
REVOKE ALL ON FUNCTION public.entrar_lista_espera(VARCHAR, UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entrar_lista_espera(VARCHAR, UUID, DATE) TO authenticated;

-- Profissional vê quem está esperando (nome e WhatsApp da cliente)
CREATE OR REPLACE FUNCTION public.lista_espera_do_profissional()
RETURNS TABLE (
  id UUID, data DATE, status TEXT, criado_em TIMESTAMPTZ, notificado_em TIMESTAMPTZ,
  servico_nome TEXT, cliente_nome TEXT, cliente_whatsapp TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT le.id, le.data, le.status, le.criado_em, le.notificado_em,
         s.nome, COALESCE(NULLIF(p.nome, ''), 'Cliente'), p.whatsapp
  FROM public.lista_espera le
  JOIN public.servicos s ON s.id = le.servico_id
  LEFT JOIN public.perfis p ON p.id = le.cliente_user_id
  WHERE le.profissional_id = auth.uid()
    AND le.data >= (NOW() AT TIME ZONE 'America/Manaus')::DATE
    AND le.status IN ('aguardando', 'notificado')
  ORDER BY le.data, le.criado_em;
$$;
REVOKE ALL ON FUNCTION public.lista_espera_do_profissional() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lista_espera_do_profissional() TO authenticated;

-- Cliente vê as próprias entradas (com nome do serviço e do studio)
CREATE OR REPLACE FUNCTION public.minha_lista_espera()
RETURNS TABLE (
  id UUID, data DATE, status TEXT, criado_em TIMESTAMPTZ,
  servico_nome TEXT, studio_nome TEXT, codigo_profissional TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT le.id, le.data, le.status, le.criado_em, s.nome,
         COALESCE(NULLIF(p.nome_studio, ''), p.nome), p.codigo_profissional::TEXT
  FROM public.lista_espera le
  JOIN public.servicos s ON s.id = le.servico_id
  JOIN public.perfis p ON p.id = le.profissional_id
  WHERE le.cliente_user_id = auth.uid()
    AND le.data >= (NOW() AT TIME ZONE 'America/Manaus')::DATE
    AND le.status IN ('aguardando', 'notificado')
  ORDER BY le.data;
$$;
REVOKE ALL ON FUNCTION public.minha_lista_espera() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_lista_espera() TO authenticated;

-- ── 10. Funções do sistema (chamadas pelo servidor com o CRON_SECRET) ───────
-- Lembretes: agendamentos 'Agendado' de agora+2h até o fim de amanhã (Manaus),
-- criados há mais de 1h e ainda sem lembrete.
CREATE OR REPLACE FUNCTION public.sm_lembretes_pendentes(p_segredo TEXT)
RETURNS TABLE (
  agendamento_id UUID, token_publico UUID, data_hora TIMESTAMPTZ, local TEXT,
  cliente_nome TEXT, cliente_email TEXT, servico_nome TEXT,
  studio_nome TEXT, profissional_whatsapp TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sm_validar_segredo(p_segredo);

  RETURN QUERY
  SELECT a.id, a.token_publico, a.data_hora, a.local::TEXT,
         COALESCE(NULLIF(c.nome, ''), NULLIF(pc.nome, ''), 'Cliente'),
         COALESCE(NULLIF(pc.email, ''), NULLIF(u.email, '')),
         COALESCE(s.nome, 'Procedimento'),
         COALESCE(NULLIF(pp.nome_studio, ''), pp.nome, 'Studio'),
         pp.whatsapp
  FROM public.agendamentos a
  LEFT JOIN public.clientes c ON c.id = a.cliente_id
  LEFT JOIN public.perfis pc ON pc.id = a.cliente_user_id
  LEFT JOIN auth.users u ON u.id = a.cliente_user_id
  LEFT JOIN public.servicos s ON s.id = a.servico_id
  LEFT JOIN public.perfis pp ON pp.id = a.user_id
  WHERE a.status = 'Agendado'
    AND a.lembrete_enviado_em IS NULL
    AND a.criado_em < NOW() - INTERVAL '1 hour'
    AND a.data_hora > NOW() + INTERVAL '2 hours'
    AND a.data_hora < ((((NOW() AT TIME ZONE 'America/Manaus')::DATE + 2)::TIMESTAMP) AT TIME ZONE 'America/Manaus')
    AND COALESCE(NULLIF(pc.email, ''), NULLIF(u.email, '')) IS NOT NULL
  ORDER BY a.data_hora
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.sm_marcar_lembretes_enviados(p_segredo TEXT, p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qtd INTEGER;
BEGIN
  PERFORM public.sm_validar_segredo(p_segredo);
  UPDATE public.agendamentos SET lembrete_enviado_em = NOW()
  WHERE id = ANY(p_ids) AND lembrete_enviado_em IS NULL;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  RETURN v_qtd;
END;
$$;

-- Lista de espera: devolve (e marca como notificadas) as entradas cujo dia
-- voltou a ter horário livre para o serviço. Filtros opcionais por
-- profissional e data. Também expira entradas de datas passadas.
CREATE OR REPLACE FUNCTION public.sm_lista_espera_notificar(
  p_segredo TEXT,
  p_profissional_id UUID DEFAULT NULL,
  p_data DATE DEFAULT NULL
)
RETURNS TABLE (
  id UUID, data DATE, cliente_nome TEXT, cliente_email TEXT, servico_nome TEXT,
  studio_nome TEXT, codigo_profissional TEXT, primeiro_horario TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje DATE := (NOW() AT TIME ZONE 'America/Manaus')::DATE;
BEGIN
  PERFORM public.sm_validar_segredo(p_segredo);

  UPDATE public.lista_espera le SET status = 'expirado'
  WHERE le.status IN ('aguardando', 'notificado') AND le.data < v_hoje;

  RETURN QUERY
  WITH candidatas AS (
    SELECT le.id, le.data, le.profissional_id, le.cliente_user_id, le.servico_id,
           COALESCE(s.duracao_minutos, 30) AS duracao, s.nome AS servico_nome
    FROM public.lista_espera le
    JOIN public.servicos s ON s.id = le.servico_id AND s.ativo
    WHERE le.status = 'aguardando'
      AND le.data >= v_hoje
      AND (p_profissional_id IS NULL OR le.profissional_id = p_profissional_id)
      AND (p_data IS NULL OR le.data = p_data)
    ORDER BY le.criado_em
    LIMIT 100
  ),
  com_vaga AS (
    SELECT c.*, (
      SELECT sl.horario FROM public.sm_slots_livres(c.profissional_id, c.data, c.duracao) sl LIMIT 1
    ) AS primeiro_horario
    FROM candidatas c
  ),
  marcadas AS (
    UPDATE public.lista_espera le
    SET status = 'notificado', notificado_em = NOW()
    FROM com_vaga v
    WHERE le.id = v.id AND v.primeiro_horario IS NOT NULL
    RETURNING le.id
  )
  SELECT v.id, v.data,
         COALESCE(NULLIF(pc.nome, ''), 'Cliente'),
         COALESCE(NULLIF(pc.email, ''), u.email),
         v.servico_nome,
         COALESCE(NULLIF(pp.nome_studio, ''), pp.nome, 'Studio'),
         pp.codigo_profissional::TEXT,
         v.primeiro_horario
  FROM com_vaga v
  JOIN marcadas m ON m.id = v.id
  LEFT JOIN public.perfis pc ON pc.id = v.cliente_user_id
  LEFT JOIN auth.users u ON u.id = v.cliente_user_id
  LEFT JOIN public.perfis pp ON pp.id = v.profissional_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sm_lembretes_pendentes(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sm_marcar_lembretes_enviados(TEXT, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sm_lista_espera_notificar(TEXT, UUID, DATE) FROM PUBLIC;
-- O servidor chama com a chave anon; o segredo é a autorização.
GRANT EXECUTE ON FUNCTION public.sm_lembretes_pendentes(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sm_marcar_lembretes_enviados(TEXT, UUID[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sm_lista_espera_notificar(TEXT, UUID, DATE) TO anon, authenticated;

COMMIT;

-- Copie este valor para a variável CRON_SECRET na Vercel:
SELECT valor AS cron_secret FROM public.sm_config WHERE chave = 'cron_secret';
