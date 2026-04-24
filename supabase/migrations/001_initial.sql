-- ============================================================
-- Copiloto IA Veccon — Schema inicial
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. PROFILES (estende auth.users)
create table if not exists public.profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  email       text        not null,
  name        text,
  role        text        not null default 'user' check (role in ('user', 'admin')),
  department  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. CONVERSATIONS
create table if not exists public.conversations (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  title       text        not null default 'Nova conversa',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3. MESSAGES
create table if not exists public.messages (
  id                  uuid        primary key default gen_random_uuid(),
  conversation_id     uuid        not null references public.conversations(id) on delete cascade,
  role                text        not null check (role in ('user', 'assistant')),
  content             text        not null,
  created_at          timestamptz not null default now()
);

-- 4. ACCESS LOGS
create table if not exists public.access_logs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references public.profiles(id) on delete set null,
  action      text        not null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_conversations_user_id    on public.conversations(user_id);
create index if not exists idx_conversations_updated_at on public.conversations(updated_at desc);
create index if not exists idx_messages_conversation_id on public.messages(conversation_id);
create index if not exists idx_access_logs_user_id      on public.access_logs(user_id);
create index if not exists idx_access_logs_created_at   on public.access_logs(created_at desc);

-- ============================================================
-- TRIGGERS — updated_at automático
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ============================================================
-- TRIGGER — cria profile ao criar usuário no auth
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'user')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.access_logs    enable row level security;

-- PROFILES policies
create policy "Usuários veem seu próprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Usuários atualizam seu próprio perfil"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admins veem todos os perfis"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- CONVERSATIONS policies
create policy "Usuários veem suas conversas"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "Usuários criam suas conversas"
  on public.conversations for insert
  with check (auth.uid() = user_id);

create policy "Usuários atualizam suas conversas"
  on public.conversations for update
  using (auth.uid() = user_id);

create policy "Usuários excluem suas conversas"
  on public.conversations for delete
  using (auth.uid() = user_id);

-- MESSAGES policies
create policy "Usuários veem mensagens de suas conversas"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy "Usuários inserem mensagens em suas conversas"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- ACCESS LOGS policies
create policy "Usuários inserem seus próprios logs"
  on public.access_logs for insert
  with check (auth.uid() = user_id);

create policy "Admins veem todos os logs"
  on public.access_logs for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ============================================================
-- CRIAR PRIMEIRO USUÁRIO ADMIN (opcional — ajuste o e-mail)
-- Execute manualmente após criar o usuário pelo Auth:
--
--   update public.profiles
--   set role = 'admin'
--   where email = 'admin@veccon.com.br';
--
-- ============================================================
