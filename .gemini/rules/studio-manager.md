# Studio Manager — Contexto para IA

> Este arquivo é carregado automaticamente pelo Antigravity em toda sessão deste workspace.
> Contém o mapa completo do projeto em formato denso para minimizar tokens gastos.
> **Atualize este arquivo junto com cada mudança significativa no projeto.**

---

## IDENTIDADE DO PROJETO

- **Nome:** Studio Manager
- **Stack:** Next.js 14.2.35 (App Router) + TypeScript + Supabase (PostgreSQL + Auth) + Tailwind + Shadcn/ui
- **Deploy:** Vercel → branch `main` → auto-deploy
- **URL produção:** https://studio-manager-three.vercel.app
- **Repo:** https://github.com/supp3rdan/studio-manager
- **Tema visual:** Dark & Gold (`bg-surface` / `#C9A84C`) — nunca altere o tema sem pedido explícito
- **Idioma da UI:** Português (pt-BR) — SEMPRE
- **Git workflow:** feature → branch `testes` → merge → `main` → push ambos
- **Versão atual:** 0.12.0 (ver `CHANGELOG.md`)

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

> Identidade SEMPRE via `auth.uid()` dentro da RPC. Params `*_user_id` marcados com `_` são legados e **ignorados** (mantidos só p/ compatibilidade de assinatura).

| Função | Params | Acesso | Uso |
|---|---|---|---|
| `horarios_disponiveis_publico` | `prof_id, data DATE, duracao INT=30` | anon, auth | **Fonte única** de slots livres (retorna `horario TEXT` "HH:mm") |
| `get_horarios_disponiveis` | idem | anon, auth | Legado → delega p/ a de cima |
| `sm_horario_conflita` | `prof_id, inicio, fim, ignorar_ag?, checar_bloqueios?=true` | interno | Helper de conflito (agendamentos ativos + bloqueios) |
| `criar_agendamento_publico` | `codigo_prof, servico_id, data_hora, local, forma_pagamento, cliente_nome, whatsapp, email?, _cliente_user_id?, observacoes?` | auth | Cria agendamento; lock por profissional + valida grade/conflito |
| `cancelar_agendamento_cliente` | `ag_id, _cliente_user_id` | auth | Cliente cancela (>2h de antecedência) |
| `reagendar_agendamento` | `ag_id, _prof_user_id, nova_data_hora` | auth | Profissional reagenda (sem sobrepor outro agendamento) |
| `get_servicos_do_profissional` | `user_id UUID` | anon, auth | Cliente lê serviços de um profissional |
| `get_agendamentos_ocupados` | `prof_id, inicio, fim TIMESTAMPTZ` | anon, auth | Legado, não usado pelo código (pode ser removido numa migration futura) |
| `handle_new_user()` | — | trigger | Cria perfil no cadastro |

