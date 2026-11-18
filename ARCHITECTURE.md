# 🏗️ Arquitetura — Studio Manager

> Documento técnico completo: arquitetura, DFD, banco de dados, fluxos e segurança.

---

## 1. Visão Geral do Sistema

O Studio Manager é uma aplicação **full-stack** com Next.js 14 (App Router) no frontend/backend e Supabase (PostgreSQL + Auth) como infraestrutura de dados. O deploy é feito na Vercel com CI/CD automático.

```mermaid
flowchart TD
    subgraph Usuários
        P["👩‍💼 Profissional"]
        C["💁 Cliente"]
    end

    subgraph Vercel["☁️ Vercel (Deploy)"]
        subgraph NextJS["Next.js 14 App Router"]
            UI["Componentes React\n(Tailwind + Shadcn)"]
            SC["Server Components\n(RSC)"]
            API["Route Handlers\n/api/*"]
            MW["Middleware\n(Auth Guard)"]
        end
    end

    subgraph Supabase["🟩 Supabase"]
        AUTH["Auth\n(JWT + Email)"]
        DB["PostgreSQL\n(RLS habilitado)"]
        RPC["RPCs\n(SECURITY DEFINER)"]
    end

    P -->|"HTTPS"| MW
    C -->|"HTTPS"| MW
    MW --> SC
    MW --> UI
    MW --> API
    SC -->|"supabase/server.ts"| DB
    UI -->|"supabase/client.ts"| AUTH
    API -->|"supabase/server.ts"| RPC
    RPC --> DB
    AUTH --> DB
```

---

## 2. DFD — Nível 0 (Diagrama de Contexto)

Visão de mais alto nível: o sistema e suas entidades externas.

```mermaid
flowchart LR
    PROF["👩‍💼\nProfissional"]
    CLI["💁\nCliente"]
    EMAIL["📧\nSistema de E-mail\n(Supabase Auth)"]
    SM(["🗂️\nStudio Manager"])

    PROF -->|"Gerencia serviços,\nagenda, disponibilidade,\nclientes, promoções"| SM
    SM -->|"Dashboard, relatórios,\nconfirmações"| PROF

    CLI -->|"Busca profissional,\nescolhe serviço,\nagenda horário"| SM
    SM -->|"Horários disponíveis,\nconfirmação de agendamento"| CLI

    SM -->|"E-mails de confirmação\ne verificação"| EMAIL
    EMAIL -->|"Links de autenticação\ne reset de senha"| PROF
    EMAIL -->|"Links de autenticação\ne reset de senha"| CLI
```

---

## 3. DFD — Nível 1 (Processos Principais)

```mermaid
flowchart TD
    PROF["👩‍💼 Profissional"]
    CLI["💁 Cliente"]

    subgraph P1["Processo 1: Autenticação"]
        REG["Cadastro\n(/register)"]
        LOGIN["Login\n(/login)"]
        RESET["Recuperação\n(/recuperar-senha)"]
    end

    subgraph P2["Processo 2: Gestão de Serviços"]
        CRUD_SRV["CRUD de Serviços"]
        PROMO["Preços Promocionais"]
        DUR["Duração por Serviço"]
    end

    subgraph P3["Processo 3: Disponibilidade"]
        BLOQ["Bloquear Dias/Horários"]
        SLOTS["Calcular Slots Livres\n(07h–22h)"]
    end

    subgraph P4["Processo 4: Agendamento"]
        BUSCA["Buscar Profissional\n(/buscar)"]
        PERFIL["Ver Perfil Público\n(/p/[code])"]
        AGENDAR["Criar Agendamento\n(login obrigatório)"]
        CONFIRMAR["Confirmar/Cancelar"]
    end

    subgraph P5["Processo 5: Dashboard"]
        METRICAS["Métricas Financeiras"]
        GRAFICOS["Gráficos (Recharts)"]
        PDF["Exportar PDF"]
    end

    subgraph DB["🗄️ Supabase PostgreSQL"]
        T_PERF["perfis"]
        T_SRV["servicos"]
        T_CLI["clientes"]
        T_AG["agendamentos"]
        T_IND["indisponibilidades"]
    end

    PROF --> P1 --> T_PERF
    PROF --> P2 --> T_SRV
    PROF --> P3 --> T_IND
    PROF --> P4 --> T_AG
    PROF --> P5

    CLI --> P1
    CLI --> P4
    P4 --> T_AG
    P4 --> T_CLI

    P5 --> T_AG
    P3 --> SLOTS --> T_AG
    P3 --> SLOTS --> T_IND
```

