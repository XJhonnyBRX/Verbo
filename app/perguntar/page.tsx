"use client";

import { useState } from "react";
import { AnchorList, type Anchored } from "@/components/anchor";
import { extractCitations, formatReference } from "@/lib/bible/reference";
import { resolvePassage } from "@/lib/data/bible";

/* A regra de ouro rodando na tela.
 *
 * A resposta chega como texto. Este componente NÃO confia nela: extrai toda
 * citação com o parser, resolve cada uma contra o BANCO, e só renderiza as
 * que resolveram. O que não resolveu é contado e mostrado.
 *
 * Na Edge Function `ask` isso acontecerá antes, no servidor, com o mesmo
 * banco — e é de propósito que a checagem também exista aqui: a interface
 * não tem como exibir uma referência sem lastro. */

const SUGGESTIONS = [
  "O que a Bíblia fala sobre ansiedade?",
  "O que é nascer de novo?",
  "Explique o Salmo 23",
];

/* Demonstração enquanto a Edge Function não existe. Cita de propósito um
   "Salmos 151:2" que não existe, para que o descarte apareça funcionando
   contra a Escritura de verdade. */
const DEMO_ANSWER =
  "A Bíblia trata a ansiedade como algo a ser entregue, não administrado. " +
  "Paulo instrui que as petições sejam apresentadas a Deus com ação de graças, " +
  "e promete uma paz que não depende da circunstância ter mudado — Filipenses 4:6-7. " +
  "Pedro usa a imagem de lançar o peso sobre outro, em 1 Pedro 5:7, apoiado numa " +
  "razão: o cuidado de Deus por quem lança. Salmos 151:2 reforça esse mesmo ponto.";

interface Answer {
  text: string;
  anchors: Anchored[];
  discarded: string[];
}

export default function PerguntarPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [pending, setPending] = useState(false);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || pending) return;

    setQuestion(q);
    setPending(true);
    setAnswer(null);

    const { references, rejected } = extractCitations(DEMO_ANSWER);

    // Duas origens de descarte, e as duas contam:
    //   1. citação de lugar que não existe no canon — `rejected`;
    //   2. referência que existe no canon mas não tem texto nesta tradução,
    //      ou não estava no contexto entregue.
    const discarded: string[] = [...rejected];
    const anchors: Anchored[] = [];

    const resolvidas = await Promise.all(
      references.map(async (reference) => ({
        reference,
        texto: await resolvePassage(reference).catch(() => null),
      })),
    );

    for (const { reference, texto } of resolvidas) {
      if (texto) anchors.push({ reference, text: texto });
      else discarded.push(formatReference(reference));
    }

    setAnswer({ text: DEMO_ANSWER, anchors, discarded });
    setPending(false);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 pb-4">
      <h1 className="font-scripture text-[1.5rem] font-semibold text-ink">
        Perguntar
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="mt-5"
      >
        <label className="sr-only" htmlFor="pergunta">
          Sua pergunta sobre a Bíblia
        </label>
        <input
          id="pergunta"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Pergunte sobre a Bíblia"
          autoComplete="off"
          className="w-full border-b border-hairline bg-transparent pb-2.5 font-scripture text-[1.125rem] text-ink outline-none placeholder:text-label focus:border-rubric"
        />
      </form>

      {!answer && !pending && (
        <ul className="mt-7 flex flex-col gap-3">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => void ask(s)}
                className="text-left font-scripture text-[1.0625rem] text-ink-soft underline decoration-hairline underline-offset-4"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <p className="mt-8 text-[0.875rem] text-label" role="status">
          Procurando na Escritura…
        </p>
      )}

      {answer && (
        <section className="mt-8" aria-live="polite">
          <p className="scripture text-ink">{answer.text}</p>

          <AnchorList items={answer.anchors} />

          {answer.discarded.length > 0 && (
            <p className="mt-7 border-t border-hairline pt-4 text-[0.8125rem] leading-relaxed text-label">
              {answer.discarded.length}{" "}
              {answer.discarded.length === 1 ? "citação foi" : "citações foram"}{" "}
              descartada{answer.discarded.length === 1 ? "" : "s"} por não
              existir na Escritura: {answer.discarded.join(", ")}.
            </p>
          )}

          <p className="mt-4 text-[0.8125rem] leading-relaxed text-label">
            Demonstração. A resposta ainda não vem de um modelo — mas as
            referências foram conferidas contra a Bíblia no banco.
          </p>
        </section>
      )}
    </div>
  );
}
