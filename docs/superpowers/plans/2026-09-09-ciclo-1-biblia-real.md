# Ciclo 1 — A Bíblia de verdade no banco

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para executar tarefa por tarefa. Os passos
> usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** trocar a amostra descartável por uma tradução de domínio
público verificada, importada, validada e servida do Postgres — e apagar o
portão de lançamento.

**Arquitetura:** um formato intermediário normalizado em JSON separa a
obtenção do texto (que varia por fonte) da importação (que não varia). Um
adaptador converte o arquivo original para esse formato; o importador valida
e grava; um fixture de contagens do canon é a prova de que nada faltou. As
telas passam a ler do Supabase via uma camada de dados única.

**Stack:** TypeScript, Node 24, Vitest, `@supabase/supabase-js`, Postgres 17
com pgvector.

**Spec:** [docs/superpowers/specs/2026-09-09-verbo-mvp-design.md](../specs/2026-09-09-verbo-mvp-design.md)
— seções 4 (modelo de dados), 5 (ingestão) e 6 (busca).

## Restrições globais

- Node 24, npm 11. Next 16.3.4, React 19.2.8, Tailwind v4.
- **A Escritura é imutável.** `bible_verses` e `bible_books` rejeitam
  `UPDATE` e `DELETE` por trigger. Reimportar exige uma migration explícita
  que desabilite o trigger. Nunca contorne por dentro do código.
- **Nenhuma lógica essencial no servidor do Next.** O cliente fala direto com
  o Supabase. Nada de `app/api/`.
- O importador é o único componente que usa a chave `service_role`, e ela
  vive só em `.env.local`, nunca em `.env`.
- Textos de interface em português do Brasil, voz ativa, sem CAIXA ALTA
  decorativa.
- `p_translation` é **obrigatório** em `search_verses` — não existe busca sem
  tradução declarada.
- Todo commit roda `npm test` antes.

**Sobre `<slug>` e `<ext>` no plano:** aparecem nas Tarefas 5 e 6 porque o
nome e o formato do arquivo-fonte são o **resultado** da Tarefa 1 — não dá
para fixá-los antes de verificar as licenças. Assim que a Tarefa 1 fechar,
substitua os dois em todo o plano pelos valores reais (por exemplo
`adapt-arc1911.ts` e `.json`). As interfaces e os testes não dependem dessa
escolha: só o parsing da entrada depende, e a Tarefa 5 diz o que fazer para
cada um dos três formatos possíveis.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `docs/design/traducao.md` | criar — o registro da verificação de licença |
| `lib/bible/source-format.ts` | criar — o tipo do JSON normalizado e seu validador |
| `lib/bible/source-format.test.ts` | criar |
| `scripts/import/adapt-<fonte>.ts` | criar — converte o arquivo original no JSON normalizado |
| `scripts/import/adapt.test.ts` | criar |
| `lib/bible/canon-counts.ts` | criar — fixture com versículos por capítulo dos 66 livros |
| `lib/bible/validate-import.ts` | criar — as asserções da seção 5 do spec |
| `lib/bible/validate-import.test.ts` | criar |
| `scripts/import/import-bible.ts` | criar — grava no Postgres com service_role |
| `lib/supabase/client.ts` | criar — cliente de navegador |
| `lib/data/bible.ts` | criar — a única porta de leitura da Escritura |
| `lib/data/bible.test.ts` | criar |
| `app/page.tsx` | modificar — índice e abertura vindos do banco |
| `app/biblia/[osis]/[chapter]/page.tsx` | modificar — capítulo do banco |
| `app/buscar/page.tsx` | modificar — `search_verses` de verdade |
| `app/perguntar/page.tsx` | modificar — resolver âncora pelo banco |
| `lib/bible/sample.ts` | **apagar** na Tarefa 8 |
| `.env` | modificar — apagar o portão na Tarefa 8 |

---

## Tarefa 1: Verificar e escolher a tradução

Não há código aqui. Há uma decisão que bloqueia todo o resto e que precisa
ficar registrada com fontes, porque é uma questão de licença e alguém vai
perguntar depois de onde veio o texto.

**Arquivos:**
- Criar: `docs/design/traducao.md`
- Modificar: `docs/superpowers/specs/2026-09-09-verbo-mvp-design.md` (seção 5,
  substituir a "Pendência aberta" pela decisão)

**Interfaces:**
- Produz: o arquivo-fonte baixado em `data/source/` (fora do git, entra no
  `.gitignore`), e em `docs/design/traducao.md` os campos que a Tarefa 6 vai
  gravar em `bible_translations`: `slug`, `name`, `abbrev`, `license`,
  `license_url`, `source_url`, `source_sha256`.

- [ ] **Passo 1: levantar os candidatos**

Para cada um dos três candidatos, achar: a situação real da licença (domínio
público confirmado, não presumido), a URL da fonte, o formato disponível, se
o texto está completo nos 66 livros, e a qualidade da digitalização.

- Almeida Revista e Corrigida 1911
- Tradução Brasileira (1917)
- A Bíblia Livre (ABL / BLIVRE)

- [ ] **Passo 2: escrever `docs/design/traducao.md`**

Uma tabela comparando os três nos cinco critérios acima, cada linha com a URL
que sustenta a afirmação. Depois a escolha, com o motivo em duas ou três
frases. Se nenhum candidato servir, dizer isso e listar o que falta — é um
resultado legítimo desta tarefa e melhor do que importar texto duvidoso.

- [ ] **Passo 3: baixar e registrar o checksum**

```bash
mkdir -p data/source
# baixar o arquivo para data/source/<slug>.<ext>
sha256sum data/source/<slug>.<ext>
```

Anotar o hash em `docs/design/traducao.md`. É o mesmo valor que vai para
`bible_translations.source_sha256`, e é o que prova depois que o texto no
banco é o texto que foi baixado.

- [ ] **Passo 4: ignorar o fonte no git**

```bash
printf '\n# arquivo-fonte da tradução: grande e imutável, não versionado\ndata/source/\n' >> .gitignore
```

- [ ] **Passo 5: atualizar o spec**

Na seção 5, apagar o bloco "Pendência aberta — primeira tarefa do Ciclo 1" e
pôr no lugar a tradução escolhida com licença, URL e checksum.

- [ ] **Passo 6: commit**