---

## 4. Diagrama de Banco de Dados (ER)

```mermaid
erDiagram
    PERFIS {
        uuid id PK
        text tipo_usuario
        text nome
        text whatsapp
        text nome_studio
        varchar4 codigo_profissional UK
        text email
        timestamptz criado_em
        timestamptz atualizado_em
    }

    SERVICOS {
        uuid id PK
        uuid user_id FK
        text categoria
        text nome
        numeric preco_base
        numeric preco_promocional
        boolean promocao_ativa
        integer duracao_minutos
        text tipo
        boolean ativo
        timestamptz criado_em
        timestamptz atualizado_em
    }

    CLIENTES {
        uuid id PK
        uuid user_id FK
        text nome
        text whatsapp
        timestamptz criado_em
        timestamptz atualizado_em
    }

    AGENDAMENTOS {
        uuid id PK
        uuid user_id FK
        uuid cliente_id FK
        uuid cliente_user_id FK
        uuid servico_id FK
        timestamptz data_hora
        numeric valor_final
        text forma_pagamento
        text status
        text local
        text observacoes
        uuid token_publico UK
        timestamptz lembrete_enviado_em
        timestamptz confirmado_em
        timestamptz criado_em
        timestamptz atualizado_em
    }

    EXPEDIENTES {
        uuid user_id PK
        smallint dia_semana PK
        boolean ativo
        time inicio
        time fim
    }

    LISTA_ESPERA {
        uuid id PK
        uuid profissional_id FK
        uuid cliente_user_id FK
        uuid servico_id FK
        date data
        text status
        timestamptz notificado_em
    }

    INDISPONIBILIDADES {
        uuid id PK
        uuid user_id FK
        text tipo
        timestamptz data_inicio
        timestamptz data_fim
        text titulo
        boolean recorrente
        integer dia_semana
        timestamptz criado_em
    }

    PERFIS ||--o{ SERVICOS : "tem"
    PERFIS ||--o{ CLIENTES : "gerencia"
    PERFIS ||--o{ AGENDAMENTOS : "recebe"
    PERFIS ||--o{ INDISPONIBILIDADES : "define"
    PERFIS ||--o{ EXPEDIENTES : "trabalha em"
    PERFIS ||--o{ LISTA_ESPERA : "tem fila"
    CLIENTES ||--o{ AGENDAMENTOS : "realiza"
    SERVICOS ||--o{ AGENDAMENTOS : "é escolhido em"
```

---

## 5. Fluxo de Autenticação

```mermaid
sequenceDiagram
    participant U as Usuário
    participant MW as Middleware
    participant AUTH as Supabase Auth
    participant DB as PostgreSQL

    U->>MW: Acessa rota protegida
    MW->>AUTH: Verifica sessão (cookie JWT)
    
    alt Sem sessão
        AUTH-->>MW: null
        MW-->>U: Redirect /login?next=/rota-original
        U->>AUTH: Faz login (email/senha)
        AUTH->>DB: Valida credenciais
        DB-->>AUTH: OK
        AUTH-->>U: Cookie JWT + redirect /rota-original
    else Com sessão válida
        AUTH-->>MW: user object
        MW-->>U: Acessa a rota normalmente
    end

    Note over DB: Trigger on_auth_user_created<br/>cria perfil automaticamente<br/>no primeiro cadastro
```

---

## 6. Fluxo de Agendamento (Cliente)

```mermaid
sequenceDiagram
    participant C as Cliente
    participant UI as /p/[code]
    participant API as /api/agendamentos/publico
    participant RPC as PostgreSQL RPC
    participant DB as Banco

    C->>UI: Acessa perfil público do profissional
    UI->>RPC: get_servicos_do_profissional(user_id)
    RPC-->>UI: Lista de serviços ativos

    C->>UI: Escolhe serviço e data
    UI->>API: GET /api/horarios-disponiveis?profissional_id=&data=&duracao=
    API->>RPC: horarios_disponiveis_publico(prof_id, data, duracao)
    RPC->>DB: Verifica agendamentos + indisponibilidades
    DB-->>RPC: Slots livres
    RPC-->>UI: Lista de horários (07h–22h, sem ocupados)

    alt Cliente não está logado
        UI-->>C: Modal de autenticação
        C->>UI: Login/Cadastro
    end

    C->>UI: Seleciona horário + forma de pagamento
    UI->>API: POST /api/agendamentos/publico
    API->>RPC: criar_agendamento_publico(...)
    RPC->>DB: INSERT em agendamentos + clientes
    DB-->>RPC: Agendamento criado
    RPC-->>UI: JSON com confirmação
    UI-->>C: Tela de sucesso
```

