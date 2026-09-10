/**
 * Monta o subconjunto adversarial do benchmark PARCIAL do Gemini.
 *
 *   npx tsx scripts/embed/build-subset.ts          # alvo padrão de 1.800
 *   ALVO=900 npx tsx scripts/embed/build-subset.ts
 *
 * LEIA `docs/design/embeddings.md`, seção «O que um benchmark parcial pode e
 * não pode decidir», antes de interpretar qualquer número que saia daqui.
 * Resumo: este corpus só pode REJEITAR o Gemini, nunca aprová-lo, porque é
 * construído a partir das falhas conhecidas — e todas as falhas conhecidas
 * são do e5 e do gte.
 *
 * A ORDEM DAS CAMADAS É DELIBERADA. A cota diária do Gemini pode acabar no
 * meio da geração, e acabar no meio só é aceitável se o que já foi gerado for
 * o que mais decide. Por isso o ouro e as armadilhas vêm primeiro e o
 * preenchimento aleatório vem por último: um corpus truncado continua sendo
 * um teste adversarial válido, apenas com menos ruído de fundo.
 *
 *   1. ouro       chunks que cobrem as referências da verdade-base v2
 *   2. nomeados   os seis distratores que o relatório do 4.1 documentou
 *   3. léxicos    colhidos por ts_rank no banco, sem curadoria humana
 *   4. aleatório  fundo, com semente fixa para a seleção ser reproduzível
 *
 * A camada 3 é a que mais reduz o viés de casa: ela estoca o corpus com
 * armadilhas da classe «salvação» → «salva-me» que NENHUM modelo enfrentou
 * ainda, porque saem de uma regra e não da nossa memória das falhas do e5.
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { adapt } from "../import/adapt-blivre";
import { buildChunks } from "../../lib/bible/chunker";
import { CONSULTAS, referencias } from "./queries";

process.loadEnvFile(".env");

const ALVO = Number(process.env.ALVO ?? 1800);
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const CHAVE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const TRAD = process.env.NEXT_PUBLIC_VERBO_TRANSLATION ?? "blivre";
const SEMENTE = 20260910;

/** Os seis distratores nomeados em docs/design/embeddings.md. */
const NOMEADOS = ["Ps 3:7", "Ps 89:51", "Ps 109:21", "Job 41:1", "2Tim 4:21", "Matt 28:15"];

interface Achado {
  book_osis: string;
  chapter: number;
  verse: number;
  rank: number;
}

