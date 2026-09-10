/**
 * Posição de leitura — onde a pessoa parou.
 *
 * NÃO é `reading_history`, e a distinção é arquitetural, não de nomenclatura.
 *
 *   agora        posição no dispositivo, sem conta, funciona offline
 *   Ciclo 3+     `reading_history` sincroniza entre dispositivos
 *
 * A tabela `reading_history` exige `authenticated` nas três políticas de RLS
 * e referencia `auth.users` — sem o Ciclo 3 ela não recebe uma linha. Ligar o
 * MVP a ela agora acoplaria retenção a autenticação sem necessidade. Quando a
 * conta existir, esta camada continua sendo a fonte imediata e ganha
 * sincronização por cima; nada aqui é jogado fora.
 *
 * GUARDAMOS OSIS, NÃO `book_id`. O identificador do banco é um bigint que só
 * existe no Postgres e que muda se uma tradução for reimportada. O OSIS é o
 * que as rotas usam e o que é estável. A tradução osis → book_id pertence ao
 * servidor, no dia da sincronização.
 *
 * REGISTRO MÍNIMO, de propósito: sem rolagem, sem último versículo, sem
 * porcentagem lida, sem eventos. A feature é «volte onde parou», não um
 * sistema de rastreamento — e cada campo a mais seria um convite a virar isso.
 */

import { bookByOsis } from "./bible/canon";
import { ler, gravar, apagar } from "./storage";

const CHAVE = "verbo.posicao-de-leitura.v1";

export interface ReadingPosition {
  /** Slug da tradução, como em `bible_translations.slug`. */
  translation: string;
  /** Código OSIS do livro, como nas rotas. */
  osis: string;
  chapter: number;
  /** ISO-8601. */
  lastReadAt: string;
}

/**
 * Valida o que veio do disco.
 *
 * O conteúdo do armazenamento é entrada não confiável: pode ser de uma versão
 * anterior do app, pode ter sido editado à mão, pode estar truncado. E um
 * livro que não existe no cânon levaria o cartão «continue lendo» a apontar
 * para uma rota que devolve 404 — o pior resultado possível para a única tela
 * que existe para trazer a pessoa de volta.
 */
export function parsePosition(bruto: string | null): ReadingPosition | null {
  if (!bruto) return null;

  let dado: unknown;
  try {
    dado = JSON.parse(bruto);
  } catch {
    return null;
  }
  if (typeof dado !== "object" || dado === null) return null;

  const { translation, osis, chapter, lastReadAt } = dado as Record<string, unknown>;
  if (typeof translation !== "string" || !translation) return null;
  if (typeof osis !== "string") return null;
  if (typeof lastReadAt !== "string" || !lastReadAt) return null;
  if (typeof chapter !== "number" || !Number.isInteger(chapter)) return null;

  const livro = bookByOsis(osis);
  if (!livro) return null;
  if (chapter < 1 || chapter > livro.chapters) return null;

  return { translation, osis, chapter, lastReadAt };
}

export async function getPosition(): Promise<ReadingPosition | null> {
  return parsePosition(await ler(CHAVE));
}

export async function setPosition(
  p: Omit<ReadingPosition, "lastReadAt">,
): Promise<void> {
  const completo: ReadingPosition = { ...p, lastReadAt: new Date().toISOString() };
  /* Passa pela mesma validação da leitura: gravar uma posição inválida
     produziria um cartão que leva a 404 e só apareceria para o usuário. */
  if (!parsePosition(JSON.stringify(completo))) return;
  await gravar(CHAVE, JSON.stringify(completo));
}

export async function clearPosition(): Promise<void> {
  await apagar(CHAVE);
}

/**
 * Quanto tempo o capítulo precisa ficar na tela para contar como leitura.
 *
 * Sem isto, folhear o índice apagaria o lugar onde a pessoa estava: cada
 * capítulo aberto por engano viraria a nova posição. O número não precisa ser
 * exato — precisa ser maior que um toque errado e menor que a paciência de
 * quem só quis dar uma olhada.
 */
export const ESPERA_PARA_REGISTRAR_MS = 5_000;
