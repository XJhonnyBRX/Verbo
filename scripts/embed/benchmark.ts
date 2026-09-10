/**
 * Mede um modelo contra o conjunto de aceitação.
 *
 *   npx tsx scripts/embed/benchmark.ts [modelo...]
 *   npx tsx scripts/embed/benchmark.ts            # todos os que existirem
 *
 * Lê os vetores que build-vectors.ts deixou em disco, então roda em segundos
 * e pode ser repetido à vontade.
 *
 * MÉTRICAS
 *
 * Recall@k  — alguma referência esperada aparece entre os k primeiros?
 *             É o que importa para o RAG: basta o contexto conter a passagem
 *             certa para o modelo de linguagem poder responder com lastro.
 *
 * MRR       — 1/posição da primeira acertada. Distingue «apareceu em 1º» de
 *             «apareceu em 10º», que o Recall trata igual. Importa porque o
 *             contexto entregue ao Gemini é cortado em top-k.
 *
 * float32 vs float16 — o mesmo ranking com os vetores quantizados. O que se
 *             compara é a QUALIDADE DO RANKING, não o valor da similaridade:
 *             um 0,91 não significa nada isolado; o que importa é se o
 *             resultado certo continua acima dos errados.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Chunk } from "../../lib/bible/chunker";
import { CONSULTAS, parseRef, type Familia } from "./queries";

const RAIZ = path.join("data", "vectors");
const TOPO = 50; // profundidade máxima considerada para o MRR

interface Meta {
  modelo: string;
  dims: number;
  chunks: number;
  segundos: number;
  porSegundo: number;
}

/* Simula o que o pgvector faria com halfvec: passa por precisão de 16 bits e
   volta. O ganho de espaço é conhecido (índice HNSW de 61 para 18 MB numa
   base de 15 mil); o que este benchmark responde é se a ORDEM dos resultados
   sobrevive à perda de precisão. */
function paraFloat16EVolta(v: Float32Array): Float32Array {
  if (typeof Float16Array !== "undefined") {
    const meio = new Float16Array(v.length);
    meio.set(v);
    const saida = new Float32Array(v.length);
    saida.set(meio);
    return saida;
  }

  // Sem Float16Array: trunca a mantissa de 23 para 10 bits, arredondando ao
  // mais próximo — a mesma perda de precisão.
  const saida = new Float32Array(v.length);
  const buf = new DataView(new ArrayBuffer(4));
  for (let i = 0; i < v.length; i++) {
    buf.setFloat32(0, v[i]);
    buf.setUint32(0, (buf.getUint32(0) + 0x00001000) & 0xffffe000);
    saida[i] = buf.getFloat32(0);
  }
  return saida;
}

function cobre(c: Chunk, ref: string): boolean {
  const { osis, chapter, verse } = parseRef(ref);
  return (
    c.osis === osis &&
    c.chapter === chapter &&
    c.verseStart <= verse &&
    c.verseEnd >= verse
  );
}

/**
 * Pesos da nota final.
 *
 * A família paráfrase pesa três vezes mais que a tema, e o motivo é o modo de
 * falha que este benchmark existe para pegar: um modelo que faz casamento
 * lexical disfarçado de semântica vai BEM na família tema, porque a palavra
 * do assunto está na consulta. Só a paráfrase — onde a palavra não aparece —
 * separa entender significado de reconhecer string.
 *
 * O MRR entra porque o contexto entregue ao Gemini é cortado em top-k:
 * aparecer em 1º e aparecer em 10º não valem a mesma coisa.
 */
const PESOS = { parafrase: 0.6, tema: 0.2, mrr: 0.2 } as const;

interface Resultado {
  recall5: number;
  recall10: number;
  mrr: number;
  /** Nota ponderada, 0 a 1. É o número que decide o Ciclo 4.3. */
  nota: number;
  porFamilia: Record<Familia, { recall10: number; mrr: number; n: number }>;
  detalhe: Array<{
    pergunta: string;
    familia: Familia;
    posicao: number | null;
    topo: string;
  }>;
}