**ERRCODEs das RPCs → HTTP** (mapeados em `lib/api-errors.ts`): `28000`→401 · `42501`→403 · `P0002`→404 · `23P01`→409 (conflito de horário) · `22023`/`P0001`→400.

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
POST /api/agendamentos/publico      → criar agendamento (exige sessão; body validado c/ Zod; 409 = horário ocupado)
POST /api/agendamentos/[id]/cancelar → cancelar agendamento (cliente autenticado, 2h+ antecedência)
GET  /api/horarios-disponiveis      → { slots: ["HH:mm"] } (?profissional_id=&data=YYYY-MM-DD&duracao=)
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
lib/queries/indisponibilidades.ts → CRUD bloqueios, getHorariosDisponiveis (lança erro se a API falhar — nunca inventa slots)
```

### Infra / helpers
```
lib/supabase/url.ts     → getSupabaseUrl(), getSupabaseAnonKey() (únicos pontos de leitura das env vars)
lib/api-errors.ts       → rpcErrorResponse(), validationErrorResponse()
lib/email.ts            → notificarAgendamento/Cancelamento (Resend); escapeHtml() em todo dado de usuário
.github/workflows/ci.yml → lint + tsc + build em PR/push na main
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
app/api/agendamentos/[id]/cancelar/route.ts
app/api/auth/callback/route.ts
middleware.ts                               → auth guard: rotas protegidas vs públicas
types/database.ts                           → todos os tipos TS do projeto
```

---

## REGRAS DE NEGÓCIO (IMUTÁVEIS SEM PEDIDO EXPLÍCITO)

1. **Horários:** início 07h00–22h00, slots de 30 em 30 min, término até 22h30; só horários futuros (filtrado no servidor)
2. **Duração padrão:** 30 min; Cílios = 60 min; Depilação = 60 min
3. **Login obrigatório** para agendar (cliente não logado → modal auth com redirect)
4. **Slots ocultos para cliente:** qualquer slot com agendamento ativo (status ≠ Cancelado/Não Compareceu) OU com indisponibilidade cadastrada
5. **Pagamento misto:** `forma_pagamento` é TEXT, aceita combinações livres ("Pix + Cartão Débito")
6. **Promoção:** toggle por serviço; quando ativa, usa `preco_promocional` no agendamento público
7. **Código do profissional:** 4 dígitos únicos (1000–9999), gerado pelo trigger `handle_new_user`
8. **RLS:** `auth.uid() = user_id` em todas as tabelas; **sem** políticas públicas de INSERT/SELECT — operações públicas só via RPCs SECURITY DEFINER
9. **Faturamento:** exclui status 'Cancelado' e 'Não Compareceu' de todos os cálculos
10. **Valor do agendamento público:** usa `preco_promocional` se `promocao_ativa = true`, senão `preco_base`
11. **Conflito de horário:** validado NO BANCO (`sm_horario_conflita` + `pg_advisory_xact_lock` por profissional). O front só exibe; nunca é a garantia
12. **Cancelamento pela cliente:** só status Agendado/Confirmado e com >2h de antecedência

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
- **API routes:** validar entrada com Zod (`safeParse`) → `validationErrorResponse`; erros de RPC → `rpcErrorResponse`; nunca devolver `error.message` de erro 500 ao cliente

---

## SEGURANÇA — NÃO REINTRODUZIR (checklist antes de qualquer PR)

- ❌ Confiar em `user_id`/`cliente_user_id` vindo do body/query → ✅ `supabase.auth.getUser()` na rota e `auth.uid()` na RPC
- ❌ `SUPABASE_SERVICE_ROLE_KEY` em rotas → ✅ chave anon + RPC SECURITY DEFINER
- ❌ Fallback que faz INSERT/UPDATE direto quando a RPC falha → ✅ retornar o erro
- ❌ Política RLS `USING (true)` / `WITH CHECK (true)` → ✅ RPC dedicada
- ❌ Calcular disponibilidade em TS ou no front → ✅ alterar só `horarios_disponiveis_publico`/`sm_horario_conflita`
- ❌ Interpolar dado do usuário em HTML de e-mail → ✅ `escapeParams`/`escapeHtml`
- ❌ Fallback que exibe grade cheia em caso de erro → ✅ lançar erro + toast
- ✅ Toda RPC nova: `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC` e `GRANT` explícito (por padrão o Postgres concede EXECUTE a PUBLIC)

---

## MIGRATIONS — COMO ESCREVER (produção não pode cair)

- Envolver em `BEGIN; ... COMMIT;` e ser **idempotente** (`IF NOT EXISTS`, `DROP ... IF EXISTS`, `CREATE OR REPLACE`)
- Mudou tipo de retorno/params de função? `CREATE OR REPLACE` falha ("cannot change return type") → remover todas as sobrecargas via `DO $$ ... pg_proc ... DROP FUNCTION $$` (ver 012)
- Preferir manter assinaturas antigas (params ignorados) para o código em produção não quebrar
- **Ordem de deploy:** código compatível com banco antigo E novo → merge na `main` (Vercel) → depois o usuário roda o SQL no SQL Editor. Sempre informar ao usuário qual arquivo rodar e quando
- Testar localmente (Postgres 16 com stub de `auth.uid()` lendo `request.jwt.claim.sub`) quando possível

---

## VERIFICAÇÃO (rodar antes de commitar)

```
npx tsc --noEmit && npm run lint && npm run build
```
Build exige `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` (valores fictícios servem) e acesso ao Google Fonts (`next/font` Inter).

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
| 012 | `012_seguranca_agendamentos.sql` | Conflito de horário no banco c/ lock; RPCs c/ `auth.uid()`; remove RLS públicas; `horarios_disponiveis_publico`; índices |

> 006 e 011 falhavam silenciosamente em `get_horarios_disponiveis` (tipo de retorno); a 012 corrige.
> 012 aplicada em produção (18/11/2026); fallback legado da API de horários removido.

**Próxima migration:** `013_...sql`

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
| Mudança em auth/RLS/RPC pública | SEGURANÇA |
