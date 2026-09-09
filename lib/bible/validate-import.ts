/**
 * As asserções da seção 5 do spec, como código.
 *
 * Devolve TODOS os problemas, não só o primeiro: quem está importando quer
 * ver o estrago inteiro de uma vez, não descobrir um por rodada de 31 mil
 * versículos.
 *
 * Confere contra `canon-counts.ts`, que traz as contagens da própria
 * tradução — inclusive as variantes de versificação dela. É por isso que
 * Salmos 46 com 10 versículos e Apocalipse 12 com 18 passam sem exceção
 * nenhuma: nesta tradução, é isso que se espera.
 */

import { BOOKS, bookByOsis } from "./canon";
import { VERSE_COUNTS } from "./canon-counts";
import type { SourceBible } from "./source-format";

export interface ImportProblem {
  kind:
    | "livro-faltando"
    | "livro-desconhecido"
    | "capitulo-faltando"
    | "contagem-divergente"
    | "lacuna";
  where: string;
  detail: string;
}

export function validateImport(bible: SourceBible): ImportProblem[] {
  const problems: ImportProblem[] = [];

  // osis -> capítulo -> conjunto de versículos presentes
  const mapa = new Map<string, Map<number, Set<number>>>();
  for (const v of bible.verses) {
    let capitulos = mapa.get(v.osis);
    if (!capitulos) {
      capitulos = new Map();
      mapa.set(v.osis, capitulos);
    }
    let versiculos = capitulos.get(v.c);
    if (!versiculos) {
      versiculos = new Set();
      capitulos.set(v.c, versiculos);
    }
    versiculos.add(v.v);
  }

  for (const livro of BOOKS) {
    const capitulos = mapa.get(livro.osis);
    if (!capitulos || capitulos.size === 0) {
      problems.push({
        kind: "livro-faltando",
        where: livro.name,
        detail: "nenhum versículo importado",
      });
      continue;
    }

    const esperadoPorCapitulo = VERSE_COUNTS[livro.osis];

    for (let c = 1; c <= livro.chapters; c++) {
      const versiculos = capitulos.get(c);
      if (!versiculos || versiculos.size === 0) {
        problems.push({
          kind: "capitulo-faltando",
          where: `${livro.name} ${c}`,
          detail: "capítulo ausente",
        });
        continue;
      }

      const esperado = esperadoPorCapitulo?.[c - 1];
      if (esperado !== undefined && versiculos.size !== esperado) {
        problems.push({
          kind: "contagem-divergente",
          where: `${livro.name} ${c}`,
          detail: `importados ${versiculos.size}, esperados ${esperado}`,
        });
      }

      // Contagem certa não garante numeração íntegra: tirar o versículo 10 e
      // acrescentar um 37 fecha a conta e destrói a referência.
      const maior = Math.max(...versiculos);
      const faltando: number[] = [];
      for (let v = 1; v <= maior; v++) {
        if (!versiculos.has(v)) faltando.push(v);
      }
      if (faltando.length > 0) {
        problems.push({
          kind: "lacuna",
          where: `${livro.name} ${c}`,
          detail: `versículo(s) ausente(s) na numeração: ${faltando.join(", ")}`,
        });
      }
    }
  }

  // parseSourceBible já barra livro fora do canon, mas se alguém chamar o
  // validador direto, é melhor acusar do que gravar.
  for (const osis of mapa.keys()) {
    if (!bookByOsis(osis)) {
      problems.push({
        kind: "livro-desconhecido",
        where: osis,
        detail: "livro fora do canon presente no arquivo",
      });
    }
  }

  return problems;
}
