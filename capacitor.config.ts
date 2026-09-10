import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Empacotamento Android do VERBO.
 *
 * O Capacitor põe os arquivos de `out/` dentro do APK e os serve de um
 * WebView local. Não há servidor Next envolvido — foi por isso que nenhuma
 * tela lê dados no servidor (spec, seção 3). O app fala direto com o Supabase
 * pela rede, exatamente como o site.
 *
 * ATENÇÃO AO `appId`: ele é PERMANENTE depois da primeira publicação na Play
 * Store. Mudar depois significa um aplicativo novo, com outra ficha, outras
 * avaliações e outra base instalada. Confirme antes do primeiro envio.
 */
const config: CapacitorConfig = {
  appId: "app.verbo.biblia",
  appName: "VERBO",

  // O export estático do Next sai em out/, não em dist/ ou www/.
  webDir: "out",

  android: {
    // Sem HTTP em claro: o app só fala com o Supabase por HTTPS.
    allowMixedContent: false,
  },

  server: {
    androidScheme: "https",
  },
};

export default config;
