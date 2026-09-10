const URL = "http://127.0.0.1:54321/functions/v1/embed";
const texto = "Não estejais inquietos por coisa alguma; antes, as vossas petições sejam em tudo conhecidas diante de Deus, pela oração e súplica, com ação de graças.";

for (const n of [5, 10, 20, 30, 40, 60]) {
  const texts = Array.from({ length: n }, (_, i) => `${texto} ${i}`);
  const t0 = Date.now();
  try {
    const r = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });
    const ms = Date.now() - t0;
    if (!r.ok) { console.log(`  lote ${String(n).padStart(3)}: HTTP ${r.status} em ${ms}ms`); continue; }
    const d = await r.json();
    console.log(`  lote ${String(n).padStart(3)}: ok, ${d.count} vetores em ${String(ms).padStart(5)}ms  =>  ${Math.round(n/(ms/1000))}/s`);
  } catch (e) {
    console.log(`  lote ${String(n).padStart(3)}: erro ${e.message}`);
  }
}
