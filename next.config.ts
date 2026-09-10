import type { NextConfig } from "next";

/**
 * Dois modos de build, e o segundo só existe por causa do Android.
 *
 *   normal        `npm run build`             — serve na web, rotas dinâmicas
 *   estático      `VERBO_STATIC=1 npm run build` — HTML puro em out/, para o
 *                 Capacitor empacotar dentro do APK
 *
 * O modo estático é condicional em vez de permanente porque `output: "export"`
 * desabilita `next start`, e com isso o `verify:ui`, que roda contra um
 * servidor de verdade. Ter os dois modos mantém a verificação funcionando.
 *
 * O export só é possível porque nenhuma tela lê dados no servidor: o cliente
 * fala direto com o Supabase. Foi a decisão da seção 3 do spec, tomada
 * pensando exatamente neste momento.
 */
const estatico = process.env.VERBO_STATIC === "1";

const nextConfig: NextConfig = {
  ...(estatico
    ? {
        output: "export",
        // Sem servidor não há otimizador de imagens.
        images: { unoptimized: true },
        // O WebView do Capacitor serve arquivos: /rota/ precisa virar
        // /rota/index.html.
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
