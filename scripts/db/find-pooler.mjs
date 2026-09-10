/**
 * Descobre a string de conexão IPv4 que funciona para este projeto.
 *
 *   node scripts/db/find-pooler.mjs
 *
 * A conexão direta da Supabase (db.<ref>.supabase.co) é IPv6 apenas em
 * projetos novos, e o driver usa o resolvedor do sistema — que devolve
 * ENOTFOUND quando não há rota IPv6 de saída. O pooler é IPv4 e resolve isso,
 * mas o hostname carrega a região, que não está na connection string que o
 * painel entrega por padrão.
 *
 * Em vez de perguntar a região, testamos: só a certa autentica.
 *
 * Escreve a que funcionar de volta no .env.local. Nunca imprime a senha.
 */

import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.local");

const original = process.env.DATABASE_URL ?? "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ref = url.replace(/^https?:\/\//, "").split(".")[0];

const senha = original.match(/\/\/postgres(?:\.[^:]+)?:([^@]+)@/)?.[1];
if (!ref || !senha) {
  console.error("não consegui extrair projeto e senha de .env.local");
  process.exit(1);
}

const REGIOES = [
  "sa-east-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "eu-central-1",
  "eu-west-2",
  "ap-southeast-1",
];

/* Porta 5432 é o modo sessão, e é o que queremos: o modo transação (6543)
   não mantém estado entre comandos, o que atrapalha DDL e transações longas
   como a da importação. */
const candidatos = [];
for (const r of REGIOES) {
  for (const prefixo of ["aws-0", "aws-1"]) {
    candidatos.push(
      `postgresql://postgres.${ref}:${senha}@${prefixo}-${r}.pooler.supabase.com:5432/postgres`,
    );
  }
}

let vencedora = null;

for (const c of candidatos) {
  const host = c.match(/@([^:]+):/)?.[1] ?? "?";
  const client = new pg.Client({
    connectionString: c,
    connectionTimeoutMillis: 12_000,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    const { rows } = await client.query("select current_database() as db");
    console.log(`  ok      ${host}  -> ${rows[0].db}`);
    vencedora = c;
    await client.end();
    break;
  } catch (e) {
    const m = e.message.slice(0, 58).replace(/\s+/g, " ");
    console.log(`  falhou  ${host}  ${m}`);
    await client.end().catch(() => {});
  }
}

if (!vencedora) {
  console.error(
    "\nNenhum pooler aceitou. Pegue a string em Connect > Transaction pooler\n" +
      "no painel e cole em DATABASE_URL — ela traz a região correta.",
  );
  process.exit(1);
}

const env = readFileSync(".env.local", "utf8");
writeFileSync(
  ".env.local",
  env.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${vencedora}`),
  "utf8",
);

console.log(
  `\nDATABASE_URL atualizada para o pooler IPv4 em ${vencedora.match(/@([^:]+):/)?.[1]}`,
);
