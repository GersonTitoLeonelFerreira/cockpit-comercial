# FASE 5 — REGISTRO DE EXECUÇÃO (inclui regularização da FASE 4)

Registro único de execução da FASE 5 do Plano Mestre de Reconstrução do
Companion Multicanal ("WhatsApp consumindo exclusivamente o Core"), com a
regularização das pendências reais da FASE 4. Se houver compactação de
contexto, a execução é retomada a partir deste arquivo.

## 1. Base efetiva

| Item | Valor |
|---|---|
| Repositório | `GersonTitoLeonelFerreira/cockpit-comercial` |
| `origin/main` no início | `0c95b7696775dd900ccdbf3eb9cc071155dd277a` (merge do PR #338) |
| PR #338 | mergeado; head `7a0717ec796b5f48bfedb525a178ace1e871e1ff`; base `cf50fac3ef85e4faa0f8ae4a0e2a5f4ac5780814` |
| Referência histórica | `b5d877a18843b5653c79adc2c5396447d2a99310` |
| Referência congelada | `claude/step-2b5-unified-companion-workspace @ 24f25c713b561cea977b16a0b0961b5642575ab2` (só comparação) |
| Branch de execução | `claude/companion-multichannel-repair`, criada a partir de `origin/main` |

## 2. Correção da declaração de conclusão da FASE 4

O PR #338 ("Phase 4: close Companion canonical core reconstruction") foi
mergeado declarando a FASE 4 concluída. Isso não correspondia ao objetivo
do Plano Mestre: o PR entregou peças úteis e aprovadas (fronteira de
conversa/empresa, `DomainResolutionViewModel`, `leadResolutionOutcome`,
gate Q2 do workspace, capabilities canônicas de ação, navegação canônica),
mas **não** extraiu o Core. No HEAD mergeado:

- `content-script.js` (17.027 linhas) continuava sendo o monólito
  plataforma + produto (A11 `monolithic-core-platform-runtime`):
  criação de lead, re-resolve, reset de conversa, elegibilidade de
  análise, renderização e orquestração de produto moravam ali;
- `companion-workspace-runtime.js` compartilha áreas/HTML do shell — por si
  só não constitui Core;
- controllers comerciais eram compostos por monkey-patch de
  `window.YolenCompanionApi` e de protótipos DOM (ver §4).

O histórico do PR é preservado. A regularização da FASE 4 é executada
neste mesmo trabalho, antes do aceite da FASE 5, sem criar fase nova.

## 3. Baseline na base efetiva (`0c95b769`)

Preenchido com os resultados reais (comando → exit code → resultado):

| Gate | Resultado na base |
|---|---|
| architecture gates | exit 0 — 53/53; NEW=0, STALE=0, LEGACY=26 (14 removalPhase 5, 12 removalPhase 7) |
| `node scripts/companion-known-failures-gate.mjs companion` | exit 0 — 9 falhas, todas conhecidas |
| `npm run test:companion-authorization` | exit 0 — 266/266 |
| E3 (`companion-known-failures-gate.mjs e3`) | (ver §7) |
| `tsc --noEmit` / `npm run lint` | (ver §7) |

## 4. Auditoria focal (antes das edições)

### 4.1 Composição real do WhatsApp (manifest `content_scripts[1]`)

`yolen-api → lead-resolution-runtime-cache → lead-summary-runtime-cache →
seller-message-runtime → ux8-interaction-consistency-runtime →
lead-summary-expand-state → message-mutations →
conversation-registration-tools → capture-batch → capture-resilience →
capture-resilience-null-base → lead-enrichment → views →
companion-reasoning-view → phase16-9-runtime-guard →
companion-conversation-boundary → companion-lead-resolution-controller →
companion-workspace-runtime → content-script → panel-stability-runtime →
editable-field-stability-runtime → lead-automation`

O harness E3 (`load-content-script.mjs`) **não** reproduzia essa composição:
omitia `lead-summary-runtime-cache`, `seller-message-runtime` (opcional),
`ux8-interaction-consistency-runtime`, `lead-summary-expand-state`,
`phase16-9-runtime-guard`, `panel-stability-runtime`,
`editable-field-stability-runtime`, `lead-automation` e carregava
`lead-method-guidance-runtime` (ausente de qualquer manifest). Além disso,
no vm do harness `globalThis !== window`, então os runtimes que
monkey-patcham `root.YolenCompanionApi` não se instalavam — o E3 testava
uma composição diferente de produção.

### 4.2 Composição por monkey-patch encontrada

| Mecanismo | Arquivo | Efeito |
|---|---|---|
| `api.resolveLead =` | `lead-resolution-runtime-cache`, `capture-resilience`, `panel-stability-runtime` | cache por identidade; retry; "resume cache" (este último nunca armazena: exige `payload.data`, que resolve-lead não devolve) |
| `api.analyzeConversation =` | `ux8-interaction-consistency-runtime`, `capture-resilience-null-base`, `phase16-9-runtime-guard` | três cópias do mesmo retry `RETRY_ANALYSIS_JOB` + promoção de resultado profundo |
| `api.getAnalysisJobStatus =` | `capture-resilience-null-base` | reconsulta autoritativa de `superseded` sintético |
| `api.loadLeadSummary =` | `lead-summary-runtime-cache`, `lead-method-guidance-runtime`, `seller-message-runtime` | cache + composição de método + sync do composer de mensagem |
| `api.saveLeadSummary/confirm.../preview.../ingestCapturedMessages =` | `lead-summary-runtime-cache`, `capture-resilience`, `capture-resilience-null-base` | invalidação de cache; rebase de captura |
| `Element.prototype.getAttribute` | `capture-resilience` | normaliza timestamp de `data-pre-plain-text` globalmente |
| `EventTarget.prototype.addEventListener` | `ux8-interaction-consistency-runtime` | captura o handler de "Analisar" para sobreviver a substituição de `innerHTML` |
| `innerHTML` do painel | `panel-stability-runtime`, `editable-field-stability-runtime` | intercepta renders para preservar scroll/foco |
| global `YolenCompanionSellerInformationView` sobrescrito | `companion-reasoning-view` | acrescenta raciocínio às views |
| nós sintéticos no DOM do WhatsApp | `phase16-9-runtime-guard`, `companion-reasoning-view` | materializam mensagens de anexo (Q6) |

### 4.3 Matriz de requisitos (FASE 4 + FASE 5)

| Requisito | Implementação no HEAD | Chamada real | Lacuna | Correção |
|---|---|---|---|---|
| Shell/lifecycle/área/sessão/composição | `content-script` + `companion-workspace-runtime` | `renderPanel` no monólito | dono é o monólito | Core (`companion-core`) + workspace |
| Resolução e ações de lead | `companion-lead-resolution-controller` (VM/outcome) + monólito | `resolveCurrentLead` no monólito | orquestração no monólito | controller de resolução no Core |
| Criação de lead | monólito (`createLeadForCurrentConversation`, `resolveAfterLeadCreation`) + `lead-automation` | monólito | sem controller | `companion-lead-creation-controller` |
| MENSAGEM | monólito + `seller-message-runtime` (mistura plataforma, A11) | monólito/runtime | composer + decisão misturados | `companion-message-controller` + composer no adapter |
| AGORA/ANÁLISE | monólito + 3 wrappers de API (A5) | monólito | política espalhada | `companion-analysis-controller` |
| CLIENTE/summary/registration/enrichment | monólito + wrappers (A6) | monólito | sem controllers | controllers dedicados |
| Adapter WhatsApp | inexistente | — | plataforma dentro do monólito | `whatsapp-adapter` |
| Q6 | nós sintéticos (2 mecanismos) | observers | escrita no DOM da plataforma | normalização em memória no adapter |

## 5. Regra operacional autorizada

Uma instrução autoriza iniciar e terminar a fase. Checkpoints técnicos de
~6 arquivos de produção ou ~500 linhas líquidas são pontos internos de
teste/revisão/commit, não fases nem entregas parciais.

## 6. Avanço interno

(atualizado a cada checkpoint)

## 7. Evidências finais

(preenchido no fechamento)
