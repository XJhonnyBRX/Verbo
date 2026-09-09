"use client";

import { useState } from "react";
import { AnchorList, type Anchored } from "@/components/anchor";
import { extractCitations, formatReference } from "@/lib/bible/reference";
import { sampleResolve } from "@/lib/bible/sample";

/* A regra de ouro rodando na tela.
 *
 * A resposta chega como texto. Este componente NÃO confia nela: extrai toda
 * citação com o parser, resolve cada uma contra a fonte, e só renderiza as que
 * resolveram. O que não resolveu é contado e mostrado.
 *
 * Na Edge Function `ask` isso acontece antes, no servidor, e com o banco no
 * lugar da amostra — mas a lógica é esta, e é de propósito que ela também
 * exista aqui: a interface não tem como exibir uma referência sem lastro. */

const SUGGESTIONS = [
  "O que a Bíblia fala sobre ansiedade?",
  "O que é nascer de novo?",
  "Explique o Salmo 23",
];

/* Demonstração enquanto a Edge Function não existe. Cita de propósito um
   "Salmos 151:2" que não existe, para que o descarte apareça funcionando. */
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

  function ask(text: string) {
    const q = text.trim();
    if (!q || pending) return;

    setQuestion(q);
    setPending(true);
    setAnswer(null);

    // Enquanto a Edge Function não está ligada, a resposta é fixa. A validação
    // abaixo é a real e roda igual.
    window.setTimeout(() => {
      const { references, rejected } = extractCitations(DEMO_ANSWER);

      const anchors: Anchored[] = [];
      // Duas origens de descarte, e as duas contam:
      //   1. citação de lugar que não existe no canon — `rejected`;
      //   2. referência que existe mas não estava no contexto entregue —
      //      acertar por sorte também é falha.
      const discarded: string[] = [...rejected];

      for (const reference of references) {
        const resolved = sampleResolve(reference);
        if (resolved) anchors.push({ reference, text: resolved });
        else discarded.push(formatReference(reference));
      }

      setAnswer({ text: DEMO_ANSWER, anchors, discarded });
      setPending(false);
    }, 320);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 pb-4">
      <h1 className="font-scripture text-[1.5rem] font-semibold text-ink">
        Perguntar
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
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
                onClick={() => ask(s)}
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
            Demonstração. A resposta ainda não vem de um modelo — a validação
            das referências, essa sim, é a de verdade.
          </p>
        </section>
      )}
    </div>
  );
}
