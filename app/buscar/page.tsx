"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { passageHref } from "@/components/anchor";
import { formatReference, parseReference } from "@/lib/bible/reference";
import { searchWords, type SearchHit } from "@/lib/data/bible";

/* Duas buscas na mesma caixa, e nenhuma delas custa IA:
     "João 3:16"  → o parser resolve na hora, sem tocar no banco
     "abismo"     → full-text no Postgres, ~19ms no pior caso real
   É o item 11 do documento original virando comportamento de tela. */

/* O resultado carrega o termo que ele responde, então "buscando" é DERIVADO
   e não precisa de setState síncrono dentro do efeito — o que dispararia
   render em cascata a cada tecla. Também resolve de graça o problema da
   resposta antiga chegando depois da nova: se o termo não bate, ela é
   simplesmente ignorada. */
interface Resultado {
  termo: string;
  hits?: SearchHit[];
  erro?: string;
}

export default function BuscarPage() {
  const [query, setQuery] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const trimmed = query.trim();
  const reference = useMemo(() => parseReference(trimmed), [trimmed]);
  const buscaTexto = !reference && trimmed.length >= 2;

  useEffect(() => {
    if (!buscaTexto) return;

    let cancelado = false;

    // Espera a digitação parar: sem isto, "abismo" dispara seis consultas.
    const timer = setTimeout(() => {
      searchWords(trimmed)
        .then((hits) => {
          if (!cancelado) setResultado({ termo: trimmed, hits });
        })
        .catch((e: unknown) => {
          if (!cancelado) {
            setResultado({ termo: trimmed, erro: (e as Error).message });
          }
        });
    }, 250);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [trimmed, buscaTexto]);

  const atual = resultado?.termo === trimmed ? resultado : null;
  const buscando = buscaTexto && !atual;
  const hits = atual?.hits ?? [];
  const erro = atual?.erro ?? null;

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 pb-4">
      <h1 className="font-scripture text-[1.5rem] font-semibold text-ink">
        Buscar
      </h1>

      <label className="sr-only" htmlFor="busca">
        Palavra ou referência
      </label>
      <input
        id="busca"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Uma palavra, ou João 3:16"
        autoComplete="off"
        className="mt-5 w-full border-b border-hairline bg-transparent pb-2.5 font-scripture text-[1.125rem] text-ink outline-none placeholder:text-label focus:border-rubric"
      />

      {reference && (
        <section className="mt-8">
          <p className="text-[0.8125rem] text-label">Referência reconhecida</p>
          <Link
            href={passageHref(reference)}
            className="anchor mt-2 block no-underline"
          >
            <span className="anchor-ref">{formatReference(reference)}</span>
            <p className="anchor-text mt-1">Abrir na Bíblia</p>
          </Link>
        </section>
      )}

      {buscaTexto && (
        <section className="mt-8" aria-live="polite">
          <p className="text-[0.8125rem] text-label">
            {buscando
              ? "Procurando…"
              : erro
                ? "A busca falhou."
                : hits.length === 0
                  ? `Nenhum versículo com «${trimmed}».`
                  : `${hits.length} ${hits.length === 1 ? "versículo" : "versículos"}`}
          </p>

          {erro && <p className="mt-2 text-[0.8125rem] text-label">{erro}</p>}

          <ul className="mt-4 flex flex-col gap-6">
            {hits.map((hit) => (
              <li key={hit.verseId}>
                <Link
                  href={`/biblia/${hit.osis}/${hit.chapter}#v${hit.verse}`}
                  className="block no-underline"
                >
                  <span className="anchor-ref">
                    {hit.book} {hit.chapter}:{hit.verse}
                  </span>
                  <p className="scripture mt-1 text-[1.0625rem] text-ink-soft">
                    {hit.text}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {trimmed.length === 0 && (
        <p className="mt-8 max-w-prose text-[0.9375rem] leading-relaxed text-label">
          Digite uma palavra para procurar no texto, ou uma referência como
          «Sl 23», «1Co 13:4-7» ou «Jd 3». Nenhuma das duas buscas consome IA.
        </p>
      )}
    </div>
  );
}
