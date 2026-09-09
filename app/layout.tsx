import type { Metadata, Viewport } from "next";
import { Faustina, Archivo } from "next/font/google";
import { BottomNav } from "@/components/bottom-nav";
import "./globals.css";

/* Faustina e Archivo são da Omnibus-Type, fundição argentina que desenha
   para os diacríticos do português e do espanhol. Um app bíblico brasileiro
   composto em tipos latino-americanos é uma escolha com motivo. */
const faustina = Faustina({
  subsets: ["latin", "latin-ext"],
  variable: "--font-faustina",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VERBO",
  description: "Bíblia. Fé. Conhecimento.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "VERBO", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#14120f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${faustina.variable} ${archivo.variable}`}>
      <body>
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:bg-paper focus:px-3 focus:py-2 focus:text-sm"
        >
          Pular para o conteúdo
        </a>
        <main id="conteudo">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
