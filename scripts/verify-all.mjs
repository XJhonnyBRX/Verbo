/**
 * Roda todas as verificações do VERBO em sequência.
 *
 *   npm run verify              tudo que não precisa de Docker
 *   npm run verify -- --schema  inclui as garantias do banco (precisa Docker)
 *
 * POR QUE ISTO EXISTE: tínhamos cinco verificações automatizadas e nenhuma
 * rodava sozinha. Alguém precisava lembrar de executar cada uma, o que ainda
 * é «achamos que está bom», só que com passos extras.
 *
 * Cada bloco reporta separado, e o script segue até o fim mesmo quando um
 * falha — descobrir todos os problemas de uma vez vale mais do que parar no
 * primeiro.
 */

import { spawn } from "node:child_process";
import { setTimeout as espera } from "node:timers/promises";

const PORTA = 3211; // fora da 3210, para não brigar com um servidor de trabalho
const incluirSchema = process.argv.includes("--schema");

const resultados = [];

function executar(comando, args, opcoes = {}) {
  return new Promise((resolve) => {
    const p = spawn(comando, args, {
      shell: true,
      stdio: opcoes.silencioso ? ["ignore", "pipe", "pipe"] : "inherit",
      ...opcoes,
    });
    let saida = "";
    if (opcoes.silencioso) {
      p.stdout?.on("data", (d) => (saida += d));
      p.stderr?.on("data", (d) => (saida += d));
    }
    p.on("close", (codigo) => resolve({ codigo, saida }));
  });
}

async function etapa(nome, comando, args, opcoes) {
  process.stdout.write(`\n━━━ ${nome}\n`);
  const t0 = Date.now();
  const { codigo, saida } = await executar(comando, args, opcoes);
  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = codigo === 0;
  if (!ok && opcoes?.silencioso) console.log(saida.slice(-1200));
  console.log(`    ${ok ? "ok" : "FALHOU"} em ${seg}s`);
  resultados.push({ nome, ok, seg });
  return ok;
}

// ------------------------------------------------- o que não precisa de rede
await etapa("tipos", "npx", ["tsc", "--noEmit"], { silencioso: true });
await etapa("lint", "npx", ["eslint", "."], { silencioso: true });
await etapa("testes de unidade", "npx", ["vitest", "run"], { silencioso: true });

/* O conjunto reservado do portão de evidência é imutável a partir do
   congelamento. Sem esta etapa, «imutável» seria uma palavra num comentário —
   e alguém poderia reescrevê-lo depois de ver o resultado do Gemini, que é
   exatamente o que ele existe para impedir. */
await etapa(
  "conjunto reservado congelado",
  "npx",
  ["tsx", "scripts/embed/verify-calibration-set.ts"],
  { silencioso: true },
);

// --------------------------------------------------------- banco na nuvem
// Usa só a chave anônima, que está no .env versionado. Sem segredo.
await etapa("RLS na nuvem", "node", ["scripts/db/audit-rls.mjs"], {
  silencioso: true,
});

// ------------------------------------------------------------------ build
const construiu = await etapa("build", "npx", ["next", "build"], {
  silencioso: true,
});

// ------------------------------------------- o que precisa de servidor vivo
if (construiu) {
  const servidor = spawn("npx", ["next", "start", "-p", String(PORTA)], {
    shell: true,
    stdio: "ignore",
    detached: false,
  });

  let vivo = false;
  for (let i = 0; i < 60; i++) {
    await espera(1000);
    try {
      const r = await fetch(`http://localhost:${PORTA}/conta`);
      if (r.ok) {
        vivo = true;
        break;
      }
    } catch {
      /* ainda subindo */
    }
  }

  if (!vivo) {
    console.log("\n━━━ servidor\n    FALHOU: não subiu em 60s");
    resultados.push({ nome: "servidor", ok: false, seg: "60" });
  } else {
    const base = `http://localhost:${PORTA}`;
    await etapa("interface e regra de ouro", "node", ["scripts/verify-ui.mjs", base], {
      silencioso: true,
    });
    await etapa("acessibilidade WCAG 2.2", "node", ["scripts/audit-a11y.mjs", base], {
      silencioso: true,
    });
    /* Leva ~15s por causa da espera deliberada do temporizador. Vale: é o
       único laço do produto que ninguém consegue verificar lendo o código,
       porque depende de tempo e de duas telas conversando. */
    await etapa(
      "posição de leitura",
      "node",
      ["scripts/verify-reading-position.mjs", base],
      { silencioso: true },
    );
  }

  servidor.kill();
  // No Windows o kill do npx não derruba o filho; garante a porta livre.
  await executar(
    process.platform === "win32" ? "npx" : "true",
    process.platform === "win32"
      ? ["--yes", "kill-port", String(PORTA)]
      : [],
    { silencioso: true },
  );
}

// ------------------------------------------------ garantias do banco local
if (incluirSchema) {
  await etapa("garantias do schema", "node", ["scripts/db/verify-schema.mjs"], {
    silencioso: true,
  });
}

// ----------------------------------------------------------------- resumo
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
for (const r of resultados) {
  console.log(`  ${r.ok ? "ok    " : "FALHOU"} ${r.nome.padEnd(28)} ${r.seg}s`);
}
const falhas = resultados.filter((r) => !r.ok).length;
console.log(
  falhas === 0
    ? "\nTudo verde.\n"
    : `\n${falhas} verificação(ões) falharam.\n`,
);
if (!incluirSchema) {
  console.log("  (--schema inclui as garantias do banco; precisa de Docker)\n");
}
process.exit(falhas === 0 ? 0 : 1);
