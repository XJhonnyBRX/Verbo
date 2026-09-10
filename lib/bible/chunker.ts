/**
 * Divide a Escritura em janelas de versículos para a busca semântica.
 *
 * Por que janela e não versículo isolado: «Não estejais inquietos por coisa
 * alguma» sozinho é um fragmento sem contexto, e o gte-small precisa de todo
 * contexto que puder receber. Ordem de grandeza: 31.102 versículos viram
 * ~15.500 janelas.
 *
 * Por que sobreposição: sem ela, uma ideia que atravessa a fronteira entre
 * duas janelas fica partida em todas elas, e nenhuma das duas recupera bem.
 * Com passo menor que a janela, toda fronteira aparece inteira em algum
 * lugar.
 *
 * Fronteira de capítulo e de livro nunca é atravessada: uma janela que
 * juntasse o fim de Marcos com o começo de Lucas produziria um contexto que
 * não existe em lugar nenhum.
 */

export interface ChunkInput {
  osis: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface Chunk {
  osis: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  content: string;
}

export interface ChunkOptions {
  /** Quantos versículos por janela. */
  janela?: number;
  /** De quantos em quantos versículos a próxima janela começa. */
  passo?: number;
}

export function buildChunks(
  verses: ChunkInput[],
  { janela = 3, passo = 2 }: ChunkOptions = {},
): Chunk[] {
  if (janela < 1) throw new Error("janela precisa ser pelo menos 1");
  if (passo < 1) throw new Error("passo precisa ser pelo menos 1");
  if (passo > janela) {
    throw new Error(
      `passo (${passo}) maior que a janela (${janela}) deixaria versículos ` +
        "fora de qualquer janela, e ninguém perceberia",
    );
  }
  if (verses.length === 0) return [];

  // Agrupa por livro e capítulo — a janela nunca cruza essas fronteiras.
  const porCapitulo = new Map<string, ChunkInput[]>();
  for (const v of verses) {
    const chave = `${v.osis}/${v.chapter}`;
    const lista = porCapitulo.get(chave);
    if (lista) lista.push(v);
    else porCapitulo.set(chave, [v]);
  }

  const chunks: Chunk[] = [];

  for (const lista of porCapitulo.values()) {
    // A entrada pode vir fora de ordem; a janela depende da ordem.
    lista.sort((a, b) => a.verse - b.verse);

    for (let i = 0; i < lista.length; i += passo) {
      const fatia = lista.slice(i, i + janela);
      if (fatia.length === 0) break;

      chunks.push({
        osis: fatia[0].osis,
        chapter: fatia[0].chapter,
        verseStart: fatia[0].verse,
        verseEnd: fatia[fatia.length - 1].verse,
        content: fatia.map((v) => v.text).join(" "),
      });

      // A última janela já alcançou o fim do capítulo: parar aqui evita
      // gerar janelas menores e redundantes na cauda.
      if (i + janela >= lista.length) break;
    }
  }

  return chunks;
}
