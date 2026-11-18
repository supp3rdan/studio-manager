# Studio Manager — Contexto para IA

> Este arquivo é carregado automaticamente pelo Antigravity em toda sessão deste workspace.
> Contém o mapa completo do projeto em formato denso para minimizar tokens gastos.
> **Atualize este arquivo junto com cada mudança significativa no projeto.**

---

## IDENTIDADE DO PROJETO

- **Nome:** Studio Manager
- **Stack:** Next.js 14 (App Router) + TypeScript + Supabase (PostgreSQL + Auth) + Tailwind + Shadcn/ui
- **Deploy:** Vercel → branch `main` → auto-deploy
- **URL produção:** https://studio-manager-three.vercel.app
- **Repo:** https://github.com/supp3rdan/studio-manager
- **Tema visual:** Dark & Gold (`bg-surface` / `#C9A84C`) — nunca altere o tema sem pedido explícito
- **Idioma da UI:** Português (pt-BR) — SEMPRE
- **Git workflow:** feature → branch `testes` → merge → `main` → push ambos

---

## BANCO DE DADOS — TABELAS E CAMPOS CRÍTICOS

### `perfis` (1 por usuário auth)
```
id UUID PK (= auth.users.id)
tipo_usuario: 'profissional' | 'cliente'
nome, whatsapp, email
nome_studio (só profissional)
codigo_profissional VARCHAR(4) UNIQUE (1000-9999, gerado automaticamente)
```

### `servicos`
```
id, user_id FK
categoria: 'Cílios' | 'Sobrancelhas' | 'Depilação'
nome, preco_base NUMERIC
preco_promocional NUMERIC | null
promocao_ativa BOOLEAN (default false)
duracao_minutos INTEGER (default 30; Cílios=60, Depilação=60)
ativo BOOLEAN (default true)
```

### `clientes`
```
id, user_id FK (profissional dono)
nome NOT NULL, whatsapp, email, observacoes
```

### `agendamentos`
```
id, user_id FK (profissional), cliente_id FK, cliente_user_id FK (auth.users)
servico_id FK, data_hora TIMESTAMPTZ
valor_final NUMERIC, forma_pagamento TEXT (suporta "Pix + Dinheiro")
status: 'Agendado'|'Confirmado'|'Concluído'|'Cancelado'|'Não Compareceu'
local: 'Studio' | 'Domicílio'
observacoes TEXT
```

### `indisponibilidades`
```
id, user_id FK
tipo: 'dia_inteiro' | 'horario'
data_inicio TIMESTAMPTZ, data_fim TIMESTAMPTZ | null
titulo TEXT | null
recorrente BOOLEAN (default false)
dia_semana INTEGER | null (0=Dom...6=Sáb, quando recorrente)
```

---

## RPCs SUPABASE (SECURITY DEFINER — acesso público controlado)

| Função | Params | Uso |
|---|---|---|
| `get_servicos_do_profissional` | `user_id UUID` | Cliente lê serviços de um profissional |
| `get_horarios_disponiveis` | `prof_id, data DATE, duracao INT=30` | Slots livres 07h–22h |
| `get_agendamentos_ocupados` | `prof_id UUID, data DATE` | Slots com agendamentos ativos |
| `criar_agendamento_publico` | `codigo_prof, servico_id, data_hora, local, forma_pagamento, cliente_nome, whatsapp, email?, cliente_user_id?, observacoes?` | Cria agendamento via portal público |
| `cancelar_agendamento_cliente` | `ag_id UUID, cliente_user_id UUID` | Cliente cancela (exige >2h de antecedência) |
| `reagendar_agendamento` | `ag_id UUID, prof_user_id UUID, nova_data_hora TIMESTAMPTZ` | Profissional reagenda mantendo todos os dados |
| `handle_new_user()` | — | Trigger: cria perfil no cadastro |

---

## ROTAS DA APLICAÇÃO