async function buscar(termo: string, limite: number): Promise<Achado[]> {
  const r = await fetch(`${BASE}/rest/v1/rpc/search_verses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CHAVE,
      Authorization: `Bearer ${CHAVE}`,
    },
    body: JSON.stringify({ p_query: termo, p_translation: TRAD, p_limit: limite }),
  });
  if (!r.ok) throw new Error(`search_verses ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as Achado[];
}

/* PRNG com semente: a seleção aleatória tem de ser reproduzível, senão
   ninguém consegue repetir o experimento e chegar ao mesmo corpus. */
function mulberry32(a: number): () => number {
  return function gerar() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main(): Promise<void> {
  const bible = adapt(readFileSync("data/source/BLIVRE.json", "utf8"));
  const chunks = buildChunks(
    bible.verses.map((v) => ({ osis: v.osis, chapter: v.c, verse: v.v, text: v.t })),
  );
  console.log(`corpus completo : ${chunks.length.toLocaleString("pt-BR")} chunks`);

  // versículo -> índices dos chunks que o contêm (janela de 3, passo 2, então
  // cada versículo aparece em uma ou duas janelas)
  const porVersiculo = new Map<string, number[]>();
  chunks.forEach((c, i) => {
    for (let v = c.verseStart; v <= c.verseEnd; v++) {
      const k = `${c.osis} ${c.chapter}:${v}`;
      const lista = porVersiculo.get(k);
      if (lista) lista.push(i);
      else porVersiculo.set(k, [i]);
    }
  });

  const escolhidos: number[] = [];
  const vistos = new Set<number>();
  const camadas: Record<string, number> = {};

  function juntar(nome: string, refs: Iterable<string>): void {
    let novos = 0;
    for (const ref of refs) {
      for (const i of porVersiculo.get(ref) ?? []) {
        if (vistos.has(i)) continue;
        vistos.add(i);
        escolhidos.push(i);
        novos++;
      }
    }
    camadas[nome] = (camadas[nome] ?? 0) + novos;
  }

  // ------------------------------------------------------------- 1. ouro
  const ouro = new Set<string>();
  for (const c of CONSULTAS) for (const r of referencias(c, "v2")) ouro.add(r);
  juntar("ouro", ouro);
  console.log(`1. ouro         : ${camadas.ouro} chunks (${ouro.size} referências v2)`);

  // --------------------------------------------------------- 2. nomeados
  juntar("nomeados", NOMEADOS);
  console.log(`2. nomeados     : ${camadas.nomeados} chunks (${NOMEADOS.length} distratores)`);

  // ---------------------------------------------------------- 3. léxicos
  /* Regra, não curadoria: a pergunta inteira e cada palavra de conteúdo dela
     viram uma busca por ts_rank. As palavras funcionais somem sozinhas porque
     o dicionário «portuguese» do Postgres as descarta — não preciso manter
     uma lista de parada minha, que seria mais uma escolha arbitrária a
     defender. */
  const termos = new Set<string>();
  for (const c of CONSULTAS) {
    termos.add(c.pergunta);
    for (const p of c.pergunta.toLowerCase().split(/[^\p{L}]+/u)) {
      if (p.length >= 4) termos.add(p);
    }
  }
  console.log(`3. léxicos      : ${termos.size} termos a buscar...`);
  const refsLexicais: string[] = [];
  for (const t of termos) {
    try {
      for (const a of await buscar(t, 25)) {
        refsLexicais.push(`${a.book_osis} ${a.chapter}:${a.verse}`);
      }
    } catch (e) {
      console.log(`   aviso: "${t}" falhou — ${(e as Error).message}`);
    }
  }
  juntar("lexicos", refsLexicais);
  console.log(`3. léxicos      : ${camadas.lexicos} chunks novos`);

  // -------------------------------------------------------- 4. aleatório
  const rnd = mulberry32(SEMENTE);
  const restantes = chunks.map((_, i) => i).filter((i) => !vistos.has(i));
  for (let i = restantes.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [restantes[i], restantes[j]] = [restantes[j], restantes[i]];
  }
  let fundo = 0;
  for (const i of restantes) {
    if (escolhidos.length >= ALVO) break;
    vistos.add(i);
    escolhidos.push(i);
    fundo++;
  }
  camadas.aleatorio = fundo;
  console.log(`4. aleatório    : ${fundo} chunks`);

  // ----------------------------------------------------------- 5. saída
  mkdirSync("data/subset", { recursive: true });
  const subset = {
    gerado: new Date().toISOString(),
    alvo: ALVO,
    semente: SEMENTE,
    total: escolhidos.length,
    camadas,
    /* Ordem preservada: ouro primeiro, fundo por último. Quem gerar vetores
       DEVE respeitá-la, para que uma geração truncada continue válida. */
    indices: escolhidos,
  };
  writeFileSync("data/subset/subset.json", JSON.stringify(subset), "utf8");

  console.log(
    `\ntotal           : ${escolhidos.length} de ${chunks.length} ` +
      `(${((escolhidos.length / chunks.length) * 100).toFixed(1)}%)`,
  );

  // Cobertura do ouro: se alguma consulta ficou sem resposta possível, o
  // experimento não mede nada para ela, e isso tem de aparecer agora.
  const dentro = new Set(escolhidos);
  let semOuro = 0;
  for (const c of CONSULTAS) {
    const refs = referencias(c, "v2");
    const cobertas = refs.filter((r) => (porVersiculo.get(r) ?? []).some((i) => dentro.has(i)));
    if (cobertas.length === 0) {
      console.log(`  SEM OURO: "${c.pergunta}"`);
      semOuro++;
    }
  }
  console.log(
    semOuro === 0
      ? "todas as 16 consultas têm resposta possível dentro do subconjunto."
      : `${semOuro} consulta(s) sem resposta possível — corpus inválido.`,
  );
}

void main();
