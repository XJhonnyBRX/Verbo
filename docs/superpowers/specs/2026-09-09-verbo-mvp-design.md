# VERBO — Design do MVP

**Data:** 2026-09-09
**Status:** aprovado, pronto para o plano de implementação
**Lema:** Bíblia. Fé. Conhecimento.

---

## 1. Objetivo

Colocar o VERBO nas mãos de 50 a 100 pessoas e descobrir se elas usam o
assistente bíblico. Não é escalar. Não é monetizar. É aprender se o produto
tem valor.

O MVP entrega quatro coisas:

1. Ler a Bíblia.
2. Buscar na Bíblia — por palavra e por referência.
3. Perguntar sobre a Bíblia e receber resposta com referências verificadas.
4. Ter conta, favoritos e anotações.

**Fora do escopo:** música, teologia avançada, geração de sermão,
devocionais, app nativo, pagamento.

---

## 2. Decisões tomadas

Registradas com a razão, para que ninguém precise reabrir a discussão depois.

| Decisão | Escolha | Razão |
|---|---|---|
| Hospedagem | Supabase + Vercel | Sem DevOps no MVP. Auth, Postgres, pgvector e Edge Functions prontos. VPS fica para quando o custo justificar. |
| Tradução | Domínio público, em português | Zero risco jurídico e zero custo. Traduções licenciadas entram depois, se houver demanda. |
| Embeddings | `gte-small`, 384 dimensões, nas Edge Functions | Custo zero, sem chave de API, sem dependência externa. Decisão do dono do produto, com a ressalva da seção 10 registrada. |
| Geração | Google Gemini Flash | Camada gratuita generosa para o beta fechado. Português forte. |
| Orquestração da IA | Uma única Edge Function `ask` | Porta única: nenhuma resposta chega ao usuário sem passar pela validação de referências. |
| Estrutura do código | App único, sem monorepo | Existe um deployável. Turborepo compra cerimônia agora e entra sem dor depois. |
| Cache e rate limit | Postgres | Redis entra quando o Postgres reclamar. Com 100 usuários, ele não vai. |

**Infra existente no início:** nenhum projeto Supabase criado. Vercel no
plano Hobby, team `joaosantoscodes-projects`. Hobby serve ao beta fechado;
uso comercial exige Pro — decisão futura, não bloqueia o MVP.

---

## 3. Arquitetura

```
Cliente (Next.js PWA / futuro app Android)
        |
        +---- leitura, busca, favoritos, anotações
        |     supabase-js + RLS -> Postgres direto
        |     custo de IA: zero
        |
        +---- perguntas ao assistente
              POST direto na Edge Function, com o JWT do usuário
                      |
                      v
          Edge Function `ask`  <-- única porta da IA
              1. checa limite diário e cache
              2. vetoriza a pergunta (gte-small, local)
              3. hybrid_search no Postgres (RRF)
              4. monta o contexto
              5. Gemini Flash
              6. VALIDA cada referência citada
              7. stream de volta
```

Dois princípios governam esse desenho.

**IA não entra onde não precisa entrar.** Ler um capítulo, resolver
"Jo 3:16", buscar a palavra "perdão", favoritar e anotar são operações de
banco. Só a pergunta em linguagem natural custa dinheiro.

**Nenhuma lógica essencial vive no servidor do Next.** No Android não existe
servidor Next.js: uma Route Handler essencial simplesmente não existiria
dentro do app empacotado. Por isso o cliente fala direto com o Supabase e
direto com a Edge Function, e o Next é casca mais PWA. Isso mantém três
portas abertas sem retrabalho — PWA hoje, TWA na Play Store depois, e
Capacitor (`output: 'export'`) se um dia Bíblia offline e notificação nativa
justificarem virar nativo. Ver seção 10.

### Estrutura de pastas

