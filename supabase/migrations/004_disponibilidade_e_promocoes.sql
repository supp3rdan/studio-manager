-- Studio Manager — Migração 004: Disponibilidade de Horários, Duração de Serviços e Preços Promocionais
-- Execute este script no SQL Editor do Supabase

-- ============================================================
-- 1. ADICIONAR COLUNAS NA TABELA servicos
-- ============================================================

-- Duração em minutos (padrão 30)
ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS duracao_minutos INTEGER NOT NULL DEFAULT 30 CHECK (duracao_minutos > 0);

-- Preço promocional e controle de promoção
ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS preco_promocional NUMERIC(10,2) CHECK (preco_promocional >= 0),
  ADD COLUMN IF NOT EXISTS promocao_ativa BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- 2. TABELA: indisponibilidades
-- Armazena bloqueios de horários/dias do profissional
-- ============================================================
CREATE TABLE IF NOT EXISTS public.indisponibilidades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('dia_inteiro', 'horario')),
  -- Para dia inteiro: apenas data_inicio e titulo
  -- Para horario: data_inicio = início, data_fim = fim
  data_inicio     TIMESTAMPTZ NOT NULL,
  data_fim        TIMESTAMPTZ,
  titulo          TEXT,
  recorrente      BOOLEAN NOT NULL DEFAULT FALSE,
  -- Se recorrente: dia da semana (0=Dom, 1=Seg, ..., 6=Sab)
  dia_semana      INTEGER CHECK (dia_semana >= 0 AND dia_semana <= 6),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indisponibilidades_user_id    ON public.indisponibilidades(user_id);
CREATE INDEX IF NOT EXISTS idx_indisponibilidades_data_inicio ON public.indisponibilidades(data_inicio);

-- RLS para indisponibilidades
ALTER TABLE public.indisponibilidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "indisponibilidades_select" ON public.indisponibilidades
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "indisponibilidades_insert" ON public.indisponibilidades
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "indisponibilidades_update" ON public.indisponibilidades
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "indisponibilidades_delete" ON public.indisponibilidades
  FOR DELETE USING (auth.uid() = user_id);

-- Leitura pública para clientes consultarem disponibilidade
CREATE POLICY "indisponibilidades_select_publico" ON public.indisponibilidades
  FOR SELECT USING (true);

-- ============================================================
-- 3. FUNÇÃO: Buscar horários disponíveis para um profissional
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_horarios_disponiveis(
  p_profissional_id UUID,
  p_data DATE,
  p_duracao_minutos INTEGER DEFAULT 30
)
RETURNS TABLE (horario TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dia_semana INTEGER;
  v_slot_inicio TIMESTAMPTZ;
  v_slot_fim TIMESTAMPTZ;
  v_dia_inicio TIMESTAMPTZ;
  v_dia_fim TIMESTAMPTZ;
  v_ocupado BOOLEAN;
BEGIN
  v_dia_semana := EXTRACT(DOW FROM p_data::TIMESTAMPTZ);
  v_dia_inicio := (p_data::TEXT || ' 08:00:00')::TIMESTAMPTZ;
  v_dia_fim    := (p_data::TEXT || ' 22:00:00')::TIMESTAMPTZ;

  -- Verifica se o dia inteiro está bloqueado
  IF EXISTS (
    SELECT 1 FROM public.indisponibilidades
    WHERE user_id = p_profissional_id
      AND tipo = 'dia_inteiro'
      AND (
        (recorrente = false AND data_inicio::DATE = p_data)
        OR
        (recorrente = true AND dia_semana = v_dia_semana)
      )
  ) THEN
    RETURN; -- Nenhum horário disponível
  END IF;

  -- Gera slots de 30 em 30 minutos das 08h às 22h
  v_slot_inicio := v_dia_inicio;
  WHILE v_slot_inicio < v_dia_fim LOOP
    v_slot_fim := v_slot_inicio + (p_duracao_minutos || ' minutes')::INTERVAL;

    -- Não oferecer slot que ultrapassa 22h
    IF v_slot_fim > v_dia_fim THEN
      EXIT;
    END IF;

    -- Verifica conflito com agendamentos existentes (considera 30 min de buffer)
    v_ocupado := EXISTS (
      SELECT 1 FROM public.agendamentos ag
      JOIN public.servicos sv ON sv.id = ag.servico_id
      WHERE ag.user_id = p_profissional_id
        AND ag.status NOT IN ('Cancelado', 'Não Compareceu')
        AND ag.data_hora < v_slot_inicio + (COALESCE(sv.duracao_minutos, 30) || ' minutes')::INTERVAL
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
              AND (data_inicio::TIME::TEXT || ':00')::TIME < v_slot_fim::TIME
              AND (data_fim::TIME::TEXT || ':00')::TIME > v_slot_inicio::TIME)
          )
      );
    END IF;

    IF NOT v_ocupado THEN
      horario := v_slot_inicio;
      RETURN NEXT;
    END IF;

    v_slot_inicio := v_slot_inicio + INTERVAL '30 minutes';
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_horarios_disponiveis TO anon, authenticated, service_role;

