-- ============================================================================
-- Verificação do schema contra um Postgres de verdade.
--
-- Cada bloco levanta exceção se a garantia não valer. Se este arquivo roda
-- inteiro sem erro, as garantias do spec estão no banco — não só no texto.
-- ============================================================================

\set ON_ERROR_STOP on

-- --------------------------------------------------------------------- dados
insert into public.bible_translations (slug, name, abbrev, license)
values ('teste', 'Tradução de teste', 'TST', 'apenas verificação');

insert into public.bible_books
  (osis_code, name_pt, abbreviations, testament, canonical_order, chapter_count)
values
  ('Ps',   'Salmos',      array['sl'], 'AT', 19, 150),
  ('John', 'João',        array['jo'], 'NT', 43, 21),
  ('Phil', 'Filipenses',  array['fp'], 'NT', 50, 4);

insert into public.bible_verses
  (translation_id, book_id, chapter, verse, text, words_of_christ)
select t.id, b.id, 3, 16,
       'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito.',
       true
from public.bible_translations t, public.bible_books b
where t.slug = 'teste' and b.osis_code = 'John';

insert into public.bible_verses (translation_id, book_id, chapter, verse, text)
select t.id, b.id, 3, 17, 'Porque Deus enviou o seu Filho ao mundo.'
from public.bible_translations t, public.bible_books b
where t.slug = 'teste' and b.osis_code = 'John';

insert into public.bible_verses (translation_id, book_id, chapter, verse, text)
select t.id, b.id, 4, v.n, 'Não estejais inquietos por coisa alguma, versículo ' || v.n
from public.bible_translations t, public.bible_books b,
     generate_series(6, 7) as v(n)
where t.slug = 'teste' and b.osis_code = 'Phil';

-- ============================================================================
-- 1. tsvector gerado em português
-- ============================================================================
do $$
declare n int;
begin
  select count(*) into n
  from public.bible_verses
  where fts @@ websearch_to_tsquery('portuguese', 'amou');
  if n <> 1 then
    raise exception 'FALHA 1: full-text em português não achou "amou" (n=%)', n;
  end if;
  raise notice 'ok 1  — tsvector português gerado e indexado';
end
$$;

-- ============================================================================
-- 2. Escritura imutável: UPDATE e DELETE bloqueados
-- ============================================================================
do $$
declare blocked boolean := false;
begin
  begin
    update public.bible_verses set text = 'adulterado' where chapter = 3;
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'FALHA 2a: UPDATE em bible_verses NÃO foi bloqueado';
  end if;
  raise notice 'ok 2a — UPDATE em bible_verses bloqueado pelo trigger';
end
$$;

do $$
declare blocked boolean := false;
begin
  begin
    delete from public.bible_verses where chapter = 3;
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'FALHA 2b: DELETE em bible_verses NÃO foi bloqueado';
  end if;
  raise notice 'ok 2b — DELETE em bible_verses bloqueado pelo trigger';
end
$$;

do $$
declare blocked boolean := false;
begin
  begin
    update public.bible_books set name_pt = 'Outro' where osis_code = 'John';
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'FALHA 2c: UPDATE em bible_books NÃO foi bloqueado';
  end if;
  raise notice 'ok 2c — UPDATE em bible_books bloqueado pelo trigger';
end
$$;

-- ============================================================================
-- 3. Restrições de integridade da escritura
-- ============================================================================
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.bible_verses (translation_id, book_id, chapter, verse, text)
    select t.id, b.id, 5, 1, '   '
    from public.bible_translations t, public.bible_books b
    where t.slug = 'teste' and b.osis_code = 'John';
  exception when check_violation then
    blocked := true;
  end;
  if not blocked then
    raise exception 'FALHA 3: versículo em branco foi aceito';
  end if;
  raise notice 'ok 3  — versículo em branco recusado';
end
$$;

-- ============================================================================
-- 4. search_verses — busca por palavra, sem IA
-- ============================================================================
do $$
declare r record; n int := 0;
begin
  for r in select * from public.search_verses('mundo', 'teste', 10) loop
    n := n + 1;
    if r.book_name is null or r.verse_text is null then
      raise exception 'FALHA 4: search_verses devolveu coluna nula';
    end if;
  end loop;
  if n < 2 then
    raise exception 'FALHA 4: search_verses achou % linhas para "mundo", esperado >= 2', n;
  end if;
  raise notice 'ok 4  — search_verses devolveu % versículos para "mundo"', n;
end
$$;

