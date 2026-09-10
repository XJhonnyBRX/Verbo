/**
 * Conjunto de aceitação da busca semântica do VERBO.
 *
 * Este arquivo é o critério. Qualquer modelo candidato é medido contra ele, e
 * a decisão do Ciclo 4.3 se apoia neste número.
 *
 * DUAS FAMÍLIAS, e a segunda é a que decide:
 *
 * `tema`      — a palavra do assunto está na consulta. Um modelo que faz
 *               casamento lexical disfarçado passa aqui. Medido: gte-small e
 *               e5 empataram em 50% nesta família, o que não distinguiu nada.
 *
 * `parafrase` — a palavra do assunto NÃO está na consulta. Só recupera quem
 *               entendeu o significado. Medido: gte-small acertou 0 de 6.
 *
 * ---------------------------------------------------------------------------
 * VERSÕES DA VERDADE-BASE
 *
 * v1 (`esperados`) — a lista original, escrita antes de qualquer execução.
 * v2 (`extraV2`)   — passagens canônicas que faltavam. Ficam SEPARADAS de
 *                    propósito, para que a nota possa ser recalculada só com
 *                    a v1 e a mudança seja auditável.
 *
 * REGRA DE ADMISSÃO NA v2, aplicada a cada entrada: «eu teria incluído esta
 * passagem se tivesse definido a consulta antes de rodar o benchmark?» Se a
 * passagem só foi lembrada porque apareceu num resultado, não entra.
 *
 * O motivo da v1 ter ficado curta: eu tratei «versículos que eu citaria» como
 * se fosse «versículos relevantes». A Bíblia trata cada tema em dezenas de
 * lugares, e uma verdade-base estreita mede a minha memória, não o modelo.
 * Exemplo concreto: o e5 respondeu «perdão» com Lucas 17:3 — «se teu irmão
 * pecar contra ti, repreende-o; e se ele se arrepender, perdoa-lhe» — e a v1
 * contou como erro.
 *
 * `vistoNaV1: true` marca as referências que ALGUM modelo já havia devolvido
 * na primeira rodada. Elas são as candidatas a viés, e o benchmark reporta a
 * nota com e sem elas.
 * ---------------------------------------------------------------------------
 */

export type Familia = "tema" | "parafrase";

export interface Extra {
  ref: string;
  /** Por que é canônica para o tema, independente do que os modelos fizeram. */
  motivo: string;
  /** Apareceu no top-10 de algum modelo na rodada v1? Candidata a viés. */
  vistoNaV1?: boolean;
}

export interface Consulta {
  familia: Familia;
  pergunta: string;
  /** v1: escrita antes de qualquer execução. */
  esperados: string[];
  /** v2: acréscimos canônicos, auditáveis um a um. */
  extraV2: Extra[];
}

