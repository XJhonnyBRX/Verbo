import Link from "next/link";
import { notFound } from "next/navigation";
import { bookByOsis } from "@/lib/bible/canon";
import { sampleChapter } from "@/lib/bible/sample";

/* Next 16: params é Promise. */
type Params = Promise<{ osis: string; chapter: string }>;

export default async function ChapterPage({ params }: { params: Params }) {
  const { osis, chapter: chapterParam } = await params;

  const book = bookByOsis(osis);
  const chapter = Number(chapterParam);

  if (!book || !Number.isInteger(chapter)) notFound();
  if (chapter < 1 || chapter > book.chapters) notFound();

  const content = sampleChapter(book.osis, chapter);

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

      {content ? (
        /* pl deixa espaço para o número pendurado na margem acima de 40rem. */
        <div className="scripture sm:pl-10">
          {content.verses.map((v) => (
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
      ) : (
        <EmptyChapter />
      )}
    </article>
  );
}

function EmptyChapter() {
  return (
    <div className="max-w-prose">
      <p className="scripture text-ink-soft">
        Este capítulo entra quando a tradução for importada.
      </p>
      <p className="mt-4 text-[0.875rem] text-label">
        Na amostra de desenvolvimento existem quatro passagens.
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[0.875rem]">
        {[
          { href: "/biblia/John/3", label: "João 3" },
          { href: "/biblia/Ps/23", label: "Salmos 23" },
          { href: "/biblia/Phil/4", label: "Filipenses 4" },
          { href: "/biblia/1Pet/5", label: "1 Pedro 5" },
        ].map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="anchor-ref no-underline">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