---

## 7. Fluxo de Disponibilidade de Horários

```mermaid
flowchart TD
    START["Requisição: data + profissional_id"] --> CHECK_DIA

    CHECK_DIA{"Dia inteiro\nbloqueado?"}
    CHECK_DIA -->|"Sim"| VAZIO["Retorna: nenhum horário"]
    CHECK_DIA -->|"Não"| GERA

    GERA["Gera slots 07h–22h\n(a cada 30 min)"]
    GERA --> LOOP

    LOOP["Para cada slot:"]
    LOOP --> CHECK_AGEND

    CHECK_AGEND{"Conflito com\nagendamentos?"}
    CHECK_AGEND -->|"Sim"| SKIP["Ocultar slot"]
    CHECK_AGEND -->|"Não"| CHECK_BLOQ

    CHECK_BLOQ{"Conflito com\nindisponibilidade\nde horário?"}
    CHECK_BLOQ -->|"Sim"| SKIP
    CHECK_BLOQ -->|"Não"| ADD["Incluir slot na resposta"]

    SKIP --> NEXT
    ADD --> NEXT
    NEXT["Próximo slot +30min"] --> LOOP

    LOOP -->|"22h atingido"| RETORNA["Retorna horários disponíveis"]
```

---

## 8. Mapa de Componentes

```mermaid
flowchart TD
    subgraph Layout
        SHELL["app-shell.tsx"]
        HEADER["header.tsx"]
        SIDEBAR["sidebar.tsx"]
    end

    subgraph Dashboard
        MC["metric-card.tsx"]
        RC["revenue-chart.tsx"]
        PC["payment-chart.tsx"]
    end

    subgraph Servicos
        SF["servico-form.tsx\n(CRUD + duração + promoção)"]
        IM["indisponibilidade-modal.tsx\n(Bloqueio de horários)"]
    end

    subgraph Agendamentos
        AF["agendamento-form.tsx\n(Para profissional)"]
    end

    subgraph Publico
        AM["agendamento-modal.tsx\n(Para cliente, login obrigatório)"]
    end

    subgraph UI["Componentes Base (ui/)"]
        PS["payment-selector.tsx\n(Pagamento misto)"]
        BUTTON["button.tsx"]
        DIALOG["dialog.tsx"]
        SELECT["select.tsx"]
        CAL["calendar.tsx"]
    end

    subgraph Perfil
        PM["perfil-modal.tsx"]
    end

    SHELL --> HEADER
    SHELL --> SIDEBAR
    AF --> PS
    AM --> PS
    SF --> UI
    AF --> UI
    AM --> CAL
```

---

## 9. Segurança — RLS e RPCs

### Row Level Security (RLS)

Todas as tabelas têm RLS habilitado. A regra base é: **usuário só acessa dados onde `auth.uid() = user_id`**. Desde a migration 012 não há políticas públicas de INSERT: agendamentos e clientes criados pelo portal passam exclusivamente pela RPC `criar_agendamento_publico`.

| Tabela | Política | Regra |
|---|---|---|
| `perfis` | `perfis_read_own` | `auth.uid() = id` |
| `perfis` | `perfis_public_read_profissionais` | `tipo_usuario = 'profissional'` (público) |
| `perfis` | `perfis_update_own` | `auth.uid() = id` |
| `servicos` | `servicos_select/insert/update/delete` | `auth.uid() = user_id` |
| `clientes` | `clientes_select/insert/update/delete` | `auth.uid() = user_id` |
| `agendamentos` | `agendamentos_select` | `auth.uid() = user_id` |
| `agendamentos` | `agendamentos_select_cliente` | `auth.uid() = cliente_user_id` |
| `indisponibilidades` | `indisponibilidades_select/insert/update/delete` | `auth.uid() = user_id` |

### RPCs SECURITY DEFINER

Funções que rodam com privilégios elevados para operações públicas (sem vazamento de dados de outros usuários):

