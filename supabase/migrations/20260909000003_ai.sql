-- ============================================================================
-- VERBO — Assistente bíblico
--
-- A REGRA DE OURO, com dentes:
--
--   ai_message_references guarda verse_start_id e verse_end_id como CHAVES
--   ESTRANGEIRAS para bible_verses. Referência não é texto. Uma citação que o
--   modelo inventou não é rejeitada por um `if` — ela é impossível de gravar,
--   porque viola a chave estrangeira. O banco recusa.
-- ============================================================================

create table public.ai_conversations (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  constraint ai_conversations_title_length check (char_length(title) <= 200)
);

create index ai_conversations_user_idx
  on public.ai_conversations (user_id, created_at desc);

create table public.ai_messages (
  id               bigint generated always as identity primary key,
  conversation_id  bigint not null references public.ai_conversations (id) on delete cascade,
  role             text not null,
  content          text not null,
  tokens_in        integer,
  tokens_out       integer,
  /* Citações que o modelo produziu e o validador descartou. É a métrica de
     credibilidade do VERBO: precisa ser olhada toda semana do beta. */
  discarded_citations text[] not null default '{}',
  created_at       timestamptz not null default now(),
  constraint ai_messages_role check (role in ('user', 'assistant')),
  constraint ai_messages_content_not_blank check (btrim(content) <> '')
);

create index ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

-- ------------------------------------------------------- a âncora da resposta
create table public.ai_message_references (
  id              bigint generated always as identity primary key,
  message_id      bigint not null references public.ai_messages (id) on delete cascade,
  verse_start_id  bigint not null references public.bible_verses (id),
  verse_end_id    bigint not null references public.bible_verses (id),
  position        smallint not null default 0,
  constraint ai_message_references_unique unique (message_id, verse_start_id, verse_end_id)
);

create index ai_message_references_message_idx
  on public.ai_message_references (message_id, position);
create index ai_message_references_start_idx
  on public.ai_message_references (verse_start_id);
create index ai_message_references_end_idx
  on public.ai_message_references (verse_end_id);

-- --------------------------------------------------------------- uso e limite
create table public.ai_usage_daily (
  user_id         uuid not null references auth.users (id) on delete cascade,
  day             date not null default current_date,
  question_count  integer not null default 0,
  tokens_in       bigint not null default 0,
  tokens_out      bigint not null default 0,
  primary key (user_id, day),
  constraint ai_usage_counts_non_negative check (question_count >= 0)
);

-- ---------------------------------------------------------------------- cache
-- A entrada NÃO guarda referências próprias: guarda o source_message_id, e as
-- referências saem de ai_message_references daquela mensagem. Assim a resposta
-- servida do cache carrega exatamente as mesmas referências já validadas, e não
-- existe um segundo caminho pelo qual uma citação alcance o usuário sem passar
-- pela validação. Nada do conteúdo da pergunta original é exposto.
create table public.ai_answer_cache (
  question_hash        text primary key,
  question_normalized  text not null,
  answer               text not null,
  source_message_id    bigint not null references public.ai_messages (id) on delete cascade,
  hit_count            integer not null default 0,
  created_at           timestamptz not null default now()
);

create index ai_answer_cache_source_idx on public.ai_answer_cache (source_message_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_message_references enable row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.ai_answer_cache enable row level security;

create policy ai_conversations_select_own on public.ai_conversations
  for select to authenticated using (user_id = (select auth.uid()));
create policy ai_conversations_insert_own on public.ai_conversations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy ai_conversations_delete_own on public.ai_conversations
  for delete to authenticated using (user_id = (select auth.uid()));

/* Dono da mensagem = dono da conversa. Função em schema privado para que a
   policy faça uma consulta indexada em vez de checagem por linha, e para que
   nenhum papel do cliente possa chamá-la direto. */
create schema if not exists private;

create or replace function private.owns_conversation(conversation_id bigint)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.ai_conversations c
    where c.id = $1
      and c.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.owns_conversation(bigint)
  from public, anon, authenticated;

create or replace function private.owns_message(message_id bigint)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.ai_messages m
    join public.ai_conversations c on c.id = m.conversation_id
    where m.id = $1
      and c.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.owns_message(bigint)
  from public, anon, authenticated;

create policy ai_messages_select_own on public.ai_messages
  for select to authenticated
  using ((select private.owns_conversation(conversation_id)));

create policy ai_message_references_select_own on public.ai_message_references
  for select to authenticated
  using ((select private.owns_message(message_id)));

-- ai_usage_daily: o usuário pode VER seu consumo, nunca alterá-lo.
-- Quem incrementa é a Edge Function, como service_role.
create policy ai_usage_daily_select_own on public.ai_usage_daily
  for select to authenticated using (user_id = (select auth.uid()));

-- ai_answer_cache: maquinaria interna. Sem policy — só service_role alcança.
