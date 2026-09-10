/**
 * Prova que o conjunto reservado é o que diz ser.
 *
 *   npx tsx scripts/embed/verify-calibration-set.ts
 *
 * Um conjunto de calibração escrito à mão tem dois modos de falhar em
 * silêncio, e os dois destruiriam o propósito dele:
 *
 * 1. **Referência que não existe.** Se eu escrevi «Prov 6:6» e o versículo não
 *    está lá, a expectativa é impossível de satisfazer e o limiar sai errado
 *    para baixo. Isto aqui confere cada referência contra a Bíblia importada,
 *    não contra a minha memória.
 *
 * 2. **Contaminação com `queries.ts`.** Se uma pergunta ou um tema vazou do
 *    conjunto que selecionou o retriever, a reserva acabou e voltamos à
 *    circularidade v1 → v2.
 *
 * Imprime também a impressão digital que vai para o documento. É ela que
 * torna o congelamento verificável: qualquer edição futura muda o hash.
 */

import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { bookByOsis } from "../../lib/bible/canon";
import { expectedVerseCount, TOTAL_VERSES } from "../../lib/bible/canon-counts";
import { CALIBRACAO, type Papel } from "./calibration-set";
import { CONSULTAS } from "./queries";

let falhas = 0;
function ok(nome: string, cond: boolean, detalhe = ""): void {
  if (cond) {
    console.log(`  ok    ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ────────────────────────────────────── 1. as referências existem mesmo
/* CONTRA A TABELA VERSIONADA, e não contra data/source/BLIVRE.json.
 *
 * A primeira versão disto lia o arquivo da tradução — que está no .gitignore.
 * Passava na minha máquina e quebrava no CI, que clona limpo. O CI existe
 * justamente para pegar «funciona aqui», e pegou.
 *
 * VERSE_COUNTS é gerada da mesma BLIVRE, carrega o sha256 do arquivo de
 * origem, e é suficiente: para saber se «Prov 6:6» existe basta o número de
 * versículos de Provérbios 6. Melhor que a leitura anterior, aliás — não
 * depende de um arquivo de 32 MB que o repositório deliberadamente não guarda.
 */
console.log(
  `tabela canônica versionada: ${TOTAL_VERSES.toLocaleString("pt-BR")} versículos\n`,
);

const inexistentes: string[] = [];
const foraDoCanon: string[] = [];
for (const c of CALIBRACAO) {
  for (const r of c.referencias ?? []) {
    const [osis, cv] = r.split(" ");
    if (!bookByOsis(osis)) {
      foraDoCanon.push(`${c.id}: ${r}`);
      continue;
    }
    const [cap, ver] = cv.split(":").map(Number);
    const total = expectedVerseCount(osis, cap);
    if (total === undefined || ver < 1 || ver > total) {
      inexistentes.push(`${c.id}: ${r}${total === undefined ? " (capítulo)" : ` (máx ${total})`}`);
    }
  }
}
ok("todo livro citado existe no cânon", foraDoCanon.length === 0, foraDoCanon.join(", "));
ok(
  "todo versículo citado existe na tradução importada",
  inexistentes.length === 0,
  inexistentes.join(", "),
);

// ─────────────────────────────────── 2. sem contaminação com queries.ts
const perguntasSelecao = new Set(CONSULTAS.map((c) => normalizar(c.pergunta)));
const repetidas = CALIBRACAO.filter((c) => perguntasSelecao.has(normalizar(c.pergunta)));
ok(
  "nenhuma pergunta se repete em queries.ts",
  repetidas.length === 0,
  repetidas.map((c) => c.id).join(", "),
);

/* Os dez temas de queries.ts não podem reaparecer como assunto aqui: usar o
   mesmo tema com outras palavras ainda é medir onde o retriever foi
   escolhido. */
const TEMAS_DA_SELECAO = [
  "dinheiro", "riqueza", "ansiedade", "perdao", "perdoar", "proximo",
  "medo", "salvacao", "humildade", "tentacao", "paz", "sofrimento",
];
const contaminadas: string[] = [];
for (const c of CALIBRACAO) {
  const texto = normalizar(c.pergunta);
  for (const t of TEMAS_DA_SELECAO) {
    if (texto.includes(t)) contaminadas.push(`${c.id} («${t}»)`);
  }
}
ok(
  "nenhum tema de queries.ts reaparece nas perguntas",
  contaminadas.length === 0,
  contaminadas.join(", "),
);

// ──────────────────────────────────────── 3. coerência interna do arquivo
const ids = CALIBRACAO.map((c) => c.id);
ok("identificadores únicos", new Set(ids).size === ids.length);

const semRef = CALIBRACAO.filter(
  (c) => c.esperado !== "recusar" && (c.referencias ?? []).length === 0,
);
ok(
  "toda pergunta que deve ser respondida tem referências",
  semRef.length === 0,
  semRef.map((c) => c.id).join(", "),
);

/* Uma recusa com referências esperadas seria uma contradição: se sabemos onde
   está a resposta, não é caso de recusa. */
const recusaComRef = CALIBRACAO.filter(
  (c) => c.esperado === "recusar" && (c.referencias ?? []).length > 0,
);
ok(
  "nenhuma recusa traz referências esperadas",
  recusaComRef.length === 0,
  recusaComRef.map((c) => c.id).join(", "),
);

const semPorque = CALIBRACAO.filter((c) => c.porque.trim().length < 20);
ok("toda pergunta tem justificativa escrita", semPorque.length === 0);

// ───────────────────────────── 4. o conjunto mede as duas decisões
const contarPor = <T extends string>(f: (c: (typeof CALIBRACAO)[number]) => T) =>
  CALIBRACAO.reduce<Record<string, number>>((acc, c) => {
    const k = f(c);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

const porPapelN = contarPor((c) => c.papel);
const porDecisao = contarPor((c) => c.esperado);
const porFamilia = contarPor((c) => c.familia);

const calib = CALIBRACAO.filter((c) => c.papel === "calibracao");
const responder = calib.filter((c) => c.esperado !== "recusar").length;
const recusar = calib.filter((c) => c.esperado === "recusar").length;

/* Um conjunto só de perguntas respondíveis calibraria o limiar para baixo, e
   um só de recusas o calibraria para cima. Precisa dos dois lados. */
ok("a calibração tem os dois lados da decisão", responder >= 4 && recusar >= 4,
   `responder ${responder}, recusar ${recusar}`);
ok("existe conjunto de avaliação reservado", (porPapelN.avaliacao ?? 0) >= 8);
ok("as nove famílias estão representadas", Object.keys(porFamilia).length >= 9,
   `${Object.keys(porFamilia).length} famílias`);

// ───────────────────────────────────────────── 5. impressão digital
/* Sobre o CONTEÚDO que define o experimento — pergunta, decisão esperada e
   referências. Comentários e formatação podem mudar sem invalidar o
   congelamento; a expectativa, não. */
const impressao = createHash("sha256")
  .update(
    CALIBRACAO.map((c) =>
      [c.id, c.familia, c.papel, c.pergunta, c.esperado, (c.referencias ?? []).join(",")].join("|"),
    ).join("\n"),
  )
  .digest("hex");

console.log("\n─────────────────────────────────────────────");
console.log(`perguntas : ${CALIBRACAO.length}`);
for (const [k, v] of Object.entries(porPapelN)) console.log(`  ${k.padEnd(12)} ${v}`);
console.log("decisão esperada:");
for (const [k, v] of Object.entries(porDecisao)) console.log(`  ${k.padEnd(22)} ${v}`);
console.log(`\nimpressão digital: ${impressao}`);

/* O CONGELAMENTO É UMA ASSERÇÃO, NÃO UM COMENTÁRIO.
 *
 * Registrar a impressão digital num documento não impede ninguém de editar o
 * conjunto depois de ver o resultado do Gemini — que é exatamente o que este
 * artefato existe para tornar impossível. Guardá-la ao lado, e conferir aqui,
 * faz qualquer alteração falhar na suíte e no CI.
 *
 * Se a reabertura for deliberada, ela é: apagar o .sha256, rodar de novo,
 * gravar o hash e explicar no commit por que a reserva foi reaberta. */
const ARQ_IMPRESSAO = "scripts/embed/calibration-set.sha256";
if (existsSync(ARQ_IMPRESSAO)) {
  const gravada = readFileSync(ARQ_IMPRESSAO, "utf8").trim();
  ok(
    "o conjunto continua idêntico ao congelado",
    gravada === impressao,
    `congelado ${gravada.slice(0, 16)}…, atual ${impressao.slice(0, 16)}…`,
  );
} else {
  console.log(`  aviso ainda não congelado — grave a impressão em ${ARQ_IMPRESSAO}`);
}
console.log(
  falhas === 0
    ? "\nConjunto reservado íntegro.\n"
    : `\n${falhas} falha(s) — o conjunto NÃO está pronto para congelar.\n`,
);

void ((p: Papel) => p)("calibracao");
process.exit(falhas === 0 ? 0 : 1);
