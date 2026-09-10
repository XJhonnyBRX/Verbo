/**
 * Importa a tradução para o Postgres. Roda uma vez por tradução.
 *
 *   DATABASE_URL=postgres://… npm run import:bible -- data/source/BLIVRE.json
 *
 * Conexão Postgres direta, não a API REST da Supabase, por dois motivos:
 * gravar 31 mil linhas por HTTP é lento, e o importador precisa ignorar RLS —
 * ele é o único componente que escreve na Escritura. A mesma connection
 * string serve para o Postgres local do Docker e para a Supabase.
 *
 * DUAS ORDENS QUE IMPORTAM:
 *
 * 1. Valida ANTES de abrir transação. Descobrir que faltou um livro depois
 *    de gravar seria o pior momento.
 *
 * 2. Tudo dentro de UMA transação. Os triggers de imutabilidade bloqueiam
 *    UPDATE e DELETE em bible_verses — então uma importação que falhasse no
 *    meio deixaria lixo que o próprio schema impede de limpar. Só o ROLLBACK
 *    desfaz, porque ele não passa por trigger.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { BOOKS } from "../../lib/bible/canon";
import { validateImport } from "../../lib/bible/validate-import";
import { adapt, TRANSLATION } from "./adapt-blivre";

const arquivo = process.argv[2] ?? "data/source/BLIVRE.json";
const url = process.env.DATABASE_URL;

if (!url) {
  console.error(
    "falta DATABASE_URL.\n" +
      "  local:    postgres://postgres:verbo@localhost:55432/verbo\n" +
      "  Supabase: a connection string direta do painel, não a de pooling",
  );
  process.exit(1);
}

// ---------------------------------------------------------------- preparação
const bruto = readFileSync(arquivo);
const sha256 = createHash("sha256").update(bruto).digest("hex");

console.log(`arquivo : ${arquivo}`);
console.log(`sha256  : ${sha256}`);

const bible = adapt(bruto.toString("utf8"));
console.log(`adaptado: ${bible.verses.length.toLocaleString("pt-BR")} versículos`);

const problemas = validateImport(bible);
if (problemas.length > 0) {
  console.error(`\n${problemas.length} problema(s). NADA foi gravado:\n`);
  for (const p of problemas.slice(0, 40)) {
    console.error(`  [${p.kind}] ${p.where}: ${p.detail}`);
  }
  if (problemas.length > 40) {
    console.error(`  … e outros ${problemas.length - 40}`);
  }
  process.exit(1);
}
console.log("validado: 66 livros, contagens conferidas, sem lacunas");

// ------------------------------------------------------------------- gravação
/* Envolvido em main() de propósito: sem "type": "module" no package.json, o
   tsx compila este arquivo como CJS, onde top-level await não existe. Mudar
   o tipo do pacote afetaria os arquivos de configuração do Next. */
async function main(): Promise<void> {
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query("begin");

  const jaExiste = await client.query(
    "select 1 from public.bible_translations where slug = $1",
    [TRANSLATION.slug],
  );
  if (jaExiste.rowCount && jaExiste.rowCount > 0) {
    throw new Error(
      `a tradução "${TRANSLATION.slug}" já está no banco. ` +
        "Reimportar exige uma migration explícita que desabilite os triggers " +
        "de imutabilidade — ver spec, seção 5.",
    );
  }

  const { rows: traducao } = await client.query<{ id: string }>(
    `insert into public.bible_translations
       (slug, name, abbrev, license, license_url, source_url, source_sha256,
        verse_count, imported_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     returning id`,
    [
      TRANSLATION.slug,
      TRANSLATION.name,
      TRANSLATION.abbrev,
      TRANSLATION.license,
      TRANSLATION.licenseUrl ?? null,
      TRANSLATION.sourceUrl ?? null,
      sha256,
      bible.verses.length,
    ],
  );
  const translationId = traducao[0].id;

  // Livros: canônicos, compartilhados entre traduções. Só insere o que falta.
  for (const b of BOOKS) {
    await client.query(
      `insert into public.bible_books
         (osis_code, name_pt, abbreviations, testament, canonical_order, chapter_count)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (osis_code) do nothing`,
      [b.osis, b.name, b.aliases, b.testament, b.order, b.chapters],
    );
  }

  const { rows: livros } = await client.query<{ id: string; osis_code: string }>(
    "select id, osis_code from public.bible_books",
  );
  const idPorOsis = new Map(livros.map((l) => [l.osis_code, l.id]));

  // Versículos em lotes. 1.000 linhas x 6 colunas = 6.000 parâmetros, bem
  // abaixo do limite de 65.535 por consulta.
  const LOTE = 1000;
  let gravados = 0;
  const t0 = Date.now();

  for (let i = 0; i < bible.verses.length; i += LOTE) {
    const lote = bible.verses.slice(i, i + LOTE);
    const valores: unknown[] = [];
    const placeholders = lote.map((v, j) => {
      const base = j * 6;
      valores.push(
        translationId,
        idPorOsis.get(v.osis),
        v.c,
        v.v,
        v.t,
        v.woc ?? false,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    });

    await client.query(
      `insert into public.bible_verses
         (translation_id, book_id, chapter, verse, text, words_of_christ)
       values ${placeholders.join(", ")}`,
      valores,
    );

    gravados += lote.length;
    process.stdout.write(
      `\rgravando ${gravados.toLocaleString("pt-BR")}/${bible.verses.length.toLocaleString("pt-BR")}`,
    );
  }
  process.stdout.write("\n");
  const segundos = ((Date.now() - t0) / 1000).toFixed(1);

  // Conferência final DENTRO da transação: se divergir, o rollback desfaz.
  const { rows: contagem } = await client.query<{ n: string }>(
    "select count(*)::text as n from public.bible_verses where translation_id = $1",
    [translationId],
  );
  const noBanco = Number(contagem[0].n);
  if (noBanco !== bible.verses.length) {
    throw new Error(
      `divergência: o banco tem ${noBanco} versículos, o arquivo tinha ${bible.verses.length}`,
    );
  }

  await client.query("commit");
  console.log(
    `\nimportação concluída: ${noBanco.toLocaleString("pt-BR")} versículos ` +
      `em "${TRANSLATION.slug}" (${segundos}s)`,
  );
  console.log(`licença gravada: ${TRANSLATION.license}`);
} catch (erro) {
  await client.query("rollback");
  console.error(`\nFALHOU, nada foi gravado: ${(erro as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
}

main().catch((erro: unknown) => {
  console.error(`\nFALHOU: ${(erro as Error).message}`);
  process.exit(1);
});
