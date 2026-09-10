"use client";

import { useEffect, useState } from "react";
import { getTranslation, type TranslationInfo } from "@/lib/data/bible";

/**
 * Crédito da tradução.
 *
 * A Bíblia Livre é licenciada em Creative Commons Atribuição 3.0 Brasil.
 * **A atribuição é condição da licença, não cortesia** — sem ela, o uso do
 * texto deixa de ser licenciado. Por isso este componente existe desde o
 * Ciclo 1, e não junto com o polimento do Ciclo 6.
 *
 * O texto vem do banco, da linha da tradução realmente importada. Se um dia
 * entrar outra tradução, o crédito acompanha sozinho.
 */
export function Attribution({ className = "" }: { className?: string }) {
  const [info, setInfo] = useState<TranslationInfo | null>(null);

  useEffect(() => {
    let cancelado = false;
    getTranslation()
      .then((t) => {
        if (!cancelado) setInfo(t);
      })
      .catch(() => {
        /* silêncio: o fallback abaixo cobre */
      });
    return () => {
      cancelado = true;
    };
  }, []);

  if (!info) return null;

  return (
    <p className={`text-[0.75rem] leading-relaxed text-label ${className}`}>
      Texto bíblico:{" "}
      {info.licenseUrl ? (
        <a
          href={info.licenseUrl}
          target="_blank"
          rel="noreferrer license"
          className="underline decoration-hairline underline-offset-2"
        >
          {info.name}
        </a>
      ) : (
        info.name
      )}
      . {info.license}.
    </p>
  );
}
