/**
 * Embeddings rodando em Node, via Transformers.js.
 *
 * SÓ PARA INGESTÃO. Importa `@huggingface/transformers`, que é dependência de
 * desenvolvimento e carrega o modelo em memória — nada disso pode entrar no
 * bundle do navegador nem no app Android.
 *
 * Existe porque a medição do Ciclo 4 mostrou que a Edge Function não sustenta
 * carga em lote: teto de ~20 textos por invocação e o supervisor derruba o
 * worker depois de algumas centenas. Aqui não há esse limite.
 *
 * Para o gte-small especificamente, os vetores gerados aqui são IDÊNTICOS aos
 * da Edge Function — similaridade 1,000000, medido em
 * scripts/embed/compare-runtimes.mjs. Para os outros modelos essa equivalência
 * não existe, porque o Edge Runtime só traz o gte-small embutido.
 */

import {
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";
import type { EmbeddingProvider } from "./types";

export interface LocalOptions {
  model: string;
  /** Textos por passada no pipeline. */
  lote?: number;
}

export class LocalEmbeddings implements EmbeddingProvider {
  readonly model: string;
  /** Descoberta na primeira chamada — não presumida a partir do nome. */
  dimensions = 0;

  private readonly lote: number;
  private extrair?: FeatureExtractionPipeline;
  /** Modelos e5 exigem prefixo; sem ele a qualidade cai sem avisar. */
  private readonly usaPrefixoE5: boolean;

  constructor({ model, lote = 64 }: LocalOptions) {
    this.model = model;
    this.lote = lote;
    this.usaPrefixoE5 = model.toLowerCase().includes("e5");
  }

  private async carregar(): Promise<FeatureExtractionPipeline> {
    this.extrair ??= (await pipeline(
      "feature-extraction",
      this.model,
    )) as FeatureExtractionPipeline;
    return this.extrair;
  }

  private async rodar(
    texts: string[],
    modo: "query" | "passage",
  ): Promise<Float32Array[]> {
    const extrair = await this.carregar();
    const entrada = this.usaPrefixoE5
      ? texts.map((t) => `${modo}: ${t}`)
      : texts;

    const saida = await extrair(entrada, { pooling: "mean", normalize: true });
    const dados = saida.data as Float32Array;
    const dims = dados.length / texts.length;
    this.dimensions = dims;

    return texts.map((_, i) => dados.slice(i * dims, (i + 1) * dims));
  }

  async embedQuery(text: string): Promise<Float32Array> {
    const [v] = await this.rodar([text], "query");
    return v;
  }

  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    const saida: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += this.lote) {
      saida.push(...(await this.rodar(texts.slice(i, i + this.lote), "passage")));
    }
    return saida;
  }
}
