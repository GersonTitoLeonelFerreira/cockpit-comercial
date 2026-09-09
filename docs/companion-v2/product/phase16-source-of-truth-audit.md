# FASE 16.2 — Auditoria das Fontes de Verdade Comerciais Atuais

**Status:** auditoria técnica, não normativa. Não altera contrato de produto
(`companion-seller-product-contract.md`, FASE 16.1). Não implementa nada —
descreve o que existe hoje, com evidência de código, para permitir que a
FASE 16.3 consolide a Commercial Reading canônica sem adivinhação e sem
criar mais uma fonte concorrente.

**Metodologia:** toda afirmação concreta cita `arquivo` → `símbolo/função/
tipo/tabela`. Onde não foi possível confirmar por leitura direta de código,
a linha é marcada `[Unverified]`. Onde é interpretação/julgamento sobre o
que o código implica (não uma citação literal), a linha é marcada
`[Inference]`. Nenhuma correção foi feita — gaps são documentados como
`MISSING`, não implementados.

---

## 1. Executive summary

O runtime atual do Companion (`app/api/companion/analyze-conversation/
route.ts`) é **stateful-only** desde a FASE 12A — não há mais escolha V1/V2
neste caminho. Uma rota V1 (`sales-copilot.ts`/`sales-coaching.ts`) ainda
existe, mas serve exclusivamente o dashboard web (`LeadCopilotPanel.tsx`
via `/api/ai/analyze-conversation`), não a extensão do Companion.

O achado mais crítico da auditoria: **Commercial Reading — a fonte que a
seção 2.1 do contrato de produto (FASE 16.1) pressupõe como leitura de
oportunidade compartilhada — está `MISSING` como fonte canônica
server-side.** `loadCommercialReading()` em
`message-intelligence-source-loader.ts` está hardcoded para retornar
`null`, com comentário explícito no próprio código proibindo qualquer
substituto client-side. O único produtor real de um objeto
`CommercialReading` (`stateful-communication-executor.ts`) o persiste
apenas dentro do log de auditoria append-only de um job específico
(`companion_commercial_state_events.normalized_output`), sem tabela
dedicada e sem query "leitura atual do lead X".

