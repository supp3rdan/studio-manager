# 📋 Changelog — Studio Manager

Todas as mudanças significativas do projeto são documentadas aqui.

> Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/)

---

## [0.13.0] — Novembro 2026 — Lembretes, expediente, remarcação pela cliente e lista de espera

### Migration 013 — `013_expediente_lembretes_lista_espera.sql`

> ⚠️ **Ordem de implantação:** rode a migration 013 **antes** do merge (ela é compatível com a versão em produção). Depois copie o `cron_secret` que o SQL Editor mostra para a variável `CRON_SECRET` na Vercel e faça o merge.

#### Adicionado
- **Lembrete automático com confirmação:** tarefa diária (Vercel Cron, 09:00 de Manaus — `vercel.json`) envia e-mail para quem tem horário até o dia seguinte, com botões **Confirmar presença** e **Preciso remarcar**. A página `/a/[token]` confirma com um clique (status `Agendado` → `Confirmado`). Colunas `token_publico`, `lembrete_enviado_em`, `confirmado_em`; trigger zera lembrete/confirmação quando a data muda.
- **Tela de agendamentos:** filtro e aviso "Aguardando confirmação" (próximas 48h), botão de WhatsApp com mensagem pronta e indicador "lembrete enviado".
- **Expediente por profissional:** dias, horário de início/fim por dia, intervalo entre horários (10–60 min) e intervalo entre atendimentos (limpeza). Tabela `expedientes`, colunas `perfis.agenda_intervalo_min` / `agenda_buffer_min`, RPC `salvar_expediente`. Sem configuração, vale o padrão anterior (07:00–22:30, a cada 30 min).
- **Agendamento manual com checagem de conflito:** o formulário do profissional consulta `conflitos_agenda` (outros agendamentos, bloqueios e expediente) e oferece **Encaixar mesmo assim**.
- **Remarcação pela cliente** (mín. 2h de antecedência): botão em `/cliente/agendamentos`, rota `POST /api/agendamentos/[id]/reagendar`, RPC `reagendar_agendamento_cliente`; e-mail para cliente e profissional.
- **Lista de espera:** quando o dia está lotado a cliente entra na fila (`entrar_lista_espera`); ao liberar horário (cancelamento, falta, exclusão, remarcação) quem está na fila recebe e-mail. Também há varredura diária no cron. Profissional vê a lista na tela de agendamentos; cliente vê e sai pela própria tela.
- RPCs de sistema `sm_*` autorizadas pelo `CRON_SECRET` (guardado em `sm_config`), sem precisar da service role key.

#### Corrigido (Resend)
- Remetente padrão `agendamentos@resend.dev` não existe no modo de teste da Resend; agora `onboarding@resend.dev` com aviso no log. **Para enviar a clientes é obrigatório verificar um domínio e definir `RESEND_FROM_EMAIL`.**
- Cabeçalho `User-Agent` (a Resend recusa requisições sem ele) e `Idempotency-Key` nos envios em lote.
- E-mails eram disparados sem `await` depois da resposta; na Vercel a função pode ser congelada antes do envio. Agora as rotas aguardam o envio.
- Botões de WhatsApp nos e-mails não tinham o código do país (55).
- O modal de reagendamento sempre usava 30 min de duração (o select não trazia `duracao_minutos`).
- Middleware preserva o destino (`?next=`) ao mandar para o login.

---

## [0.12.0] — Novembro 2026 — Segurança e integridade da agenda

### Migration 012 — `012_seguranca_agendamentos.sql`

> ⚠️ **Ordem de implantação:** primeiro faça o deploy desta versão (merge na `main`), depois execute a migration 012 no SQL Editor do Supabase. O código novo funciona com o banco antigo e com o novo; o inverso não é verdade.

