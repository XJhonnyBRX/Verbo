/**
 * Confere a conexão com o banco antes de qualquer operação pesada.
 *
 *   node scripts/db/check-connection.mjs
 *
 * Existe porque descobrir que a connection string está errada no meio de uma
 * importação de 31 mil versículos é o pior momento possível. Também reporta o
 * estado do schema, para dizer se as migrations já foram aplicadas.
 *
 * Nunca imprime a senha.
 */

import pg from "pg";

process.loadEnvFile(".env.local");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("falta DATABASE_URL em .env.local");
  process.exit(1);
}

// Mostra para onde vai sem revelar a credencial.
const alvo = url.replace(/\/\/[^@]*@/, "//***@");
console.log(`alvo: ${alvo}`);

const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 30_000,
  // A Supabase exige TLS; o certificado é de cadeia própria.
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  const { rows: v } = await client.query(
    "select version() as v, current_database() as db",
  );
  console.log(`banco: ${v[0].db}`);
  console.log(`versão: ${v[0].v.split(" on ")[0]}`);

  const { rows: ext } = await client.query(
    "select extname from pg_extension where extname in ('vector','pgcrypto') order by extname",
  );
  console.log(`extensões: ${ext.map((e) => e.extname).join(", ") || "nenhuma das esperadas"}`);

  const { rows: t } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `);
  console.log(`tabelas em public: ${t.length}`);
  if (t.length > 0) {
    console.log(`  ${t.map((x) => x.table_name).join(", ")}`);
  }

  const temEscritura = t.some((x) => x.table_name === "bible_verses");
  if (temEscritura) {
    const { rows: c } = await client.query(
      "select count(*)::int as n from public.bible_verses",
    );
    console.log(`versículos já importados: ${c[0].n.toLocaleString("pt-BR")}`);
  } else {
    console.log("schema ainda não aplicado — as migrations precisam rodar");
  }
} catch (e) {
  console.error(`FALHOU: ${e.message}`);
  if (/ENOTFOUND|EAI_AGAIN/.test(e.message)) {
    console.error(
      "\nO host não resolveu. Projetos novos da Supabase servem a conexão\n" +
        "direta só por IPv6; se esta máquina não tem IPv6, use a string do\n" +
        "pooler (Connect > Transaction pooler), que é IPv4.",
    );
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
