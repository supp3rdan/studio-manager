-- Studio Manager — Schema inicial com RLS
-- Execute este script no SQL Editor do seu projeto Supabase

-- ============================================================
-- 1. TABELA: clientes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clientes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  whatsapp    TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. TABELA: servicos
-- ============================================================
CREATE TYPE categoria_servico AS ENUM ('Cílios', 'Sobrancelhas', 'Depilação');
CREATE TYPE tipo_servico AS ENUM ('Tabela Padrão', 'Promoção');

CREATE TABLE IF NOT EXISTS public.servicos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria   categoria_servico NOT NULL,
  nome        TEXT NOT NULL,
  preco_base  NUMERIC(10,2) NOT NULL CHECK (preco_base >= 0),
  tipo        tipo_servico NOT NULL DEFAULT 'Tabela Padrão',
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. TABELA: agendamentos
-- ============================================================
CREATE TYPE status_agendamento AS ENUM (
  'Agendado', 'Confirmado', 'Concluído', 'Cancelado', 'Não Compareceu'
);
CREATE TYPE forma_pagamento AS ENUM (
  'Pix', 'Cartão Débito', 'Cartão Crédito', 'Crédito Bemol', 'Dinheiro'
);
CREATE TYPE local_agendamento AS ENUM ('Studio', 'Domicílio');

CREATE TABLE IF NOT EXISTS public.agendamentos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id        UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  servico_id        UUID REFERENCES public.servicos(id) ON DELETE SET NULL,
  data_hora         TIMESTAMPTZ NOT NULL,
  valor_final       NUMERIC(10,2) CHECK (valor_final >= 0),
  forma_pagamento   forma_pagamento,
  status            status_agendamento NOT NULL DEFAULT 'Agendado',
  local             local_agendamento NOT NULL DEFAULT 'Studio',
  observacoes       TEXT,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. ÍNDICES para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_clientes_user_id     ON public.clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_clientes_nome        ON public.clientes(nome);
CREATE INDEX IF NOT EXISTS idx_servicos_user_id     ON public.servicos(user_id);
CREATE INDEX IF NOT EXISTS idx_servicos_categoria   ON public.servicos(categoria);
CREATE INDEX IF NOT EXISTS idx_agendamentos_user_id ON public.agendamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data    ON public.agendamentos(data_hora);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status  ON public.agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente ON public.agendamentos(cliente_id);

-- ============================================================
-- 5. ROW LEVEL SECURITY (RNF01)
-- ============================================================
ALTER TABLE public.clientes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

-- Clientes: usuário só acessa seus próprios dados
CREATE POLICY "clientes_select" ON public.clientes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "clientes_insert" ON public.clientes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "clientes_update" ON public.clientes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "clientes_delete" ON public.clientes
  FOR DELETE USING (auth.uid() = user_id);

-- Serviços
CREATE POLICY "servicos_select" ON public.servicos
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "servicos_insert" ON public.servicos
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "servicos_update" ON public.servicos
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "servicos_delete" ON public.servicos
  FOR DELETE USING (auth.uid() = user_id);

-- Agendamentos
CREATE POLICY "agendamentos_select" ON public.agendamentos
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "agendamentos_insert" ON public.agendamentos
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "agendamentos_update" ON public.agendamentos
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "agendamentos_delete" ON public.agendamentos
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 6. FUNCTION: auto-atualiza campo atualizado_em
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER servicos_updated_at
  BEFORE UPDATE ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER agendamentos_updated_at
  BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
