# Verificação da tradução bíblica do VERBO

**Data:** 2026-09-09
**Tarefa:** Ciclo 1, Tarefa 1
**Status:** **decidido e aprovado — A Bíblia Livre (BLIVRE)**, com a
obrigação de atribuição aceita explicitamente pelo dono do produto.

Tudo abaixo foi verificado baixando e contando os arquivos, não lendo
descrições. Os comandos estão em `scripts/db/` e no histórico desta sessão.

---

## Resumo

| | Almeida 1911 | Bíblia Livre | BSL (porbrbsl) |
|---|---|---|---|
| Licença | domínio público | **CC BY 3.0 BR** | domínio público |
| Livros | 66 | 66 | 81 (canon católico) |
| Versículos no canon protestante | 31.101 | **31.102** | 31.098 com texto |
| Versículos vazios | **0** | **0** | **5** |
| Ortografia | pré-reforma (1911) | **moderna** | moderna |
| Situação editorial | definitiva | definitiva | **rascunho em revisão** |
| Versificação | família Almeida | **família Almeida** | texto crítico |
| Formato | JSON, XML, SQLite | **JSON, XML, SQLite** | USFM, VPL, XML, SQL |

**Recomendação: Bíblia Livre (BLIVRE).** É a única das três sem nenhum
defeito de conteúdo. O custo é ser CC BY em vez de domínio público — uma
linha de atribuição no rodapé.

---

## Descartada antes de tudo: `thiagobodruk/biblia`

É o repositório de Bíblia em JSON mais usado por desenvolvedores brasileiros,
e **não pode ser usado**. Contém NVI, ACF e AA, e o próprio README declara:

> "As traduções bíblicas deste projeto são de autoria e propriedade
> intelectual da Sociedade Bíblica Internacional (NVI), da Sociedade Bíblica
> Trinitariana (ACF) e da Imprensa Bíblica Brasileira (AA). Todos os direitos
> reservados aos autores."

O repositório em si é **CC BY-NC** — proíbe uso comercial. Fica registrado
aqui porque é a primeira coisa que aparece numa busca e a armadilha mais
fácil de cair.

Fonte: <https://github.com/thiagobodruk/biblia>

---

## Descartada: Tradução Brasileira (1917)

Dois motivos independentes, cada um suficiente.

**Situação de domínio público ambígua na jurisdição que importa.** O
Wikisource em português declara que a obra está disponível lá pela lei dos
Estados Unidos, por ter sido publicada antes de 1922 — e diz explicitamente
que **não está em domínio público no Brasil**. O VERBO atende usuários
brasileiros; a jurisdição relevante é a brasileira.

**Não está disponível.** O repositório `damarals/biblias` lista TB no README,
mas a release `v1.0.0` **não tem nenhum arquivo TB** — conferido pela API do
GitHub. E a edição de 2010 que o README cita é uma revisão da Sociedade
Bíblica do Brasil, com direitos próprios.

Fontes: <https://pt.wikisource.org/wiki/Discuss%C3%A3o:Tradu%C3%A7%C3%A3o_Brasileira_da_B%C3%ADblia>,
<https://www.sbb.org.br/a-biblia-sagrada/as-traducoes-da-sbb/traducao-brasileira/>

---

## Candidata 1: Almeida Revista e Corrigida 1911 (ALM1911)

**Licença:** domínio público. Publicada em 1911; qualquer direito de revisor
expirou muito antes dos 70 anos post mortem que a lei brasileira exige.
Marcada como domínio público por `damarals/biblias`, que é MIT.

**Arquivo:** `ALM1911.json`, 4.037.522 bytes —
<https://github.com/damarals/biblias/releases/download/v1.0.0/ALM1911.json>

**Verificado:** 66 livros, 31.101 versículos (um a menos que o padrão),
**nenhum versículo vazio**. Estrutura JSON simples:
`[{abbrev, name, chapters: [[texto, …], …]}]`.

**Reprovada por ortografia.** Não é questão de estilo — é uma falha
mensurável de busca. Contagens no texto completo:

