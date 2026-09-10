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

## Restrição de arquitetura: a cota é compartilhada

Medido no free tier do `gemini-embedding-2`: **100 requisições de embedding
por minuto**, métrica `embed_content_free_tier_requests`. Ao estourar, a
resposta traz «Please retry in 42.499928451s».

O ponto não é o número. É que **os dois caminhos dividem a mesma cota**:

```
ingestão   → 15.246 chunks, uma vez        ─┐
                                            ├── mesma cota de 100/min
consulta   → 1 embedding por pergunta      ─┘   (no free tier)
```

### O lote não contorna a cota — medido

Antes de escolher entre esperar dias e medir um subconjunto, valia checar se
a pergunta era necessária. A API expõe `batchEmbedContents`, que aceita
vários textos numa requisição HTTP. Se a cota contasse requisições, um lote de
100 reduziria a Bíblia inteira a 153 chamadas.

Ela não conta requisições. Conta textos.

Enviando lotes de 8 em sequência, o 429 chegou na **13ª requisição**, depois de
**96 embeddings**, contra `limit: 100`. O limite é por texto embedado, e o
lote é apenas uma forma de empacotar — não um desconto.

O que o lote entrega de verdade: os vetores são idênticos aos da chamada
unitária (similaridade 1,000000), então dá para usá-lo por conveniência sem
mudar nenhum resultado.

**Consequência aritmética.** 15.246 chunks, 1.000 por dia por chave, duas
chaves: **8 dias** de geração. Não 14 — e nem uma tarde.

**E os dois custos são de naturezas diferentes**, o que muda o peso de cada
um na decisão:

| | Natureza | Frequência | Peso na decisão |
|---|---|---|---|
| Ingestão dos chunks | custo de implantação | uma vez por tradução | **baixo** |
| Embedding da pergunta | custo operacional | toda pergunta, para sempre | **alto** |

Duas horas para embedar a Bíblia é irrelevante: acontece uma vez. Cem
perguntas por minuto **no app inteiro, somando todos os usuários**, é outra
coisa — e é o número que decide.

Para um beta de 50 a 100 pessoas, provavelmente basta. Para crescimento, não.
Então a pergunta de aprovação do Gemini não é «é melhor?», e sim:

> **é melhor o suficiente para justificar uma dependência de API paga no
> caminho crítico de toda pergunta do usuário?**

O e5 não tem esse problema: roda local, sem cota e sem custo por chamada. Ele
paga em qualidade; o Gemini paga em dependência operacional. A decisão é entre
esses dois preços, não entre duas notas.

## Critério de aprovação do Gemini — registrado ANTES de medir

Escrito enquanto o resultado ainda é desconhecido, de propósito. Critério
definido depois do número não é critério, é justificativa.

**Vencer o e5 não basta.** Tem de vencer de forma útil ao produto, e a ordem
de importância é esta:

1. comportamento nas paráfrases
2. eliminação das armadilhas lexicais («salvação» → «salva-me»)
3. MRR@10
4. custo por 15 mil chunks e por consulta
5. latência da consulta
6. dimensão, e só aqui a migração de schema entra na conta

**Faixas de decisão:**

| Diferença na nota | Decisão |
|---|---|
| Gemini ≤ e5 + 5 pp | fica o e5. Não se migra `vector(384)` para `vector(768)` por margem de ruído. |
| e5 + 5 pp a e5 + 15 pp | zona cinzenta. Decide o qualitativo: as armadilhas lexicais sumiram? Jó 41:1 e 2 Timóteo 4:21 viraram respostas plausíveis? |
| Gemini ≥ e5 + 15 pp | adota-se o Gemini e migra-se o schema. |

**E uma faixa que não é sobre comparação:** se o Gemini também apresentar as
mesmas armadilhas lexicais, para de fazer sentido procurar «o embedding
certo». Nesse caso o resultado do 4.1 é que o VERBO precisa de um **sistema**
de recuperação melhor — híbrido mais reranker —, e não de um modelo melhor.
Esse desfecho é tão útil quanto qualquer outro, e mais barato de descobrir
agora do que depois do Ciclo 5.

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

---

## O que um benchmark parcial pode e não pode decidir

Registrado **antes** de rodar, porque a regra de leitura de um experimento
enviesado só vale se for escrita enquanto o resultado é desconhecido.

A pergunta que decide o Ciclo 4.1 tem duas metades, e elas custam coisas
muito diferentes de medir:

> Gemini resolve os casos em que E5/GTE falharam **sem criar novos falsos
> positivos relevantes?**

| Metade | Mede o quê | Dá para medir num subconjunto? |
|---|---|---|
| «resolve os casos conhecidos» | as 5 armadilhas já documentadas | **sim** |
| «sem criar novos falsos positivos» | armadilhas ainda desconhecidas | **não, por construção** |