```
verbo/
├── app/                    # Next.js App Router
│   ├── page.tsx            # índice do canon + abertura
│   ├── biblia/[osis]/[chapter]/
│   ├── buscar/
│   ├── perguntar/
│   └── conta/
├── components/             # bottom-nav, anchor
├── lib/
│   ├── bible/              # canon.ts, reference.ts, chunker.ts <- funções puras
│   ├── supabase/           # clients
│   └── types/              # gerados por `supabase gen types`
├── supabase/
│   ├── migrations/         # SQL versionado
│   ├── functions/
│   │   ├── ask/            # pipeline RAG completo
│   │   └── embed-batch/    # geração em lote dos vetores
│   └── tests/              # pgTAP
├── scripts/
│   ├── import-bible.ts
│   ├── verify-ui.mjs       # regra de ouro + contraste + overflow no navegador
│   └── screenshot.mjs
└── public/                 # manifest PWA, ícones
```

Sem `app/api/`: qualquer coisa que morasse ali deixaria de existir no app
Android.

`lib/bible/` é o coração testável: sem banco, sem rede, sem IA. O parser de
referência e o chunker são onde os bugs de verdade vão morar, e a regra de
ouro depende do parser.

---

## 4. Modelo de dados

### Escritura — imutável, pública para leitura

```
bible_translations
  id, slug, name, abbrev, language,
  license, license_url, source_url, source_sha256,
  verse_count, imported_at

bible_books                          -- canônico, não por tradução
  id, osis_code, name_pt, abbreviations text[],
  testament ('AT'|'NT'), canonical_order, chapter_count

bible_verses
  id, translation_id, book_id, chapter, verse, text,
  fts tsvector GENERATED ALWAYS AS to_tsvector('portuguese', text) STORED
  UNIQUE (translation_id, book_id, chapter, verse)
  INDEX GIN (fts)

verse_chunks
  id, translation_id, book_id, chapter,
  verse_start_id -> bible_verses(id),
  verse_end_id   -> bible_verses(id),
  content text,
  embedding vector(384)
  INDEX HNSW (embedding vector_cosine_ops)
```

**Duas estruturas de busca, com propósitos diferentes.** É isso que faz o
controle de custo funcionar:

- `bible_verses.fts` serve a busca por palavra. Postgres puro, dicionário
  `portuguese`, índice GIN. Sem IA, sem Edge Function, milissegundos.
- `verse_chunks` serve apenas ao RAG. Um chunk é uma **janela de versículos**
  — 3 a 5, com sobreposição — e não um versículo isolado, porque "Não andeis
  ansiosos por coisa alguma" sozinho é um fragmento sem contexto. O
  `gte-small`, fraco em português, precisa de todo o contexto que puder
  receber. Ordem de grandeza: ~31.000 versículos viram ~13.000 chunks.

`bible_chapters` do documento original foi cortada. `chapter_count` em
`bible_books` cobre a navegação; capítulo não tem metadado próprio no MVP.
Entra depois se houver títulos de perícope.

### Usuário — tudo sob RLS, `user_id = auth.uid()`

```
profiles              id -> auth.users, display_name,
                      preferred_translation_id
favorites             user_id, book_id -> bible_books(id), chapter, verse
                      UNIQUE (user_id, book_id, chapter, verse)
notes                 user_id, book_id -> bible_books(id), chapter,
                      verse_start, verse_end, body,
                      created_at, updated_at
reading_history       user_id, translation_id, book_id, chapter,
                      last_read_at    (upsert)

ai_conversations      id, user_id, title, created_at
ai_messages           id, conversation_id, role, content, created_at
ai_message_references id, message_id,
                      verse_start_id -> bible_verses(id),
                      verse_end_id   -> bible_verses(id)

ai_usage_daily        user_id, day, question_count,
                      tokens_in, tokens_out
                      UNIQUE (user_id, day)
ai_answer_cache       question_hash, question_normalized,
                      answer, source_message_id -> ai_messages(id),
                      hit_count, created_at
```