| grafia moderna | ocorrências | grafia de 1911 | ocorrências |
|---|---|---|---|
| `ele` | 1 | `elle` | **4.089** |
| `Espírito` | 0 | `Espirito` | **616** |
| `abismo` | 0 | `abysmo` | **38** |
| `criou` | 5 | `creou` | 28 |
| `vazia` | 11 | `vasia` | 4 |

O dicionário `portuguese` do Postgres não faz ponte entre `elle` e `ele`, nem
entre `abysmo` e `abismo`. Um usuário buscando «abismo» receberia **zero
resultados** num texto que fala de abismo 38 vezes. A busca por palavra — que
é gratuita e é o item 11 do documento original — ficaria quebrada por
construção.

Também: um brasileiro em 2026 lendo «No principio creou Deus os céus e a
terra» não está lendo com dificuldade de vocabulário bíblico, está lendo com
dificuldade de ortografia extinta.

---

## Candidata 2: A Bíblia Livre (BLIVRE) — **recomendada**

**Licença: Creative Commons Atribuição 3.0 Brasil.** Não é domínio público,
e o repositório `damarals` a marca erradamente como tal. A fonte primária, o
próprio projeto, declara:

> "Licença Creative Commons Atribuição 3.0 Brasil"

Autores: Diego Santos, Mario Sérgio e Marco Teles. A licença permite copiar,
redistribuir, modificar e **usar comercialmente**, desde que fonte e autores
sejam mencionados. O projeto aceita a sigla «BLIVRE» onde o espaço for
limitado.

É uma modernização da tradução de João Ferreira de Almeida de 1819, que está
em domínio público — daí a liberdade da obra derivada.

**Arquivo:** `BLIVRE.json`, 4.008.669 bytes —
<https://github.com/damarals/biblias/releases/download/v1.0.0/BLIVRE.json>

**Verificado:**

- 66 livros — exatamente o canon protestante, sem deuterocanônicos.
- **31.102 versículos — exatamente o padrão.**
- **Nenhum versículo vazio.**
- Ortografia moderna: `ele` 5.014, `Espírito` 592, `abismo` 32, `criou` 31, e
  **zero** ocorrências de `elle`, `abysmo` ou `creou`.
- Versificação da família Almeida, o que significa que a doxologia de Romanos
  está em 16:25-27 — onde os leitores brasileiros e os comentários a
  procuram.

**O que isso custa ao VERBO:** uma linha de atribuição visível. Nada mais.

**O que isso evita:** os 31.102 baterem na primeira execução da validação da
Tarefa 4, sem uma única exceção a registrar.

---

## Candidata 3: Bíblia Sagrada Livre para o Mundo (BSL / `porbrbsl`)

Não estava na lista original. Apareceu na verificação e merece registro
porque é domínio público **e** moderna — e ainda assim é a pior opção das
três para o VERBO.

**Licença:** domínio público, declarado pelo eBible.org, que é curador
cuidadoso de licenças.

**Arquivos:** `porbrbsl_vpl.zip` 5.519.230 bytes (contém VPL em texto, XML e
SQL) e `porbrbsl_usfm.zip` 1.868.556 bytes —
<https://ebible.org/porbrbsl/>
sha256 do VPL: `f9a101e1763c26bef1a5ce278f10bfed942c14585f1ba98d93d289b64641ced0`

O formato VPL é uma linha por versículo — `GEN 1:1 No princípio, Deus criou
os céus e a terra.` — o mais fácil e menos sujeito a erro de parse dos três
candidatos.

**Três problemas, e o terceiro é fatal para a regra de ouro.**

**1. É um rascunho.** O próprio arquivo de licença declara: «Este é um
rascunho de tradução da Bíblia Sagrada e ainda em revisão.» Um produto cuja
tese é confiabilidade exibindo texto que o publicador chama de rascunho é
uma contradição que aparece na primeira crítica.

**2. Traz 81 livros.** Inclui Tobias, Judite, Sabedoria, Eclesiástico,
Baruque, quatro livros de Macabeus, e até `PSX` — o Salmo 151. O adaptador
teria de filtrar para os 66, o que é fácil, mas é trabalho e é risco.

