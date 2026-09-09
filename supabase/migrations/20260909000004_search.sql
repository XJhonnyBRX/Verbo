-- ============================================================================
-- VERBO — Busca
--
-- Duas funções, com donos diferentes de propósito:
--
--   search_verses    — o cliente chama direto. Só full-text. Custo de IA: zero.
--   hybrid_search    — só a Edge Function chama. Full-text + semântica, fundidos
--                      por Reciprocal Rank Fusion.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Busca por palavra. security invoker: RLS da escritura se aplica normalmente.
--
-- `p_translation` é OBRIGATÓRIO, e isso é uma decisão medida, não descuido.
--
-- A primeira versão aceitava null e filtrava com
-- `where p_translation is null or t.slug = p_translation`. Aquele OR com
-- parâmetro impede o planner de resolver a tradução uma única vez: ele juntou
-- bible_translations LINHA POR LINHA, 8.895 vezes numa busca por termo comum.
-- Medido numa Bíblia de 31 mil versículos: 42,6 ms e 12.011 buffers. Com a
-- tradução resolvida uma vez por subconsulta escalar: 13,1 ms e 2.102
-- buffers — 3,3x mais rápido, 5,7x menos I/O.
--
-- Buscar em todas as traduções ao mesmo tempo também devolveria o mesmo
-- versículo repetido, então o parâmetro opcional nem era desejável.
--
-- Se a busca voltar a incomodar com texto real, o próximo passo já foi medido:
-- ranquear só os ids num CTE, limitar, e buscar o texto depois (11,2 ms). O
-- ganho sobre a versão atual foi de ~2 ms, então não vale a complexidade hoje.
-- ---------------------------------------------------------------------------
create or replace function public.search_verses(
  p_query        text,
  p_translation  text,
  p_limit        int default 25
)
returns table (
  verse_id   bigint,
  book_osis  text,
  book_name  text,
  chapter    smallint,
  verse      smallint,
  verse_text text,
  rank       real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    v.id,
    b.osis_code,
    b.name_pt,
    v.chapter,
    v.verse,
    v.text,
    ts_rank_cd(v.fts, q.tsq) as rank
  from websearch_to_tsquery('portuguese', p_query) as q(tsq)
  join public.bible_verses v
    on v.fts @@ q.tsq
   and v.translation_id = (
     select t.id from public.bible_translations t where t.slug = p_translation
   )
  join public.bible_books b on b.id = v.book_id
  order by rank desc, b.canonical_order, v.chapter, v.verse
  limit least(greatest(p_limit, 1), 100);
$$;

comment on function public.search_verses is
  'Busca por palavra. Postgres puro, sem IA, sem Edge Function. 13ms em 31 mil versículos.';

-- ---------------------------------------------------------------------------
-- Busca híbrida para o RAG.
--
-- A CHAVE DE FUSÃO É bible_verses.id. Os dois ramos ranqueiam coisas de
-- granularidade diferente, então cada um é reduzido a versículos antes de
-- fundir:
--
--   full-text  — já está em versículos.
--   semântico  — ranqueia chunks, depois expande cada chunk nos seus
--                versículos. Como os chunks têm sobreposição, um versículo
--                pode vir por mais de um chunk: vale o MELHOR rank, e ele
--                é contado uma única vez.
--
-- security definer porque verse_chunks não tem policy de leitura — vetor
-- exposto no cliente é superfície de ataque sem retorno.
-- ---------------------------------------------------------------------------
create or replace function public.hybrid_search(
  p_query             text,
  p_embedding         extensions.vector(384),
  p_translation_id    bigint,
  p_limit             int default 12,
  p_full_text_weight  float default 1.0,
  p_semantic_weight   float default 1.0,
  p_rrf_k             int default 50
)
returns table (
  verse_id   bigint,
  book_osis  text,
  book_name  text,
  chapter    smallint,
  verse      smallint,
  verse_text text,
  score      float
)
language sql
stable
security definer
set search_path = ''
as $$
  with capped as (
    select least(greatest(p_limit, 1), 30) as n
  ),
  full_text as (
    select
      v.id as verse_id,
      row_number() over (order by ts_rank_cd(v.fts, q.tsq) desc, v.id) as rank_ix
    from websearch_to_tsquery('portuguese', p_query) as q(tsq)
    join public.bible_verses v
      on v.fts @@ q.tsq
     and v.translation_id = p_translation_id
    order by rank_ix
    limit (select n * 2 from capped)
  ),
  top_chunks as (
    select
      c.book_id,
      c.chapter,
      c.verse_start,
      c.verse_end,
      row_number() over (order by c.embedding operator(extensions.<=>) p_embedding) as rank_ix
    from public.verse_chunks c
    where c.translation_id = p_translation_id
      and c.embedding is not null
    order by c.embedding operator(extensions.<=>) p_embedding
    limit (select n * 3 from capped)
  ),
  semantic as (
    -- Sobreposição de chunks: min() garante o melhor rank e uma linha por
    -- versículo.
    select v.id as verse_id, min(tc.rank_ix) as rank_ix
    from top_chunks tc
    join public.bible_verses v
      on v.translation_id = p_translation_id
     and v.book_id = tc.book_id
     and v.chapter = tc.chapter
     and v.verse between tc.verse_start and tc.verse_end
    group by v.id
  ),
  fused as (
    select
      coalesce(ft.verse_id, sm.verse_id) as verse_id,
      coalesce(1.0 / (p_rrf_k + ft.rank_ix), 0.0) * p_full_text_weight
        + coalesce(1.0 / (p_rrf_k + sm.rank_ix), 0.0) * p_semantic_weight as score
    from full_text ft
    full outer join semantic sm on sm.verse_id = ft.verse_id
  )
  select
    v.id,
    b.osis_code,
    b.name_pt,
    v.chapter,
    v.verse,
    v.text,
    f.score
  from fused f
  join public.bible_verses v on v.id = f.verse_id
  join public.bible_books b on b.id = v.book_id
  order by f.score desc, b.canonical_order, v.chapter, v.verse
  limit (select n from capped);
$$;

revoke execute on function
  public.hybrid_search(text, extensions.vector, bigint, int, float, float, int)
  from public, anon, authenticated;

comment on function public.hybrid_search is
  'Recuperação do RAG. Chave de fusão: bible_verses.id. Só service_role executa.';

-- ---------------------------------------------------------------------------
-- Resolve uma referência em versículos concretos. É o outro lado da regra de
-- ouro: dado "João 3:16", devolve a linha real ou nada.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_passage(
  p_translation   text,
  p_osis          text,
  p_chapter       int,
  p_verse_start   int default null,
  p_verse_end     int default null
)
returns table (
  verse_id        bigint,
  book_name       text,
  chapter         smallint,
  verse           smallint,
  verse_text      text,
  words_of_christ boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.id, b.name_pt, v.chapter, v.verse, v.text, v.words_of_christ
  from public.bible_verses v
  join public.bible_books b on b.id = v.book_id
  join public.bible_translations t on t.id = v.translation_id
  where t.slug = p_translation
    and b.osis_code = p_osis
    and v.chapter = p_chapter
    and (p_verse_start is null or v.verse >= p_verse_start)
    and (p_verse_end is null or v.verse <= p_verse_end)
    and (p_verse_start is null or p_verse_end is not null or v.verse = p_verse_start)
  order by v.verse;
$$;

comment on function public.resolve_passage is
  'Referência para versículo real. Devolve zero linhas quando a referência não existe.';