**Duas formas de apontar para a Escritura, deliberadamente diferentes:**

- **Favoritos e anotações** apontam para a *posição canônica*
  (`book_id` + capítulo + versículo), não para uma linha de `bible_verses`.
  Motivo: `bible_verses` é por tradução. Se o usuário favoritasse
  `verse_id` e depois trocasse de tradução, perderia os favoritos. Posição
  canônica sobrevive à troca, porque a numeração de capítulo e versículo é a
  mesma entre as traduções protestantes.
- **Referências da IA** apontam para `bible_verses(id)` por chave
  estrangeira, porque ali o ponto é justamente amarrar a citação ao texto
  exato que foi entregue no contexto, na tradução em que foi entregue. Ver
  seção 7.

O que nunca acontece, nos dois casos: guardar referência como texto solto
(`"João 3:16"`).

---

## 5. Ingestão da Bíblia

O arquivo original nunca é alterado. Isso é garantido em três camadas, não
por convenção:

1. **Trigger** em `bible_verses` e `bible_books` que rejeita `UPDATE` e
   `DELETE`. Reimportar exige uma migration explícita que desabilita o
   trigger, e isso fica no histórico do git.
2. **RLS**: `select` liberado a todos, escrita para ninguém — nem para o
   usuário autenticado. Só a `service_role`, usada exclusivamente pelo
   importador.
3. **Checksum**: o `sha256` do arquivo-fonte fica gravado em
   `bible_translations`, junto da licença e da URL de origem.

### Fluxo

```
Arquivo oficial -> validação -> normalização -> importador
   -> PostgreSQL -> validação final -> índices -> chunks -> embeddings
```

### Validação final — testes que rodam e falham

- 66 livros, na ordem canônica correta.
- Contagem de capítulos por livro conferida contra um fixture do canon.
- Contagem de versículos por capítulo conferida contra o mesmo fixture.
- Nenhum `text` vazio ou só espaço.
- Nenhuma lacuna na numeração de capítulos ou versículos.
- `verse_count` em `bible_translations` bate com o `count(*)` real.

### Pendência aberta — primeira tarefa do Ciclo 1

**A tradução exata ainda não está decidida.** Candidatos conhecidos como
domínio público em português: Almeida Revista e Corrigida 1911, Tradução
Brasileira de 1917, e o projeto "A Bíblia Livre". Antes de escrever o
importador é preciso verificar, para cada candidato: a situação real da
licença, o formato disponível (JSON, XML, OSIS, SQL), a completude do texto
e a qualidade da digitalização. O resultado dessa verificação, com as
fontes, deve ser registrado neste documento antes que o importador seja
escrito.

---

## 6. Busca

Duas funcionalidades distintas, com implementações distintas.

### Busca por referência

`lib/bible/reference.ts` — função pura, sem banco. Recebe uma string e
devolve uma referência estruturada ou `null`. Precisa reconhecer:

```
"João 3:16"      "Jo 3:16"       "jo 3.16"      "JOÃO 3 16"
"1 Coríntios 13" "1Co 13:4-7"    "1co13.4-7"
"Salmos 23"      "Sl 23"         "Ap 21:1-4"
```

Nomes e abreviações vêm de `bible_books.abbreviations`. Acentos e caixa são
normalizados. Esta função é a peça mais crítica do sistema, porque a
validação de referências da IA depende dela — um falso negativo aqui
descarta uma citação legítima; um falso positivo deixa passar uma inventada.

### Busca por palavra e por tema

Uma única função SQL, `hybrid_search`, fundindo full-text e semântica por
**Reciprocal Rank Fusion**:

```sql
create or replace function hybrid_search(
  query_text        text,
  query_embedding   extensions.vector(384),
  match_count       int,
  full_text_weight  float default 1,
  semantic_weight   float default 1,
  rrf_k             int   default 50
) returns setof ...
```