function avaliar(
  corpus: Float32Array,
  queries: Float32Array,
  dims: number,
  chunks: Chunk[],
): Resultado {
  const n = chunks.length;
  let r5 = 0;
  let r10 = 0;
  let somaMrr = 0;
  const porFamilia: Record<Familia, { recall10: number; mrr: number; n: number }> = {
    tema: { recall10: 0, mrr: 0, n: 0 },
    parafrase: { recall10: 0, mrr: 0, n: 0 },
  };
  const detalhe: Resultado["detalhe"] = [];

  for (const [qi, consulta] of CONSULTAS.entries()) {
    const q = queries.subarray(qi * dims, (qi + 1) * dims);

    // Ranking por produto interno — os vetores estão normalizados.
    const escores = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const base = i * dims;
      for (let d = 0; d < dims; d++) s += q[d] * corpus[base + d];
      escores[i] = s;
    }
    const ordem = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => escores[b] - escores[a])
      .slice(0, TOPO);

    let posicao: number | null = null;
    for (const [k, idx] of ordem.entries()) {
      if (consulta.esperados.some((ref) => cobre(chunks[idx], ref))) {
        posicao = k + 1;
        break;
      }
    }

    const f = consulta.familia;
    porFamilia[f].n++;
    if (posicao !== null) {
      if (posicao <= 5) r5++;
      if (posicao <= 10) {
        r10++;
        porFamilia[f].recall10++;
      }
      somaMrr += 1 / posicao;
      porFamilia[f].mrr += 1 / posicao;
    }

    const t = chunks[ordem[0]];
    detalhe.push({
      pergunta: consulta.pergunta,
      familia: f,
      posicao,
      topo: `${t.osis} ${t.chapter}:${t.verseStart}-${t.verseEnd}`,
    });
  }

  const total = CONSULTAS.length;
  for (const f of ["tema", "parafrase"] as const) {
    porFamilia[f].mrr /= porFamilia[f].n || 1;
    porFamilia[f].recall10 /= porFamilia[f].n || 1;
  }

  const mrr = somaMrr / total;

  return {
    recall5: r5 / total,
    recall10: r10 / total,
    mrr,
    nota:
      porFamilia.parafrase.recall10 * PESOS.parafrase +
      porFamilia.tema.recall10 * PESOS.tema +
      mrr * PESOS.mrr,
    porFamilia,
    detalhe,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`.padStart(4);
}

function main(): void {
  const pedidos = process.argv.slice(2);
  const dirs = existsSync(RAIZ)
    ? readdirSync(RAIZ).filter(
        (d) =>
          existsSync(path.join(RAIZ, d, "meta.json")) &&
          (pedidos.length === 0 ||
            pedidos.some((p) => d.includes(p.replace(/[/\\]/g, "__")))),
      )
    : [];

  if (dirs.length === 0) {
    console.error(
      `nenhum vetor em ${RAIZ}. Rode primeiro:\n` +
        `  MODELO=<modelo> npx tsx scripts/embed/build-vectors.ts`,
    );
    process.exit(1);
  }

  const linhas: Array<{ meta: Meta; f32: Resultado; f16: Resultado }> = [];

  for (const d of dirs) {
    const dir = path.join(RAIZ, d);
    const meta = JSON.parse(
      readFileSync(path.join(dir, "meta.json"), "utf8"),
    ) as Meta;
    const chunks = JSON.parse(
      readFileSync(path.join(dir, "chunks.json"), "utf8"),
    ) as Chunk[];

    const bufC = readFileSync(path.join(dir, "corpus.f32"));
    const corpus = new Float32Array(
      bufC.buffer,
      bufC.byteOffset,
      bufC.byteLength / 4,
    );
    const bufQ = readFileSync(path.join(dir, "queries.f32"));
    const queries = new Float32Array(
      bufQ.buffer,
      bufQ.byteOffset,
      bufQ.byteLength / 4,
    );

    const f32 = avaliar(corpus, queries, meta.dims, chunks);
    const f16 = avaliar(
      paraFloat16EVolta(corpus),
      paraFloat16EVolta(queries),
      meta.dims,
      chunks,
    );
    linhas.push({ meta, f32, f16 });
  }

  // ------------------------------------------------------------------ tabela
  linhas.sort((a, b) => b.f32.nota - a.f32.nota);

  console.log(
    `\npesos da nota: paráfrase ${PESOS.parafrase * 100}% · ` +
      `tema ${PESOS.tema * 100}% · MRR ${PESOS.mrr * 100}%\n`,
  );
  console.log(
    "modelo                                dims   NOTA |  R@5  R@10   MRR | tema  parafr | f16 nota  Δ",
  );
  console.log("-".repeat(104));
  for (const { meta, f32, f16 } of linhas) {
    const delta = f16.nota - f32.nota;
    console.log(
      `${meta.modelo.padEnd(36)}  ${String(meta.dims).padStart(4)}  ${pct(f32.nota)} | ` +
        `${pct(f32.recall5)} ${pct(f32.recall10)} ${f32.mrr.toFixed(3)} | ` +
        `${pct(f32.porFamilia.tema.recall10)} ${pct(f32.porFamilia.parafrase.recall10)} | ` +
        `   ${pct(f16.nota)}  ${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp`,
    );
  }

  // -------------------------------------------------------------- detalhes
  for (const { meta, f32 } of linhas) {
    console.log(`\n### ${meta.modelo}`);
    for (const d of f32.detalhe) {
      const marca = d.posicao === null ? " -- " : ` ${String(d.posicao).padStart(2)} `;
      console.log(
        `${marca} [${d.familia.padEnd(9)}] ${d.pergunta.padEnd(46)} 1º: ${d.topo}`,
      );
    }
  }
  console.log("");
}

main();
