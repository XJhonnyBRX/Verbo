/**
 * Conjunto de aceitação da busca semântica do VERBO.
 *
 * Este arquivo é o critério. Qualquer modelo de embedding candidato é medido
 * contra ele, e a decisão do Ciclo 4.3 se apoia neste número.
 *
 * DUAS FAMÍLIAS DE CONSULTA, e a segunda é a que realmente decide:
 *
 * `tema` — a palavra do assunto aparece na consulta. Um modelo que só faz
 * casamento lexical disfarçado consegue ir bem aqui, então ir bem nesta
 * família não prova nada sozinho.
 *
 * `parafrase` — a palavra do assunto NÃO aparece. «Como agir quando alguém me
 * machuca?» não contém "perdão"; «acumular bens» não contém "riqueza». Só
 * recupera quem entendeu o significado. É aqui que o gte-small foi exposto:
 * ele trouxe «tomaram o dinheiro» para uma pergunta sobre riqueza.
 *
 * SOBRE OS VERSÍCULOS ESPERADOS: são os mais citados para cada assunto na
 * tradição cristã, e a lista é julgamento meu — revisável. Não pretende ser
 * exaustiva: a métrica pergunta se ALGUM deles aparece, porque a Bíblia trata
 * cada tema em muitos lugares e exigir um versículo específico mediria sorte.
 */

export type Familia = "tema" | "parafrase";

export interface Consulta {
  familia: Familia;
  pergunta: string;
  /** Referências "Osis c:v". Acertar qualquer uma conta. */
  esperados: string[];
}

export const CONSULTAS: Consulta[] = [
  // ------------------------------------------------------------------ tema
  {
    familia: "tema",
    pergunta: "dinheiro e riqueza",
    esperados: ["Matt 6:24", "1Tim 6:10", "Prov 11:28", "Luke 12:15", "Heb 13:5", "Matt 19:21"],
  },
  {
    familia: "tema",
    pergunta: "ansiedade",
    esperados: ["Phil 4:6", "1Pet 5:7", "Matt 6:25", "Matt 6:34", "Ps 55:22"],
  },
  {
    familia: "tema",
    pergunta: "perdão",
    esperados: ["Matt 6:14", "Eph 4:32", "Col 3:13", "Matt 18:21", "Luke 6:37", "1John 1:9"],
  },
  {
    familia: "tema",
    pergunta: "amor ao próximo",
    esperados: ["Matt 22:39", "Mark 12:31", "Lev 19:18", "Luke 10:27", "Rom 13:9", "John 13:34"],
  },
  {
    familia: "tema",
    pergunta: "medo",
    esperados: ["Isa 41:10", "2Tim 1:7", "Ps 23:4", "Josh 1:9", "Ps 27:1", "Deut 31:6"],
  },
  {
    familia: "tema",
    pergunta: "salvação",
    esperados: ["John 3:16", "Rom 10:9", "Eph 2:8", "Acts 4:12", "Rom 6:23", "John 14:6"],
  },
  {
    familia: "tema",
    pergunta: "humildade",
    esperados: ["Jas 4:6", "1Pet 5:5", "Prov 16:18", "Phil 2:3", "Prov 11:2", "Matt 23:12"],
  },
  {
    familia: "tema",
    pergunta: "tentação",
    esperados: ["1Cor 10:13", "Jas 1:13", "Matt 26:41", "Matt 4:1", "Heb 4:15"],
  },
  {
    familia: "tema",
    pergunta: "paz",
    esperados: ["John 14:27", "Phil 4:7", "Isa 26:3", "Rom 5:1", "Col 3:15"],
  },
  {
    familia: "tema",
    pergunta: "sofrimento",
    esperados: ["Rom 8:18", "2Cor 1:3", "Rom 5:3", "Jas 1:2", "1Pet 4:12", "2Cor 4:17"],
  },

  // ------------------------------------------------------------- paráfrase
  {
    familia: "parafrase",
    pergunta: "Como lidar com preocupação sobre o futuro?",
    esperados: ["Matt 6:34", "Matt 6:25", "Phil 4:6", "Prov 27:1", "Jas 4:13", "1Pet 5:7"],
  },
  {
    familia: "parafrase",
    pergunta: "O que a Bíblia ensina sobre acumular bens?",
    esperados: ["Matt 6:19", "Luke 12:16", "1Tim 6:9", "Eccl 5:10", "Prov 23:4", "Luke 12:21"],
  },
  {
    familia: "parafrase",
    pergunta: "Como agir quando alguém me machuca?",
    esperados: ["Matt 5:44", "Rom 12:19", "Matt 18:21", "Luke 6:27", "Col 3:13", "Rom 12:17"],
  },
  {
    familia: "parafrase",
    pergunta: "Onde encontro conforto durante uma dificuldade?",
    esperados: ["2Cor 1:3", "Ps 34:18", "Ps 23:4", "Matt 11:28", "Ps 46:1", "Ps 121:1"],
  },
  {
    familia: "parafrase",
    pergunta: "O que fazer quando estou com medo?",
    esperados: ["Ps 56:3", "Isa 41:10", "Ps 27:1", "2Tim 1:7", "Josh 1:9", "Ps 23:4"],
  },
  {
    familia: "parafrase",
    pergunta: "Como tratar uma pessoa que me fez mal?",
    esperados: ["Matt 5:44", "Rom 12:17", "Prov 25:21", "Luke 6:27", "Matt 18:21", "Rom 12:19"],
  },
];

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
