/**
 * Fronteira do VERBO com quem gera embeddings.
 *
 * Existe para que a escolha do modelo seja uma decisão, não um casamento. O
 * Ciclo 4.1 está medindo três candidatos; qualquer um que vencer entra por
 * aqui sem tocar no resto do sistema.
 *
 * DUAS OPERAÇÕES, e a separação não é cosmética. Modelos de retrieval moderno
 * são ASSIMÉTRICOS: a pergunta e o documento recebem tratamentos diferentes
 * antes de virar vetor.
 *
 *   e5                 prefixos "query:" e "passage:"
 *   gemini-embedding-2 instrução no texto — "task: search result | query: …"
 *                      contra "title: … | text: …"
 *   gte-small          simétrico, ignora a distinção
 *
 * Quem chama não precisa saber qual é qual; quem implementa é obrigado a
 * tratar. Usar o tratamento errado degrada a qualidade em silêncio, sem erro
 * nenhum — que é o modo de falha mais caro que existe em busca semântica.
 *
 * A assimetria dos métodos também reflete a arquitetura real medida no Ciclo
 * 4: documentos são embedados em lote, uma vez, na ingestão; perguntas são
 * embedadas uma por vez, na Edge Function, a cada uso.
 */

export interface EmbeddingProvider {
  /** Identificador do modelo, como vai para `bible_translations`-style metadata. */
  readonly model: string;

  /** Dimensão da saída. Define o tipo da coluna `vector(n)` no Postgres. */
  readonly dimensions: number;

  /** Uma pergunta de usuário. Caminho de consulta: um texto, muitas vezes. */
  embedQuery(text: string): Promise<Float32Array>;

  /** Textos da Escritura. Caminho de ingestão: muitos textos, uma vez. */
  embedDocuments(texts: string[]): Promise<Float32Array[]>;
}

/** Produto interno. Só vale para vetores normalizados — todos os nossos são. */
export function similaridade(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Normaliza para comprimento 1.
 *
 * Nem todo provedor devolve normalizado — o Gemini, por exemplo, só normaliza
 * automaticamente em 3072 dimensões; abaixo disso a saída da redução
 * Matryoshka precisa ser renormalizada. Sem isso, a distância de cosseno
 * deixa de ser comparável e o ranking sai errado sem dar erro.
 */
export function normalizar(v: Float32Array): Float32Array {
  let soma = 0;
  for (const x of v) soma += x * x;
  const norma = Math.sqrt(soma);
  if (norma === 0 || Math.abs(norma - 1) < 1e-6) return v;

  const saida = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) saida[i] = v[i] / norma;
  return saida;
}
