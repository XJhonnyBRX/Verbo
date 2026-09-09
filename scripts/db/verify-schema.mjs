/**
 * Verifica o schema contra um Postgres de verdade.
 *
 *   npm run verify:schema
 *
 * Sobe (ou reusa) um container pgvector, zera os schemas, aplica o bootstrap
 * e as migrations na ordem, e roda as asserções de 99_smoke.sql. Sai com
 * código diferente de zero se qualquer garantia não valer.
 *
 * O bootstrap imita o que a Supabase fornece (auth.users, auth.uid(), schema
 * extensions, papéis) e nunca é aplicado num projeto Supabase de verdade.
 */

import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync } from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

const CONTAINER = "verbo-pg";
const IMAGE = "pgvector/pgvector:pg17";
const DB = "verbo";
const PORT = "55432";
const MIGRATIONS_DIR = "supabase/migrations";
const DB_DIR = "scripts/db";

function docker(args, { quiet = true } = {}) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

function psql(args) {
  return execFileSync(
    "docker",
    ["exec", CONTAINER, "psql", "-U", "postgres", "-d", DB, ...args],
    { encoding: "utf8" },
  );
}

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// ------------------------------------------------------------------ daemon
try {
  docker(["info"]);
} catch {
  die(
    "O daemon do Docker não está rodando.\n" +
      "No Windows: abra o Docker Desktop e rode este comando de novo.",
  );
}

// --------------------------------------------------------------- container
let running = false;
try {
  const state = docker([
    "inspect",
    "-f",
    "{{.State.Running}}",
    CONTAINER,
  ]).trim();
  running = state === "true";
  if (!running) docker(["start", CONTAINER]);
  console.log(`container ${CONTAINER} reusado`);
} catch {
  console.log(`subindo ${IMAGE}…`);
  docker([
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-e",
    "POSTGRES_PASSWORD=verbo",
    "-e",
    `POSTGRES_DB=${DB}`,
    "-p",
    `${PORT}:5432`,
    IMAGE,
  ]);
}

// ------------------------------------------------------------------ espera
process.stdout.write("aguardando o Postgres");
let ready = false;
for (let i = 0; i < 60; i++) {
  try {
    await execFileAsync("docker", [
      "exec",
      CONTAINER,
      "pg_isready",
      "-U",
      "postgres",
      "-d",
      DB,
    ]);
    ready = true;
    break;
  } catch {
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 2000));
  }
}
console.log("");
if (!ready) die("O Postgres não aceitou conexão em 2 minutos.");

// ------------------------------------------------------------------- reset
psql([
  "-q",
  "-c",
  "drop schema if exists public cascade; create schema public; " +
    "drop schema if exists private cascade; " +
    "drop schema if exists auth cascade; " +
    "drop schema if exists extensions cascade;",
]);
console.log("banco zerado");

// -------------------------------------------------------------- migrations
const files = [
  path.join(DB_DIR, "00_bootstrap.sql"),
  ...readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(MIGRATIONS_DIR, f)),
  path.join(DB_DIR, "99_smoke.sql"),
];

for (const file of files) {
  const base = path.basename(file);
  docker(["cp", file, `${CONTAINER}:/tmp/${base}`]);

  const isSmoke = base === "99_smoke.sql";
  try {
    const out = psql(["-v", "ON_ERROR_STOP=1", "-q", "-f", `/tmp/${base}`]);
    if (isSmoke) {
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/NOTICE:\s+(ok .+)$/);
        if (m) console.log(`  ${m[1]}`);
      }
    } else {
      console.log(`  aplicada  ${base}`);
    }
  } catch (err) {
    const detail = `${err.stdout ?? ""}${err.stderr ?? ""}`
      .split(/\r?\n/)
      .filter((l) => /ERROR|FALHA|DETAIL|LINE/.test(l))
      .slice(0, 12)
      .join("\n");
    die(`FALHOU em ${base}:\n${detail}`);
  }
}

console.log("\nTodas as garantias do schema foram verificadas.\n");
