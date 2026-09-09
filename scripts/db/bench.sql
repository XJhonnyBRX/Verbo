-- ============================================================================
-- Bench do schema em volume real.
--
-- Popula uma Bíblia inteira sintética — 66 livros, 1.189 capítulos, ~31 mil
-- versículos, ~13 mil chunks com embeddings de 384 dimensões — e mede as três
-- consultas quentes do VERBO com EXPLAIN ANALYZE.
--
-- O texto é sintético: serve para dimensionar índice e tempo de resposta, não
-- para avaliar relevância. Embeddings são aleatórios, então o recall
-- semântico não significa nada aqui; o TEMPO do HNSW, sim.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

insert into public.bible_translations (slug, name, abbrev, license)
values ('bench', 'Bench sintético', 'BCH', 'apenas medição');

-- ------------------------------------------------------------------- livros
-- Contagens reais do canon protestante.
create temp table bench_books(osis text, nome text, test text, ord int, caps int);
insert into bench_books values
('Gen','Gênesis','AT',1,50),('Exod','Êxodo','AT',2,40),('Lev','Levítico','AT',3,27),
('Num','Números','AT',4,36),('Deut','Deuteronômio','AT',5,34),('Josh','Josué','AT',6,24),
('Judg','Juízes','AT',7,21),('Ruth','Rute','AT',8,4),('1Sam','1 Samuel','AT',9,31),
('2Sam','2 Samuel','AT',10,24),('1Kgs','1 Reis','AT',11,22),('2Kgs','2 Reis','AT',12,25),
('1Chr','1 Crônicas','AT',13,29),('2Chr','2 Crônicas','AT',14,36),('Ezra','Esdras','AT',15,10),
('Neh','Neemias','AT',16,13),('Esth','Ester','AT',17,10),('Job','Jó','AT',18,42),
('Ps','Salmos','AT',19,150),('Prov','Provérbios','AT',20,31),('Eccl','Eclesiastes','AT',21,12),
('Song','Cantares','AT',22,8),('Isa','Isaías','AT',23,66),('Jer','Jeremias','AT',24,52),
('Lam','Lamentações','AT',25,5),('Ezek','Ezequiel','AT',26,48),('Dan','Daniel','AT',27,12),
('Hos','Oseias','AT',28,14),('Joel','Joel','AT',29,3),('Amos','Amós','AT',30,9),
('Obad','Obadias','AT',31,1),('Jonah','Jonas','AT',32,4),('Mic','Miqueias','AT',33,7),
('Nah','Naum','AT',34,3),('Hab','Habacuque','AT',35,3),('Zeph','Sofonias','AT',36,3),
('Hag','Ageu','AT',37,2),('Zech','Zacarias','AT',38,14),('Mal','Malaquias','AT',39,4),
('Matt','Mateus','NT',40,28),('Mark','Marcos','NT',41,16),('Luke','Lucas','NT',42,24),
('John','João','NT',43,21),('Acts','Atos','NT',44,28),('Rom','Romanos','NT',45,16),
('1Cor','1 Coríntios','NT',46,16),('2Cor','2 Coríntios','NT',47,13),('Gal','Gálatas','NT',48,6),
('Eph','Efésios','NT',49,6),('Phil','Filipenses','NT',50,4),('Col','Colossenses','NT',51,4),
('1Thess','1 Tessalonicenses','NT',52,5),('2Thess','2 Tessalonicenses','NT',53,3),
('1Tim','1 Timóteo','NT',54,6),('2Tim','2 Timóteo','NT',55,4),('Titus','Tito','NT',56,3),
('Phlm','Filemom','NT',57,1),('Heb','Hebreus','NT',58,13),('Jas','Tiago','NT',59,5),
('1Pet','1 Pedro','NT',60,5),('2Pet','2 Pedro','NT',61,3),('1John','1 João','NT',62,5),
('2John','2 João','NT',63,1),('3John','3 João','NT',64,1),('Jude','Judas','NT',65,1),
('Rev','Apocalipse','NT',66,22);

insert into public.bible_books
  (osis_code, name_pt, abbreviations, testament, canonical_order, chapter_count)
select osis, nome, array[lower(left(osis,2))], test, ord, caps from bench_books;

