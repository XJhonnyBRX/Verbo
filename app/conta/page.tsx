import Link from "next/link";

/* Auth entra no Ciclo 3. Esta tela existe para que a barra inferior tenha
   quatro destinos reais desde o começo, e para dizer a verdade sobre o que
   ainda não funciona. */

export default function ContaPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 pb-4">
      <h1 className="font-scripture text-[1.5rem] font-semibold text-ink">
        Conta
      </h1>

      <p className="scripture mt-6 text-ink-soft">
        Entrar, favoritar e anotar entram no Ciclo 3.
      </p>

      <dl className="mt-8 max-w-prose">
        {[
          ["Favoritos", "Guardados por posição no cânon, não por tradução — trocar de tradução não perde nada."],
          ["Anotações", "Suas, e só suas: isolamento garantido pelo banco, não pela tela."],
          ["Histórico", "Para o app abrir onde você parou de ler."],
        ].map(([term, detail]) => (
          <div key={term} className="border-b border-hairline py-4">
            <dt className="text-[0.9375rem] font-semibold text-ink">{term}</dt>
            <dd className="mt-1 text-[0.875rem] leading-relaxed text-label">
              {detail}
            </dd>
          </div>
        ))}
      </dl>

      <Link
        href="/"
        className="anchor-ref mt-8 inline-block no-underline"
      >
        Voltar à Bíblia
      </Link>
    </div>
  );
}
