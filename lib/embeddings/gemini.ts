/**
 * Embeddings pelo gemini-embedding-2.
 *
 * Verificado na documentação em 2026-09-10, e diferente do modelo anterior de
 * um jeito que importa: **o gemini-embedding-2 não tem parâmetro `task_type`.**
 * O `gemini-embedding-001` usava RETRIEVAL_QUERY e RETRIEVAL_DOCUMENT; o 2
 * espera a instrução dentro do próprio texto:
 *
 *   consulta   task: search result | query: {texto}
 *   documento  title: {título} | text: {texto}
 *
 * Codificar o formato antigo aqui não daria erro — daria vetores piores, em
 * silêncio. É por isso que a distinção query/document vive na interface e não
 * na cabeça de quem chama.
 *
 * Dimensão configurável de 128 a 3072 por Matryoshka Representation Learning,
 * com 768, 1536 e 3072 recomendadas. Começamos em 768: o custo computacional
 * de 3072 só se justifica com evidência de que precisamos dele.
 */

import { normalizar, type EmbeddingProvider } from "./types";

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent";

interface Resposta {
  embedding?: { values: number[] };
  error?: { message: string; status?: string };
}

export interface GeminiOptions {
  apiKey: string;
  /** 128 a 3072. Recomendadas: 768, 1536, 3072. */
  dimensions?: number;
  /** Título usado na instrução de documento. */
  titulo?: string;
}

export class GeminiEmbeddings implements EmbeddingProvider {
  readonly model = "gemini-embedding-2";
  readonly dimensions: number;

  private readonly apiKey: string;
  private readonly titulo: string;

  constructor({ apiKey, dimensions = 768, titulo = "Bíblia" }: GeminiOptions) {
    if (!apiKey) throw new Error("GeminiEmbeddings exige apiKey");
    if (dimensions < 128 || dimensions > 3072) {
      throw new Error(`dimensão fora da faixa suportada (128–3072): ${dimensions}`);
    }
    this.apiKey = apiKey;
    this.dimensions = dimensions;
    this.titulo = titulo;
  }

  private async chamar(texto: string): Promise<Float32Array> {
    let ultimoErro = "";

    for (let tentativa = 1; tentativa <= 5; tentativa++) {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          model: "models/gemini-embedding-2",
          content: { parts: [{ text: texto }] },
          output_dimensionality: this.dimensions,
        }),
      });

      if (r.ok) {
        const d = (await r.json()) as Resposta;
        const valores = d.embedding?.values;
        if (!valores) throw new Error("resposta sem embedding");
        // Abaixo de 3072 a saída Matryoshka não vem normalizada.
        return normalizar(new Float32Array(valores));
      }

      ultimoErro = `${r.status} ${await r.text()}`;
      // 429 = cota, 5xx = instável. Ambos merecem nova tentativa.
      if (r.status === 429 || r.status >= 500) {
        await new Promise((res) => setTimeout(res, 500 * 2 ** (tentativa - 1)));
        continue;
      }
      break;
    }

    throw new Error(`gemini-embedding-2 falhou: ${ultimoErro}`);
  }

  async embedQuery(text: string): Promise<Float32Array> {
    return this.chamar(`task: search result | query: ${text}`);
  }

  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    // A API embeda um conteúdo por requisição; a concorrência é o que dá
    // vazão. Quatro em paralelo é conservador o bastante para não bater em
    // cota e rápido o bastante para 15 mil chunks.
    const CONCORRENCIA = 4;
    const saida: Float32Array[] = new Array<Float32Array>(texts.length);

    for (let i = 0; i < texts.length; i += CONCORRENCIA) {
      const grupo = texts.slice(i, i + CONCORRENCIA);
      const vs = await Promise.all(
        grupo.map((t) => this.chamar(`title: ${this.titulo} | text: ${t}`)),
      );
      vs.forEach((v, j) => (saida[i + j] = v));
    }

    return saida;
  }
}