```bash
git add docs/design/traducao.md docs/superpowers/specs/2026-09-09-verbo-mvp-design.md .gitignore
git commit -m "Escolhe a tradução do VERBO com licença verificada"
```

---

## Tarefa 2: O formato normalizado e seu validador

O adaptador varia com a fonte; o importador não pode variar. Este é o
contrato entre os dois.

**Arquivos:**
- Criar: `lib/bible/source-format.ts`
- Testar: `lib/bible/source-format.test.ts`

**Interfaces:**
- Consome: `BOOKS`, `bookByOsis` de `lib/bible/canon.ts`.
- Produz:
  - `interface SourceBible { translation: SourceTranslation; verses: SourceVerse[] }`
  - `interface SourceTranslation { slug: string; name: string; abbrev: string; license: string; licenseUrl?: string; sourceUrl?: string; sourceSha256?: string }`
  - `interface SourceVerse { osis: string; c: number; v: number; t: string; woc?: boolean }`
  - `function parseSourceBible(raw: unknown): SourceBible` — lança `Error` com
    mensagem específica quando a forma está errada.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// lib/bible/source-format.test.ts
import { describe, expect, it } from "vitest";
import { parseSourceBible } from "./source-format";

const valido = {
  translation: {
    slug: "arc1911",
    name: "Almeida Revista e Corrigida 1911",
    abbrev: "ARC",
    license: "domínio público",
  },
  verses: [
    { osis: "Gen", c: 1, v: 1, t: "No princípio criou Deus os céus e a terra." },
    { osis: "John", c: 3, v: 16, t: "Porque Deus amou o mundo.", woc: true },
  ],
};

