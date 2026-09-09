/**
 * Gera lib/bible/canon-counts.ts a partir do arquivo-fonte da tradução.
 *
 *   node scripts/import/gen-canon-counts.mjs data/source/BLIVRE.json
 *
 * Por que gerar em vez de escrever à mão: são 1.189 números. Errar um não
 * causa falha visível — causa uma validação que aprova importação incompleta
 * ou reprova importação correta.
 *
 * Por que gerar da própria fonte não é tautologia: o fixture é congelado num
 * ponto verificado. Ele existe para detectar bug no adaptador, truncamento
 * do arquivo, filtro errado dos livros e falha de gravação — que é todo o
 * caminho entre o arquivo e o banco. A completude da FONTE foi verificada
 * separadamente, contra uma segunda tradução independente: 1.185 dos 1.189
 * capítulos batem, e as quatro divergências estão documentadas abaixo e em
 * docs/design/traducao.md.
 *
 * Regenerar só ao trocar de tradução, e sempre refazendo a comparação cruzada.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const entrada = process.argv[2] ?? "data/source/BLIVRE.json";
const saida = "lib/bible/canon-counts.ts";

/** Ordem canônica dos 66 livros, em OSIS. O JSON da fonte segue esta ordem. */
const OSIS = `Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh
Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag
Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus
Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev`.split(/\s+/);

const bruto = readFileSync(entrada);
const sha256 = createHash("sha256").update(bruto).digest("hex");
const livros = JSON.parse(bruto.toString("utf8"));

if (livros.length !== 66) {
  throw new Error(`esperados 66 livros, o arquivo tem ${livros.length}`);
}

const contagens = OSIS.map((osis, i) => [
  osis,
  livros[i].chapters.map((cap) => cap.length),
]);

const total = contagens.reduce(
  (soma, [, caps]) => soma + caps.reduce((a, b) => a + b, 0),
  0,
);

// As chaves vão SEMPRE entre aspas: "1Sam", "1Cor", "2John" e companhia
// começam com dígito e não são identificadores JavaScript válidos. Sem as
// aspas o arquivo gerado nem faz parse.
const linhas = contagens.map(
  ([osis, caps]) => `  "${osis}": [${caps.join(", ")}],`,
);

const conteudo = `/**
 * Versículos por capítulo da tradução importada.
 *
 * GERADO por scripts/import/gen-canon-counts.mjs. Não edite à mão.
 *
 * Fonte:  ${entrada}
 * sha256: ${sha256}
 * Total:  ${total} versículos em ${contagens.length} livros
 *
 * Existe para a validação da importação poder afirmar que nada faltou entre
 * o arquivo e o banco.
 *
 * VARIANTES DE VERSIFICAÇÃO conhecidas nesta tradução, verificadas contra uma
 * segunda tradução independente (1.185 dos 1.189 capítulos batem):
 *
 *   Salmos 46      10 versículos, e não 11 — funde os versículos 2 e 3 do
 *                  padrão num só. Texto completo, conferido linha por linha.
 *   Apocalipse 12  18 versículos, e não 17 — põe "E eu fiquei parado sobre a
 *                  areia do mar" em 12:18, seguindo o texto crítico, em vez
 *                  de 13:1a como nas edições de Textus Receptus.
 *   Romanos 14/16  23 e 27 versículos, que É o padrão. A outra tradução
 *                  divergiu aqui, não esta: ela move a doxologia para
 *                  14:24-26.
 *
 * As duas primeiras se cancelam, e é por isso que o total fecha em 31.102
 * apesar da distribuição diferir do padrão KJV em dois capítulos. Se este
 * arquivo tivesse sido escrito com as contagens "padrão" de cor, a validação
 * reprovaria uma importação perfeitamente correta.
 */

export const VERSE_COUNTS: Record<string, number[]> = {
${linhas.join("\n")}
};

export const TOTAL_VERSES = Object.values(VERSE_COUNTS)
  .flat()
  .reduce((soma, n) => soma + n, 0);

export function expectedVerseCount(
  osis: string,
  chapter: number,
): number | undefined {
  return VERSE_COUNTS[osis]?.[chapter - 1];
}

export function expectedChapterCount(osis: string): number | undefined {
  return VERSE_COUNTS[osis]?.length;
}
`;

writeFileSync(saida, conteudo, "utf8");
console.log(`${saida} gerado`);
console.log(`  fonte:  ${entrada}`);
console.log(`  sha256: ${sha256}`);
console.log(`  total:  ${total} versículos`);
