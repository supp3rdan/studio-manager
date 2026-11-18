# 💅 Studio Manager

> Sistema completo de agendamento para profissionais de beleza — Cílios, Sobrancelhas e Depilação.

[![Deploy](https://img.shields.io/badge/deploy-Vercel-black?logo=vercel)](https://studio-manager-three.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green?logo=supabase)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)

🔗 **Acesse agora:** [studio-manager-three.vercel.app](https://studio-manager-three.vercel.app)  
📦 **Repositório:** [github.com/supp3rdan/studio-manager](https://github.com/supp3rdan/studio-manager)

---

## 📋 O que é?

O **Studio Manager** é uma plataforma SaaS que permite que profissionais autônomos de beleza gerenciem toda a operação do seu negócio:

- 📅 **Agenda online** — clientes agendam pelo link público do profissional
- 💰 **Controle financeiro** — dashboard com gráficos de faturamento
- 👥 **Carteira de clientes** — cadastro e histórico
- 💈 **Catálogo de serviços** — com preços, durações e promoções
- 🚫 **Gestão de disponibilidade** — bloqueio de horários e dias

---

## 🎯 Funcionalidades

### Para o Profissional
| Funcionalidade | Descrição |
|---|---|
| **Dashboard** | Métricas financeiras, gráfico de faturamento mensal e por método de pagamento |
| **Agendamentos** | Criar, editar, confirmar, cancelar e marcar como concluído |
| **Clientes** | Cadastro completo com histórico de atendimentos |
| **Serviços** | CRUD de serviços por categoria, com duração e preço personalizáveis |
| **Disponibilidade** | Bloquear dias inteiros ou horários específicos (recorrentes ou únicos) |
| **Preços promocionais** | Cadastrar preço promocional por serviço e ativar/desativar quando quiser |
| **Link público** | Compartilhar `/buscar` + código para clientes agendarem |
| **Perfil do Studio** | Nome do studio, WhatsApp, dados de contato |
| **Exportar PDF** | Relatório de agendamentos em PDF |

### Para o Cliente
| Funcionalidade | Descrição |
|---|---|
| **Buscar profissional** | Por código de 4 dígitos em `/buscar` |
| **Ver catálogo** | Serviços, preços e disponibilidade em tempo real |
| **Agendar** | Login obrigatório; horários ocupados e bloqueados são ocultados automaticamente |
| **Pagamento misto** | Combinar formas (ex: Pix + Dinheiro) |
| **Histórico** | Ver seus agendamentos em `/cliente/agendamentos` |

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia | Versão |
|---|---|---|
| **Framework** | Next.js (App Router) | 14.2.16 |
| **Linguagem** | TypeScript | 5.x |
| **Banco de dados** | Supabase (PostgreSQL) | - |
| **Autenticação** | Supabase Auth | - |
| **UI** | Tailwind CSS + Shadcn/ui + Radix UI | 3.x |
| **Formulários** | React Hook Form + Zod | 7.x / 3.x |
| **Gráficos** | Recharts | 2.x |
| **Calendário** | react-day-picker | 8.x |
| **Toasts** | Sonner | 1.x |
| **PDF** | jsPDF + jspdf-autotable | 4.x / 5.x |
| **Utilitários** | date-fns | 3.x |
| **Deploy** | Vercel | - |

---

## 🗂️ Estrutura de Rotas

```
/                           → Redirect para /buscar ou /dashboard
/buscar                     → Buscar profissional por código
/p/[code]                   → Perfil público do profissional + agendamento

/login                      → Autenticação (suporta ?next= para redirect)
/register                   → Cadastro (cliente ou profissional via ?tipo=)
/recuperar-senha            → Solicitar redefinição de senha
/redefinir-senha            → Formulário com link do email
/email-confirmado           → Página pós-confirmação de e-mail

/dashboard                  → Métricas e gráficos (profissional)
/agendamentos               → Gestão de agendamentos (profissional)
/clientes                   → Lista de clientes (profissional)
/clientes/[id]              → Detalhes do cliente
/servicos                   → Serviços + disponibilidade + promoções

/cliente/agendamentos       → Histórico de agendamentos (cliente)

/api/agendamentos/publico   → POST — Criar agendamento (público)
/api/horarios-disponiveis   → GET  — Horários livres por data
/api/auth/callback          → Callback OAuth/Supabase
```

---

## ⚙️ Como rodar localmente

### Pré-requisitos
- Node.js 18+
- Conta no [Supabase](https://supabase.com)
- Git

### 1. Clone o repositório
```bash
git clone https://github.com/supp3rdan/studio-manager.git
cd studio-manager
```

### 2. Instale as dependências
```bash
npm install
```

### 3. Configure as variáveis de ambiente
Copie o `.env.example` e preencha:
```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Execute as migrations no Supabase
No painel do Supabase → **SQL Editor**, execute os arquivos em ordem:

| # | Arquivo | O que faz |
|---|---|---|
| 001 | `001_initial_schema.sql` | Tabelas principais + RLS básico |
| 002 | `002_perfis_e_portal_cliente.sql` | Tabela `perfis`, portal público, trigger de criação automática |
| 003 | `003_fix_agendamento_publico.sql` | Correções no agendamento público |
| 004 | `004_disponibilidade_e_promocoes.sql` | Tabela `indisponibilidades`, durações, promoções, horários disponíveis |
| 005 | `005_pagamento_misto.sql` | Suporte a pagamento misto (campo TEXT) |
| 006 | `006_horarios_07_as_22.sql` | Horários de atendimento: 07h–22h |
| 007 | `007_fix_servicos_rls_e_duracao.sql` | Correção RLS serviços + duração 60min para Cílios/Depilação |
| 008 | `008_fix_servicos_publico_rls.sql` | RPC `get_servicos_do_profissional` para clientes lerem serviços |
| 009 | `009_agendamentos_ocupados_e_login_obrigatorio.sql` | RPC `get_agendamentos_ocupados` + login obrigatório para agendar |
| 010 | `010_cancelamento_cliente_e_reagendamento.sql` | Cancelamento pela cliente (2h) e reagendamento pelo profissional |
| 011 | `011_fuso_horario_manaus.sql` | Fuso horário padrão America/Manaus |
| 012 | `012_seguranca_agendamentos.sql` | Segurança: conflito de horário no banco, RPCs com `auth.uid()`, RLS revisado, índices |

### 5. Inicie o servidor
```bash
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

## 🔐 Regras de Negócio

- **Horários de atendimento:** 07h00 às 22h00, slots de 30 em 30 minutos
- **Duração padrão:** 30 minutos (Cílios e Depilação: 60 min por padrão)
- **Slots ocupados:** ocultos automaticamente para clientes ao agendar
- **Login obrigatório:** para agendar, o cliente precisa estar autenticado
- **Pagamento misto:** qualquer combinação livre (ex: "Pix + Cartão Débito")
- **Promoção:** preço especial por serviço, ativado/desativado pelo profissional
- **Código do profissional:** 4 dígitos únicos, gerado automaticamente no cadastro

---

## 🚀 Deploy

O projeto é implantado automaticamente na **Vercel** a partir da branch `main`:

1. Faça fork/clone do repositório
2. Conecte ao Vercel
3. Configure as variáveis de ambiente no painel da Vercel
4. Push na `main` → deploy automático

---

## 📚 Documentação Adicional

| Documento | Conteúdo |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Arquitetura completa, DFD, schema do banco, fluxo de dados |
| [CHANGELOG.md](./CHANGELOG.md) | Histórico de versões e migrations |
| [Documentacao-Studio-Manager.html](./Documentacao-Studio-Manager.html) | Documentação visual interativa |

---

## 🎨 Design

- **Tema:** Dark & Gold — fundo escuro (`bg-surface`), dourado (`#C9A84C`)
- **PWA:** Suporta instalação como app no celular (`manifest.json` + `sw.js`)
- **Responsivo:** Mobile-first com Tailwind CSS

---

> Desenvolvido com ❤️ para profissionais de beleza autônomos.
