/**
 * Recorta um corpus de vetores já gerado para o subconjunto adversarial.
 *
 *   MODELO=Xenova/multilingual-e5-small npx tsx scripts/embed/slice-subset.ts
 *
 * O Gemini precisa gastar cota para existir no subconjunto. O e5 e o gte não:
 * os vetores do corpus inteiro já estão em disco, e um vetor não muda porque
 * o corpus ao redor encolheu. Recortar é aritmética de arquivo.
 *
 * ISTO É O QUE TORNA O EXPERIMENTO LEGÍVEL. Um número do Gemini sozinho, num
 * corpus de 1.800, não se compara com os 54% que o e5 tirou em 15.246 — corpus
 * menor tem menos distratores e infla todo mundo. Só a mesma régua responde
 * «o Gemini resolve as armadilhas que o e5 não resolveu?».
 *
 * `TRUNCAR=N` recorta só os N primeiros índices do subconjunto, para casar com
 * uma geração do Gemini interrompida pela cota diária. A ordem das camadas em
 * build-subset.ts é o que faz um prefixo continuar sendo um corpus adversarial.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Chunk } from "../../lib/bible/chunker";

const MODELO = process.env.MODELO ?? "Xenova/multilingual-e5-small";
const SUBSET = process.env.SUBSET ?? "data/subset/subset.json";
const TRUNCAR = Number(process.env.TRUNCAR ?? 0);

function main(): void {
  const origem = path.join("data", "vectors", MODELO.replace(/[/\\]/g, "__"));
  const destino = `${origem}__subset`;

  if (!existsSync(path.join(origem, "meta.json"))) {
    console.error(`${origem} não tem meta.json — o corpus completo não está pronto.`);
    process.exit(1);
  }

  const meta = JSON.parse(readFileSync(path.join(origem, "meta.json"), "utf8")) as {
    modelo: string;
    dims: number;
    chunks: number;
  };
  const chunks = JSON.parse(readFileSync(path.join(origem, "chunks.json"), "utf8")) as Chunk[];
  const sub = JSON.parse(readFileSync(SUBSET, "utf8")) as { indices: number[] };

  let indices = sub.indices;
  if (TRUNCAR > 0) indices = indices.slice(0, TRUNCAR);

  const dims = meta.dims;
  const bruto = readFileSync(path.join(origem, "corpus.f32"));
  const cheio = new Float32Array(bruto.buffer, bruto.byteOffset, bruto.length / 4);
  if (cheio.length / dims !== chunks.length) {
    console.error(
      `corpus.f32 tem ${cheio.length / dims} vetores para ${chunks.length} chunks.`,
    );
    process.exit(1);
  }

  const saida = new Float32Array(indices.length * dims);
  indices.forEach((idx, i) => {
    saida.set(cheio.subarray(idx * dims, (idx + 1) * dims), i * dims);
  });

  mkdirSync(destino, { recursive: true });
  writeFileSync(path.join(destino, "corpus.f32"), Buffer.from(saida.buffer));
  writeFileSync(
    path.join(destino, "chunks.json"),
    JSON.stringify(indices.map((i) => chunks[i])),
    "utf8",
  );
  // As consultas não dependem do corpus: o mesmo arquivo serve.
  copyFileSync(path.join(origem, "queries.f32"), path.join(destino, "queries.f32"));
  writeFileSync(
    path.join(destino, "meta.json"),
    JSON.stringify(
      {
        ...meta,
        chunks: indices.length,
        recortadoDe: origem,
        subconjunto: SUBSET,
        /* Nada foi embedado aqui. Zerar os tempos evitaria a armadilha
           oposta — um modelo «infinitamente rápido» numa tabela. */
        geracaoSegundos: null,
        porSegundo: null,
        geradoEm: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`${indices.length} vetores de ${dims} dims recortados para ${destino}`);
}

main();