describe("parseSourceBible", () => {
  it("aceita um documento bem formado", () => {
    const b = parseSourceBible(valido);
    expect(b.translation.slug).toBe("arc1911");
    expect(b.verses).toHaveLength(2);
    expect(b.verses[1].woc).toBe(true);
  });

  it("exige licença declarada", () => {
    const semLicenca = structuredClone(valido);
    // @ts-expect-error remoção intencional
    delete semLicenca.translation.license;
    expect(() => parseSourceBible(semLicenca)).toThrow(/licen/i);
  });

  it("recusa slug fora do formato do banco", () => {
    const ruim = structuredClone(valido);
    ruim.translation.slug = "ARC 1911";
    expect(() => parseSourceBible(ruim)).toThrow(/slug/i);
  });

  it("recusa livro que não existe no canon", () => {
    const ruim = structuredClone(valido);
    ruim.verses[0].osis = "Enoch";
    expect(() => parseSourceBible(ruim)).toThrow(/Enoch/);
  });

  it("recusa capítulo acima do que o livro tem", () => {
    const ruim = structuredClone(valido);
    ruim.verses[1].c = 99;
    expect(() => parseSourceBible(ruim)).toThrow(/João.*99/);
  });

  it("recusa versículo com texto vazio", () => {
    const ruim = structuredClone(valido);
    ruim.verses[0].t = "   ";
    expect(() => parseSourceBible(ruim)).toThrow(/vazio|branco/i);
  });

  it("recusa versículo repetido", () => {
    const ruim = structuredClone(valido);
    ruim.verses.push({ ...ruim.verses[0] });
    expect(() => parseSourceBible(ruim)).toThrow(/repetid|duplicad/i);
  });

  it("recusa documento sem versículo nenhum", () => {
    expect(() => parseSourceBible({ ...valido, verses: [] })).toThrow(/vazio/i);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run lib/bible/source-format.test.ts`
Esperado: FALHA com "Cannot find module './source-format'".

- [ ] **Passo 3: implementar**

```ts
// lib/bible/source-format.ts
/**
 * Formato intermediário entre o arquivo original e o importador.
 *
 * O adaptador de cada fonte produz este documento; o importador só conhece
 * ele. Assim trocar de tradução ou de formato de origem não mexe no
 * importador, na validação nem nos testes deles.
 */

import { bookByOsis } from "./canon";

export interface SourceTranslation {
  slug: string;
  name: string;
  abbrev: string;
  license: string;
  licenseUrl?: string;
  sourceUrl?: string;
  sourceSha256?: string;
}

export interface SourceVerse {
  osis: string;
  c: number;
  v: number;
  t: string;
  /** Fala de Cristo — composta em vermelho no leitor. */
  woc?: boolean;
}

export interface SourceBible {
  translation: SourceTranslation;
  verses: SourceVerse[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSourceBible(raw: unknown): SourceBible {
  assert(isRecord(raw), "documento inválido: esperado um objeto");
  const { translation, verses } = raw;

  assert(isRecord(translation), "documento inválido: falta `translation`");
  for (const campo of ["slug", "name", "abbrev"] as const) {
    assert(
      typeof translation[campo] === "string" &&
        (translation[campo] as string).trim() !== "",
      `tradução inválida: \`${campo}\` é obrigatório`,
    );
  }
  assert(
    typeof translation.license === "string" && translation.license.trim() !== "",
    "tradução inválida: a licença é obrigatória — o VERBO não importa texto sem procedência",
  );
  assert(
    /^[a-z0-9-]+$/.test(translation.slug as string),
    `slug inválido: "${translation.slug}" — só minúsculas, dígitos e hífen, como exige bible_translations`,
  );

  assert(Array.isArray(verses), "documento inválido: falta `verses`");
  assert(verses.length > 0, "documento vazio: nenhum versículo");

  const vistos = new Set<string>();
  const saida: SourceVerse[] = [];

  for (const [i, item] of verses.entries()) {
    assert(isRecord(item), `versículo ${i}: esperado um objeto`);

    const { osis, c, v, t, woc } = item;
    assert(typeof osis === "string", `versículo ${i}: \`osis\` inválido`);

    const livro = bookByOsis(osis);
    assert(livro, `livro fora do canon: "${osis}" (versículo ${i})`);

    assert(
      Number.isInteger(c) && (c as number) >= 1,
      `${livro.name}: capítulo inválido (${String(c)})`,
    );
    assert(
      (c as number) <= livro.chapters,
      `${livro.name}: capítulo ${String(c)} não existe — o livro tem ${livro.chapters}`,
    );
    assert(
      Number.isInteger(v) && (v as number) >= 1,
      `${livro.name} ${String(c)}: versículo inválido (${String(v)})`,
    );
    assert(
      typeof t === "string" && t.trim() !== "",
      `${livro.name} ${String(c)}:${String(v)}: texto vazio ou em branco`,
    );

    const chave = `${osis} ${c}:${v}`;
    assert(!vistos.has(chave), `versículo repetido: ${chave}`);
    vistos.add(chave);

    saida.push({
      osis,
      c: c as number,
      v: v as number,
      t: (t as string).trim(),
      ...(woc === true ? { woc: true } : {}),
    });
  }

  return {
    translation: {
      slug: translation.slug as string,
      name: translation.name as string,
      abbrev: translation.abbrev as string,
      license: translation.license as string,
      ...(typeof translation.licenseUrl === "string"
        ? { licenseUrl: translation.licenseUrl }
        : {}),
      ...(typeof translation.sourceUrl === "string"
        ? { sourceUrl: translation.sourceUrl }
        : {}),
      ...(typeof translation.sourceSha256 === "string"
        ? { sourceSha256: translation.sourceSha256 }
        : {}),
    },
    verses: saida,
  };
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run lib/bible/source-format.test.ts`
Esperado: 8 testes passando.

- [ ] **Passo 5: commit**

```bash
git add lib/bible/source-format.ts lib/bible/source-format.test.ts
git commit -m "Define o formato normalizado entre fonte e importador"
```

---

## Tarefa 3: Fixture de contagens do canon

A validação da seção 5 do spec exige conferir versículos por capítulo. Isso
precisa de um número esperado para cada um dos 1.189 capítulos, e esse número
não pode sair da própria importação — senão a validação vira tautologia.

**Arquivos:**
- Criar: `lib/bible/canon-counts.ts`
- Testar: `lib/bible/canon-counts.test.ts`

**Interfaces:**
- Consome: `BOOKS`, `TOTAL_CHAPTERS` de `lib/bible/canon.ts`.
- Produz:
  - `const VERSE_COUNTS: Record<string, number[]>` — chave é o código OSIS,
    valor é um array com a contagem de versículos de cada capítulo, em ordem.
  - `const TOTAL_VERSES: number`
  - `function expectedVerseCount(osis: string, chapter: number): number | undefined`

- [ ] **Passo 1: escrever o teste que falha**

```ts
// lib/bible/canon-counts.test.ts
import { describe, expect, it } from "vitest";
import { BOOKS } from "./canon";
import { expectedVerseCount, TOTAL_VERSES, VERSE_COUNTS } from "./canon-counts";

describe("canon-counts", () => {
  it("cobre todos os 66 livros", () => {
    expect(Object.keys(VERSE_COUNTS)).toHaveLength(66);
    for (const b of BOOKS) {
      expect(VERSE_COUNTS[b.osis], `falta ${b.osis}`).toBeDefined();
    }
  });

  it("tem uma contagem por capítulo de cada livro", () => {
    for (const b of BOOKS) {
      expect(VERSE_COUNTS[b.osis], b.name).toHaveLength(b.chapters);
    }
  });

  it("não tem capítulo com zero versículos", () => {
    for (const [osis, caps] of Object.entries(VERSE_COUNTS)) {
      for (const [i, n] of caps.entries()) {
        expect(n, `${osis} ${i + 1}`).toBeGreaterThan(0);
      }
    }
  });

  it("confere marcos conhecidos", () => {
    expect(expectedVerseCount("Ps", 117)).toBe(2);    // o menor capítulo
    expect(expectedVerseCount("Ps", 119)).toBe(176);  // o maior
    expect(expectedVerseCount("John", 3)).toBe(36);
    expect(expectedVerseCount("Gen", 1)).toBe(31);
    expect(expectedVerseCount("Rev", 22)).toBe(21);
  });

  it("soma 31.102 versículos", () => {
    expect(TOTAL_VERSES).toBe(31102);
  });

  it("devolve undefined para o que não existe", () => {
    expect(expectedVerseCount("John", 99)).toBeUndefined();
    expect(expectedVerseCount("Enoch", 1)).toBeUndefined();
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run lib/bible/canon-counts.test.ts`
Esperado: FALHA com "Cannot find module './canon-counts'".

- [ ] **Passo 3: implementar**

**Não escreva estes 1.189 números de memória.** Errar um deles não causa
falha visível: causa uma validação que aprova uma importação incompleta, ou
que reprova uma correta. Tire-os de uma fonte citável — o próprio arquivo
de uma edição de referência, ou uma tabela publicada de contagens de
versículos — e registre a URL num comentário no topo do arquivo.

O teste do Passo 1 é a rede de segurança: se o total não fechar em 31.102, ou
se algum livro não tiver exatamente `chapters` entradas, algum array está
errado e o teste diz qual. Rode o teste **enquanto** preenche, não no fim.

A estrutura é esta, com Gênesis já preenchido como modelo do formato:

```ts
// lib/bible/canon-counts.ts
/**
 * Versículos por capítulo, na numeração Almeida.
 *
 * Existe para a validação da importação poder afirmar que nada faltou. Não é
 * derivado do arquivo importado de propósito: se fosse, a validação estaria
 * conferindo o texto contra ele mesmo.
 *
 * Divergências entre traduções são pontuais (Salmos com título hebraico,
 * finais de Marcos e João 8). Se a tradução escolhida divergir num capítulo,
 * registre a exceção em EXCECOES com o motivo — nunca ajuste o número aqui
 * para calar um erro.
 */

export const VERSE_COUNTS: Record<string, number[]> = {
  Gen: [31, 25, 24, 26, 32, 22, 24, 22, 29, 32, 32, 20, 18, 24, 21, 16, 27, 33, 38, 18, 34, 24, 20, 67, 34, 35, 46, 22, 35, 43, 55, 32, 20, 31, 29, 43, 36, 30, 23, 23, 57, 38, 34, 34, 28, 34, 31, 22, 33, 26],
  // … os 65 livros restantes, cada um com chapters entradas
};

/** Capítulos em que a tradução escolhida divergiu, com o motivo. */
export const EXCECOES: Array<{ osis: string; chapter: number; motivo: string }> = [];

export const TOTAL_VERSES = Object.values(VERSE_COUNTS)
  .flat()
  .reduce((soma, n) => soma + n, 0);

export function expectedVerseCount(
  osis: string,
  chapter: number,
): number | undefined {
  return VERSE_COUNTS[osis]?.[chapter - 1];
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run lib/bible/canon-counts.test.ts`
Esperado: 6 testes passando. Se o total não fechar em 31.102, o array de
algum livro está incompleto — o teste de "uma contagem por capítulo" diz
qual.

- [ ] **Passo 5: commit**

```bash
git add lib/bible/canon-counts.ts lib/bible/canon-counts.test.ts
git commit -m "Adiciona fixture de contagens de versículos do canon"
```

---

## Tarefa 4: Validação da importação

**Arquivos:**
- Criar: `lib/bible/validate-import.ts`
- Testar: `lib/bible/validate-import.test.ts`

**Interfaces:**
- Consome: `SourceBible` de `lib/bible/source-format.ts`; `BOOKS` de
  `lib/bible/canon.ts`; `VERSE_COUNTS`, `EXCECOES` de
  `lib/bible/canon-counts.ts`.
- Produz:
  - `interface ImportProblem { kind: "livro-faltando" | "capitulo-faltando" | "contagem-divergente" | "lacuna"; where: string; detail: string }`
  - `function validateImport(bible: SourceBible): ImportProblem[]` — array
    vazio significa importação íntegra.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// lib/bible/validate-import.test.ts
import { describe, expect, it } from "vitest";
import { BOOKS } from "./canon";
import { VERSE_COUNTS } from "./canon-counts";
import type { SourceBible, SourceVerse } from "./source-format";
import { validateImport } from "./validate-import";

/** Monta uma Bíblia completa e correta a partir do fixture de contagens. */
function biblicaCompleta(): SourceBible {
  const verses: SourceVerse[] = [];
  for (const b of BOOKS) {
    VERSE_COUNTS[b.osis].forEach((n, i) => {
      for (let v = 1; v <= n; v++) {
        verses.push({ osis: b.osis, c: i + 1, v, t: `${b.osis} ${i + 1}:${v}` });
      }
    });
  }
  return {
    translation: { slug: "t", name: "T", abbrev: "T", license: "dp" },
    verses,
  };
}

describe("validateImport", () => {
  it("aprova uma importação completa", () => {
    expect(validateImport(biblicaCompleta())).toEqual([]);
  });

  it("acusa livro inteiro faltando", () => {
    const b = biblicaCompleta();
    b.verses = b.verses.filter((v) => v.osis !== "Obad");
    const p = validateImport(b);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ kind: "livro-faltando", where: "Obadias" });
  });

  it("acusa capítulo faltando", () => {
    const b = biblicaCompleta();
    b.verses = b.verses.filter((v) => !(v.osis === "John" && v.c === 3));
    const p = validateImport(b);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ kind: "capitulo-faltando", where: "João 3" });
  });

  it("acusa contagem divergente", () => {
    const b = biblicaCompleta();
    b.verses = b.verses.filter((v) => !(v.osis === "John" && v.c === 3 && v.v === 36));
    const p = validateImport(b);
    expect(p).toHaveLength(1);
    expect(p[0].kind).toBe("contagem-divergente");
    expect(p[0].detail).toMatch(/35.*36/);
  });

  it("acusa lacuna no meio da numeração", () => {
    const b = biblicaCompleta();
    // tira o 10 e devolve um 37 no fim: a contagem fecha, a numeração não
    b.verses = b.verses.filter((v) => !(v.osis === "John" && v.c === 3 && v.v === 10));
    b.verses.push({ osis: "John", c: 3, v: 37, t: "extra" });
    const p = validateImport(b);
    expect(p.some((x) => x.kind === "lacuna")).toBe(true);
  });

  it("acusa todos os problemas, não só o primeiro", () => {
    const b = biblicaCompleta();
    b.verses = b.verses.filter((v) => v.osis !== "Obad" && v.osis !== "Phlm");
    expect(validateImport(b)).toHaveLength(2);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run lib/bible/validate-import.test.ts`
Esperado: FALHA com "Cannot find module './validate-import'".

- [ ] **Passo 3: implementar**

```ts
// lib/bible/validate-import.ts
/**
 * As asserções da seção 5 do spec, como código.
 *
 * Devolve TODOS os problemas, não só o primeiro: quem está importando quer
 * ver o estrago inteiro de uma vez, não descobrir um por rodada.
 */

import { BOOKS, bookByOsis } from "./canon";
import { EXCECOES, VERSE_COUNTS } from "./canon-counts";
import type { SourceBible } from "./source-format";

export interface ImportProblem {
  kind:
    | "livro-faltando"
    | "capitulo-faltando"
    | "contagem-divergente"
    | "lacuna";
  where: string;
  detail: string;
}

function excecao(osis: string, chapter: number): boolean {
  return EXCECOES.some((e) => e.osis === osis && e.chapter === chapter);
}

export function validateImport(bible: SourceBible): ImportProblem[] {
  const problems: ImportProblem[] = [];

  // osis -> capítulo -> conjunto de versículos presentes
  const mapa = new Map<string, Map<number, Set<number>>>();
  for (const v of bible.verses) {
    let capitulos = mapa.get(v.osis);
    if (!capitulos) {
      capitulos = new Map();
      mapa.set(v.osis, capitulos);
    }
    let versiculos = capitulos.get(v.c);
    if (!versiculos) {
      versiculos = new Set();
      capitulos.set(v.c, versiculos);
    }
    versiculos.add(v.v);
  }

  for (const livro of BOOKS) {
    const capitulos = mapa.get(livro.osis);
    if (!capitulos || capitulos.size === 0) {
      problems.push({
        kind: "livro-faltando",
        where: livro.name,
        detail: `nenhum versículo importado para ${livro.name}`,
      });
      continue;
    }

    const esperadoPorCapitulo = VERSE_COUNTS[livro.osis];

    for (let c = 1; c <= livro.chapters; c++) {
      const versiculos = capitulos.get(c);
      if (!versiculos || versiculos.size === 0) {
        problems.push({
          kind: "capitulo-faltando",
          where: `${livro.name} ${c}`,
          detail: `capítulo ausente`,
        });
        continue;
      }

      const esperado = esperadoPorCapitulo?.[c - 1];
      if (
        esperado !== undefined &&
        versiculos.size !== esperado &&
        !excecao(livro.osis, c)
      ) {
        problems.push({
          kind: "contagem-divergente",
          where: `${livro.name} ${c}`,
          detail: `importados ${versiculos.size}, esperados ${esperado}`,
        });
      }

      const maior = Math.max(...versiculos);
      const faltando: number[] = [];
      for (let v = 1; v <= maior; v++) {
        if (!versiculos.has(v)) faltando.push(v);
      }
      if (faltando.length > 0) {
        problems.push({
          kind: "lacuna",
          where: `${livro.name} ${c}`,
          detail: `versículo(s) ausente(s) na numeração: ${faltando.join(", ")}`,
        });
      }
    }
  }

  // Livro presente no arquivo que não existe no canon já foi barrado por
  // parseSourceBible; aqui só confirmamos que nada escapou.
  for (const osis of mapa.keys()) {
    if (!bookByOsis(osis)) {
      problems.push({
        kind: "livro-faltando",
        where: osis,
        detail: `livro fora do canon presente no arquivo`,
      });
    }
  }

  return problems;
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run lib/bible/validate-import.test.ts`
Esperado: 6 testes passando.

- [ ] **Passo 5: commit**

```bash
git add lib/bible/validate-import.ts lib/bible/validate-import.test.ts
git commit -m "Valida integridade da importação contra o canon"
```

---

## Tarefa 5: Adaptador da fonte escolhida

**Arquivos:**
- Criar: `scripts/import/adapt-<slug>.ts` (o `<slug>` vem da Tarefa 1)
- Testar: `scripts/import/adapt.test.ts`

**Interfaces:**
- Consome: `SourceBible`, `parseSourceBible` de `lib/bible/source-format.ts`.
- Produz: `function adapt(raw: string): SourceBible` — recebe o conteúdo bruto
  do arquivo original e devolve o documento normalizado, já validado por
  `parseSourceBible`.

- [ ] **Passo 1: escrever o teste que falha**

Recortar do arquivo original um pedaço pequeno e representativo — dois ou
três capítulos, incluindo um livro com número no nome (1 Coríntios) e um de
capítulo único — e guardar em `scripts/import/fixtures/amostra-fonte.<ext>`.
O teste roda o adaptador nesse recorte:

```ts
// scripts/import/adapt.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adapt } from "./adapt-<slug>";

const bruto = readFileSync(
  path.join(import.meta.dirname, "fixtures/amostra-fonte.<ext>"),
  "utf8",
);

describe("adapt", () => {
  it("devolve um documento normalizado válido", () => {
    const b = adapt(bruto);
    expect(b.translation.license).not.toBe("");
    expect(b.verses.length).toBeGreaterThan(50);
  });

  it("mapeia os nomes de livro da fonte para códigos OSIS", () => {
    const osis = new Set(adapt(bruto).verses.map((v) => v.osis));
    expect(osis.has("1Cor")).toBe(true);
  });

  it("preserva acentuação e pontuação do original", () => {
    const b = adapt(bruto);
    expect(b.verses.some((v) => /[áéíóúâêôãõç]/.test(v.t))).toBe(true);
  });

  it("não deixa marcação da fonte vazar para o texto", () => {
    // Marcadores de nota, itálico e número de versículo não são Escritura.
    for (const v of adapt(bruto).verses) {
      expect(v.t, `${v.osis} ${v.c}:${v.v}`).not.toMatch(/<[^>]+>|\[\d+\]|\{|\}/);
    }
  });

  it("não deixa espaço duplo nem espaço nas pontas", () => {
    for (const v of adapt(bruto).verses) {
      expect(v.t).toBe(v.t.trim());
      expect(v.t).not.toMatch(/ {2}/);
    }
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run scripts/import/adapt.test.ts`
Esperado: FALHA com módulo não encontrado.

- [ ] **Passo 3: implementar o adaptador**

A forma depende do formato que a Tarefa 1 encontrou. Nos três casos comuns:

- **JSON** — mapear a estrutura da fonte para `SourceVerse[]`, traduzindo o
  nome de livro da fonte para OSIS por uma tabela explícita no topo do
  arquivo. Não reaproveitar `parseReference` aqui: ele serve à entrada do
  usuário, tolerante e ambígua; o adaptador precisa ser estrito e falhar
  quando não reconhecer um nome.
- **OSIS/XML** — os códigos já são OSIS; extrair `osisID` de cada
  `<verse>`, e remover `<note>` inteiro antes de pegar o texto.
- **Texto corrido** — uma linha por versículo no padrão
  `Livro capítulo:versículo texto`. Casar com regex ancorada e **falhar** em
  qualquer linha que não casar, em vez de ignorar em silêncio.

Em todos os casos, o último passo é `return parseSourceBible(doc)`, para que
o adaptador nunca devolva algo que o importador vá recusar.

Normalização obrigatória, na ordem:

```ts
function normalizarTexto(bruto: string): string {
  return bruto
    .normalize("NFC")           // acentuação em forma composta, consistente
    .replace(/\s+/g, " ")        // quebras de linha da fonte não são semânticas
    .replace(/\s+([,.;:!?»])/g, "$1")
    .trim();
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run scripts/import/adapt.test.ts`
Esperado: 5 testes passando.

- [ ] **Passo 5: commit**

```bash
git add scripts/import/
git commit -m "Adapta o arquivo-fonte da tradução para o formato normalizado"
```

---

## Tarefa 6: Importador

**Arquivos:**
- Criar: `scripts/import/import-bible.ts`
- Modificar: `package.json` (script `import:bible`)

**Interfaces:**
- Consome: `adapt` de `scripts/import/adapt-<slug>.ts`; `validateImport` de
  `lib/bible/validate-import.ts`; `BOOKS` de `lib/bible/canon.ts`.
- Produz: um comando de linha. Nenhuma exportação consumida por outra tarefa.

- [ ] **Passo 1: escrever o importador**

```ts
// scripts/import/import-bible.ts
/**
 * Importa a tradução para o Postgres. Roda uma vez.
 *
 *   npm run import:bible -- data/source/<arquivo>
 *
 * Único componente que usa a chave service_role, porque é o único que
 * escreve na Escritura. A chave vive em .env.local e nunca em .env.
 *
 * A ordem importa: valida ANTES de gravar. Gravar e depois descobrir que
 * faltou um livro deixaria o banco num estado que os triggers de
 * imutabilidade não permitem corrigir sem migration.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { BOOKS } from "../../lib/bible/canon";
import { validateImport } from "../../lib/bible/validate-import";
import { adapt } from "./adapt-<slug>";

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("uso: npm run import:bible -- <caminho do arquivo-fonte>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.error(
    "faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local",
  );
  process.exit(1);
}

const bruto = readFileSync(arquivo);
const sha256 = createHash("sha256").update(bruto).digest("hex");
console.log(`arquivo: ${arquivo}`);
console.log(`sha256:  ${sha256}`);

const bible = adapt(bruto.toString("utf8"));
bible.translation.sourceSha256 = sha256;

console.log(`\nvalidando ${bible.verses.length} versículos…`);
const problemas = validateImport(bible);
if (problemas.length > 0) {
  console.error(`\n${problemas.length} problema(s). NADA foi gravado:\n`);
  for (const p of problemas.slice(0, 40)) {
    console.error(`  [${p.kind}] ${p.where}: ${p.detail}`);
  }
  if (problemas.length > 40) {
    console.error(`  … e outros ${problemas.length - 40}`);
  }
  process.exit(1);
}
console.log("validação passou: 66 livros, contagens conferidas, sem lacunas");

const db = createClient(url, chave, { auth: { persistSession: false } });

// ------------------------------------------------------------------ tradução
const { data: traducao, error: erroT } = await db
  .from("bible_translations")
  .insert({
    slug: bible.translation.slug,
    name: bible.translation.name,
    abbrev: bible.translation.abbrev,
    license: bible.translation.license,
    license_url: bible.translation.licenseUrl ?? null,
    source_url: bible.translation.sourceUrl ?? null,
    source_sha256: sha256,
    verse_count: bible.verses.length,
    imported_at: new Date().toISOString(),
  })
  .select("id")
  .single();
if (erroT) throw erroT;

// --------------------------------------------------------------------- livros
const { data: livros, error: erroL } = await db
  .from("bible_books")
  .upsert(
    BOOKS.map((b) => ({
      osis_code: b.osis,
      name_pt: b.name,
      abbreviations: b.aliases,
      testament: b.testament,
      canonical_order: b.order,
      chapter_count: b.chapters,
    })),
    { onConflict: "osis_code", ignoreDuplicates: true },
  )
  .select("id, osis_code");
if (erroL) throw erroL;

const { data: todosLivros } = await db
  .from("bible_books")
  .select("id, osis_code");
const idPorOsis = new Map(
  (todosLivros ?? []).map((b) => [b.osis_code as string, b.id as number]),
);
void livros;

// ---------------------------------------------------------------- versículos
const LOTE = 1000;
let gravados = 0;
for (let i = 0; i < bible.verses.length; i += LOTE) {
  const lote = bible.verses.slice(i, i + LOTE).map((v) => ({
    translation_id: traducao.id,
    book_id: idPorOsis.get(v.osis),
    chapter: v.c,
    verse: v.v,
    text: v.t,
    words_of_christ: v.woc ?? false,
  }));
  const { error } = await db.from("bible_verses").insert(lote);
  if (error) throw error;
  gravados += lote.length;
  process.stdout.write(`\rgravados ${gravados}/${bible.verses.length}`);
}
console.log("\n");

// ------------------------------------------------------ conferência final
const { count } = await db
  .from("bible_verses")
  .select("*", { count: "exact", head: true })
  .eq("translation_id", traducao.id);

if (count !== bible.verses.length) {
  console.error(
    `DIVERGÊNCIA: o banco tem ${count} versículos, o arquivo tinha ${bible.verses.length}`,
  );
  process.exit(1);
}

console.log(`importação concluída: ${count} versículos em ${bible.translation.slug}`);
```

- [ ] **Passo 2: registrar o script**

```bash
npm pkg set scripts.import:bible="node --experimental-strip-types --env-file=.env.local scripts/import/import-bible.ts"
```

- [ ] **Passo 3: verificar contra o Postgres local**

```bash
npm run verify:schema
```

Esperado: EXIT=0. Depois rodar o importador apontando para o banco local e
conferir que ele **recusa** um arquivo incompleto sem gravar nada:

```bash
head -c 200000 data/source/<arquivo> > /tmp/truncado
npm run import:bible -- /tmp/truncado
```

Esperado: lista de problemas e "NADA foi gravado", código de saída 1.

- [ ] **Passo 4: importar de verdade**

```bash
npm run import:bible -- data/source/<arquivo>
```

Esperado: "importação concluída: 31102 versículos".

- [ ] **Passo 5: commit**

```bash
git add scripts/import/import-bible.ts package.json
git commit -m "Adiciona importador da Bíblia com validação antes da gravação"
```

---

## Tarefa 7: Camada de dados e telas no banco

**Arquivos:**
- Criar: `lib/supabase/client.ts`, `lib/data/bible.ts`
- Testar: `lib/data/bible.test.ts`
- Modificar: `app/page.tsx`, `app/biblia/[osis]/[chapter]/page.tsx`,
  `app/buscar/page.tsx`, `app/perguntar/page.tsx`

**Interfaces:**
- Consome: `parseReference`, `Reference` de `lib/bible/reference.ts`; `BOOKS`
  de `lib/bible/canon.ts`.
- Produz:
  - `function supabaseBrowser(): SupabaseClient`
  - `interface Verse { id: number; chapter: number; verse: number; text: string; wordsOfChrist: boolean }`
  - `async function getChapter(osis: string, chapter: number): Promise<Verse[]>`
  - `async function searchWords(query: string, limit?: number): Promise<SearchHit[]>`
  - `interface SearchHit { verseId: number; osis: string; book: string; chapter: number; verse: number; text: string }`
  - `async function resolvePassage(ref: Reference): Promise<string | null>`
  - `const TRANSLATION_SLUG: string`

- [ ] **Passo 1: escrever o teste que falha**

Testar a camada de dados sem rede: injetar um cliente falso que devolve o que
o Postgres devolveria. O que importa aqui é a tradução entre o formato do
banco e o formato das telas, e o comportamento quando não há resultado.

```ts
// lib/data/bible.test.ts
import { describe, expect, it, vi } from "vitest";
import { getChapter, resolvePassage, searchWords, __setClient } from "./bible";

function clienteFalso(resposta: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data: resposta, error: null });
  return { rpc, _rpc: rpc } as never;
}

describe("getChapter", () => {
  it("traduz as colunas do banco para o formato das telas", async () => {
    __setClient(
      clienteFalso([
        { verse_id: 7, chapter: 3, verse: 16, verse_text: "Porque Deus amou", words_of_christ: true },
      ]),
    );
    const versos = await getChapter("John", 3);
    expect(versos).toEqual([
      { id: 7, chapter: 3, verse: 16, text: "Porque Deus amou", wordsOfChrist: true },
    ]);
  });

  it("devolve lista vazia quando o capítulo não tem nada", async () => {
    __setClient(clienteFalso([]));
    expect(await getChapter("John", 3)).toEqual([]);
  });
});

describe("resolvePassage", () => {
  it("junta os versículos do intervalo num texto só", async () => {
    __setClient(
      clienteFalso([
        { verse_id: 1, verse_text: "Não estejais inquietos" },
        { verse_id: 2, verse_text: "E a paz de Deus" },
      ]),
    );
    const texto = await resolvePassage({
      osis: "Phil", book: "Filipenses", chapter: 4, verseStart: 6, verseEnd: 7,
    });
    expect(texto).toBe("Não estejais inquietos E a paz de Deus");
  });

  it("devolve null para referência que não existe — é o que descarta a citação inventada", async () => {
    __setClient(clienteFalso([]));
    const texto = await resolvePassage({
      osis: "Ps", book: "Salmos", chapter: 151, verseStart: 2,
    });
    expect(texto).toBeNull();
  });
});

describe("searchWords", () => {
  it("não vai ao banco com busca curta demais", async () => {
    const c = clienteFalso([]);
    __setClient(c);
    expect(await searchWords("a")).toEqual([]);
    expect((c as unknown as { _rpc: { mock: { calls: unknown[] } } })._rpc.mock.calls).toHaveLength(0);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run lib/data/bible.test.ts`
Esperado: FALHA com "Cannot find module './bible'".

- [ ] **Passo 3: implementar**

```ts
// lib/supabase/client.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | undefined;

/** Cliente de navegador. Só chave publicável — RLS faz a segurança. */
export function supabaseBrowser(): SupabaseClient {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !chave) {
      throw new Error(
        "faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY",
      );
    }
    cliente = createClient(url, chave, { auth: { persistSession: true } });
  }
  return cliente;
}
```

```ts
// lib/data/bible.ts
/**
 * A única porta de leitura da Escritura.
 *
 * Nenhuma tela fala com o Supabase direto: assim a tradução entre o formato
 * do banco e o das telas existe num lugar só, e o cache offline do Ciclo
 * seguinte entra aqui sem tocar em componente nenhum.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Reference } from "@/lib/bible/reference";

export const TRANSLATION_SLUG =
  process.env.NEXT_PUBLIC_VERBO_TRANSLATION ?? "arc1911";

let cliente: SupabaseClient | undefined;

/** Ponto de injeção para teste. Não usar em produção. */
export function __setClient(c: SupabaseClient): void {
  cliente = c;
}

function db(): SupabaseClient {
  return cliente ?? supabaseBrowser();
}

export interface Verse {
  id: number;
  chapter: number;
  verse: number;
  text: string;
  wordsOfChrist: boolean;
}

export interface SearchHit {
  verseId: number;
  osis: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export async function getChapter(
  osis: string,
  chapter: number,
): Promise<Verse[]> {
  const { data, error } = await db().rpc("resolve_passage", {
    p_translation: TRANSLATION_SLUG,
    p_osis: osis,
    p_chapter: chapter,
    p_verse_start: null,
    p_verse_end: null,
  });
  if (error) throw error;

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.verse_id as number,
    chapter: r.chapter as number,
    verse: r.verse as number,
    text: r.verse_text as string,
    wordsOfChrist: Boolean(r.words_of_christ),
  }));
}

export async function searchWords(
  query: string,
  limit = 25,
): Promise<SearchHit[]> {
  const termo = query.trim();
  if (termo.length < 2) return [];

  const { data, error } = await db().rpc("search_verses", {
    p_query: termo,
    p_translation: TRANSLATION_SLUG,
    p_limit: limit,
  });
  if (error) throw error;

  return (data ?? []).map((r: Record<string, unknown>) => ({
    verseId: r.verse_id as number,
    osis: r.book_osis as string,
    book: r.book_name as string,
    chapter: r.chapter as number,
    verse: r.verse as number,
    text: r.verse_text as string,
  }));
}

/**
 * Resolve uma referência em texto real. `null` significa que a referência não
 * existe — e é exatamente esse `null` que faz a citação inventada ser
 * descartada em vez de exibida.
 */
export async function resolvePassage(ref: Reference): Promise<string | null> {
  const { data, error } = await db().rpc("resolve_passage", {
    p_translation: TRANSLATION_SLUG,
    p_osis: ref.osis,
    p_chapter: ref.chapter,
    p_verse_start: ref.verseStart ?? null,
    p_verse_end: ref.verseEnd ?? null,
  });
  if (error) throw error;
  if (!data || data.length === 0) return null;

  return (data as Array<Record<string, unknown>>)
    .map((r) => r.verse_text as string)
    .join(" ");
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run lib/data/bible.test.ts`
Esperado: 5 testes passando.

- [ ] **Passo 5: ligar as telas — todas como componentes de cliente**

**O leitor e a home precisam deixar de ser Server Components.** Hoje eles são
`async` e leem a amostra no servidor. Se continuarem assim, buscam a
Escritura pelo servidor do Next — que **não existe** dentro de um app Android
empacotado, e é justamente a regra que o spec fixou na seção 3. Além disso
`supabaseBrowser()` cria o cliente com `persistSession: true`, que é errado
num contexto de servidor.

Regra para este passo: nenhuma tela lê dados no servidor. Cada uma leva
`"use client"` e busca em `useEffect`.

O que se perde: renderização no servidor das páginas de capítulo, e com ela o
SEO de buscas como «João 3:16». Isso é real e vale tráfego orgânico — mas a
recuperação é aditiva e vem depois: uma rota server-rendered separada, só
para leitura pública, que fica fora do build do Capacitor. Não tente resolver
agora, e não deixe a leitura no servidor "só por enquanto": o Ciclo 6 herdaria
o problema.

As quatro mudanças:

- `app/biblia/[osis]/[chapter]/page.tsx`: passa a `"use client"`. `params`
  vira `useParams()` em vez de `await params`. `sampleChapter(...)` →
  `getChapter(book.osis, chapter)` num `useEffect`, com três estados de tela:
  carregando, vazio e com versículos. O estado vazio agora significa
  «capítulo inexistente nesta tradução», não «fora da amostra» — ajustar o
  texto para «Este capítulo não foi encontrado nesta tradução.»
- `app/page.tsx`: passa a `"use client"`. `sampleVerse("Ps", 23, 1)` →
  `getChapter("Ps", 23)` num `useEffect`, usando o primeiro versículo. O
  índice dos 66 livros **continua estático**, vindo de `lib/bible/canon.ts` —
  ele não precisa de banco e não deve esperar rede para aparecer.
- `app/buscar/page.tsx`: já é `"use client"`. `sampleSearch(trimmed)` →
  `searchWords(trimmed)` num `useEffect` com estado de carregamento e
  cancelamento (`AbortController` ou uma flag `cancelado`, para a resposta de
  uma busca antiga não sobrescrever a nova). Manter o caminho do parser de
  referência **antes** da busca: ele não vai ao banco e responde instantâneo.
- `app/perguntar/page.tsx`: já é `"use client"`. `sampleResolve(reference)` →
  `await resolvePassage(reference)`, com `Promise.all` sobre as referências
  extraídas. A lógica de descarte não muda em nada — só a fonte que responde
  «esse versículo não existe» passa a ser o Postgres.

- [ ] **Passo 6: verificar no navegador**

```bash
npm run build && npx next start -p 3210
npm run verify:ui
```

Esperado: as 16 verificações passando, com o mesmo comportamento de descarte
— agora conferido contra o banco.

- [ ] **Passo 7: commit**

```bash
git add lib/supabase/client.ts lib/data/bible.ts lib/data/bible.test.ts app/
git commit -m "Serve a Escritura do Postgres em vez da amostra"
```

---

## Tarefa 8: Apagar a amostra e fechar o portão

O passo que torna o Ciclo 1 verdadeiro. Enquanto a amostra existir, o VERBO
pode subir exibindo texto que ninguém conferiu.

**Arquivos:**
- Apagar: `lib/bible/sample.ts`
- Modificar: `.env`, `README.md`, `scripts/verify-ui.mjs`

**Interfaces:**
- Nenhuma. Esta tarefa só remove.

- [ ] **Passo 1: confirmar que ninguém mais usa a amostra**

```bash
grep -rn "sample" app components lib scripts --include="*.ts" --include="*.tsx" --include="*.mjs"
```

Esperado: nenhuma linha fora de `lib/bible/sample.ts`. Se aparecer alguma, a
Tarefa 7 não terminou.

- [ ] **Passo 2: apagar**

```bash
git rm lib/bible/sample.ts
```

- [ ] **Passo 3: fechar o portão**

Apagar do `.env` as duas linhas `VERBO_ALLOW_SAMPLE=1` e
`NEXT_PUBLIC_VERBO_ALLOW_SAMPLE=1`, e o comentário que as explica. No lugar,
declarar a tradução:

```
NEXT_PUBLIC_VERBO_TRANSLATION=arc1911
```

- [ ] **Passo 4: atualizar o README**

Na tabela de estado, trocar a linha do texto bíblico por «tradução importada
e validada». Apagar a seção «Duas pendências que bloqueiam lançamento» —
sobra uma, a Edge Function.

- [ ] **Passo 5: verificar que tudo passa sem a amostra**

```bash
npm test
npm run build
npm run verify:schema
npm run build && npx next start -p 3210 & npm run verify:ui
```

Esperado: os quatro verdes. O build agora passa **sem** nenhuma válvula de
escape, o que é a prova de que o portão fechou.

- [ ] **Passo 6: commit**

```bash
git add -A
git commit -m "Apaga a amostra de desenvolvimento e fecha o portão de lançamento"
```

---

## Fora deste plano, registrado para não perder

Achados de medição que pertencem a ciclos seguintes.

**`halfvec` (float16) nos embeddings — Ciclo 4.** Medido numa base de 15.774
chunks: o índice HNSW cai de 61 MB para 18 MB e o heap de 23 MB para 12 MB.
Mas o custo de recall **não pôde ser medido** com vetores sintéticos: em 384
dimensões vetores aleatórios são quase todos ortogonais, as distâncias se
concentram numa faixa estreita, e qualquer perda de precisão reembaralha o
ranking. O teste de 1/10 acerto que obtivemos é artefato disso, não
evidência contra `halfvec`. Decidir **depois** que existirem embeddings reais
do gte-small, com este teste: gerar os dois índices, tirar 200 perguntas de
amostra, e comparar a sobreposição do top-10 de cada um contra a busca exata
em float32. Aceitar `halfvec` se a sobreposição ficar acima de 9/10.

**HNSW incha ao atualizar em massa — Ciclo 4.** O índice float32 passou de
31 MB para 61 MB depois de um `UPDATE` que reescreveu todas as linhas. O
caminho de migração de modelo do spec (regerar os ~13 mil embeddings)
precisa terminar com `reindex index verse_chunks_embedding_idx`, senão o
índice fica com o dobro do tamanho.

**Construir o índice HNSW antes dos dados está correto — encerrado.** Medido:
o índice povoado insert por insert devolve os mesmos 10 de 10 vizinhos que a
busca exata. Não mover a criação do índice para depois da carga.

**Orçamento de armazenamento.** Uma tradução com chunks e embeddings ocupa
~91 MB: 24 MB em `bible_verses` e 67 MB em `verse_chunks`, dos quais 31 MB
são o índice HNSW. O free tier da Supabase são 500 MB. Cabem duas ou três
traduções com folga, não cinco. Se o VERBO for licenciar ARA ou NVI, isso
entra na conta antes.

**`verse_chunks.content` são 8,4 MB que nenhuma consulta lê.** Fica de
propósito: é o que permite regerar embeddings sem refazer o join com os
versículos, e 8 MB é barato demais para justificar perder isso.

**Cache semântico — Ciclo 5.** `ai_answer_cache` hoje casa por hash da
pergunta normalizada, então «o que a Bíblia diz sobre ansiedade» e «o que a
Bíblia fala sobre ansiedade» são duas chamadas pagas. Como o gte-small é
gratuito, procurar no cache por similaridade de embedding antes de chamar o
Gemini custa quase nada e deve aumentar muito o aproveitamento. Medir a taxa
de acerto no beta antes de construir.
