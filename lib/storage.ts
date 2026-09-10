/**
 * Armazenamento por dispositivo, com uma interface só.
 *
 * POR QUE NÃO USAR `localStorage` DIRETO: no Android, o sistema pode despejar
 * o armazenamento da WebView quando precisa de espaço. Para uma preferência
 * qualquer isso seria um incômodo; para a posição de leitura é justamente a
 * perda que não pode acontecer, porque é dela que depende a pessoa voltar.
 * `@capacitor/preferences` grava no armazenamento nativo, que não é despejado.
 *
 * A aplicação não sabe qual dos dois está por baixo — e não deve saber. Toda
 * a lógica de armazenamento vive aqui, e não espalhada pelos componentes.
 *
 * A API é assíncrona mesmo na web, onde `localStorage` é síncrono, porque o
 * nativo é assíncrono e uma interface que muda de forma conforme a plataforma
 * empurra a diferença para quem chama.
 */

import { Capacitor } from "@capacitor/core";

/* Import dinâmico: o plugin só é carregado quando existe plataforma nativa.
   Na web isso evita levar código nativo para dentro do bundle. */
async function nativo() {
  const { Preferences } = await import("@capacitor/preferences");
  return Preferences;
}

function temNativo(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function ler(chave: string): Promise<string | null> {
  try {
    if (temNativo()) {
      const { value } = await (await nativo()).get({ key: chave });
      return value ?? null;
    }
    return globalThis.localStorage?.getItem(chave) ?? null;
  } catch {
    /* Navegação privada, cookies bloqueados, armazenamento cheio: ler falhar
       significa «não há valor», nunca derrubar a tela que chamou. */
    return null;
  }
}

export async function gravar(chave: string, valor: string): Promise<void> {
  try {
    if (temNativo()) {
      await (await nativo()).set({ key: chave, value: valor });
      return;
    }
    globalThis.localStorage?.setItem(chave, valor);
  } catch {
    /* Idem: não conseguir gravar a posição de leitura não pode interromper a
       leitura em si. */
  }
}

export async function apagar(chave: string): Promise<void> {
  try {
    if (temNativo()) {
      await (await nativo()).remove({ key: chave });
      return;
    }
    globalThis.localStorage?.removeItem(chave);
  } catch {
    /* silêncio proposital, mesmo motivo */
  }
}