| Função | Propósito | Acesso |
|---|---|---|
| `get_servicos_do_profissional(user_id)` | Retorna serviços ativos de UM profissional específico | `anon`, `authenticated` |
| `horarios_disponiveis_publico(prof_id, data, duracao)` | **Fonte única** do cálculo de slots livres (grade 07h–22h, término até 22h30, só horários futuros) | `anon`, `authenticated` |
| `get_horarios_disponiveis(prof_id, data, duracao)` | Legado — delega para `horarios_disponiveis_publico` | `anon`, `authenticated` |
| `get_agendamentos_ocupados(prof_id, data)` | Retorna horários ocupados (para ocultar no calendário do cliente) | `anon`, `authenticated` |
| `criar_agendamento_publico(...)` | Cria agendamento + cliente; cliente = `auth.uid()`; valida conflito/bloqueios/grade com lock por profissional | `authenticated` |
| `cancelar_agendamento_cliente(ag_id, _)` | Cliente (`auth.uid()`) cancela o próprio agendamento com 2h+ de antecedência | `authenticated` |
| `reagendar_agendamento(ag_id, _, nova_data)` | Profissional (`auth.uid()`) reagenda sem sobrepor outro agendamento | `authenticated` |
| `sm_horario_conflita(...)` | Helper interno de conflito de horário | interno |
| `generate_unique_codigo_profissional()` | Gera código único de 4 dígitos | interno (trigger) |
| `handle_new_user()` | Cria perfil automaticamente no cadastro | interno (trigger) |

---

## 10. API Routes

### `POST /api/agendamentos/publico`
Cria um novo agendamento via portal público. **Requer sessão** (cookie do Supabase Auth): a cliente é sempre o usuário logado.

**Body (JSON, validado com Zod):**
```json
{
  "codigo_profissional": "1234",
  "servico_id": "uuid",
  "data_hora": "2026-01-15T10:00:00-04:00",
  "local": "Studio",
  "forma_pagamento": "Pix",
  "cliente_nome": "Maria Silva",
  "cliente_whatsapp": "92999999999",
  "cliente_email": "maria@email.com",
  "observacoes": "Texto opcional"
}
```

**Resposta (200):** `{ success, agendamento, profissional }`.  
**Erros:** 400 (dados inválidos ou fora do expediente), 401 (não logado), 404 (profissional/serviço não encontrado), 409 (horário ocupado ou bloqueado).

---

### `POST /api/agendamentos/[id]/cancelar`
Cancela um agendamento da cliente logada (mínimo de 2h de antecedência).  
**Erros:** 400, 401, 404.

---

### `GET /api/horarios-disponiveis`
Retorna horários livres para um profissional em uma data (via RPC `horarios_disponiveis_publico`).

**Query params:**
- `profissional_id` — `user_id` do profissional (UUID)
- `data` — data no formato `YYYY-MM-DD`
- `duracao` — duração em minutos (5–480, padrão: 30)

**Resposta (200):**
```json
{ "slots": ["07:00", "07:30", "..."] }
```

---

### `POST /api/agendamentos/[id]/reagendar`
Remarcação pela cliente logada (mín. 2h). Body: `{ "data_hora": "ISO" }`. Envia e-mail para cliente e profissional e avisa a lista de espera do dia liberado.  
**Erros:** 400, 401, 404, 409.

---

### `POST /api/agenda/horario-liberado`
Chamado pelo painel do profissional ao liberar um horário. Body: `{ "data": "YYYY-MM-DD" }`. Avisa a lista de espera daquele dia.

---

### `GET /api/cron/diario`
Vercel Cron (13:00 UTC). Exige `Authorization: Bearer <CRON_SECRET>`. Envia lembretes (via `/emails/batch` da Resend) e varre a lista de espera.

---

### Página `/a/[token]`
Link do e-mail de lembrete. Mostra o agendamento e confirma presença com um clique (RPC `confirmar_presenca`). A confirmação exige clique para não ser disparada por filtros de e-mail que visitam links.

---

### `GET /api/auth/callback`
Callback do Supabase Auth após confirmação de e-mail ou OAuth.  
Redireciona para `/email-confirmado` ou `/dashboard`.

---

## 11. Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Chave anônima pública do Supabase |

> As variáveis com prefixo `NEXT_PUBLIC_` são expostas no browser. Nunca use a `service_role` key como pública. Desde a 0.12.0 a aplicação **não usa** `SUPABASE_SERVICE_ROLE_KEY`; todas as operações públicas passam por RPCs `SECURITY DEFINER`.
>
> Para e-mails: `RESEND_API_KEY` e `RESEND_FROM_EMAIL` (remetente de um **domínio verificado** na Resend — com `resend.dev` só chega no e-mail dono da conta).
>
> `CRON_SECRET`: valor de `sm_config.cron_secret` (mostrado ao rodar a migration 013). Autoriza o cron e as RPCs de sistema `sm_*`.
>
> Opcional: `NEXT_PUBLIC_APP_URL` para os links dos e-mails (padrão: domínio de produção da Vercel).

