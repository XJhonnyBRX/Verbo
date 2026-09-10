import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adapt, TRANSLATION } from "./adapt-blivre";

const bruto = readFileSync(
  path.join(import.meta.dirname, "fixtures/blivre-amostra.json"),
  "utf8",
);

const bible = adapt(bruto);
const acha = (osis: string, c: number, v: number) =>
  bible.verses.find((x) => x.osis === osis && x.c === c && x.v === v);

describe("adapt-blivre — metadados da tradução", () => {
  it("declara licença e procedência", () => {
    expect(TRANSLATION.slug).toBe("blivre");
    expect(TRANSLATION.license).toMatch(/Creative Commons/i);
    expect(TRANSLATION.licenseUrl).toMatch(/^https:\/\//);
    expect(TRANSLATION.sourceUrl).toMatch(/^https:\/\//);
  });

  it("credita os autores, porque CC BY faz disso condição da licença", () => {
    expect(TRANSLATION.license).toMatch(/Diego Santos/);
    expect(TRANSLATION.license).toMatch(/Mario Sérgio/);
    expect(TRANSLATION.license).toMatch(/Marco Teles/);
  });
});

describe("adapt-blivre — mapeamento de livros", () => {
  it("converte as abreviações da fonte em códigos OSIS", () => {
    const osis = new Set(bible.verses.map((v) => v.osis));
    expect(osis).toEqual(new Set(["Gen", "Job", "John", "1Cor", "Phlm"]));
  });

  it("distingue Jó de João, que só diferem pelo acento", () => {
    // Se o mapeamento confundisse os dois, estes textos trocariam de lugar.
    expect(acha("Job", 1, 1)?.t).toMatch(/Uz/);
    // Esta tradução verte Logos como "a Palavra", não "o Verbo".
    expect(acha("John", 1, 1)?.t).toBe(
      "No princípio era a Palavra, e a Palavra estava junto de Deus, e a Palavra era Deus.",
    );
  });

  it("numera capítulos e versículos pela posição no array", () => {
    // João no recorte tem os capítulos 1 e 3, nessa ordem.
    expect(acha("John", 1, 1)).toBeDefined();
    expect(acha("John", 2, 1)).toBeDefined();
    expect(bible.verses.filter((v) => v.osis === "John" && v.c === 1)).toHaveLength(51);
  });

  it("lida com livro de capítulo único", () => {
    const fm = bible.verses.filter((v) => v.osis === "Phlm");
    expect(fm).toHaveLength(25);
    expect(fm.every((v) => v.c === 1)).toBe(true);
  });

  it("falha alto em abreviação que não conhece", () => {
    const ruim = JSON.stringify([
      { abbrev: "Enoque", name: "Enoque", chapters: [["texto"]] },
    ]);
    expect(() => adapt(ruim)).toThrow(/Enoque/);
  });

  it("falha quando o JSON não tem a forma esperada", () => {
    expect(() => adapt("{}")).toThrow();
    expect(() => adapt("[{}]")).toThrow();
    expect(() => adapt("não é json")).toThrow();
  });
});

describe("adapt-blivre — normalização do texto", () => {
  it("preserva acentuação e pontuação do original", () => {
    expect(acha("Gen", 1, 1)?.t).toBe(
      "No princípio criou Deus os céus e a terra.",
    );
  });

  it("apara espaço nas pontas — 177 dos 178 versículos da amostra têm", () => {
    for (const v of bible.verses) {
      expect(v.t, `${v.osis} ${v.c}:${v.v}`).toBe(v.t.trim());
    }
  });

  it("não deixa espaço duplo", () => {
    for (const v of bible.verses) {
      expect(v.t, `${v.osis} ${v.c}:${v.v}`).not.toMatch(/ {2}/);
    }
  });

  it("remove o espaço antes da pontuação", () => {
    // A conversão da fonte deixou 881 casos como "unigênito , para que".
    for (const v of bible.verses) {
      expect(v.t, `${v.osis} ${v.c}:${v.v}`).not.toMatch(/\s[,.;:!?]/);
    }
  });

  it("corrige os casos concretos que existem nesta amostra", () => {
    // João 1:18 vem da fonte como "o unigênito Deus  , que está" —
    // espaço duplo E espaço antes da vírgula, no mesmo lugar.
    expect(acha("John", 1, 18)?.t).toMatch(/unigênito Deus, que/);
    expect(acha("John", 1, 18)?.t).not.toMatch(/Deus {2}|Deus ,/);

    // João 1:21: "Eles disseram : Tu és"
    expect(acha("John", 1, 21)?.t).toMatch(/disseram: Tu és/);
  });

  it("não deixa marcação da fonte vazar", () => {
    for (const v of bible.verses) {
      expect(v.t).not.toMatch(/<[^>]+>|\[\d+\]|\{|\}|\\/);
    }
  });

  it("usa forma unicode composta (NFC)", () => {
    for (const v of bible.verses) {
      expect(v.t).toBe(v.t.normalize("NFC"));
    }
  });
});

describe("adapt-blivre — contrato com o importador", () => {
  it("devolve um documento que parseSourceBible já aprovou", () => {
    // adapt() termina chamando parseSourceBible, então chegar aqui com
    // 178 versículos significa que passou por toda a validação de forma.
    expect(bible.verses).toHaveLength(178);
    expect(bible.translation.license).not.toBe("");
  });

  it("não marca fala de Cristo, porque a fonte não traz esse dado", () => {
    // Registrado como comportamento esperado, não como esquecimento.
    expect(bible.verses.every((v) => v.woc === undefined)).toBe(true);
  });
});
