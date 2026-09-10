/**
 * SONDAGEM: o gte-small serve para busca semântica em português?
 *
 *   npx tsx scripts/embed/evaluate-gte.ts [amostra]
 *
 * O spec registra como risco que o gte-small é treinado em inglês, e toda a
 * busca semântica do VERBO depende dele. Este script responde antes de
 * construirmos o pipeline em cima: gera embeddings de uma amostra da Bíblia,
 * faz perguntas temáticas em português, e mede se os versículos certos
 * aparecem entre os dez primeiros.
 *
 * O resultado NÃO é a última palavra sobre qualidade teológica — é um piso.
 * Se o modelo não achar Isaías 41:10 perguntando sobre medo, ele não serve.
 */

import { readFileSync } from "node:fs";
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { adapt } from "../import/adapt-blivre";
import { buildChunks, type Chunk } from "../../lib/bible/chunker";

/* Roda o gte-small AQUI, em Node, e não pela Edge Function.
 *
 * Medido: a Edge Function embeda ~10/s e o supervisor derruba o worker por
 * limite de recursos depois de algumas centenas — lote de 20 é o teto por
 * requisição, e nem a retomada com espera sustenta 15 mil.
 *
 * Medido também: os vetores dos dois caminhos são IDÊNTICOS, similaridade
 * 1,000000 em cinco amostras (scripts/embed/compare-runtimes.mjs). Então
 * carga em lote roda aqui, e a Edge Function fica com o embedding da
 * pergunta — um texto por vez, que cabe folgado no orçamento. */
const LOTE = 64;

/** Perguntas temáticas com os versículos que uma boa resposta traria. */
const AVALIACAO: Array<{ pergunta: string; esperados: string[] }> = [
  { pergunta: "O que a Bíblia fala sobre ansiedade?", esperados: ["Phil 4:6", "1Pet 5:7", "Matt 6:25"] },
  { pergunta: "O que a Bíblia fala sobre medo?", esperados: ["Isa 41:10", "Ps 23:4", "2Tim 1:7", "Josh 1:9"] },
  { pergunta: "O que a Bíblia diz sobre o perdão?", esperados: ["Eph 4:32", "Col 3:13", "Matt 6:14"] },
  { pergunta: "O que é o amor?", esperados: ["1Cor 13:4", "1Cor 13:1", "1John 4:8"] },
  { pergunta: "Como devo orar?", esperados: ["Matt 6:9", "Luke 11:2"] },
  { pergunta: "O que a Bíblia fala sobre dinheiro e riqueza?", esperados: ["Matt 6:24", "1Tim 6:10"] },
  { pergunta: "Quem é o bom pastor?", esperados: ["John 10:11", "Ps 23:1"] },
  { pergunta: "O que a Bíblia diz sobre o casamento?", esperados: ["Gen 2:24", "Eph 5:25"] },
  { pergunta: "Como encontrar paz?", esperados: ["John 14:27", "Phil 4:7"] },
  { pergunta: "O que é a sabedoria?", esperados: ["Prov 9:10", "Jas 1:5", "Prov 1:7"] },
  { pergunta: "O que acontece depois da morte?", esperados: ["John 11:25", "1Cor 15:22", "Rev 21:4"] },
  { pergunta: "Como devo tratar meu próximo?", esperados: ["Matt 22:39", "Luke 10:27", "Lev 19:18"] },
];

