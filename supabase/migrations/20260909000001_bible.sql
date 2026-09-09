-- ============================================================================
-- VERBO — Escritura
--
-- Tabelas imutáveis. Legíveis por todos, escritas por ninguém exceto o
-- importador rodando como service_role. Ver docs/superpowers/specs/
-- 2026-09-09-verbo-mvp-design.md, seção 5.
-- ============================================================================

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------- traduções
create table public.bible_translations (
  id             bigint generated always as identity primary key,
  slug           text not null unique,
  name           text not null,
  abbrev         text not null,
  language       text not null default 'pt-BR',
  license        text not null,
  license_url    text,
  source_url     text,
  source_sha256  text,
  verse_count    integer,
  imported_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint bible_translations_slug_format check (slug ~ '^[a-z0-9-]+$')
);

comment on column public.bible_translations.license is
  'Licença da tradução. Obrigatória: o VERBO não importa texto sem procedência.';
comment on column public.bible_translations.source_sha256 is
  'Checksum do arquivo-fonte. Prova de que o texto no banco é o que foi importado.';

-- -------------------------------------------------------------------- livros
-- Canônico, não por tradução: a numeração de livro/capítulo/versículo é a
-- mesma entre as traduções protestantes.
create table public.bible_books (
  id               bigint generated always as identity primary key,
  osis_code        text not null unique,
  name_pt          text not null,
  abbreviations    text[] not null default '{}',
  testament        text not null,
  canonical_order  smallint not null unique,
  chapter_count    smallint not null,
  constraint bible_books_testament check (testament in ('AT', 'NT')),
  constraint bible_books_order_range check (canonical_order between 1 and 66),
  constraint bible_books_chapter_count check (chapter_count between 1 and 150)
);

-- --------------------------------------------------------------- versículos
create table public.bible_verses (
  id              bigint generated always as identity primary key,
  translation_id  bigint not null references public.bible_translations (id),
  book_id         bigint not null references public.bible_books (id),
  chapter         smallint not null,
  verse           smallint not null,
  text            text not null,
  -- Fala de Cristo: composta em vermelho, como nas edições "letras vermelhas".
  words_of_christ boolean not null default false,
  fts             tsvector generated always as (to_tsvector('portuguese', text)) stored,
  constraint bible_verses_unique unique (translation_id, book_id, chapter, verse),
  constraint bible_verses_chapter_positive check (chapter >= 1),
  constraint bible_verses_verse_positive check (verse >= 1),
  constraint bible_verses_text_not_blank check (btrim(text) <> '')
);

/* Leitura de capítulo — o acesso mais frequente do app inteiro — é servida
   pelo índice da constraint `bible_verses_unique`, que já é
   (translation_id, book_id, chapter, verse). Medido: 0,145 ms para um
   capítulo de Salmos numa Bíblia de 31 mil versículos.

   Um índice explícito com essas mesmas quatro colunas foi criado aqui e
   depois removido: era duplicata exata da constraint, custava 1,2 MB e
   dobrava a escrita nos 31 mil inserts da importação, sem ganho nenhum de
   leitura. Não recrie. */

-- Busca por palavra. Sem IA, sem Edge Function.
create index bible_verses_fts_idx on public.bible_verses using gin (fts);

-- FK para bible_books, que a constraint unique não cobre (book_id não é a
-- primeira coluna dela).
create index bible_verses_book_id_idx on public.bible_verses (book_id);

-- -------------------------------------------------------------------- chunks
-- Janelas de 3 a 5 versículos, com sobreposição. Versículo isolado é
-- fragmento sem contexto, e o gte-small precisa de todo contexto possível.
create table public.verse_chunks (
  id              bigint generated always as identity primary key,
  translation_id  bigint not null references public.bible_translations (id),
  book_id         bigint not null references public.bible_books (id),
  chapter         smallint not null,
  verse_start_id  bigint not null references public.bible_verses (id),
  verse_end_id    bigint not null references public.bible_verses (id),
  /* Os números dos versículos, além dos IDs. Redundante de propósito: expandir
     um chunk de volta em versículos usando só os IDs exigiria assumir que os
     IDs são contíguos e crescentes, e essa suposição quebra em qualquer
     reimportação parcial. Com os números, a expansão é um range indexado. */
  verse_start     smallint not null,
  verse_end       smallint not null,
  content         text not null,
  embedding       extensions.vector(384),
  constraint verse_chunks_content_not_blank check (btrim(content) <> ''),
  constraint verse_chunks_range_valid check (verse_end >= verse_start),
  constraint verse_chunks_verse_positive check (verse_start >= 1)
);

create index verse_chunks_translation_idx on public.verse_chunks (translation_id);
create index verse_chunks_book_id_idx on public.verse_chunks (book_id);
create index verse_chunks_verse_start_idx on public.verse_chunks (verse_start_id);
create index verse_chunks_verse_end_idx on public.verse_chunks (verse_end_id);

-- HNSW: seguro de criar antes dos dados existirem, ao contrário do IVFFlat.
create index verse_chunks_embedding_idx
  on public.verse_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ============================================================================
-- Imutabilidade — camada 1: trigger
-- ============================================================================

create or replace function public.forbid_scripture_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'A Escritura é imutável. % em %.% foi bloqueado. Reimportar exige uma migration explícita que desabilite este trigger.',
    tg_op, tg_table_schema, tg_table_name;
end;
$$;

create trigger bible_verses_immutable
  before update or delete on public.bible_verses
  for each statement execute function public.forbid_scripture_mutation();

create trigger bible_books_immutable
  before update or delete on public.bible_books
  for each statement execute function public.forbid_scripture_mutation();

-- ============================================================================
-- Imutabilidade — camada 2: RLS
-- Todos leem. Ninguém escreve. Nem o usuário autenticado.
-- service_role ignora RLS por natureza, e é só ele que o importador usa.
-- ============================================================================

alter table public.bible_translations enable row level security;
alter table public.bible_books enable row level security;
alter table public.bible_verses enable row level security;
alter table public.verse_chunks enable row level security;

create policy bible_translations_read on public.bible_translations
  for select to anon, authenticated using (true);

create policy bible_books_read on public.bible_books
  for select to anon, authenticated using (true);

create policy bible_verses_read on public.bible_verses
  for select to anon, authenticated using (true);

-- Chunks e embeddings são maquinaria interna do RAG: nada no cliente precisa
-- deles, e vetor exposto é superfície de ataque sem retorno. Sem policy de
-- leitura — só a Edge Function, como service_role, alcança esta tabela.