---

## 12. Histórico de Migrations

| # | Arquivo | Descrição |
|---|---|---|
| 001 | `001_initial_schema.sql` | Schema inicial: `clientes`, `servicos`, `agendamentos` + RLS + triggers `updated_at` |
| 002 | `002_perfis_e_portal_cliente.sql` | Tabela `perfis`, trigger `handle_new_user`, `cliente_user_id`, RPC `criar_agendamento_publico` |
| 003 | `003_fix_agendamento_publico.sql` | Correções na função de agendamento público |
| 004 | `004_disponibilidade_e_promocoes.sql` | Tabela `indisponibilidades`, campos `duracao_minutos`/`preco_promocional`/`promocao_ativa`, RPC `get_horarios_disponiveis` |
| 005 | `005_pagamento_misto.sql` | Muda `forma_pagamento` de ENUM para TEXT (suporta combinações) |
| 006 | `006_horarios_07_as_22.sql` | Atualiza geração de slots para 07h–22h (era 08h–17h) |
| 007 | `007_fix_servicos_rls_e_duracao.sql` | Remove política pública de serviços; seta duração 60min p/ Cílios e Depilação |
| 008 | `008_fix_servicos_publico_rls.sql` | Cria RPC `get_servicos_do_profissional` (SECURITY DEFINER) para clientes lerem serviços |
| 009 | `009_agendamentos_ocupados_e_login_obrigatorio.sql` | RPC `get_agendamentos_ocupados`; oculta slots ocupados e bloqueados para clientes |
| 010 | `010_cancelamento_cliente_e_reagendamento.sql` | RPCs `cancelar_agendamento_cliente` (regra de 2h) e `reagendar_agendamento` |
| 011 | `011_fuso_horario_manaus.sql` | Fuso `America/Manaus` em `get_horarios_disponiveis` |
| 012 | `012_seguranca_agendamentos.sql` | Conflito de horário validado no banco (com lock), RPCs com `auth.uid()`, remoção de políticas públicas de INSERT/SELECT, RPC `horarios_disponiveis_publico`, índices |
| 013 | `013_expediente_lembretes_lista_espera.sql` | Tabelas `expedientes`, `lista_espera`, `sm_config`; colunas de lembrete/confirmação em `agendamentos`; RPCs de expediente, confirmação, remarcação pela cliente, conflitos e lista de espera |

---

## 13. Lib e Queries

```
lib/
├── supabase/
│   ├── client.ts       → Cliente Supabase para o browser (createBrowserClient)
│   └── server.ts       → Cliente Supabase para Server Components e API Routes
├── queries/
│   ├── servicos.ts     → getServicos(), createServico(), updateServico(), deleteServico(), togglePromocao(), updateDuracao()
│   ├── clientes.ts     → getClientes(), createCliente(), updateCliente(), deleteCliente()
│   ├── agendamentos.ts → getAgendamentos(), createAgendamento(), updateAgendamento(), deleteAgendamento()
│   ├── perfis.ts       → getPerfil(), updatePerfil(), getProfissionalByCodigo(), getServicosDoProfissional(), getAgendamentosDoCliente()
│   └── indisponibilidades.ts → getIndisponibilidades(), createIndisponibilidade(), deleteIndisponibilidade(), getHorariosDisponiveis()
├── email.ts            → Funções de envio de e-mail (confirmação de agendamento)
├── pdf-report.ts       → Geração de PDF com jsPDF + jspdf-autotable
└── utils.ts            → formatCurrency(), getCategoriaColor(), formatDate(), cn()
```

---

## 14. PWA (Progressive Web App)

O sistema funciona como PWA, podendo ser instalado como app no celular:

| Arquivo | Função |
|---|---|
| `public/manifest.json` | Metadados do app (nome, ícones, cores) |
| `public/sw.js` | Service Worker para cache offline |
| `public/icons/` | Ícones em 192px e 512px (normal + maskable) |
| `components/pwa/pwa-register.tsx` | Registro do Service Worker no lado cliente |

---

> 📖 Voltar para o [README.md](./README.md) | Ver [CHANGELOG.md](./CHANGELOG.md)