#### Segurança
- **Agendamento sem duplicidade:** `criar_agendamento_publico` agora valida, dentro do banco e com lock por profissional (`pg_advisory_xact_lock`), conflito com outros agendamentos, bloqueios de horário/dia, horários no passado e fora da grade (07:00–22:00, a cada 30 min, término até 22:30). Conflito retorna HTTP **409**.
- **Identidade pela sessão:** as RPCs `criar_agendamento_publico`, `cancelar_agendamento_cliente` e `reagendar_agendamento` usam `auth.uid()`; os parâmetros de id de usuário foram mantidos só por compatibilidade e são ignorados. `criar_agendamento_publico` deixou de ser executável por `anon`.
- **Reagendamento** valida conflito com outros agendamentos do profissional e impede datas no passado.
- **RLS:** removidas as políticas `agendamentos_insert_publico` e `clientes_insert_publico` (INSERT irrestrito) e `indisponibilidades_select_publico` (leitura pública dos bloqueios).
- **API `POST /api/agendamentos/publico`:** identifica a cliente pelo cookie de sessão (não mais pelo `cliente_user_id` do corpo), valida o corpo com Zod e não tem mais o fallback de INSERT direto nas tabelas (que também ignorava o preço promocional). Não devolve mais o e-mail do profissional ao navegador.
- **Sem `SUPABASE_SERVICE_ROLE_KEY`:** as rotas de API usam apenas a chave anon + RPCs. A variável pode ser removida da Vercel.
- **E-mails:** campos digitados por usuários são escapados antes de entrar no HTML (evita injeção de HTML/links falsos); assuntos sem quebras de linha.
- **Next.js 14.2.16 → 14.2.35** (correções de segurança, incluindo bypass de middleware).

#### Otimização e manutenção
- Nova RPC `horarios_disponiveis_publico` como **fonte única** do cálculo de horários livres; `get_horarios_disponiveis` passa a delegar para ela. A API `/api/horarios-disponiveis` só chama a RPC (o fallback temporário para o cálculo antigo foi removido após a migration 012 ser aplicada em produção).
- Corrige `get_horarios_disponiveis`: as migrations 006 e 011 falhavam com *"cannot change return type of existing function"* quando a versão da 004 existia; a 012 remove todas as versões antes de recriar.
- Horários passados são filtrados no servidor (fuso de Manaus); o front deixou de filtrar pelo fuso do aparelho.
- Em caso de erro, o front não mostra mais a grade inteira como "livre".
- Índices: `agendamentos (user_id, data_hora)`, `agendamentos (cliente_user_id)`, `indisponibilidades (user_id)`, `clientes (user_id, whatsapp)`.
- Erros das RPCs mapeados para status HTTP (`lib/api-errors.ts`); URL do Supabase centralizada em `lib/supabase/url.ts`.
- `tsconfig.tsbuildinfo` removido do repositório; CI no GitHub Actions (lint, typecheck e build).

---

## [0.11.0] — Novembro 2026 — Fuso horário padrão de Manaus / AM (America/Manaus, UTC-4)

### Migration 011 — `011_fuso_horario_manaus.sql`

#### Alterado
- **Fuso horário do sistema:** Todo o sistema agora opera estritamente no fuso horário de **Manaus/AM (`America/Manaus`, UTC-4, sem horário de verão)**.
- **`lib/utils.ts`:**
  - `TIMEZONE_DEFAULT` atualizado para `"America/Manaus"`.
  - `TIMEZONE_OFFSET` definido como `"-04:00"`.
  - `formatDate`, `formatTime` e `formatDateTime` agora convertem datas e horas para `America/Manaus` usando `Intl.DateTimeFormat` nativo (funciona independente do fuso do dispositivo ou do servidor Vercel).
  - Adicionadas funções auxiliares `getManausDateString`, `getManausHour` e `toManausISO` (gera timestamps UTC correspondentes ao horário selecionado em Manaus com offset `-04:00`).
- **`app/api/horarios-disponiveis/route.ts`:**
  - Fuso horário configurado para `America/Manaus`.
  - Ranges de busca de agendamentos e indisponibilidades ajustados para offset `-04:00`.
- **Formulários e Modais (`agendamento-form.tsx`, `agendamento-modal.tsx`, `reagendamento-modal.tsx`, `indisponibilidade-modal.tsx`):**
  - Criação e reagendamento agora geram timestamps explicitamente no fuso de Manaus (`toManausISO`).
- **Calendário Semanal (`calendario-semanal.tsx`):**
  - Mapeamento de colunas por dia e hora alinhados ao fuso de Manaus.
- **Relatório PDF e E-mails (`lib/pdf-report.ts`, `lib/email.ts`):**
  - Confirmações de agendamento, cancelamento e relatórios em PDF formatados no horário oficial de Manaus.
- **Migration 011 (`011_fuso_horario_manaus.sql`):**
  - Atualização da RPC `get_horarios_disponiveis` no Supabase com `AT TIME ZONE 'America/Manaus'`.

