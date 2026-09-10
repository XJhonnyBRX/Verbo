import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetClient,
  __setClient,
  getChapter,
  getTranslation,
  resolvePassage,
  searchWords,
} from "./bible";

/** Cliente falso: devolve o que o Postgres devolveria, sem rede. */
function clienteFalso(resposta: unknown, erro: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: resposta, error: erro });
  const single = vi.fn().mockResolvedValue({ data: resposta, error: erro });
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ single }),
    }),
  });
  return { rpc, from } as never;
}

beforeEach(() => __resetClient());

describe("getChapter", () => {
  it("traduz as colunas do banco para o formato das telas", async () => {
    __setClient(
      clienteFalso([
        {
          verse_id: 7,
          chapter: 3,
          verse: 16,
          verse_text: "Porque Deus amou ao mundo",
          words_of_christ: true,
        },
      ]),
    );
    expect(await getChapter("John", 3)).toEqual([
      {
        id: 7,
        chapter: 3,
        verse: 16,
        text: "Porque Deus amou ao mundo",
        wordsOfChrist: true,
      },
    ]);
  });

  it("devolve lista vazia quando o capítulo não existe", async () => {
    __setClient(clienteFalso([]));
    expect(await getChapter("John", 99)).toEqual([]);
  });

  it("propaga erro do banco em vez de fingir que deu certo", async () => {
    __setClient(clienteFalso(null, { message: "conexão recusada" }));
    await expect(getChapter("John", 3)).rejects.toThrow(/conexão recusada/);
  });
});

describe("resolvePassage — o lado do banco na regra de ouro", () => {
  it("junta os versículos do intervalo num texto só", async () => {
    __setClient(
      clienteFalso([
        { verse_id: 1, verse_text: "Não estejais ansiosos" },
        { verse_id: 2, verse_text: "E a paz de Deus" },
      ]),
    );
    expect(
      await resolvePassage({
        osis: "Phil",
        book: "Filipenses",
        chapter: 4,
        verseStart: 6,
        verseEnd: 7,
      }),
    ).toBe("Não estejais ansiosos E a paz de Deus");
  });

  it("devolve null para referência inexistente — é o que descarta a citação inventada", async () => {
    __setClient(clienteFalso([]));
    expect(
      await resolvePassage({
        osis: "Ps",
        book: "Salmos",
        chapter: 151,
        verseStart: 2,
      }),
    ).toBeNull();
  });

  it("resolve capítulo inteiro quando não há versículo na referência", async () => {
    const c = clienteFalso([{ verse_id: 1, verse_text: "texto" }]);
    __setClient(c);
    await resolvePassage({ osis: "Ps", book: "Salmos", chapter: 23 });
    const args = (c as unknown as { rpc: { mock: { calls: unknown[][] } } }).rpc
      .mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_verse_start).toBeNull();
    expect(args.p_verse_end).toBeNull();
  });
});

describe("searchWords", () => {
  it("não vai ao banco com busca curta demais", async () => {
    const c = clienteFalso([]);
    __setClient(c);
    expect(await searchWords("a")).toEqual([]);
    expect(await searchWords("  ")).toEqual([]);
    expect(
      (c as unknown as { rpc: { mock: { calls: unknown[] } } }).rpc.mock.calls,
    ).toHaveLength(0);
  });

  it("traduz o resultado para o formato das telas", async () => {
    __setClient(
      clienteFalso([
        {
          verse_id: 12,
          book_osis: "Ps",
          book_name: "Salmos",
          chapter: 42,
          verse: 7,
          verse_text: "Um abismo chama outro abismo",
        },
      ]),
    );
    expect(await searchWords("abismo")).toEqual([
      {
        verseId: 12,
        osis: "Ps",
        book: "Salmos",
        chapter: 42,
        verse: 7,
        text: "Um abismo chama outro abismo",
      },
    ]);
  });
});

describe("getTranslation — a atribuição é condição da licença", () => {
  it("busca licença e autores do banco, não de constante no código", async () => {
    __setClient(
      clienteFalso({
        slug: "blivre",
        name: "A Bíblia Livre",
        abbrev: "BLIVRE",
        license: "CC BY 3.0 BR — Diego Santos, Mario Sérgio e Marco Teles",
        license_url: "https://creativecommons.org/licenses/by/3.0/br/",
      }),
    );
    const t = await getTranslation();
    expect(t?.license).toMatch(/Diego Santos/);
    expect(t?.licenseUrl).toMatch(/^https:\/\//);
  });

  it("devolve null se a tradução não estiver importada", async () => {
    __setClient(clienteFalso(null, { message: "no rows" }));
    expect(await getTranslation()).toBeNull();
  });
});
