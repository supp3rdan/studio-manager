-- Migration 007: Corrige RLS de serviços e duração padrão para Cílios/Depilação
-- =============================================================================

-- Bug 1: A política "servicos_public_read" criada em 002 permite que QUALQUER
-- usuário autenticado leia serviços de TODOS os profissionais.
-- Corrigimos alterando a política para incluir também o filtro por user_id,
-- mas permitindo que o portal público leia apenas os serviços do profissional
-- correto (via função agendar_consulta que já usa SECURITY DEFINER).

DROP POLICY IF EXISTS "servicos_public_read" ON public.servicos;

-- Recria a política pública mas restrita: apenas o próprio dono lê seus serviços
-- (clientes usam a função SECURITY DEFINER para acessar serviços do profissional)
-- A política "servicos_select" (auth.uid() = user_id) já cobre o profissional.
-- Para o portal do cliente, a leitura de serviços é feita via função RPC,
-- então não precisamos de uma policy pública irrestrita.

-- Bug 3: Atualiza duração padrão para serviços de Cílios e Depilação já cadastrados
UPDATE public.servicos
SET duracao_minutos = 60
WHERE categoria IN ('Cílios', 'Depilação')
  AND duracao_minutos = 30;
