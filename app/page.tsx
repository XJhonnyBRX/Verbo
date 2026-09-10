import Link from "next/link";
import { Attribution } from "@/components/attribution";
import { HomeOpening } from "@/components/continue-reading";
import { NEW_TESTAMENT, OLD_TESTAMENT, type Book } from "@/lib/bible/canon";

/* Esta página continua sendo Server Component de propósito: o índice dos 66
   livros é dado estático de lib/bible/canon.ts, não precisa de rede e não
   deve esperar por ela. Num export estático ele é pré-renderizado, então
   funciona igual dentro do app empacotado.
   O que vem do banco — a abertura e o crédito — está isolado em componentes
   de cliente. */

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 pb-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h1 className="font-scripture text-[1.375rem] font-semibold tracking-[0.14em] text-ink">
          VERBO
        </h1>
        <p className="text-[0.75rem] text-label">Bíblia. Fé. Conhecimento.</p>
      </header>

      <HomeOpening />

      <Testament title="Antigo Testamento" books={OLD_TESTAMENT} />
      <Testament title="Novo Testamento" books={NEW_TESTAMENT} />

      <Attribution className="mt-12 max-w-prose" />
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
