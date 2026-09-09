import { describe, expect, it } from "vitest";
import { BOOKS, TOTAL_CHAPTERS } from "./canon";
import {
  extractCitations,
  findReferences,
  formatReference,
  isKnownBook,
  parseReference,
} from "./reference";

describe("canon", () => {
  it("tem 66 livros na ordem canônica", () => {
    expect(BOOKS).toHaveLength(66);
    expect(BOOKS.map((b) => b.order)).toEqual(
      Array.from({ length: 66 }, (_, i) => i + 1),
    );
  });

  it("tem 39 livros no Antigo e 27 no Novo", () => {
    expect(BOOKS.filter((b) => b.testament === "AT")).toHaveLength(39);
    expect(BOOKS.filter((b) => b.testament === "NT")).toHaveLength(27);
  });

  it("soma 1189 capítulos", () => {
    expect(TOTAL_CHAPTERS).toBe(1189);
  });

  it("não repete código OSIS", () => {
    expect(new Set(BOOKS.map((b) => b.osis)).size).toBe(66);
  });
});

describe("parseReference — formas de entrada", () => {
  const cases: Array<[string, string]> = [
    ["João 3:16", "João 3:16"],
    ["Jo 3:16", "João 3:16"],
    ["jo 3.16", "João 3:16"],
    ["jo3:16", "João 3:16"],
    ["JOÃO 3 16", "João 3:16"],
    ["  joão   3 : 16  ", "João 3:16"],
    ["1 Coríntios 13", "1 Coríntios 13"],
    ["1Co 13:4-7", "1 Coríntios 13:4-7"],
    ["1co13.4-7", "1 Coríntios 13:4-7"],
    ["Salmos 23", "Salmos 23"],
    ["Sl 23", "Salmos 23"],
    ["sl119:105", "Salmos 119:105"],
    ["Ap 21:1-4", "Apocalipse 21:1-4"],
    ["Gn 1:1", "Gênesis 1:1"],
    ["genesis 1:1", "Gênesis 1:1"],
    ["Êx 20:3", "Êxodo 20:3"],
    ["ex 20:3", "Êxodo 20:3"],
    ["Fp 4:6-7", "Filipenses 4:6-7"],
    ["1Pe 5:7", "1 Pedro 5:7"],
    ["Cantares 8:7", "Cantares 8:7"],
    ["canticos 8:7", "Cantares 8:7"],
  ];

  it.each(cases)("%s → %s", (input, expected) => {
    const ref = parseReference(input);
    expect(ref).not.toBeNull();
    expect(formatReference(ref!)).toBe(expected);
  });
});

describe("parseReference — a colisão Jó / João", () => {
  it("'jo' sem acento é João, o mais citado", () => {
    expect(parseReference("jo 3:16")?.osis).toBe("John");
  });

  it("'jó' com acento é Jó", () => {
    expect(parseReference("jó 3:1")?.osis).toBe("Job");
  });

  it("'jo 42' é Jó, porque João não tem 42 capítulos", () => {
    const ref = parseReference("jo 42");
    expect(ref?.osis).toBe("Job");
    expect(ref?.chapter).toBe(42);
  });

  it("'jo 21' fica em João, que tem 21 capítulos", () => {
    expect(parseReference("jo 21")?.osis).toBe("John");
  });

  it("'jó 42:1' respeita o acento mesmo com capítulo válido nos dois", () => {
    expect(parseReference("jó 12:1")?.osis).toBe("Job");
    expect(parseReference("jo 12:1")?.osis).toBe("John");
  });

  it("não confunde os vizinhos de três letras", () => {
    expect(parseReference("jn 1:17")?.osis).toBe("Jonah");
    expect(parseReference("jl 2:28")?.osis).toBe("Joel");
    expect(parseReference("jd 3")?.osis).toBe("Jude");
    expect(parseReference("jr 29:11")?.osis).toBe("Jer");
    expect(parseReference("js 1:9")?.osis).toBe("Josh");
    expect(parseReference("jz 6:12")?.osis).toBe("Judg");
    expect(parseReference("1jo 4:8")?.osis).toBe("1John");
    expect(parseReference("2jo 1")?.osis).toBe("2John");
    expect(parseReference("3jo 4")?.osis).toBe("3John");
  });
});

describe("parseReference — livros de um capítulo só", () => {
  it("'Jd 3' é Judas 1:3, não capítulo 3", () => {
    const ref = parseReference("Jd 3");
    expect(ref).toMatchObject({ osis: "Jude", chapter: 1, verseStart: 3 });
  });

  it("'Filemom 6' é Filemom 1:6", () => {
    expect(parseReference("Filemom 6")).toMatchObject({
      osis: "Phlm",
      chapter: 1,
      verseStart: 6,
    });
  });

  it("'Obadias 1-4' é um intervalo de versículos", () => {
    expect(parseReference("Obadias 1-4")).toMatchObject({
      osis: "Obad",
      chapter: 1,
      verseStart: 1,
      verseEnd: 4,
    });
  });

  it("aceita a forma explícita com capítulo", () => {
    expect(parseReference("Jd 1:3")).toMatchObject({
      osis: "Jude",
      chapter: 1,
      verseStart: 3,
    });
  });
});

