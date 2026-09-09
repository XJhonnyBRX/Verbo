/**
 * Formato intermediário entre o arquivo original e o importador.
 *
 * O adaptador de cada fonte produz este documento; o importador só conhece
 * ele. Assim trocar de tradução ou de formato de origem não mexe no
 * importador, na validação, nem nos testes de nenhum dos dois.
 *
 * Toda mensagem de erro daqui diz ONDE está o problema, com livro, capítulo
 * e versículo. Sem isso, falhar num de 31 mil versículos é uma informação
 * inútil para quem está importando.
 */

import { bookByOsis } from "./canon";

export interface SourceTranslation {
  slug: string;
  name: string;
  abbrev: string;
  license: string;
  licenseUrl?: string;
  sourceUrl?: string;
  sourceSha256?: string;
}

export interface SourceVerse {
  osis: string;
  c: number;
  v: number;
  t: string;
  /** Fala de Cristo — composta em vermelho no leitor. */
  woc?: boolean;
}

export interface SourceBible {
  translation: SourceTranslation;
  verses: SourceVerse[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSourceBible(raw: unknown): SourceBible {
  assert(isRecord(raw), "documento inválido: esperado um objeto");

  const { translation, verses } = raw;

  assert(isRecord(translation), "documento inválido: falta `translation`");
  for (const campo of ["slug", "name", "abbrev"] as const) {
    const valor = translation[campo];
    assert(
      typeof valor === "string" && valor.trim() !== "",
      `tradução inválida: \`${campo}\` é obrigatório`,
    );
  }
  assert(
    typeof translation.license === "string" && translation.license.trim() !== "",
    "tradução inválida: a licença é obrigatória — o VERBO não importa texto sem procedência",
  );
  assert(
    /^[a-z0-9-]+$/.test(translation.slug as string),
    `slug inválido: "${String(translation.slug)}" — só minúsculas, dígitos e hífen, como exige bible_translations`,
  );

  assert(Array.isArray(verses), "documento inválido: falta `verses`");
  assert(verses.length > 0, "documento vazio: nenhum versículo");

  const vistos = new Set<string>();
  const saida: SourceVerse[] = [];

  for (const [i, item] of verses.entries()) {
    assert(isRecord(item), `versículo na posição ${i}: esperado um objeto`);

    const { osis, c, v, t, woc } = item;
    assert(
      typeof osis === "string",
      `versículo na posição ${i}: \`osis\` inválido`,
    );

    const livro = bookByOsis(osis);
    assert(
      livro,
      `livro fora do canon: "${osis}" (versículo na posição ${i})`,
    );

    assert(
      Number.isInteger(c) && (c as number) >= 1,
      `${livro.name}: capítulo inválido (${String(c)})`,
    );
    assert(
      (c as number) <= livro.chapters,
      `${livro.name}: capítulo ${String(c)} não existe — o livro tem ${livro.chapters}`,
    );
    assert(
      Number.isInteger(v) && (v as number) >= 1,
      `${livro.name} ${String(c)}: versículo inválido (${String(v)})`,
    );
    assert(
      typeof t === "string" && t.trim() !== "",
      `${livro.name} ${String(c)}:${String(v)}: texto vazio ou em branco`,
    );

    const chave = `${osis} ${String(c)}:${String(v)}`;
    assert(
      !vistos.has(chave),
      `versículo repetido: ${livro.name} ${String(c)}:${String(v)}`,
    );
    vistos.add(chave);

    saida.push({
      osis,
      c: c as number,
      v: v as number,
      t: (t as string).trim(),
      ...(woc === true ? { woc: true } : {}),
    });
  }

  return {
    translation: {
      slug: translation.slug as string,
      name: translation.name as string,
      abbrev: translation.abbrev as string,
      license: translation.license as string,
      ...(typeof translation.licenseUrl === "string"
        ? { licenseUrl: translation.licenseUrl }
        : {}),
      ...(typeof translation.sourceUrl === "string"
        ? { sourceUrl: translation.sourceUrl }
        : {}),
      ...(typeof translation.sourceSha256 === "string"
        ? { sourceSha256: translation.sourceSha256 }
        : {}),
    },
    verses: saida,
  };
}
