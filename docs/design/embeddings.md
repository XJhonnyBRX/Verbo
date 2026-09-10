# Motor vetorial do VERBO — Ciclo 4.1

**Data:** 2026-09-10
**Status:** **incompleto** — gte-small reprovado, e5 é o melhor candidato mas
não está aprovado, Gemini pendente de chave de API.

Tudo abaixo foi medido, não estimado. O ferramental está em `scripts/embed/`
e os resultados versionados em `benchmark/{v1,v2,v2-sem-vies}/results.json`.

---

## Como medimos

**Corpus:** 15.246 janelas de 3 versículos com passo 2, geradas dos 31.102
versículos da Bíblia Livre. Fronteira de capítulo e de livro nunca é
atravessada.

**Conjunto de aceitação:** 16 consultas em `scripts/embed/queries.ts`, em duas
famílias:

- **`tema`** (10) — a palavra do assunto está na consulta. **Esta família não
  distingue nada:** medido, gte e e5 ficaram em 60% e 70%.
- **`parafrase`** (6) — a palavra do assunto **não** está na consulta.
  «Como agir quando alguém me machuca?» não contém "perdão". Esta é a
  família que separa entender significado de reconhecer string.

**Nota:** paráfrase 60%, tema 20%, MRR@10 20%. Dimensão e custo **não entram
na nota** — qualidade é decidida primeiro, infraestrutura depois.

**Métricas separadas de propósito.** Hit@10 é binário: a passagem está no
contexto? MRR@10 mede quão alto: uma passagem em 10º pode nem entrar no
prompt depois do corte em top-k.

**Três verdades-base**, e as três são reportadas. A v1 (93 referências) foi
escrita antes de qualquer execução e estava estreita — media a minha memória,
não o modelo. A v2 (172) acrescenta passagens canônicas que faltavam. A
`v2-sem-viés` exclui o que algum modelo já havia devolvido na v1, e existe
para responder «você ajustou a régua olhando o resultado?».

---

## Resultado

| Modelo | Nota | Paráfrase | Tema | Hit@10 | MRR@10 | 🟢 | 🟡 | 🔴 |
|---|---|---|---|---|---|---|---|---|
| multilingual-e5-small | **54%** | **50%** | 70% | 63% | 0,521 | 8 | 2 | 6 |
| gte-small | 18% | **0%** | 60% | 38% | 0,287 | 5 | 1 | 10 |
| gemini-embedding-2 (768d) | — | — | — | — | — | — | — | — |

🟢 relevante no top-3 · 🟡 entre 4 e 10 · 🔴 nada no top-10

**Auditoria do viés:**

| Modelo | v1 | v2 | v2-sem-viés | Δ |
|---|---|---|---|---|
| e5-small | 36% | 54% | 51% | −3,9 pp |
| gte-small | 14% | 18% | 17% | −0,6 pp |

A régua v2 favoreceu o e5 em cerca de 4 pontos. Está registrado. Não muda a
conclusão: 51% contra 17%.

---

## Decisões fechadas

### gte-small: reprovado

**Zero acertos em seis paráfrases**, com 172 referências aceitáveis e de seis
a dez respostas válidas por pergunta. Não é «fraco» — é incapaz na tarefa que
define o produto.

O que ele faz é casamento lexical com aparência de semântica, e isso é pior
do que ser ruim, porque produz falsa sensação de relevância. Para um app
bíblico é perigoso: o usuário confia numa referência aparentemente pertinente.
Exemplo medido: «dinheiro e riqueza» devolveu Mateus 28:15, onde os guardas
*tomaram o dinheiro*.

**Consequência arquitetural:** o `Supabase.ai.Session('gte-small')` embutido
no Edge Runtime deixa de ser o caminho do embedding de consulta. Qualquer
modelo que vencer terá de ser chamado de outra forma.

### halfvec: aprovado

**Δ de 0,0 pontos percentuais** nos dois modelos, nas três verdades-base. O
ranking sobrevive intacto à quantização de 16 bits, e o índice HNSW cai de
61 MB para 18 MB numa base de 15 mil.

