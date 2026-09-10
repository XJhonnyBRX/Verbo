import { describe, expect, it } from "vitest";
import { parsePosition } from "./reading-position";

/**
 * O conteúdo do armazenamento é ENTRADA NÃO CONFIÁVEL. Pode ter sido gravado
 * por uma versão anterior do app, editado à mão no DevTools, ou truncado por
 * um despejo do sistema no meio da escrita.
 *
 * O que está em jogo não é elegância: uma posição inválida vira um cartão
 * «continue lendo» que aponta para uma rota inexistente — na única tela cujo
 * propósito é trazer a pessoa de volta. É a falha mais cara possível nesta
 * feature, e a mais fácil de evitar.
 */
describe("parsePosition", () => {
  const valida = {
    translation: "blivre",
    osis: "John",
    chapter: 3,
    lastReadAt: "2026-09-10T12:00:00.000Z",
  };

  it("aceita uma posição bem formada", () => {
    expect(parsePosition(JSON.stringify(valida))).toEqual(valida);
  });

  it("devolve null quando não há nada gravado", () => {
    expect(parsePosition(null)).toBeNull();
    expect(parsePosition("")).toBeNull();
  });

  it("devolve null para JSON quebrado, em vez de lançar", () => {
    expect(parsePosition("{\"translation\":")).toBeNull();
    expect(parsePosition("não é json")).toBeNull();
  });

  it("recusa JSON válido que não é um objeto", () => {
    expect(parsePosition("42")).toBeNull();
    expect(parsePosition("null")).toBeNull();
    expect(parsePosition('"John 3"')).toBeNull();
  });

  it("recusa livro fora do cânon", () => {
    expect(parsePosition(JSON.stringify({ ...valida, osis: "Enoch" }))).toBeNull();
    expect(parsePosition(JSON.stringify({ ...valida, osis: "" }))).toBeNull();
  });

  /* João tem 21 capítulos. Um 22 gravado — por bug, por edição manual, ou por
     uma tradução com contagem diferente — levaria a um 404. */
  it("recusa capítulo que não existe no livro", () => {
    expect(parsePosition(JSON.stringify({ ...valida, chapter: 22 }))).toBeNull();
    expect(parsePosition(JSON.stringify({ ...valida, chapter: 0 }))).toBeNull();
    expect(parsePosition(JSON.stringify({ ...valida, chapter: -1 }))).toBeNull();
  });

  it("aceita o último capítulo do livro", () => {
    expect(parsePosition(JSON.stringify({ ...valida, chapter: 21 }))?.chapter).toBe(21);
  });

  it("recusa capítulo que não é inteiro", () => {
    expect(parsePosition(JSON.stringify({ ...valida, chapter: 3.5 }))).toBeNull();
    expect(parsePosition(JSON.stringify({ ...valida, chapter: "3" }))).toBeNull();
  });

  it("recusa registro sem os campos obrigatórios", () => {
    for (const campo of ["translation", "osis", "chapter", "lastReadAt"]) {
      const parcial: Record<string, unknown> = { ...valida };
      delete parcial[campo];
      expect(parsePosition(JSON.stringify(parcial))).toBeNull();
    }
  });

  /* Jó e João colidem quando se ignora o acento; o OSIS não colide. Este
     teste existe para que o dia em que alguém trocar OSIS por nome em
     português quebre aqui, e não na tela de alguém. */
  it("distingue Jó de João pelo OSIS", () => {
    expect(parsePosition(JSON.stringify({ ...valida, osis: "Job", chapter: 42 }))?.osis).toBe("Job");
    // João não tem capítulo 42
    expect(parsePosition(JSON.stringify({ ...valida, osis: "John", chapter: 42 }))).toBeNull();
  });
});
