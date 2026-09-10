/**
 * A única porta de leitura da Escritura.
 *
 * Nenhuma tela fala com o Supabase direto. Duas consequências práticas: a
 * tradução entre o formato do banco e o das telas existe num lugar só, e o
 * cache offline — que é o motivo real de um app bíblico virar nativo — entra
 * aqui depois sem tocar em componente nenhum.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reference } from "@/lib/bible/reference";
import { supabaseBrowser } from "@/lib/supabase/client";

export const TRANSLATION_SLUG =
  process.env.NEXT_PUBLIC_VERBO_TRANSLATION ?? "blivre";

let cliente: SupabaseClient | undefined;

/** Ponto de injeção para teste. Não usar em produção. */
export function __setClient(c: SupabaseClient): void {
  cliente = c;
}

export function __resetClient(): void {
  cliente = undefined;
}

function db(): SupabaseClient {
  return cliente ?? supabaseBrowser();
}

export interface Verse {
  id: number;
  chapter: number;
  verse: number;
  text: string;
  wordsOfChrist: boolean;
}

export interface SearchHit {
  verseId: number;
  osis: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface TranslationInfo {
  slug: string;
  name: string;
  abbrev: string;
  /** CC BY: exibir isto não é cortesia, é condição da licença. */
  license: string;
  licenseUrl: string | null;
}

type Linha = Record<string, unknown>;

function falhar(error: { message?: string } | null): void {
  if (error) throw new Error(error.message ?? "erro no banco");
}

export async function getChapter(
  osis: string,
  chapter: number,
): Promise<Verse[]> {
  const { data, error } = await db().rpc("resolve_passage", {
    p_translation: TRANSLATION_SLUG,
    p_osis: osis,
    p_chapter: chapter,
    p_verse_start: null,
    p_verse_end: null,
  });
  falhar(error);

  return ((data ?? []) as Linha[]).map((r) => ({
    id: Number(r.verse_id),
    chapter: Number(r.chapter),
    verse: Number(r.verse),
    text: String(r.verse_text),
    wordsOfChrist: Boolean(r.words_of_christ),
  }));
}

export async function searchWords(
  query: string,
  limit = 25,
): Promise<SearchHit[]> {
  const termo = query.trim();
  // Uma letra casaria com meia Bíblia e o usuário ainda está digitando.
  if (termo.length < 2) return [];

  const { data, error } = await db().rpc("search_verses", {
    p_query: termo,
    p_translation: TRANSLATION_SLUG,
    p_limit: limit,
  });
  falhar(error);

  return ((data ?? []) as Linha[]).map((r) => ({
    verseId: Number(r.verse_id),
    osis: String(r.book_osis),
    book: String(r.book_name),
    chapter: Number(r.chapter),
    verse: Number(r.verse),
    text: String(r.verse_text),
  }));
}

/**
 * Resolve uma referência em texto real.
 *
 * `null` significa que a referência não existe nesta tradução — e é
 * exatamente esse `null` que faz uma citação inventada ser descartada em vez
 * de exibida.
 */
export async function resolvePassage(ref: Reference): Promise<string | null> {
  const { data, error } = await db().rpc("resolve_passage", {
    p_translation: TRANSLATION_SLUG,
    p_osis: ref.osis,
    p_chapter: ref.chapter,
    p_verse_start: ref.verseStart ?? null,
    p_verse_end: ref.verseEnd ?? null,
  });
  falhar(error);

  const linhas = (data ?? []) as Linha[];
  if (linhas.length === 0) return null;

  return linhas.map((r) => String(r.verse_text)).join(" ");
}

/**
 * Metadados da tradução, incluindo a licença.
 *
 * Vem do banco e não de constante no código de propósito: o crédito exibido
 * tem de ser o da tradução que está realmente importada. Se um dia entrar
 * outra, a interface acompanha sozinha.
 */
export async function getTranslation(): Promise<TranslationInfo | null> {
  const { data, error } = await db()
    .from("bible_translations")
    .select("slug, name, abbrev, license, license_url")
    .eq("slug", TRANSLATION_SLUG)
    .single();

  if (error || !data) return null;

  const r = data as Linha;
  return {
    slug: String(r.slug),
    name: String(r.name),
    abbrev: String(r.abbrev),
    license: String(r.license),
    licenseUrl: r.license_url ? String(r.license_url) : null,
  };
}
