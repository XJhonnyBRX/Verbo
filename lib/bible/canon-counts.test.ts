import { describe, expect, it } from "vitest";
import { BOOKS, TOTAL_CHAPTERS } from "./canon";
import {
  expectedChapterCount,
  expectedVerseCount,
  TOTAL_VERSES,
  VERSE_COUNTS,
} from "./canon-counts";

describe("canon-counts — cobertura", () => {
  it("cobre todos os 66 livros do canon", () => {
    expect(Object.keys(VERSE_COUNTS)).toHaveLength(66);
    for (const b of BOOKS) {
      expect(VERSE_COUNTS[b.osis], `falta ${b.osis}`).toBeDefined();
    }
  });

  it("concorda com canon.ts no número de capítulos de cada livro", () => {
    // Se estes dois arquivos discordarem, um deles está errado e a validação
    // da importação passa a mentir.
    for (const b of BOOKS) {
      expect(expectedChapterCount(b.osis), b.name).toBe(b.chapters);
    }
  });

  it("soma 1.189 capítulos, como o canon", () => {
    const capitulos = Object.values(VERSE_COUNTS).reduce(
      (soma, caps) => soma + caps.length,
      0,
    );
    expect(capitulos).toBe(1189);
    expect(capitulos).toBe(TOTAL_CHAPTERS);
  });

  it("não tem capítulo com zero versículos", () => {
    for (const [osis, caps] of Object.entries(VERSE_COUNTS)) {
      caps.forEach((n, i) => {
        expect(n, `${osis} ${i + 1}`).toBeGreaterThan(0);
      });
    }
  });

  it("soma 31.102 versículos", () => {
    expect(TOTAL_VERSES).toBe(31102);
  });
});

describe("canon-counts — marcos conhecidos", () => {
  it("acerta os extremos dos Salmos", () => {
    expect(expectedVerseCount("Ps", 117)).toBe(2);
    expect(expectedVerseCount("Ps", 119)).toBe(176);
  });

  it("acerta capítulos muito citados", () => {
    expect(expectedVerseCount("Gen", 1)).toBe(31);
    expect(expectedVerseCount("John", 3)).toBe(36);
    expect(expectedVerseCount("1Cor", 13)).toBe(13);
    expect(expectedVerseCount("Rev", 22)).toBe(21);
  });

  it("acerta os livros de um capítulo só", () => {
    expect(expectedVerseCount("Obad", 1)).toBe(21);
    expect(expectedVerseCount("Phlm", 1)).toBe(25);
    expect(expectedVerseCount("Jude", 1)).toBe(25);
    expect(expectedVerseCount("2John", 1)).toBe(13);
    expect(expectedVerseCount("3John", 1)).toBe(14);
  });

  it("devolve undefined para o que não existe", () => {
    expect(expectedVerseCount("John", 99)).toBeUndefined();
    expect(expectedVerseCount("Enoch", 1)).toBeUndefined();
    expect(expectedChapterCount("Enoch")).toBeUndefined();
  });
});

describe("canon-counts — as variantes de versificação desta tradução", () => {
  /*
   * Estes quatro valores divergem da contagem "padrão" KJV, e é de propósito.
   * Foram conferidos versículo por versículo contra uma segunda tradução
   * independente e contra o texto. Estão aqui como teste para que uma
   * regeneração do arquivo não os mude em silêncio: se mudarem, ou a fonte
   * trocou ou o gerador quebrou, e nos dois casos alguém precisa olhar.
   */

  it("Salmos 46 tem 10 versículos, não 11 — funde 2 e 3", () => {
    expect(expectedVerseCount("Ps", 46)).toBe(10);
  });

  it("Apocalipse 12 tem 18, não 17 — 12:18 em vez de 13:1a", () => {
    expect(expectedVerseCount("Rev", 12)).toBe(18);
  });

  it("Romanos mantém a doxologia em 16, como o padrão", () => {
    expect(expectedVerseCount("Rom", 14)).toBe(23);
    expect(expectedVerseCount("Rom", 16)).toBe(27);
  });

  it("as duas variantes se cancelam e o total fecha no padrão", () => {
    // Salmos 46 perde um, Apocalipse 12 ganha um.
    const salmo46 = expectedVerseCount("Ps", 46);
    const apoc12 = expectedVerseCount("Rev", 12);
    expect(salmo46).toBeDefined();
    expect(apoc12).toBeDefined();
    expect(salmo46! + apoc12!).toBe(11 + 17);
    expect(TOTAL_VERSES).toBe(31102);
  });
});
