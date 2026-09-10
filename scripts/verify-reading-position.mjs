/**
 * Prova, no navegador de verdade, o ciclo que sustenta a retenção:
 *
 *   ler → parar → voltar → continuar
 *
 * Existe porque o teste de unidade cobre `parsePosition`, que é a parte que
 * eu conseguia errar em silêncio — mas não cobre a parte que já nos enganou
 * antes neste projeto: a lógica certa ligada à tela errada. O temporizador só
 * vale se disparar depois do capítulo aparecer, e o cartão só vale se levar
 * de volta ao capítulo certo.
 *
 *   node scripts/verify-reading-position.mjs [url]
 */

import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3210";
const ESPERA = 5_000; // ESPERA_PARA_REGISTRAR_MS em lib/reading-position.ts

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) console.log(`  ok    ${nome}`);
  else {
    falhas++;
    console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: "pt-BR",
});
const page = await ctx.newPage();

// ------------------------------------------ sem histórico: abertura normal
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
ok(
  "sem histórico, a home não mostra cartão de continuar",
  !(await page.getByText(/Você parou aqui/i).count()),
);

// ----------------------------------------- folhear NÃO grava a posição
await page.goto(`${BASE}/biblia/John/3`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200); // menos que a espera: só passou o olho
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
ok(
  "capítulo aberto por 1,2s não vira posição de leitura",
  !(await page.getByText(/Você parou aqui/i).count()),
);

// ------------------------------------------------- ler de verdade grava
await page.goto(`${BASE}/biblia/John/3`, { waitUntil: "networkidle" });
await page.waitForTimeout(ESPERA + 2500);

const gravado = await page.evaluate(() =>
  globalThis.localStorage.getItem("verbo.posicao-de-leitura.v1"),
);
ok("depois da espera, a posição foi gravada", Boolean(gravado), "nada em localStorage");
if (gravado) {
  const p = JSON.parse(gravado);
  ok("gravou OSIS e capítulo certos", p.osis === "John" && p.chapter === 3, JSON.stringify(p));
  ok("gravou o slug da tradução", typeof p.translation === "string" && p.translation.length > 0);
  ok("NÃO gravou rolagem, versículo nem métricas", Object.keys(p).length === 4, Object.keys(p).join(","));
}

// ------------------------------------------------ a home mostra e navega
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
ok("a home mostra o cartão de continuar", (await page.getByText(/Você parou aqui/i).count()) > 0);
ok("o cartão nomeia o livro e o capítulo", (await page.getByText(/João\s*3/).count()) > 0);

/* A abertura é SUBSTITUÍDA, não empilhada: duas regiões de destaque na mesma
   dobra competiriam, e a que tem um botão venceria. */
const salmo = await page.getByText(/O SENHOR é o meu pastor/i).count();
ok("o versículo de abertura foi substituído, não empilhado", salmo === 0);

const link = page.locator('a[href="/biblia/John/3"]').first();
ok("o cartão é um link para o capítulo salvo", (await link.count()) > 0);
if (await link.count()) {
  const caixa = await link.boundingBox();
  ok(
    "o alvo do cartão tem pelo menos 24x24",
    caixa && caixa.width >= 24 && caixa.height >= 24,
    caixa ? `${Math.round(caixa.width)}x${Math.round(caixa.height)}` : "sem caixa",
  );
  await link.click();
  await page.waitForURL(/\/biblia\/John\/3/, { timeout: 10_000 });
  ok("continuar leva de volta ao capítulo", page.url().includes("/biblia/John/3"));
}

// ------------------------------ posição corrompida não quebra nem engana
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.evaluate(() =>
  globalThis.localStorage.setItem(
    "verbo.posicao-de-leitura.v1",
    JSON.stringify({ translation: "blivre", osis: "John", chapter: 999, lastReadAt: "x" }),
  ),
);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
ok(
  "capítulo inexistente é descartado e a home volta à abertura",
  (await page.getByText(/Você parou aqui/i).count()) === 0,
);

await browser.close();
console.log(
  falhas === 0
    ? "\nCiclo ler → parar → voltar → continuar verificado.\n"
    : `\n${falhas} falha(s).\n`,
);
process.exit(falhas === 0 ? 0 : 1);