**3. Cinco versículos do canon protestante vêm vazios, e isso quebraria a
validação de referências.** Localizados:

- Lucas 17:36
- Atos 8:37
- Atos 15:34
- Atos 24:7
- Romanos 16:25

Não são defeito: são os versículos ausentes do texto crítico, e a tradução
mantém os números como marcadores vazios — convenção acadêmica correta. Mas
para o VERBO a consequência é concreta: **`resolve_passage('Lucas 17:36')`
devolveria vazio, e o validador declararia inventada uma citação
perfeitamente legítima.** Qualquer comentário, pregação ou resposta de IA que
cite Atos 8:37 seria acusado de alucinação pelo nosso próprio sistema.

Além disso, este texto move a doxologia de Romanos para **14:24-26** em vez
de 16:25-27. Verificado: Romanos 14 tem 26 versículos (padrão 23) e Romanos
16 tem 25 (padrão 27). Referências a «Romanos 16:25-27», que é como
praticamente toda literatura em português a cita, não resolveriam.

Adotar este texto exigiria: um campo `omitted` no schema, uma decisão de
produto sobre o que exibir num versículo omitido, e um mapa de versificação
para as referências de Romanos. Três complicações que a Bíblia Livre não
gera.

---

## Decisão

**Bíblia Livre (BLIVRE)**, com atribuição visível a Diego Santos, Mario
Sérgio e Marco Teles.

Campos para `bible_translations`:

| coluna | valor |
|---|---|
| `slug` | `blivre` |
| `name` | `A Bíblia Livre` |
| `abbrev` | `BLIVRE` |
| `license` | `Creative Commons Atribuição 3.0 Brasil (CC BY 3.0 BR)` |
| `license_url` | `https://creativecommons.org/licenses/by/3.0/br/` |
| `source_url` | `https://github.com/damarals/biblias/releases/download/v1.0.0/BLIVRE.json` |
| `source_sha256` | `da55b0ce319524c97f105e1382d54c3bdda762ea4b9bc549b7c54ba23511cbab` |

Arquivo baixado em 2026-09-09, 4.008.669 bytes. O importador recalcula o
checksum e **grava o que calculou**, não este valor — assim uma troca
silenciosa do arquivo na origem aparece como divergência em vez de passar.

**Desvio a registrar:** a instrução original era «tradução de domínio
público». CC BY 3.0 não é domínio público. Permite tudo que o VERBO precisa —
inclusive uso comercial — e vem como concessão explícita de autores
identificáveis, o que é uma base mais firme do que inferir domínio público a
partir de uma data de publicação. Mas é uma obrigação a mais: **a atribuição
é condição da licença, não cortesia.** Se ela cair da interface, o uso deixa
de ser licenciado.

**Consequência para a interface:** a tela de conta e o rodapé do leitor
precisam creditar a tradução e os autores. Isso entra no Ciclo 1, Tarefa 7,
não pode esperar o Ciclo 6.

**Consequência para o schema:** nenhuma. Os 31.102 versículos e a ausência de
vazios significam que a validação da Tarefa 4 passa sem exceções, e
`EXCECOES` em `canon-counts.ts` fica vazio.

---

## Uma nota que vale para qualquer tradução futura

O caso do BSL revelou uma interação que o spec não previa: **a escolha da
tradução pode fazer o validador de referências acusar citação legítima de ser
inventada.** Versificações diferentes e versículos omitidos por crítica
textual são normais entre Bíblias, e o VERBO trata «não resolve» como «foi
inventado».

Se algum dia o VERBO oferecer mais de uma tradução, isso deixa de ser
hipótese e passa a ser bug: uma referência válida numa tradução e ausente na
outra. A saída conhecida é validar a referência contra o **canon**, que é
comum a todas, e só depois buscar o texto na tradução ativa — separando «esta
referência existe» de «esta tradução tem texto para ela». Registrado aqui
para o Ciclo em que a segunda tradução entrar.