describe("parseReference — entradas inválidas", () => {
  const invalid = [
    "",
    "   ",
    "Nicodemos 3:16",
    "Livro de Mórmon 1:1",
    "João",
    "João 22:1",
    "João 0:1",
    "Salmos 151",
    "Ap 23:1",
    "Fp 4:7-6",
    "3:16",
    "abc",
  ];

  it.each(invalid)("rejeita %j", (input) => {
    expect(parseReference(input)).toBeNull();
  });
});

describe("findReferences — extração da resposta da IA", () => {
  it("acha as referências de uma resposta corrida", () => {
    const answer =
      "A Bíblia trata a ansiedade como algo a ser entregue. Paulo escreve em " +
      "Filipenses 4:6-7 que devemos apresentar nossas petições a Deus, e Pedro " +
      "reforça em 1 Pedro 5:7. Jesus já havia dito o mesmo em Mateus 6:25-34.";

    expect(findReferences(answer).map(formatReference)).toEqual([
      "Filipenses 4:6-7",
      "1 Pedro 5:7",
      "Mateus 6:25-34",
    ]);
  });

  it("descarta o que não é livro", () => {
    const text = "Como diz o Concílio 3:16 e a Suma 2:2, mas também João 1:1.";
    expect(findReferences(text).map(formatReference)).toEqual(["João 1:1"]);
  });

  it("não devolve como válida citação de capítulo inexistente", () => {
    // O ponto da regra de ouro: João não tem capítulo 99.
    expect(findReferences("Está escrito em João 99:1.")).toEqual([]);
  });

  it("não repete a mesma referência citada duas vezes", () => {
    const text = "Veja João 3:16. Como já foi dito, João 3:16 resume tudo.";
    expect(findReferences(text)).toHaveLength(1);
  });

  it("acha referência com abreviação e ponto", () => {
    expect(findReferences("cf. Rm 8:28 e Ef 2:8").map(formatReference)).toEqual([
      "Romanos 8:28",
      "Efésios 2:8",
    ]);
  });

  it("acha livro de capítulo único sem dois-pontos", () => {
    expect(findReferences("Como diz Judas 3, contendei pela fé.").map(formatReference)).toEqual([
      "Judas 1:3",
    ]);
  });
});

describe("extractCitations — a métrica de credibilidade", () => {
  it("separa o que tem lastro do que foi inventado", () => {
    const answer =
      "Paulo escreve em Filipenses 4:6-7 e Pedro reforça em 1 Pedro 5:7. " +
      "Salmos 151:2 reforça esse mesmo ponto.";

    const { references, rejected } = extractCitations(answer);

    expect(references.map(formatReference)).toEqual([
      "Filipenses 4:6-7",
      "1 Pedro 5:7",
    ]);
    expect(rejected).toEqual(["Salmos 151:2"]);
  });

  it("conta como inventada a citação de livro real em lugar inexistente", () => {
    expect(extractCitations("Está escrito em João 99:1.").rejected).toEqual([
      "João 99:1",
    ]);
    expect(extractCitations("Veja Ap 23:1 também.").rejected).toEqual([
      "Ap 23:1",
    ]);
  });

  it("NÃO conta prosa que só se parece com referência", () => {
    // "Concílio" e "Suma" não são livros: isso é texto, não citação frustrada.
    const { references, rejected } = extractCitations(
      "Como diz o Concílio 3:16 e a Suma 2:2, mas também João 1:1.",
    );
    expect(references.map(formatReference)).toEqual(["João 1:1"]);
    expect(rejected).toEqual([]);
  });

  it("não repete a mesma citação inventada", () => {
    const { rejected } = extractCitations(
      "Salmos 151:2 diz isso. E Salmos 151:2 confirma.",
    );
    expect(rejected).toEqual(["Salmos 151:2"]);
  });

  it("uma resposta sem nenhuma citação não gera rejeição", () => {
    const { references, rejected } = extractCitations(
      "A Bíblia fala muito sobre esse assunto ao longo de todo o texto.",
    );
    expect(references).toEqual([]);
    expect(rejected).toEqual([]);
  });
});

describe("isKnownBook", () => {
  it("reconhece nome, abreviação e forma sem acento", () => {
    for (const token of ["João", "jo", "Jó", "1Co", "salmos", "ap", "genesis"]) {
      expect(isKnownBook(token)).toBe(true);
    }
  });

  it("recusa o que não é livro", () => {
    for (const token of ["Concílio", "Suma", "Nicodemos", "Mórmon", "xyz"]) {
      expect(isKnownBook(token)).toBe(false);
    }
  });
});
