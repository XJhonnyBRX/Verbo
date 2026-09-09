import Link from "next/link";
import type { Reference } from "@/lib/bible/reference";
import { formatReference } from "@/lib/bible/reference";

/**
 * A âncora — o objeto mais desenhado do VERBO.
 *
 * Em todo app de IA a referência é um chip cinza de rodapé. Aqui ela traz o
 * texto do versículo, vindo do banco, composto no tipo da Escritura, atrás de
 * um filete vermelho. Um chip diz "confie em mim". O versículo diz "confira".
 *
 * Consequência de desenho: se o texto não veio, a âncora não é renderizada.
 * Uma referência sem lastro não tem como aparecer nesta interface.
 */

export interface Anchored {
  reference: Reference;
  /** Texto real dos versículos, já resolvido contra o banco. */
  text: string;
}

export function Anchor({ item, index = 0 }: { item: Anchored; index?: number }) {
  const label = formatReference(item.reference);
  const href = passageHref(item.reference);

  if (!item.text?.trim()) return null;

  return (
    <Link
      href={href}
      className="anchor anchor-enter block no-underline"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <span className="anchor-ref">{label}</span>
      <p className="anchor-text mt-1">{item.text}</p>
    </Link>
  );
}

export function AnchorList({ items }: { items: Anchored[] }) {
  const anchored = items.filter((i) => i.text?.trim());
  if (anchored.length === 0) return null;

  return (
    <div className="mt-7 flex flex-col gap-5">
      {anchored.map((item, i) => (
        <Anchor key={formatReference(item.reference)} item={item} index={i} />
      ))}
    </div>
  );
}

export function passageHref(ref: Reference): string {
  const base = `/biblia/${ref.osis}/${ref.chapter}`;
  return ref.verseStart ? `${base}#v${ref.verseStart}` : base;
}
