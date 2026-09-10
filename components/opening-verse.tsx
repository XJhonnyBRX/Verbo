"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getChapter } from "@/lib/data/bible";

/* A home abre com Escritura, não com a marca — é o que acontece quando você
   abre uma Bíblia. O texto vem do banco, então esta parte é de cliente; o
   índice dos 66 livros continua estático e aparece na hora. */

const ABERTURA = { osis: "Ps", capitulo: 23, versiculo: 1, rotulo: "Salmos 23:1" };

export function OpeningVerse() {
  const [texto, setTexto] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    getChapter(ABERTURA.osis, ABERTURA.capitulo)
      .then((versos) => {
        const v = versos.find((x) => x.verse === ABERTURA.versiculo);
        if (!cancelado && v) setTexto(v.text);
      })
      .catch(() => {
        // A abertura é ornamento com significado, não conteúdo essencial:
        // se o banco não responder, a home continua útil sem ela.
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Reserva a altura para o índice não pular quando o versículo chegar.
  if (!texto) return <div className="mt-10 mb-12 min-h-24" aria-hidden="true" />;

  return (
    <section className="mt-10 mb-12">
      <p className="scripture text-[1.5rem] leading-[1.45] text-ink">{texto}</p>
      <Link
        href={`/biblia/${ABERTURA.osis}/${ABERTURA.capitulo}#v${ABERTURA.versiculo}`}
        className="anchor-ref mt-4 inline-block no-underline"
      >
        {ABERTURA.rotulo}
      </Link>
    </section>
  );
}
