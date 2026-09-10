/**
 * Mede modelos de embedding contra o conjunto de aceitação do VERBO.
 *
 *   npx tsx scripts/embed/benchmark.ts            # todos os vetores gerados
 *   npx tsx scripts/embed/benchmark.ts e5 gemini  # só os que casarem
 *
 * Lê os vetores que build-vectors.ts deixou em disco, então roda em segundos
 * e pode ser repetido à vontade. Salva o resultado em benchmark/<versão>/.
 *
 * MÉTRICAS, e a distinção entre as duas primeiras importa:
 *
 * Hit@10   — alguma referência relevante apareceu entre as dez primeiras?
 *            Binário. É o piso: sem isso o contexto não tem a passagem.
 *
 * MRR@10   — 1/posição da primeira relevante, zero se não estiver no top-10.
 *            Distingue «veio em 1º» de «veio em 10º», que o Hit trata igual.
 *            Importa porque o contexto entregue ao Gemini é cortado em top-k:
 *            uma passagem em 10º pode nem entrar no prompt.
 *
 * float16  — o mesmo ranking com os vetores quantizados. Compara-se a ORDEM,
 *            não o valor da similaridade.
 *
 * TRÊS VERDADES-BASE, e as três são reportadas:
 *   v1           a lista original, escrita antes de qualquer execução
 *   v2           v1 mais as passagens canônicas que faltavam
 *   v2-sem-viés  v2 excluindo o que algum modelo já havia devolvido na v1
 *
 * A terceira existe para responder «você não ajustou a régua olhando o
 * resultado?». Se v2 e v2-sem-viés derem notas parecidas, não ajustei.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Chunk } from "../../lib/bible/chunker";
import { CONSULTAS, parseRef, referencias, type Familia } from "./queries";

const RAIZ = path.join("data", "vectors");
const SAIDA = "benchmark";
const PROFUNDIDADE = 50; // até onde procuramos, para saber quão longe ficou
const CORTE = 10; // Hit@ e MRR@ usam este corte

type Versao = "v1" | "v2" | "v2-sem-vies";
const VERSOES: Versao[] = ["v1", "v2", "v2-sem-vies"];

/**
 * Pesos da nota.
 *
 * Paráfrase pesa três vezes o tema porque é a única família que separa
 * entender significado de reconhecer string: medido, gte-small e e5 empataram
 * em 50% no tema e ficaram 0% contra 33% na paráfrase.
 */
const PESOS = { parafrase: 0.6, tema: 0.2, mrr: 0.2 } as const;

interface Meta {
  modelo: string;
  dims: number;
  chunks: number;
  segundos: number;
  porSegundo: number;
}

/* Simula o que o pgvector faria com halfvec. O ganho de espaço já é conhecido
   (índice HNSW de 61 para 18 MB numa base de 15 mil); o que se mede aqui é se
   a ORDEM sobrevive à perda de precisão. */
