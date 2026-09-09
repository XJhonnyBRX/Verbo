import Link from "next/link";
import { NEW_TESTAMENT, OLD_TESTAMENT, type Book } from "@/lib/bible/canon";
import { sampleVerse } from "@/lib/bible/sample";

/* A home abre com o texto, não com a marca. É o que acontece quando você
   abre uma Bíblia: você vê Escritura. O índice vem depois. */

export default function Home() {
  const opening = sampleVerse("Ps", 23, 1);

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 pb-4">
      <header className="flex items-baseline justify-between">
        <h1 className="font-scripture text-[1.375rem] font-semibold tracking-[0.14em] text-ink">
          VERBO
        </h1>
        <p className="text-[0.75rem] text-label">Bíblia. Fé. Conhecimento.</p>
      </header>

      {opening && (
        <section className="mt-10 mb-12">
          <p className="scripture text-[1.5rem] leading-[1.45] text-ink">
            {opening.text}
          </p>
          <Link
            href="/biblia/Ps/23"
            className="anchor-ref mt-4 inline-block no-underline"
          >
            Salmos 23:1
          </Link>
        </section>
      )}

      <Testament title="Antigo Testamento" books={OLD_TESTAMENT} />
      <Testament title="Novo Testamento" books={NEW_TESTAMENT} />

      <p className="mt-12 max-w-prose text-[0.8125rem] leading-relaxed text-label">
        O texto exibido é uma amostra de desenvolvimento e não serve para
        estudo. A tradução definitiva entra depois da verificação de licença.
      </p>
    </div>
  );
}

function Testament({ title, books }: { title: string; books: Book[] }) {
  return (
    <section className="mb-10">
      <h2 className="border-b border-hairline pb-2 text-[0.875rem] font-semibold text-ink">
        {title}
      </h2>
      <ul className="mt-1 sm:columns-2 sm:gap-10">
        {books.map((book) => (
          <li key={book.osis} className="break-inside-avoid">
            <Link
              href={`/biblia/${book.osis}/1`}
              className="flex items-baseline justify-between gap-4 border-b border-hairline/60 py-2.5 no-underline"
            >
              <span className="text-[0.9375rem] text-ink">{book.name}</span>
              <span className="text-[0.75rem] tabular-nums text-label">
                {book.chapters}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
