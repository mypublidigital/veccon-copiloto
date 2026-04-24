# Copiloto IA Veccon

Agente conversacional interno para colaboradores da Veccon Empreendimentos Imobiliários.

---

## Stack

- **Next.js 15** (App Router, TypeScript, Server Components)
- **Supabase** (Auth + PostgreSQL + RLS)
- **Anthropic Claude** (`claude-sonnet-4-6`) — chat em streaming
- **Tailwind CSS v4**
- **React Markdown** — renderização de respostas

---

## Funcionalidades

| Área | Funcionalidade |
|---|---|
| **Auth** | Login com e-mail/senha, middleware de proteção de rotas |
| **Chat** | Chat em streaming com o Copiloto IA, histórico de conversas |
| **Sidebar** | Lista de conversas (direita), renomear, excluir |
| **Admin — Usuários** | Cadastrar, excluir, redefinir senha |
| **Admin — Dashboard** | KPIs, uso por departamento, atividade diária |
| **Admin — Conversas** | Lista de todas as conversas com busca |
| **Admin — Agente** | Chat analítico que lê o banco e responde perguntas |
| **Logs** | Registro automático de ações de acesso |

---

## Setup

### 1. Clonar / Instalar dependências

> **IMPORTANTE:** O Google Drive corrompe `node_modules`. Instale em um diretório local.

```bash
# Copiar código para diretório local
xcopy "G:\Drives compartilhados\Docs Clientes\Veccon\veccon-copiloto" "C:\Users\marck\dev\veccon-copiloto" /E /I

cd C:\Users\marck\dev\veccon-copiloto
npm install
```

### 2. Configurar variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
ANTHROPIC_API_KEY=sua-anthropic-key
```

### 3. Configurar banco de dados Supabase

1. Acesse o **SQL Editor** do seu projeto Supabase
2. Execute o arquivo `supabase/migrations/001_initial.sql`
3. Após criar o primeiro usuário admin via Auth, execute:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@veccon.com.br';
```

### 4. Rodar em desenvolvimento

```bash
npm run dev
# Acesse: http://localhost:3000
```

---

## Script de deploy rápido (Windows)

Crie `start-dev.cmd` em `C:\Users\marck\dev\veccon-copiloto\`:

```cmd
@echo off
cd /d C:\Users\marck\dev\veccon-copiloto
npm run dev
pause
```

---

## Estrutura de arquivos

```
veccon-copiloto/
├── app/
│   ├── (auth)/login/          # Página de login
│   ├── (app)/
│   │   ├── chat/              # Chat principal
│   │   └── admin/             # Painel admin
│   ├── api/
│   │   ├── chat/              # API streaming do copiloto
│   │   └── admin/
│   │       ├── chat/          # API agente analítico
│   │       ├── users/         # CRUD de usuários
│   │       ├── conversations/ # Listagem de conversas
│   │       └── dashboard/     # Dados do dashboard
│   └── globals.css
├── components/
│   ├── chat/ChatInterface.tsx  # Interface completa do chat
│   └── admin/AdminPanel.tsx    # Painel admin completo
├── lib/
│   ├── supabase/               # Clients (browser, server, admin)
│   ├── anthropic.ts
│   └── system-prompt.ts        # System prompt do Copiloto
└── supabase/migrations/001_initial.sql
```

---

## Departamentos suportados

O sistema reconhece os seguintes departamentos para segmentação:

- Vendas
- Marketing
- Jurídico
- RH
- Admin/Financeiro
- SAC
- Liberação de Obras
- Diretoria
- Outro

---

## Segurança

- Row Level Security (RLS) ativo em todas as tabelas
- Usuários acessam **apenas** seus próprios dados
- Admins têm acesso total via `service_role` no backend
- Senhas gerenciadas pelo Supabase Auth (bcrypt)
- Variáveis sensíveis nunca expostas ao cliente
