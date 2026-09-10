/**
 * Gera embeddings com o gte-small, que roda DENTRO do Edge Runtime da
 * Supabase — sem chave de API, sem chamada externa, custo zero.
 *
 * É por isso que o pipeline do assistente mora numa Edge Function e não na
 * Vercel: o modelo só existe aqui.
 *
 *   POST { "texts": ["...", "..."] }
 *   ->   { "embeddings": [[384 floats], ...], "dims": 384 }
 *
 * `mean_pool: true` e `normalize: true` são obrigatórios: sem eles a saída
 * não é comparável por distância de cosseno, e a busca semântica devolve
 * ordem aleatória sem dar erro nenhum.
 */

// @ts-expect-error — global do Edge Runtime da Supabase, sem tipos no projeto
const session = new Supabase.ai.Session("gte-small");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("use POST", { status: 405 });
  }

  let corpo: { texts?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return Response.json({ error: "corpo não é JSON" }, { status: 400 });
  }

  const texts = corpo.texts;
  if (!Array.isArray(texts) || texts.length === 0) {
    return Response.json(
      { error: "envie { texts: string[] } com pelo menos um item" },
      { status: 400 },
    );
  }
  if (texts.length > 200) {
    return Response.json(
      { error: `lote grande demais: ${texts.length}, máximo 200` },
      { status: 400 },
    );
  }

  const embeddings: number[][] = [];
  for (const t of texts) {
    if (typeof t !== "string" || t.trim() === "") {
      return Response.json({ error: "texto vazio no lote" }, { status: 400 });
    }
    const vetor = (await session.run(t, {
      mean_pool: true,
      normalize: true,
    })) as number[];
    embeddings.push(vetor);
  }

  return Response.json({
    embeddings,
    dims: embeddings[0]?.length ?? 0,
    count: embeddings.length,
  });
});
