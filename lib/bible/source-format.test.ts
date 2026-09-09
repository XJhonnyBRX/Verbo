import { describe, expect, it } from "vitest";
import { parseSourceBible } from "./source-format";

const valido = {
  translation: {
    slug: "blivre",
    name: "A Bíblia Livre",
    abbrev: "BLIVRE",
    license: "Creative Commons Atribuição 3.0 Brasil (CC BY 3.0 BR)",
  },
  verses: [
    { osis: "Gen", c: 1, v: 1, t: "No princípio criou Deus os céus e a terra." },
    { osis: "John", c: 3, v: 16, t: "Porque Deus amou o mundo.", woc: true },
  ],
};

describe("parseSourceBible", () => {
  it("aceita um documento bem formado", () => {
    const b = parseSourceBible(structuredClone(valido));
    expect(b.translation.slug).toBe("blivre");
    expect(b.verses).toHaveLength(2);
    expect(b.verses[1].woc).toBe(true);
  });

  it("não marca woc quando não foi declarado", () => {
    const b = parseSourceBible(structuredClone(valido));
    expect(b.verses[0].woc).toBeUndefined();
  });

  it("apara espaço nas pontas do texto", () => {
    const comEspaco = structuredClone(valido);
    comEspaco.verses[0].t = "  No princípio  ";
    expect(parseSourceBible(comEspaco).verses[0].t).toBe("No princípio");
  });

  it("exige licença declarada", () => {
    const semLicenca = structuredClone(valido);
    // @ts-expect-error remoção intencional para o teste
    delete semLicenca.translation.license;
    expect(() => parseSourceBible(semLicenca)).toThrow(/licen/i);
  });

  it("recusa slug fora do formato que o banco aceita", () => {
    const ruim = structuredClone(valido);
    ruim.translation.slug = "BLIVRE 3.0";
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

  it("recusa capítulo ou versículo zero", () => {
    const capZero = structuredClone(valido);
    capZero.verses[0].c = 0;
    expect(() => parseSourceBible(capZero)).toThrow(/cap[íi]tulo/i);

    const versZero = structuredClone(valido);
    versZero.verses[0].v = 0;
    expect(() => parseSourceBible(versZero)).toThrow(/vers[íi]culo/i);
  });

  it("recusa versículo com texto vazio ou só espaço", () => {
    const vazio = structuredClone(valido);
    vazio.verses[0].t = "   ";
    expect(() => parseSourceBible(vazio)).toThrow(/vazio|branco/i);
  });

  it("recusa versículo repetido", () => {
    const ruim = structuredClone(valido);
    ruim.verses.push(structuredClone(ruim.verses[0]));
    expect(() => parseSourceBible(ruim)).toThrow(/repetid|duplicad/i);
  });

  it("recusa documento sem versículo nenhum", () => {
    expect(() =>
      parseSourceBible({ ...structuredClone(valido), verses: [] }),
    ).toThrow(/vazio/i);
  });

  it("recusa entrada que não é objeto", () => {
    for (const lixo of [null, undefined, 42, "texto", []]) {
      expect(() => parseSourceBible(lixo)).toThrow();
    }
  });

  it("a mensagem de erro diz ONDE está o problema", () => {
    // Sem isso, importar 31 mil versículos e falhar num deles é inútil.
    const ruim = structuredClone(valido);
    ruim.verses[1].t = "";
    expect(() => parseSourceBible(ruim)).toThrow(/João 3:16/);
  });
});