**A chave de fusão é `bible_verses.id`.** Os dois ramos ranqueiam coisas de
granularidade diferente, então cada um é reduzido a versículos antes da
fusão:

- Ramo full-text: ranqueia `bible_verses` por `ts_rank_cd` sobre
  `websearch_to_tsquery('portuguese', query_text)`. Já está em versículos.
- Ramo semântico: ranqueia `verse_chunks` por distância de cosseno, depois
  expande cada chunk nos versículos entre `verse_start_id` e `verse_end_id`.
  Todos os versículos de um chunk herdam o rank daquele chunk. Como os
  chunks têm sobreposição, um mesmo versículo pode aparecer por mais de um
  chunk — nesse caso vale o **melhor** rank (`min`), e o versículo é
  contado uma única vez.

Só então os dois rankings, ambos em versículos, são fundidos por
`1/(k + rank)` e somados com seus pesos.

A busca por palavra na interface usa só o ramo full-text — não chama Edge
Function, não gera vetor, não custa nada. O ramo semântico só é acionado
pelo assistente.

---

## 7. O assistente e a regra de ouro

> **A IA nunca é a fonte da Escritura.**

Esta é uma regra arquitetural, e regra arquitetural precisa de um lugar onde
seja impossível burlar. Esse lugar é a Edge Function `ask` — a única porta
por onde uma resposta gerada alcança o usuário.

### Pipeline

```
pergunta
  -> checa ai_usage_daily (limite diário)         [antes de qualquer custo]
  -> checa ai_answer_cache (hash da pergunta normalizada)
  -> vetoriza com gte-small (local, custo zero)
  -> hybrid_search -> versículos relevantes
  -> monta o contexto
  -> Gemini Flash
  -> VALIDA as referências
  -> grava e faz streaming
```

### Validação das referências

`ai_message_references` guarda `verse_start_id` e `verse_end_id` como
**chaves estrangeiras para `bible_verses`**. Referência não é texto. Uma
citação que o modelo inventou não é rejeitada por um `if` — ela é impossível
de gravar, porque viola a chave estrangeira. O banco recusa.

Na saída da função:

1. Extrai toda citação do texto gerado, com o parser de `lib/bible/`.
2. Resolve cada uma contra o banco.
3. **Descarta** a que não resolve, e também a que resolve mas **não estava no
   contexto entregue** — inventar e acertar por sorte também é falha.
4. Grava as sobreviventes como chave estrangeira.
5. Se não sobrar nenhuma, o VERBO responde que não encontrou base para a
   pergunta, em vez de responder sem lastro.

Todo descarte vira log. **A taxa de citação inventada é a métrica de
credibilidade do VERBO** e deve ser olhada toda semana do beta.

### O extrator devolve DUAS listas, e isso não é detalhe

`extractCitations(texto)` devolve `{ references, rejected }`. A primeira
versão devolvia só as referências válidas e engolia em silêncio o que não
resolvia — e com isso apagava exatamente o número que precisa ser vigiado.
A tela mostrava duas âncoras corretas e nenhum sinal de que uma terceira
citação havia sido inventada. Pior: o teste unitário passava, porque
codificava essa expectativa errada. Só a verificação no navegador pegou.

A distinção que `rejected` faz importa:

- **"Salmos 151:2"** — livro real, lugar inexistente. É citação inventada:
  entra em `rejected` e conta na métrica.
- **"Concílio 3:16"** — não é livro nenhum. É prosa que se parece com
  referência: é ignorada, e contá-la inflaria a métrica com ruído.

Regra derivada: nenhuma camada do VERBO pode descartar uma citação sem
informar que descartou.

### Prompt

O modelo recebe apenas os versículos recuperados e a instrução de citar
somente a partir deles. O prompt é a primeira defesa; a validação é a que
vale. Nunca confiar só no prompt.

---

## 8. Controle de custo

