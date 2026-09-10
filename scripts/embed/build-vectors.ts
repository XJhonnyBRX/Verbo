/**
 * Gera os vetores de um modelo e guarda em disco, com retomada.
 *
 *   MODELO=Xenova/multilingual-e5-small npx tsx scripts/embed/build-vectors.ts
 *   MODELO=gemini-embedding-2 DIMS=768   npx tsx scripts/embed/build-vectors.ts
 *
 * Separado do benchmark porque embedar 15.246 chunks leva de 15 a 40 minutos,
 * e os experimentos do Ciclo 4.2 — halfvec, top-k, pesos do ranking — precisam
 * rodar em segundos. Gerar uma vez, medir muitas.
 *
 * GRAVA PROGRESSO A CADA LOTE, por dois motivos aprendidos na prática:
 *
 * 1. Vinte minutos sem sinal de vida é um problema operacional. Da primeira
 *    vez não dava para distinguir «rodando» de «travado» sem ir olhar a
 *    tabela de processos.
 * 2. A rodada do Gemini é ligada em rede e pode falhar no meio por cota ou
 *    instabilidade. Sem retomada, uma falha no chunk 14.000 jogaria fora
 *    tudo que já custou.
 *
 * Saída em data/vectors/<modelo>/:
 *   progress.json  quantos, quando, a que ritmo — legível DURANTE a corrida
 *   corpus.f32     vetores do corpus, Float32 cru, gravado incrementalmente
 *   queries.f32    vetores das consultas do conjunto de aceitação
 *   chunks.json    as janelas, para o benchmark saber o que cada vetor é
 *   meta.json      só existe quando terminou. Sua ausência significa parcial.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { adapt } from "../import/adapt-blivre";
import { buildChunks } from "../../lib/bible/chunker";
import type { Chunk } from "../../lib/bible/chunker";
import { COTA_DIARIA, GeminiEmbeddings } from "../../lib/embeddings/gemini";
import { LocalEmbeddings } from "../../lib/embeddings/local";
import type { EmbeddingProvider } from "../../lib/embeddings/types";
import { CONSULTAS } from "./queries";

// Chaves vivem em .env.local, que o tsx não carrega sozinho.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Sem .env.local: só os modelos locais funcionam, e eles não precisam dela.
}

const MODELO = process.env.MODELO ?? "Supabase/gte-small";
const DIMS = Number(process.env.DIMS ?? 768);
const LOTE = Number(process.env.LOTE ?? 64);
/* Caminho de um subset.json (ver scripts/embed/build-subset.ts). Quando
   presente, o corpus vira o subconjunto NA ORDEM que o arquivo define, e os
   vetores vao para um diretorio proprio - o corpus completo nunca e
   sobrescrito por um parcial. */
const SUBSET = process.env.SUBSET ?? "";

function criarProvider(): EmbeddingProvider {
  if (MODELO.startsWith("gemini")) {
    /* Aceita uma chave ou varias. Cada projeto do Google tem cota propria,
       entao mais chaves significa mais vazao -- e resiliencia: uma chave
       estrangulada sai de cena enquanto as outras seguem. */
    const chaves = [
      process.env.GOOGLE_API_KEY,
      process.env.GOOGLE_API_KEY_2,
      process.env.GOOGLE_API_KEY_3,
      ...(process.env.GOOGLE_API_KEYS ?? "").split(","),
    ].filter((k): k is string => Boolean(k?.trim()));

    if (chaves.length === 0) {
      console.error("falta GOOGLE_API_KEY em .env.local para usar o Gemini.");
      process.exit(1);
    }
    console.log(`chaves : ${chaves.length}`);
    return new GeminiEmbeddings({ apiKey: chaves, dimensions: DIMS });
  }
  return new LocalEmbeddings({ model: MODELO, lote: LOTE });
}

