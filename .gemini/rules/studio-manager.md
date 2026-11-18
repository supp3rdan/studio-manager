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
- **Versão atual:** 0.13.0 (ver `CHANGELOG.md`)

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
nome NOT NULL, whatsapp   (NÃO tem coluna email — e-mail da cliente vem de perfis/auth.users via cliente_user_id)
```

### `agendamentos`
```
id, user_id FK (profissional), cliente_id FK, cliente_user_id FK (auth.users)
servico_id FK, data_hora TIMESTAMPTZ
valor_final NUMERIC, forma_pagamento TEXT (suporta "Pix + Dinheiro")
status: 'Agendado'|'Confirmado'|'Concluído'|'Cancelado'|'Não Compareceu'
local: 'Studio' | 'Domicílio'
observacoes TEXT
token_publico UUID UNIQUE (link /a/[token] do lembrete)
lembrete_enviado_em, confirmado_em TIMESTAMPTZ (trigger zera ambos quando data_hora muda)
```

### `expedientes` (sem linhas = padrão 07:00–22:30 todos os dias)
```
PK (user_id, dia_semana 0-6), ativo BOOLEAN, inicio TIME, fim TIME (= término máximo do atendimento)
perfis.agenda_intervalo_min (grade: 10|15|20|30|40|45|60, default 30)
perfis.agenda_buffer_min (intervalo entre atendimentos, 0-120, default 0)
```

### `lista_espera`
```
id, profissional_id, cliente_user_id, servico_id, data DATE
status: 'aguardando'|'notificado'|'atendido'|'expirado'; UNIQUE(prof, cliente, servico, data)
INSERT só via RPC entrar_lista_espera; cliente/profissional podem SELECT/DELETE as próprias
```

### `sm_config` (privada, RLS sem políticas)
```
chave 'cron_secret' → mesmo valor da env CRON_SECRET na Vercel
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
| `horarios_disponiveis_publico` | `prof_id, data DATE, duracao INT=30` | anon, auth | Slots livres públicos ("HH:mm") → delega p/ `sm_slots_livres` |
| `sm_slots_livres` | `prof_id, data, duracao, ignorar_ag?` | interno | **Fonte única**: expediente + grade + buffer + conflitos + só futuro |
| `sm_expediente_do_dia` | `prof_id, data` | interno | `(aberto, inicio_min, fim_min, intervalo_min, buffer_min)` |
| `salvar_expediente` | `dias JSONB[7], intervalo, buffer` | auth (profissional) | Salva expediente |
| `conflitos_agenda` | `data_hora, duracao, ignorar_ag?` | auth | Lista conflitos (agendamento/bloqueio/expediente) p/ o form manual |
| `agendamento_por_token` / `confirmar_presenca` | `token UUID` | anon, auth | Página `/a/[token]` |
| `reagendar_agendamento_cliente` | `ag_id, nova_data_hora` | auth (cliente) | Remarcação pela cliente (>2h), valida slot |
| `entrar_lista_espera` | `codigo_prof, servico_id, data` | auth | Entra na fila (máx. 10 ativas) |
| `lista_espera_do_profissional` / `minha_lista_espera` | — | auth | Leitura com nomes |
| `sm_lembretes_pendentes` / `sm_marcar_lembretes_enviados` / `sm_lista_espera_notificar` | `segredo, ...` | anon (gated por `CRON_SECRET`) | Usadas só no servidor (`lib/lista-espera.ts`, cron) |
| `get_horarios_disponiveis` | idem | anon, auth | Legado → delega p/ a de cima |
| `sm_horario_conflita` | `prof_id, inicio, fim, ignorar_ag?, checar_bloqueios?=true` | interno | Helper de conflito (agendamentos ativos + buffer + bloqueios) |
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
/p/[code]             → perfil público + catálogo + agendamento (login required para agendar) + "Avise-me se abrir horário"
/a/[token]            → confirmação de presença / remarcar (link do e-mail de lembrete)
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
POST /api/agendamentos/[id]/cancelar → cancelar agendamento (cliente autenticado, 2h+ antecedência) + avisa lista de espera
POST /api/agendamentos/[id]/reagendar → cliente remarca (2h+) + e-mails + avisa lista de espera
POST /api/agenda/horario-liberado    → painel do profissional avisa lista de espera ({ data })
GET  /api/cron/diario               → Vercel Cron 13:00 UTC; Bearer CRON_SECRET; lembretes + varredura da lista de espera
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
lib/email.ts            → Resend: sendResendEmail, sendResendBatch (/emails/batch, até 100), templates (layoutEmail/cartao/botao); escapeHtml() em todo dado de usuário
lib/lista-espera.ts     → getSistemaClient(), getCronSecret(), notificarListaEspera(prof?, data?) — só no servidor
lib/app-url.ts          → getAppUrl() p/ links de e-mail (NEXT_PUBLIC_APP_URL → VERCEL_PROJECT_PRODUCTION_URL → URL de produção)
lib/queries/expediente.ts → getConfigExpediente(), salvarConfigExpediente()
vercel.json             → crons
.github/workflows/ci.yml → lint + tsc + build em PR/push na main
```

### Componentes principais
```
components/publico/agendamento-modal.tsx    → modal de agendamento (clientes, login obrigatório)
components/servicos/servico-form.tsx        → CRUD serviço (duração, promoção, categoria)
components/servicos/indisponibilidade-modal.tsx → bloquear horários/dias
components/agendamentos/agendamento-form.tsx   → form do profissional (checa conflitos_agenda → "Encaixar mesmo assim")
components/agendamentos/reagendamento-modal.tsx → reagendamento; prop modo="profissional"|"cliente"
components/servicos/expediente-config.tsx       → configuração de expediente (aba Disponibilidade de /servicos)
components/publico/confirmacao-agendamento.tsx  → UI da página /a/[token]
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

