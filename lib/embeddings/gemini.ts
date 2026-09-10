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
  /** Uma ou mais chaves. Com várias, a que for estrangulada sai de cena. */
  apiKey: string | string[];
  /** 128 a 3072. Recomendadas: 768, 1536, 3072. */
  dimensions?: number;
  /** Título usado na instrução de documento. */
  titulo?: string;
}

/** Marca de erro que o chamador reconhece para parar limpo. */
export const COTA_DIARIA = "cota diaria esgotada";

/* Acima disto, a espera pedida nao e a cota por minuto. Ajustavel porque o
   limite pago tem outro comportamento. */
const ESPERA_MAXIMA = Number(process.env.GEMINI_MAX_ESPERA_MS ?? 120_000);

interface Chave {
  valor: string;
  /** Timestamp até quando esta chave está de castigo por 429. */
  bloqueadaAte: number;
  usos: number;
  falhas: number;
}

export class GeminiEmbeddings implements EmbeddingProvider {
  readonly model = "gemini-embedding-2";
  readonly dimensions: number;

  private readonly chaves: Chave[];
  private readonly titulo: string;
  private proxima = 0;

  constructor({ apiKey, dimensions = 768, titulo = "Bíblia" }: GeminiOptions) {
    const lista = (Array.isArray(apiKey) ? apiKey : [apiKey])
      .map((k) => k.trim())
      .filter(Boolean);

    if (lista.length === 0) throw new Error("GeminiEmbeddings exige ao menos uma apiKey");
    if (dimensions < 128 || dimensions > 3072) {
      throw new Error(`dimensão fora da faixa suportada (128–3072): ${dimensions}`);
    }

    this.chaves = lista.map((valor) => ({
      valor,
      bloqueadaAte: 0,
      usos: 0,
      falhas: 0,
    }));
    this.dimensions = dimensions;
    this.titulo = titulo;
  }

  /**
   * Próxima chave utilizável, em rodízio.
   *
   * Cada chave tem cota própria, então uma que levou 429 fica de castigo pelo
   * tempo que a API pediu enquanto as outras seguem trabalhando. Se todas
   * estiverem bloqueadas, devolve a que se libera primeiro e o chamador
   * espera — melhor esperar a certa do que insistir na errada.
   */
  private escolher(): { chave: Chave; esperar: number } {
    const agora = Date.now();

    for (let i = 0; i < this.chaves.length; i++) {
      const c = this.chaves[(this.proxima + i) % this.chaves.length];
      if (c.bloqueadaAte <= agora) {
        this.proxima = (this.proxima + i + 1) % this.chaves.length;
        return { chave: c, esperar: 0 };
      }
    }

    const maisCedo = this.chaves.reduce((a, b) =>
      a.bloqueadaAte <= b.bloqueadaAte ? a : b,
    );
    return { chave: maisCedo, esperar: maisCedo.bloqueadaAte - agora };
  }

  /** Quantas chamadas cada chave absorveu, e quantas levaram 429. */
  estatisticas(): Array<{ final: string; usos: number; falhas: number }> {
    return this.chaves.map((c) => ({
      final: `…${c.valor.slice(-4)}`,
      usos: c.usos,
      falhas: c.falhas,
    }));
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
      const { chave, esperar } = this.escolher();
      if (esperar > ESPERA_MAXIMA) {
        /* Espera longa significa cota DIARIA, nao a de minuto: a de minuto
           pede de 15 a 45 segundos. Dormir uma hora dentro de uma geracao
           reproduz o pior problema operacional que ja tivemos aqui - vinte
           minutos sem sinal de vida, sem saber se esta rodando ou travado.
           Falhar alto deixa o chamador decidir, e o progresso ja esta em
           disco, entao retomar amanha nao custa nada. */
        throw new Error(
          `${COTA_DIARIA}: todas as ${this.chaves.length} chave(s) de castigo por ` +
            `mais ${Math.round(esperar / 1000)}s`,
        );
      }
      if (esperar > 0) {
        // Castigo curto: espera a chave que se libera primeiro.
        await new Promise((res) => setTimeout(res, esperar + 250));
      }

      chave.usos++;
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": chave.valor,
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
      ultimoErro = `${r.status} ${corpo.slice(0, 260)}`;

      if (r.status === 429) {
        chave.falhas++;
        const pedida = GeminiEmbeddings.esperaPedida(corpo);
        /* Cota diária esgotada não se resolve em 40 segundos. Quando a API
           não diz quanto esperar num 429, tratamos como diária e tiramos a
           chave de circulação por uma hora — insistir só queima tentativa. */
        chave.bloqueadaAte = Date.now() + (pedida ?? 3_600_000);
        continue;
      }

      if (r.status >= 500) {
        await new Promise((res) =>
          setTimeout(res, Math.min(1000 * 2 ** (tentativa - 1), 60_000)),
        );
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
  /* 95 por minuto POR CHAVE, com margem sob o teto de 100 medido no free
     tier. Correr até o limite e absorver o 429 desperdiça a chamada e ainda
     impõe castigo; segurar o ritmo é mais rápido no total.
     GEMINI_RPM sobe isso quando houver faturamento ativo. */
  private get rpm(): number {
    return Number(process.env.GEMINI_RPM ?? 95) * this.chaves.length;
  }
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
