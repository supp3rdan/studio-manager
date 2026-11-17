-- Migration 008: Corrige acesso público aos serviços do profissional
-- =================================================================
-- Problema: a migration 007 removeu a política "servicos_public_read"
-- que permitia clientes verem serviços de um profissional.
-- Solução: criar uma função SECURITY DEFINER que retorna os serviços
-- ativos de um profissional específico, sem expor serviços de outros.

CREATE OR REPLACE FUNCTION public.get_servicos_do_profissional(p_user_id UUID)
RETURNS TABLE (
  id            UUID,
  user_id       UUID,
  nome          TEXT,
  categoria     TEXT,
  tipo          TEXT,
  preco_base    NUMERIC,
  preco_promocional NUMERIC,
  promocao_ativa BOOLEAN,
  duracao_minutos INTEGER,
  ativo         BOOLEAN,
  criado_em     TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    s.id,
    s.user_id,
    s.nome,
    s.categoria,
    s.tipo,
    s.preco_base,
    s.preco_promocional,
    s.promocao_ativa,
    s.duracao_minutos,
    s.ativo,
    s.criado_em,
    s.atualizado_em
  FROM public.servicos s
  WHERE s.user_id = p_user_id
    AND s.ativo = true
  ORDER BY s.categoria ASC, s.nome ASC;
$$;

-- Permite que qualquer pessoa (inclusive anônimos) chame a função
GRANT EXECUTE ON FUNCTION public.get_servicos_do_profissional(UUID) TO anon, authenticated;
