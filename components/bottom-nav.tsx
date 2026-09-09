"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* Barra inferior, não gaveta lateral: alcance de polegar. O VERBO vai ser
   instalado como app, e app instalado se navega com o dedo onde o dedo está. */

type Item = {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const items: Item[] = [
  {
    href: "/",
    label: "Bíblia",
    icon: () => (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6">
        <path {...stroke} d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
        <path {...stroke} d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
      </svg>
    ),
  },
  {
    href: "/buscar",
    label: "Buscar",
    icon: () => (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6">
        <circle {...stroke} cx="11" cy="11" r="6.25" />
        <path {...stroke} d="m15.6 15.6 3.9 3.9" />
      </svg>
    ),
  },
  {
    href: "/perguntar",
    label: "Perguntar",
    icon: () => (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6">
        <path
          {...stroke}
          d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16H9.8L5.5 19.4a.6.6 0 0 1-1-.47V16A2.5 2.5 0 0 1 4.5 13.5z"
        />
      </svg>
    ),
  },
  {
    href: "/conta",
    label: "Conta",
    icon: () => (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6">
        <circle {...stroke} cx="12" cy="8.5" r="3.75" />
        <path {...stroke} d="M5 20c0-3.4 3.1-5.5 7-5.5s7 2.1 7 5.5" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-paper/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/" || pathname.startsWith("/biblia")
              : pathname.startsWith(item.href);

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] ${
                  active ? "font-semibold text-ink" : "text-label"
                }`}
              >
                {item.icon(active)}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