function cosseno(a: number[], b: number[]): number {
  // Vetores já vêm normalizados do gte-small, então o produto interno basta.
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/* O retorno de `pipeline` é uma união de todos os tipos de pipeline, e uma
   união de assinaturas incompatíveis não é chamável. Declarar a específica
   resolve — e documenta qual das 24 estamos usando. */
let extrair: FeatureExtractionPipeline | undefined;

async function embed(texts: string[]): Promise<number[][]> {
  extrair ??= (await pipeline(
    "feature-extraction",
    "Supabase/gte-small",
  )) as FeatureExtractionPipeline;

  const saida = await extrair(texts, { pooling: "mean", normalize: true });
  const dados = Array.from(saida.data as Float32Array);
  const dims = dados.length / texts.length;
  return texts.map((_, i) => dados.slice(i * dims, (i + 1) * dims));
}

/** Um chunk cobre uma referência "Osis c:v"? */
function cobre(chunk: Chunk, ref: string): boolean {
  const [osis, cv] = ref.split(" ");
  const [c, v] = cv.split(":").map(Number);
  return (
    chunk.osis === osis &&
    chunk.chapter === c &&
    chunk.verseStart <= v &&
    chunk.verseEnd >= v
  );
}

async function main(): Promise<void> {
  const amostra = Number(process.argv[2] ?? 0);

  const bible = adapt(readFileSync("data/source/BLIVRE.json", "utf8"));
  let chunks = buildChunks(
    bible.verses.map((v) => ({
      osis: v.osis,
      chapter: v.c,
      verse: v.v,
      text: v.t,
    })),
  );
  console.log(`chunks gerados: ${chunks.length.toLocaleString("pt-BR")}`);

  if (amostra > 0 && amostra < chunks.length) {
    // Amostra determinística que PRESERVA os chunks das respostas esperadas,
    // senão o teste mediria a amostragem em vez do modelo.
    const obrigatorios = new Set<number>();
    chunks.forEach((c, i) => {
      for (const { esperados } of AVALIACAO) {
        if (esperados.some((r) => cobre(c, r))) obrigatorios.add(i);
      }
    });
    const resto = chunks
      .map((_, i) => i)
      .filter((i) => !obrigatorios.has(i))
      .filter((_, k) => k % Math.ceil(chunks.length / amostra) === 0);
    const escolhidos = [...obrigatorios, ...resto].sort((a, b) => a - b);
    chunks = escolhidos.map((i) => chunks[i]);
    console.log(
      `amostra: ${chunks.length.toLocaleString("pt-BR")} chunks ` +
        `(${obrigatorios.size} contêm respostas esperadas, o resto é distrator)`,
    );
  }

  // ------------------------------------------------------------ embeddings
  const vetores: number[][] = new Array<number[]>(chunks.length);
  const t0 = Date.now();
  let feitos = 0;

  for (let i = 0; i < chunks.length; i += LOTE) {
    const fatia = chunks.slice(i, i + LOTE);
    const vs = await embed(fatia.map((c) => c.content));
    vs.forEach((v, j) => (vetores[i + j] = v));
    feitos += vs.length;
    if (i % (LOTE * 8) === 0 || feitos === chunks.length) {
      const seg = (Date.now() - t0) / 1000;
      process.stdout.write(
        `\rembedando ${feitos}/${chunks.length}  (${Math.round(feitos / seg)}/s)`,
      );
    }
  }
  const segTotal = (Date.now() - t0) / 1000;
  console.log(
    `\n${vetores.length} embeddings em ${segTotal.toFixed(1)}s ` +
      `(${Math.round(vetores.length / segTotal)}/s)`,
  );
  console.log(
    `estimativa para a Bíblia inteira: ` +
      `${Math.round((15551 / (vetores.length / segTotal)) )}s\n`,
  );

  // ------------------------------------------------------------- avaliação
  console.log("Recall@10 — o versículo esperado aparece entre os 10 primeiros?\n");
  let acertos = 0;

  for (const { pergunta, esperados } of AVALIACAO) {
    const [qv] = await embed([pergunta]);

    const ranking = vetores
      .map((v, i) => ({ i, s: cosseno(qv, v) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 10);

    const encontrados = esperados.filter((ref) =>
      ranking.some((r) => cobre(chunks[r.i], ref)),
    );
    const ok = encontrados.length > 0;
    if (ok) acertos++;

    const topo = chunks[ranking[0].i];
    console.log(`${ok ? "  ok  " : "  --  "} ${pergunta}`);
    console.log(
      `        esperado: ${esperados.join(", ")}` +
        (ok ? `  → achou ${encontrados.join(", ")}` : "  → NÃO achou nenhum"),
    );
    console.log(
      `        1º lugar: ${topo.osis} ${topo.chapter}:${topo.verseStart}` +
        `-${topo.verseEnd} (${ranking[0].s.toFixed(3)}) ` +
        `"${topo.content.slice(0, 58)}…"`,
    );
  }

  const pct = Math.round((acertos / AVALIACAO.length) * 100);
  console.log(
    `\nRecall@10: ${acertos}/${AVALIACAO.length} (${pct}%)\n` +
      (pct >= 75
        ? "O gte-small serve para português. Seguir com ele.\n"
        : pct >= 50
          ? "Resultado limítrofe. Comparar com text-embedding-3-small antes de decidir.\n"
          : "O gte-small NÃO serve para português. Trocar o modelo.\n"),
  );
}

main().catch((e: unknown) => {
  console.error(`falhou: ${(e as Error).message}`);
  process.exit(1);
});
