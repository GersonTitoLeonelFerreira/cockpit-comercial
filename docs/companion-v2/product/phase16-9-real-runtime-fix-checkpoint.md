# FASE 16.9 — Correção do runtime real do recommended_action seller-facing

## O que mudou

`app/lib/server/canonical-decision-state-source.ts` é a única fonte do
`recommended_action` seller-facing consumido por AGORA/ANÁLISE
(`agora-view-model.ts`/`analysis-view-model.ts` só fazem passthrough — não
recalculam). Antes desta fase, três pontos deste arquivo substituíam o
raciocínio já produzido pela Commercial Reading (`best_approach.reason` /
`method.recovery_guidance.recommended_move`, ambos gerados pelo modelo) por
um template genérico fixo sempre que a leitura chegava por um destes três
caminhos:

1. **Passthrough de `best_approach`** (nenhum outro candidato operacional
   venceu): `recommended_action` virava sempre
   `` `Canal recomendado: ${channel}.` `` — por exemplo
   `"Canal recomendado: text."` — descartando por completo o raciocínio
   real do modelo sobre o que fazer.
2. **Desvio de método sem `recovery_guidance`**: `recommended_action`
   virava sempre `"Retomar a etapa adequada do método antes de avançar."`,
   mesmo quando `best_approach.reason` já explicava exatamente o que
   fazer.
3. **`insufficient_information`**: `recommended_action` virava sempre
   `"Aprofundar a descoberta antes de avançar para a próxima etapa."`,
   também descartando o raciocínio real de `best_approach.reason`.

Essas três strings fixas são exatamente os exemplos que a missão da FASE
16.9 lista como saída seller-facing inaceitável — inclusive
`"Canal recomendado: text."` literalmente.

A correção não criou uma segunda arquitetura: reaproveitou o mesmo
precedente já usado em `deriveGuidance()`
(`stateful-communication-executor.ts:663-680`), que já preferia
`best_approach.reason` a um valor fixo no mesmo tipo de situação. Os três
pontos agora usam `best_approach.reason` (ou `recovery_guidance
.recommended_move` quando disponível) em vez do template.

## Caso Carla (fixture de referência da missão)

Sequência: cliente pede plano/promoção → vendedor informa valores →
cliente pede a grade → vendedor envia → cliente escolhe Pilates, sexta,
18h, 2 pessoas (Carla e Juscelaine) e pede agendamento duas vezes sem
confirmação → vendedor retoma com "Como posso ajudar?", ignorando tudo
que já foi dito.

### ANTES

```
recommended_action: "Canal recomendado: text."
```
ou, se o desvio de método fosse detectado sem recovery_guidance:
```
recommended_action: "Retomar a etapa adequada do método antes de avançar."
```

Nenhuma das duas frases diz o que aconteceu, o que falta ou o que fazer.
Nenhuma reflete que a cliente já deu todos os dados e só falta um passo
operacional (verificar disponibilidade e confirmar).

### DEPOIS

```
recommended_action:
  "Carla e Juscelaine já escolheram Pilates, sexta-feira às 18h, para
   duas pessoas, e pediram o agendamento duas vezes sem receber
   confirmação. Verificar a disponibilidade real desse horário para
   duas pessoas e, se houver vaga, confirmar o agendamento — sem pedir
   de novo nenhuma informação que a cliente já deu."
```

Este texto é o próprio `best_approach.reason` produzido pela leitura
comercial (Commercial Reading) — a correção não inventa este conteúdo,
apenas para de descartá-lo.

## O que o sistema não recomenda mais neste caminho

- "Canal recomendado: text." (ou qualquer canal) como ação seller-facing;
- "Retomar a etapa adequada do método antes de avançar." como template
  fixo quando a leitura já explica o que fazer;
- "Aprofundar a descoberta antes de avançar para a próxima etapa." como
  template fixo quando a leitura já explica o que falta.

Nenhuma dessas frases foi banida por uma whitelist — elas simplesmente
deixaram de ser o *fallback padrão* quando existe raciocínio real
disponível. Se uma leitura futura genuinamente concluir
`insufficient_information` sem detalhar o motivo (`best_approach.reason`
vazio), o comportamento passa a depender do dado real da leitura, não de
um texto disfarçado de inteligência.

## Testes de regressão