async function main(): Promise<void> {
  const provider = criarProvider();
  /* O sufixo NAO e cosmetico. Sem ele, uma geracao de subconjunto anexa seus
     vetores ao corpus completo do mesmo modelo e produz um arquivo que e
     metade uma coisa e metade outra -- invisivel, porque o tamanho continua
     sendo multiplo da dimensao. Aconteceu aqui: 192 vetores do subconjunto
     foram anexados a um prefixo de 993 do corpus inteiro. */
  const dir = path.join(
    "data",
    "vectors",
    MODELO.replace(/[/\\]/g, "__") + (SUBSET ? "__subset" : ""),
  );
  mkdirSync(dir, { recursive: true });

  const arqCorpus = path.join(dir, "corpus.f32");
  const arqProgresso = path.join(dir, "progress.json");
  const arqMeta = path.join(dir, "meta.json");

  console.log(`modelo : ${provider.model}`);

  const bible = adapt(readFileSync("data/source/BLIVRE.json", "utf8"));
  const chunks = buildChunks(
    bible.verses.map((v) => ({
      osis: v.osis,
      chapter: v.c,
      verse: v.v,
      text: v.t,
    })),
  );
  let corpus = chunks;
  if (SUBSET) {
    const sub = JSON.parse(readFileSync(SUBSET, "utf8")) as {
      indices: number[];
      camadas: Record<string, number>;
    };
    corpus = sub.indices.map((i) => chunks[i]);
    console.log(
      `subset : ${corpus.length} de ${chunks.length} - ` +
        Object.entries(sub.camadas)
          .map(([k, v]) => `${k} ${v}`)
          .join(", "),
    );
  }

  /* IDENTIDADE DO CORPUS — a guarda que faltava.
   *
   * corpus.f32 e uma sequencia crua de floats: 993 vetores de um corpus sao
   * indistinguiveis de 993 vetores de outro, e a checagem de retomada so
   * conferia se o tamanho e multiplo da dimensao. Aconteceu o previsivel:
   * uma geracao de subconjunto retomou um arquivo do corpus completo,
   * tratou 993 vetores de Genesis como se fossem as primeiras 993 entradas
   * do subconjunto, e produziu um arquivo que era metade de cada coisa. Sem
   * nenhum sinal de erro, porque nao havia nada que pudesse notar.
   *
   * A impressao digital e do CONTEUDO, nao da contagem: dois corpora podem
   * ter o mesmo tamanho e textos diferentes. */
  const impressao = createHash("sha256")
    .update(corpus.map((c) => `${c.osis} ${c.chapter}:${c.verseStart}-${c.verseEnd}`).join("|"))
    .digest("hex");
  const arqId = path.join(dir, "corpus.id");

  if (existsSync(arqId)) {
    const gravada = readFileSync(arqId, "utf8").trim();
    if (gravada !== impressao) {
      console.error(
        `\n${dir} contem vetores de OUTRO corpus.\n` +
          `  gravado : ${gravada.slice(0, 16)}…\n` +
          `  atual   : ${impressao.slice(0, 16)}…\n` +
          "Retomar aqui misturaria dois corpora num arquivo so. Apague o " +
          "diretorio, ou gere em outro.",
      );
      process.exit(1);
    }
  } else if (existsSync(arqCorpus)) {
    /* Diretorio de antes desta guarda existir. A identidade nao esta gravada,
       mas E demonstravel: o chunks.json ao lado diz a que corpus os vetores
       pertencem. Recalcular dali e adotar e honesto; adivinhar nao seria. */
    const antigo = path.join(dir, "chunks.json");
    if (!existsSync(antigo)) {
      console.error(
        `\n${dir} tem corpus.f32, mas nem corpus.id nem chunks.json.\n` +
          "  Nao da para provar a que corpus ele pertence. Apague e gere de novo.",
      );
      process.exit(1);
    }
    const salvos = JSON.parse(readFileSync(antigo, "utf8")) as Chunk[];
    const digital = createHash("sha256")
      .update(salvos.map((c) => `${c.osis} ${c.chapter}:${c.verseStart}-${c.verseEnd}`).join("|"))
      .digest("hex");
    if (digital !== impressao) {
      console.error(
        `\n${dir} guarda vetores de OUTRO corpus (${salvos.length} chunks).\n` +
          "  Retomar aqui misturaria dois corpora. Apague o diretorio, ou gere em outro.",
      );
      process.exit(1);
    }
    writeFileSync(arqId, impressao, "utf8");
    console.log("identidade recuperada do chunks.json existente");
  } else {
    writeFileSync(arqId, impressao, "utf8");
  }

  writeFileSync(path.join(dir, "chunks.json"), JSON.stringify(corpus), "utf8");
  console.log(`chunks : ${corpus.length.toLocaleString("pt-BR")}  id ${impressao.slice(0, 12)}`);

  // Descobre a dimensão embedando um texto — não presume a partir do nome.
  const amostra = await provider.embedDocuments([corpus[0].content]);
  const dims = amostra[0].length;
  console.log(`dims   : ${dims}`);

  // ------------------------------------------------------------- retomada
  let jaFeitos = 0;
  if (existsSync(arqCorpus)) {
    const bytes = statSync(arqCorpus).size;
    if (bytes % (dims * 4) !== 0) {
      console.error(
        `corpus.f32 tem ${bytes} bytes, que não é múltiplo de ${dims * 4}. ` +
          "Arquivo de outra dimensão ou truncado — apague o diretório e refaça.",
      );
      process.exit(1);
    }
    jaFeitos = bytes / (dims * 4);
    if (jaFeitos > corpus.length) {
      console.error("corpus.f32 tem mais vetores que chunks. Apague e refaça.");
      process.exit(1);
    }
    if (jaFeitos > 0) {
      console.log(`retomando de ${jaFeitos.toLocaleString("pt-BR")}`);
    }
  }

  if (jaFeitos === 0) {
    writeFileSync(arqCorpus, Buffer.from(amostra[0].buffer));
    jaFeitos = 1;
  }

  // ----------------------------------------------------------- embeddings
  const t0 = Date.now();
  const partida = jaFeitos;

  for (let i = jaFeitos; i < corpus.length; i += LOTE) {
    const fatia = corpus.slice(i, i + LOTE);
    const vs = await provider.embedDocuments(fatia.map((c) => c.content));

    // Anexa no fim: o arquivo é sempre um prefixo válido do resultado.
    const buf = Buffer.allocUnsafe(vs.length * dims * 4);
    vs.forEach((v, j) => Buffer.from(v.buffer).copy(buf, j * dims * 4));
    appendFileSync(arqCorpus, buf);

    const feitos = i + vs.length;
    const seg = (Date.now() - t0) / 1000;
    const ritmo = (feitos - partida) / seg;
    const progresso = {
      modelo: provider.model,
      dims,
      feitos,
      total: corpus.length,
      porSegundo: Math.round(ritmo * 10) / 10,
      faltamSegundos: Math.round((corpus.length - feitos) / (ritmo || 1)),
      atualizadoEm: new Date().toISOString(),
    };
    writeFileSync(arqProgresso, JSON.stringify(progresso, null, 2), "utf8");
    console.log(
      `${feitos}/${corpus.length}  ${progresso.porSegundo}/s  ` +
        `faltam ~${progresso.faltamSegundos}s`,
    );
  }

  const segundos = (Date.now() - t0) / 1000;

  // ------------------------------------------------------------- consultas
  const qvs: Float32Array[] = [];
  for (const c of CONSULTAS) qvs.push(await provider.embedQuery(c.pergunta));
  const queries = new Float32Array(CONSULTAS.length * dims);
  qvs.forEach((v, i) => queries.set(v, i * dims));
  writeFileSync(path.join(dir, "queries.f32"), Buffer.from(queries.buffer));
  console.log(`${CONSULTAS.length} consultas embedadas`);

  /* meta.json por último: sua existência é o sinal de «completo».
   *
   * OS TEMPOS SÃO TRÊS E FICAM SEPARADOS DE PROPÓSITO. Uma execução que
   * retoma um corpus já completo gasta zero segundos gerando, e registrar
   * isso como «tempo de geração» faria o modelo parecer infinitamente rápido
   * numa tabela comparativa. Já aconteceu aqui com o gte-small.
   *
   *   vetoresGerados    quantos ESTA execução embedou
   *   vetoresRetomados  quantos vieram de execução anterior
   *   geracaoSegundos   tempo gasto embedando, null se não gerou nada
   *   porSegundo        ritmo, null quando não há geração para medir
   */
  const gerados = corpus.length - partida;
  const meta = {
    modelo: provider.model,
    dims,
    chunks: corpus.length,
    consultas: CONSULTAS.length,
    vetoresGerados: gerados,
    vetoresRetomados: partida,
    geracaoSegundos: gerados > 0 ? Math.round(segundos) : null,
    porSegundo: gerados > 0 ? Math.round(gerados / segundos) : null,
    execucaoCompleta: gerados === corpus.length - 1 || partida <= 1,
    geradoEm: new Date().toISOString(),
  };

  if (gerados === 0) {
    console.log(
      "\nATENÇÃO: nada foi gerado nesta execução — o corpus já estava completo.\n" +
        "  O tempo de geração fica como null, e não zero, para não contaminar\n" +
        "  comparações de desempenho.",
    );
  }

  writeFileSync(arqMeta, JSON.stringify(meta, null, 2), "utf8");

  console.log(`\ncompleto em ${dir}`);
}

main().catch((e: unknown) => {
  const msg = (e as Error).message;

  /* Cota diaria esgotada nao e defeito: e o fim do orcamento do dia. Sai
     com zero para nao poluir o log de CI nem assustar quem so quer saber se
     deu certo -- e diz exatamente o que fazer amanha. */
  if (msg.includes(COTA_DIARIA)) {
    console.log(`
cota diaria esgotada. ${msg}`);
    console.log("os vetores gerados ate aqui estao em disco e sao um prefixo");
    console.log("valido do corpus. Rodar o mesmo comando amanha retoma dali.");
    process.exit(0);
  }

  console.error(`falhou: ${msg}`);
  console.error("o progresso parcial foi mantido; rodar de novo retoma dali");
  process.exit(1);
});
