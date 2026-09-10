/**
 * Audita o RLS na nuvem com a chave ANONIMA, que e a que vai para o bundle.
 * Roda antes de publicar a chave num repositorio publico: se o anon puder
 * escrever ou ler o que nao deve, a chave deixa de ser segura para expor.
 */
process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json" };

let falhas = 0;
const chk = (nome, ok, det = "") => {
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok   " : "FALHA"} ${nome}${det ? ` — ${det}` : ""}`);
};

async function req(metodo, caminho, corpo) {
  const r = await fetch(`${url}/rest/v1/${caminho}`, {
    method: metodo, headers: H, body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { s: r.status, t: (await r.text()).slice(0, 90) };
}

console.log("LEITURA — o que o anonimo PODE ver:");
let x = await req("GET", "bible_verses?select=text&limit=1");
chk("Escritura legivel", x.s === 200 && x.t.length > 10);
x = await req("GET", "bible_translations?select=license&limit=1");
chk("licenca legivel (atribuicao CC BY)", x.s === 200 && x.t.includes("Creative"));

console.log("\nLEITURA — o que o anonimo NAO pode ver:");
for (const t of ["verse_chunks", "notes", "favorites", "profiles", "ai_messages", "ai_answer_cache", "ai_usage_daily"]) {
  x = await req("GET", `${t}?select=*&limit=1`);
  const vazio = x.t === "[]" || x.s === 401 || x.s === 403 || x.s === 404;
  chk(`${t} invisivel`, vazio, vazio ? "" : `HTTP ${x.s} ${x.t}`);
}

console.log("\nESCRITA — o anonimo NAO pode escrever em nada:");
x = await req("POST", "bible_verses", { translation_id: 1, book_id: 1, chapter: 1, verse: 1, text: "adulterado" });
chk("nao escreve na Escritura", x.s >= 400, `HTTP ${x.s}`);
x = await req("POST", "notes", { user_id: "00000000-0000-0000-0000-000000000000", book_id: 1, chapter: 1, verse_start: 1, verse_end: 1, body: "x" });
chk("nao escreve anotacao de outro", x.s >= 400, `HTTP ${x.s}`);
x = await req("POST", "bible_translations", { slug: "falsa", name: "x", abbrev: "x", license: "x" });
chk("nao cria traducao", x.s >= 400, `HTTP ${x.s}`);
x = await req("PATCH", "bible_verses?id=eq.1", { text: "adulterado" });
chk("nao altera versiculo", x.s >= 400, `HTTP ${x.s}`);
x = await req("DELETE", "bible_verses?id=eq.1");
chk("nao apaga versiculo", x.s >= 400, `HTTP ${x.s}`);

console.log(falhas === 0
  ? "\nRLS integro. A chave anonima e segura para expor.\n"
  : `\n${falhas} FALHA(S). NAO publique a chave ate resolver.\n`);
process.exit(falhas === 0 ? 0 : 1);