1. **Horários:** definidos pelo expediente do profissional (padrão 07:00–22:30, grade de 30 min); término ≤ fim do expediente; buffer entre atendimentos; só horários futuros (filtrado no servidor)
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
12. **Cancelamento e remarcação pela cliente:** só status Agendado/Confirmado e com >2h de antecedência
13. **Lembrete:** cron diário envia para `Agendado` de agora+2h até o fim de amanhã (criados há >1h, sem lembrete). Confirmar exige clique na página (filtros de e-mail visitam links)
14. **Liberou horário → avisar lista de espera:** cancelamento, falta, exclusão, mudança de data/hora ou remarcação devem chamar `notificarListaEspera` (servidor) ou `avisarHorarioLiberado` (painel)
15. **Profissional pode encaixar** sobre conflito no form manual (decisão consciente); público/cliente nunca

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
- ❌ Ler `SUPABASE_SERVICE_ROLE_KEY` para tarefas de sistema → ✅ RPC `sm_*` com `p_segredo` (CRON_SECRET) validado em `sm_validar_segredo`
- ❌ Disparar e-mail sem `await` em rota (Vercel congela a função) → ✅ `await` (com `.catch` para não quebrar a resposta)
- ✅ Toda RPC nova: `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC` e `GRANT` explícito (por padrão o Postgres concede EXECUTE a PUBLIC)

---

## MIGRATIONS — COMO ESCREVER (produção não pode cair)

- Envolver em `BEGIN; ... COMMIT;` e ser **idempotente** (`IF NOT EXISTS`, `DROP ... IF EXISTS`, `CREATE OR REPLACE`)
- Mudou tipo de retorno/params de função? `CREATE OR REPLACE` falha ("cannot change return type") → remover todas as sobrecargas via `DO $$ ... pg_proc ... DROP FUNCTION $$` (ver 012)
- Preferir manter assinaturas antigas (params ignorados) para o código em produção não quebrar
- **Ordem de deploy:** se a migration é só aditiva e compatível com o código em produção → SQL primeiro, depois merge (caso da 013). Se o código novo precisa funcionar com o banco antigo → merge primeiro, depois SQL (caso da 012). Sempre informar ao usuário qual arquivo rodar e quando
- plpgsql `RETURNS TABLE (id ..., data ...)`: as colunas viram variáveis — **sempre qualifique** colunas (`le.id`) para evitar ambiguidade
- Testar localmente (Postgres 16 com stub de `auth.uid()` lendo `request.jwt.claim.sub`) quando possível

---

## VERIFICAÇÃO (rodar antes de commitar)

```
npx tsc --noEmit && npm run lint && npm run build
```
Build exige `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` (valores fictícios servem) e acesso ao Google Fonts (`next/font` Inter).

**Env vars de produção (Vercel):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (domínio verificado), `CRON_SECRET` (= `sm_config.cron_secret`), opcional `NEXT_PUBLIC_APP_URL`. Plano Hobby da Vercel: cron no máximo 1x/dia.

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
| 013 | `013_expediente_lembretes_lista_espera.sql` | Expediente/buffer; lembrete + confirmação por token; remarcação pela cliente; conflitos_agenda; lista de espera; sm_config/CRON_SECRET |

> 006 e 011 falhavam silenciosamente em `get_horarios_disponiveis` (tipo de retorno); a 012 corrige.
> 012 aplicada em produção (18/11/2026); fallback legado da API de horários removido.

**Próxima migration:** `014_...sql`

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
