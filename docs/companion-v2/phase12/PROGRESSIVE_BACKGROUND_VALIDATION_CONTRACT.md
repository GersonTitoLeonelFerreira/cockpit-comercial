# Contrato de validação — arquitetura progressiva do Companion (Fase 12A, Frente Paralela 3)

## Papel deste documento

Este é o documento-guarda-chuva da Frente Paralela 3 (validação adversarial
da arquitetura progressiva). Ele registra a arquitetura auditada, os gaps
confirmados e o que esta frente entrega para provar (ou reprovar) a
arquitetura progressiva que a Frente Principal está construindo em PR A
(fundação de background), PR B (leitura rápida) e PR C (UX progressiva /
"Analisar agora").

**Atualização — PR #207 mergeado (`ba21b8f`)**: a fundação de background
(PR A, na numeração original) já existe de verdade —
`companion_background_analysis_jobs`, Vercel Queue, worker durável,
persistência V3. Esta branch foi atualizada a partir da `main` pós-PR#207
sem conflitos nos arquivos desta frente (um gap pré-existente do harness de
teste da extensão foi corrigido — ver commit correspondente). Toda a
auditoria e as matrizes abaixo foram revisadas contra a implementação real;
seções ainda teóricas (aguardando PR B/C) permanecem marcadas como tal.

Esta frente **não implementa** nada da arquitetura em si e **não altera**
nenhum arquivo de runtime protegido (lista completa na seção "Escopo"
abaixo). Ela produz: auditoria, matrizes de cenário, critérios de medição,
observabilidade mínima necessária, e testes/scaffolding isolados — alguns já
executáveis hoje contra o comportamento real do V1/pré-background, outros
documentados como pendentes até os PRs A/B/C existirem.

## Documentos desta entrega