A segunda metade não é cara de medir num subconjunto — é **impossível**. Um
falso positivo é uma passagem que ninguém esperava que vencesse. Um
subconjunto curado contém exatamente as passagens que alguém esperava. Os
~13.300 chunks de fora são justamente onde as surpresas moram.

### A assimetria que isso cria

O subconjunto adversarial é montado a partir das falhas **conhecidas**, e as
falhas conhecidas são todas do e5 e do gte. Então:

- as fraquezas do incumbente estão presentes, porque nós as catalogamos;
- as fraquezas do desafiante estão ausentes, porque ainda não as vimos.

O subconjunto é um **jogo em casa para o Gemini**. Não por descuido de
montagem: é uma propriedade inevitável de curar um corpus a partir de erros
que só um dos lados cometeu.

### Regra de leitura, fixada agora

Um benchmark parcial é um **falsificador**, nunca um aprovador:

| Resultado no subconjunto | O que se pode concluir |
|---|---|
| Gemini **falha** as armadilhas | **decisão fechada: não.** Falhou em condições favoráveis a ele. Segue para hybrid + reranking. |
| Gemini **passa** | **nada decidido.** A vitória pode ser artefato dos distratores ausentes. A metade 2 continua exigindo o corpus inteiro. |

O valor esperado é assimétrico e favorável: custa ~1.900 embeddings a chance
de encerrar a questão hoje, e não existe caminho pelo qual ele produza uma
adoção equivocada — porque a adoção não está entre os resultados possíveis.

### Condição de validade

Rodar o parcial **não pode tocar em `scripts/embed/queries.ts` nem na
verdade-base v2.** Se o subconjunto revelar uma armadilha nova e ela for
acrescentada à régua, a auditoria de viés se reabre e os 51% contra 17% já
registrados deixam de ser comparáveis. A régua está congelada.

---

## Execução do benchmark parcial — 2026-09-10

### O corpus

`scripts/embed/build-subset.ts`, semente 20260910, quatro camadas em ordem
deliberada. Pedidos 1.800; a cota diária do Gemini parou em **1.025**.

| Camada | Pedida | Gerada |
|---|---|---|
| ouro (referências da v2) | 191 | **191** |
| distratores nomeados | 11 | **11** |
| distratores léxicos por `ts_rank` | 819 | **819** |
| preenchimento aleatório | 779 | 4 |

**O núcleo adversarial está completo.** Só faltou ruído de fundo, que é
exatamente o que a ordem das camadas foi desenhada para sacrificar. As 16
consultas têm resposta possível dentro do corpus — verificado na montagem.

### O jogo em casa, agora medido

O commit anterior argumentou que um subconjunto infla todo mundo. Quanto:

| Modelo | 15.246 chunks | 1.025 chunks | Δ |
|---|---|---|---|
| multilingual-e5-small | 54% | **81%** | **+27 pp** |
| gte-small | 18% | **27%** | +9 pp |

Vinte e sete pontos. Maior do que eu suporia — e a prova de que **nenhuma
nota tirada aqui pode ser comparada com as notas do corpus completo.** A
régua deste experimento é o e5 a 81%, não o e5 a 54%.

### O que NÃO inflou: as armadilhas

Todas as cinco falhas documentadas do e5 sobreviveram ao recorte, e ele
continua caindo em todas, em 1º lugar:

| Consulta | 1º lugar no subconjunto |
|---|---|
| salvação | Ps 3:7-8 — *«Levanta-te SENHOR, **salva**-me»* |
| humildade | Ps 89:51-52 — *«Com **humilha**ção os teus inimigos»* |
| «tratar uma pessoa que me fez mal» | Ps 109:21-23 — *«me **trata** bem»* |
| «Como agir quando alguém me machuca?» | Jó 41:1-3 — pescar o leviatã |
| «Onde encontro conforto numa dificuldade?» | 2Tm 4:21-22 — lista de saudações |

E a camada léxica cumpriu o que prometia: produziu **uma armadilha nova**,
que nenhum modelo tinha enfrentado. «sofrimento» virou 🔴 para o e5, com
Sl 38:9-11 — *«todo o meu **sofrimento** está diante de ti»* — em primeiro.
Saiu de uma regra, não da nossa memória.

### Consequência: como ler o Gemini, fixado antes de medi-lo

A nota do subconjunto está contaminada pelo tamanho do corpus. O
comportamento nas armadilhas não está — elas continuam lá, intactas. Então
a leitura primária **não é a nota**:

> Nas seis armadilhas (as cinco documentadas mais «sofrimento»), o Gemini
> coloca uma passagem relevante em 1º lugar, ou repete o distrator?

Seis casos binários. A nota entra só como contexto, e sempre contra os 81%
do e5 no mesmo corpus — nunca contra os 54% do corpus inteiro.

Isso não altera a regra do commit anterior, que continua valendo: falhar
aqui rejeita o Gemini; passar aqui não aprova nada.

### Estado

Faltam **16 requisições** — os vetores das consultas — para o Gemini ser
mensurável. A cota diária das duas chaves zerou em 1.025 chunks. Retomar:

