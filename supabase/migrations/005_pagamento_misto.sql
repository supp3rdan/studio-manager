-- Studio Manager — Migração 005: Pagamento Misto
-- Converte forma_pagamento de ENUM para TEXT para suportar combinações
-- Execute no SQL Editor do Supabase

-- ============================================================
-- 1. Altera coluna forma_pagamento para TEXT (preserva dados)
-- ============================================================

-- Converte a coluna sem perder dados (cast ENUM → TEXT é seguro no Postgres)
ALTER TABLE public.agendamentos
  ALTER COLUMN forma_pagamento TYPE TEXT USING forma_pagamento::TEXT;

-- Converte coluna na função criar_agendamento_publico (já é TEXT no argumento, OK)
-- Atualiza também a função para remover a conversão explícita de ENUM

-- ============================================================
-- 2. Recria a função criar_agendamento_publico sem o cast de ENUM
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

  -- 4. Localiza ou cria a cliente
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

  -- 5. Converte tipo de local
  IF p_local = 'Domicílio' THEN
    v_local := 'Domicílio'::local_agendamento;
  ELSE
    v_local := 'Studio'::local_agendamento;
  END IF;

  -- 6. Insere o agendamento (forma_pagamento agora é TEXT)
  INSERT INTO public.agendamentos (
    user_id, cliente_id, cliente_user_id, servico_id,
    data_hora, valor_final, forma_pagamento, status, local, observacoes
  ) VALUES (
    v_prof.id, v_cliente_id, p_cliente_user_id, v_serv.id,
    p_data_hora, v_preco, NULLIF(TRIM(p_forma_pagamento), ''),
    'Agendado'::status_agendamento, v_local, NULLIF(TRIM(p_observacoes), '')
  )
  RETURNING * INTO v_agendamento;

  -- 7. Retorna JSON
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

GRANT EXECUTE ON FUNCTION public.criar_agendamento_publico TO anon, authenticated, service_role;
