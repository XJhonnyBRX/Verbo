/**
 * Diagnostica o acesso ao projeto Supabase na nuvem.
 *
 *   node scripts/db/diagnose-cloud.mjs
 *
 * Responde três perguntas separadas, porque falham por motivos diferentes:
 *   1. o projeto existe e responde pela API?
 *   2. a chave anônima é válida?
 *   3. algum host de banco resolve por IPv4 desta máquina?
 *
 * Nunca imprime senha nem chave inteira.
 */

import dns from "node:dns/promises";

process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ref = url.replace(/^https?:\/\//, "").split(".")[0];

console.log(`projeto: ${ref}`);
console.log(`chave anônima: ${anon ? `${anon.length} caracteres, …${anon.slice(-6)}` : "AUSENTE"}`);

// ------------------------------------------------------------------ 1 e 2
console.log("\nAPI REST:");
try {
  const r = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  console.log(`  GET /rest/v1/ -> HTTP ${r.status}`);
  if (r.status === 401) {
    const t = await r.text();
    console.log(`  corpo: ${t.slice(0, 200)}`);
  }
} catch (e) {
  console.log(`  falhou: ${e.message}`);
}

// Uma tabela que só existe se as migrations rodaram.
try {
  const r = await fetch(`${url}/rest/v1/bible_translations?select=slug&limit=1`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  const t = await r.text();
  console.log(`  GET bible_translations -> HTTP ${r.status}  ${t.slice(0, 120)}`);
} catch (e) {
  console.log(`  falhou: ${e.message}`);
}

// ---------------------------------------------------------------------- 3
console.log("\nresolução DNS dos hosts de banco:");
const candidatos = [
  `db.${ref}.supabase.co`,
  `${ref}.supabase.co`,
  "aws-0-sa-east-1.pooler.supabase.com",
  "aws-1-sa-east-1.pooler.supabase.com",
  "aws-0-us-east-1.pooler.supabase.com",
  "aws-0-us-east-2.pooler.supabase.com",
  "aws-1-us-east-1.pooler.supabase.com",
];

for (const h of candidatos) {
  const v4 = await dns.resolve4(h).catch(() => null);
  const v6 = await dns.resolve6(h).catch(() => null);
  const partes = [];
  if (v4?.length) partes.push(`IPv4 ${v4[0]}`);
  if (v6?.length) partes.push(`IPv6 ${v6[0].slice(0, 18)}…`);
  console.log(`  ${h.padEnd(42)} ${partes.join("  ") || "não resolve"}`);
}

console.log("\nesta máquina tem IPv6 de saída?");
const teste = await dns.resolve6("ipv6.google.com").catch(() => null);
console.log(`  resolve AAAA: ${teste?.length ? "sim" : "não"}`);
