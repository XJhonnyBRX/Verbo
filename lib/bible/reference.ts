/**
 * Parser de referências bíblicas em português.
 *
 * Esta é a peça mais crítica do VERBO. A regra de ouro — a IA nunca é a fonte
 * da Escritura — depende dela: é este parser que extrai as citações da resposta
 * gerada para que cada uma seja conferida contra o banco. Um falso negativo
 * aqui descarta uma citação legítima; um falso positivo deixa passar uma
 * inventada.
 *
 * Funções puras. Sem banco, sem rede, sem IA.
 */

import { BOOKS, AMBIGUITY_PREFERENCE, type Book } from "./canon";

export interface Reference {
  osis: string;
  /** Nome canônico do livro, em português. */
  book: string;
  chapter: number;
  /** Ausente quando a referência é de capítulo inteiro ("Salmos 23"). */
  verseStart?: number;
  /** Presente só em intervalos ("1Co 13:4-7"). */
  verseEnd?: number;
}

/** Remove acentos e caixa. "Jó" e "João" colidem aqui — é o ponto. */
function fold(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Chaves aceitas para um livro, com acento preservado. */
function accentedKeys(book: Book): string[] {
  return [book.name.toLowerCase(), ...book.aliases.map((a) => a.toLowerCase())];
}

const FOLDED_INDEX = new Map<string, Book[]>();
for (const book of BOOKS) {
  for (const key of accentedKeys(book)) {
    const folded = fold(key).replace(/\s+/g, " ").trim();
    const bucket = FOLDED_INDEX.get(folded);
    if (bucket) {
      if (!bucket.includes(book)) bucket.push(book);
    } else {
      FOLDED_INDEX.set(folded, [book]);
    }
  }
}

/**
 * Resolve o nome do livro, desempatando colisões de acento.
 *
 * Ordem de decisão:
 *   1. Candidatos por nome sem acento (superconjunto).
 *   2. Se mais de um, descarta os em que o capítulo pedido não existe —
 *      "jo 42" só pode ser Jó, porque João tem 21 capítulos.
 *   3. Se ainda mais de um, vale quem casa com o acento exato que foi digitado.
 *   4. Último recurso: a preferência declarada no canon.
 */
function resolveBook(token: string, chapter?: number): Book | null {
  const normalized = token.replace(/\.$/, "").replace(/\s+/g, " ").trim();
  const candidates = FOLDED_INDEX.get(fold(normalized));
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  let pool = candidates;

  if (chapter !== undefined) {
    const inRange = pool.filter((b) => chapter >= 1 && chapter <= b.chapters);
    if (inRange.length === 1) return inRange[0];
    if (inRange.length > 1) pool = inRange;
  }

  const exact = pool.filter((b) =>
    accentedKeys(b).includes(normalized.toLowerCase()),
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) pool = exact;

  const preferred = AMBIGUITY_PREFERENCE[fold(normalized)];
  if (preferred) {
    const match = pool.find((b) => b.osis === preferred);
    if (match) return match;
  }

  return pool[0];
}

/** Separa o token do livro da cauda numérica. */
const SHAPE = /^\s*([123])?\s*([^\d]+?)\s*(\d[\d\s:.\-–—]*)?$/u;

/** Capítulo, versículo e intervalo. Aceita ":", "." e espaço como separador. */
const TAIL = /^(\d{1,3})(?:\s*[:.]\s*|\s+)?(\d{1,3})?(?:\s*[-–—]\s*(\d{1,3}))?$/;

/**
 * Interpreta uma referência isolada. Devolve `null` se a entrada não é uma
 * referência válida — livro inexistente, capítulo fora da faixa, intervalo
 * invertido.
 *
 * Aceita: "João 3:16", "Jo 3.16", "jo3:16", "JOÃO 3 16", "1Co 13:4-7",
 * "1 Coríntios 13", "Salmos 23", "Sl 23", "Jd 3".
 */
export function parseReference(input: string): Reference | null {
  if (!input) return null;

  const shape = SHAPE.exec(input.trim());
  if (!shape) return null;

  const [, ordinal, letters, tail] = shape;
  if (!letters || !letters.trim()) return null;

  const token = `${ordinal ?? ""}${letters}`.trim();

  let first: number | undefined;
  let second: number | undefined;
  let rangeEnd: number | undefined;

  if (tail) {
    const nums = TAIL.exec(tail.trim());
    if (!nums) return null;
    first = Number(nums[1]);
    second = nums[2] ? Number(nums[2]) : undefined;
    rangeEnd = nums[3] ? Number(nums[3]) : undefined;
  }

  // O capítulo só serve para desempatar quando existe um segundo número;
  // "jo 42" tem um número só, e ele pode ser capítulo (Jó 42) ou nada.
  const book = resolveBook(token, first);
  if (!book) return null;
  if (first === undefined) return null;

  // Livro de um capítulo só: um número solto é VERSÍCULO, não capítulo.
  // "Judas 3" é Judas 1:3 — convenção de citação, não invenção nossa.
  if (book.chapters === 1 && second === undefined) {
    const verse = first;
    if (rangeEnd !== undefined && rangeEnd < verse) return null;
    return {
      osis: book.osis,
      book: book.name,
      chapter: 1,
      verseStart: verse,
      ...(rangeEnd !== undefined ? { verseEnd: rangeEnd } : {}),
    };
  }

  const chapter = first;
  if (chapter < 1 || chapter > book.chapters) return null;

  if (second !== undefined && second < 1) return null;
  if (rangeEnd !== undefined) {
    if (second === undefined) return null;
    if (rangeEnd < second) return null;
  }

  return {
    osis: book.osis,
    book: book.name,
    chapter,
    ...(second !== undefined ? { verseStart: second } : {}),
    ...(rangeEnd !== undefined ? { verseEnd: rangeEnd } : {}),
  };
}

/**
 * Varre um texto corrido e devolve toda referência encontrada — é assim que
 * as citações saem da resposta da IA para serem conferidas.
 *
 * Exige capítulo E versículo (com ":" ou "."), porque em prosa um número solto
 * depois de um nome de livro gera falso positivo demais. Livros de um capítulo
 * único são o caso especial tratado à parte.
 */
const IN_TEXT =
  /(?<![\p{L}\d])((?:[123]\s?)?\p{L}[\p{L}\p{M}]{1,24}\.?)\s*(\d{1,3})\s*[:.]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/gu;

const SINGLE_CHAPTER_IN_TEXT =
  /(?<![\p{L}\d])(obadias|ob|filemom|filemon|fm|flm|judas|jd|2\s?jo(?:ão|ao)?|3\s?jo(?:ão|ao)?)\.?\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?(?![\d:.])/giu;

/** O token nomeia um livro do canon? Distingue citação de prosa. */
export function isKnownBook(token: string): boolean {
  const normalized = token
    .replace(/\.$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return FOLDED_INDEX.has(fold(normalized));
}

export interface Extraction {
  /** Citações que resolveram contra o canon. */
  references: Reference[];
  /**
   * Citações que nomeiam um livro real mas apontam para um lugar que não
   * existe — "Salmos 151:2", "João 99:1". São estas que a IA inventou, e é
   * esta contagem que mede a credibilidade do VERBO.
   *
   * Texto que só se parece com referência ("Concílio 3:16") não entra aqui:
   * é prosa, não citação frustrada.
   */
  rejected: string[];
}

/**
 * Extrai as citações de um texto, separando o que tem lastro do que foi
 * inventado.
 *
 * As duas listas importam. Descartar em silêncio o que não resolveu — como
 * uma versão anterior desta função fazia — apaga exatamente o número que
 * precisa ser vigiado.
 */
export function extractCitations(text: string): Extraction {
  const references: Reference[] = [];
  const rejected: string[] = [];
  const seenRefs = new Set<string>();
  const seenRejects = new Set<string>();

  const consider = (bookToken: string, full: string) => {
    const ref = parseReference(full);
    if (ref) {
      const key = formatReference(ref);
      if (!seenRefs.has(key)) {
        seenRefs.add(key);
        references.push(ref);
      }
      return;
    }
    // Livro real, lugar inexistente: citação inventada.
    if (isKnownBook(bookToken)) {
      const label = full.replace(/\s+/g, " ").trim();
      if (!seenRejects.has(label)) {
        seenRejects.add(label);
        rejected.push(label);
      }
    }
  };

  for (const m of text.matchAll(IN_TEXT)) {
    const range = m[4] ? `-${m[4]}` : "";
    consider(m[1], `${m[1]} ${m[2]}:${m[3]}${range}`);
  }

  for (const m of text.matchAll(SINGLE_CHAPTER_IN_TEXT)) {
    const range = m[3] ? `-${m[3]}` : "";
    consider(m[1], `${m[1]} ${m[2]}${range}`);
  }

  return { references, rejected };
}

/** Atalho para quem só quer o que resolveu. */
export function findReferences(text: string): Reference[] {
  return extractCitations(text).references;
}

/** Forma canônica, para exibir e para deduplicar. */
export function formatReference(ref: Reference): string {
  const base = `${ref.book} ${ref.chapter}`;
  if (ref.verseStart === undefined) return base;
  if (ref.verseEnd !== undefined && ref.verseEnd !== ref.verseStart) {
    return `${base}:${ref.verseStart}-${ref.verseEnd}`;
  }
  return `${base}:${ref.verseStart}`;
}