-- ------------------------------------------------------------------- frases
-- 400 frases pré-montadas de um léxico bíblico português, escolhidas por
-- módulo. Distribuição boa o suficiente para o tsvector, e barato.
create temp table bench_sentences(i int primary key, frase text);

insert into bench_sentences(i, frase)
select
  g,
  (select string_agg(w, ' ')
   from (
     select (array[
       'o Senhor','Deus','Jesus','Cristo','o Espírito','a graça','a misericórdia',
       'o perdão','a fé','a esperança','o amor','a justiça','a verdade','a luz',
       'o caminho','a vida','o pastor','o cordeiro','a aliança','a promessa',
       'o profeta','o apóstolo','a igreja','o reino','os céus','a terra',
       'o coração','a alma','a paz','a alegria','o temor','a sabedoria',
       'a oração','o louvor','o sacrifício','a bênção','a salvação','a redenção',
       'a ansiedade','o consolo','a paciência','a humildade','a obediência',
       'disse','respondeu','clamou','ensinou','curou','anunciou','escreveu',
       'porque','portanto','entretanto','assim','então','e','mas','para que',
       'não temas','bem-aventurado','eis que','em verdade','para sempre',
       'entre os homens','no princípio','naquele dia','sobre todas as coisas'
     ])[1 + ((g * 7 + s * 13) % 66)] as w
     from generate_series(1, 14 + (g % 12)) as s
   ) t)
from generate_series(1, 400) as g;

-- -------------------------------------------------------------- versículos
-- ~26 versículos por capítulo, variando de 12 a 40.
insert into public.bible_verses
  (translation_id, book_id, chapter, verse, text, words_of_christ)
select
  t.id,
  b.id,
  ch.n,
  vs.n,
  s.frase,
  (b.canonical_order between 40 and 43) and (vs.n % 5 = 0)
from public.bible_translations t
cross join public.bible_books b
cross join lateral generate_series(1, b.chapter_count) as ch(n)
cross join lateral generate_series(
  1,
  12 + ((b.canonical_order * 31 + ch.n * 17) % 29)
) as vs(n)
join bench_sentences s
  on s.i = 1 + ((b.canonical_order * 101 + ch.n * 37 + vs.n * 7) % 400)
where t.slug = 'bench';

-- ------------------------------------------------------------------ chunks
-- Janelas de 3 versículos com passo 2 — a sobreposição do spec.
insert into public.verse_chunks
  (translation_id, book_id, chapter, verse_start_id, verse_end_id,
   verse_start, verse_end, content, embedding)
select
  w.translation_id,
  w.book_id,
  w.chapter,
  w.start_id,
  w.end_id,
  w.start_v,
  w.end_v,
  w.conteudo,
  /* CUIDADO — armadilha que já custou uma medição inteira:
     `(select array_agg(random()::real) from generate_series(1,384))` NÃO
     referencia a linha externa, então o Postgres avalia UMA vez e reusa em
     todas as linhas. O resultado foram 15.774 chunks com o MESMO vetor, um
     índice HNSW degenerado, e um número de latência sem significado.
     A expressão abaixo deriva de w.start_id, é correlacionada de verdade,
     e portanto é reavaliada por linha. Também é determinística, o que torna
     o bench reproduzível. */
  (select array_agg(
            (((w.start_id * 1103515245 + g * 12345) % 2147483647)::double precision
             / 2147483647.0)::real)
   from generate_series(1, 384) as g)::extensions.vector
from (
  select
    v.translation_id,
    v.book_id,
    v.chapter,
    v.verse as start_v,
    least(v.verse + 2, max(v.verse) over (partition by v.book_id, v.chapter)) as end_v,
    v.id as start_id,
    coalesce(
      lead(v.id, 2) over (partition by v.book_id, v.chapter order by v.verse),
      last_value(v.id) over (
        partition by v.book_id, v.chapter order by v.verse
        rows between unbounded preceding and unbounded following
      )
    ) as end_id,
    v.text || ' ' ||
      coalesce(lead(v.text, 1) over (partition by v.book_id, v.chapter order by v.verse), '') || ' ' ||
      coalesce(lead(v.text, 2) over (partition by v.book_id, v.chapter order by v.verse), '')
      as conteudo,
    v.verse as vnum
  from public.bible_verses v
  join public.bible_translations t on t.id = v.translation_id
  where t.slug = 'bench'
) w
where (w.vnum - 1) % 2 = 0;