| Documento | Conteúdo |
|---|---|
| `PROGRESSIVE_BACKGROUND_VALIDATION_CONTRACT.md` (este) | Arquitetura auditada, gaps, watermark canônico, stale-result policy. |
| `RACE_CONDITIONS_MATRIX.md` | Cenários A–I históricos (pré-PR#207) + matriz A–N real pós-PR#207, com um `BLOCKER` confirmado e vários cenários já provados por teste executável (DB real + DOM real). |
| `ISOLATION_MATRIX.md` | Isolamento cross-tenant, cross-cycle, cross-client, reload. |
| `LATENCY_MEASUREMENT_CRITERIA.md` | TTFV vs. TTDA, pontos de instrumentação, sem número mágico de PASS. |
| `OBSERVABILITY_CONTRACT.md` | Telemetria hoje existente, conjunto mínimo necessário, o que nunca deve ser registrado. |
| `P1_03_REVALIDATION_ROADMAP.md` | Roteiro de revalidação para quando `INVALID_COMMUNICATION_OUTPUT` for corrigido. |
| `FIREFOX_12A_CHECKLIST.md` | Checklist manual para revalidação em Firefox real. |
| `DEEP_RESULT_DELIVERY_ADVERSARIAL_MATRIX.md` | Bateria adversarial preparada com antecedência para `feat/phase12a-deep-result-delivery` (segurança/IDOR, matriz A–P, polling, stale/watermark) — antes de a branch existir. |

## Escopo — o que não foi e não pode ser alterado

Runtime de produção protegido (não tocado por esta frente):

```text
app/lib/companion/stateful-copilot-openai-provider*
app/lib/server/stateful-copilot-runtime-orchestrator*
app/lib/server/stateful-copilot-composition*
app/lib/companion/stateful-copilot-json-schema*
app/lib/companion/stateful-communication*
app/lib/companion/stateful-copilot-execution-plan*
app/lib/companion/stateful-copilot-cycle-deadline*
```

Também não alterados: CRM, Agenda, prompts, modelos, deadline, contratos
semânticos, `app/extension/yolen-companion/src/*` (código de produção da
extensão). O único arquivo novo fora de `docs/` é um teste isolado em
`app/extension/yolen-companion/tests/e3-dom/`, que carrega o
`content-script.js` real sem modificá-lo (mesmo padrão dos testes E3 já
existentes no repositório).

## Arquitetura auditada

### Identificadores

A chave de escopo canônica em todo o pipeline stateful é a tripla
`(company_id, cycle_id, conversation_key)`:

- `company_id` — isolamento de empresa (tenant), validado em toda a cadeia
  (`stateful-copilot-input.ts`, `stateful-copilot-real-context-loader.ts`,
  `stateful-copilot-runtime-orchestrator.ts`, RLS/tabelas Supabase).
- `cycle_id` — ciclo comercial (um lead pode ter mais de um ciclo ao longo
  do tempo).
- `conversation_key` — identifica a conversa (hoje, telefone normalizado do
  WhatsApp, resolvido a partir de `state.leadResolution?.phone`).
- `device_key` — identifica o navegador/dispositivo que capturou; não faz
  parte da identidade do estado, só do rastreamento de origem da captura.

A tabela `companion_commercial_states` já impõe
`unique (company_id, cycle_id, conversation_key)` no banco
(`supabase/migrations/20260806193000_create_stateful_copilot_storage.sql`).

Na extensão, existem **duas chaves de conversa diferentes e paralelas**: uma
chave derivada do DOM (`getConversationKey`, usada para detectar troca de
conversa na UI) e uma chave canônica derivada do telefone do lead resolvido
(`getCaptureConversationKey`, enviada ao backend). As duas devem convergir,
mas são calculadas por caminhos diferentes — qualquer teste de troca de
conversa precisa validar contra a chave realmente usada em cada ponto, não
assumir que são a mesma string.

### Watermark — três sinais não unificados hoje

Não existe um único "watermark" no código atual. Existem três mecanismos
independentes, que não se referenciam entre si:

1. **Versão de estado** (`previous_state_version`/`target_state_version`,
   inteiro monotônico) + `updated_at` — a base do compare-and-swap na
   persistência (`stateful-copilot-persistence-plan.ts`,
   `stateful-copilot-supabase-writer.ts`). Este é o sinal mais forte e mais
   bem testado hoje.
2. **Conjunto de ids de mensagem** (`known_message_ids`/`active_message_ids`/`excluded_message_ids`)
   — igualdade de conjuntos, validada em `stateful-copilot-input.ts`.
3. **Fingerprint client-side** (`getCurrentConversationFingerprint()` na
   extensão) — usado só para decidir se o timer de debounce automático deve
   re-agendar, e comparado dentro de `isCurrentAnalysisOutdated()` para
   decidir se a UI deve mostrar "a conversa mudou, atualize a análise". É
   este terceiro sinal, mal isolado por conversa, que causa a contaminação
   comprovada no cenário B da matriz de corrida.

**Recomendação para a Frente Principal** (não vinculante — decisão de
arquitetura pertence a ela): a arquitetura progressiva deveria escolher **um**
desses três sinais (ou um novo, unificado) como o watermark oficial de um
job de background, e usá-lo tanto para a decisão de aplicar/descartar um
resultado quanto para a telemetria (ver `OBSERVABILITY_CONTRACT.md`).

### Vínculo entre resultado e ciclo — o que já existe e o que falta

**Já existe (camada de persistência):** compare-and-swap real, keyed por
`(company_id, cycle_id, conversation_key)` + versão esperada. Uma escrita
com `expected_previous_state_version` desatualizado recebe
`mode: 'conflict'` do RPC `rpc_persist_stateful_copilot_state` e não
sobrescreve o estado persistido — o chamador cai em fallback V1. Isso já é,
na prática, uma política de "resultado obsoleto não vence resultado novo"
**para escrita em banco**.

**Não existe (camada de entrega ao vendedor):** nenhum guard equivalente
entre "a análise terminou" e "aplicar o resultado à tela". A função que
existe hoje para isso,
`loadCompanionClientContextForCurrentCycle`/`isStillCurrentContext()`
(content-script.js:8608-8618), **não é usada** por
`analyzeCurrentConversation`, que aplica `result.payload.data`
incondicionalmente. Esse é o gap central identificado e provado por teste
executável (`RACE_CONDITIONS_MATRIX.md`, cenário B).

### Stale Result Policy (proposta de contrato, não implementação)

Formalização do princípio pedido no mandato (seção 9):

> Um resultado só pode ser aplicado à experiência do vendedor se o watermark
> para o qual ele foi produzido ainda corresponder ao watermark atual do
> escopo (`company_id`, `cycle_id`, `conversation_key`) no momento em que o
> resultado chega — **independente de o resultado ser tecnicamente
> "correto"**.

Consequências obrigatórias desta regra:

1. Um job iniciado para `cycle_id=X`, watermark `w1`, cujo resultado chega
   depois que o watermark local já avançou para `w2` (nova mensagem, ou
   troca de conversa, ou fechamento de ciclo), **deve ser descartado**, não
   aplicado "porque ainda é melhor que nada".
2. Um job que demorou mais que outro job mais recente para o mesmo escopo
   **nunca** deve vencer o resultado do job mais recente, mesmo que termine
   depois de o mais recente já ter sido aplicado.
3. Descartar um resultado por estar obsoleto não é uma falha — é o
   comportamento correto. Ele deve aparecer na telemetria como
   `superseded`/`stale`, não como `failure`.
4. A política vale nos dois sentidos: um resultado de leitura rápida
   obsoleto não deve bloquear a chegada do resultado profundo mais recente,
   e vice-versa.

Já existe precedente parcial e funcional desta política na camada de
persistência (CAS por versão). A lacuna é replicar o mesmo princípio na
camada de entrega ao vendedor (extensão) e, futuramente, na camada de
fila/worker que a Frente Principal introduzir no PR A.

**Ratificação do Controle Mestre (sobre o PR #206):** esta política foi
confirmada como regra obrigatória e estrutural do background foundation,
com o cenário B da matriz de corrida como BLOCKER de referência. Correção
atribuída à Frente Principal, preferencialmente no PR A. O checklist de
regressão de 5 pontos (análise, fingerprint, loading/error, área ANÁLISE,
área CLIENTE) está em `RACE_CONDITIONS_MATRIX.md`, seção "Triagem do
Controle Mestre", e no próprio teste
`content-script-dom-stale-analysis-cross-conversation-race.test.mjs`
(`npm run test:companion-extension-dom`) — hoje 2/5 `PASS`, 3/5 `FAIL`.

## Non-commercial — o que a auditoria confirmou

`commercial-relevance.ts` define `commercial`/`non_commercial`/`uncertain`,
mas **toda a decisão de gating é uma instrução de prompt para o modelo**, não
um filtro determinístico anterior à chamada de IA. Isso tem duas
implicações diretas para a arquitetura progressiva:

1. Hoje, mesmo uma conversa pessoal ainda dispara a chamada cara ao modelo —
   só o **resultado** é descartado (`state_patch` vazio, sem CRM/Agenda,
   fail-closed também para `uncertain`, não só para `non_commercial`). Se a
   arquitetura progressiva quer economizar custo/latência não disparando o
   job profundo para conteúdo pessoal, isso exige um pré-filtro
   determinístico que **não existe hoje** — é uma decisão de design do PR B
   (leitura rápida + relevance gate), não algo que já está pronto para
   reaproveitar.
2. O comportamento de fail-closed em si (nenhuma ação comercial para
   `non_commercial`/`uncertain`) já é validado por corpus de regressão
   (`commercial-relevance-corpus.test.mjs`,
   `commercial-relevance-regression.test.mjs`) e não precisa ser reprovado —
   só reaplicado ao novo caminho quando ele existir.

Cenário obrigatório (mandato, seção 8) de "commercial → personal →
commercial" (histórico comercial anterior pode permanecer, sessão pessoal
não gera nova evidência comercial): não encontrado nenhum teste dedicado a
essa transição especificamente sobre o **watermark**/estado exibido ao
vendedor (distinto da regra de conteúdo do corpus, que testa o
`state_patch` produzido, não o que a UI mantém em tela entre uma mensagem
pessoal e a comercial seguinte). Registrado como cenário pendente para
quando o PR B existir.

**Atualização pós-PR #207**: o teste
`content-script-dom-seller-information-architecture.test.mjs`
("non-commercial neutraliza AGORA e ANÁLISE sem apagar fatos persistidos do
cliente") já existia **antes** do PR #207 (não foi alterado por ele) e já
cobre, ao nível de DOM real, que uma leitura `non_commercial` neutraliza as
áreas AGORA/ANÁLISE sem apagar fatos do cliente já persistidos — ou seja, a
metade "sessão pessoal não some com o histórico comercial anterior" do
cenário `commercial → personal → commercial` já tem evidência real. A
metade que falta é a inversa: confirmar que uma sessão pessoal, sozinha,
nunca é a **origem** de uma nova evidência comercial — isso depende do
pré-filtro determinístico do item 1 acima, que ainda não existe.

## Registrar conversa — cobertura adversarial (mandato, seção 13)

PR #205 entregou "Registrar conversa"; PR #207 acrescentou o guard de
isolamento dedicado. Cruzando a lista de cenários pedida pelo mandato
contra a cobertura já existente (auditada nesta frente) e o que esta
frente acrescentou:

| Cenário do mandato | Cobertura | Onde |
|---|---|---|
| A gera preview → muda para B → A confirma | **Não é uma corrida de rede — é bloqueado pela própria estrutura do estado.** `getCurrentConversationRegistrationEntry()` sempre lê pela chave da conversa **atual** (`getConversationRegistrationKey()`); a entrada de A fica indexada só sob a chave de A. Ao trocar para B, não existe nenhum botão "Confirmar" de A na tela — o botão de confirmar só aparece para a entrada da conversa atualmente exibida. `PASS por construção`, mas não tinha teste de DOM real provando isso — **novo teste desta frente** (`content-script-dom-register-conversation-cross-conversation-race.test.mjs`) prova a metade preview→troca; a metade troca→tentativa-de-confirmar-A-estando-em-B não foi testada separadamente porque o botão correspondente comprovadamente não existe no DOM nesse estado (mesma evidência do teste novo). |
| Watermark velho + mensagem nova | **Já coberto**, sem duplicar: `register-conversation-route.test.mjs` ("stale watermark: message changed after preview") já testa exatamente isso no servidor. |
| Summary adulterado | **Já coberto**: `register-conversation-route.test.mjs` (hash mismatch do `summary_text` tentado). |
| Token expirado | **Já coberto**: `register-conversation-route.test.mjs` (token expirado). |
| Duplo clique | **Já coberto**: `register-conversation-route.test.mjs` ("dois cliques... idempotência", RPC chamada duas vezes sequencialmente, uma única linha persistida). |
| Replay | **Já coberto** para replay sequencial (mesmo teste acima). **Gap real, não coberto**: replay **concorrente** (duas confirmações em paralelo de verdade, não sequenciais) — nenhum teste (nem os existentes, nem os desta frente) exercita isso. Fica registrado como gap, não fabricado um teste de concorrência real sem ambiente adequado. |

Nenhum teste novo duplicou a suíte já existente de
`register-conversation-route.test.mjs`/`companion-conversation-registration-loader.test.mjs`
— o único teste novo desta frente para esse fluxo
(`content-script-dom-register-conversation-cross-conversation-race.test.mjs`)
cobre exatamente a lacuna que não existia: a ligação real entre o guard de
unidade (`conversation-registration-tools.test.mjs`, já existia) e o DOM.

## Gaps confirmados (resumo executivo, com status pós-PR #207)

1. **Nenhum guard de resultado obsoleto na camada de entrega ao vendedor**
   — **FECHADO pelo PR #208** (`1021867d`, mergeado em `main`), confirmado
   de forma independente por esta frente: 35/35 testes verdes
   (`RACE_CONDITIONS_MATRIX.md`, "Validação independente do PR #208").
   Continua relevante como requisito para o cenário B/J/N da matriz A–N
   quando a entrega do resultado profundo existir — ver
   `DEEP_RESULT_DELIVERY_ADVERSARIAL_MATRIX.md`.
2. **Nenhum `job_id`/`run_id` emitido no início de uma execução** —
   **FECHADO pelo PR #207.** `analysis_job_id` (sha256 determinístico) é
   emitido no enqueue, provado real por `phase-12a-background-jobs-database-contract.test.mjs`.
3. **Nenhum coalescing/single-flight por escopo no servidor** — **FECHADO
   pelo PR #207.** `companion_background_analysis_jobs_scope_unique` +
   índice único parcial `one_running_per_conversation_idx` — provado real
   pelos testes `(D)` e `(G)` do novo arquivo de contrato de banco.
4. **Três sinais de watermark não unificados** — **PARCIALMENTE FECHADO.**
   O job de background agora usa um único `message_watermark` canônico. Os
   dois outros sinais (versão de estado + conjunto de ids de mensagem)
   continuam existindo, sem relação formal com o watermark do job — mas
   isso é aceitável, porque cada um protege uma camada diferente (job vs.
   estado persistido).
5. **Nenhum pré-filtro determinístico de relevância comercial antes da
   chamada cara ao modelo** — **ABERTO, inalterado pelo PR #207.** A
   economia de custo/latência para conteúdo pessoal, se desejada, precisa
   ser desenhada, não reaproveitada.
6. **Telemetria sem os campos necessários para TTFV/TTDA/superseded** —
   **MAIORIA FECHADA para TTDA/superseded** (ver `OBSERVABILITY_CONTRACT.md`
   — `companion_background_analysis_jobs` tem quase todos os campos
   pedidos). TTFV continua sem nenhuma instrumentação.
7. **Isolamento cross-tenant de conteúdo real não tem teste automatizado**
   — **PARCIALMENTE FECHADO para a tabela de jobs** (novo teste de
   isolamento desta frente, ver `ISOLATION_MATRIX.md`); continua aberto
   para o restante do pipeline (`companion_commercial_states` e as demais
   tabelas do Companion, fora do escopo desta auditoria pontual).
8. **P1-03 (`INVALID_COMMUNICATION_OUTPUT`) infla TTDA** — **Controle
   Mestre declarou PASS**; auditoria desta frente confirma a evidência com
   ressalva (a correção é arquitetural — desacopla o vendedor do retry —
   não uma redução do retry em si). Ver `P1_03_REVALIDATION_ROADMAP.md`.
9. **(Novo, achado pelo PR #207) Nenhum caminho de entrega do resultado
   profundo ao vendedor** — o job `succeeded` fica só no banco; não existe
   polling nem qualquer leitura de volta pela extensão. Isso não é uma
   falha do PR #207 (provavelmente é trabalho do próximo PR), mas precisa
   ser registrado como pré-requisito: quando esse caminho for construído,
   ele **herda automaticamente** a obrigação do gap #1 (não aplicar
   resultado de escopo/watermark errado à UI atual).
10. **(Novo) RLS não é uma segunda barreira contra vazamento cross-tenant
    para `service_role`** — `companion_background_analysis_jobs` tem RLS
    habilitada+forçada, mas a role usada pelo worker tem `bypassrls`. A
    proteção real é só o filtro de aplicação. Ver `ISOLATION_MATRIX.md`.
11. **(Novo) Nenhum teste executa o worker de verdade** — toda a cobertura
    pré-existente para `stateful-copilot-background-worker.ts` é
    regex/substring sobre o código-fonte; os novos testes desta frente
    provam as *constraints do banco* com SQL real, mas não a *orquestração*
    (claim → runtime → persist) da função TypeScript, porque
    `createAdminClient()` cria o client Supabase real internamente, sem
    seam de injeção. Ver `RACE_CONDITIONS_MATRIX.md`, "O que continua sem
    verificação".

## O que esta frente entrega como executável hoje

- **Extensão — troca de conversa durante análise** (`analyzeCurrentConversation`):
  `content-script-dom-stale-analysis-cross-conversation-race.test.mjs`
  (`npm run test:companion-extension-dom`), 5 verificações independentes,
  **3 falham hoje** — o `BLOCKER` já triado pelo Controle Mestre.
- **Extensão — troca de conversa durante "Registrar conversa"**
  (`registerCurrentConversation`): novo teste
  `content-script-dom-register-conversation-cross-conversation-race.test.mjs`,
  **passa hoje** — evidência positiva de que o padrão de guard correto já
  existe no repositório para outro fluxo.
- **Banco — contrato real de `companion_background_analysis_jobs`**: novo
  arquivo `supabase/phase-tests/phase-12a-background-jobs-database-contract.test.mjs`
  (`npm run test:companion-background-jobs-db`), 7 testes, SQL real contra
  Postgres via PGlite (não regex) — prova unicidade de escopo+watermark,
  serialização de "running" por conversa, detecção de job mais novo, FK
  cross-tenant, fail-closed de CRM/Agenda, limites de retry e isolamento
  por `company_id`.
- Todas as matrizes e critérios documentados nesta pasta, atualizados
  contra a implementação real do PR #207.

## O que fica pendente

Listado item a item em `RACE_CONDITIONS_MATRIX.md` (tabela "Matriz A–N" e
seção "O que continua sem verificação"). Em resumo: execução real e
concorrente do worker TypeScript (exigiria mock de módulo ou ambiente
Supabase real), o caminho de entrega do resultado profundo à UI (ainda não
existe), e tudo que depender dele (cenários B/I/J/N da matriz A–N).

## Regra de atualização desta bateria

Quando PR A (fundação de background) for mergeado na `main`:

1. Atualizar esta branch a partir da `main`.
2. Reler os nomes reais de API/estado introduzidos por PR A (não presumir
   nomes futuros — nenhum destes documentos inventa uma API que ainda não
   existe).
3. Converter os cenários marcados "pendente" nas matrizes em testes
   executáveis, reaproveitando os harnesses já existentes
   (`tests/e3-test-support/load-content-script.mjs` para a extensão,
   os padrões de teste de `stateful-copilot-*` para o servidor).
4. Repetir para PR B e PR C conforme forem mergeados.

Esta frente não bloqueia a Frente Principal — a auditoria e as matrizes
foram construídas sem esperar por PR A/B/C, exatamente como pedido no
mandato (seção 18).