---

## [0.10.0] — Novembro 2026 — Cancelamento pelo cliente, reagendamento, calendário semanal e e-mail de cancelamento

### Migration 010 — `010_cancelamento_cliente_e_reagendamento.sql`

> ⚠️ **Execute manualmente no SQL Editor do Supabase antes de usar as features de cancelamento e reagendamento.**

#### Adicionado
- **RPC `cancelar_agendamento_cliente(ag_id, cliente_user_id)`** (SECURITY DEFINER) — cancela agendamento do próprio cliente; valida que o agendamento pertence ao cliente, que o status é Agendado/Confirmado e que faltam mais de 2h para o horário. Libera o slot automaticamente.
- **RPC `reagendar_agendamento(ag_id, prof_user_id, nova_data_hora)`** (SECURITY DEFINER) — permite ao profissional alterar data/hora de um agendamento existente mantendo todos os outros dados. Bloqueia reagendamento de Concluído/Cancelado/Não Compareceu.
- **Botão "Cancelar" na tela do cliente** (`/cliente/agendamentos`) — aparece apenas para agendamentos Agendado/Confirmado com mais de 2h de antecedência. AlertDialog de confirmação com detalhes do agendamento. Exibe aviso para contato via WhatsApp quando dentro da janela de 2h.
- **Banner de política de cancelamento** no topo da tela do cliente (aviso gold sobre a regra de 2h).
- **Modal de Reagendamento** (`ReagendamentoModal`) — botão Reagendar (ícone RefreshCw) em cada agendamento elegível na tela do profissional. Carrega slots disponíveis da data selecionada. Atualiza o agendamento sem perder serviço, cliente ou valor.
- **Vista Calendário Semanal** (`CalendarioSemanal`) — toggle Lista/Calendário no header de `/agendamentos`. Grid 7 dias × 15h (07h–22h) com agendamentos posicionados no horário certo e coloridos por status. Navegação prev/next semana.
- **`notificarCancelamento`** em `lib/email.ts` — envia e-mail para cliente (confirmação de cancelamento + botão WhatsApp da profissional) e para profissional (aviso de cancelamento + botão WhatsApp do cliente). Usa Resend se `RESEND_API_KEY` estiver configurada; faz mock estruturado no console caso contrário.
- **API `POST /api/agendamentos/[id]/cancelar`** — endpoint autenticado que valida sessão, chama RPC e dispara notificação de cancelamento em background.

#### Modificado
- `lib/queries/perfis.ts` → `getAgendamentosDoCliente` agora inclui `email` no select de perfis de profissionais (necessário para notificação de cancelamento).

---

## [0.9.0] — Novembro 2024 — Login obrigatório e horários mais limpos

### Migration 009 — `009_agendamentos_ocupados_e_login_obrigatorio.sql`

#### Adicionado
- RPC `get_agendamentos_ocupados(prof_id, data)` — retorna horários com agendamentos ativos (status ≠ Cancelado/Não Compareceu) para um profissional em uma data
- Modal de autenticação no portal público: cliente não logado é redirecionado para login/cadastro antes de agendar

#### Corrigido
- Horários com agendamentos "aguardando confirmação" (status = Agendado) agora também são ocultados para novos clientes
- Horários bloqueados por indisponibilidade não aparecem mais no seletor de horários

---

## [0.8.0] — Novembro 2024 — Leitura pública de serviços via RPC

### Migration 008 — `008_fix_servicos_publico_rls.sql`

#### Adicionado
- RPC `get_servicos_do_profissional(user_id UUID)` (SECURITY DEFINER) — retorna serviços ativos de um profissional específico sem vazar dados de outros profissionais

#### Corrigido
- Bug: clientes não conseguiam ver os serviços do profissional para agendar (causado pela remoção da política pública na migration 007)

---

## [0.7.0] — Novembro 2024 — Correção de RLS e duração de serviços

### Migration 007 — `007_fix_servicos_rls_e_duracao.sql`

#### Corrigido
- Bug: serviços de outros profissionais apareciam na lista do profissional logado
- Bug: serviço continuava aparecendo após exclusão (problema de cache/política RLS)
- Removida política `servicos_public_read` que causava vazamento entre profissionais

#### Alterado
- Duração padrão dos serviços de categoria **Cílios**: 30 → **60 minutos**
- Duração padrão dos serviços de categoria **Depilação**: 30 → **60 minutos**

