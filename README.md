# VERBO

Bíblia. Fé. Conhecimento.

Leitor bíblico, busca e assistente com IA — em português, mobile-first, com
uma regra que governa a arquitetura inteira:

> **A IA nunca é a fonte da Escritura.**

Design completo em
[docs/superpowers/specs/2026-09-09-verbo-mvp-design.md](docs/superpowers/specs/2026-09-09-verbo-mvp-design.md).

## Como a regra de ouro é imposta

Não por disciplina de código, e sim em três camadas que não dependem de
ninguém lembrar:

1. **No banco** — `ai_message_references` guarda `verse_start_id` e
   `verse_end_id` como chaves estrangeiras para `bible_verses`. Uma citação
   inventada não é rejeitada por um `if`: ela é impossível de gravar, porque
   viola a chave estrangeira.
2. **Numa porta única** — toda resposta gerada passa pela Edge Function
   `ask`. Não existe segundo caminho, e o cache guarda o
   `source_message_id` em vez de referências próprias, justamente para não
   abrir um.
3. **Na interface** — a âncora só renderiza se o texto do versículo veio.
   Referência sem lastro não tem como aparecer na tela.

E o que é descartado é **contado e mostrado ao usuário**. A taxa de citação
inventada é a métrica de credibilidade do projeto.

## Rodando

Precisa de Docker Desktop aberto — o Supabase local roda em container.

```bash
npm install
npx supabase start        # sobe Postgres, PostgREST, Auth e Studio
```

Copie `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` do que o
comando imprime para um `.env.local`, junto com a `DATABASE_URL` direta.
Depois importe a Bíblia — uma vez só:

```bash
npm run import:dry -- data/source/BLIVRE.json    # valida sem gravar
npm run import:bible -- data/source/BLIVRE.json  # 31.102 versículos, ~2s
npm run dev                                      # http://localhost:3000
```

O arquivo-fonte não é versionado (32 MB). A URL e o checksum estão em
[docs/design/traducao.md](docs/design/traducao.md).

## Verificação

```bash
npm test               # 60 testes: canon, parser de referências, extração
npm run build          # tipos + build de produção
npm run verify:schema  # Postgres real no Docker — 17 garantias do banco
npm run verify:ui      # navegador de verdade — precisa do servidor rodando
npm run shots -- <dir> # capturas em claro e escuro, 390px
```

`verify:schema` sobe um pgvector no Docker, zera o banco, aplica bootstrap e
migrations na ordem, e afirma as garantias do spec — incluindo a que importa
mais: **inserir uma referência inventada em `ai_message_references` tem de
falhar por violação de chave estrangeira.** Precisa do Docker Desktop aberto.

`verify:ui` falha se qualquer uma destas regredir: a regra de ouro na tela,
o contraste do texto pequeno (4,5:1 por WCAG nos dois temas), ou a ausência
de overflow horizontal em largura de celular.

## Estado atual

| Área | Situação |
|---|---|
| Texto bíblico | **A Bíblia Livre, 31.102 versículos importados e validados** |
| Migrations do Postgres | verificadas em Postgres 17 + pgvector e em Supabase, 17 garantias |
| Canon, parser de referências, importação | 122 testes |
| Sistema de design, PWA, quatro telas | funcionando, ligadas ao banco |
| Edge Function `ask` | não existe; a tela usa resposta fixa, mas valida contra o banco real |
| Chunks e embeddings | Ciclo 4 |
| Auth, favoritos, anotações | Ciclo 3 |

### Desempenho medido com a Bíblia real

| Consulta | Tempo |
|---|---|
| Salmos 119 — 176 versículos, o maior capítulo | 2,8 ms |
| Busca por «Deus» — casa com 4.028 versículos, o pior caso real | 19,1 ms |

### A licença obriga a exibir o crédito

A Bíblia Livre é CC BY 3.0 BR. **A atribuição é condição da licença, não
cortesia:** se o crédito sair da interface, o uso do texto deixa de ser
licenciado. O componente `components/attribution.tsx` busca o crédito do
banco, da tradução realmente importada — não de uma constante no código.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres,
pgvector, Auth, Edge Functions) · Vercel

Embeddings com `gte-small` (384d, dentro das Edge Functions, custo zero);
geração com Gemini Flash. Busca híbrida full-text + semântica fundida por
Reciprocal Rank Fusion, com `bible_verses.id` como chave de fusão.

Tipografia: **Faustina** para a Escritura e **Archivo** para a interface —
ambas da Omnibus-Type, fundição argentina que desenha para os diacríticos
do português.
