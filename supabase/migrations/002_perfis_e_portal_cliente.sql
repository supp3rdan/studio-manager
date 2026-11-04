-- Studio Manager — Migração 002: Perfis e Portal do Cliente
-- Execute este script no SQL Editor do seu projeto Supabase

-- ============================================================
-- 1. TABELA: perfis
-- ============================================================
CREATE TABLE IF NOT EXISTS public.perfis (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo_usuario        TEXT NOT NULL DEFAULT 'profissional' CHECK (tipo_usuario IN ('profissional', 'cliente')),
  nome                TEXT NOT NULL DEFAULT '',
  whatsapp            TEXT,
  nome_studio         TEXT,
  codigo_profissional VARCHAR(4) UNIQUE,
  email               TEXT,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. FUNÇÃO: Gerar código único de 4 dígitos (1000 - 9999)
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_unique_codigo_profissional()
RETURNS VARCHAR(4) AS $$
DECLARE
  v_codigo VARCHAR(4);
  v_exists BOOLEAN;
  v_attempts INT := 0;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    -- Gera número aleatório de 4 dígitos entre 1000 e 9999
    v_codigo := LPAD((FLOOR(1000 + RANDOM() * 9000))::INT::TEXT, 4, '0');
    
    SELECT EXISTS (
      SELECT 1 FROM public.perfis WHERE codigo_profissional = v_codigo
    ) INTO v_exists;
    
    IF NOT v_exists THEN
      RETURN v_codigo;
    END IF;
    
    IF v_attempts > 1000 THEN
      RAISE EXCEPTION 'Não foi possível gerar um código único após 1000 tentativas';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ============================================================
-- 3. TRIGGER: Criar perfil automaticamente no cadastro
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo TEXT;
  v_nome TEXT;
  v_whatsapp TEXT;
  v_nome_studio TEXT;
  v_codigo VARCHAR(4) := NULL;
BEGIN
  -- Extrai metadados enviados no cadastro
  v_tipo := COALESCE(NEW.raw_user_meta_data->>'tipo_usuario', 'profissional');
  v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', SPLIT_PART(NEW.email, '@', 1));
  v_whatsapp := NEW.raw_user_meta_data->>'whatsapp';
  v_nome_studio := NEW.raw_user_meta_data->>'nome_studio';
  
  -- Se for profissional, gera código único de 4 dígitos
  IF v_tipo = 'profissional' THEN
    v_codigo := public.generate_unique_codigo_profissional();
  END IF;

  INSERT INTO public.perfis (
    id,
    tipo_usuario,
    nome,
    whatsapp,
    nome_studio,
    codigo_profissional,
    email,
    criado_em,
    atualizado_em
  ) VALUES (
    NEW.id,
    v_tipo,
    v_nome,
    v_whatsapp,
    v_nome_studio,
    v_codigo,
    NEW.email,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    tipo_usuario = EXCLUDED.tipo_usuario,
    nome = CASE WHEN public.perfis.nome = '' THEN EXCLUDED.nome ELSE public.perfis.nome END,
    codigo_profissional = CASE 
      WHEN public.perfis.codigo_profissional IS NULL AND EXCLUDED.tipo_usuario = 'profissional' 
      THEN public.generate_unique_codigo_profissional() 
      ELSE public.perfis.codigo_profissional 
    END,
    email = EXCLUDED.email,
    atualizado_em = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove trigger antigo se existir
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Cria o trigger na tabela auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. BACKFILL: Criar perfil para usuários existentes
-- ============================================================
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN SELECT * FROM auth.users LOOP
    IF NOT EXISTS (SELECT 1 FROM public.perfis WHERE id = u.id) THEN
      INSERT INTO public.perfis (
        id,
        tipo_usuario,
        nome,
        codigo_profissional,
        email
      ) VALUES (
        u.id,
        'profissional',
        SPLIT_PART(u.email, '@', 1),
        public.generate_unique_codigo_profissional(),
        u.email
      );
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 5. ATUALIZAÇÃO DA TABELA agendamentos
-- ============================================================
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS cliente_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente_user ON public.agendamentos(cliente_user_id);
CREATE INDEX IF NOT EXISTS idx_perfis_codigo             ON public.perfis(codigo_profissional);

-- ============================================================
-- 6. POLÍTICAS RLS (Row Level Security)
-- ============================================================
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

-- Perfis: Leitura pública de profissionais
DROP POLICY IF EXISTS "perfis_public_read_profissionais" ON public.perfis;
CREATE POLICY "perfis_public_read_profissionais" ON public.perfis
  FOR SELECT USING (tipo_usuario = 'profissional');

-- Perfis: Usuário pode ler seu próprio perfil (inclusive clientes)
DROP POLICY IF EXISTS "perfis_read_own" ON public.perfis;
CREATE POLICY "perfis_read_own" ON public.perfis
  FOR SELECT USING (auth.uid() = id);

-- Perfis: Usuário pode atualizar seu próprio perfil
DROP POLICY IF EXISTS "perfis_update_own" ON public.perfis;
CREATE POLICY "perfis_update_own" ON public.perfis
  FOR UPDATE USING (auth.uid() = id);

-- Perfis: Inserção do próprio perfil
DROP POLICY IF EXISTS "perfis_insert_own" ON public.perfis;
CREATE POLICY "perfis_insert_own" ON public.perfis
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Serviços: Permitir leitura pública dos serviços ativos (para a página pública do profissional)
DROP POLICY IF EXISTS "servicos_public_read" ON public.servicos;
CREATE POLICY "servicos_public_read" ON public.servicos
  FOR SELECT USING (ativo = true);

-- Agendamentos: Clientes logados podem ver seus agendamentos
DROP POLICY IF EXISTS "agendamentos_select_cliente" ON public.agendamentos;
CREATE POLICY "agendamentos_select_cliente" ON public.agendamentos
  FOR SELECT USING (auth.uid() = cliente_user_id);

-- Agendamentos: Permitir criação de agendamento por clientes / público
DROP POLICY IF EXISTS "agendamentos_insert_publico" ON public.agendamentos;
CREATE POLICY "agendamentos_insert_publico" ON public.agendamentos
  FOR INSERT WITH CHECK (true);

-- Trigger de updated_at para perfis
CREATE TRIGGER perfis_updated_at
  BEFORE UPDATE ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
