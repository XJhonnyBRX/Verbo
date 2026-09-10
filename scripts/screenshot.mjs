import { chromium } from "playwright";

const OUT = process.argv[2];
const BASE = process.argv[3] ?? "http://localhost:3210";

const pages = [
  ["home", "/"],
  ["leitor", "/biblia/John/3"],
  ["buscar", "/buscar"],
  ["perguntar", "/perguntar"],
];

const browser = await chromium.launch();

for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: scheme,
    locale: "pt-BR",
  });

  for (const [name, path] of pages) {
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: "networkidle" });

    // Diagnóstico de overflow horizontal: quem é mais largo que a viewport.
    const diag = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const offenders = [];
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || "").toString().slice(0, 60),
            left: Math.round(r.left),
            right: Math.round(r.right),
          });
        }
      }
      return {
        vw,
        scrollWidth: document.documentElement.scrollWidth,
        offenders: offenders.slice(0, 6),
      };
    });

    if (scheme === "light") {
      console.log(
        `${name}: vw=${diag.vw} scrollWidth=${diag.scrollWidth}` +
          (diag.offenders.length
            ? `\n  OVERFLOW: ${JSON.stringify(diag.offenders)}`
            : "  (sem overflow)"),
      );
    }

    // O leitor e a home buscam do banco depois de hidratar; sem esperar, a
    // captura pega a tela de "carregando".
    if (name === "leitor") {
      await page.locator(".verse-num").first().waitFor({ state: "visible" });
    }
    if (name === "home") {
      await page.locator(".anchor-ref").first().waitFor({ state: "visible" });
    }

    // /perguntar precisa de interação para mostrar a âncora. O clique só vale
    // depois da hidratação — antes dela o React ainda não anexou os listeners
    // e o clique é silenciosamente engolido.
    if (name === "perguntar") {
      const suggestion = page.getByRole("button", { name: /ansiedade/i });
      await suggestion.waitFor({ state: "visible" });
      const anchor = page.locator(".anchor-ref").first();

      // Sondar as entranhas do React é frágil. Reclicar até a interface
      // responder é honesto e funciona em qualquer versão.
      for (let attempt = 0; attempt < 20; attempt++) {
        await suggestion.click();
        try {
          await anchor.waitFor({ state: "visible", timeout: 1000 });
          break;
        } catch {
          /* ainda não hidratou */
        }
      }
      await anchor.waitFor({ state: "visible" });
      await page.waitForTimeout(600);
    }

    await page.screenshot({
      path: `${OUT}/${name}-${scheme}.png`,
      fullPage: name === "home" ? false : true,
    });
    await page.close();
  }
  await ctx.close();
}

await browser.close();
console.log("ok");
