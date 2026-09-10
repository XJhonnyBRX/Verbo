"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { bookByOsis } from "@/lib/bible/canon";
import { getChapter, type Verse } from "@/lib/data/bible";

/* Componente de CLIENTE, e isso não é detalhe.
 *
 * Se o capítulo fosse buscado no servidor, a leitura da Bíblia dependeria do
 * servidor do Next — que não existe dentro de um app Android empacotado. A
 * regra do spec, seção 3: nenhuma lógica essencial no servidor do Next.
 *
 * O custo é perder renderização no servidor destas páginas, e com ela o SEO
 * de buscas como «João 3:16». A recuperação é aditiva e vem depois: uma rota
 * pública server-rendered, fora do build do Capacitor. */

/* O resultado carrega a chave do capítulo que ele responde. Assim "carregando"
   é DERIVADO — a chave do resultado ainda não bate com a da rota — em vez de
   ser um setState síncrono dentro do efeito, que dispara render em cascata a
   cada troca de capítulo. */
interface Resultado {
  chave: string;
  versos?: Verse[];
  erro?: string;
}

export default function ChapterPage() {
  const params = useParams<{ osis: string; chapter: string }>();
  const osis = params.osis;
  const chapter = Number(params.chapter);

  const book = bookByOsis(osis);
  const valido =
    book && Number.isInteger(chapter) && chapter >= 1 && chapter <= book.chapters;
  const chave = `${osis}/${chapter}`;

  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    if (!valido || !book) return;
    let cancelado = false;

    getChapter(book.osis, chapter)
      .then((versos) => {
        if (!cancelado) setResultado({ chave, versos });
      })
      .catch((erro: unknown) => {
        if (!cancelado) {
          setResultado({ chave, erro: (erro as Error).message });
        }
      });

    return () => {
      cancelado = true;
    };
  }, [book, chapter, chave, valido]);

  if (!valido || !book) notFound();

  const atual = resultado?.chave === chave ? resultado : null;

  return (
    <article className="mx-auto max-w-3xl px-5 pt-6 pb-4">
      <nav className="flex items-baseline justify-between border-b border-hairline pb-3">
        <Link href="/" className="text-[0.8125rem] text-label no-underline">
          Bíblia
        </Link>
        <div className="flex items-baseline gap-4 text-[0.8125rem]">
          {chapter > 1 && (
            <Link
              href={`/biblia/${book.osis}/${chapter - 1}`}
              className="text-label no-underline"
              aria-label="Capítulo anterior"
            >
              ‹ {chapter - 1}
            </Link>
          )}
          {chapter < book.chapters && (
            <Link
              href={`/biblia/${book.osis}/${chapter + 1}`}
              className="text-label no-underline"
              aria-label="Próximo capítulo"
            >
              {chapter + 1} ›
            </Link>
          )}
        </div>
      </nav>

      <header className="mt-8 mb-7">
        <h1 className="font-scripture text-[1.75rem] font-semibold text-ink">
          {book.name}{" "}
          <span className="font-normal tabular-nums text-label">{chapter}</span>
        </h1>
      </header>

      {!atual && (
        <p className="text-[0.875rem] text-label" role="status">
          Abrindo o capítulo…
        </p>
      )}

      {atual?.erro && (
        <div className="max-w-prose">
          <p className="scripture text-ink-soft">
            Não foi possível abrir este capítulo agora.
          </p>
          <p className="mt-3 text-[0.8125rem] text-label">{atual.erro}</p>
        </div>
      )}

      {atual?.versos?.length === 0 && (
        <p className="scripture max-w-prose text-ink-soft">
          Este capítulo não foi encontrado nesta tradução.
        </p>
      )}

      {atual?.versos && atual.versos.length > 0 && (
        /* pl deixa espaço para o número pendurado na margem acima de 40rem. */
        <div className="scripture sm:pl-10">
          {atual.versos.map((v) => (
            <p key={v.verse} id={`v${v.verse}`} className="verse">
              <span className="verse-num" aria-hidden="true">
                {v.verse}
              </span>
              <span className="sr-only">Versículo {v.verse}. </span>
              <span className={v.wordsOfChrist ? "words-of-christ" : undefined}>
                {v.text}
              </span>
            </p>
          ))}
        </div>
      )}
    </article>
  );
}