```
MODELO=gemini-embedding-2 DIMS=768 npx tsx scripts/embed/close-partial.ts
SAIDA=benchmark-parcial npx tsx scripts/embed/benchmark.ts subset
```

Os resultados do e5 e do gte neste corpus já estão em `benchmark-parcial/`.

---

## Conjunto reservado do portão de evidência — congelado em 2026-09-10

**Impressão digital:** `d68d4e6bd2a535f52a71e36eb1abd42e950da15e6eb8abe64fa1aa6e5bc5ba0e`

Escrito **antes** de existir qualquer número do Gemini, em
`scripts/embed/calibration-set.ts`. Quarenta perguntas, nenhuma delas em
`queries.ts`, e nenhum dos dez temas de lá reaparece — verificado por regra,
não por leitura.

### Por que ele é separado

`queries.ts` selecionou o retriever. Calibrar o limiar nas mesmas consultas
seria ajustar a régua nas perguntas em que o sistema já foi otimizado para ir
bem — o problema v1 → v2 uma camada acima.

### Três papéis, atribuídos na autoria

| Papel | Quantas | Para quê |
|---|---|---|
| `calibracao` | 19 | escolher o limiar |
| `avaliacao` | 18 | medir o limiar escolhido — não pode ser olhada antes |
| `observacao` | 3 | as duas decisões são defensáveis; não entram em conta |

Dividir depois, olhando o resultado, seria a mesma circularidade. Por isso o
papel nasce junto com a pergunta.

### Nove famílias, e as duas decisões

Decisão esperada: **18 responder**, **9 responder com ressalva**, **13
recusar**. Um conjunto só de perguntas respondíveis calibraria o limiar para
baixo; só de recusas, para cima. Há asserção automática de que a calibração
tem os dois lados.

A família que mais importa é **`sem-resposta-na-escritura`**: perguntas
bíblicas cuja resposta a Bíblia não contém — o nome da mulher de Caim, a idade
de Maria, os anos ocultos de Jesus, o número de magos. A recuperação vai
trazer Gênesis 4 e Lucas 2 com proximidade altíssima, e nenhum deles responde.
É o teste mais direto da regra de ouro: recusar exatamente quando inventar é
mais fácil.

### A assimetria do erro, registrada antes de medir

Os dois erros do portão não custam o mesmo. Responder sem base é a falha que o
produto inteiro existe para impedir; recusar quando havia base é um produto
pior, não um produto desonesto. Então o limiar **não** é escolhido maximizando
acerto médio:

1. **Teto de invenção** — resposta sem base: **zero casos**. Um único caso
   reprova o limiar. Os «2%» são a formulação matemática da política; nesta
   reserva equivalem exatamente a tolerância zero.
2. **Piso de utilidade** — responder a pelo menos **70%** das perguntas que
   têm base. São 13 na calibração, então o piso é 10.
3. Entre os limiares que passam em 1 e 2, escolher o de **menor recusa
   indevida**.
4. Se nenhum limiar passar em 1 e 2 ao mesmo tempo, **o assistente não é
   publicado**.

**O piso de utilidade conserta um furo lógico.** «Zero resposta sem base» é
satisfeito trivialmente por um limiar alto o bastante para recusar tudo — quem
nunca responde nunca inventa. Sem o piso, sempre existiria um limiar elegível,
o item 4 nunca dispararia, e publicaríamos um assistente que só sabe dizer não
com a política formalmente satisfeita. O piso é o que torna a não-publicação
alcançável.

O item 2 é o que transforma o portão de botão de ajuste em critério de
publicação. Sem ele, «baixa esse limite» sempre vence.

**A aritmética dos 2%, registrada antes de qualquer medição.** A calibração
tem **seis** perguntas cuja decisão esperada é recusar. A menor taxa não-nula
possível é 1/6 = **16,7%**. Não existe nada entre 0% e 16,7%.

> Neste conjunto, «≤ 2%» significa **zero** respostas sem base.

Está correto assim — a intenção sempre foi tolerância zero a inventar
Escritura. Mas o número tem de ser lido como binário, não como margem, senão
daqui a três meses alguém vai achar que sobra espaço. Para os 2% virarem uma
taxa de verdade seriam necessárias ~50 perguntas de recusa: trabalho de uma
reserva futura, não deste congelamento.

**A reserva é consumível.** Quando o conjunto de avaliação for usado, ele
também estará gasto. Qualquer mudança futura de limiar exige uma reserva nova,
escrita antes de ver o resultado que a motivou — pela mesma razão que esta
existe.

### O congelamento é asserção, não comentário

A impressão digital está em `scripts/embed/calibration-set.sha256` e é
conferida em `npm run verify` e no CI. Editar o conjunto quebra a suíte.
Provado por adulteração: com o hash trocado, a etapa falha.

Reabrir a reserva é um ato explícito — apagar o `.sha256`, regravar e explicar
no commit por quê.