| Operação | Caminho | Custo de IA |
|---|---|---|
| Ler capítulo | Postgres direto | zero |
| "O que diz João 3:16?" | parser + Postgres | zero |
| Busca por palavra | `bible_verses.fts` (GIN) | zero |
| Favoritar, anotar | Postgres + RLS | zero |
| Embeddings dos chunks | `embed-batch`, uma vez | zero (gte-small local) |
| Vetorizar a pergunta | gte-small na Edge Function | zero |
| Gerar a resposta | Gemini Flash | o único custo real |

Mais três travas:

- **`ai_answer_cache`**: a pergunta é normalizada (minúscula, sem acento, sem
  pontuação) e hasheada. No beta, cinquenta pessoas farão as mesmas dez
  perguntas — "o que a Bíblia fala sobre ansiedade" é paga uma vez só.
  A entrada de cache **não guarda referências próprias**: guarda o
  `source_message_id` da mensagem original, e as referências vêm de
  `ai_message_references` daquela mensagem. Assim a resposta servida do
  cache carrega exatamente as mesmas referências já validadas, e não existe
  um segundo caminho pelo qual uma citação alcance o usuário sem passar
  pela validação da seção 7. Uma entrada só é gravada depois que a validação
  passou e sobrou pelo menos uma referência.
- **`ai_usage_daily`**: limite de perguntas por usuário por dia, checado
  **dentro** da Edge Function, antes de qualquer chamada paga.
- **Contagem de tokens** gravada por resposta, para saber o custo real por
  usuário antes de pensar em preço.

---

## 9. Testes

- **Vitest** em `lib/bible/`: parser de referência (todas as formas da seção
  6), chunker, canon. TDD estrito — o parser é a peça de que a regra de ouro
  depende.
- **`npm run verify:schema`** sobe um Postgres 17 com pgvector no Docker, zera
  o banco, aplica bootstrap e migrations na ordem e afirma 17 garantias:
  tsvector em português, os três bloqueios de imutabilidade da Escritura,
  `search_verses`, `resolve_passage` devolvendo vazio para referência
  inventada, `hybrid_search` fundindo os ramos sem duplicar versículo por
  sobreposição de chunk, **a referência inventada recusada por chave
  estrangeira**, o perfil nascendo com o usuário, `updated_at` avançando
  sozinho, RLS isolando anotações, `authenticated` lendo mas não escrevendo
  na Escritura, e `verse_chunks` invisível ao cliente.

  Uma armadilha registrada para quem for estender esse arquivo: `now()` é o
  horário de **início da transação**, e um bloco `DO` é uma transação única.
  Testar um trigger de `updated_at` dentro de um `DO` acusa falha inexistente
  — `pg_sleep` não ajuda. Cada passo precisa ser uma instrução solta.

  `scripts/db/00_bootstrap.sql` imita o que a Supabase fornece (`auth.users`,
  `auth.uid()`, schema `extensions`, papéis) e nunca é aplicado num projeto
  Supabase de verdade.
- **Teste de integração da regra de ouro**: uma resposta contendo uma citação
  falsa ("Jo 5:99") e uma citação real que não estava no contexto passa pelo
  validador, e ambas devem ser descartadas.
- **Validação da importação** (seção 5) roda como teste, não como script
  manual.
- **`scripts/verify-ui.mjs`** roda o navegador de verdade e falha o build se
  qualquer uma destas três regredir:
  1. a regra de ouro na tela — citação inventada não vira âncora, e o
     descarte é informado;
  2. contraste do texto pequeno acima de 4,5:1, calculado por WCAG 2.1 nos
     dois temas;
  3. ausência de overflow horizontal em 390px.

  A segunda existe porque `--gutter` era usado tanto para filetes de 0,5px
  quanto para números de versículo de 11px, e essas duas coisas têm
  exigências opostas: como cor de texto o cinza dava 2,3:1. Hoje `--gutter`
  desenha linhas e `--label` escreve, e o verificador impede a regressão.