### Públicas (sem login)
```
/                     → redirect /buscar ou /dashboard
/buscar               → buscar profissional por código 4 dígitos
/p/[code]             → perfil público + catálogo + agendamento (login required para agendar)
/login                → auth; ?next= para redirect pós-login
/register             → cadastro; ?tipo=cliente|profissional, ?next=
/recuperar-senha      → solicitar reset
/redefinir-senha      → form com token do email
/email-confirmado     → pós-confirmação de email
```

### Protegidas — Profissional
```
/dashboard            → KPIs + gráficos (Recharts)
/agendamentos         → CRUD de agendamentos
/clientes             → lista de clientes
/clientes/[id]        → detalhes + histórico do cliente
/servicos             → serviços + indisponibilidades + promoções
```

### Protegidas — Cliente
```
/cliente/agendamentos → histórico de agendamentos do cliente logado
```

### API Routes
```
POST /api/agendamentos/publico      → criar agendamento (público)
POST /api/agendamentos/[id]/cancelar → cancelar agendamento (cliente autenticado, 2h+ antecedência)
GET  /api/horarios-disponiveis      → slots livres (?profissional=&data=&duracao=)
GET  /api/auth/callback             → callback Supabase Auth
```

---

## MAPA DE ARQUIVOS — ONDE MEXER

### Queries (lógica de banco)
```
lib/queries/servicos.ts          → CRUD serviços, toggle promoção, update duração
lib/queries/clientes.ts          → CRUD clientes
lib/queries/agendamentos.ts      → CRUD agendamentos, filtros, dashboard metrics
lib/queries/perfis.ts            → perfil, getProfissionalByCodigo, getServicosDoProfissional, getAgendamentosDoCliente
lib/queries/indisponibilidades.ts → CRUD bloqueios, getHorariosDisponiveis
```

### Componentes principais
```
components/publico/agendamento-modal.tsx    → modal de agendamento (clientes, login obrigatório)
components/servicos/servico-form.tsx        → CRUD serviço (duração, promoção, categoria)
components/servicos/indisponibilidade-modal.tsx → bloquear horários/dias
components/agendamentos/agendamento-form.tsx   → form do profissional
components/agendamentos/reagendamento-modal.tsx → modal de reagendamento (profissional, busca slots disponíveis)
components/agendamentos/calendario-semanal.tsx  → view semanal com toggle lista/calendário
components/ui/payment-selector.tsx          → pagamento misto
components/layout/app-shell.tsx             → layout autenticado
components/perfil/perfil-modal.tsx          → dados do studio
components/dashboard/revenue-chart.tsx      → gráfico faturamento
components/dashboard/payment-chart.tsx      → gráfico pagamentos
```

### Páginas (App Router)
```
app/(auth)/login/page.tsx
app/(auth)/register/page.tsx
app/(dashboard)/dashboard/page.tsx
app/(dashboard)/agendamentos/page.tsx
app/(dashboard)/servicos/page.tsx
app/(dashboard)/clientes/page.tsx
app/(dashboard)/clientes/[id]/page.tsx
app/(dashboard)/cliente/agendamentos/page.tsx
app/buscar/page.tsx
app/p/[code]/page.tsx
app/api/agendamentos/publico/route.ts
app/api/horarios-disponiveis/route.ts
app/api/auth/callback/route.ts
middleware.ts                               → auth guard: rotas protegidas vs públicas
types/database.ts                           → todos os tipos TS do projeto
```

---

## REGRAS DE NEGÓCIO (IMUTÁVEIS SEM PEDIDO EXPLÍCITO)

