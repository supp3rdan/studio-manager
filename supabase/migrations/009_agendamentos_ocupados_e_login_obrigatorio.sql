-- Migration 009: Função segura para consulta de horários ocupados
-- =============================================================================
-- Permite que clientes e visitantes consultem horários já ocupados por agendamentos
-- (status 'Agendado', 'Confirmado' ou 'Concluído') sem expor nenhum dado pessoal
-- dos clientes (nomes, telefones, observações ou valores são omitidos).

CREATE OR REPLACE FUNCTION public.get_agendamentos_ocupados(
  p_profissional_id UUID,
  p_data_inicio TIMESTAMPTZ,
  p_data_fim TIMESTAMPTZ
)
RETURNS TABLE (
  data_hora TIMESTAMPTZ,
  duracao_minutos INTEGER
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    a.data_hora,
    COALESCE(s.duracao_minutos, 30)::INTEGER AS duracao_minutos
  FROM public.agendamentos a
  LEFT JOIN public.servicos s ON s.id = a.servico_id
  WHERE a.user_id = p_profissional_id
    AND a.status IN ('Agendado', 'Confirmado', 'Concluído')
    AND a.data_hora >= p_data_inicio
    AND a.data_hora <= p_data_fim;
$$;

-- Concede permissão de execução para anon e authenticated
GRANT EXECUTE ON FUNCTION public.get_agendamentos_ocupados(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;
