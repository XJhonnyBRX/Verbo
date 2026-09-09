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
    translation: { slug: "t", name: "T", abbrev: "T", license: "cc" },
    verses,
  };
}

describe("validateImport", () => {
  it("aprova uma importação completa", () => {
    expect(validateImport(biblicaCompleta())).toEqual([]);
  });

  it("a Bíblia completa tem os 31.102 versículos", () => {
    // Garante que o gerador do teste não está enganando o validador.
    expect(biblicaCompleta().verses).toHaveLength(31102);
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
    // João 3 tem 36 versículos nesta tradução; tiramos o último.
    b.verses = b.verses.filter(
      (v) => !(v.osis === "John" && v.c === 3 && v.v === 36),
    );
    const p = validateImport(b);
    expect(p).toHaveLength(1);
    expect(p[0].kind).toBe("contagem-divergente");
    expect(p[0].detail).toMatch(/35.*36/);
  });

  it("acusa lacuna no meio da numeração mesmo com a contagem fechando", () => {
    const b = biblicaCompleta();
    // Tira o 10 e devolve um 37 no fim: a contagem fecha, a numeração não.
    b.verses = b.verses.filter(
      (v) => !(v.osis === "John" && v.c === 3 && v.v === 10),
    );
    b.verses.push({ osis: "John", c: 3, v: 37, t: "extra" });
    const p = validateImport(b);
    expect(p.some((x) => x.kind === "lacuna")).toBe(true);
    expect(p.find((x) => x.kind === "lacuna")?.detail).toMatch(/10/);
  });

  it("acusa TODOS os problemas, não só o primeiro", () => {
    const b = biblicaCompleta();
    b.verses = b.verses.filter(
      (v) => v.osis !== "Obad" && v.osis !== "Phlm",
    );
    expect(validateImport(b)).toHaveLength(2);
  });

  it("acusa arquivo truncado com muitos problemas de uma vez", () => {
    // Simula o caso real: só o Antigo Testamento importou.
    const b = biblicaCompleta();
    b.verses = b.verses.filter((v) => {
      const livro = BOOKS.find((x) => x.osis === v.osis);
      return livro?.testament === "AT";
    });
    const p = validateImport(b);
    expect(p.filter((x) => x.kind === "livro-faltando")).toHaveLength(27);
  });

  it("não acusa nada por causa das variantes de versificação", () => {
    // Salmos 46 com 10 e Apocalipse 12 com 18 são o esperado NESTA tradução.
    const b = biblicaCompleta();
    const sl46 = b.verses.filter((v) => v.osis === "Ps" && v.c === 46);
    const ap12 = b.verses.filter((v) => v.osis === "Rev" && v.c === 12);
    expect(sl46).toHaveLength(10);
    expect(ap12).toHaveLength(18);
    expect(validateImport(b)).toEqual([]);
  });
});