analyze public.bible_verses;
analyze public.verse_chunks;
analyze public.bible_books;

\echo ''
\echo '=================== VOLUME ==================='
select
  (select count(*) from public.bible_books) as livros,
  (select count(*) from public.bible_verses) as versiculos,
  (select count(*) from public.verse_chunks) as chunks,
  -- Guarda contra a armadilha do vetor único: se este número for 1, a
  -- medição semântica abaixo não significa nada.
  (select count(distinct embedding::text) from public.verse_chunks) as vetores_distintos;

do $$
declare d int;
begin
  select count(distinct embedding::text) into d from public.verse_chunks;
  if d < 1000 then
    raise exception
      'BENCH INVÁLIDO: só % vetor(es) distinto(s). O índice HNSW degenera e a latência medida não vale.', d;
  end if;
end
$$;

\echo ''
\echo '=================== TAMANHO ==================='
select
  relname as objeto,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total,
  pg_size_pretty(pg_indexes_size(c.oid)) as indices
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and relname in ('bible_verses','verse_chunks')
order by pg_total_relation_size(c.oid) desc;

\echo ''
\echo '=========== 1. LEITURA DE CAPITULO (a consulta mais quente) ==========='
explain (analyze, buffers, costs off, timing on)
select v.verse, v.text, v.words_of_christ
from public.bible_verses v
join public.bible_books b on b.id = v.book_id
join public.bible_translations t on t.id = v.translation_id
where t.slug = 'bench' and b.osis_code = 'Ps' and v.chapter = 119
order by v.verse;

\echo ''
\echo '=========== 2. BUSCA POR PALAVRA (search_verses) ==========='
explain (analyze, buffers, costs off, timing on)
select * from public.search_verses('perdão', 'bench', 25);

\echo ''
\echo '=========== 3. BUSCA HIBRIDA (hybrid_search) ==========='
explain (analyze, buffers, costs off, timing on)
select * from public.hybrid_search(
  'o que a Bíblia fala sobre ansiedade',
  (select array_agg(random()::real) from generate_series(1,384))::extensions.vector,
  (select id from public.bible_translations where slug = 'bench'),
  12
);

\echo ''
\echo '=========== 4. HNSW: construido por insert vs reconstruido ==========='
-- O indice foi criado vazio na migration e povoado insert por insert. A
-- pergunta pratica: isso produz o mesmo indice que um REINDEX depois da
-- carga? A resposta decide se embed-batch deve criar o indice ao final.
select pg_size_pretty(pg_relation_size('public.verse_chunks_embedding_idx'))
       as tamanho_incremental;

\echo ''
\echo '--- recall ANTES do reindex: top-10 indexado vs exato ---'
create temp table probe as
  select embedding as e from public.verse_chunks
  where id = (select min(id) + 5000 from public.verse_chunks);

set enable_seqscan = off;
create temp table idx_antes as
  select c.id from public.verse_chunks c, probe p
  order by c.embedding operator(extensions.<=>) p.e limit 10;

set enable_indexscan = off;
set enable_bitmapscan = off;
set enable_seqscan = on;
create temp table exato as
  select c.id from public.verse_chunks c, probe p
  order by c.embedding operator(extensions.<=>) p.e limit 10;

reset enable_indexscan;
reset enable_bitmapscan;
reset enable_seqscan;

select
  (select count(*) from idx_antes a join exato e on e.id = a.id) as acertos_de_10;

\echo ''
\echo '--- REINDEX e recall depois ---'
reindex index public.verse_chunks_embedding_idx;

select pg_size_pretty(pg_relation_size('public.verse_chunks_embedding_idx'))
       as tamanho_reconstruido;

set enable_seqscan = off;
create temp table idx_depois as
  select c.id from public.verse_chunks c, probe p
  order by c.embedding operator(extensions.<=>) p.e limit 10;
reset enable_seqscan;

select
  (select count(*) from idx_depois d join exato e on e.id = d.id) as acertos_de_10;

\echo ''
\echo '--- latencia da hybrid_search depois do reindex ---'
explain (analyze, buffers, costs off, timing on)
select * from public.hybrid_search(
  'o que a Bíblia fala sobre ansiedade',
  (select e from probe),
  (select id from public.bible_translations where slug = 'bench'),
  12
);
