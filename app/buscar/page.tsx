"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatReference, parseReference } from "@/lib/bible/reference";
import { sampleSearch } from "@/lib/bible/sample";
import { passageHref } from "@/components/anchor";

/* Duas buscas na mesma caixa, e nenhuma delas custa IA:
     "João 3:16"  → o parser resolve a referência na hora
     "pastor"     → full-text no Postgres (aqui, na amostra)
   É o item 11 do documento original virando comportamento de tela. */

export default function BuscarPage() {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  const reference = useMemo(() => parseReference(trimmed), [trimmed]);
  const hits = useMemo(
    () => (reference || trimmed.length < 2 ? [] : sampleSearch(trimmed)),
    [reference, trimmed],
  );

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
          <p className="text-[0.8125rem] text-label">
            Referência reconhecida
          </p>
          <Link
            href={passageHref(reference)}
            className="anchor mt-2 block no-underline"
          >
            <span className="anchor-ref">{formatReference(reference)}</span>
            <p className="anchor-text mt-1">Abrir na Bíblia</p>
          </Link>
        </section>
      )}

      {!reference && trimmed.length >= 2 && (
        <section className="mt-8">
          <p className="text-[0.8125rem] text-label">
            {hits.length === 0
              ? "Nada encontrado na amostra de desenvolvimento."
              : `${hits.length} ${hits.length === 1 ? "versículo" : "versículos"}`}
          </p>

          <ul className="mt-4 flex flex-col gap-6">
            {hits.map((hit) => (
              <li key={`${hit.osis}-${hit.chapter}-${hit.verse}`}>
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
