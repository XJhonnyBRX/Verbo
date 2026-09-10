/**
 * Teste pequeno do gemini-embedding-2 antes de disparar 15 mil chamadas.
 *
 *   npx tsx scripts/embed/smoke-gemini.ts
 *
 * Confirma o que só a API pode confirmar: que o nome do modelo existe, que a
 * dimensão pedida é respeitada, que a saída sai normalizada depois do nosso
 * tratamento, e que consulta e documento produzem vetores DIFERENTES para o
 * mesmo texto — que é a prova de que a instrução assimétrica está sendo
 * aplicada.
 *
 * Nunca imprime a chave.
 */

import { GeminiEmbeddings } from "../../lib/embeddings/gemini";
import { similaridade } from "../../lib/embeddings/types";

process.loadEnvFile(".env.local");

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error("falta GOOGLE_API_KEY em .env.local");
  process.exit(1);
}
console.log(`chave carregada: ${apiKey.length} caracteres, termina em …${apiKey.slice(-4)}`);

const TEXTO = "Não estejais inquietos por coisa alguma; antes, as vossas petições sejam em tudo conhecidas diante de Deus.";
const PERGUNTA = "O que a Bíblia fala sobre ansiedade?";

async function main(): Promise<void> {
  for (const dims of [768]) {
    const g = new GeminiEmbeddings({ apiKey: apiKey!, dimensions: dims });
    const t0 = Date.now();

    const [doc] = await g.embedDocuments([TEXTO]);
    const msDoc = Date.now() - t0;

    const t1 = Date.now();
    const query = await g.embedQuery(PERGUNTA);
    const msQuery = Date.now() - t1;

    // Mesmo texto pelos dois caminhos: se os vetores forem iguais, a
    // instrução assimétrica não está sendo aplicada.
    const [docDoTexto] = await g.embedDocuments([PERGUNTA]);
    const assimetria = similaridade(query, docDoTexto);

    console.log(`\nmodelo: ${g.model}  dims pedidas: ${dims}`);
    console.log(`  documento : ${doc.length} dims, norma ${Math.sqrt(similaridade(doc, doc)).toFixed(4)}, ${msDoc}ms`);
    console.log(`  consulta  : ${query.length} dims, norma ${Math.sqrt(similaridade(query, query)).toFixed(4)}, ${msQuery}ms`);
    console.log(`  pergunta x passagem relevante : ${similaridade(query, doc).toFixed(4)}`);
    console.log(
      `  mesmo texto como query x document: ${assimetria.toFixed(4)}` +
        (assimetria > 0.999
          ? "  <- IDÊNTICOS: a instrução assimétrica NÃO está sendo aplicada"
          : "  <- diferentes: instrução assimétrica ativa"),
    );

    const estimativa = Math.round((15246 * msDoc) / 1000);
    console.log(
      `  estimativa serial para 15.246 chunks: ${estimativa}s ` +
        `(~${Math.round(estimativa / 60)} min); com 4 em paralelo, ~${Math.round(estimativa / 240)} min`,
    );
  }
}

main().catch((e: unknown) => {
  const msg = (e as Error).message;
  console.error(`\nfalhou: ${msg}`);
  if (/404|not found|NOT_FOUND/i.test(msg)) {
    console.error(
      "\nO nome do modelo pode ter mudado. Para listar os disponíveis:\n" +
        "  curl -s 'https://generativelanguage.googleapis.com/v1beta/models' \\\n" +
        "    -H \"x-goog-api-key: $GOOGLE_API_KEY\" | grep -o '\"name\": \"[^\"]*\"'",
    );
  }
  process.exit(1);
});