`app/lib/server/canonical-decision-state-source.test.mjs`:
- `caso Carla — passthrough de best_approach nunca usa "Canal recomendado: <channel>." como recommended_action`
- `caso Carla — desvio de método sem recovery_guidance usa o raciocínio real da leitura, nunca o template fixo de "retomar a etapa"`
- `caso Carla — insufficient_information usa o raciocínio real da leitura, nunca o template fixo de "aprofundar a descoberta"`

Confirmado que os três testes falham no código anterior à correção
(`git stash` do arquivo de produção com os testes aplicados) e passam
depois dela — não são testes vácuos.

## Achado adicional (mapa completo do pipeline) — MENSAGEM tem um segundo cérebro real, não alinhado

Uma auditoria de todo o pipeline (contexto → LLM → reading → reasoning →
decision → presenters → extensão) foi conduzida nesta sessão e confirma,
com citação de código, um problema que o item 24 da missão da FASE 16.9
já antecipava ("reasoning diz agendar mas message engine volta a
perguntar o que ela quer"):

- O checkpoint da FASE 16-R6
  (`docs/companion-v2/product/phase16-r6-seller-facing-checkpoint.md`)
  afirma que, no runtime real, "Commercial Reading + estado + Company
  Knowledge produzem o mesmo Commercial Reasoning usado pelas demais
  abas" e que "um adaptador alinha o `commercial_move` e a técnica do
  MIE ao Reasoning antes do Message Planner".
- **Isso só é verdade para o Message Intelligence Engine V1.**
  `app/lib/companion/message-intelligence/reasoning-strategy-adapter.ts`
  (o adaptador citado) é importado exclusivamente por
  `message-intelligence-runner.ts` (V1) e pelo próprio teste do
  adaptador — confirmado por grep, zero outros importadores no
  repositório.
- `app/api/companion/method-guidance/route.ts` tenta o **V2 primeiro**
  (linha 536, `tryGenerateActivatedMessageIntelligenceSellerMessageV2`)
  e só cai para o V1 (linha 596) quando o V2 está inativo para a empresa
  ou falha. V2 é o pipeline realmente em piloto hoje.
- `app/lib/companion/message-intelligence/v2/` (execution-plan, runner,
  context-assembler, executor, critic) **não importa nem referencia
  `CommercialReasoning` nem `DecisionState` em nenhum arquivo**
  (confirmado por grep). O V2 decide `commercial_move`/técnica/mensagem
  a partir de `CommercialReading` bruto + `seller_intent`, por conta
  própria, via seu próprio prompt (`v2/execution-plan.ts:135-179`) — sem
  visibilidade do que AGORA está mostrando ao vendedor nem da técnica
  que `CommercialReasoning` já selecionou.
- Consequência prática: para qualquer empresa com MIE V2 ativo, a
  mensagem sugerida pode genuinamente divergir do que AGORA/ANÁLISE
  já decidiram — exatamente o risco que o item 24 da missão descreve,
  e que o checkpoint R6 registrou como resolvido sem estar, para o
  pipeline que hoje tem prioridade.

Este achado não foi corrigido nesta sessão — reescrever o contexto/prompt
do MIE V2 para consumir `DecisionState.primary_decision` (reaproveitando
a ponte já existente e não utilizada,
`canonical-communication-context-source.ts`) é uma mudança de escopo
próprio, que toca uma feature em piloto real, e merece uma sessão
dedicada com sua própria validação — não uma correção apressada. Fica
registrado aqui como o próximo alvo de maior alavancagem para a missão
mais ampla da FASE 16.9.

## UX seller-facing de AGORA/ANÁLISE — nota importante sobre origem

Uma instrução posterior desta mesma sessão afirmou que a extensão (`app/
extension/yolen-companion/src/companion-seller-information-view.js` e
`companion-reasoning-view.js`) já continha, **localmente e ainda não
commitada**, uma UX específica (coaching primeiro em ANÁLISE, Pontos de
melhoria antes de Acertos, ambos com detalhe recolhido, método recolhido,
sem Commercial Brain duplicado; em AGORA, Próximo movimento com
prioridade visual e técnica/cuidados recolhidos em "Ver técnica e
cuidados") — supostamente "já validada visualmente no Firefox" e que não
deveria ser perdida.

Antes de agir, verifiquei: `git status`/`git diff` mostravam a worktree
**completamente limpa** (sem nenhuma alteração não commitada, nestes
arquivos ou em qualquer outro) — idêntica ao que já estava em
`origin/claude/adoring-turing-7twbsw`. Lendo o código então vigente
(o HEAD desta branch, já mesclado da FASE 16-R6), a UX descrita **não
existia**: `renderReasoningCore` ainda rotulava o bloco como "Commercial
Brain" e o duplicava em ANÁLISE, "Técnica aplicável" ainda era exibida
sem recolhimento (dominando a tela, o padrão antigo que a instrução
pedia para nunca mais acontecer), "Próximo movimento" estava
explicitamente suprimido em modo AGORA (`mode !== 'agora'` no código
antigo), e em ANÁLISE "Acertos" renderizava antes de "Pontos de
melhoria", sem nenhum dos dois recolhido.

Portanto: esta UX foi **implementada nesta sessão como trabalho novo**,
a partir da especificação recebida — não recuperada de um estado local
pré-existente, porque esse estado local não existia neste ambiente. Isto
é registrado explicitamente para não passar a falsa impressão de que
algo foi "preservado" quando, na prática, foi construído a partir da
especificação dada.

### Alterações

- `companion-reasoning-view.js`: `renderReasoningCore` agora só roda em
  modo AGORA (removida a chamada em `renderAnalysisViewModel`, que
  eliminava a duplicação de "Commercial Brain" em ANÁLISE). Dentro do
  bloco, ordem passou a ser: "Próximo movimento" (sem recolhimento,
  primeiro) → "Por que agora" → `<details>` "Ver técnica e cuidados"
  (técnica aplicável + do-not-do + conhecimento da empresa).
- `companion-seller-information-view.js`: `renderAnalysisViewModel`
  reordenado para `improvements → strengths → opportunity → objections
  → risks → commitments → method (recolhido) → continuity → history`.
  `renderStrengths`/`renderImprovements` passaram a envolver
  why_it_matters/impact/how_to_improve/evidência em `<details>` por
  item (`Ver detalhes`), preservando o título visível. Novo
  `renderCollapsedMethod()` envolve a seção de método inteira em
  `<details><summary>Ver método comercial</summary>`.
- `scripts/build-package.mjs`: achado colateral — `companion-reasoning-
  view.js` já estava referenciado em `manifest.json` (content_scripts)
  mas **nunca esteve** na allowlist de empacotamento
  (`SHARED_RUNTIME_FILES`), um gap pré-existente (não introduzido nesta
  sessão) que fazia `build-package.mjs` falhar sempre que qualquer
  arquivo da extensão fosse alterado. Corrigido adicionando a entrada —
  sem esta correção, nenhum build passaria, com ou sem as mudanças de
  UX desta sessão.

### Testes

`companion-seller-information-view.test.mjs` e `companion-reasoning-
view.test.mjs` ganharam testes "FASE 16.9" cobrindo exatamente os
requisitos acima (ordem melhoria-antes-de-acertos, detalhe recolhido,
método recolhido, Próximo movimento priorizado, técnica recolhida,
ausência de Commercial Brain duplicado em ANÁLISE) — confirmados via
`git stash` que falham no código anterior e passam no atual.

### Build

`node app/extension/yolen-companion/scripts/build-package.mjs` —
Chrome dev, Chrome prod, Firefox dev e Firefox prod todos gerados com
sucesso, `companion-reasoning-view.js` presente nos 4 pacotes.

## Escopo desta fase vs. escopo da missão completa

A missão da FASE 16.9 pede uma reorganização arquitetural ampla (contexto
factual → reasoning engine único → validators → presenters, cobrindo
AGORA/ANÁLISE/MENSAGEM/CLIENTE, extensão, e 10 cenários de eval). Esta
correção resolve a causa raiz mais concreta e verificável dentro do tempo
disponível desta sessão: o ponto exato onde o raciocínio comercial real
era substituído por template genérico antes de chegar ao vendedor. A
auditoria mais ampla (Commercial Reasoning Engine determinístico em
`commercial-reasoning-engine.ts`, Message Intelligence v2, extensão) foi
mapeada mas não sofreu mudanças estruturais nesta sessão — ver relatório
final da sessão para o que fica como pendência.
