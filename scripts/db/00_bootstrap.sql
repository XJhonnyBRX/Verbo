-- ============================================================================
-- Arnês de verificação — imita o que a Supabase fornece
--
-- Serve só para rodar as migrations contra um Postgres puro com pgvector e
-- descobrir se o SQL está correto. NÃO faz parte do schema do produto e nunca
-- é aplicado num projeto Supabase, que já tem tudo isto.
-- ============================================================================

create schema if not exists extensions;

-- Papéis da Supabase.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------- auth
create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

/* Na Supabase, auth.uid() lê o `sub` do JWT. Aqui lê o mesmo GUC que o
   PostgREST usa, para que as políticas de RLS possam ser exercitadas de
   verdade: set request.jwt.claim.sub = '<uuid>'. */
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
