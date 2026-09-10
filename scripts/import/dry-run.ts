/**
 * Ensaio da importação: adapta e valida o arquivo-fonte sem tocar no banco.
 *
 *   npm run import:dry -- data/source/BLIVRE.json
 *
 * Serve para responder «este arquivo está inteiro?» antes de abrir conexão
 * com qualquer Postgres. Sai com código diferente de zero se houver problema,
 * então também serve em CI.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { adapt, TRANSLATION } from "./adapt-blivre";
import { validateImport } from "../../lib/bible/validate-import";
import { TOTAL_VERSES } from "../../lib/bible/canon-counts";

const arquivo = process.argv[2] ?? "data/source/BLIVRE.json";

const bruto = readFileSync(arquivo);
const sha256 = createHash("sha256").update(bruto).digest("hex");

console.log(`arquivo : ${arquivo}`);
console.log(`bytes   : ${bruto.length.toLocaleString("pt-BR")}`);
console.log(`sha256  : ${sha256}`);
console.log(`tradução: ${TRANSLATION.name} (${TRANSLATION.slug})`);
console.log(`licença : ${TRANSLATION.license}`);

const t0 = Date.now();
const bible = adapt(bruto.toString("utf8"));
const tAdapt = Date.now() - t0;

const t1 = Date.now();
const problemas = validateImport(bible);
const tValid = Date.now() - t1;

const livros = new Set(bible.verses.map((v) => v.osis));
const sujos = bible.verses.filter((v) => /\s{2}|\s[,.;:!?]|^\s|\s$/.test(v.t));

console.log("");
console.log(`livros     : ${livros.size}`);
console.log(`versículos : ${bible.verses.length.toLocaleString("pt-BR")} (fixture espera ${TOTAL_VERSES.toLocaleString("pt-BR")})`);
console.log(`adaptou em : ${tAdapt}ms`);
console.log(`validou em : ${tValid}ms`);
console.log(`texto sujo : ${sujos.length}`);

if (sujos.length > 0) {
  console.error("\nversículos com espaçamento não normalizado:");
  for (const v of sujos.slice(0, 5)) {
    console.error(`  ${v.osis} ${v.c}:${v.v}  ${JSON.stringify(v.t.slice(0, 70))}`);
  }
}

if (problemas.length > 0) {
  console.error(`\n${problemas.length} problema(s) de integridade:`);
  for (const p of problemas.slice(0, 40)) {
    console.error(`  [${p.kind}] ${p.where}: ${p.detail}`);
  }
  if (problemas.length > 40) {
    console.error(`  … e outros ${problemas.length - 40}`);
  }
}

const ok = problemas.length === 0 && sujos.length === 0;
console.log(
  ok
    ? "\nArquivo íntegro e normalizado. Pronto para importar.\n"
    : "\nArquivo REPROVADO. Nada seria gravado.\n",
);
process.exit(ok ? 0 : 1);
