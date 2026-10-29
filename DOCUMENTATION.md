# Documentação do Projeto — Studio Manager 🌟

Aplicação web moderna e responsiva voltada para a gestão integrada de estúdios de beleza e estética (especializada em cílios, sobrancelhas e depilação). O sistema oferece controle completo de clientes, catálogo de procedimentos, agenda transacional e painel analítico financeiro em tempo real sob uma identidade visual refinada **Dark & Gold**.

---

## 1. Como Executar o Projeto Quando Instalado

### Pré-requisitos
- **Node.js**: versão 18.x ou superior (testado e validado no Node.js v24).
- **Gerenciador de Pacotes**: `npm` (incluso no Node), `yarn` ou `pnpm`.
- **Conta Supabase**: projeto PostgreSQL gratuito ou pro no [supabase.com](https://supabase.com).

---

### Passo a Passo

#### 1. Configurar as Variáveis de Ambiente
Na raiz do projeto (`studio-manager`), verifique ou crie o arquivo `.env.local` a partir do modelo `.env.example`:

```bash
cp .env.example .env.local
```

Preencha as variáveis com as credenciais do seu projeto Supabase (disponíveis em **Project Settings → API**):

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key-aqui
```

#### 2. Executar o Script do Banco de Dados
Acesse o painel do **Supabase**, abra o menu **SQL Editor**, cole e execute o conteúdo do arquivo de migração:
`supabase/migrations/001_initial_schema.sql`

> Este script criará automaticamente os tipos enumerados, as tabelas (`clientes`, `servicos`, `agendamentos`), os índices de performance, triggers de atualização e as políticas de segurança de linha (**RLS**).

#### 3. Criar o Usuário de Acesso
No painel do Supabase, vá em **Authentication → Users** e clique em **Add User** (crie um usuário com e-mail e senha).

#### 4. Executar a Aplicação

##### Modo de Desenvolvimento (com Hot Reload):
```bash
npm run dev
```
A aplicação estará disponível em: `http://localhost:3000`

##### Modo de Produção (Build Otimizado):
```bash
npm run build
npm run start
```

Ao acessar `http://localhost:3000`, você será redirecionado para a tela de autenticação (`/login`). Entre com o e-mail e senha cadastrados no Supabase para acessar o painel administrativo.

---

## 2. Tecnologias Utilizadas

| Camada | Tecnologia | Finalidade |
|---|---|---|
| **Front-end / Framework** | [Next.js 14](https://nextjs.org/) (App Router) | Renderização híbrida (SSR/SSG), roteamento dinâmico e otimizações de performance. |
| **Linguagem** | [TypeScript](https://www.typescriptlang.org/) | Tipagem estática em tempo de compilação para máxima confiabilidade do código. |
| **Estilização** | [Tailwind CSS 3](https://tailwindcss.com/) | Utilitários CSS modulares e customização da paleta Dark & Gold. |
| **Componentes de UI** | [Shadcn UI](https://ui.shadcn.com/) / [Radix UI](https://www.radix-ui.com/) | Primitivos acessíveis (WAI-ARIA) e semânticos (Dialogs, Selects, Tables, Alerts). |
| **Gráficos & Analytics** | [Recharts](https://recharts.org/) | Gráficos SVG responsivos para acompanhamento financeiro mensal e por método de pagamento. |
| **Formulários e Validação** | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) | Validação de formulários declarativa, com alta performance e sem renderizações redundantes. |
| **Feedback Visual** | [Sonner](https://sonner.emilkowal.ski/) | Notificações tipo *toast* elegantes e não invasivas. |
| **Back-end e Database** | [Supabase](https://supabase.com/) (PostgreSQL) | Banco relacional com APIs em tempo real, Supabase Auth e Row Level Security (RLS). |
| **Manipulação de Datas** | [date-fns](https://date-fns.org/) | Formatação e internacionalização para datas e horários em Português do Brasil (pt-BR). |

---

## 3. Arquitetura e Estrutura de Pastas

```
studio-manager/
├── app/
│   ├── (auth)/login/page.tsx             # Interface de login elegante Dark & Gold
│   ├── (dashboard)/
│   │   ├── layout.tsx                   # Shell autenticado com verificação de sessão
│   │   ├── dashboard/page.tsx           # Painel de métricas financeiras (RF04)
│   │   ├── clientes/
│   │   │   ├── page.tsx                 # Gestão e busca de clientes (RF01)
│   │   │   └── [id]/page.tsx            # Detalhes, estatísticas e histórico do cliente
│   │   ├── servicos/page.tsx            # Catálogo de procedimentos agrupado (RF02)
│   │   └── agendamentos/page.tsx        # Agenda transacional e filtros (RF03)
│   ├── api/auth/callback/route.ts       # Endpoint para troca de tokens de sessão
│   ├── globals.css                      # Definição dos tokens CSS e paleta Dark & Gold
│   └── layout.tsx                       # Layout raiz com provedor de temas e Toaster
├── components/
│   ├── ui/                              # Componentes primitivos (Button, Card, Dialog, Table, etc.)
│   ├── layout/                          # Sidebar de navegação e Header com logout
│   ├── clientes/                        # Modal de formulário para Clientes
│   ├── servicos/                        # Modal de formulário para Serviços
│   ├── agendamentos/                    # Modal com auto-preenchimento de valores
│   └── dashboard/                       # Cards de indicadores e componentes de gráficos
├── lib/
│   ├── supabase/                        # Inicialização do client Supabase (SSR e Browser)
│   ├── queries/                         # Consultas SQL tipadas e regras de agregação
│   └── utils.ts                         # Formatadores de moeda (BRL), telefone e cores
├── middleware.ts                         # Interceptador de rotas para proteção de acesso
├── supabase/migrations/                  # Scripts SQL versionados para o banco de dados
├── types/database.ts                    # Definições de tipos TypeScript do banco de dados
├── tailwind.config.ts                   # Configuração e tema visual customizado
└── package.json                         # Dependências e scripts do ecossistema Node
```

---

## 4. Módulos do Sistema e Funcionalidades

### 🔐 Autenticação e Segurança de Rotas (`middleware.ts` e `/login`)
- **Proteção Automática (RNF02)**: O middleware Next.js intercepta todas as requisições privadas. Usuários sem sessão válida são direcionados para `/login`. Usuários autenticados que tentarem acessar `/login` são redirecionados automaticamente para `/dashboard`.
- **Supabase Auth**: Autenticação segura por e-mail e senha com gerenciamento de sessão via cookies HTTP seguros (compatível com Server Components e Server Actions).

### 👥 Módulo de Clientes (RF01 — `/clientes` e `/clientes/[id]`)
- **Listagem e Busca Rápida**: Tabela com pesquisa em tempo real por nome ou número de WhatsApp.
- **Formulário de Cadastro/Edição**: Modal com validação via Zod (nome obrigatório e WhatsApp formatado).
- **Exclusão com Confirmação**: Proteção contra exclusão acidental via diálogo de alerta (`AlertDialog`).
- **Página de Detalhes e Histórico (`/clientes/[id]`)**: Visão 360° do cliente, exibindo métricas consolidadas (quantidade de atendimentos realizados e total investido em R$) juntamente com a tabela completa de seu histórico de procedimentos.

### ✂️ Módulo de Serviços (RF02 — `/servicos`)
- **Catálogo Categorizado**: Procedimentos organizados visualmente nas categorias:
  - *Cílios*
  - *Sobrancelhas*
  - *Depilação*
- **Tipos de Tabela**: Diferenciação clara entre serviços de **Tabela Padrão** e **Promoção** (destacados com badge comemorativo).
- **Preço Base**: Configuração do valor original do procedimento utilizado como referência no agendamento.

### 📅 Módulo de Agendamentos (RF03 — `/agendamentos`)
- **Agenda Transacional Completa**:
  - Seleção de Cliente e Procedimento via relacionamento de chave estrangeira.
  - Data e hora com seletor `datetime-local` adaptado para o fuso local.
  - **Forma de Pagamento**: Pix, Cartão Débito, Cartão Crédito, Crédito Bemol e Dinheiro.
  - **Status do Atendimento**: Agendado, Confirmado, Concluído, Cancelado e Não Compareceu (com chips coloridos semânticos).
  - **Local**: Studio ou Domicílio.
  - Campo aberto para Observações.
- **Preenchimento Dinâmico (RN01)**: Ao escolher um serviço na criação do agendamento, o campo **Valor Final** é automaticamente alimentado com o preço base do serviço cadastrado, mantendo-se totalmente editável pelo profissional para conceder descontos ou acréscimos.
- **Filtro de Status**: Dropdown no topo da tabela permitindo filtrar rapidamente os agendamentos pelo estado atual.

### 📊 Painel Analítico / Dashboard (RF04 — `/dashboard`)
- **Cards de Indicadores (KPIs)**:
  - **Faturamento Realizado**: Soma financeira exclusivamente dos atendimentos com status `"Concluído"`.
  - **Faturamento Previsto**: Soma financeira dos atendimentos futuros com status `"Agendado"` ou `"Confirmado"`.
  - **Atendimentos Concluídos**: Contagem de procedimentos realizados com sucesso.
  - **Agendamentos Pendentes**: Contagem de atendimentos marcados que aguardam realização.
- **Gráfico de Evolução Mensal (Recharts BarChart)**: Mostra o histórico de faturamento dos últimos 6 meses com formatação em Reais (R$) e tooltip interativo.
- **Distribuição de Receita por Pagamento (Recharts Pie/Donut Chart)**: Visualização da proporção de faturamento por método de pagamento utilizado.
- **Acurácia Financeira (RN02)**: Todas as consultas de cálculo financeiro filtram e excluem estritamente agendamentos com status `"Cancelado"` ou `"Não Compareceu"`.

---

## 5. Regras de Negócio e Segurança de Dados

1. **RN01 — Preenchimento Dinâmico com Sobrescrita**:
   O estado do formulário escuta alterações na seleção do serviço (`watch("servico_id")`). Ao identificar o serviço correspondente, atualiza o campo `valor_final` sem bloquear a intervenção manual do usuário.
2. **RN02 — Filtro Rigoroso de Acurácia Financeira**:
   As queries de agregação em `lib/queries/agendamentos.ts` aplicam cláusulas restritas para não computar valores de agendamentos cancelados ou em que o cliente não compareceu.
3. **RNF01 — Row Level Security (RLS)**:
   Todas as tabelas do PostgreSQL possuem políticas RLS ativas vinculadas a `auth.uid() = user_id`. Mesmo que ocorram requisições indevidas na API, o banco garante que nenhum usuário tenha visibilidade ou permissão de escrita sobre dados de outros estúdios.

---

## 6. Preparação para Deploy na Vercel

A aplicação foi configurada e validada para deploy contínuo na [Vercel](https://vercel.com):
1. Conecte o repositório Git à Vercel.
2. Nas configurações do projeto (**Settings → Environment Variables**), adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Cada commit enviado para a branch principal (`main`) acionará o build de produção via Edge Network de forma 100% automatizada.
