import { BOOKS } from "@/lib/bible/canon";
import { ChapterReader } from "./chapter-reader";

/* Server Component fino: existe só para poder exportar generateStaticParams,
   que não pode viver num arquivo "use client". Toda a leitura acontece no
   componente de cliente — nada de dados passa pelo servidor do Next, porque
   ele não existe dentro do app Android empacotado. */

/**
 * Os 1.189 capítulos do canon, pré-gerados.
 *
 * No build normal isso dá páginas estáticas; no export do Capacitor é o que
 * permite empacotar a navegação inteira dentro do APK, sem servidor. São
 * cascas leves: o texto vem do banco em tempo de execução.
 */
export function generateStaticParams(): Array<{
  osis: string;
  chapter: string;
}> {
  return BOOKS.flatMap((book) =>
    Array.from({ length: book.chapters }, (_, i) => ({
      osis: book.osis,
      chapter: String(i + 1),
    })),
  );
}

/* Next 16: params é Promise. */
type Params = Promise<{ osis: string; chapter: string }>;

export default async function ChapterPage({ params }: { params: Params }) {
  const { osis, chapter } = await params;
  return <ChapterReader osis={osis} chapter={Number(chapter)} />;
}
