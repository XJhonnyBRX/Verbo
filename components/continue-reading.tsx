"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bookByOsis } from "@/lib/bible/canon";
import { getPosition, type ReadingPosition } from "@/lib/reading-position";
import { OpeningVerse } from "@/components/opening-verse";

/**
 * A abertura da home: onde a pessoa parou, ou a Escritura de sempre.
 *
 * SUBSTITUI a abertura em vez de empilhar sobre ela. A home abre com
 * Escritura — esse princípio não muda aqui, muda de referência: para quem
 * está voltando, a Escritura dela é o capítulo onde parou. Empilhar as duas
 * criaria duas regiões de destaque competindo, e a segunda venceria por ser a
 * que tem um botão.
 *
 * Enquanto o disco não responde, nenhuma das duas aparece — senão a home
 * mostraria o versículo de abertura e o trocaria pelo cartão um instante
 * depois, na frente do usuário.
 */
export function HomeOpening() {
  const [estado, setEstado] = useState<"lendo" | "com" | "sem">("lendo");
  const [posicao, setPosicao] = useState<ReadingPosition | null>(null);

  useEffect(() => {
    let cancelado = false;
    getPosition()
      .then((p) => {
        if (cancelado) return;
        setPosicao(p);
        setEstado(p ? "com" : "sem");
      })
      .catch(() => {
        if (!cancelado) setEstado("sem");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Reserva a altura para o índice dos 66 livros não pular.
  if (estado === "lendo") return <div className="mt-10 mb-12 min-h-24" aria-hidden="true" />;
  if (estado === "sem" || !posicao) return <OpeningVerse />;

  return <ContinueCard posicao={posicao} />;
}

function ContinueCard({ posicao }: { posicao: ReadingPosition }) {
  const livro = bookByOsis(posicao.osis);
  if (!livro) return <OpeningVerse />;

  const quando = quandoFoi(posicao.lastReadAt);

  return (
    <section className="mt-10 mb-12">
      <p className="text-[0.75rem] text-label">
        Você parou aqui{quando ? ` ${quando}` : ""}
      </p>
      <Link
        href={`/biblia/${posicao.osis}/${posicao.chapter}`}
        className="alvo-toque mt-2 inline-block no-underline"
      >
        <span className="font-scripture text-[1.5rem] leading-[1.45] text-ink">
          {livro.name}{" "}
          <span className="tabular-nums font-normal">{posicao.chapter}</span>
        </span>
      </Link>
      <p className="mt-3 text-[0.8125rem] text-label">Continuar a leitura</p>
    </section>
  );
}

/**
 * «ontem», «há 3 dias» — em dias inteiros, não em horas.
 *
 * A leitura da Bíblia é um hábito diário, não uma sessão cronometrada. «há 4
 * horas» sugere uma precisão que não serve a nada aqui e faz a tela parecer
 * um painel de métricas, que é exatamente o que esta feature não é.
 */
function quandoFoi(iso: string): string | null {
  const entao = new Date(iso);
  if (Number.isNaN(entao.getTime())) return null;

  /* Diferença em dias de CALENDÁRIO, não em múltiplos de 24 horas: quem leu
     às 23h e volta às 7h leu «ontem», não «hoje». */
  const dia = (d: Date) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
  const dias = dia(new Date()) - dia(entao);

  if (dias <= 0) return null; // hoje: dizer «hoje» não acrescenta nada
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return null; // muito tempo: a contagem viraria cobrança
}