---

## 10. Riscos registrados

**`gte-small` é treinado em inglês.** A busca semântica por tema — que é o
diferencial do produto — é justamente onde ele será mais fraco, e a Bíblia do
VERBO é em português. A alternativa, `text-embedding-3-small` da OpenAI,
custaria cerca de US$ 0,02 uma única vez pela Bíblia inteira.

A decisão de manter o `gte-small` foi tomada conscientemente pelo dono do
produto, com esta ressalva na mesa. Mitigações no desenho:

- A camada de embeddings fica atrás de uma interface, com o modelo e a
  dimensão em configuração.
- Chunks são janelas de versículos, não versículos isolados, para dar o
  máximo de contexto ao modelo fraco.
- O ramo full-text da busca híbrida compensa parte da perda semântica, já que
  ele é nativamente bom em português.
- **Caminho de migração documentado:** trocar o modelo exige regerar os
  ~13.000 chunks e recriar o índice HNSW. Se a dimensão do novo modelo for
  384, o schema não muda. É retrabalho de uma tarde, não uma reescrita.
- **Critério de reavaliação:** se durante o beta as perguntas por tema
  retornarem versículos irrelevantes com frequência perceptível, reabrir a
  decisão com dados reais.

**Android: três portas, uma escolha adiada.** O diagrama original sugeria
"Web → PWA → Android" como passo automático. Não é. Os caminhos reais:

| Caminho | O que custa | O que dá |
|---|---|---|
| PWA instalável | nada além do manifest | instala do navegador, hoje |
| TWA via Bubblewrap | um wrapper e a ficha na Play Store | presença na loja, sem tocar no código |
| Capacitor | `output: 'export'` e telas 100% cliente | Bíblia offline, notificação, widget |

A decisão fica para depois do beta, mas a **precondição** dela é atendida
desde agora: nenhuma lógica essencial no servidor do Next. É o que torna o
terceiro caminho uma tarde de trabalho em vez de uma reescrita. O motivo
real para virar nativo num app bíblico é a leitura offline — a Escritura
inteira cabe folgadamente no dispositivo, e quem lê Bíblia no ônibus não
tem sinal.

No iOS as limitações de PWA são consideravelmente maiores, e lá o Capacitor
deixa de ser opcional.

**Vercel Hobby não permite uso comercial.** Serve ao beta fechado. Se o VERBO
virar produto pago, exige o plano Pro.

---

## 11. Ordem de construção

Cada ciclo é entregável. A ordem existe para que haja um produto que funciona
**antes** de atacar a parte arriscada. Cada ciclo recebe seu próprio plano de
implementação.

| Ciclo | Entrega | Depende de |
|---|---|---|
| 0 | Projeto Supabase, Next.js, migrations base, deploy na Vercel, CI | — |
| 1 | Licença verificada, schema da Bíblia, importador, validação, leitor | 0 |
| 2 | Busca por palavra e por referência | 1 |
| 3 | Auth, RLS, favoritos, anotações, histórico | 1 |
| 4 | Chunks, embeddings em lote, `hybrid_search` | 1 |
| 5 | Edge Function `ask`, validação, limites, cache, histórico | 3, 4 |
| 6 | PWA, responsividade, segurança, beta fechado | todos |

Ciclos 2, 3 e 4 são independentes entre si e podem ser reordenados.

---

## 12. Definição de pronto para o MVP

- Uma pessoa abre o VERBO, lê João 3, favorita um versículo e escreve uma
  anotação. Tudo persiste.
- Busca "perdão" e recebe versículos relevantes, sem custo de IA.
- Pergunta "o que a Bíblia fala sobre ansiedade" e recebe uma resposta com
  referências, e **cada referência abre no versículo real**.
- Nenhuma referência exibida pelo VERBO aponta para um versículo inexistente.
- Instala como PWA no Android.
- Existe um número mensurável de citações descartadas por resposta.
