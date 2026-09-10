"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { bookByOsis } from "@/lib/bible/canon";
import { getChapter, TRANSLATION_SLUG, type Verse } from "@/lib/data/bible";
import { ESPERA_PARA_REGISTRAR_MS, setPosition } from "@/lib/reading-position";

/* Componente de CLIENTE, e isso não é detalhe.
 *
 * Se o capítulo fosse buscado no servidor, a leitura da Bíblia dependeria do
 * servidor do Next — que não existe dentro de um app Android empacotado. A
 * regra do spec, seção 3: nenhuma lógica essencial no servidor do Next.
 *
 * Ele vive separado de page.tsx porque `generateStaticParams` não pode ser
 * exportado de um arquivo "use client", e o export estático do Capacitor
 * precisa dela para pré-gerar os 1.189 capítulos.
 *
 * O resultado carrega a chave do capítulo que responde. Assim "carregando" é
 * DERIVADO — a chave do resultado ainda não bate com a da rota — em vez de
 * ser um setState síncrono dentro do efeito, que dispara render em cascata a
 * cada troca de capítulo. */

interface Resultado {
  chave: string;
  versos?: Verse[];
  erro?: string;
}

export function ChapterReader({
  osis,
  chapter,
}: {
  osis: string;
  chapter: number;
}) {
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
  const leu = Boolean(atual?.versos?.length);

  /* POSIÇÃO DE LEITURA.
   *
   * Grava só depois de o capítulo passar alguns segundos na tela. Sem isso,
   * folhear o índice apagaria o lugar onde a pessoa estava — cada capítulo
   * aberto por engano viraria a nova posição.
   *
   * A dependência é `leu`, e não só a chave: um capítulo que falhou ao
   * carregar, ou que não existe nesta tradução, não é leitura. Registrá-lo
   * mandaria a pessoa de volta para uma tela vazia amanhã.
   *
   * O `clearTimeout` na limpeza reinicia a contagem a cada troca de
   * capítulo, que é o comportamento que faz a espera significar algo. */
  useEffect(() => {
    if (!leu || !book) return;
    const t = setTimeout(() => {
      void setPosition({
        translation: TRANSLATION_SLUG,
        osis: book.osis,
        chapter,
      });
    }, ESPERA_PARA_REGISTRAR_MS);
    return () => {
      clearTimeout(t);
    };
  }, [leu, book, chapter]);

  return (
    <article className="mx-auto max-w-3xl px-5 pt-6 pb-4">
      <nav className="flex items-baseline justify-between border-b border-hairline pb-3">
        <Link href="/" className="alvo-toque text-[0.8125rem] text-label no-underline">
          Bíblia
        </Link>
        <div className="flex items-baseline gap-4 text-[0.8125rem]">
          {chapter > 1 && (
            <Link
              href={`/biblia/${book.osis}/${chapter - 1}`}
              className="alvo-toque text-label no-underline"
              aria-label="Capítulo anterior"
            >
              ‹ {chapter - 1}
            </Link>
          )}
          {chapter < book.chapters && (
            <Link
              href={`/biblia/${book.osis}/${chapter + 1}`}
              className="alvo-toque text-label no-underline"
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