---

## [0.6.0] — Novembro 2024 — Horários de 07h às 22h

### Migration 006 — `006_horarios_07_as_22.sql`

#### Alterado
- Janela de atendimento atualizada: **07h00 às 22h00** (era 08h às 17h)
- Slots gerados a cada 30 minutos dentro desse intervalo
- Último slot possível termina às 22h00 (slot de 21h30 é o último válido para serviços de 30 min)

---

## [0.5.0] — Novembro 2024 — Pagamento misto

### Migration 005 — `005_pagamento_misto.sql`

#### Adicionado
- Suporte a **pagamento misto**: profissional e cliente podem combinar formas de pagamento (ex: "Pix + Cartão Débito")
- Componente `payment-selector.tsx` — UI para selecionar e combinar formas de pagamento

#### Alterado
- Campo `forma_pagamento` na tabela `agendamentos` mudou de ENUM para TEXT (armazena qualquer combinação)
- Formas disponíveis: Pix, Cartão Débito, Cartão Crédito, Crédito Bemol, Dinheiro

---

## [0.4.0] — Novembro 2024 — Disponibilidade, promoções e duração

### Migration 004 — `004_disponibilidade_e_promocoes.sql`

#### Adicionado
- Tabela **`indisponibilidades`** — permite bloquear dias inteiros ou intervalos de horário (pontuais ou recorrentes por dia da semana)
- Campo `duracao_minutos` nos serviços — profissional pode definir duração por serviço (padrão: 30 min)
- Campo `preco_promocional` e `promocao_ativa` nos serviços — preço especial ativável/desativável
- RPC `get_horarios_disponiveis(prof_id, data, duracao)` — calcula slots livres cruzando agendamentos + indisponibilidades
- Componente `indisponibilidade-modal.tsx` — UI para gerenciar bloqueios de agenda

#### Comportamento
- Quando um cliente agenda, o horário (e os 30 min seguintes) fica automaticamente indisponível
- Slots que ultrapassam 22h não são oferecidos

---

## [0.3.0] — Novembro 2024 — Portal do cliente e perfis

### Migration 003 — `003_fix_agendamento_publico.sql`

#### Corrigido
- Problemas na função `criar_agendamento_publico`
- Fuso horário: slots agora usam `America/Sao_Paulo` explicitamente

---

## [0.2.0] — Novembro 2024 — Perfis e portal público

### Migration 002 — `002_perfis_e_portal_cliente.sql`

#### Adicionado
- Tabela **`perfis`** — dados do profissional (nome do studio, WhatsApp, código único de 4 dígitos)
- **Código do profissional**: gerado automaticamente no cadastro (único, entre 1000–9999)
- Trigger `handle_new_user` — cria perfil automaticamente ao cadastrar usuário no Supabase Auth
- Campo `cliente_user_id` em agendamentos — vincula agendamento ao usuário cliente logado
- RPC `criar_agendamento_publico(...)` (SECURITY DEFINER) — criação segura de agendamentos públicos
- Rota `/buscar` — cliente busca profissional pelo código
- Rota `/p/[code]` — perfil público do profissional com catálogo e agendamento
- Rota `/cliente/agendamentos` — histórico de agendamentos do cliente

#### Segurança
- Políticas RLS para leitura pública de perfis de profissionais
- Políticas para clientes verem seus próprios agendamentos

---

## [0.1.0] — Outubro 2024 — Schema inicial

### Migration 001 — `001_initial_schema.sql`

#### Adicionado
- Tabela **`clientes`** — carteira de clientes do profissional
- Tabela **`servicos`** — catálogo de serviços com categoria (Cílios, Sobrancelhas, Depilação) e preço
- Tabela **`agendamentos`** — agenda com status, local, forma de pagamento e observações
- **Row Level Security (RLS)** em todas as tabelas — cada profissional só acessa seus dados
- Trigger `update_updated_at_column` — atualiza automaticamente o campo `atualizado_em`
- ENUMs: `categoria_servico`, `tipo_servico`, `status_agendamento`, `forma_pagamento`, `local_agendamento`
- Índices de performance em `user_id`, `data_hora`, `status`, `nome`, `categoria`

---

> 📖 Voltar para o [README.md](./README.md) | Ver [ARCHITECTURE.md](./ARCHITECTURE.md)
