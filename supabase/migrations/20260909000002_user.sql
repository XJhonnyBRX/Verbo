-- ============================================================================
-- VERBO — Conta, favoritos, anotações, histórico
--
-- Favoritos e anotações apontam para a POSIÇÃO CANÔNICA (livro + capítulo +
-- versículo), não para uma linha de bible_verses. Motivo: bible_verses é por
-- tradução; se o favorito apontasse para verse_id, trocar de tradução
-- apagaria os favoritos do usuário. Posição canônica sobrevive à troca.
-- ============================================================================

create table public.profiles (
  id                        uuid primary key references auth.users (id) on delete cascade,
  display_name              text,
  preferred_translation_id  bigint references public.bible_translations (id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) <= 60)
);

create index profiles_preferred_translation_idx
  on public.profiles (preferred_translation_id);

-- Perfil nasce junto com o usuário: nenhuma tela precisa lidar com a ausência.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- favoritos
create table public.favorites (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  book_id     bigint not null references public.bible_books (id),
  chapter     smallint not null,
  verse       smallint not null,
  created_at  timestamptz not null default now(),
  constraint favorites_unique unique (user_id, book_id, chapter, verse),
  constraint favorites_chapter_positive check (chapter >= 1),
  constraint favorites_verse_positive check (verse >= 1)
);

create index favorites_user_idx on public.favorites (user_id, created_at desc);
create index favorites_book_id_idx on public.favorites (book_id);

-- ---------------------------------------------------------------- anotações
create table public.notes (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  book_id      bigint not null references public.bible_books (id),
  chapter      smallint not null,
  verse_start  smallint not null,
  verse_end    smallint not null,
  body         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint notes_body_not_blank check (btrim(body) <> ''),
  constraint notes_body_length check (char_length(body) <= 10000),
  constraint notes_range_valid check (verse_end >= verse_start),
  constraint notes_chapter_positive check (chapter >= 1),
  constraint notes_verse_positive check (verse_start >= 1)
);

create index notes_user_idx on public.notes (user_id, updated_at desc);
create index notes_passage_idx on public.notes (user_id, book_id, chapter);
create index notes_book_id_idx on public.notes (book_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notes_touch_updated_at
  before update on public.notes
  for each row execute function public.touch_updated_at();

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------- histórico de leitura
create table public.reading_history (
  user_id         uuid not null references auth.users (id) on delete cascade,
  translation_id  bigint not null references public.bible_translations (id),
  book_id         bigint not null references public.bible_books (id),
  chapter         smallint not null,
  last_read_at    timestamptz not null default now(),
  primary key (user_id, translation_id, book_id, chapter)
);

create index reading_history_recent_idx
  on public.reading_history (user_id, last_read_at desc);
create index reading_history_translation_idx on public.reading_history (translation_id);
create index reading_history_book_idx on public.reading_history (book_id);

-- ============================================================================
-- RLS
--
-- auth.uid() vem embrulhado em (select ...) de propósito: assim o Postgres
-- avalia uma vez e reusa, em vez de chamar por linha.
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.notes enable row level security;
alter table public.reading_history enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy favorites_select_own on public.favorites
  for select to authenticated using (user_id = (select auth.uid()));
create policy favorites_insert_own on public.favorites
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy favorites_delete_own on public.favorites
  for delete to authenticated using (user_id = (select auth.uid()));

create policy notes_select_own on public.notes
  for select to authenticated using (user_id = (select auth.uid()));
create policy notes_insert_own on public.notes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy notes_update_own on public.notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notes_delete_own on public.notes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy reading_history_select_own on public.reading_history
  for select to authenticated using (user_id = (select auth.uid()));
create policy reading_history_upsert_own on public.reading_history
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy reading_history_update_own on public.reading_history
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
