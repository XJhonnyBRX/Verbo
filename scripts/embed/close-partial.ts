/**
 * Fecha uma geração interrompida pela cota, deixando-a mensurável.
 *
 *   MODELO=gemini-embedding-2 DIMS=768 npx tsx scripts/embed/close-partial.ts
 *
 * A ordem das camadas em build-subset.ts existe para que uma geração truncada
 * continue valendo. Mas «continuar valendo» exige três coisas que o
 * build-vectors só faz no fim, depois do corpus inteiro:
 *
 *   queries.f32   as 16 consultas — sem elas não há o que medir
 *   chunks.json   recortado para o que realmente existe em corpus.f32
 *   meta.json     cuja presença é o sinal de «pode medir»
 *
 * Este script faz exatamente isso e nada mais. Custa 16 requisições, contra as
 * centenas que faltariam para terminar o corpus — e a decisão do experimento
 * não depende do preenchimento aleatório, que é a última camada.
 *
 * `parcial: true` no meta.json não é decorativo. Quem ler o resultado precisa
 * saber que o corpus não é o que o subset.json pediu.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Chunk } from "../../lib/bible/chunker";
import { GeminiEmbeddings } from "../../lib/embeddings/gemini";
import { LocalEmbeddings } from "../../lib/embeddings/local";
import type { EmbeddingProvider } from "../../lib/embeddings/types";
import { CONSULTAS } from "./queries";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* modelos locais não precisam de chave */
}

const MODELO = process.env.MODELO ?? "gemini-embedding-2";
const DIMS = Number(process.env.DIMS ?? 768);
const SUBSET = process.env.SUBSET ?? "data/subset/subset.json";

function criarProvider(): EmbeddingProvider {
  if (MODELO.startsWith("gemini")) {
    const chaves = [
      process.env.GOOGLE_API_KEY,
      process.env.GOOGLE_API_KEY_2,
      process.env.GOOGLE_API_KEY_3,
    ].filter((k): k is string => Boolean(k?.trim()));
    if (chaves.length === 0) {
      console.error("falta GOOGLE_API_KEY em .env.local");
      process.exit(1);
    }
    return new GeminiEmbeddings({ apiKey: chaves, dimensions: DIMS });
  }
  return new LocalEmbeddings({ model: MODELO });
}

async function main(): Promise<void> {
  const dir = path.join("data", "vectors", `${MODELO.replace(/[/\\]/g, "__")}__subset`);
  const arqCorpus = path.join(dir, "corpus.f32");
  if (!existsSync(arqCorpus)) {
    console.error(`${arqCorpus} não existe — nada a fechar.`);
    process.exit(1);
  }

  const gerados = statSync(arqCorpus).size / (DIMS * 4);
  if (!Number.isInteger(gerados)) {
    console.error(`corpus.f32 não é múltiplo de ${DIMS * 4} bytes — truncado no meio de um vetor.`);
    process.exit(1);
  }

  const todos = JSON.parse(readFileSync(path.join(dir, "chunks.json"), "utf8")) as Chunk[];
  const sub = JSON.parse(readFileSync(SUBSET, "utf8")) as {
    total: number;
    camadas: Record<string, number>;
  };

  if (gerados === todos.length) {
    console.log("o corpus está completo — este script é para geração truncada.");
    process.exit(0);
  }

  const corpus = todos.slice(0, gerados);
  console.log(`gerados : ${gerados} de ${sub.total} pedidos`);

  /* Quais camadas sobreviveram ao truncamento. É isto que decide se o corpus
     ainda serve: o núcleo adversarial é ouro + nomeados + léxicos. */
  let acumulado = 0;
  const cobertas: string[] = [];
  for (const [nome, n] of Object.entries(sub.camadas)) {
    const dentro = Math.max(0, Math.min(n, gerados - acumulado));
    cobertas.push(`${nome} ${dentro}/${n}`);
    acumulado += n;
  }
  console.log(`camadas : ${cobertas.join(", ")}`);

  const nucleo = (sub.camadas.ouro ?? 0) + (sub.camadas.nomeados ?? 0) + (sub.camadas.lexicos ?? 0);
  console.log(
    gerados >= nucleo
      ? `núcleo adversarial COMPLETO (${nucleo} chunks); falta só preenchimento de fundo`
      : `NÚCLEO INCOMPLETO: ${gerados} de ${nucleo}. O experimento não é válido assim.`,
  );

  // ------------------------------------------------------------- consultas
  const provider = criarProvider();
  const vs: Float32Array[] = [];
  for (const c of CONSULTAS) vs.push(await provider.embedQuery(c.pergunta));
  const queries = new Float32Array(CONSULTAS.length * DIMS);
  vs.forEach((v, i) => queries.set(v, i * DIMS));
  writeFileSync(path.join(dir, "queries.f32"), Buffer.from(queries.buffer));
  console.log(`${CONSULTAS.length} consultas embedadas`);

  // ------------------------------------------- corpus e identidade recortados
  writeFileSync(path.join(dir, "chunks.json"), JSON.stringify(corpus), "utf8");
  const impressao = createHash("sha256")
    .update(corpus.map((c) => `${c.osis} ${c.chapter}:${c.verseStart}-${c.verseEnd}`).join("|"))
    .digest("hex");
  writeFileSync(path.join(dir, "corpus.id"), impressao, "utf8");

  writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify(
      {
        modelo: provider.model,
        dims: DIMS,
        chunks: corpus.length,
        consultas: CONSULTAS.length,
        parcial: true,
        pedidos: sub.total,
        nucleoAdversarialCompleto: gerados >= nucleo,
        camadas: cobertas,
        /* Não medimos geração aqui: ela aconteceu noutra execução. Zerar
           faria o modelo parecer instantâneo numa tabela comparativa. */
        geracaoSegundos: null,
        porSegundo: null,
        geradoEm: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nfechado em ${dir} — pronto para o benchmark`);
}

main().catch((e: unknown) => {
  console.error(`falhou: ${(e as Error).message}`);
  process.exit(1);
});