1. **Horários:** 07h00–22h00, slots de 30 em 30 min
2. **Duração padrão:** 30 min; Cílios = 60 min; Depilação = 60 min
3. **Login obrigatório** para agendar (cliente não logado → modal auth com redirect)
4. **Slots ocultos para cliente:** qualquer slot com agendamento ativo (status ≠ Cancelado/Não Compareceu) OU com indisponibilidade cadastrada
5. **Pagamento misto:** `forma_pagamento` é TEXT, aceita combinações livres ("Pix + Cartão Débito")
6. **Promoção:** toggle por serviço; quando ativa, usa `preco_promocional` no agendamento público
7. **Código do profissional:** 4 dígitos únicos (1000–9999), gerado pelo trigger `handle_new_user`
8. **RLS:** `auth.uid() = user_id` em todas as tabelas; RPCs SECURITY DEFINER para leituras públicas
9. **Faturamento:** exclui status 'Cancelado' e 'Não Compareceu' de todos os cálculos
10. **Valor do agendamento público:** usa `preco_promocional` se `promocao_ativa = true`, senão `preco_base`

---

## CONVENÇÕES DO PROJETO

- **Toasts:** sempre via `sonner` (`toast.success`, `toast.error`)
- **Forms:** React Hook Form + Zod (schema de validação separado no mesmo arquivo)
- **Supabase browser:** `lib/supabase/client.ts` → `createBrowserClient`
- **Supabase server:** `lib/supabase/server.ts` → `createServerClient` (Server Components, API Routes)
- **Formatação de moeda:** `formatCurrency(value)` de `lib/utils.ts`
- **Cores de categoria:** `getCategoriaColor(categoria)` de `lib/utils.ts`
- **Data/hora:** sempre `America/Manaus` (UTC-4, sem horário de verão, offset `-04:00`, nunca UTC sem conversão)
- **Tailwind:** tokens customizados em `tailwind.config.ts`; usar `bg-surface`, `border-[#C9A84C]`

---

## MIGRATIONS — ESTADO ATUAL

| # | Arquivo | O que fez |
|---|---|---|
| 001 | `001_initial_schema.sql` | Schema base: clientes, servicos, agendamentos + RLS + triggers |
| 002 | `002_perfis_e_portal_cliente.sql` | perfis, handle_new_user trigger, cliente_user_id, criar_agendamento_publico RPC |
| 003 | `003_fix_agendamento_publico.sql` | Correções na RPC de agendamento público |
| 004 | `004_disponibilidade_e_promocoes.sql` | indisponibilidades, duracao_minutos, preco_promocional, get_horarios_disponiveis |
| 005 | `005_pagamento_misto.sql` | forma_pagamento: ENUM → TEXT |
| 006 | `006_horarios_07_as_22.sql` | Slots 07h–22h (era 08h–17h) |
| 007 | `007_fix_servicos_rls_e_duracao.sql` | Remove política pública que vazava serviços; Cílios/Depilação → 60min |
| 008 | `008_fix_servicos_publico_rls.sql` | get_servicos_do_profissional RPC (SECURITY DEFINER) |
| 009 | `009_agendamentos_ocupados_e_login_obrigatorio.sql` | get_agendamentos_ocupados RPC; login obrigatório para agendar |
| 010 | `010_cancelamento_cliente_e_reagendamento.sql` | RPC `cancelar_agendamento_cliente` (2h+ antecedência); RPC `reagendar_agendamento` (profissional) |
| 011 | `011_fuso_horario_manaus.sql` | Fuso horário padrão ajustado para Manaus/AM (`America/Manaus`, UTC-4, offset `-04:00`) |

**Próxima migration:** `012_...sql`

---

## COMO ATUALIZAR ESTE ARQUIVO

Sempre que uma das situações abaixo ocorrer, **atualize as seções correspondentes** deste arquivo:

| Situação | Seção a atualizar |
|---|---|
| Nova tabela ou coluna no banco | BANCO DE DADOS |
| Nova RPC criada | RPCs SUPABASE |
| Nova rota ou API route | ROTAS DA APLICAÇÃO |
| Novo componente relevante | MAPA DE ARQUIVOS |
| Nova regra de negócio | REGRAS DE NEGÓCIO |
| Nova migration aplicada | MIGRATIONS |
| Mudança de convenção | CONVENÇÕES |
