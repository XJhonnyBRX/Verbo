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

  /**
   * Espera o tempo que a PRÓPRIA API pediu.
   *
   * Medido: o free tier permite 100 requisições de embedding por minuto, e
   * quando estoura a resposta traz «Please retry in 42.499928451s». Backoff
   * exponencial nosso, começando em 500ms, chegaria a 8s depois de cinco
   * tentativas — nem perto. O processo morria em 193 de 15.246.
   *
   * A regra: se a API disse quanto esperar, espere aquilo.
   */
  private static esperaPedida(corpo: string): number | null {
    const m = /retry in ([\d.]+)s/i.exec(corpo);
    if (m) return Math.ceil(Number(m[1]) * 1000) + 500;
    const j = /"retryDelay"\s*:\s*"([\d.]+)s"/i.exec(corpo);
    if (j) return Math.ceil(Number(j[1]) * 1000) + 500;
    return null;
  }

  private async chamar(texto: string): Promise<Float32Array> {
    let ultimoErro = "";

    for (let tentativa = 1; tentativa <= 8; tentativa++) {
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

      const corpo = await r.text();
      ultimoErro = `${r.status} ${corpo.slice(0, 200)}`;

      if (r.status === 429 || r.status >= 500) {
        const pedida = GeminiEmbeddings.esperaPedida(corpo);
        const espera = pedida ?? Math.min(1000 * 2 ** (tentativa - 1), 60_000);
        await new Promise((res) => setTimeout(res, espera));
        continue;
      }
      break;
    }

    throw new Error(`gemini-embedding-2 falhou: ${ultimoErro}`);
  }

  async embedQuery(text: string): Promise<Float32Array> {
    return this.chamar(`task: search result | query: ${text}`);
  }

  /**
   * Estrangula ANTES de bater na cota, em vez de bater e se recuperar.
   *
   * Medido no free tier: 100 requisições de embedding por minuto. Correr até
   * o limite e absorver o 429 desperdiça a chamada e ainda impõe uma espera
   * de 42 segundos. Manter o ritmo abaixo do teto é mais rápido no total,
   * além de mais educado com a API.
   *
   * `GEMINI_RPM` permite subir isso quando houver faturamento ativo — o
   * limite pago é muito maior.
   */
  private readonly rpm = Number(process.env.GEMINI_RPM ?? 95);
  private janela: number[] = [];

  private async aguardarVaga(): Promise<void> {
    const agora = Date.now();
    this.janela = this.janela.filter((t) => agora - t < 60_000);
    if (this.janela.length >= this.rpm) {
      const espera = 60_000 - (agora - this.janela[0]) + 100;
      await new Promise((r) => setTimeout(r, espera));
      return this.aguardarVaga();
    }
    this.janela.push(Date.now());
  }

  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    const saida: Float32Array[] = new Array<Float32Array>(texts.length);
    // Concorrência baixa: o gargalo é a cota por minuto, não a latência.
    const CONCORRENCIA = 4;

    for (let i = 0; i < texts.length; i += CONCORRENCIA) {
      const grupo = texts.slice(i, i + CONCORRENCIA);
      const vs = await Promise.all(
        grupo.map(async (t) => {
          await this.aguardarVaga();
          return this.chamar(`title: ${this.titulo} | text: ${t}`);
        }),
      );
      vs.forEach((v, j) => (saida[i + j] = v));
    }

    return saida;
  }
}