-- ============================================================================
-- 5. resolve_passage — o outro lado da regra de ouro
-- ============================================================================
do $$
declare n int;
begin
  select count(*) into n from public.resolve_passage('teste', 'John', 3, 16, null);
  if n <> 1 then
    raise exception 'FALHA 5a: João 3:16 devolveu % linhas', n;
  end if;

  select count(*) into n from public.resolve_passage('teste', 'Phil', 4, 6, 7);
  if n <> 2 then
    raise exception 'FALHA 5b: Filipenses 4:6-7 devolveu % linhas, esperado 2', n;
  end if;

  -- Referência inventada: precisa devolver vazio, não erro.
  select count(*) into n from public.resolve_passage('teste', 'Ps', 151, 2, null);
  if n <> 0 then
    raise exception 'FALHA 5c: Salmos 151:2 devolveu % linhas, esperado 0', n;
  end if;

  select count(*) into n from public.resolve_passage('teste', 'John', 99, 1, null);
  if n <> 0 then
    raise exception 'FALHA 5d: João 99:1 devolveu % linhas, esperado 0', n;
  end if;

  raise notice 'ok 5  — resolve_passage acerta o que existe e devolve vazio para o inventado';
end
$$;

-- ============================================================================
-- 6. hybrid_search — chunks, expansão e RRF
-- ============================================================================
insert into public.verse_chunks
  (translation_id, book_id, chapter, verse_start_id, verse_end_id,
   verse_start, verse_end, content, embedding)
select
  t.id, b.id, 4,
  min(v.id), max(v.id),
  min(v.verse), max(v.verse),
  string_agg(v.text, ' ' order by v.verse),
  array_fill(0.05::real, array[384])::extensions.vector
from public.bible_translations t
join public.bible_books b on b.osis_code = 'Phil'
join public.bible_verses v
  on v.translation_id = t.id and v.book_id = b.id and v.chapter = 4
where t.slug = 'teste'
group by t.id, b.id;

do $$
declare tid bigint; n int := 0; r record;
begin
  select id into tid from public.bible_translations where slug = 'teste';

  for r in
    select * from public.hybrid_search(
      'inquietos',
      array_fill(0.05::real, array[384])::extensions.vector,
      tid,
      10
    )
  loop
    n := n + 1;
    if r.score is null or r.score <= 0 then
      raise exception 'FALHA 6: score inválido (%) para % %:%',
        r.score, r.book_name, r.chapter, r.verse;
    end if;
  end loop;

  if n < 2 then
    raise exception 'FALHA 6: hybrid_search devolveu % linhas, esperado >= 2', n;
  end if;
  raise notice 'ok 6  — hybrid_search fundiu os dois ramos e devolveu % versículos', n;
end
$$;

-- Um versículo não pode aparecer duas vezes por causa da sobreposição.
insert into public.verse_chunks
  (translation_id, book_id, chapter, verse_start_id, verse_end_id,
   verse_start, verse_end, content, embedding)
select
  t.id, b.id, 4, min(v.id), max(v.id), 7, 7,
  'chunk sobreposto', array_fill(0.06::real, array[384])::extensions.vector
from public.bible_translations t
join public.bible_books b on b.osis_code = 'Phil'
join public.bible_verses v
  on v.translation_id = t.id and v.book_id = b.id and v.chapter = 4 and v.verse = 7
where t.slug = 'teste'
group by t.id, b.id;

do $$
declare tid bigint; dup int;
begin
  select id into tid from public.bible_translations where slug = 'teste';
  select count(*) - count(distinct verse_id) into dup
  from public.hybrid_search(
    'inquietos',
    array_fill(0.05::real, array[384])::extensions.vector,
    tid,
    20
  );
  if dup <> 0 then
    raise exception 'FALHA 6b: hybrid_search repetiu % versículo(s) por sobreposição de chunk', dup;
  end if;
  raise notice 'ok 6b — sobreposição de chunks não duplica versículo';
end
$$;

-- ============================================================================
-- 7. A REGRA DE OURO — referência inventada é impossível de gravar
-- ============================================================================
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@teste'),
  ('22222222-2222-2222-2222-222222222222', 'bruno@teste');

insert into public.ai_conversations (id, user_id, title)
overriding system value
values (1, '11111111-1111-1111-1111-111111111111', 'Sobre ansiedade');

insert into public.ai_messages (id, conversation_id, role, content)
overriding system value
values (1, 1, 'assistant', 'Filipenses 4:6-7 e Salmos 151:2.');

do $$
declare vs bigint; ve bigint;
begin
  select min(v.id), max(v.id) into vs, ve
  from public.bible_verses v
  join public.bible_books b on b.id = v.book_id
  where b.osis_code = 'Phil' and v.chapter = 4;

  insert into public.ai_message_references (message_id, verse_start_id, verse_end_id)
  values (1, vs, ve);
  raise notice 'ok 7a — referência com lastro gravada';
end
$$;

do $$
declare blocked boolean := false;
begin
  begin
    -- Não existe versículo com este id. Se o banco aceitar, a regra de ouro
    -- é só um comentário.
    insert into public.ai_message_references (message_id, verse_start_id, verse_end_id)
    values (1, 999999999, 999999999);
  exception when foreign_key_violation then
    blocked := true;
  end;
  if not blocked then
    raise exception 'FALHA 7b: o banco ACEITOU uma referência inventada';
  end if;
  raise notice 'ok 7b — referência inventada recusada por chave estrangeira';
end
$$;

