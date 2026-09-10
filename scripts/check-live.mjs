import { chromium } from "playwright";
const BASE = process.argv[2] ?? "https://verbo-liard.vercel.app";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
for (const rota of ["/", "/biblia/John/3", "/buscar"]) {
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("console", m => { if (m.type() === "error") erros.push(m.text()); });
  await p.goto(BASE + rota, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  const texto = (await p.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 130);
  console.log(`${rota}`);
  console.log(`  tela: ${texto}`);
  if (erros.length) console.log(`  erro: ${erros[0].slice(0, 130)}`);
  await p.close();
}
await b.close();
