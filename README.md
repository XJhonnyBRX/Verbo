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

```bash
npm install
npm run dev          # http://localhost:3000
```

## Verificação

```bash
npm test             # 60 testes: canon, parser de referências, extração
npm run build        # tipos + build de produção
npm run verify:ui    # navegador de verdade — precisa do servidor rodando
npm run shots -- <dir>   # capturas em claro e escuro, 390px
```

`verify:ui` falha se qualquer uma destas regredir: a regra de ouro na tela,
o contraste do texto pequeno (4,5:1 por WCAG nos dois temas), ou a ausência
de overflow horizontal em largura de celular.

## Estado atual

| Área | Situação |
|---|---|
| Sistema de design, PWA, quatro telas | funcionando |
| Canon (66 livros) e parser de referências | 60 testes passando |
| Migrations do Postgres | escritas, **não executadas** — falta subir um banco |
| Edge Function `ask` | não existe; a tela usa demonstração fixa |
| Auth, favoritos, anotações | Ciclo 3 |
| Texto bíblico | **amostra descartável** — ver abaixo |

### Duas pendências que bloqueiam lançamento

**A tradução.** Nenhuma foi escolhida ainda. O texto exibido hoje é uma
amostra de desenvolvimento em `lib/bible/sample.ts`, que não passou por
conferência de fonte, licença ou digitalização. **Não use nada dela para
estudo.** A primeira tarefa do Ciclo 1 é verificar licença e formato dos
candidatos de domínio público.

**O portão.** Enquanto `VERBO_ALLOW_SAMPLE` existir no `.env`, o VERBO pode
ir ao ar exibindo esse texto não conferido. Apagar aquelas duas linhas é o
portão de lançamento: sem elas, o build falha se alguém tentar publicar com
a amostra.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres,
pgvector, Auth, Edge Functions) · Vercel

Embeddings com `gte-small` (384d, dentro das Edge Functions, custo zero);
geração com Gemini Flash. Busca híbrida full-text + semântica fundida por
Reciprocal Rank Fusion, com `bible_verses.id` como chave de fusão.

Tipografia: **Faustina** para a Escritura e **Archivo** para a interface —
ambas da Omnibus-Type, fundição argentina que desenha para os diacríticos
do português.