-- ============================================================================
-- 7c. O perfil nasce junto com o usuário
--     Se este trigger não disparar, todo cadastro fica sem perfil e nenhuma
--     tela percebe até alguém tentar salvar preferência.
-- ============================================================================
do $$
declare n int; nome text;
begin
  select count(*) into n from public.profiles
  where id = '11111111-1111-1111-1111-111111111111';
  if n <> 1 then
    raise exception 'FALHA 7c: perfil NÃO foi criado pelo trigger em auth.users (n=%)', n;
  end if;
  raise notice 'ok 7c — perfil criado automaticamente no cadastro';

  insert into auth.users (id, email, raw_user_meta_data)
  values ('33333333-3333-3333-3333-333333333333', 'clara@teste',
          '{"display_name": "Clara"}'::jsonb);

  select display_name into nome from public.profiles
  where id = '33333333-3333-3333-3333-333333333333';
  if nome is distinct from 'Clara' then
    raise exception 'FALHA 7d: display_name do metadata não chegou ao perfil (%)', nome;
  end if;
  raise notice 'ok 7d — display_name do cadastro copiado para o perfil';
end
$$;

-- ============================================================================
-- 7e. updated_at se move sozinho nas anotações
--
-- ATENÇÃO ao montar este teste: now() no Postgres é o horário de INÍCIO DA
-- TRANSAÇÃO, não o relógio. Um bloco DO é uma transação única, então inserir
-- e atualizar lá dentro produz timestamps idênticos e o teste acusa uma falha
-- que não existe — pg_sleep não ajuda. Por isso cada passo abaixo é uma
-- instrução solta: no psql, cada uma é a sua própria transação.
--
-- E now() é a escolha certa para updated_at: linhas atualizadas na mesma
-- transação devem compartilhar o horário.
-- ============================================================================
create temp table _t7e as
with inserida as (
  insert into public.notes
    (user_id, book_id, chapter, verse_start, verse_end, body)
  select '33333333-3333-3333-3333-333333333333', id, 3, 16, 16, 'primeira versão'
  from public.bible_books where osis_code = 'John'
  returning id, updated_at
)
select id, updated_at as antes from inserida;

update public.notes
   set body = 'segunda versão'
 where id = (select id from _t7e);

do $$
declare antes timestamptz; depois timestamptz;
begin
  select t.antes, n.updated_at into antes, depois
  from _t7e t join public.notes n on n.id = t.id;

  if depois <= antes then
    raise exception 'FALHA 7e: updated_at não avançou (% -> %)', antes, depois;
  end if;
  raise notice 'ok 7e — updated_at avança sozinho ao editar anotação';
end
$$;

-- ============================================================================
-- 8. RLS — um usuário não alcança o dado do outro
-- ============================================================================
insert into public.profiles (id, display_name)
values ('11111111-1111-1111-1111-111111111111', 'Ana')
on conflict (id) do nothing;
insert into public.profiles (id, display_name)
values ('22222222-2222-2222-2222-222222222222', 'Bruno')
on conflict (id) do nothing;

insert into public.notes (user_id, book_id, chapter, verse_start, verse_end, body)
select '11111111-1111-1111-1111-111111111111', id, 3, 16, 16, 'Anotação da Ana'
from public.bible_books where osis_code = 'John';

grant select, insert, update, delete on all tables in schema public to authenticated;

do $$
declare n int;
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
  select count(*) into n from public.notes;
  if n <> 1 then
    raise exception 'FALHA 8a: Ana vê % anotações, esperado 1', n;
  end if;

  set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
  select count(*) into n from public.notes;
  if n <> 0 then
    raise exception 'FALHA 8b: Bruno vê % anotações da Ana, esperado 0', n;
  end if;
  raise notice 'ok 8  — RLS isola anotação entre usuários';
end
$$;

-- Escritura: legível por authenticated, e inescrevível por ele.
do $$
declare n int; blocked boolean := false;
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';

  select count(*) into n from public.bible_verses;
  if n < 1 then
    raise exception 'FALHA 8c: authenticated não consegue LER a Escritura (n=%)', n;
  end if;

  begin
    insert into public.bible_verses (translation_id, book_id, chapter, verse, text)
    select t.id, b.id, 9, 9, 'versículo apócrifo'
    from public.bible_translations t, public.bible_books b
    where t.slug = 'teste' and b.osis_code = 'John';
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'FALHA 8d: authenticated ESCREVEU na Escritura';
  end if;
  raise notice 'ok 8b — authenticated lê a Escritura e não consegue escrever nela';
end
$$;

-- Chunks e embeddings não são alcançáveis pelo cliente.
do $$
declare n int; denied boolean := false;
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
  begin
    select count(*) into n from public.verse_chunks;
    if n <> 0 then
      raise exception 'FALHA 8e: authenticated leu % chunk(s) com embedding', n;
    end if;
    denied := true;
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then
    raise exception 'FALHA 8e: verse_chunks alcançável pelo cliente';
  end if;
  raise notice 'ok 8c — verse_chunks invisível para o cliente';
end
$$;

\echo ''
\echo '================================================='
\echo ' Todas as garantias do schema foram verificadas.'
\echo '================================================='
