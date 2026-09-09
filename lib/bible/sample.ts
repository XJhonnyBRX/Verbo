/**
 * ⚠️  AMOSTRA DE DESENVOLVIMENTO — NÃO É TEXTO DE REFERÊNCIA
 *
 * Existe por um motivo só: dar conteúdo real às telas enquanto a tradução
 * definitiva não foi escolhida e verificada (Ciclo 1 do spec). Nenhuma linha
 * daqui passou por conferência de fonte, licença ou digitalização.
 *
 * Regras:
 *   - O slug é `amostra-dev`, nunca o de uma tradução de verdade.
 *   - `assertNotProduction()` roda antes de qualquer uso.
 *   - Este arquivo é APAGADO quando o importador de verdade entrar.
 *
 * Não copie versículo daqui para lugar nenhum.
 */

export const SAMPLE_TRANSLATION = {
  slug: "amostra-dev",
  name: "Amostra de desenvolvimento",
  abbrev: "AMOSTRA",
  license: "NÃO LICENCIADO — conteúdo descartável de desenvolvimento",
} as const;

/**
 * O guarda precisa valer nos DOIS lados. A amostra é lida tanto por Server
 * Components quanto por telas de cliente, e uma variável sem o prefixo
 * NEXT_PUBLIC_ não existe no bundle do navegador — o guarda dispararia lá
 * mesmo com a válvula aberta, e a exceção morreria dentro de um callback.
 */
export function assertNotProduction(): void {
  const allowed =
    process.env.NEXT_PUBLIC_VERBO_ALLOW_SAMPLE === "1" ||
    process.env.VERBO_ALLOW_SAMPLE === "1";

  if (process.env.NODE_ENV === "production" && !allowed) {
    throw new Error(
      "A amostra de desenvolvimento não pode ser usada em produção. " +
        "Importe uma tradução verificada antes de publicar (spec, seção 5).",
    );
  }
}

export interface SampleVerse {
  verse: number;
  text: string;
  wordsOfChrist?: boolean;
}

export interface SampleChapter {
  osis: string;
  book: string;
  chapter: number;
  verses: SampleVerse[];
}

export const SAMPLE_CHAPTERS: SampleChapter[] = [
  {
    osis: "John",
    book: "João",
    chapter: 3,
    verses: [
      { verse: 1, text: "E havia entre os fariseus um homem chamado Nicodemos, príncipe dos judeus." },
      { verse: 2, text: "Este foi de noite falar com Jesus e disse-lhe: Rabi, bem sabemos que és Mestre, vindo de Deus; porque ninguém pode fazer estes sinais que tu fazes, se Deus não for com ele." },
      { verse: 3, text: "Jesus respondeu e disse-lhe: Na verdade, na verdade te digo que aquele que não nascer de novo não pode ver o Reino de Deus.", wordsOfChrist: true },
      { verse: 4, text: "Disse-lhe Nicodemos: Como pode um homem nascer, sendo velho? Pode, porventura, tornar a entrar no ventre de sua mãe e nascer?" },
      { verse: 5, text: "Jesus respondeu: Na verdade, na verdade te digo que aquele que não nascer da água e do Espírito não pode entrar no Reino de Deus.", wordsOfChrist: true },
      { verse: 6, text: "O que é nascido da carne é carne, e o que é nascido do Espírito é espírito.", wordsOfChrist: true },
      { verse: 7, text: "Não te maravilhes de te haver dito: Necessário vos é nascer de novo.", wordsOfChrist: true },
      { verse: 8, text: "O vento assopra onde quer, e ouves a sua voz, mas não sabes de onde vem, nem para onde vai; assim é todo aquele que é nascido do Espírito.", wordsOfChrist: true },
      { verse: 16, text: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.", wordsOfChrist: true },
      { verse: 17, text: "Porque Deus enviou o seu Filho ao mundo não para que condenasse o mundo, mas para que o mundo fosse salvo por ele.", wordsOfChrist: true },
    ],
  },
  {
    osis: "Ps",
    book: "Salmos",
    chapter: 23,
    verses: [
      { verse: 1, text: "O Senhor é o meu pastor; nada me faltará." },
      { verse: 2, text: "Deitar-me faz em verdes pastos, guia-me mansamente a águas tranquilas." },
      { verse: 3, text: "Refrigera a minha alma; guia-me pelas veredas da justiça por amor do seu nome." },
      { verse: 4, text: "Ainda que eu andasse pelo vale da sombra da morte, não temeria mal algum, porque tu estás comigo; a tua vara e o teu cajado me consolam." },
      { verse: 5, text: "Preparas uma mesa perante mim na presença dos meus inimigos, unges a minha cabeça com óleo, o meu cálice transborda." },
      { verse: 6, text: "Certamente que a bondade e a misericórdia me seguirão todos os dias da minha vida; e habitarei na Casa do Senhor por longos dias." },
    ],
  },
  {
    osis: "Phil",
    book: "Filipenses",
    chapter: 4,
    verses: [
      { verse: 6, text: "Não estejais inquietos por coisa alguma; antes, as vossas petições sejam em tudo conhecidas diante de Deus, pela oração e súplica, com ação de graças." },
      { verse: 7, text: "E a paz de Deus, que excede todo o entendimento, guardará os vossos corações e os vossos sentimentos em Cristo Jesus." },
    ],
  },
  {
    osis: "1Pet",
    book: "1 Pedro",
    chapter: 5,
    verses: [
      { verse: 7, text: "Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós." },
    ],
  },
];

export function sampleChapter(osis: string, chapter: number): SampleChapter | undefined {
  assertNotProduction();
  return SAMPLE_CHAPTERS.find((c) => c.osis === osis && c.chapter === chapter);
}

export function sampleVerse(osis: string, chapter: number, verse: number): SampleVerse | undefined {
  return sampleChapter(osis, chapter)?.verses.find((v) => v.verse === verse);
}

/**
 * Resolve uma referência em texto real — o mesmo papel do resolve_passage no
 * Postgres. Devolve `null` quando a referência não existe, que é exatamente o
 * que faz uma citação inventada ser descartada.
 */
export function sampleResolve(ref: {
  osis: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}): string | null {
  const chapter = sampleChapter(ref.osis, ref.chapter);
  if (!chapter) return null;

  const from = ref.verseStart ?? 1;
  const to = ref.verseEnd ?? ref.verseStart ?? Infinity;

  const verses = chapter.verses.filter((v) => v.verse >= from && v.verse <= to);
  if (verses.length === 0) return null;

  return verses.map((v) => v.text).join(" ");
}

/** Busca por palavra na amostra — placeholder do search_verses do Postgres. */
export function sampleSearch(query: string, limit = 25) {
  assertNotProduction();
  const needle = query
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
  if (!needle) return [];

  const hits: Array<{ osis: string; book: string; chapter: number; verse: number; text: string }> = [];
  for (const ch of SAMPLE_CHAPTERS) {
    for (const v of ch.verses) {
      const haystack = v.text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      if (haystack.includes(needle)) {
        hits.push({ osis: ch.osis, book: ch.book, chapter: ch.chapter, verse: v.verse, text: v.text });
      }
    }
  }
  return hits.slice(0, limit);
}
