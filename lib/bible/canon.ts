/**
 * Canon protestante — 66 livros.
 *
 * Esta tabela é a fonte da verdade sobre o que existe. Ela alimenta:
 *   - a validação da importação (contagem de capítulos por livro),
 *   - o parser de referências,
 *   - a validação das citações da IA.
 *
 * `chapters` é a contagem da tradição Almeida / protestante brasileira.
 * Onde a numeração hebraica difere (Joel, Malaquias), vale a de Almeida.
 */

export type Testament = "AT" | "NT";

export interface Book {
  /** Código OSIS — estável entre traduções e idiomas. */
  osis: string;
  /** Nome canônico em português. */
  name: string;
  /** Abreviações e variantes aceitas na entrada do usuário. */
  aliases: string[];
  testament: Testament;
  /** Posição canônica, 1 a 66. */
  order: number;
  chapters: number;
}

export const BOOKS: Book[] = [
  // ---------------------------------------------------------------- Antigo
  { osis: "Gen", name: "Gênesis", aliases: ["gn", "gen", "genesis"], testament: "AT", order: 1, chapters: 50 },
  { osis: "Exod", name: "Êxodo", aliases: ["ex", "êx", "exo", "exodo"], testament: "AT", order: 2, chapters: 40 },
  { osis: "Lev", name: "Levítico", aliases: ["lv", "lev", "levitico"], testament: "AT", order: 3, chapters: 27 },
  { osis: "Num", name: "Números", aliases: ["nm", "num", "numeros"], testament: "AT", order: 4, chapters: 36 },
  { osis: "Deut", name: "Deuteronômio", aliases: ["dt", "deut", "deuteronomio"], testament: "AT", order: 5, chapters: 34 },
  { osis: "Josh", name: "Josué", aliases: ["js", "jos", "josue"], testament: "AT", order: 6, chapters: 24 },
  { osis: "Judg", name: "Juízes", aliases: ["jz", "juizes"], testament: "AT", order: 7, chapters: 21 },
  { osis: "Ruth", name: "Rute", aliases: ["rt", "rute"], testament: "AT", order: 8, chapters: 4 },
  { osis: "1Sam", name: "1 Samuel", aliases: ["1sm", "1sam", "1samuel"], testament: "AT", order: 9, chapters: 31 },
  { osis: "2Sam", name: "2 Samuel", aliases: ["2sm", "2sam", "2samuel"], testament: "AT", order: 10, chapters: 24 },
  { osis: "1Kgs", name: "1 Reis", aliases: ["1rs", "1re", "1reis"], testament: "AT", order: 11, chapters: 22 },
  { osis: "2Kgs", name: "2 Reis", aliases: ["2rs", "2re", "2reis"], testament: "AT", order: 12, chapters: 25 },
  { osis: "1Chr", name: "1 Crônicas", aliases: ["1cr", "1cronicas"], testament: "AT", order: 13, chapters: 29 },
  { osis: "2Chr", name: "2 Crônicas", aliases: ["2cr", "2cronicas"], testament: "AT", order: 14, chapters: 36 },
  { osis: "Ezra", name: "Esdras", aliases: ["ed", "esd", "esdras"], testament: "AT", order: 15, chapters: 10 },
  { osis: "Neh", name: "Neemias", aliases: ["ne", "nee", "neemias"], testament: "AT", order: 16, chapters: 13 },
  { osis: "Esth", name: "Ester", aliases: ["et", "est", "ester"], testament: "AT", order: 17, chapters: 10 },
  // "jo" sem acento NÃO é alias de Jó — é de João. Ver AMBIGUITY_PREFERENCE.
  { osis: "Job", name: "Jó", aliases: ["jó", "job"], testament: "AT", order: 18, chapters: 42 },
  { osis: "Ps", name: "Salmos", aliases: ["sl", "sal", "salmo", "salmos"], testament: "AT", order: 19, chapters: 150 },
  { osis: "Prov", name: "Provérbios", aliases: ["pv", "prov", "proverbios"], testament: "AT", order: 20, chapters: 31 },
  { osis: "Eccl", name: "Eclesiastes", aliases: ["ec", "ecl", "eclesiastes"], testament: "AT", order: 21, chapters: 12 },
  { osis: "Song", name: "Cantares", aliases: ["ct", "cant", "cantares", "canticos", "cânticos", "cantico dos canticos"], testament: "AT", order: 22, chapters: 8 },
  { osis: "Isa", name: "Isaías", aliases: ["is", "isa", "isaias"], testament: "AT", order: 23, chapters: 66 },
  { osis: "Jer", name: "Jeremias", aliases: ["jr", "jer", "jeremias"], testament: "AT", order: 24, chapters: 52 },
  { osis: "Lam", name: "Lamentações", aliases: ["lm", "lam", "lamentacoes"], testament: "AT", order: 25, chapters: 5 },
  { osis: "Ezek", name: "Ezequiel", aliases: ["ez", "eze", "ezequiel"], testament: "AT", order: 26, chapters: 48 },
  { osis: "Dan", name: "Daniel", aliases: ["dn", "dan", "daniel"], testament: "AT", order: 27, chapters: 12 },
  { osis: "Hos", name: "Oseias", aliases: ["os", "ose", "oseias", "oséias"], testament: "AT", order: 28, chapters: 14 },
  { osis: "Joel", name: "Joel", aliases: ["jl", "joe", "joel"], testament: "AT", order: 29, chapters: 3 },
  { osis: "Amos", name: "Amós", aliases: ["am", "amos", "amós"], testament: "AT", order: 30, chapters: 9 },
  { osis: "Obad", name: "Obadias", aliases: ["ob", "obd", "obadias"], testament: "AT", order: 31, chapters: 1 },
  { osis: "Jonah", name: "Jonas", aliases: ["jn", "jon", "jonas"], testament: "AT", order: 32, chapters: 4 },
  { osis: "Mic", name: "Miqueias", aliases: ["mq", "miq", "miqueias", "miquéias"], testament: "AT", order: 33, chapters: 7 },
  { osis: "Nah", name: "Naum", aliases: ["na", "nau", "naum"], testament: "AT", order: 34, chapters: 3 },
  { osis: "Hab", name: "Habacuque", aliases: ["hc", "hab", "habacuque"], testament: "AT", order: 35, chapters: 3 },
  { osis: "Zeph", name: "Sofonias", aliases: ["sf", "sof", "sofonias"], testament: "AT", order: 36, chapters: 3 },
  { osis: "Hag", name: "Ageu", aliases: ["ag", "age", "ageu"], testament: "AT", order: 37, chapters: 2 },
  { osis: "Zech", name: "Zacarias", aliases: ["zc", "zac", "zacarias"], testament: "AT", order: 38, chapters: 14 },
  { osis: "Mal", name: "Malaquias", aliases: ["ml", "mal", "malaquias"], testament: "AT", order: 39, chapters: 4 },

  // ------------------------------------------------------------------ Novo
  { osis: "Matt", name: "Mateus", aliases: ["mt", "mat", "mateus"], testament: "NT", order: 40, chapters: 28 },
  { osis: "Mark", name: "Marcos", aliases: ["mc", "mar", "marcos"], testament: "NT", order: 41, chapters: 16 },
  { osis: "Luke", name: "Lucas", aliases: ["lc", "luc", "lucas"], testament: "NT", order: 42, chapters: 24 },
  { osis: "John", name: "João", aliases: ["jo", "joao", "joão"], testament: "NT", order: 43, chapters: 21 },
  { osis: "Acts", name: "Atos", aliases: ["at", "ato", "atos", "atos dos apostolos"], testament: "NT", order: 44, chapters: 28 },
  { osis: "Rom", name: "Romanos", aliases: ["rm", "rom", "romanos"], testament: "NT", order: 45, chapters: 16 },
  { osis: "1Cor", name: "1 Coríntios", aliases: ["1co", "1cor", "1corintios"], testament: "NT", order: 46, chapters: 16 },
  { osis: "2Cor", name: "2 Coríntios", aliases: ["2co", "2cor", "2corintios"], testament: "NT", order: 47, chapters: 13 },
  { osis: "Gal", name: "Gálatas", aliases: ["gl", "gal", "galatas"], testament: "NT", order: 48, chapters: 6 },
  { osis: "Eph", name: "Efésios", aliases: ["ef", "efe", "efesios"], testament: "NT", order: 49, chapters: 6 },
  { osis: "Phil", name: "Filipenses", aliases: ["fp", "fil", "filipenses"], testament: "NT", order: 50, chapters: 4 },
  { osis: "Col", name: "Colossenses", aliases: ["cl", "col", "colossenses"], testament: "NT", order: 51, chapters: 4 },
  { osis: "1Thess", name: "1 Tessalonicenses", aliases: ["1ts", "1tes", "1tessalonicenses"], testament: "NT", order: 52, chapters: 5 },
  { osis: "2Thess", name: "2 Tessalonicenses", aliases: ["2ts", "2tes", "2tessalonicenses"], testament: "NT", order: 53, chapters: 3 },
  { osis: "1Tim", name: "1 Timóteo", aliases: ["1tm", "1tim", "1timoteo"], testament: "NT", order: 54, chapters: 6 },
  { osis: "2Tim", name: "2 Timóteo", aliases: ["2tm", "2tim", "2timoteo"], testament: "NT", order: 55, chapters: 4 },
  { osis: "Titus", name: "Tito", aliases: ["tt", "tit", "tito"], testament: "NT", order: 56, chapters: 3 },
  { osis: "Phlm", name: "Filemom", aliases: ["fm", "flm", "filemom", "filemon"], testament: "NT", order: 57, chapters: 1 },
  { osis: "Heb", name: "Hebreus", aliases: ["hb", "heb", "hebreus"], testament: "NT", order: 58, chapters: 13 },
  { osis: "Jas", name: "Tiago", aliases: ["tg", "tia", "tiago"], testament: "NT", order: 59, chapters: 5 },
  { osis: "1Pet", name: "1 Pedro", aliases: ["1pe", "1pd", "1pedro"], testament: "NT", order: 60, chapters: 5 },
  { osis: "2Pet", name: "2 Pedro", aliases: ["2pe", "2pd", "2pedro"], testament: "NT", order: 61, chapters: 3 },
  { osis: "1John", name: "1 João", aliases: ["1jo", "1joao", "1joão"], testament: "NT", order: 62, chapters: 5 },
  { osis: "2John", name: "2 João", aliases: ["2jo", "2joao", "2joão"], testament: "NT", order: 63, chapters: 1 },
  { osis: "3John", name: "3 João", aliases: ["3jo", "3joao", "3joão"], testament: "NT", order: 64, chapters: 1 },
  { osis: "Jude", name: "Judas", aliases: ["jd", "jud", "judas"], testament: "NT", order: 65, chapters: 1 },
  { osis: "Rev", name: "Apocalipse", aliases: ["ap", "apo", "apocalipse", "apc"], testament: "NT", order: 66, chapters: 22 },
];

/**
 * Desempate para abreviações que colidem quando o acento é removido.
 *
 * "Jó" e "João" viram ambos "jo" sem acento. Quem digita "jo 3:16" quase
 * sempre quer João; quem quer Jó costuma escrever o acento. Mas o número do
 * capítulo decide melhor que qualquer heurística: "jo 42" só pode ser Jó,
 * porque João tem 21 capítulos. Esta lista só é consultada quando o capítulo
 * não resolve a ambiguidade.
 */
export const AMBIGUITY_PREFERENCE: Record<string, string> = {
  jo: "John",
};

export const BY_OSIS = new Map(BOOKS.map((b) => [b.osis, b]));

export function bookByOsis(osis: string): Book | undefined {
  return BY_OSIS.get(osis);
}

export const OLD_TESTAMENT = BOOKS.filter((b) => b.testament === "AT");
export const NEW_TESTAMENT = BOOKS.filter((b) => b.testament === "NT");

/** Total de capítulos do canon — usado na validação da importação. */
export const TOTAL_CHAPTERS = BOOKS.reduce((sum, b) => sum + b.chapters, 0);
