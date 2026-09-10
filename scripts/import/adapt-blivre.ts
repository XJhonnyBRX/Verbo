/**
 * Adapta o JSON da Bíblia Livre para o formato normalizado do importador.
 *
 * Fonte: https://github.com/damarals/biblias (release v1.0.0, arquivo
 * BLIVRE.json), repositório MIT. A verificação completa da tradução — licença,
 * contagens e comparação cruzada com uma segunda tradução — está em
 * docs/design/traducao.md.
 *
 * Estrutura da fonte:
 *   [{ abbrev: "Gn", name: "Gênesis", chapters: [[ "texto", … ], … ] }, …]
 * Capítulo e versículo vêm da POSIÇÃO nos arrays; não existe numeração
 * explícita no arquivo.
 */

import {
  parseSourceBible,
  type SourceBible,
  type SourceTranslation,
  type SourceVerse,
} from "../../lib/bible/source-format";

/**
 * A licença é CC BY, então a atribuição não é cortesia: é condição de uso.
 * Este texto é o que a interface precisa exibir, e por isso vive aqui, no
 * mesmo lugar de onde o texto bíblico entra.
 */
export const TRANSLATION: SourceTranslation = {
  slug: "blivre",
  name: "A Bíblia Livre",
  abbrev: "BLIVRE",
  license:
    "Creative Commons Atribuição 3.0 Brasil (CC BY 3.0 BR) — " +
    "Diego Santos, Mario Sérgio e Marco Teles",
  licenseUrl: "https://creativecommons.org/licenses/by/3.0/br/",
  sourceUrl:
    "https://github.com/damarals/biblias/releases/download/v1.0.0/BLIVRE.json",
};

/**
 * Abreviação da fonte para código OSIS.
 *
 * Explícita e sensível a acento de propósito. Não reaproveita
 * `parseReference`: aquele parser serve à entrada do usuário e é tolerante
 * com ambiguidade — aqui, tolerância vira Escritura no lugar errado. Note
 * "Jó" e "Jo": diferem só pelo acento e são livros distintos.
 */
const ABBREV_TO_OSIS: Record<string, string> = {
  Gn: "Gen", "Êx": "Exod", Lv: "Lev", Nm: "Num", Dt: "Deut",
  Js: "Josh", Jz: "Judg", Rt: "Ruth", "1Sm": "1Sam", "2Sm": "2Sam",
  "1Rs": "1Kgs", "2Rs": "2Kgs", "1Cr": "1Chr", "2Cr": "2Chr", Ed: "Ezra",
  Ne: "Neh", Et: "Esth", "Jó": "Job", Sl: "Ps", Pv: "Prov",
  Ec: "Eccl", Ct: "Song", Is: "Isa", Jr: "Jer", Lm: "Lam",
  Ez: "Ezek", Dn: "Dan", Os: "Hos", Jl: "Joel", Am: "Amos",
  Ob: "Obad", Jn: "Jonah", Mq: "Mic", Na: "Nah", Hc: "Hab",
  Sf: "Zeph", Ag: "Hag", Zc: "Zech", Ml: "Mal",
  Mt: "Matt", Mc: "Mark", Lc: "Luke", Jo: "John", At: "Acts",
  Rm: "Rom", "1Co": "1Cor", "2Co": "2Cor", Gl: "Gal", Ef: "Eph",
  Fp: "Phil", Cl: "Col", "1Ts": "1Thess", "2Ts": "2Thess", "1Tm": "1Tim",
  "2Tm": "2Tim", Tt: "Titus", Fm: "Phlm", Hb: "Heb", Tg: "Jas",
  "1Pe": "1Pet", "2Pe": "2Pet", "1Jo": "1John", "2Jo": "2John",
  "3Jo": "3John", Jd: "Jude", Ap: "Rev",
};

/**
 * A conversão da fonte deixou defeitos de espaçamento em quase todo
 * versículo: 31.045 dos 31.102 terminam com espaço, há 1.565 espaços duplos
 * e 881 espaços antes de pontuação — «unigênito , para que». Nenhum deles é
 * semântico, e todos apareceriam na tela e no tsvector.
 */
function normalizarTexto(bruto: string): string {
  return bruto
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?»])/g, "$1")
    .trim();
}

interface LivroDaFonte {
  abbrev: string;
  name: string;
  chapters: string[][];
}

function ehLivroDaFonte(x: unknown): x is LivroDaFonte {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.abbrev === "string" &&
    typeof o.name === "string" &&
    Array.isArray(o.chapters)
  );
}

export function adapt(raw: string): SourceBible {
  let dados: unknown;
  try {
    dados = JSON.parse(raw);
  } catch (erro) {
    throw new Error(
      `arquivo-fonte não é JSON válido: ${(erro as Error).message}`,
    );
  }

  if (!Array.isArray(dados)) {
    throw new Error("arquivo-fonte inválido: esperado um array de livros");
  }

  const verses: SourceVerse[] = [];

  for (const [i, livro] of dados.entries()) {
    if (!ehLivroDaFonte(livro)) {
      throw new Error(
        `livro na posição ${i}: esperado { abbrev, name, chapters }`,
      );
    }

    const osis = ABBREV_TO_OSIS[livro.abbrev];
    if (!osis) {
      throw new Error(
        `abreviação desconhecida na fonte: "${livro.abbrev}" (${livro.name}) — ` +
          "acrescente em ABBREV_TO_OSIS se for um livro do canon",
      );
    }

    livro.chapters.forEach((capitulo, ci) => {
      if (!Array.isArray(capitulo)) {
        throw new Error(`${livro.name} capítulo ${ci + 1}: esperado um array`);
      }
      capitulo.forEach((texto, vi) => {
        if (typeof texto !== "string") {
          throw new Error(
            `${livro.name} ${ci + 1}:${vi + 1}: versículo não é texto`,
          );
        }
        verses.push({
          osis,
          c: ci + 1,
          v: vi + 1,
          t: normalizarTexto(texto),
        });
      });
    });
  }

  // Quando o arquivo é a Bíblia inteira, confere também a ordem canônica.
  // Num recorte de teste isso não se aplica, então só vale para os 66.
  if (dados.length === 66) {
    const ordemEsperada = Object.values(ABBREV_TO_OSIS);
    const ordemRecebida = (dados as LivroDaFonte[]).map(
      (l) => ABBREV_TO_OSIS[l.abbrev],
    );
    for (const [i, osis] of ordemRecebida.entries()) {
      if (osis !== ordemEsperada[i]) {
        throw new Error(
          `ordem canônica quebrada na posição ${i}: veio ${osis}, esperado ${ordemEsperada[i]}`,
        );
      }
    }
  }

  // Termina aqui de propósito: o adaptador nunca devolve algo que o
  // importador fosse recusar.
  return parseSourceBible({ translation: TRANSLATION, verses });
}
