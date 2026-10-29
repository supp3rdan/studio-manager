# Studio Manager 🌟

Aplicação web responsiva para gestão de estúdio de beleza — clientes, serviços, agendamentos e dashboard financeiro.

## Stack

- **Framework:** Next.js 14 (App Router + TypeScript)
- **UI/Design:** Tailwind CSS + Shadcn UI (tema Dark & Gold)
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Gráficos:** Recharts
- **Deploy:** Vercel

## Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com)
- Conta na [Vercel](https://vercel.com)

## Configuração

### 1. Clone o repositório e instale as dependências

```bash
git clone <repo-url>
cd studio-manager
npm install
```

### 2. Configure o banco de dados (Supabase)

1. Crie um projeto em [app.supabase.com](https://app.supabase.com)
2. Acesse **SQL Editor** e execute o arquivo:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
3. Isso criará as tabelas `clientes`, `servicos` e `agendamentos` com RLS habilitado.

### 3. Configure as variáveis de ambiente

Copie `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

Edite `.env.local` com suas credenciais do Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key-aqui
```

> As chaves estão em: **Supabase Dashboard → Settings → API**

### 4. Rode o servidor de desenvolvimento

```bash
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

### 5. Crie seu usuário

No **Supabase Dashboard → Authentication → Users**, crie um usuário com e-mail e senha. Você também pode usar a opção "Invite user".

## Deploy na Vercel

1. Importe o repositório na Vercel
2. Configure as variáveis de ambiente:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy automático a cada `git push` na branch `main`

## Módulos

| Módulo | Rota | Descrição |
|---|---|---|
| Dashboard | `/dashboard` | Métricas financeiras + gráficos |
| Clientes | `/clientes` | CRUD de clientes |
| Serviços | `/servicos` | Catálogo de procedimentos |
| Agendamentos | `/agendamentos` | Agenda transacional |

## Regras de Negócio

- **RN01:** Ao selecionar um serviço no formulário de agendamento, o campo "Valor Final" é preenchido automaticamente com o preço base, mas pode ser editado manualmente.
- **RN02:** O dashboard exclui agendamentos com status "Cancelado" ou "Não Compareceu" dos cálculos financeiros.

## Segurança

Todas as tabelas possuem **Row Level Security (RLS)** ativada — cada usuário acessa apenas seus próprios dados.
