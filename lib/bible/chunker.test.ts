import { describe, expect, it } from "vitest";
import { buildChunks, type ChunkInput } from "./chunker";

/** Um capítulo sintético com N versículos numerados. */
function capitulo(osis: string, c: number, n: number): ChunkInput[] {
  return Array.from({ length: n }, (_, i) => ({
    osis,
    chapter: c,
    verse: i + 1,
    text: `v${i + 1}`,
  }));
}

describe("buildChunks — janelas com sobreposição", () => {
  it("agrupa 3 versículos por janela, com passo 2", () => {
    const chunks = buildChunks(capitulo("John", 3, 7));
    expect(chunks.map((c) => [c.verseStart, c.verseEnd])).toEqual([
      [1, 3],
      [3, 5],
      [5, 7],
    ]);
  });

  it("a sobreposição é o ponto: versículos aparecem em duas janelas", () => {
    const chunks = buildChunks(capitulo("John", 3, 7));
    // O versículo 3 fecha a primeira janela e abre a segunda. Sem isso, uma
    // frase que atravessa a fronteira ficaria partida em todas as janelas.
    const contendoV3 = chunks.filter(
      (c) => c.verseStart <= 3 && c.verseEnd >= 3,
    );
    expect(contendoV3).toHaveLength(2);
  });

  it("junta o texto dos versículos da janela", () => {
    const chunks = buildChunks(capitulo("John", 3, 5));
    expect(chunks[0].content).toBe("v1 v2 v3");
    expect(chunks[1].content).toBe("v3 v4 v5");
  });

  it("não deixa versículo de fora no fim do capítulo", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 25, 176]) {
      const chunks = buildChunks(capitulo("Ps", 119, n));
      const cobertos = new Set<number>();
      for (const c of chunks) {
        for (let v = c.verseStart; v <= c.verseEnd; v++) cobertos.add(v);
      }
      expect(cobertos.size, `capítulo com ${n} versículos`).toBe(n);
    }
  });

  it("capítulo de um versículo vira uma janela de um", () => {
    const chunks = buildChunks(capitulo("Obad", 1, 1));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ verseStart: 1, verseEnd: 1 });
  });

  it("capítulo de dois versículos vira uma janela só", () => {
    const chunks = buildChunks(capitulo("Ps", 117, 2));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ verseStart: 1, verseEnd: 2 });
  });

  it("nunca atravessa a fronteira de capítulo", () => {
    const entrada = [...capitulo("John", 3, 4), ...capitulo("John", 4, 4)];
    const chunks = buildChunks(entrada);
    for (const c of chunks) {
      expect(c.chapter === 3 || c.chapter === 4).toBe(true);
    }
    expect(chunks.filter((c) => c.chapter === 3).length).toBeGreaterThan(0);
    expect(chunks.filter((c) => c.chapter === 4).length).toBeGreaterThan(0);
  });

  it("nunca atravessa a fronteira de livro", () => {
    const entrada = [...capitulo("Jude", 1, 4), ...capitulo("Rev", 1, 4)];
    const chunks = buildChunks(entrada);
    expect(new Set(chunks.map((c) => c.osis))).toEqual(new Set(["Jude", "Rev"]));
  });

  it("aceita janela e passo configuráveis", () => {
    const chunks = buildChunks(capitulo("Ps", 1, 6), { janela: 2, passo: 2 });
    expect(chunks.map((c) => [c.verseStart, c.verseEnd])).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it("recusa configuração que deixaria buraco", () => {
    // Passo maior que a janela pularia versículos sem ninguém perceber.
    expect(() => buildChunks(capitulo("Ps", 1, 6), { janela: 2, passo: 3 })).toThrow(
      /passo/i,
    );
  });

  it("lida com versículos fora de ordem na entrada", () => {
    const desordenado = [
      { osis: "John", chapter: 3, verse: 3, text: "v3" },
      { osis: "John", chapter: 3, verse: 1, text: "v1" },
      { osis: "John", chapter: 3, verse: 2, text: "v2" },
    ];
    const chunks = buildChunks(desordenado);
    expect(chunks[0].content).toBe("v1 v2 v3");
  });

  it("devolve lista vazia para entrada vazia", () => {
    expect(buildChunks([])).toEqual([]);
  });
});