Isto encerra também uma medição anterior enganosa: um teste com vetores
sintéticos aleatórios havia sugerido perda severa. Era artefato — vetores
aleatórios em 384 dimensões são quase todos ortogonais, as distâncias se
concentram, e qualquer perda de precisão reembaralha o ranking. Com vetores
reais isso não acontece.

### Ingestão em Node, consulta na Edge Function

A Edge Function tem teto de CPU **por invocação** (lote de 20 passa, 30
estoura) e orçamento **acumulado** por worker (o supervisor derruba o isolate
depois de algumas centenas). Carga em lote não cabe ali.

Para o gte-small especificamente, os vetores gerados nos dois runtimes são
idênticos — similaridade 1,000000, medido. Essa equivalência não vale para
os outros modelos, porque só o gte-small vem embutido no Edge Runtime.

---

## O achado que impede aprovar o e5

**Metade das falhas do e5 são a mesma armadilha lexical que reprovou o gte:**

| Consulta | 1º lugar | O que houve |
|---|---|---|
| salvação | Sl 3:7 — *"Levanta-te SENHOR, **salva**-me"* | casou a superfície |
| humildade | Sl 89:51 — *"Com **humilha**ção os teus inimigos"* | casou a superfície |
| "tratar uma pessoa que me fez mal" | Sl 109:21 — *"me **trata** bem"* | casou a superfície |

E duas falhas são de outra ordem: «Como agir quando alguém me machuca?»
devolveu **Jó 41:1**, sobre pescar o leviatã; «Onde encontro conforto durante
uma dificuldade?» devolveu **2 Timóteo 4:21**, uma lista de saudações.

Onde acerta, o e5 acerta bem — oito das dez verdes vieram em 1º lugar,
incluindo duas paráfrases. Mas ele **partilha o modo de falha do gte**, com
menos frequência.

A diferença que o VERBO precisa não é entre «salvação» e «salvar». É entre
«salvação» e *as passagens que tratam do conceito de salvação*. Um Hit@10 de
63% significa que o portão de evidência recusaria responder em mais de um
terço das perguntas.

---

## Hipótese registrada, não implementada

Se o Gemini apresentar o mesmo modo de falha, a conclusão deixa de ser «achar
o embedding certo» e passa a ser «o sistema de recuperação precisa de outra
etapa»:

```
pergunta
   ├── busca lexical  ─┐
   └── busca semântica ┴─→ 30 a 50 candidatos → reranker → top 5-10 → Gemini
```

O embedding só precisa colocar o conteúdo certo **entre os candidatos**. O
reranker responde à pergunta mais difícil — «este texto responde ao que a
pessoa quis dizer?» — vendo pergunta e passagem juntas, que é exatamente o
que desfaz armadilhas como Jó 41:1.

**Não implementar antes de medir o Gemini.** A ordem importa: primeiro
descobrir quanto o embedding sozinho entrega.

---

## Pendente

**Chave da API do Google.** Bloqueia o teste do `gemini-embedding-2` e o
Ciclo 5 inteiro. Deve ser criada no AI Studio e colocada em `.env.local` como
`GOOGLE_API_KEY`, que está no `.gitignore`.

Verificado na documentação antes de implementar: o `gemini-embedding-2` **não
tem parâmetro `task_type`** — o `001` usava `RETRIEVAL_QUERY` e
`RETRIEVAL_DOCUMENT`, o `2` espera a instrução no próprio texto
(`task: search result | query: …` contra `title: … | text: …`). E abaixo de
3072 dimensões a saída Matryoshka **não vem normalizada**; o provider
renormaliza. Ambos os erros seriam silenciosos.

Começaremos em **768 dimensões**. Se o Gemini vencer de forma significativa,
o schema migra de `vector(384)` para `vector(768)` — barato agora, antes de
qualquer corpus vetorial em produção.

**O e5 não é descartado mesmo que o Gemini vença.** A abstração
`EmbeddingProvider` permite manter os dois intercambiáveis, e um provedor
local sem custo por chamada é um fallback que vale ter.
