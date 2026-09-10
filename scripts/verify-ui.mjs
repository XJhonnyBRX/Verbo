/**
 * Verificação da interface contra o navegador de verdade.
 *
 * Três coisas que não podem regredir sem alguém saber:
 *   1. A regra de ouro na tela — citação inventada não vira âncora.
 *   2. Contraste do texto pequeno — o piso de acessibilidade.
 *   3. Ausência de overflow horizontal em largura de celular.
 *
 * Uso: node scripts/verify-ui.mjs [http://localhost:3210]
 */

import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3210";
const ROUTES = ["/", "/biblia/John/3", "/buscar", "/perguntar", "/conta"];

let failures = 0;

function check(name, ok, detail = "") {
  if (ok) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FALHA ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Luminância relativa por WCAG 2.1. */
function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

function parseRgb(value) {
  const nums = value.match(/[\d.]+/g);
  if (!nums || nums.length < 3) throw new Error(`cor ilegível: ${value}`);
  return nums.slice(0, 3).map(Number);
}

const browser = await chromium.launch();

// ---------------------------------------------------------------- overflow
console.log("\nOverflow horizontal em 390px:");
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  for (const route of ROUTES) {
    const page = await ctx.newPage();
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    const { vw, sw } = await page.evaluate(() => ({
      vw: document.documentElement.clientWidth,
      sw: document.documentElement.scrollWidth,
    }));
    check(route, sw <= vw, `scrollWidth=${sw} > viewport=${vw}`);
    await page.close();
  }
  await ctx.close();
}

// ---------------------------------------------------------------- contraste
console.log("\nContraste do texto pequeno (mínimo 4,5:1):");
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/biblia/John/3`, { waitUntil: "networkidle" });

  // O leitor busca o capítulo no banco depois de hidratar, então os números
  // de versículo não existem no primeiro paint. Sem esta espera a medição de
  // contraste lê `null` e o script quebra de um jeito que parece bug de CSS.
  await page.locator(".verse-num").first().waitFor({ state: "attached" });

  const colors = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const num = document.querySelector(".verse-num");
    const ref = document.createElement("span");
    ref.className = "anchor-ref";
    document.body.appendChild(ref);
    const refColor = getComputedStyle(ref).color;
    ref.remove();
    return {
      background: body.backgroundColor,
      verseNum: num ? getComputedStyle(num).color : null,
      rubric: refColor,
    };
  });

  const bg = parseRgb(colors.background);

  const numRatio = contrast(parseRgb(colors.verseNum), bg);
  check(
    `${scheme}: número do versículo`,
    numRatio >= 4.5,
    `${numRatio.toFixed(2)}:1`,
  );

  const rubricRatio = contrast(parseRgb(colors.rubric), bg);
  check(
    `${scheme}: referência em vermelho`,
    rubricRatio >= 4.5,
    `${rubricRatio.toFixed(2)}:1`,
  );

  await ctx.close();
}

// ------------------------------------------------------------ regra de ouro
console.log("\nRegra de ouro na tela:");
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/perguntar`, { waitUntil: "networkidle" });

  const suggestion = page.getByRole("button", { name: /ansiedade/i });
  await suggestion.waitFor({ state: "visible" });
  const firstAnchor = page.locator(".anchor-ref").first();
  for (let i = 0; i < 20; i++) {
    await suggestion.click();
    try {
      await firstAnchor.waitFor({ state: "visible", timeout: 1000 });
      break;
    } catch {
      /* aguardando hidratação */
    }
  }

  const answerText = await page.locator("section[aria-live]").innerText();
  const refs = await page.locator(".anchor-ref").allInnerTexts();

  check("a resposta cita Salmos 151:2", answerText.includes("Salmos 151:2"));
  check(
    "duas âncoras renderizadas",
    refs.length === 2,
    `foram ${refs.length}: ${refs.join(" | ")}`,
  );
  check("âncora de Filipenses 4:6-7", refs.includes("Filipenses 4:6-7"));
  check("âncora de 1 Pedro 5:7", refs.includes("1 Pedro 5:7"));
  check(
    "NENHUMA âncora para o versículo inventado",
    !refs.some((r) => r.includes("151")),
    `âncoras: ${refs.join(" | ")}`,
  );
  check(
    "o descarte é informado ao usuário",
    /descartada[s]? por não\s+existir na Escritura: Salmos 151:2/.test(
      answerText.replace(/\s+/g, " "),
    ) || answerText.includes("Salmos 151:2 ."),
    answerText.slice(-220),
  );

  // Cada âncora traz texto real de versículo, não só o rótulo.
  const anchorTexts = await page.locator(".anchor-text").allInnerTexts();
  check(
    "cada âncora traz o texto do versículo",
    anchorTexts.length === 2 && anchorTexts.every((t) => t.trim().length > 40),
    anchorTexts.map((t) => t.slice(0, 30)).join(" | "),
  );

  await ctx.close();
}

await browser.close();

console.log(
  failures === 0
    ? "\nTudo passou.\n"
    : `\n${failures} verificação(ões) falharam.\n`,
);
process.exit(failures === 0 ? 0 : 1);