-- ============================================================
-- 4. ATUALIZAR função criar_agendamento_publico para usar
--    preco_promocional quando promoção estiver ativa
-- ============================================================
CREATE OR REPLACE FUNCTION public.criar_agendamento_publico(
  p_codigo_profissional VARCHAR(4),
  p_servico_id UUID,
  p_data_hora TIMESTAMPTZ,
  p_local TEXT,
  p_forma_pagamento TEXT,
  p_cliente_nome TEXT,
  p_cliente_whatsapp TEXT,
  p_cliente_email TEXT DEFAULT NULL,
  p_cliente_user_id UUID DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof RECORD;
  v_serv RECORD;
  v_cliente_id UUID := NULL;
  v_clean_whatsapp TEXT;
  v_agendamento RECORD;
  v_forma forma_pagamento;
  v_local local_agendamento;
  v_preco NUMERIC(10,2);
BEGIN
  -- 1. Localiza o profissional ativo pelo código de 4 dígitos
  SELECT id, nome, nome_studio, email, whatsapp, codigo_profissional
  INTO v_prof
  FROM public.perfis
  WHERE codigo_profissional = TRIM(p_codigo_profissional)
    AND tipo_usuario = 'profissional';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profissional com código #% não encontrado.', p_codigo_profissional;
  END IF;

  -- 2. Localiza e valida o serviço
  SELECT id, nome, categoria, preco_base, preco_promocional, promocao_ativa, duracao_minutos, ativo
  INTO v_serv
  FROM public.servicos
  WHERE id = p_servico_id AND user_id = v_prof.id;

  IF NOT FOUND OR NOT v_serv.ativo THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo.';
  END IF;

  -- Usa preço promocional se ativo
  v_preco := CASE
    WHEN v_serv.promocao_ativa AND v_serv.preco_promocional IS NOT NULL
    THEN v_serv.preco_promocional
    ELSE v_serv.preco_base
  END;

  -- 3. Formata o WhatsApp da cliente
  v_clean_whatsapp := REGEXP_REPLACE(COALESCE(p_cliente_whatsapp, ''), '\D', '', 'g');

  -- 4. Localiza ou cria a cliente na carteira do profissional
  IF v_clean_whatsapp <> '' THEN
    SELECT id INTO v_cliente_id
    FROM public.clientes
    WHERE user_id = v_prof.id AND whatsapp = v_clean_whatsapp
    LIMIT 1;
  END IF;

  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (user_id, nome, whatsapp)
    VALUES (v_prof.id, TRIM(p_cliente_nome), NULLIF(v_clean_whatsapp, ''))
    RETURNING id INTO v_cliente_id;
  END IF;

  -- 5. Converte tipo de local de forma segura
  IF p_local = 'Domicílio' THEN
    v_local := 'Domicílio'::local_agendamento;
  ELSE
    v_local := 'Studio'::local_agendamento;
  END IF;

  -- 6. Converte forma de pagamento
  BEGIN
    v_forma := p_forma_pagamento::forma_pagamento;
  EXCEPTION WHEN OTHERS THEN
    v_forma := NULL;
  END;

  -- 7. Insere o agendamento
  INSERT INTO public.agendamentos (
    user_id,
    cliente_id,
    cliente_user_id,
    servico_id,
    data_hora,
    valor_final,
    forma_pagamento,
    status,
    local,
    observacoes
  ) VALUES (
    v_prof.id,
    v_cliente_id,
    p_cliente_user_id,
    v_serv.id,
    p_data_hora,
    v_preco,
    v_forma,
    'Agendado'::status_agendamento,
    v_local,
    NULLIF(TRIM(p_observacoes), '')
  )
  RETURNING *
  INTO v_agendamento;

  -- 8. Retorna JSON completo com os dados confirmados
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
      'id', v_prof.id,
      'nome', v_prof.nome,
      'nome_studio', v_prof.nome_studio,
      'whatsapp', v_prof.whatsapp,
      'email', v_prof.email
    ),
    'servicos', jsonb_build_object(
      'id', v_serv.id,
      'nome', v_serv.nome,
      'categoria', v_serv.categoria,
      'preco_base', v_serv.preco_base,
      'preco_promocional', v_serv.preco_promocional,
      'promocao_ativa', v_serv.promocao_ativa,
      'duracao_minutos', v_serv.duracao_minutos
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_agendamento_publico TO anon, authenticated, service_role;
