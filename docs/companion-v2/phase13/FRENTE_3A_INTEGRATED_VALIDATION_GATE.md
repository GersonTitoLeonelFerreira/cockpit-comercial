# FASE 13 — FRENTE 3A — Validação integrada preparatória (AGORA + ANÁLISE + CLIENTE)

Auditoria + testes, sem competir com o PR #226 (Frente 2 — CLIENTE:
persistência de inteligência comercial). Nenhum dos quatro arquivos
pertencentes à Frente 2 foi alterado por esta frente:

- `app/extension/yolen-companion/src/content-script.js`
- `app/extension/yolen-companion/tests/b3-commercial-reading-ui.test.mjs`
- `app/extension/yolen-companion/tests/e3-dom/content-script-dom-client-commercial-intelligence-persistence.test.mjs`
- `app/extension/yolen-companion/tests/e3-test-support/load-content-script.mjs`

## Estado auditado

- `main` SHA: `1fa39e9b561d4c1179c5b7c1fa18106791814a9c` (PR #225 merged).
- Branch desta frente: `claude/fase13-frente3a-validacao-db2545`, criada
  diretamente sobre o SHA acima (`git merge-base --is-ancestor origin/main
  HEAD` confirma ancestralidade).
- PR #226 (Frente 2): `OPEN`/`DRAFT`, branch `claude/fase13-frente2-cliente`,
  HEAD `f1f1619348d6b43fd8fc3c541200d1f061611c8d`, base `main`
  (`1fa39e9b...`) — mesmo SHA auditado aqui.

## Arquitetura das três superfícies (auditoria de código, `main`)

Todas em `content-script.js`, delegando renderização pura para
`companion-seller-information-view.js` (AGORA/ANÁLISE/CLIENTE-comercial) e
`companion-client-context-view.js` (CLIENTE-relacionamento):

- **AGORA** — `getNowAttentionSnapshotHtml()` (~10340) + `getCompanionLeadSummaryCardHtml()`.
  Usa `getActiveCommercialReading()` (~5654) gateado por
  `!conversationAnalysisLoading && !isCurrentAnalysisOutdated() &&
  analysis_status === 'complete'`, e delega a decisão de qual alerta mostrar
  (no máximo um, o de maior prioridade) para
  `resolveSellerAttentionSnapshot()` em `companion-seller-information-view.js`
  (~1359), que combina a leitura comercial com `state.companionClientContext`
  (SLA/waiting) só quando este está `ready`.
- **ANÁLISE** — `getDetailedAnalysisAreaHtml()` (~10147). Mesmo gate
  (`getActiveCommercialReading()` + `!conversationAnalysisLoading &&
  !conversationAnalysisError && !isCurrentAnalysisOutdated()`), com estados
  DOM explícitos e mutuamente exclusivos: rico (`renderAnalysisArea`),
  loading (`data-yolen-analysis-loading`), erro
  (`data-yolen-analysis-error`), desatualizado
  (`data-yolen-analysis-outdated`), progressivo (V1 sem detalhe) e vazio.
- **CLIENTE** — `getClientInformationAreaHtml()` (~10255) = duas metades
  independentes concatenadas: `commercialHtml` (mesmo
  `getActiveCommercialReading()` + mesmo gate de AGORA/ANÁLISE — **em
  `main`, sem persistência própria**) e `relationshipHtml`
  (`getCompanionClientRelationshipCardHtml()`, buscado por
  `loadCompanionClientContextForCurrentCycle()`, com seu próprio guard de
  identidade `isStillCurrentContext()`). Estado vazio de nível superior
  (`data-yolen-client-empty`) só aparece quando NENHUMA das duas metades
  tem conteúdo.

`clearLeadStateForNewConversation()` (~4695) é o reset de troca real de
conversa: cancela todos os timers (debounce automático, poll profundo,
watchdog), zera `activeAnalysisAttempt`, `conversationAnalysis`,
`companionClientContext` e `companionLeadSummary`, e volta
`activeSellerArea` para `'now'`. A proteção contra respostas tardias
entre conversas é feita por uma guarda de identidade separada
(`shouldApplyConversationRegistrationResult`, comparando `cycleId` +
`conversationKey` capturados no início da requisição contra o estado
atual), não pelo reset em si — o que a torna válida mesmo quando a resposta
tardia chega bem depois do reset.

**Achado relevante para o próximo merge:** em `main` (pré-PR #226), a
metade comercial de CLIENTE usa **o mesmo** `getActiveCommercialReading()`
de ANÁLISE/AGORA, sem identidade própria (`cycle_id`/`company_id`) e sem
sobreviver a uma nova tentativa de análise em voo ou a uma falha — esse é
exatamente o defeito que o PR #226 corrige. Nenhuma mudança foi feita aqui;
os testes desta frente que dependem da correção estão listados como
`PENDING_AFTER_PR_226` abaixo.

## Matriz dos 16 cenários

| # | Cenário | Status (main, sem PR #226) | Evidência |
|---|---|---|---|
| 1 | Conversa comercial ativa, leitura completa | PASS | `content-script-dom-seller-information-architecture.test.mjs` ("V2 rico distribui..."); reforçado por `content-script-dom-integrated-seller-gate.test.mjs` (novo) |
| 2 | Conversa sem relevância comercial | PASS | `content-script-dom-seller-information-architecture.test.mjs` ("non-commercial neutraliza..."); `content-script-dom-deep-analysis-delivery.test.mjs` ("non_commercial atual preserva memória..."); `companion-seller-information-view.test.mjs` ("sessões non-commercial e uncertain...") |
| 3 | Objeção aberta | PASS | `companion-seller-information-view.test.mjs:304` ("objeção fica em CLIENTE e ANÁLISE mostra somente risco..."); prova end-to-end nova em `content-script-dom-integrated-seller-gate.test.mjs` |
| 4 | Cliente aguardando vendedor (SLA/waiting) | PASS | `content-script-dom-client-relationship.test.mjs` ("SLA configurado e estourado..."); `content-script-dom-client-relationship-live-refresh.test.mjs`; `companion-seller-information-view.test.mjs:489` |
| 5 | Vendedor aguardando cliente | PASS | `companion-seller-information-view.test.mjs:518` (unitário); prova end-to-end nova em `content-script-dom-integrated-seller-gate.test.mjs` |
| 6 | Análise profunda falha | PASS (AGORA/ANÁLISE) · PENDING_AFTER_PR_226 (persistência comercial de CLIENTE) | `content-script-dom-deep-analysis-delivery.test.mjs` ("failed: mostra falha..."). Relacionamento de CLIENTE continua funcional (fetch independente); a parte comercial de CLIENTE **hoje não persiste** através de uma falha — é exatamente o que o PR #226 entrega |
| 7 | Client-context falha | PASS | `content-script-dom-client-relationship.test.mjs` ("quando a busca do relacionamento falha..."); prova cross-surface nova em `content-script-dom-integrated-seller-gate.test.mjs` |
| 8 | A → B | PASS | `content-script-dom-stale-analysis-cross-conversation-race.test.mjs` (5/5), `content-script-dom-analysis-context-guard.test.mjs`, `content-script-dom-conversation-switch.test.mjs`, `content-script-dom-lead-create-conversation-isolation.test.mjs` |
| 9 | A → B → A | PASS | `content-script-dom-analysis-context-guard.test.mjs` ("A -> B -> C -> volta para A...") |
| 10 | Resultado tardio de A chega com B aberta | PASS | `content-script-dom-stale-analysis-cross-conversation-race.test.mjs`, `content-script-dom-analysis-request-lifecycle.test.mjs` ("A→B durante análise...") |
| 11 | Nova mensagem após análise válida | PASS | `content-script-dom-deep-analysis-delivery.test.mjs` ("mutação de mensagem enquanto poll está em voo invalida succeeded...") — `isCurrentAnalysisOutdated()` é o mesmo gate usado por AGORA/ANÁLISE/CLIENTE em `main` |
| 12 | Superseded job | PASS | `content-script-dom-deep-analysis-delivery.test.mjs` ("superseded: nunca aparece como resultado corrente") |
| 13 | Manual em voo + gatilho automático | PASS | `content-script-dom-analysis-request-lifecycle.test.mjs` ("análise automática já agendada não compete...", "manual iniciada durante automática em voo tem prioridade...") |
| 14 | Erro de rede temporário em polling | PASS (gap coberto nesta frente) | **Novo**: `content-script-dom-integrated-seller-gate.test.mjs` — nenhum teste pré-existente localizado exercitava especificamente uma rejeição isolada dentro de `runTick()` do poll profundo |
| 15 | Relacionamento vazio | PASS | Sub-card: `content-script-dom-client-relationship-live-refresh.test.mjs` (`emptyClientContext`). Estado vazio de nível superior (`data-yolen-client-empty`, gap coberto nesta frente): **novo**, `content-script-dom-integrated-seller-gate.test.mjs` |
| 16 | Sem mensagens suficientes / não inventar diagnóstico | PASS | `companion-seller-information-view.test.mjs` ("non-commercial e fallback V1 sem dados ricos nunca fabricam alerta", "not_configured e insufficient_evidence não inventam..."); `content-script-dom-deep-analysis-delivery.test.mjs` ("deep succeeded sem commercial_reading válido não é usado...") |

Nenhum cenário está `BLOCKED_BY_FRENTE_2` (nenhum defeito foi encontrado
nos 4 arquivos bloqueados que exigisse correção ali). O único acoplamento
real ao PR #226 é a persistência comercial de CLIENTE do cenário 6 —
estrutural, não um defeito descoberto nesta auditoria.

## Achado secundário (não bloqueante, fora do escopo desta frente)

`handleConversationActivityForAutomaticAnalysis()` (`content-script.js`,
~linha 4200) não tem nenhum call site em `content-script.js` — o gatilho
automático real é `observeWhatsAppChanges()` chamando
`scheduleAutomaticAnalysis()` diretamente. A função só é referenciada em
`tests/automatic-analysis-message-change.test.mjs`. Não é um defeito
funcional (nenhuma superfície depende dela), mas é código órfão.
Classificação: **P3** (melhoria futura / limpeza). Fora do escopo desta
frente corrigir — não está em nenhum dos 4 arquivos bloqueados, mas também
não é um problema desta auditoria (nenhum dos 16 cenários depende dela).

## Novo artefato de teste

`app/extension/yolen-companion/tests/e3-dom/content-script-dom-integrated-seller-gate.test.mjs`
(5 testes, todos usando só as capacidades já existentes do harness
`load-content-script.mjs` — nenhuma mudança no harness foi necessária):

1. AGORA/ANÁLISE/CLIENTE concordam sobre a mesma objeção sem se
   contradizer (prova end-to-end do que `companion-seller-information-view.test.mjs:304`
   já prova no nível de função pura).
2. Estado vazio de nível superior de CLIENTE (`data-yolen-client-empty`).
3. Um tick isolado de erro de rede no polling profundo não vira falha
   terminal.
4. "Vendedor aguardando cliente" nunca cria urgência artificial em AGORA.
5. Falha isolada de client-context não contamina ANÁLISE/AGORA nem apaga
   a inteligência comercial já válida em CLIENTE.

## Execução

```
node --conditions=react-server --import ./scripts/register-typescript-test-loader.mjs --test app/extension/yolen-companion/tests/*.test.mjs
→ 450/450 PASS

node --conditions=react-server --import ./scripts/register-typescript-test-loader.mjs --test --test-force-exit app/extension/yolen-companion/tests/e3-dom/*.test.mjs
→ 91/91 PASS (86 pré-existentes + 5 novos desta frente), 0 regressão
```

## Confirmações

- `AGORA_ISOLATION` = **PASS**
- `ANALYSIS_ISOLATION` = **PASS**
- `CLIENT_ISOLATION` = **PASS** (relacionamento, hoje) / **PENDING_AFTER_PR_226** (inteligência comercial com identidade própria — cycle/company)
- `STALE_PROTECTION` = **PASS**
- `SUPERSEDED_PROTECTION` = **PASS**
- `V2_ONLY` = **PASS** (nenhum caminho de runtime chama V1 quando `deep_analysis` está presente — comentários "V2 como único motor" em `content-script.js` ~13329/13714/13797, confirmado pelos testes de `deep-analysis-delivery`)
- `automatic_crm_write=false` / `automatic_agenda_write=false` = **PASS** (todo `operations.crm`/`operations.agenda` do contrato exige `requires_human_confirmation`; nenhuma escrita automática encontrada nos caminhos auditados)

## Status final

**READY_FOR_FINAL_GATE** para tudo que é independente do PR #226. O único
item pendente (`PENDING_AFTER_PR_226`) é a persistência comercial de
CLIENTE com identidade própria (cycle/company/conversation) — escopo
exclusivo da Frente 2. Após o merge do PR #226, esta mesma frente deve ser
reexecutada contra a nova `main` para validar especificamente essa parte.