export const CONSULTAS: Consulta[] = [
  // ================================================================== tema
  {
    familia: "tema",
    pergunta: "dinheiro e riqueza",
    esperados: ["Matt 6:24", "1Tim 6:10", "Prov 11:28", "Luke 12:15", "Heb 13:5", "Matt 19:21"],
    extraV2: [
      { ref: "Matt 6:19", motivo: "não ajunteis tesouros na terra — o texto central do tema" },
      { ref: "1Tim 6:17", motivo: "instrução direta aos ricos deste mundo", vistoNaV1: true },
      { ref: "Eccl 5:10", motivo: "quem ama o dinheiro nunca se farta dele" },
      { ref: "Mark 10:25", motivo: "camelo e fundo de agulha" },
      { ref: "Prov 23:4", motivo: "não te cances para enriquecer" },
      { ref: "Luke 16:13", motivo: "não podeis servir a Deus e a Mamom" },
    ],
  },
  {
    familia: "tema",
    pergunta: "ansiedade",
    esperados: ["Phil 4:6", "1Pet 5:7", "Matt 6:25", "Matt 6:34", "Ps 55:22"],
    extraV2: [
      { ref: "Prov 12:25", motivo: "a ansiedade no coração do homem o abate", vistoNaV1: true },
      { ref: "Matt 6:27", motivo: "qual de vós, por ansiedade, acrescenta um côvado", vistoNaV1: true },
      { ref: "John 14:1", motivo: "não se turbe o vosso coração" },
      { ref: "Ps 94:19", motivo: "na multidão dos meus pensamentos, as tuas consolações" },
    ],
  },
  {
    familia: "tema",
    pergunta: "perdão",
    esperados: ["Matt 6:14", "Eph 4:32", "Col 3:13", "Matt 18:21", "Luke 6:37", "1John 1:9"],
    extraV2: [
      { ref: "Luke 17:3", motivo: "ensino de Jesus sobre perdoar o irmão arrependido", vistoNaV1: true },
      { ref: "Mark 11:25", motivo: "perdoai quando estiverdes orando" },
      { ref: "Matt 18:35", motivo: "conclusão da parábola do servo incompassivo" },
      { ref: "Ps 103:12", motivo: "quanto dista o oriente do ocidente" },
      { ref: "Luke 23:34", motivo: "Pai, perdoa-lhes" },
    ],
  },
  {
    familia: "tema",
    pergunta: "amor ao próximo",
    esperados: ["Matt 22:39", "Mark 12:31", "Lev 19:18", "Luke 10:27", "Rom 13:9", "John 13:34"],
    extraV2: [
      { ref: "Luke 10:29", motivo: "e quem é o meu próximo — abertura do bom samaritano" },
      { ref: "Gal 5:14", motivo: "toda a lei se cumpre numa só palavra" },
      { ref: "Jas 2:8", motivo: "a lei régia" },
      { ref: "1John 4:20", motivo: "quem não ama seu irmão a quem viu" },
    ],
  },
  {
    familia: "tema",
    pergunta: "medo",
    esperados: ["Isa 41:10", "2Tim 1:7", "Ps 23:4", "Josh 1:9", "Ps 27:1", "Deut 31:6"],
    extraV2: [
      { ref: "Ps 56:3", motivo: "no dia em que eu temer, confiarei em ti" },
      { ref: "Isa 43:1", motivo: "não temas, porque eu te remi" },
      { ref: "Matt 10:28", motivo: "não temais os que matam o corpo" },
      { ref: "1John 4:18", motivo: "o perfeito amor lança fora o medo" },
      { ref: "Ps 118:6", motivo: "o Senhor está comigo, não temerei" },
    ],
  },
  {
    familia: "tema",
    pergunta: "salvação",
    esperados: ["John 3:16", "Rom 10:9", "Eph 2:8", "Acts 4:12", "Rom 6:23", "John 14:6"],
    extraV2: [
      { ref: "Titus 3:5", motivo: "não por obras de justiça que houvéssemos feito" },
      { ref: "Rom 5:8", motivo: "Cristo morreu por nós sendo nós ainda pecadores" },
      { ref: "Acts 16:31", motivo: "crê no Senhor Jesus e serás salvo" },
      { ref: "1Pet 1:3", motivo: "regenerados para uma viva esperança" },
    ],
  },
  {
    familia: "tema",
    pergunta: "humildade",
    esperados: ["Jas 4:6", "1Pet 5:5", "Prov 16:18", "Phil 2:3", "Prov 11:2", "Matt 23:12"],
    extraV2: [
      { ref: "Phil 2:5", motivo: "haja em vós o mesmo sentimento que houve em Cristo" },
      { ref: "Mic 6:8", motivo: "andar humildemente com o teu Deus" },
      { ref: "Luke 14:11", motivo: "quem se exalta será humilhado" },
      { ref: "Prov 22:4", motivo: "o galardão da humildade e do temor do Senhor" },
      { ref: "Matt 18:4", motivo: "quem se humilhar como esta criança" },
    ],
  },
  {
    familia: "tema",
    pergunta: "tentação",
    esperados: ["1Cor 10:13", "Jas 1:13", "Matt 26:41", "Matt 4:1", "Heb 4:15"],
    extraV2: [
      { ref: "Jas 1:14", motivo: "cada um é tentado pela própria concupiscência", vistoNaV1: true },
      { ref: "Matt 6:13", motivo: "não nos deixes cair em tentação" },
      { ref: "Luke 4:1", motivo: "a tentação de Jesus no deserto" },
      { ref: "Heb 2:18", motivo: "tendo ele mesmo sido tentado, pode socorrer" },
      { ref: "2Pet 2:9", motivo: "o Senhor sabe livrar da tentação os piedosos" },
    ],
  },
  {
    familia: "tema",
    pergunta: "paz",
    esperados: ["John 14:27", "Phil 4:7", "Isa 26:3", "Rom 5:1", "Col 3:15"],
    extraV2: [
      { ref: "John 16:33", motivo: "para que em mim tenhais paz" },
      { ref: "Matt 5:9", motivo: "bem-aventurados os pacificadores" },
      { ref: "Rom 12:18", motivo: "tende paz com todos os homens" },
      { ref: "Num 6:26", motivo: "a bênção sacerdotal" },
      { ref: "Eph 2:14", motivo: "ele é a nossa paz" },
    ],
  },
  {
    familia: "tema",
    pergunta: "sofrimento",
    esperados: ["Rom 8:18", "2Cor 1:3", "Rom 5:3", "Jas 1:2", "1Pet 4:12", "2Cor 4:17"],
    extraV2: [
      { ref: "Ps 34:19", motivo: "muitas são as aflições do justo" },
      { ref: "John 16:33", motivo: "no mundo tereis aflições" },
      { ref: "1Pet 5:10", motivo: "depois de terdes padecido um pouco" },
      { ref: "Rev 21:4", motivo: "enxugará de seus olhos toda lágrima" },
      { ref: "2Cor 12:9", motivo: "a minha graça te basta" },
      { ref: "Job 2:10", motivo: "receberemos o bem e não o mal?" },
    ],
  },

  // ============================================================= paráfrase
  {
    familia: "parafrase",
    pergunta: "Como lidar com preocupação sobre o futuro?",
    esperados: ["Matt 6:34", "Matt 6:25", "Phil 4:6", "Prov 27:1", "Jas 4:13", "1Pet 5:7"],
    extraV2: [
      { ref: "Prov 3:5", motivo: "confia no Senhor e não te estribes no teu entendimento" },
      { ref: "Ps 37:5", motivo: "entrega o teu caminho ao Senhor", vistoNaV1: true },
      { ref: "Matt 6:31", motivo: "não andeis ansiosos dizendo: que comeremos?" },
      { ref: "Jer 29:11", motivo: "eu sei os planos que tenho para vós" },
    ],
  },
  {
    familia: "parafrase",
    pergunta: "O que a Bíblia ensina sobre acumular bens?",
    esperados: ["Matt 6:19", "Luke 12:16", "1Tim 6:9", "Eccl 5:10", "Prov 23:4", "Luke 12:21"],
    extraV2: [
      { ref: "Luke 12:33", motivo: "vendei o que tendes, fazei bolsas que não envelheçam" },
      { ref: "Luke 18:22", motivo: "vende tudo quanto tens e dá aos pobres", vistoNaV1: true },
      { ref: "Jas 5:1", motivo: "chorai pelas misérias que vos sobrevêm, ricos" },
      { ref: "Prov 11:28", motivo: "quem confia nas riquezas cairá" },
    ],
  },
  {
    familia: "parafrase",
    pergunta: "Como agir quando alguém me machuca?",
    esperados: ["Matt 5:44", "Rom 12:19", "Matt 18:21", "Luke 6:27", "Col 3:13", "Rom 12:17"],
    extraV2: [
      { ref: "Luke 17:3", motivo: "se teu irmão pecar contra ti, repreende-o e perdoa" },
      { ref: "Matt 5:39", motivo: "oferece-lhe também a outra face" },
      { ref: "Rom 12:21", motivo: "vence o mal com o bem" },
      { ref: "1Pet 3:9", motivo: "não retribuindo mal por mal" },
      { ref: "Prov 20:22", motivo: "não digas: pagarei o mal" },
      { ref: "Eph 4:31", motivo: "toda amargura seja tirada dentre vós" },
    ],
  },
  {
    familia: "parafrase",
    pergunta: "Onde encontro conforto durante uma dificuldade?",
    esperados: ["2Cor 1:3", "Ps 34:18", "Ps 23:4", "Matt 11:28", "Ps 46:1", "Ps 121:1"],
    extraV2: [
      { ref: "Ps 147:3", motivo: "sara os quebrantados de coração" },
      { ref: "John 14:16", motivo: "outro Consolador, para que fique convosco" },
      { ref: "Ps 119:50", motivo: "a tua palavra me vivificou na minha aflição" },
      { ref: "Isa 41:10", motivo: "não temas, eu te fortaleço e te ajudo" },
      { ref: "Ps 30:5", motivo: "o choro pode durar a noite, a alegria vem pela manhã" },
    ],
  },
  {
    familia: "parafrase",
    pergunta: "O que fazer quando estou com medo?",
    esperados: ["Ps 56:3", "Isa 41:10", "Ps 27:1", "2Tim 1:7", "Josh 1:9", "Ps 23:4"],
    extraV2: [
      { ref: "Ps 34:4", motivo: "livrou-me de todos os meus temores" },
      { ref: "Isa 43:1", motivo: "não temas, chamei-te pelo teu nome" },
      { ref: "Ps 118:6", motivo: "o Senhor está comigo, não temerei" },
      { ref: "Deut 31:6", motivo: "esforça-te e tem bom ânimo" },
      { ref: "1John 4:18", motivo: "o perfeito amor lança fora o medo" },
    ],
  },
  {
    familia: "parafrase",
    pergunta: "Como tratar uma pessoa que me fez mal?",
    esperados: ["Matt 5:44", "Rom 12:17", "Prov 25:21", "Luke 6:27", "Matt 18:21", "Rom 12:19"],
    extraV2: [
      { ref: "Luke 17:3", motivo: "repreende-o e, se se arrepender, perdoa-lhe" },
      { ref: "Luke 6:35", motivo: "amai os vossos inimigos e fazei bem" },
      { ref: "1Thess 5:15", motivo: "ninguém dê a outrem mal por mal" },
      { ref: "Prov 24:29", motivo: "não digas: como ele me fez, assim lhe farei" },
      { ref: "Rom 12:21", motivo: "vence o mal com o bem" },
      { ref: "Matt 5:39", motivo: "não resistais ao mal" },
    ],
  },
];

/** Referências válidas de uma consulta, na versão pedida. */
export function referencias(
  c: Consulta,
  versao: "v1" | "v2" | "v2-sem-vies",
): string[] {
  if (versao === "v1") return c.esperados;
  const extras = c.extraV2
    .filter((e) => versao === "v2" || !e.vistoNaV1)
    .map((e) => e.ref);
  return [...c.esperados, ...extras];
}

/** Uma referência "Osis c:v" decomposta. */
export function parseRef(ref: string): {
  osis: string;
  chapter: number;
  verse: number;
} {
  const [osis, cv] = ref.split(" ");
  const [c, v] = cv.split(":").map(Number);
  return { osis, chapter: c, verse: v };
}
