/**
 * Testa a conexão direta da Supabase forçando IPv6.
 *
 *   node scripts/db/try-ipv6.mjs
 *
 * O host db.<ref>.supabase.co só tem registro AAAA. O driver `pg` usa
 * dns.lookup, que sem `family` explícito devolve o que o sistema preferir —
 * e no Windows isso deu ENOTFOUND mesmo com IPv6 funcionando. Passar
 * family: 6 resolve, se houver rota IPv6 de saída.
 *
 * Também separa dois fracassos que se parecem: «não chega lá» é rede,
 * «senha recusada» é credencial. Distinguir os dois evita caçar o problema
 * errado.
 */

import dns from "node:dns/promises";
import pg from "pg";

process.loadEnvFile(".env.local");

const original = process.env.DATABASE_URL ?? "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ref = url.replace(/^https?:\/\//, "").split(".")[0];
const senha = original.match(/\/\/postgres(?:\.[^:]+)?:([^@]+)@/)?.[1];

const host = `db.${ref}.supabase.co`;
const enderecos = await dns.resolve6(host).catch(() => []);
console.log(`${host} -> ${enderecos[0] ?? "sem AAAA"}`);

if (enderecos.length === 0) process.exit(1);

/* Conecta ao ENDERECO, nao ao nome: o pg ignora `lookup` customizado e cai
   no getaddrinfo do sistema, que prefere IPv4 e devolve ENOTFOUND. Passando
   o IPv6 literal, o DNS sai do caminho. */
const client = new pg.Client({
  host: enderecos[0],
  port: 5432,
  user: "postgres",
  password: senha,
  database: "postgres",
  // servername mantém o SNI correto mesmo conectando por endereço.
  ssl: { rejectUnauthorized: false, servername: host },
  connectionTimeoutMillis: 25_000,
});

try {
  await client.connect();
  const { rows } = await client.query(
    "select current_database() as db, version() as v",
  );
  console.log(`  CONECTOU: ${rows[0].db}`);
  console.log(`  ${rows[0].v.split(" on ")[0]}`);
  console.log("\nA conexão direta funciona por IPv6. Use esta em DATABASE_URL.");
  await client.end();
} catch (e) {
  const m = e.message;
  console.log(`  falhou: ${m}`);
  if (/password authentication/i.test(m)) {
    console.log(
      "\nChegou ao banco e a SENHA foi recusada. A rede está bem; o valor em\n" +
        "DATABASE_URL não confere com a senha atual do projeto.\n" +
        "Redefina em Project Settings > Database > Reset database password.",
    );
  } else if (/ENETUNREACH|EHOSTUNREACH|ETIMEDOUT/i.test(m)) {
    console.log(
      "\nO host resolve mas não há rota IPv6 de saída desta máquina.\n" +
        "Use o pooler IPv4 (Connect > Transaction pooler).",
    );
  }
  process.exit(1);
}