function paraFloat16EVolta(v: Float32Array): Float32Array {
  if (typeof Float16Array !== "undefined") {
    const meio = new Float16Array(v.length);
    meio.set(v);
    const saida = new Float32Array(v.length);
    saida.set(meio);
    return saida;
  }
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

/** 🟢 relevante no top-3 · 🟡 entre 4 e 10 · 🔴 nada no top-10 */
function classificar(posicao: number | null): "verde" | "amarelo" | "vermelho" {
  if (posicao === null || posicao > CORTE) return "vermelho";
  return posicao <= 3 ? "verde" : "amarelo";
}

const SINAL = { verde: "🟢", amarelo: "🟡", vermelho: "🔴" } as const;

interface Detalhe {
  pergunta: string;
  familia: Familia;
  posicao: number | null;
  sinal: "verde" | "amarelo" | "vermelho";
  topo: string;
  topoTexto: string;
  acertou: string | null;
}

interface Resultado {
  versao: Versao;
  hit10: number;
  mrr10: number;
  nota: number;
  porFamilia: Record<Familia, { hit10: number; mrr10: number; n: number }>;
  verdes: number;
  amarelos: number;
  vermelhos: number;
  detalhe: Detalhe[];
}

function avaliar(
  corpus: Float32Array,
  queries: Float32Array,
  dims: number,
  chunks: Chunk[],
  versao: Versao,
): Resultado {
  const n = chunks.length;
  let hits = 0;
  let somaMrr = 0;
  const porFamilia: Record<Familia, { hit10: number; mrr10: number; n: number }> = {
    tema: { hit10: 0, mrr10: 0, n: 0 },
    parafrase: { hit10: 0, mrr10: 0, n: 0 },
  };
  const detalhe: Detalhe[] = [];

  for (const [qi, consulta] of CONSULTAS.entries()) {
    const q = queries.subarray(qi * dims, (qi + 1) * dims);
    const refs = referencias(consulta, versao);

    const escores = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const base = i * dims;
      for (let d = 0; d < dims; d++) s += q[d] * corpus[base + d];
      escores[i] = s;
    }
    const ordem = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => escores[b] - escores[a])
      .slice(0, PROFUNDIDADE);

    let posicao: number | null = null;
    let acertou: string | null = null;
    for (const [k, idx] of ordem.entries()) {
      const ref = refs.find((r) => cobre(chunks[idx], r));
      if (ref) {
        posicao = k + 1;
        acertou = ref;
        break;
      }
    }

    const f = consulta.familia;
    porFamilia[f].n++;
    const dentro = posicao !== null && posicao <= CORTE;
    if (dentro && posicao) {
      hits++;
      porFamilia[f].hit10++;
      somaMrr += 1 / posicao;
      porFamilia[f].mrr10 += 1 / posicao;
    }

    const t = chunks[ordem[0]];
    detalhe.push({
      pergunta: consulta.pergunta,
      familia: f,
      posicao,
      sinal: classificar(posicao),
      topo: `${t.osis} ${t.chapter}:${t.verseStart}-${t.verseEnd}`,
      topoTexto: t.content,
      acertou,
    });
  }

  const total = CONSULTAS.length;
  const mrr10 = somaMrr / total;
  for (const f of ["tema", "parafrase"] as const) {
    porFamilia[f].mrr10 /= porFamilia[f].n || 1;
    porFamilia[f].hit10 /= porFamilia[f].n || 1;
  }

  return {
    versao,
    hit10: hits / total,
    mrr10,
    nota:
      porFamilia.parafrase.hit10 * PESOS.parafrase +
      porFamilia.tema.hit10 * PESOS.tema +
      mrr10 * PESOS.mrr,
    porFamilia,
    verdes: detalhe.filter((d) => d.sinal === "verde").length,
    amarelos: detalhe.filter((d) => d.sinal === "amarelo").length,
    vermelhos: detalhe.filter((d) => d.sinal === "vermelho").length,
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
            pedidos.some((p) =>
              d.toLowerCase().includes(p.toLowerCase().replace(/[/\\]/g, "__")),
            )),
      )
    : [];

  if (dirs.length === 0) {
    console.error(
      `nenhum vetor completo em ${RAIZ}.\n` +
        `  MODELO=<modelo> npx tsx scripts/embed/build-vectors.ts`,
    );
    process.exit(1);
  }

  const tudo: Array<{
    meta: Meta;
    porVersao: Record<Versao, { f32: Resultado; f16: Resultado }>;
  }> = [];

  for (const d of dirs) {
    const dir = path.join(RAIZ, d);
    const meta = JSON.parse(readFileSync(path.join(dir, "meta.json"), "utf8")) as Meta;
    const chunks = JSON.parse(
      readFileSync(path.join(dir, "chunks.json"), "utf8"),
    ) as Chunk[];

    const bc = readFileSync(path.join(dir, "corpus.f32"));
    const corpus = new Float32Array(bc.buffer, bc.byteOffset, bc.byteLength / 4);
    const bq = readFileSync(path.join(dir, "queries.f32"));
    const queries = new Float32Array(bq.buffer, bq.byteOffset, bq.byteLength / 4);

    const corpus16 = paraFloat16EVolta(corpus);
    const queries16 = paraFloat16EVolta(queries);

    const porVersao = {} as Record<Versao, { f32: Resultado; f16: Resultado }>;
    for (const v of VERSOES) {
      porVersao[v] = {
        f32: avaliar(corpus, queries, meta.dims, chunks, v),
        f16: avaliar(corpus16, queries16, meta.dims, chunks, v),
      };
    }
    tudo.push({ meta, porVersao });
  }

  tudo.sort((a, b) => b.porVersao.v2.f32.nota - a.porVersao.v2.f32.nota);

  const refsV1 = CONSULTAS.reduce((s, c) => s + c.esperados.length, 0);
  const refsV2 = CONSULTAS.reduce(
    (s, c) => s + c.esperados.length + c.extraV2.length,
    0,
  );

  console.log(
    `\nverdade-base: v1 tinha ${refsV1} referências, v2 tem ${refsV2}` +
      `  (${refsV2 - refsV1} acrescentadas)`,
  );
  console.log(
    `pesos: paráfrase ${PESOS.parafrase * 100}% · tema ${PESOS.tema * 100}% · ` +
      `MRR@10 ${PESOS.mrr * 100}%   —   dimensão e custo NÃO entram na nota\n`,
  );

  console.log("QUALIDADE (float32, verdade-base v2)");
  console.log(
    "modelo                                NOTA | parafr  tema  Hit@10  MRR@10 | 🟢 🟡 🔴",
  );
  console.log("-".repeat(92));
  for (const { meta, porVersao } of tudo) {
    const r = porVersao.v2.f32;
    console.log(
      `${meta.modelo.padEnd(36)}  ${pct(r.nota)} | ${pct(r.porFamilia.parafrase.hit10)}  ` +
        `${pct(r.porFamilia.tema.hit10)}   ${pct(r.hit10)}   ${r.mrr10.toFixed(3)} | ` +
        `${String(r.verdes).padStart(2)} ${String(r.amarelos).padStart(2)} ${String(r.vermelhos).padStart(2)}`,
    );
  }
  console.log("\n  🟢 relevante no top-3   🟡 entre 4 e 10   🔴 nada no top-10\n");

  console.log("EFEITO DA CORREÇÃO DA VERDADE-BASE (nota)");
  console.log("modelo                                  v1    v2  v2-sem-viés    Δ v2→sem-viés");
  console.log("-".repeat(92));
  for (const { meta, porVersao } of tudo) {
    const d = porVersao["v2-sem-vies"].f32.nota - porVersao.v2.f32.nota;
    console.log(
      `${meta.modelo.padEnd(36)}  ${pct(porVersao.v1.f32.nota)}  ` +
        `${pct(porVersao.v2.f32.nota)}    ${pct(porVersao["v2-sem-vies"].f32.nota)}` +
        `       ${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}pp`,
    );
  }
  console.log(
    "\n  se v2 e v2-sem-viés forem parecidas, a régua não foi ajustada para o resultado\n",
  );

  console.log("INFRAESTRUTURA");
  console.log("modelo                                dims  chunks   tempo  ritmo | halfvec Δ nota");
  console.log("-".repeat(92));
  for (const { meta, porVersao } of tudo) {
    const d = porVersao.v2.f16.nota - porVersao.v2.f32.nota;
    console.log(
      `${meta.modelo.padEnd(36)}  ${String(meta.dims).padStart(4)}  ` +
        `${String(meta.chunks).padStart(6)}  ${String(meta.segundos + "s").padStart(6)} ` +
        `${String(meta.porSegundo + "/s").padStart(6)} |      ` +
        `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}pp`,
    );
  }

  for (const { meta, porVersao } of tudo) {
    console.log(`\n### ${meta.modelo}  (verdade-base v2)`);
    for (const d of porVersao.v2.f32.detalhe) {
      const pos = d.posicao === null ? "--" : String(d.posicao).padStart(2);
      console.log(
        `  ${SINAL[d.sinal]} ${pos}  [${d.familia.padEnd(9)}] ${d.pergunta}`,
      );
      console.log(
        `           ${d.acertou ? `achou ${d.acertou}` : "nada relevante"}` +
          ` · 1º: ${d.topo} "${d.topoTexto.slice(0, 52)}…"`,
      );
    }
  }

  for (const v of VERSOES) {
    const dir = path.join(SAIDA, v);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "results.json"),
      JSON.stringify(
        tudo.map(({ meta, porVersao }) => ({
          meta,
          float32: porVersao[v].f32,
          float16: porVersao[v].f16,
        })),
        null,
        2,
      ),
      "utf8",
    );
  }
  console.log(`\nresultados salvos em ${SAIDA}/{${VERSOES.join(",")}}/results.json\n`);
}

main();
