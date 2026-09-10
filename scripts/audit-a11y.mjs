/**
 * Auditoria de acessibilidade contra o navegador de verdade.
 *
 *   node scripts/audit-a11y.mjs [url]
 *
 * Mede o que dá para medir sem opinião: alvos de toque, foco visível,
 * rótulos, ordem de cabeçalhos, idioma declarado, e movimento respeitando
 * a preferência do sistema.
 *
 * NÃO substitui teste com leitor de tela real nem com pessoas. Serve de
 * piso: o que falhar aqui, falha para todo mundo.
 *
 * Critérios da WCAG 2.2 usados:
 *   1.3.1 informação e relações       cabeçalhos, rótulos
 *   2.4.7 foco visível
 *   2.5.8 tamanho de alvo (mínimo)    24x24 px CSS
 *   3.1.1 idioma da página
 *   2.3.3 animação a partir de interação  prefers-reduced-motion
 */

import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3210";
const ROTAS = ["/", "/biblia/John/3", "/buscar", "/perguntar", "/conta"];

let falhas = 0;
let avisos = 0;

function ok(nome, cond, detalhe = "") {
  if (cond) {
    console.log(`  ok    ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

function aviso(nome, cond, detalhe = "") {
  if (!cond) {
    avisos++;
    console.log(`  aviso ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: "pt-BR",
});

for (const rota of ROTAS) {
  console.log(`\n${rota}`);
  const page = await ctx.newPage();
  await page.goto(BASE + rota, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // ------------------------------------------------- 3.1.1 idioma da página
  const lang = await page.getAttribute("html", "lang");
  ok("idioma declarado em <html>", lang === "pt-BR", `veio "${lang}"`);

  // ------------------------------------- 2.5.8 tamanho de alvo (24x24 px)
  const alvosPequenos = await page.evaluate(() => {
    const sel = "a, button, input, select, textarea, [role=button]";
    const ruins = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // invisível
      /* O link de pular conteudo e alvo de TECLADO, nao de ponteiro: fica
         1x1 ate receber foco, quando entao aparece em tamanho normal. O
         criterio 2.5.8 fala de alvo de ponteiro, entao ele nao se aplica. */
      if (el.className && String(el.className).includes("sr-only")) continue;
      if (r.width < 24 || r.height < 24) {
        ruins.push({
          tag: el.tagName.toLowerCase(),
          texto: (el.textContent ?? "").trim().slice(0, 28),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }
    return ruins;
  });
  ok(
    "alvos de toque com pelo menos 24x24",
    alvosPequenos.length === 0,
    alvosPequenos
      .slice(0, 3)
      .map((a) => `${a.tag} "${a.texto}" ${a.w}x${a.h}`)
      .join("; "),
  );

  // ------------------------------------------------- 1.3.1 rótulo acessível
  const semNome = await page.evaluate(() => {
    const ruins = [];
    for (const el of document.querySelectorAll("a, button, input, [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const nome =
        el.getAttribute("aria-label") ??
        el.getAttribute("title") ??
        (el.tagName === "INPUT"
          ? document.querySelector(`label[for="${el.id}"]`)?.textContent
          : null) ??
        el.textContent;
      if (!nome || !nome.trim()) {
        ruins.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`);
      }
    }
    return ruins;
  });
  ok("todo controle tem nome acessível", semNome.length === 0, semNome.slice(0, 4).join(", "));

  // ------------------------------------------- 1.3.1 hierarquia de títulos
  const titulos = await page.evaluate(() =>
    [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => ({
      nivel: Number(h.tagName[1]),
      texto: (h.textContent ?? "").trim().slice(0, 30),
    })),
  );
  ok("existe exatamente um h1", titulos.filter((t) => t.nivel === 1).length === 1,
     `${titulos.filter((t) => t.nivel === 1).length} encontrados`);
  let saltou = false;
  for (let i = 1; i < titulos.length; i++) {
    if (titulos[i].nivel - titulos[i - 1].nivel > 1) saltou = true;
  }
  ok("não pula nível de título", !saltou);

  // ----------------------------------------------------- 2.4.7 foco visível
  const focoVisivel = await page.evaluate(() => {
    const alvo = document.querySelector("a[href], button");
    if (!alvo) return true;
    alvo.focus();
    const s = getComputedStyle(alvo);
    const temOutline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
    const temSombra = s.boxShadow !== "none";
    return temOutline || temSombra;
  });
  ok("foco de teclado é visível", focoVisivel);

  await page.close();
}

// ------------------------------- 2.3.3 respeitar prefers-reduced-motion
console.log("\npreferência de movimento reduzido");
const ctxRm = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const p = await ctxRm.newPage();
await p.goto(`${BASE}/perguntar`, { waitUntil: "networkidle" });
const duracao = await p.evaluate(() => {
  const el = document.createElement("div");
  el.className = "anchor-enter";
  document.body.appendChild(el);
  const d = getComputedStyle(el).animationDuration;
  el.remove();
  return d;
});
ok("animação some com movimento reduzido", parseFloat(duracao) < 0.05, `duração ${duracao}`);
await ctxRm.close();

// ---------------------------------------------- leitura em voz: existe?
console.log("\nleitura em áudio");
const p2 = await ctx.newPage();
await p2.goto(`${BASE}/biblia/John/3`, { waitUntil: "networkidle" });
await p2.waitForTimeout(2000);
const temOuvir = await p2.evaluate(() =>
  [...document.querySelectorAll("button, a")].some((e) =>
    /ouvir|reproduzir|áudio|audio|play/i.test(e.textContent ?? ""),
  ),
);
aviso("existe controle de ouvir o capítulo", temOuvir, "ausente — MVP de acessibilidade");
await p2.close();

await browser.close();

console.log(
  `\n${falhas} falha(s), ${avisos} aviso(s).\n` +
    (falhas === 0 ? "Piso de acessibilidade atendido.\n" : "Corrigir as falhas acima.\n"),
);
process.exit(falhas === 0 ? 0 : 1);
