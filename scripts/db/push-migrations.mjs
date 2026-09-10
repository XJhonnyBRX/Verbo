/**
 * Aplica as migrations num projeto Supabase remoto.
 *
 *   node scripts/db/push-migrations.mjs
 *
 * NÃO aplica scripts/db/00_bootstrap.sql: aquele arquivo existe só para
 * simular, num Postgres puro, o que a Supabase já fornece — schema `auth`,
 * `auth.uid()`, schema `extensions` e os papéis anon/authenticated/
 * service_role. Rodá-lo aqui tentaria recriar coisas da plataforma.
 *
 * Cada migration roda dentro da sua própria transação: ou entra inteira ou
 * não entra. E o script para no primeiro erro, em vez de seguir e deixar o
 * schema pela metade.
 *
 * Nunca imprime a senha.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

process.loadEnvFile(".env.local");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("falta DATABASE_URL em .env.local");
  process.exit(1);
}

console.log(`alvo: ${url.replace(/\/\/[^@]*@/, "//***@")}`);

const dir = "supabase/migrations";
const arquivos = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30_000,
  // A importação e o DDL levam tempo; sem isto o pooler corta.
  statement_timeout: 120_000,
});

await client.connect();

try {
  for (const f of arquivos) {
    const sql = readFileSync(path.join(dir, f), "utf8");
    process.stdout.write(`  ${f} … `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
      console.log("ok");
    } catch (e) {
      await client.query("rollback").catch(() => {});
      console.log("FALHOU");
      console.error(`\n${e.message}`);
      if (e.position) {
        const pos = Number(e.position);
        console.error(`\ntrecho: …${sql.slice(Math.max(0, pos - 120), pos + 120)}…`);
      }
      process.exit(1);
    }
  }

  const { rows: t } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `);
  console.log(`\n${t.length} tabelas em public:`);
  console.log(`  ${t.map((x) => x.table_name).join(", ")}`);

  const { rows: f } = await client.query(`
    select routine_name from information_schema.routines
    where routine_schema = 'public' order by routine_name
  `);
  console.log(`funções: ${f.map((x) => x.routine_name).join(", ")}`);
} finally {
  await client.end().catch(() => {});
}
