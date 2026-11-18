# 📋 Changelog — Studio Manager

Todas as mudanças significativas do projeto são documentadas aqui.

> Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/)

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