O segundo achado estrutural mais importante: **Customer Memory
(`companion_commercial_states`) é escopada por `cycle_id`, não por
`lead_id`** — ou seja, tecnicamente CLIENTE=PESSOA está hoje persistido
dentro do escopo de ANÁLISE=VENDA (o ciclo). **Correção (achado do Codex,
6ª revisão do PR #274):** a fragmentação é ainda maior do que "por
ciclo" — a constraint real (`companion_commercial_states_scope_unique`)
é `(company_id, cycle_id, conversation_key)`, então um único ciclo pode
ter memórias **independentes para múltiplas conversas** (`conversation_key`
distintos). A continuidade entre ciclos existe apenas como uma cópia
pontual e degradada de um subconjunto de fatos do ciclo anterior — e
`loadDurableMemorySeedForMissingState()` escolhe só **uma** dessas linhas
por `cycle_id` (`ORDER BY persisted_at DESC LIMIT 1`), então se o ciclo
anterior tiver mais de uma conversa com estado próprio, a memória das
demais é silenciosamente descartada na herança. Não é um perfil de
pessoa vivo e continuamente atualizado.

Terceiro achado: **Seller Coaching e o estágio de método usado por ANÁLISE
não têm read-model próprio** — são recalculados a cada turno pelo modelo e
persistidos só como exhaust de auditoria (log append-only). Cada resultado
individual **é lido de volta e exibido ao vendedor** por job específico
(`companion-analysis-job-reader.ts::buildSellerResult()`), mas nada agrega
ou mescla esses resultados entre turnos — não há "histórico de coaching"
consultável, só o resultado do último job. AGORA, por sua vez, tem seu
próprio mecanismo de estágio de método _persistido e com gate
anti-regressão_ (`companion_method_stage_state`), **estruturalmente
diferente e não coordenado** com o de ANÁLISE — o próprio código documenta
essa divergência.

Quarto achado (achados do Codex nas rodadas 1 e 5 do PR #274, a versão
final corrigindo as intermediárias): a regra de SLA tem duas tabelas
ativas (`sla_rules`, `company_sla_rules`), mas **não** entre admin e
Companion — ambos, junto com o Kanban/relatórios "for company", leem e
escrevem `sla_rules` (apesar dos nomes de RPC como
`rpc_get_company_sla_rules` sugerirem o contrário). A única função que
realmente lê `company_sla_rules` é `report_sla_risk()`; nenhum writer de
aplicação foi encontrado para essa tabela, que parece órfã.

---

## 2. Scope and methodology

Auditados diretamente (leitura completa ou quase completa): os 10 arquivos
listados na missão da FASE 16.2, mais os arquivos que eles importam
transitivamente na cadeia real de execução. Buscas estruturais (`rg`/`git
grep`) cobriram os termos da seção 10 da missão. Rotas V1 vs V2 foram
explicitamente separadas (seção 3). Nenhum runtime, prompt, migration ou
variável de MIE foi alterado.

---

## 3. Runtime path confirmed

**COMPANION CURRENT PATH** (stateful-only, sem escolha V1/V2):

```
app/api/companion/analyze-conversation/route.ts (POST)
  → verifyCompanionToken (auth) + checagem de tenant (company_memberships/sales_cycles/leads)
  → buildStatefulCopilotBackgroundJobDescriptor (stateful-copilot-background-job.ts)
  → INSERT companion_background_analysis_jobs (idempotente, unique constraint)
  → publica em STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC (@vercel/queue)
  ↳ resposta síncrona: só {context, deep_analysis:{analysis_job_id,status,message_watermark}} — sem sugestão

app/lib/server/stateful-copilot-background-worker.ts
  → processStatefulCopilotBackgroundMessage
  → createStatefulCopilotServerRuntimeOrchestrator (stateful-copilot-runtime-orchestrator.ts)
  → stateful-copilot-input.ts (buildStatefulCopilotInput)
  → stateful-copilot-execution-plan.ts (buildStatefulCopilotExecutionPlan)
  → stateful-copilot-engine.ts / stateful-copilot-executor.ts
  → stateful-copilot-persistence-executor.ts
  → stateful-copilot-supabase-writer.ts → rpc_persist_stateful_copilot_state → companion_commercial_states
```

Confirmado pelo próprio comentário do código (`route.ts`, linhas ~442-450):
> "Fase 12A — V2 stateful como único motor seller-facing do Companion. Não
> existe mais escolha entre V1 e V2 [...] sales-copilot.ts/sales-coaching.ts
> (V1) continuam intactos porque ainda servem /api/ai/analyze-conversation,
> fora do Companion."

**LEGACY / OTHER ROUTES:**

- `app/api/ai/analyze-conversation/route.ts` → `analyzeConversationWithCopilotDetailed`
  (`app/lib/ai/sales-copilot.ts`). Autentica via sessão Supabase SSR
  (cookie `cockpit_active_company_id`), não via token Companion. Consumido
  por `app/components/leads/LeadCopilotPanel.tsx` — componente React do
  dashboard, não a extensão.
- `app/api/ai/generate-coaching/route.ts` → `sales-coaching.ts` — mesma
  família V1, mesmo padrão de alcance (dashboard, não Companion).
- Confirmado via grep: `content-script.js` e `background.js` da extensão
  **não referenciam** `sales-copilot`/`sales-coaching`/`/api/ai/analyze-
  conversation`.

`[Inference]` V1 é alcançável apenas pelo dashboard web (painel de coaching
do lead), não pela extensão do Companion — é legado para o Companion, mas
é o caminho atual/vivo da própria feature de coaching do dashboard (fora
de escopo desta auditoria, que é sobre o Companion).

### Session gap (`stateful-copilot-execution-plan.ts`)

- `CURRENT_SESSION_GAP_MS = 4 * 60 * 60 * 1000` — **4 horas**, constante
  hardcoded, não configurável.
- `selectCurrentSessionMessageIds(input)`: ordena mensagens por
  `activity_timestamp = max(occurred_at, observed_at)`, caminha **para
  trás a partir da mais recente**; para de aceitar mensagens mais antigas
  no primeiro gap > 4h entre timestamps consecutivos.
- `selectAnalysisMessageIds(input)`: restringe ainda mais para mensagens
  **incrementais** (`activity_timestamp > Date.parse(previousState.updated_at)`).
  Se o conjunto incremental ficar vazio (ex.: retry idempotente), cai para
  `currentSessionIds.slice(-1)` — só a última mensagem — "para manter o
  reprocessamento idempotente executável" (comentário do código).
- `CONTEXT_BRIDGE_MAX_MESSAGES = 6`: mensagens fora da janela de sessão
  atual viram `context_bridge_messages`, explicitamente sem IDs canônicos
  e proibidas de servir como evidência.

**Risco `[Inference]`:** Current Moment/AGORA opera estritamente sobre essa
janela de 4h + incremental-desde-o-estado-anterior, com só uma ponte de 6
mensagens não-evidenciais para o histórico. Qualquer consumidor futuro que
trate a saída de `selectAnalysisMessageIds` como "a oportunidade inteira"
descartaria silenciosamente tudo além dessa janela — ela foi desenhada
para geração incremental de patch de estado, não para síntese de histórico
completo.

---

## 4. Source classification model

Taxonomia usada nas seções seguintes (definida na missão, seção 8):
`CANONICAL`, `DERIVED`, `DURABLE_MEMORY`, `OPPORTUNITY_STATE`,
`SESSION_STATE`, `OPERATIONAL_SOURCE`, `CONFIG_SOURCE`, `VIEW_ONLY`,
`CACHE`, `LEGACY`, `DUPLICATED`, `AMBIGUOUS`, `MISSING`.

---

## 5. Canonical field matrix

| # | Campo / conceito | Domínio | Escopo | Fonte atual | Classificação | Persistência | Writer(s) | Reader(s) | Identity key | Evidence/provenance | Freshness/lifetime | Stale risk | Conflict risk | Duplicação | Consumidor atual | Consumidor futuro | Ação 16.3 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | current message intent | Current Moment | sessão | **MISSING como campo estruturado.** `current_moment` (`StatefulCopilotEvidence`, `stateful-copilot-contract.ts:49`) só tem `{summary: string, evidence_message_ids: string[]}` — sem um campo de "intent" separado. `summary` é texto livre que pode descrever a intenção, mas não é um valor estruturado/classificável. Achado do Codex (1ª revisão do PR #274). | **MISSING** (estruturado) / OPPORTUNITY_STATE (como texto livre em `summary`) | `companion_commercial_states.state_snapshot` | `stateful-copilot-engine.ts` | AGORA (via reader) | company_id+cycle_id+conversation_key | `evidence_message_ids` | ver linha 3 (nem sempre atualizado a cada turno) | MEDIUM | LOW | não | Companion AGORA | Decision State (16.3) | **decidir se cria campo estruturado** |
| 2 | current commercial relevance | Current Moment | sessão | **`StatefulCopilotOutput.commercial_relevance`** (`stateful-copilot-contract.ts:211`), NÃO `current_moment.summary`. Persistido só dentro de `companion_commercial_state_events.normalized_output` (log de auditoria do turno) — não faz parte de `StatefulCommercialState`/`state_snapshot`. Achado do Codex (1ª revisão do PR #274): mapear para `current_moment` atribui fonte/persistência erradas. | DERIVED (não persistido em read-model, só audit log) | `companion_commercial_state_events.normalized_output` | `stateful-copilot-normalizer.ts` (`buildStatefulCopilotOutput`) | ANÁLISE/AGORA (via job status), não o `state_snapshot` | **`company_id+cycle_id+conversation_key+candidate_state_version`** (correção, achado do Codex, 8ª revisão do PR #274: `companion-analysis-job-reader.ts::loadCompanionAnalysisJobStatus()` exige as 4 chaves para obter exatamente 1 evento; unicidade real por `operation_key`. `company_id+cycle_id` sozinho não identifica este valor quando há mais de uma conversa/versão no ciclo) | `[Unverified]` | recalculado por turno, sem leitura de "valor atual" fora do log do job | **HIGH** | LOW | não | AGORA/ANÁLISE (por job) | Decision State | **decidir persistência em read-model** |
| 3 | current moment summary | Current Moment | sessão | `current_moment.summary`. **Ressalva (achado do Codex, 1ª revisão do PR #274):** `stateful-copilot-engine.ts::preservePreviousCommercialStateWhenClosed()` substitui o `current_moment`/`current_priority` candidatos pelos do estado anterior sempre que `output.commercial_role !== 'buyer'` ou a relevância comercial não é acionável (`isCommerciallyActionable`) — ou seja, **não é recalculado a cada turno**; após uma interação não comercial, pode continuar descrevendo um momento comercial antigo. | OPPORTUNITY_STATE | `companion_commercial_states.state_snapshot` | `stateful-copilot-engine.ts` | AGORA | company_id+cycle_id+conversation_key | `evidence_message_ids` | **preservado (não atualizado) quando o contato não é comercialmente acionável** | **MEDIUM** (não LOW) | LOW | não | AGORA | Decision State | reutilizar, mas expor o momento em que foi preservado (não recalculado) |
| 4 | pending customer question | Current Moment/Opportunity | ciclo | `open_loops[]` | OPPORTUNITY_STATE | idem | reducer (append) | AGORA/ANÁLISE | idem | `evidence_message_ids` | até `resolve`/`supersede` | MEDIUM | LOW | não | — | ANÁLISE/AGORA | reutilizar |
| 5 | customer waiting | Operational Signal | mensagem | `computeCompanionClientWaiting()` (`companion-client-relationship.ts`). **Correção (achado do Codex, 9ª revisão do PR #274):** as mensagens vêm de `loadMessages()` (`companion-client-context-loader.ts`), que filtra por `company_id`+`conversation_key` na query e ainda rejeita em memória qualquer linha cujo `cycle_id` não seja o solicitado (`row.cycle_id !== cycleId`) — o read-model é identificado por `(company_id, cycle_id, conversation_key)`, não só pela conversa isolada. | DERIVED | nenhuma (calculado a cada render) | n/a | AGORA/UI | **company_id+cycle_id+conversation_key** | nenhuma (heurística de timestamp) | recalculado a cada leitura | LOW | LOW | não | UI cliente | AGORA (seção 4.7) | reutilizar |
| 6 | SLA (pipeline stage) | Operational/CRM | cycle | **Correção (achado do Codex, 5ª revisão do PR #274) — a premissa das rodadas 1-4 ainda estava incompleta.** `app/admin/configuracoes/sla/page.tsx` chama `rpc_get_company_sla_rules()`/`rpc_upsert_company_sla_rules()`, que (apesar do nome) fazem `SELECT`/`INSERT` em `public.sla_rules`. **`rpc_get_company_sla_rules_for_company()` — usada pelo Kanban/relatórios "for company" — também lê `public.sla_rules`** (`20260629040658_restore_simulator_metrics_rpc_shell.sql:11019`), não `company_sla_rules` como a rodada 4 ainda presumia. O único leitor confirmado de `company_sla_rules` é a função SQL `report_sla_risk()` (linha 5375, CTE `sla_lookup`); nenhum writer de aplicação foi encontrado para essa tabela — parece órfã. | CONFIG_SOURCE (regra) / DERIVED (risco), mas **DUPLICATED** | `sla_rules` (admin, Companion, e a RPC "for company" do Kanban/relatórios) + `company_sla_rules` (só `report_sla_risk`, sem writer conhecido) | admin, via RPCs nomeadas "company_sla_rules" que na verdade escrevem `sla_rules`; `company_sla_rules` sem writer de aplicação identificado | Companion (`sla_rules`), admin (`sla_rules`), Kanban/relatórios "for company" (`sla_rules` via `rpc_get_company_sla_rules_for_company`); só `report_sla_risk()` lê `company_sla_rules` | company_id+status | nenhuma | regra: até reconfigurar; risco: por request | LOW (regra) / MEDIUM (risco) | **MEDIUM — só `report_sla_risk()` pode divergir do resto; todo o restante (admin, Companion, Kanban) já usa `sla_rules`** | **sim, DUPLICATED** — `company_sla_rules` parece uma tabela órfã/vestigial lida por uma única função | Companion + admin + Kanban (`sla_rules`); `report_sla_risk()` (`company_sla_rules`) | AGORA (seção 4.7) | **confirmar se `company_sla_rules` ainda tem dado relevante; migrar `report_sla_risk()` para `sla_rules` e aposentar a tabela órfã** |
| 7 | Agenda commitment | Opportunity | **cycle+conversation_key** (mesma correção da linha #20 — `commitments[]` vive em `StatefulCommercialState`, escopado por `company_id+cycle_id+conversation_key`) | `StatefulCommercialState.commitments[]` | OPPORTUNITY_STATE | `companion_commercial_states.state_snapshot` | reducer (`applyCommitmentPatches`) | ANÁLISE/CLIENTE | company_id+cycle_id+conversation_key | `evidence_message_ids` | até status terminal | MEDIUM | **HIGH** (vs. CRM `next_action`, ver §12) | sim — 3 fontes de "agenda" (ver §12) | ANÁLISE | AGORA proativo (16.3) | decidir ownership |
| 8 | priority inbound | Operational | lead | `leads.entry_mode`/`source` + `SiteLeadPriorityDecorator.tsx` | OPERATIONAL_SOURCE (site) / MISSING (WhatsApp) | `leads` table | pipeline de captura de site leads | dashboard | company_id+lead_id | nenhuma | até mudança de status | LOW | LOW | não | dashboard | AGORA (cenário 4, FASE 16.1) | **MISSING para WhatsApp inbound** |
| 9 | pipeline | CRM | lead | `leads.current_pipeline_id` | CANONICAL | `leads`/`pipelines` tables | dashboard (`app/leads/*`) | dashboard, Companion (contexto) | company_id+lead_id | n/a (CRM truth) | até edição humana | LOW | LOW | não | dashboard | ANÁLISE (leitura) | reutilizar |
| 10 | stage | CRM | lead/cycle | `leads.current_stage_id` / `sales_cycles.status` | CANONICAL | idem | dashboard | dashboard, Companion | idem | n/a | idem | LOW | **MEDIUM** (vs. `companion_method_stage_state`, ver §12) | não (mas dois conceitos de "estágio" coexistem) | dashboard | ANÁLISE | decidir ownership |
| 11 | opportunity status | CRM | cycle | `sales_cycles.status` (enum `lead_status`) | CANONICAL | `sales_cycles` | dashboard | dashboard, Companion | company_id+cycle_id | n/a | até edição/won/lost | LOW | LOW | não | dashboard | ANÁLISE | reutilizar |
| 12 | opportunity stagnation | Operational | cycle | `assessCompanionClientSla()` (via `stage_entered_at`) | DERIVED | não persistido | n/a | UI | company_id+cycle_id | nenhuma | por request | LOW | LOW | não | UI | AGORA (seção 4.7) | reutilizar |
| 13 | next step | Opportunity/Method | cycle | `current_priority` (`StatefulCommercialState`) via `output.strategy.next_move`. **Mesma ressalva da linha #3 (achado do Codex, 2ª revisão do PR #274):** `preservePreviousCommercialStateWhenClosed()` também preserva `current_priority` do estado anterior fora de interação comercial acionável — não é recalculado incondicionalmente a cada turno. | OPPORTUNITY_STATE | `companion_commercial_states` | reducer | AGORA | company_id+cycle_id+conversation_key (mesma correção da linha #20) | `evidence_message_ids` | **preservado (não recalculado) quando o contato não é comercialmente acionável** | **MEDIUM** (não LOW) | LOW | não | AGORA | Decision State | reutilizar, expondo o momento em que foi preservado |
| 14 | commercial commitment | Opportunity | cycle | `commitments[]` | OPPORTUNITY_STATE | idem #7 | idem | idem | idem | idem | idem | MEDIUM | HIGH (ver #7) | sim | ANÁLISE | AGORA proativo | decidir ownership |
| 15 | method current stage (AGORA) | Method State | cycle | `companion_method_stage_state` | OPPORTUNITY_STATE | tabela dedicada (`companion-method-stage-store.ts`) | `saveCompanionMethodStage` | AGORA | company_id+cycle_id+conversation_key | nenhuma (gate determinístico) | último valor, sem histórico | LOW | **HIGH** (vs #16) | sim — divergência documentada no próprio código | AGORA | Method State (16.3) | consolidar |
| 16 | method current stage (ANÁLISE) | Method State | cycle | `CommercialReading.method.current_stage` (`commercial-reading-contract.ts:425-429`, `{step_order, stage_key, name}`). **Correção (achado do Codex, 5ª revisão do PR #274):** este campo **não** tem `evidence_message_ids` próprio — é derivado deterministicamente por `deriveCurrentMethodStage(stages, adherenceStatus)` (linha 2244) dentro de `normalizeMethodModelOutput()`, a partir dos `stages` e do `adherenceStatus` já normalizados, não escrito diretamente pelo modelo com evidência própria. Distinto de `method.adherence` (linha #17). | DERIVED (não persistido) | não persistido (só audit log) | **normalizador** (`normalizeMethodModelOutput`/`deriveCurrentMethodStage`), não o modelo diretamente | ANÁLISE | company_id+cycle_id+conversation_key+candidate_state_version (mesma correção da linha #2 — vive no mesmo evento de audit log) | **indireta** — recuperável do item correspondente em `method.stages`, não um campo próprio | recalculado a cada turno, sem continuidade | **HIGH** | **HIGH** (vs #15) | sim | ANÁLISE | Method State (16.3) | consolidar, preservando `current_stage` e `adherence` como campos distintos |
| 17 | method adherence | Method State | cycle | `CommercialReading.method.adherence` (`commercial-reading-contract.ts:431-454`, `{status, summary, deviation_stage_order, evidence_message_ids, memory_ids, ...}`) — campo distinto de `method.current_stage` (linha #16). | DERIVED (não persistido) | não persistido (só audit log) | modelo, por turno (`stateful-communication-executor.ts`) | ANÁLISE | company_id+cycle_id+conversation_key+candidate_state_version (mesma correção da linha #2) | `evidence_message_ids`/`memory_ids` (campos próprios do tipo) | recalculado a cada turno, sem continuidade | HIGH | **LOW — correção (achado do Codex, 7ª revisão do PR #274): `adherence` não compete com `current_stage` (#16); `current_stage` é derivado a partir de `adherenceStatus`, não uma fonte independente** | não | ANÁLISE | Method State | não consolidar com o estágio — ver #16 para a real disputa de ownership de estágio |
| 18 | method deviation | Method State | cycle | `deviation_stage_order` (`CommercialReadingMethodAdherence`) | DERIVED | idem | idem | ANÁLISE | idem | idem | idem | HIGH | — | não | ANÁLISE | Method State | consolidar |
| 19 | method recovery | Method State | cycle | `CommercialReadingRecoveryGuidance` | DERIVED | idem (só audit log) | idem | ANÁLISE | idem | idem | idem | HIGH | — | não | ANÁLISE | Method State | consolidar |
| 20 | customer objective | Customer Memory | **cycle + conversation_key** (ver §1/§12) | `facts[]` kind `client.objective`. **Correção (achado do Codex, 7ª revisão do PR #274):** a correção do §1 (fragmentação por `conversation_key`) não chegou a esta linha — a chave real é `(company_id, cycle_id, conversation_key)` (`companion_commercial_states_scope_unique`), então duas conversas do mesmo ciclo mantêm fatos independentes. O seed (`applyDurableMemorySeedToFreshState()`) é aplicado uma vez por **conversa sem estado** (primeiro turno daquele `conversation_key`), não uma vez por ciclo. | OPPORTUNITY_STATE (persistência) / Customer Memory (semântica) | `companion_commercial_states` | reducer | CLIENTE | **company_id+cycle_id+conversation_key** | `evidence_message_ids` | até `resolve`/`supersede`; herdado 1x por conversa sem estado, via seed do ciclo anterior | MEDIUM | LOW | não | CLIENTE | Customer Memory (16.3) | **decidir escopo (conversation_key/cycle vs lead)** |
| 21 | problem | Customer Memory | **cycle + conversation_key** (idem #20 — correção, achado do Codex, 9ª revisão do PR #274) | `facts[]` kind `client.problem` | idem #20 | idem | idem | CLIENTE | idem | idem | idem | MEDIUM | LOW | não | CLIENTE | Customer Memory | idem #20 |
| 22 | need | Customer Memory | **cycle + conversation_key** (idem #20 — correção, achado do Codex, 9ª revisão do PR #274) | `needs[]` | OPPORTUNITY_STATE | idem | idem (additive) | CLIENTE/ANÁLISE | idem | idem | **até `resolve`/`supersede` DENTRO do ciclo/conversa; SEM herança cross-cycle — correção (achado do Codex, 10ª revisão do PR #274): `durable-memory-seed.ts` exclui `needs[]` explicitamente do seed (comentário do próprio módulo: "estado transacional do ciclo... nascer limpo no novo ciclo é o comportamento correto")** | MEDIUM | LOW | não | ambos | Customer Memory/Opportunity Reading | reutilizar |
| 23 | impact | Customer Memory | **cycle + conversation_key** (idem #20 — correção, achado do Codex, 9ª revisão do PR #274) | `facts[]` kind `client.problem`/`client.impact` (ver contrato) | idem #20 | idem | idem | CLIENTE | idem | idem | idem | MEDIUM | LOW | não | CLIENTE | Customer Memory | idem #20 |
| 24 | product/service interest | Customer Memory | **cycle + conversation_key** (idem #20 — correção, achado do Codex, 9ª revisão do PR #274) | `client.product.{catalog,observed}.{discussed,interested,primary}` | idem #20 | idem | idem | CLIENTE | idem | idem | idem | MEDIUM | LOW | não | CLIENTE | Customer Memory | idem #20 |
| 25 | decision criteria | Customer Memory | **cycle + conversation_key** (idem #20 — correção, achado do Codex, 9ª revisão do PR #274) | `client.decision_criterion` | idem #20 | idem | idem | CLIENTE | idem | idem | idem | MEDIUM | LOW | não | CLIENTE | Customer Memory | idem #20 |
| 26 | budget / price sensitivity | Customer Memory | **cycle + conversation_key** (idem #20 — correção, achado do Codex, 9ª revisão do PR #274) | `facts[]` kind `declared_budget` (`stateful-commercial-state-reducer.test.mjs:174,297`, exercitado pelo runtime real). **Correção (achado do Codex, 10ª revisão do PR #274):** `declared_budget` **não** pertence à taxonomia `CLIENT_COMMERCIAL_FACT_KINDS` (`client-commercial-intelligence-contract.ts:27-34` — só `objective`/`problem`/`impact`/`interest`/`decision_criterion`/`preference`); `parseClientCommercialFactKind()` retorna `null` para esse kind, e `buildCommercialReadingCustomerFromState()` descarta silenciosamente todo fact cujo `descriptor` é `null` (linha 514-516: `if (!descriptor) continue`). O fato é persistido em `companion_commercial_states.state_snapshot`, mas **não chega à projeção CLIENTE**. | **AMBIGUOUS — persiste no state_snapshot, mas sem projeção canônica para CLIENTE** (não idem #20) | `companion_commercial_states` | reducer | **nenhum reader confirmado via projeção CLIENTE — só leitura direta e bruta de `state.facts` (não usada por nenhum consumidor mapeado nesta auditoria)** | company_id+cycle_id+conversation_key | `evidence_message_ids` | até `resolve`/`supersede`; **SEM herança cross-cycle apesar de ser `facts[]`, porque `parseClientCommercialFactKind()` também bloqueia esse kind dentro do seed** (`durable-memory-seed.ts:142`) | MEDIUM | LOW | não | **nenhum (projeção quebrada)** | Customer Memory (16.3) | **criar categoria `client.budget`/`declared_budget` na taxonomia e na projeção CLIENTE** |
| 27 | timeline | Customer Memory/Opportunity | **cycle + conversation_key** (idem #20 — correção, achado do Codex, 9ª revisão do PR #274) | `facts[]`/`commitments[].scheduled_at` | OPPORTUNITY_STATE | idem | idem | ANÁLISE/CLIENTE | idem | idem | **mista: a parcela em `facts[]` (kind `client.*`) herda 1x por conversa sem estado via seed, igual à linha #20; a parcela em `commitments[].scheduled_at` NÃO herda — correção (achado do Codex, 10ª revisão do PR #274): `durable-memory-seed.ts` exclui `commitments[]` explicitamente do seed** | MEDIUM | HIGH (ver #7) | não | ambos | ambos | decidir ownership |
| 28 | decision maker / influencers | Customer Memory | **cycle + conversation_key** (idem #20 — correção, achado do Codex, 9ª revisão do PR #274) | **Correção (achado do Codex, 10ª revisão do PR #274) — não existe projeção canônica.** `client.decision_criterion` (`CLIENT_COMMERCIAL_FACT_KINDS`) representa o *critério* de decisão, não a *identidade* de quem decide — são conceitos distintos. A única menção a "decision maker" na taxonomia é como tópico de `COMMERCIAL_READING_MISSING_DISCOVERY_TOPICS` (`commercial-reading-contract.ts:172`, `'decision_maker'`) — ou seja, existe só como marcador de "ainda não sabemos quem decide" (`client.missing_discovery.decision_maker`), não como fato estruturado quando a resposta é conhecida. | **MISSING** (identidade do decisor) / DERIVED (só como `missing_discovery` enquanto desconhecido) — não idem #20 | n/a (sem campo estruturado) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | não | nenhum | Customer Memory (16.3) | **criar categoria estruturada para identidade do decisor (distinta de `decision_criterion`)** |
| 29 | objection | Customer Memory/Opportunity | **cycle + conversation_key** (idem #20 — correção, achado do Codex, 9ª revisão do PR #274) | `objections[]` | OPPORTUNITY_STATE | idem | idem | CLIENTE (histórico) / ANÁLISE (risco) | idem | idem | idem | MEDIUM | LOW | não | ambos | ambos | reutilizar |
| 30 | competitor | Customer Memory | **cycle + conversation_key** (idem #20 — correção, achado do Codex, 9ª revisão do PR #274) | `client.competitor.{named,unnamed}` | idem #20 | idem | idem | CLIENTE | idem | idem | idem | MEDIUM | LOW | não | CLIENTE | Customer Memory | idem #20 |
| 31 | open question | Opportunity | **cycle + conversation_key** (idem #20 — correção, achado do Codex, 9ª revisão do PR #274) | `open_loops[]` | idem #4 | idem | idem | ANÁLISE/CLIENTE | idem | idem | **até `resolve`/`supersede` DENTRO do ciclo/conversa; SEM herança cross-cycle — correção (achado do Codex, 10ª revisão do PR #274): `durable-memory-seed.ts` exclui `open_loops[]` explicitamente do seed** | MEDIUM | LOW | não | ambos | ambos | reutilizar |
| 32 | uncertainty | Opportunity | **cycle + conversation_key** (idem #20 — correção, achado do Codex, 9ª revisão do PR #274) | `uncertainties[]` (incl. `missing_discovery.<topic>`) | OPPORTUNITY_STATE | idem | idem | ANÁLISE/CLIENTE ("Ainda não sabemos") | idem | idem | **até `resolve`/`supersede` DENTRO do ciclo/conversa; SEM herança cross-cycle — correção (achado do Codex, 10ª revisão do PR #274): `durable-memory-seed.ts` exclui `uncertainties[]` explicitamente do seed** | MEDIUM | LOW | não | ambos | ambos | reutilizar |
| 33 | seller strength | Seller Coaching | turno | `CommercialReadingSellerStrength[]` | DERIVED (sem persistência legível) | só audit log (`normalized_output`) | `stateful-communication-executor.ts` | ANÁLISE | company_id+cycle_id+conversation_key+candidate_state_version (mesma correção da linha #2) | `evidence_message_ids` (no output) | recalculado por turno, sem histórico legível | **HIGH** | — | não | ANÁLISE | Seller Coaching (16.3) | **decidir persistência** |
| 34 | seller mistake / improvement | Seller Coaching | turno | **Correção (achado do Codex, 1ª revisão do PR #274):** `CommercialReading.improvement_points: CommercialReadingImprovementPoint[]` (`commercial-reading-contract.ts:506,620`), com campos `impact`/`how_to_improve` — não `CommercialReadingRecoveryGuidance` (essa é exclusiva de `method.recovery_guidance`, só quando aderência é `off_method`). | DERIVED (sem persistência legível) | só audit log (`normalized_output`) | `stateful-communication-executor.ts` | ANÁLISE (lido de volta via `buildSellerResult()` por job, ver §16) | company_id+cycle_id+conversation_key+candidate_state_version (mesma correção da linha #2) | `evidence_message_ids`/`memory_ids` (exigidos pelo normalizador) | recalculado por turno, sem histórico agregável | HIGH | — | não | ANÁLISE | Seller Coaching (16.3) | idem #33 |
| 35 | method recovery guidance | Method State | turno | `CommercialReadingRecoveryGuidance` (`method.recovery_guidance`) — só presente quando `method.adherence.status === 'off_method'`, não é o campo geral de erro/melhoria do vendedor (ver correção da linha 34). | DERIVED | idem (só audit log) | idem | ANÁLISE | idem | idem | idem | HIGH | — | não | ANÁLISE | Method State | idem #19 |
| 36 | communication preference / observed behavior | Customer Memory | **cycle + conversation_key** (idem #20 — correção, achado do Codex, 9ª revisão do PR #274), com herança degradada 1x por conversa nova (ver #37) | `client.communication.{event,explicit_preference,pattern}` | idem #20 | idem | idem, validado por `validateClientCommercialState`/anti-perfil-psicológico | CLIENTE | idem | idem | idem | MEDIUM | LOW | não | CLIENTE | Customer Memory | idem #20 |
| 37 | historical customer facts | Customer Memory | **não é lead-scoped nem uma vez por ciclo — correção (achado do Codex, 8ª revisão do PR #274):** para cada `conversation_key` sem estado (`stateRead.mode === 'missing'`), o loader busca **uma única linha** do ciclo anterior (`ORDER BY persisted_at DESC LIMIT 1`, sem filtrar por `conversation_key` do lado de origem) e `applyDurableMemorySeedToFreshState()` a copia para o estado daquela conversa específica. Em ciclos com múltiplas conversas, o seed pode ser aplicado várias vezes (uma por conversa nova), sempre a partir da mesma linha de origem arbitrariamente mais recente — não é um perfil único do lead. | `durable-memory-seed.ts` (seed do ciclo anterior, aplicado por conversa) | DURABLE_MEMORY | derivado de `companion_commercial_states` do ciclo anterior — não é tabela própria | `stateful-copilot-engine.ts` (aplica 1x por conversa nova sem estado, não 1x por ciclo) | CLIENTE (conversa nova) | company_id+lead_id (busca da origem **só no fallback, quando `origin_cycle_id` é nulo**; quando preenchido, a busca usa `origin_cycle_id` diretamente sem checar `lead_id` — ver §8, achado do Codex, 10ª revisão do PR #274); company_id+cycle_id+**conversation_key** (destino, por conversa) | `evidence_message_ids: []` (perdida na herança) | 1 cópia degradada por conversa nova; não se atualiza depois; a mesma linha de origem pode ser copiada para várias conversas do ciclo novo | **HIGH** | LOW | **sim, é a própria duplicação estrutural — inclusive entre conversas do mesmo ciclo novo** | CLIENTE | Customer Memory canônica (16.3) | **consolidar — hoje é cópia fragmentada por conversa, não perfil vivo do lead; validar `lead_id` no caminho `origin_cycle_id` antes de promover a fonte lead-scoped** |
| 38 | relationship history (primeiro contato, duração, timeline H2) | Customer Memory | cycle/conversa carregada (não lead inteiro) | **Correção (achado do Codex, 3ª e 4ª revisões do PR #274) — não é MISSING/[Unverified].** `app/lib/server/companion-client-context-loader.ts::loadCompanionClientContext()` já lê mensagens (filtradas por conversa) + `loadCycleEvents()` (eventos do ciclo inteiro, ex.: mudança de etapa/próxima ação/fechamento/registro de conversa) + `loadActionEvents()` (`companion_action_events`, ver linha #39, também por ciclo inteiro) + status do ciclo para o escopo atual; `computeCompanionClientRelationship()` produz `first_known_interaction_at`, duração, últimas interações e contagem; `buildCompanionClientTimeline()` monta a timeline a partir de **três** fontes — mensagens, `cycle_events` e `companion_action_events` — não duas. | DERIVED (read-model, não tabela própria) | nenhuma (recalculado a cada request) | n/a (leitura) | `loadCompanionClientContext()` → CLIENTE | **company_id+cycle_id+conversation_key** (correção, achado do Codex, 8ª revisão do PR #274: `loadCompanionClientContext()` recebe/devolve `conversation_key`, e `loadMessages()` filtra por essa chave antes de calcular primeiro contato/duração/contagem — duas conversas do mesmo ciclo têm identidades e resultados distintos, não a mesma leitura; `cycle_events`/ações permanecem cycle-scoped, não por conversa) | herda evidência do Message Ledger (mensagens reais, escopo conversa) + `cycle_events`/`companion_action_events` (eventos reais, escopo ciclo inteiro) | recalculado por request | LOW | LOW | não | CLIENTE | Customer Memory/telemetria | **reutilizar — já existe; limitação real: cobre só o ciclo/conversa carregado, não agrega histórico entre múltiplos ciclos do mesmo lead; mensagens são filtradas por conversa, `cycle_events`/ações por ciclo inteiro** |
| 39 | Yolen action history (sugestão mostrada/copiada/enviada) | Operational | cycle (consulta) / **company (idempotência real)** | **Correção (achado do Codex, 1ª e 5ª revisões do PR #274) — NÃO é MISSING.** Tabela `companion_action_events` (migrations `20260818140000_create_companion_action_events.sql`, `..._refine_companion_action_events.sql` ×2). Escrita via `app/lib/companion/action-events-route-handler.ts` → RPC `rpc_record_companion_action_event` (eventos como `suggestion_shown`/`suggestion_copied`/`suggestion_sent`). Lida via `app/lib/server/companion-client-context-loader.ts::loadActionEvents()` → RPC `rpc_list_companion_action_events`, por ciclo, para a timeline de CLIENTE. | CANONICAL | `companion_action_events` | `action-events-route-handler.ts` (`rpc_record_companion_action_event`) | `companion-client-context-loader.ts::loadActionEvents()` (`rpc_list_companion_action_events`) | **`company_id+cycle_id` é só o escopo de consulta; a chave idempotente real é `(company_id, idempotency_key)`** (índice `companion_action_events_idempotency_uidx`, `ON CONFLICT` de `rpc_record_companion_action_event`) — vale **entre ciclos**, não só dentro de um; `cycle_id` é atributo/FK, não parte da identidade do evento | `[Unverified]` (nível de evidência por evento não confirmado nesta rodada) | append-only por evento | LOW | **MEDIUM** — reusar `company_id+cycle_id` como chave de dedup/migração trataria dois eventos do mesmo ciclo como equivalentes ou ignoraria colisões cross-cycle | não | CLIENTE (timeline) | Customer Memory/telemetria | **reutilizar — já existe, não recriar; usar `(company_id, idempotency_key)` para dedup/migração, não `(company_id, cycle_id)`** |
| 40 | products | Commercial Config | company | `products` table + `company_commercial_product_profiles` | CONFIG_SOURCE | Supabase | admin UI | diagnostic-input, prompts | company_id | n/a | até edição admin | LOW | LOW | não | Companion, dashboard | idem | reutilizar |
| 41 | commercial facts (config) | Commercial Config | company | `company_commercial_facts` (v1 legado + v2 `commercial_fact_contract_version`/`commercial_fact_definition`) | CONFIG_SOURCE | Supabase | admin UI | diagnostic-input | company_id | n/a | até edição | LOW | LOW | **sim — v1 e v2 coexistem sem migração** | Companion | idem | **consolidar v1→v2** |
| 42 | allowed claims | Commercial Config | company/produto | `company_commercial_product_profiles.allowed_claims`/`forbidden_claims` | CONFIG_SOURCE | Supabase | admin UI | prompts | company_id+product_id | n/a | até edição | LOW | LOW | não | Companion | idem | reutilizar |
| 43 | current CRM state | CRM | lead/cycle | `leads`/`sales_cycles` | CANONICAL | Supabase | dashboard | Companion (leitura), dashboard | company_id+lead_id/cycle_id | n/a | até edição humana | LOW | LOW | não | ambos | ambos | reutilizar |
| 44 | suggested CRM state | Operational (sugestão) | turno | `CommercialReadingCrmSuggestion` (`requires_human_confirmation: true` — tipo TS literal) | DERIVED | só audit log | modelo | ANÁLISE (exibição) | company_id+cycle_id+conversation_key+candidate_state_version (mesma correção da linha #2) | `[Unverified]` | por turno | HIGH | — | não | ANÁLISE | AGORA/Decision State | reutilizar (nunca auto-aplicar) |
| 45 | operational signal | Operational | cycle (não sessão) | `signals[]` (`StatefulCommercialState`). **Correção (achado do Codex, 6ª revisão do PR #274):** `reduceStatefulCommercialState()` carrega `previousState.signals`, fecha só os ids em `signal_ids_to_resolve` e acrescenta `signals_to_add` — o mesmo padrão aditivo de `needs`/`objections`/`open_loops`. Um sinal sobrevive a vários turnos até ser resolvido; não é recalculado do zero a cada turno. | **OPPORTUNITY_STATE** (armazenamento e semântica — não SESSION_STATE) | `companion_commercial_states` | reducer (`appendObservedItems`/`closeMemoryItems`) | AGORA | company_id+cycle_id+conversation_key (mesma correção da linha #20) | `evidence_message_ids` | **até `resolve`** (não "por turno") | MEDIUM | LOW | não | AGORA | Operational Signals | reutilizar |
| 46 | recommended next action | Opportunity | turno | `current_priority` / `CommercialReadingCrmSuggestion`/`AgendaSuggestion` | mistura DERIVED/OPPORTUNITY_STATE | ver #13/#44 | ver #13/#44 | AGORA | idem | idem | idem | MEDIUM-HIGH | — | **sim — 3 fontes concorrentes de "próxima ação"** | AGORA | Decision State | consolidar |
| 47 | Decision State | — | — | não existe objeto/contrato real hoje | **MISSING** | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | AGORA (16.1) | **MISSING — TO BE CREATED IN 16.3/16.5** |
| 48 | Communication Context | — | — | não existe objeto canônico compartilhado; o MIE monta seu próprio contexto | **MISSING**/DERIVED (MIE-specific) | n/a | `message-intelligence-source-loader.ts` monta ad-hoc | MIE (shadow, não seller-facing) | n/a | n/a | n/a | n/a | n/a | n/a | MENSAGEM (16.1, fora de escopo ainda) | **MISSING — TO BE CREATED IN 16.3+** |
| 49 | message suggestion | Communication | turno | `communication_output` (`stateful-copilot-runtime-orchestrator.ts`) | DERIVED | só audit log | modelo | Companion UI | company_id+cycle_id+conversation_key+candidate_state_version (mesma correção da linha #2) | `[Unverified]` | por turno | HIGH | — | não | UI | MENSAGEM | reutilizar |
| 50 | silence decision | Communication | turno | **Correção (achado do Codex, 6ª revisão do PR #274):** campo booleano explícito `intervention_needed` em `StatefulCommunicationOutput` (`stateful-communication-executor.ts:396-405`) — não a ausência implícita de `communication_output`/`suggested_message`. `stateful-copilot-persistence-plan.ts` persiste o `communication_output` inteiro dentro de `companion_commercial_state_events.normalized_output` mesmo quando `suggested_message` é `null`. Ausência de `communication_output` no payload pode significar execução bloqueada/falha, não silêncio deliberado. | DERIVED, mas **persistido** (audit log) | `companion_commercial_state_events.normalized_output` | modelo, por turno (`stateful-communication-executor.ts`) | UI | **`company_id+cycle_id+conversation_key+candidate_state_version`** (mesma correção da linha #2 — este valor vive no mesmo evento de audit log, identificado pelas 4 chaves, não só `company_id+cycle_id`) | `[Unverified]` | por turno, mas com registro persistido | LOW | LOW | não | UI | MENSAGEM | reutilizar — usar `intervention_needed`, não a ausência de saída |

---

## 6. Source graph

```
conversation_messages (Message Ledger, Supabase)
  ├─ written by rpc_ingest_companion_messages
  │    ← app/api/companion/capture/messages/route.ts (verifyCompanionRequestToken → normalizeCaptureIngestionEnvelope)
  ├─ read by loadCanonicalLedgerAtReferenceTime → buildCanonicalLedger
  │    (stateful-copilot-real-context-loader.ts)
  │    → selectStatefulDiagnosticMessages → diagnostic-input.ts → stateful-copilot-input.ts
  ├─ read by message-intelligence-source-loader.ts::loadConversationContext
  │    (reusa as mesmas primitivas — "não duplica nenhuma fonte de verdade", comentário do código)
  └─ cursor de ingestão: conversation_capture_state (company_id, conversation_key, device_key)

companion_commercial_states (StatefulCommercialState, opportunity-scoped)
  ├─ written by rpc_persist_stateful_copilot_state (CAS + idempotente via operation_key)
  │    ← stateful-copilot-supabase-writer.ts ← stateful-copilot-persistence-executor.ts
  │    ← stateful-copilot-engine.ts (reduceStatefulCommercialState, puro, in-memory)
  ├─ read by stateful-copilot-supabase-reader.ts, stateful-copilot-real-context-loader.ts
  ├─ read by client-commercial-intelligence-contract.ts::buildCommercialReadingCustomerFromState (projeta → CLIENTE)
  ├─ audit log espelhado em companion_commercial_state_events (append-only, RLS service_role only)
  └─ fallback for: durable-memory-seed.ts (só quando state atual === null)
       → usa sales_cycles.origin_cycle_id se preenchido (SEM checar lead_id — achado do Codex,
         10ª revisão do PR #274, ver §8), senão busca o ciclo anterior mais recente do mesmo lead
       → companion_commercial_states desse ciclo anterior (query também sem checar lead_id)
       → filtra facts client.* + objections ativas → injeta como seed degradado no 1º turno do novo ciclo

commercial-reading-contract.ts (tipo + normalizador)
  ├─ produzido por stateful-communication-executor.ts::normalizeCommercialReadingOutput
  ├─ persistido apenas dentro de companion_commercial_state_events.normalized_output (log de job, não tabela própria)
  ├─ lido de volta apenas por companion-analysis-job-reader.ts (chave exata do job, não "leitura atual do lead")
  └─ loadCommercialReading() (message-intelligence-source-loader.ts) → SEMPRE null (hardcoded, comentário explícito)

message-intelligence-source-loader.ts (MIE, shadow, não seller-facing)
  ├─ loadScope → loadStatefulCopilotCanonicalScope
  ├─ loadCommercialContext → loadCommercialConfig (fallback explícito: 'missing')
  ├─ loadConversationContext → ledger (ver acima)
  ├─ loadStateRead → companion_commercial_states (pode ser 'missing')
  ├─ loadDurableMemory → só roda se loadStateRead.mode === 'missing'
  └─ loadCommercialReading → sempre null

companion_lead_conversation_summaries (resumo canônico do lead, lead-scoped)
  ├─ written by rpc_save_companion_lead_conversation_summary (só ação explícita do vendedor)
  └─ read by app/api/companion/lead-summary/route.ts::composeWorkingSummary
       (combina com companion_conversation_registrations + ai_coaching_notes legado + mensagens novas)
       → working_summary (efêmero, NÃO persistido, recalculado a cada POST)
       → renderizado por companion-lead-summary-view.js (extensão, só exibição)
       → consumido por app/api/companion/method-guidance/route.ts (parâmetro working_summary)

companion_method_stage_state (estágio de método, superfície AGORA)
  ├─ written/read by companion-method-stage-store.ts (gate anti-regressão, só último valor)
  └─ DIVERGENTE de: method.current_stage (superfície ANÁLISE — não method.adherence,
       campo distinto de status/aderência), calculado por stateful-communication-executor.ts,
       sem persistência própria — divergência documentada no próprio comentário do código-fonte

company_commercial_config_versions (Commercial Config, company-scoped, versionado)
  ├─ written by admin UI (app/admin/configuracao-comercial/*) via commercial-config.ts
  ├─ read by diagnostic-input.ts, stateful-copilot-real-context-loader.ts, method-guidance/route.ts
  └─ filhas: company_commercial_product_profiles, company_commercial_facts (v1+v2), company_commercial_objection_guides, company_commercial_method_steps

leads / sales_cycles (CRM, canônico)
  ├─ written by dashboard (app/leads/*, app/sales-cycles/*)
  ├─ read by Companion (contexto de tenant/lead) e dashboard
  └─ NUNCA escrito automaticamente por sugestão de IA (CommercialReadingCrmSuggestion/AgendaSuggestion
       têm requires_human_confirmation: true como tipo TS literal; nenhum write path encontrado)
```

---

## 7. Persistence map

| Fonte | Tabela/objeto | Chave | Escopo | Writer | Reader | Retenção |
|---|---|---|---|---|---|---|
| Message Ledger | `conversation_messages` | identidade/versionamento real: `company_id, conversation_key, message_key, version` (índice `conversation_messages_identity_version_uidx`) — **`cycle_id` é atributo da linha, não parte da chave** (achado do Codex, 4ª revisão do PR #274) | mensagem (append-only por versão) | `rpc_ingest_companion_messages` | `stateful-copilot-real-context-loader.ts`, `message-intelligence-source-loader.ts` | indefinida (append-only, sem purge encontrado) |
| Cursor de ingestão | `conversation_capture_state` | `company_id, conversation_key, device_key` | dispositivo | rota de captura | rota de captura | até novo cursor |
| StatefulCommercialState | `companion_commercial_states` | `company_id, cycle_id, conversation_key` (unique) | ciclo | `rpc_persist_stateful_copilot_state` | vários (ver §6) | 1 linha viva por escopo (upsert) |
| Audit log de estado | `companion_commercial_state_events` | idem + `state_version`/`operation_key` | ciclo | mesma RPC (atômico com acima) | `companion-analysis-job-reader.ts` (só por job_id exato) | append-only, RLS `service_role` only |
| Job de análise em background | `companion_background_analysis_jobs` | `company_id, cycle_id, conversation_key, message_watermark` (unique) | ciclo | `route.ts` (analyze-conversation) | worker de background | até processado |
| Estágio de método (AGORA) | `companion_method_stage_state` | `company_id, cycle_id, conversation_key` | ciclo | `companion-method-stage-store.ts` | AGORA | 1 linha viva (upsert, sem histórico) |
| Resumo canônico do lead | `companion_lead_conversation_summaries` | `company_id, lead_id` | **lead** (única tabela realmente lead-scoped para memória de cliente) | ação explícita do vendedor | `lead-summary/route.ts` | versionado, sem expiração automática |
| Commercial Config | `company_commercial_config_versions` (+ filhas) | `company_id`, versão | company | admin UI | Companion (config), dashboard | versionado (draft/published/archived) |
| SLA rules | `sla_rules` (admin, Companion, Kanban/relatórios "for company") **e** `company_sla_rules` (só `report_sla_risk()`, sem writer conhecido — ver §11) | `company_id, status` | company | admin UI, via `rpc_upsert_company_sla_rules()` — que apesar do nome escreve em `sla_rules` | Companion (`loadSlaRule()`), admin, e `rpc_get_company_sla_rules_for_company()` — todos leem `sla_rules`, apesar dos nomes; só `report_sla_risk()` lê `company_sla_rules` | até reconfiguração |
| CRM | `leads`, `sales_cycles`, `pipelines`, `pipeline_stages` | `company_id, lead_id`/`cycle_id` | lead/cycle | dashboard | Companion (leitura), dashboard | indefinida |
| Inbound (site) | `company_lead_api_keys`, `company_site_lead_distribution` | `company_id` | company | integração de site | dashboard | indefinida |
| Ações da Yolen (telemetria) | `companion_action_events` | idempotência real: `(company_id, idempotency_key)` — `cycle_id` é só filtro/FK de consulta, não parte da chave | company (idempotência) / cycle (consulta) | `action-events-route-handler.ts` (`rpc_record_companion_action_event`) | `companion-client-context-loader.ts::loadActionEvents()` (CLIENTE) | append-only por evento |

---

## 8. Identity/isolation map

| Fonte | Chave de isolamento | Classificação | Evidência |
|---|---|---|---|
| `analyze-conversation` (auth/tenant) | `company_id` (token assinado) re-checado contra `company_memberships`/`sales_cycles.company_id` | **SAFE** | `route.ts:578-619` |
| Ownership de ciclo | `cycle_id` + `owner_user_id` vs. `sub` do token, gate de papel | **SAFE** | `route.ts:634-661` |
| Dedup de job em background | `(company_id, cycle_id, conversation_key, message_watermark)` unique | **SAFE** (dedup); `conversation_key` em si é opaco (ver abaixo) | `route.ts:790-847` |
| `conversation_messages` (identidade/versionamento) | `company_id, conversation_key, message_key, version` — **sem `cycle_id`** (índice `conversation_messages_identity_version_uidx`) | **AMBIGUOUS, com risco cross-cycle confirmado (achado do Codex, 4ª revisão do PR #274)** — `conversation_key` é string opaca fornecida pelo cliente, sem mapeamento canônico a um JID/telefone; e como `cycle_id` não faz parte da chave, se a mesma conversa continuar num novo ciclo comercial (`conversation_key` reaproveitado), identidade e versionamento de mensagem são **compartilhados entre os dois ciclos** — não isolados por ciclo, só por `company_id`+`conversation_key` | `20260730155903_create_conversation_messages_ledger.sql:78-84` |
| `device_key` (cursor) | UUID formato-validado | **WEAK-ish, mas format-enforced** — usado só para cursor, não para identidade de mensagem | mesma migração |
| Vínculo com lead no ledger | **DERIVED** — não há `lead_id` na tabela; obtido via `cycle_id → sales_cycles.lead_id → leads` (`cycle_id` é atributo da linha, lido no momento da consulta, não parte da chave de identidade) | **DERIVED** — correto hoje porque todo reader filtra por `cycle_id`/`company_id` na consulta, mas a identidade/versionamento da mensagem em si não carrega `cycle_id` — um reader futuro que use só `conversation_key` não seria isolado por ciclo nem por lead | `route.ts:663-694` |
| `companion_commercial_states` | `company_id, cycle_id, conversation_key` | **SAFE** — mas **não** a mesma composição de chave do ledger (achado do Codex, 4ª revisão): o ledger identifica mensagens por `company_id, conversation_key, message_key, version` (sem `cycle_id`), enquanto o estado é escopado por `company_id, cycle_id, conversation_key`. Os dois só coincidem se `conversation_key` nunca for reaproveitado entre ciclos. | `stateful-copilot-supabase-reader.ts:14-24` |
| RPC de ingestão (tenant/ownership) | `company_id` + `p_captured_by` (membership) + ownership de ciclo (`member` restrito ao próprio ciclo) | **SAFE** | migração de ingestão |
| MIE canonical scope | `company_id, cycle_id` (`loadStatefulCopilotCanonicalScope`) + `conversation_key` à parte | **SAFE**, com a mesma ressalva de `conversation_key` acima | `message-intelligence-source-loader.ts:67-92` |
| `companion_lead_conversation_summaries` | `company_id, lead_id` | **SAFE** | `companion-lead-summary-store.ts` |
| Durable memory seed | `company_id` + busca do `lead_id` do ciclo atual → ciclo anterior mais recente do mesmo lead **apenas no caminho de fallback** | **AMBIGUOUS, não SAFE — correção (achado do Codex, 10ª revisão do PR #274):** `loadDurableMemorySeedForMissingState()` (`stateful-copilot-real-context-loader.ts:2171-2254`) usa `originCycleId` (`sales_cycles.origin_cycle_id`) **diretamente**, sem validar `lead_id`, sempre que ele está preenchido e diferente do ciclo atual (linhas 2189-2195); o filtro por `lead_id` só roda no fallback, quando `originCycleId` é nulo (linhas 2196-2246). A query em `companion_commercial_states` (linhas 2256-2284) também filtra só por `company_id`+`cycle_id` (`priorCycleId`), sem checar `lead_id`. O único writer de `origin_cycle_id` encontrado (RPC de "successor cycle", `20260629040658_...sql:11479-11504`) sempre copia `lead_id` do ciclo de origem — então o caminho feliz é seguro hoje. Mas nem a FK (`sales_cycles(id)`, sem checar lead), nem o CHECK (só proíbe auto-referência), nem a RLS de UPDATE (`can_write_sales_cycle_strict`, que valida company/owner, não a relação entre `origin_cycle_id` e `lead_id`) impedem que um `UPDATE` direto de `sales_cycles.origin_cycle_id` (fora dessa RPC) aponte para um ciclo de **outro lead** da mesma empresa — nesse caso o seed copiaria memória durável entre leads distintos, sem detecção. | `stateful-copilot-real-context-loader.ts::loadDurableMemorySeedForMissingState`; `20260629040658_restore_simulator_metrics_rpc_shell.sql:791,1229,13191,14467` |

`[Inference]` Isolamento está ancorado corretamente em **`company_id` +
`cycle_id`** em todo o código percorrido — nenhum reader confia em
`conversation_key` isoladamente para escopo de tenant/lead. O único ponto
frágil é `conversation_key` em si não ter mapeamento server-side canônico
a um JID/telefone/lead — sua correção depende inteiramente do cliente
(extensão) calculá-lo de forma consistente.

---

## 9. Evidence/provenance map

| Fonte | Nível de evidência | Detalhe |
|---|---|---|
| `StatefulCommercialState` (facts/needs/objections/signals/uncertainties/open_loops/commitments) — **itens nativos do ciclo atual** | **FULL** | todo item carrega `evidence_message_ids: string[]`, verificado contra o ledger real na validação do reducer |
| `StatefulCommercialState` — **itens herdados via `durable-memory-seed.ts`** (subconjunto de `facts`/`objections` no primeiro turno de um novo ciclo) | **NONE (degradado)** — correção (achado do Codex, 5ª revisão do PR #274): esta linha do mapa não excluía essa exceção, embora as linhas #37 e §24 já a reconheçam | `applyDurableMemorySeedToFreshState()` (achado do Codex, 7ª revisão do PR #274: nome corrigido — a função real chama-se `ToFreshState`, não `ToCandidateState`) insere esses itens com `evidence_message_ids: []` — não têm evidência real, apenas herança degradada (mesma linha da tabela logo abaixo) |
| `current_moment`/`current_priority` | **FULL** | `evidence_message_ids` obrigatório na própria forma do tipo |
| `CommercialReading` (seller coaching, method adherence, crm/agenda suggestions) | **PARTIAL** — `[Unverified]` a extensão exata de `evidence_message_ids` em cada subtipo não foi 100% confirmada campo a campo nesta rodada, mas o contrato (`commercial-reading-contract.ts`) exige `evidence_message_ids`/`memory_ids` em claims normalizados | ver `normalizeCommercialReading` |
| `durable-memory-seed.ts` (fatos herdados) | **NONE (degradado)** | itens herdados recebem `evidence_message_ids: []` deliberadamente. **Correção (achado do Codex, 7ª revisão do PR #274):** não é que as mensagens antigas deixem de existir — `conversation_messages` é append-only e as linhas do ciclo/conversa anterior permanecem no banco com seu `cycle_id` original. `applyDurableMemorySeedToFreshState()` descarta deliberadamente os IDs na herança, e o normalizador do novo estado não aceita evidência fora da fotografia (snapshot) atual — é perda de ponteiro/escopo, não ausência de registro. Confiança é rebaixada (`degradeConfidenceForInheritance`). |
| Resumo canônico do lead (`companion_lead_conversation_summaries`) | **NONE** | prosa livre, sem referência por claim; só `last_message_watermark` para estar "atualizado", não para provar afirmações |
| `working_summary` (efêmero) | **PARTIAL (nível de fonte, não de claim)** | rótulo `working_summary_source` (`canonical`, `canonical_plus_conversation`, etc.) indica de onde veio, mas não há evidência por afirmação |
| Commercial Config (business_description, etc.) | **N/A** | é configuração, não uma afirmação sobre a conversa — não se aplica o conceito de evidência |
| CRM (`leads`/`sales_cycles`) | **N/A** | é verdade operacional editada por humano, não uma inferência a provar |

`[Inference]` `origin: 'current_conversation'` (terminologia usada na FASE
16.1) não é, por si só, evidência referenciável — o código real distingue
isso corretamente ao exigir `evidence_message_ids` (ponteiros reais) em
`StatefulCommercialState`, mas o resumo de lead e o `working_summary` não
têm o mesmo padrão.

---

## 10. Lifetime/freshness map

| Fonte | Freshness signal | Observação |
|---|---|---|
| `companion_commercial_states` | `state_version` (CAS), `updated_in_state_version`/`closed_in_state_version` por item | conflito detectado em duas camadas: reducer (`STALE_STATE_VERSION`) e RPC (`'conflict'` se a linha mudou entre leitura e escrita) |
| `conversation_messages` | `occurred_at` vs. `observed_at`, `version` por edição | dedup por conteúdo inalterado; leitura colapsa para a versão mais recente por `message_key` |
| `companion_method_stage_state` | `updated_at`, mas **sem histórico** | só o último valor — não é possível reconstruir a trajetória do estágio a partir desta tabela |
| `method.adherence` (ANÁLISE) | **nenhum** | recalculado do zero a cada turno, sem estado anterior — não há "tendência de aderência" reconstruível fora do log de auditoria bruto |
| Seller Coaching | **nenhum** | mesmo padrão — só existe como saída daquele turno |
| `durable-memory-seed.ts` | seed aplicado **uma vez** (gate `previousState === null`) | nunca reaplicado nos turnos seguintes do mesmo ciclo; se o ciclo 2 resolver um fato, isso não propaga de volta a lugar nenhum, e um ciclo 3 futuro herdaria do ciclo 2 (o mais recente), não de um agregado 1+2 |
| `companion_lead_conversation_summaries` | `last_message_watermark` | só usado para permitir a checagem de deriva no `working_summary`, não invalida o resumo automaticamente |
| `working_summary` | recalculado a cada POST | nunca persistido — sempre "fresco" no sentido de ser recém-computado, mas não auditável depois |
| Commercial Config | versão (`draft`/`published`/`archived`) | fresco por definição enquanto a versão publicada não mudar |
| SLA rules | nenhum versionamento encontrado além da linha atual | `[Unverified]` se há histórico de mudança de regra |

Um dado sem sinal de freshness (Seller Coaching, `method.adherence`,
`companion_method_stage_state` sem histórico) **não pode ser assumido
atual/consistente entre leituras diferentes** — cada leitura de ANÁLISE
pode, em princípio, computar algo diferente do que AGORA mostrou minutos
antes, porque não há um objeto persistido único que ambos leiam.

---

## 11. Duplicate-source map

| Semântica | Fontes concorrentes | Classificação |
|---|---|---|
| "Próxima ação"/agenda | (1) `sales_cycles.next_action`/`next_action_date` (CRM); (2) `StatefulCommercialState.commitments[]` (memória, escopada por `company_id+cycle_id+conversation_key` — correção, achado do Codex, 9ª revisão do PR #274); (3) `CommercialReadingAgendaSuggestion` (sugestão de IA, não persistida) | **DANGEROUS DUPLICATION** — três fontes, nenhuma deriva automaticamente da outra, nenhuma sincroniza com as demais |
| "Estágio atual" da oportunidade | (1) `sales_cycles.status`/`leads.current_stage_id` (CRM); (2) `companion_method_stage_state` (AGORA, persistido, anti-regressão); (3) `method.current_stage` (ANÁLISE, não persistido, recalculado por turno — não `method.adherence`, que é status/resumo de aderência, campo distinto) | **DANGEROUS DUPLICATION** — o próprio código documenta que (2) e (3) são "mecanismos diferentes, não coordenados" |
| Sensibilidade a preço / fatos de cliente | `facts[]` dentro de `companion_commercial_states` (escopado por `company_id+cycle_id+conversation_key`, não só `cycle_id` — correção, achado do Codex, 9ª revisão do PR #274) vs. a intenção conceitual de CLIENTE=PESSOA (deveria ser lead-scoped) | **DANGEROUS DUPLICATION estrutural** — não é duplicação de tabela, é conflação de escopo: o mesmo dado de pessoa é reiniciado por ciclo *e por conversa dentro do ciclo*, com uma cópia degradada (`durable-memory-seed.ts`) tentando compensar |
| Regras de SLA | `sla_rules` (admin, Companion, Kanban/relatórios "for company" — apesar dos nomes de RPC sugerirem `company_sla_rules`) vs. `company_sla_rules` (só `report_sla_risk()`, sem writer de aplicação encontrado) | **Correção final (achado do Codex, 5ª revisão do PR #274):** não há divergência entre admin e Companion — ambos usam `sla_rules`. A única fonte potencialmente desalinhada é `report_sla_risk()`, que lê a tabela separada `company_sla_rules`, aparentemente órfã (sem writer). Classificação: **DUPLICATED**, não mais "DANGEROUS" no sentido de admin vs. Companion — o risco real é `report_sla_risk()` mostrar dados de uma tabela que ninguém mais escreve. |
| Fatos comerciais de config | `company_commercial_facts` v1 (genérico `category`/`fact_key`/`fact_value`) vs. v2 (`commercial_fact_definition jsonb`) coexistindo sem migração automática | **SAFE PROJECTION, mas requer decisão** — não é perigosa hoje (ambas são lidas), mas é dívida técnica explícita |
| Resumo do cliente | `companion_lead_conversation_summaries` (canônico, lead-scoped, manual) vs. `working_summary` (efêmero, misto, automático) | **SAFE PROJECTION** — o efêmero é claramente derivado/temporário e nunca se apresenta como substituto do canônico, mas ambos podem divergir na tela em momentos diferentes |
| "Commercial Reading" | tipo/contrato elaborado (`commercial-reading-contract.ts`) vs. ausência de fonte real (`loadCommercialReading()` sempre `null`) | não é duplicação — é o oposto: **MISSING** apesar do contrato existir |

---

## 12. Contradiction map

| Par | Quem deveria vencer | Status de ownership |
|---|---|---|
| CRM stage (`sales_cycles.status`) vs. estágio inferido por IA (`companion_method_stage_state` / `method.current_stage`) | `[Inference]` CRM deveria ser a verdade operacional; o estágio de método é uma leitura de progresso *dentro* do método de vendas, um conceito relacionado mas não idêntico ao status do funil — **ownership ainda não definido** entre os dois "estágios de método" internos |
| Customer Memory (`facts[]`, escopado por `company_id+cycle_id+conversation_key` — correção, achado do Codex, 9ª revisão do PR #274) vs. nova mensagem recebida | Nova evidência explícita deveria atualizar/superar memória antiga — mecanismo existe (`*_ids_to_supersede`), mas só dentro da mesma conversa; entre conversas do mesmo ciclo e entre ciclos, o seed é uma cópia estática, não uma reconciliação | ownership definido *dentro* da conversa; **não definido** entre conversas do mesmo ciclo nem entre ciclos |
| Agenda commitment (`StatefulCommercialState.commitments`) vs. Agenda CRM (`sales_cycles.next_action`) | `[Inference]` Deveriam eventualmente ser a mesma verdade — hoje são independentes; nenhum evento sincroniza um a partir do outro | **ownership não definido** |
| Resumo de lead (`companion_lead_conversation_summaries`) vs. Message Ledger | Ledger é a fonte primária de evidência; o resumo é derivado e pode ficar desatualizado entre edições manuais | ownership definido (ledger vence), mas o resumo não se invalida automaticamente quando diverge |
| Opportunity Reading (`StatefulCommercialState`) vs. nova conversa (mensagens após o `state_version` atual) | O motor já resolve isso via `selectAnalysisMessageIds`/reducer — mensagens incrementais atualizam o estado | ownership definido e implementado |
| `CommercialReadingCrmSuggestion`/`AgendaSuggestion` vs. CRM real | Sugestão nunca deveria sobrescrever CRM sem confirmação humana | ownership definido no tipo (`requires_human_confirmation: true`), sem enforcement de runtime encontrado além da ausência de qualquer write path automático |

---

## 13. Current Moment sources

`StatefulCommercialState.current_moment` e `.current_priority`
(`app/lib/companion/stateful-commercial-state.ts`), candidatos computados
a cada turno pelo reducer a partir da janela de sessão de 4h (§3).
Persistidos dentro de `companion_commercial_states.state_snapshot`.

**Correção (achado do Codex, 2ª revisão do PR #274):** esses campos **não
mudam necessariamente a cada turno**. `stateful-copilot-engine.ts::
preservePreviousCommercialStateWhenClosed()` substitui o candidato pelo
valor do estado anterior sempre que `output.commercial_role !== 'buyer'`
ou a relevância comercial não é acionável — isso vale tanto para
`current_moment` quanto para `current_priority` (linha #13 da matriz,
"next step", também herda essa ressalva: seu lifetime não é "por turno"
incondicionalmente, e o stale risk correto é MEDIUM, não LOW). A
classificação continua mista — `OPPORTUNITY_STATE` (mecanismo de
persistência) com semântica `SESSION_STATE` (horizonte pretendido) — mas
o horizonte real inclui a possibilidade de um valor herdado de uma
interação comercial anterior, não só da sessão atual.

## 14. Opportunity Reading sources

`needs`, `objections`, `open_loops`, `uncertainties`, `commitments`,
`signals` dentro de `StatefulCommercialState` — todos `OPPORTUNITY_STATE`,
escopados por `(company_id, cycle_id, conversation_key)` — não apenas
`cycle_id` (correção, achado do Codex, 9ª revisão do PR #274, propagando a
correção já feita na linha #20/§1 para esta seção) —, aditivos com
fechamento explícito (`resolve`/`supersede`), evidência completa **para
itens nativos da conversa**. **Ressalva (achado do
Codex, 5ª e 6ª revisões do PR #274):** `objections` (e `facts`, ver linha
#37/§9) recebem exceção quando herdados via `durable-memory-seed.ts` —
`applyDurableMemorySeedToFreshState()` injeta objeções ativas
herdadas do ciclo/conversa anterior com `evidence_message_ids: []`, sem ponteiro
verificável; não é seguro tratar essas objeções herdadas como plenamente
fundamentadas. Complementado por `method.adherence`/`CommercialReading`
(seller coaching, sugestões de CRM/agenda) — estes últimos **sem
persistência legível**, apenas audit log.

## 15. Customer Memory sources

`facts[]` (subconjunto `client.*`) dentro do mesmo
`StatefulCommercialState`, escopado por `(company_id, cycle_id,
conversation_key)` — não apenas `cycle_id` (correção, achado do Codex, 9ª
revisão do PR #274) — ver achado crítico do §1/§12: a
única continuidade real entre ciclos e entre conversas do mesmo ciclo é
`durable-memory-seed.ts`, uma cópia pontual e degradada, não um perfil vivo. O resumo canônico do lead
(`companion_lead_conversation_summaries`) é a única estrutura
**verdadeiramente lead-scoped**, mas é prosa livre sem evidência por
claim, escrita apenas por ação manual do vendedor — não substitui um
modelo estruturado de fatos.

## 16. Seller Coaching sources

Sem read-model próprio. `CommercialReadingSellerStrength[]`,
`CommercialReadingImprovementPoint[]` (erros/melhorias — ver correção da
linha 34 do §5) e `CommercialReadingRecoveryGuidance` (recuperação de
método, só quando `off_method`) são recalculados a cada turno por
`stateful-communication-executor.ts` e persistidos apenas dentro de
`companion_commercial_state_events.normalized_output`.

**Correção (achado do Codex, 1ª revisão do PR #274):** dizer que esses
campos "nunca são lidos de volta" é impreciso. `app/lib/server/
companion-analysis-job-reader.ts::loadCompanionAnalysisJobStatus()` →
`buildSellerResult()` **lê `communication.commercial_reading` de volta**
(incluindo `seller_strengths`/`improvement_points`/`method.adherence`) e o
devolve ao Companion como resultado do job de análise — o vendedor vê
esse conteúdo. O que **não existe** é agregação/merge entre turnos: cada
leitura é o resultado de exatamente um job específico (por
`analysis_job_id`), não uma consulta "histórico de coaching deste
vendedor" ou "tendência de aderência ao longo do tempo". **Não é possível
hoje reconstruir um padrão histórico sem reprocessar múltiplos eventos de
auditoria manualmente** — mas o resultado de um turno individual é, sim,
lido de volta e exibido normalmente.

## 17. Method State sources

Ver achado crítico do §1: dois mecanismos divergentes e não coordenados —
`companion_method_stage_state` (persistido, gate anti-regressão, usado por
AGORA) vs. `CommercialReading.method.current_stage` derivado por turno
(usado por ANÁLISE, sem persistência — ver correção da linha #16,
achado do Codex, 6ª revisão do PR #274: o campo comparável a
`companion_method_stage_state` é `current_stage`, não `adherence` — este
último é status/resumo de aderência, um conceito relacionado mas
distinto de identidade de estágio). Configuração do método
(`CommercialMethodDefinition`, em `company_commercial_config_versions`)
é única e bem definida, company-scoped, versionada.

## 18. Operational sources

`computeCompanionClientWaiting()` (espera cliente/vendedor, puramente
derivado de timestamp+direção da última mensagem, sem persistência) e
`assessCompanionClientSla()` (risco de SLA, derivado de
`stage_entered_at`+regra configurada, sem persistência do resultado).
**Correção (achado do Codex, 1ª e 5ª revisões do PR #274):** a regra que
alimenta `assessCompanionClientSla()` no caminho real do Companion vem de
`app/lib/server/companion-client-context-loader.ts::loadSlaRule()`, que lê
`sla_rules` — a mesma tabela que o admin escreve (via
`rpc_upsert_company_sla_rules()`, que apesar do nome grava em `sla_rules`)
e que o Kanban/relatórios "for company" também leem
(`rpc_get_company_sla_rules_for_company()`). `company_sla_rules` é uma
tabela separada, lida só por `report_sla_risk()`, sem writer de aplicação
conhecido. Ver §11. Nenhum dos dois cálculos grava resultado de volta ao
banco — são puramente de leitura/exibição.

## 19. Commercial Config sources

`company_commercial_config_versions` + tabelas filhas (produtos,
fatos v1/v2, guias de objeção, etapas de método) — company-scoped,
versionado, escrito pelo admin, lido por `diagnostic-input.ts` e pela
cadeia stateful. Bem definido e sem ambiguidade de ownership.

## 20. CRM/Agenda/SLA/Inbound sources

Ver §11/§12 para as duplicações. CRM (`leads`/`sales_cycles`) é canônico e
nunca escrito automaticamente por IA (confirmado — nenhum write path
encontrado a partir de `CommercialReadingCrmSuggestion`/
`AgendaSuggestion`). Agenda tem 3 fontes não sincronizadas. **SLA tem 2
tabelas, mas não uma divergência admin-vs-Companion** (correção final,
achado do Codex, 5ª revisão do PR #274): admin, Companion e o Kanban/
relatórios "for company" leem/escrevem `sla_rules` (apesar dos nomes de
RPC sugerirem `company_sla_rules`); só a função SQL `report_sla_risk()`
lê a tabela separada `company_sla_rules`, que parece órfã (sem writer de
aplicação encontrado) — mais 2 eixos de cálculo independentes (SLA de
etapa vs. espera por mensagem). Inbound real existe só para captura de
site; **inbound via WhatsApp está `MISSING`** como fonte operacional
própria.

## 21. Commercial Reading audit

Ver §1 (executive summary) — **veredito: MISSING**. Detalhe completo:

1. Existe contrato TypeScript elaborado (`commercial-reading-contract.ts`,
   ~4400 linhas) com normalização/validação rigorosa de saída de modelo.
2. Existe objeto gerado — sim, uma vez por turno, por
   `stateful-communication-executor.ts`.
3. Existe objeto persistido — só como parte do log de auditoria de um job
   específico (`companion_commercial_state_events.normalized_output`),
   não como registro independente.
4. Onde — dentro do payload de análise em background, não em tabela
   própria.
5. Existe reader server-side — sim, mas só por chave exata de job
   (`companion-analysis-job-reader.ts`), não "leitura atual do lead X".
6. Existe writer server-side — sim, indiretamente (parte do
   `normalized_output` do pipeline stateful).
7. Existe fonte de verdade real — **não**, no sentido de um read-model
   canônico e consultável.
8. Existe apenas projection — em certo sentido sim: é o formato de saída
   de um job, não um estado consultável.
9. Existe apenas UI/client — não, mas o dashboard/extensão só o vê como
   parte da resposta daquele job específico.
10. Existe apenas working summary — não, é estruturado, mas inacessível
    fora do contexto do job que o gerou.
11. O MIE consegue carregar — **não**: `loadCommercialReading()` retorna
    `null` sempre.
12. `loadCommercialReading()` retorna dado real ou `null`? — **`null`,
    sempre, hardcoded.**
13. Por quê? — comentário no próprio código: "Nenhuma fonte canônica de
    Commercial Reading está disponível de forma segura para o worker de
    shadow validation nesta fase [...] PROIBIDO construir a partir de
    guidance_status/guidance_stage_name/guidance_next_step/
    working_summary/payload client-side."

Nota de arquitetura: `runtime-source-adapter.ts` declara a intenção de
reutilizar o `CommercialReading` do pipeline stateful
(`commercial_reading: { authority: 'CommercialReading já produzido pelo
pipeline stateful', reuse_status: 'runtime_injected' }`), mas o código
enviado não honra esse plano — foi deliberadamente hardcoded para `null`
por segurança, não por descuido.

## 22. MIE source-loader audit

`message-intelligence-source-loader.ts` monta 6 loaders para
`createMessageIntelligenceRuntimeSourceAdapterV1`:

1. `loadScope` — sem fallback, propaga erro se a resolução de escopo
   falhar a montante.
2. `loadCommercialContext` — fallback explícito (`commercial_config_status:
   'missing'`), nunca inventa configuração.
3. `loadConversationContext` — monta o diagnostic input a partir do
   ledger real; sem duplicar a fonte (comentário do próprio código).
4. `loadStateRead` — pode retornar `mode: 'missing'`.
5. `loadDurableMemory` — só executa quando `state_read.mode === 'missing'`
   ("estado presente é sempre a fonte de verdade", comentário do código).
6. `loadCommercialReading` — sempre `null` (ver §21).

Cadeia de fallback real: **StatefulCommercialState persistido → (só se
ausente) seed de durable memory → (sempre) Commercial Reading nulo.**
Commercial Reading não é "tentado primeiro e cai para outra coisa" — nunca
é tentado.

## 23. Lead/working summary audit

Dois artefatos distintos e frequentemente confundidos em comentários de
código (evidência de deriva entre módulos):

- **Canônico** (`companion_lead_conversation_summaries`, lead-scoped):
  prosa livre (até 8000 caracteres), versionado, `last_message_watermark`
  para detectar deriva, **sem evidência por claim**, salvo só por ação
  explícita do vendedor. Comentário do próprio arquivo confirma
  isolamento: "nenhuma dessas fontes alimenta este módulo"
  (`conversationAnalysis`/`deepAnalysisResult`/`suggested_message`/
  `current_state`/`commercial_relevance`).
- **Efêmero** (`working_summary`): gerado a cada `POST` em
  `lead-summary/route.ts` (`composeWorkingSummary`), via chamada LLM que
  mistura o resumo canônico + histórico de registros de conversa +
  `ai_coaching_notes` legado + mensagens novas desde o último watermark.
  **Nunca persistido.** Rótulo de proveniência a nível de fonte
  (`working_summary_source`), não por afirmação. Alimenta
  `method-guidance/route.ts` como parâmetro de entrada.
- Renderização: `companion-lead-summary-view.js` na extensão só formata e
  exibe — não gera nada.

`[Inference]` **Não é seguro usar nenhum dos dois diretamente como fonte
de Commercial Reading**: o canônico não tem evidência por claim nem
granularidade estruturada; o efêmero é prosa de LLM não reproduzível
idempotentemente, não auditável (não persistido) e mistura fontes
heterogêneas sem fundamentação por fato — exatamente o padrão que o
validador de `commercial-reading-contract.ts` foi construído para
rejeitar (exige `evidence_message_ids`/`memory_ids` em cada claim).

---

## 24. What is safe to reuse in 16.3

- `StatefulCommercialState` inteiro (Current Moment, Opportunity Reading,
  a maior parte de Customer Memory) — versionamento CAS, isolamento seguro
  por **`company_id`+`cycle_id`+`conversation_key`** (correção, achado do
  Codex, 8ª revisão do PR #274: um ciclo com duas conversas tem duas
  linhas de estado independentes — reutilizar por só empresa+ciclo pode
  misturar Current Moment, compromissos, sinais e Customer Memory entre
  conversas). **Ressalva (achado do Codex, 3ª revisão do
  PR #274):** nem todo item tem evidência completa — itens herdados via
  `durable-memory-seed.ts`/`applyDurableMemorySeedToFreshState()` (o
  seed do ciclo anterior, ver linha #37) têm `evidence_message_ids: []`
  deliberadamente. Reutilizar o estado inteiro como "fundamentado em
  evidência" sem excluir/qualificar esses itens herdados promoveria
  memória sem referência real a uma leitura canônica.
- Message Ledger (`conversation_messages`) e sua cadeia de leitura
  (`loadCanonicalLedgerAtReferenceTime`/`buildCanonicalLedger`) — robusto,
  já reutilizado por dois consumidores sem duplicar lógica.
- Commercial Config (`company_commercial_config_versions` + filhas) —
  bem definido, sem ambiguidade de ownership.
- CRM (`leads`/`sales_cycles`) como verdade operacional — nunca é
  sobrescrito automaticamente, seguro para leitura direta.
- `companion_method_stage_state` como base para o estágio de método
  persistido (tem gate anti-regressão) — mas precisa de decisão de
  ownership frente a **`method.current_stage`** (correção, achado do
  Codex, 7ª revisão do PR #274 — não `method.adherence`, que é um campo
  de status/resumo distinto, derivado a partir da aderência, não uma
  fonte concorrente de identidade de estágio).
- O tipo/contrato `commercial-reading-contract.ts` em si (validação
  rigorosa) — reaproveitável como *shape* de saída, mesmo que a
  persistência precise ser criada do zero.

## 25. What must NOT become canonical

- `working_summary` efêmero — nunca deveria ser tratado como fonte de
  verdade (o próprio comentário do código de `loadCommercialReading()`
  já proíbe isso explicitamente).
- `companion_lead_conversation_summaries` como substituto de Customer
  Memory estruturada — é prosa manual, útil para o vendedor ler, não para
  um motor decidir fatos.
- Qualquer leitura de `conversation_key` sem `company_id`+`cycle_id`
  acompanhando — não é uma chave de isolamento segura sozinha.
- `company_sla_rules` como fonte de regra de SLA para qualquer coisa além
  de `report_sla_risk()` — correção final (achado do Codex, 5ª revisão do
  PR #274): admin, Companion e Kanban/relatórios "for company" **já usam
  `sla_rules`** (apesar dos nomes de RPC); `company_sla_rules` parece
  órfã, sem writer de aplicação conhecido (§11).
- `method.current_stage` isolado, sem reconciliação com
  `companion_method_stage_state`, como única fonte de "estágio atual"
  (correção, achado do Codex, 7ª revisão do PR #274 — o campo comparável
  é `current_stage`, não `adherence`).

## 26. Missing canonical sources

- **Commercial Reading** como read-model canônico, consultável por lead
  atual (não só por job específico) — `MISSING` (§21).
- **Decision State** — não existe objeto/contrato real hoje — `MISSING —
  TO BE CREATED IN 16.3/16.5`.
- **Communication Context** compartilhado — não existe; o MIE monta seu
  próprio contexto ad-hoc, e nada é canônico/compartilhável entre AGORA/
  ANÁLISE/CLIENTE/MENSAGEM — `MISSING — TO BE CREATED IN 16.3+`.
- **Customer Memory verdadeiramente lead-scoped e continuamente
  atualizada** — hoje só existe como cópia pontual entre ciclos
  (`durable-memory-seed.ts`) — `MISSING` como perfil vivo.
- **Persistência de Seller Coaching e de `method.adherence`** — hoje só
  audit log, não read-model — `MISSING`.
- **Inbound via WhatsApp** (first-contact-pending cross-canal) —
  `MISSING / FUTURE OPERATIONAL SOURCE`.

## 27. Required 16.3 architecture decisions

(Decisões a tomar na FASE 16.3 — não implementadas aqui.)

1. Escopo de Customer Memory: promover para `lead_id` nativo (com
   reconciliação entre ciclos) ou manter `cycle_id` com um mecanismo de
   herança melhor que a cópia pontual atual?
2. Ownership único de "próxima ação"/Agenda entre CRM, `commitments[]` e
   sugestão de IA.
3. Unificar os dois mecanismos de estágio de método (AGORA vs. ANÁLISE)
   em uma única fonte persistida.
4. Decidir se/como persistir Seller Coaching e `method.adherence` como
   read-model histórico, não só saída de turno.
5. Definir a composição real de "Commercial Reading" — reaproveitar o
   contrato de tipo existente, mas desenhar sua persistência e API de
   leitura (`getCommercialReadingForLead(leadId)` ou equivalente),
   respeitando a proibição atual de fontes client-side não seguras.
6. Definir Decision State e Communication Context como objetos
   compartilhados reais, não implícitos.
7. Migrar/aposentar `company_commercial_facts` v1 em favor de v2; **migrar
   `report_sla_risk()` para ler `sla_rules`** (não `company_sla_rules`) e
   confirmar/aposentar a tabela `company_sla_rules`, aparentemente órfã
   (§11) — admin, Companion e Kanban já convergem em `sla_rules`.
8. Decidir fonte de verdade para inbound via WhatsApp (hoje inexistente).
9. Ao desenhar Decision State, decidir onde `commercial_relevance`
   (hoje só em `companion_commercial_state_events.normalized_output`,
   não em `state_snapshot`) e um "intent" estruturado do turno atual
   devem viver — nenhum dos dois existe hoje como campo persistido e
   consultável fora do log de auditoria de um job específico.
10. Fechar a lacuna de validação de `lead_id` no caminho `origin_cycle_id`
    do durable memory seed (`loadDurableMemorySeedForMissingState()`,
    achado do Codex, 10ª revisão do PR #274, ver §8/linha #37) — hoje
    nem a FK, nem o CHECK, nem a RLS de `sales_cycles` impedem que
    `origin_cycle_id` aponte para um ciclo de outro lead da mesma
    empresa; o único writer conhecido (RPC de successor cycle) é
    seguro por construção, mas a leitura confia na coluna sem
    revalidar `lead_id`.
11. Criar categoria estruturada para `declared_budget`/sensibilidade a
    preço e para identidade do decisor (`decision_maker`, distinto de
    `decision_criterion`) na taxonomia `client.*` e na projeção CLIENTE
    — hoje ambos são descartados silenciosamente por
    `buildCommercialReadingCustomerFromState()` (achado do Codex, 10ª
    revisão do PR #274, ver linhas #26/#28).

## 28. Gate / conclusion

Ver seção "GATE" no relatório final abaixo.

---

**COMMERCIAL READING CURRENT STATUS: MISSING**

Justificativa: o contrato de tipo é elaborado e rigorosamente validado,
mas não há tabela, não há upsert, e não há query genérica de leitura em
lugar nenhum do código (confirmado via grep de migrations e de todo
`.from()` do repositório). O único lugar que produz um objeto
`CommercialReading` real o embute dentro da linha de evento de um job
assíncrono específico — um cache de resultado de job, não um read-model
de nível de lead. O sistema explicitamente desenhado para consumir
Commercial Reading como fonte canônica — o MIE Source Loader — tem seu
`loadCommercialReading()` hardcoded para `null`, com comentário no código
afirmando que nenhuma fonte segura existe e proibindo qualquer substituto
client-side. O que atualmente conduz as saídas
(`diagnostic-input.ts`/`stateful-copilot-input.ts`, o `working_summary`
efêmero) são todos substitutos derivados, efêmeros ou de prosa não
estruturada — nenhum satisfaz o contrato fundamentado em evidência que o
tipo exige.

**RECOMMENDED 16.3 SOURCE COMPOSITION** (proposta de composição, sem
implementação):

```
Commercial Reading (a criar) =
  projeção de leitura sobre StatefulCommercialState (Opportunity Reading + Customer Memory)
  + configuração comercial (Commercial Config)
  + estado de método reconciliado (fundir os dois mecanismos hoje divergentes)
  + persistência própria de Seller Coaching/method.adherence (hoje inexistente)
  — NUNCA a partir de working_summary/resumo de lead/payload client-side
```
