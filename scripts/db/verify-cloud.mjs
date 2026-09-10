process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json" };

async function rpc(nome, corpo) {
  const r = await fetch(`${url}/rest/v1/rpc/${nome}`, { method: "POST", headers: H, body: JSON.stringify(corpo) });
  return { status: r.status, dados: await r.json().catch(() => null) };
}

console.log("=== resolve_passage: Joao 3:16 ===");
let x = await rpc("resolve_passage", { p_translation: "blivre", p_osis: "John", p_chapter: 3, p_verse_start: 16, p_verse_end: null });
console.log(` HTTP ${x.status}`, x.dados?.[0]?.verse_text?.slice(0, 84) ?? JSON.stringify(x.dados)?.slice(0,120));

console.log("=== search_verses: abismo ===");
x = await rpc("search_verses", { p_query: "abismo", p_translation: "blivre", p_limit: 3 });
console.log(` HTTP ${x.status}`, (x.dados ?? []).map(v => `${v.book_name} ${v.chapter}:${v.verse}`).join(" | "));

console.log("=== referencia inventada (Salmos 151:2) ===");
x = await rpc("resolve_passage", { p_translation: "blivre", p_osis: "Ps", p_chapter: 151, p_verse_start: 2, p_verse_end: null });
console.log(` HTTP ${x.status}  linhas: ${Array.isArray(x.dados) ? x.dados.length : "?"}  <- zero e o correto`);

console.log("=== verse_chunks deve estar invisivel ===");
const r = await fetch(`${url}/rest/v1/verse_chunks?select=id&limit=1`, { headers: H });
console.log(` HTTP ${r.status}`, (await r.text()).slice(0, 60));

console.log("=== licenca para a atribuicao ===");
const t = await fetch(`${url}/rest/v1/bible_translations?select=name,license&slug=eq.blivre`, { headers: H });
console.log(` HTTP ${t.status}`, (await t.text()).slice(0, 130));
