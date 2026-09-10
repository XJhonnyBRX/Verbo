/**
 * Os embeddings gerados em Node são os mesmos da Edge Function?
 *
 *   node scripts/embed/compare-runtimes.mjs
 *
 * A pergunta importa porque a carga em lote não cabe na Edge Function — o
 * supervisor derruba o worker por limite de recursos depois de algumas
 * centenas de embeddings. Se os dois caminhos produzirem o mesmo vetor,
 * podemos gerar os 15 mil chunks aqui e deixar a Edge Function só com o
 * embedding da pergunta, que é um texto por vez e cabe folgado.
 *
 * Se NÃO produzirem, o plano muda: os vetores do banco e o da consulta
 * viveriam em espaços diferentes, e a busca semântica devolveria ordem
 * aleatória sem dar erro nenhum — o pior tipo de falha.
 */

import { pipeline } from "@huggingface/transformers";

const EMBED_URL = "http://127.0.0.1:54321/functions/v1/embed";

const AMOSTRAS = [
  "O Senhor é meu pastor, nada me faltará.",
  "Não estejais inquietos por coisa alguma; antes, as vossas petições sejam em tudo conhecidas diante de Deus.",
  "Porque Deus amou ao mundo de tal maneira, que deu o seu Filho unigênito.",
  "O que a Bíblia fala sobre ansiedade?",
  "Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.",
];

function cosseno(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

console.log("carregando Supabase/gte-small em Node…");
const extrair = await pipeline("feature-extraction", "Supabase/gte-small");

console.log("gerando pelos dois caminhos…\n");

const r = await fetch(EMBED_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ texts: AMOSTRAS }),
});
if (!r.ok) {
  console.error(`Edge Function falhou: ${r.status} ${await r.text()}`);
  process.exit(1);
}
const { embeddings: edge } = await r.json();

let pior = 1;
for (const [i, texto] of AMOSTRAS.entries()) {
  const saida = await extrair(texto, { pooling: "mean", normalize: true });
  const local = Array.from(saida.data);

  const sim = cosseno(local, edge[i]);
  pior = Math.min(pior, sim);

  const normaLocal = Math.sqrt(cosseno(local, local));
  console.log(`  similaridade ${sim.toFixed(6)}   dims ${local.length}/${edge[i].length}   norma ${normaLocal.toFixed(4)}`);
  console.log(`     "${texto.slice(0, 62)}…"`);
}

console.log(
  `\npior similaridade: ${pior.toFixed(6)}\n` +
    (pior > 0.999
      ? "COMPATÍVEIS. Pode gerar o lote em Node e consultar pela Edge Function.\n"
      : pior > 0.99
        ? "QUASE. Diferença pequena mas real — investigar antes de confiar.\n"
        : "INCOMPATÍVEIS. Os dois caminhos vivem em espaços diferentes; não misture.\n"),
);
