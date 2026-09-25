// FASE 3 — ARCHITECTURE MIGRATION BASELINE (contrato v1.1.0, §30.1).
//
// Dívida arquitetural LEGADA herdada de b5d877, uma entrada por ocorrência
// concreta (gate + arquivo + símbolo/região), descoberta pelo scanner de
// companion-core-architecture-gates.test.mjs e conferida manualmente no
// código. Baseline NÃO é permissão:
//
// - nenhuma entrada nova pode ser adicionada para acomodar dívida nova;
// - quando uma fase remove a violação, a entrada sai no MESMO commit (o
//   teste falha com STALE_BASELINE se ela ficar);
// - uma entrada removida nunca volta;
// - ao fim da reconstrução esta lista precisa estar VAZIA.
//
// Toda alteração deste arquivo é auditada pelo Controle Mestre.

export const ARCHITECTURE_BASE_SHA = 'b5d877a18843b5653c79adc2c5396447d2a99310'

export const CONTRACT_VERSION = '1.1.0'

function entry(fields) {
  return Object.freeze({ introducedBeforeRebuild: true, ...fields })
}

export const LEGACY_ARCHITECTURE_BASELINE = Object.freeze([
  // A2 — adapter decidindo apresentação por status comercial.
  entry({
    id: 'A2:manychat-capture-bootstrap:status-copy-map:STATUS_LABELS',
    gate: 'A2',
    file: 'src/manychat-capture-bootstrap.js',
    symbol: 'status-copy-map:STATUS_LABELS',
    reason: 'Mapa status comercial → copy seller-facing (NOT_FOUND, OWNED_BY_OTHER, IN_POOL, CLOSED_CYCLE, ...) no bootstrap ManyChat.',
    removalPhase: '7',
  }),
  entry({
    id: 'A2:manychat-capture-bootstrap:status-render-decision:renderStatus',
    gate: 'A2',
    file: 'src/manychat-capture-bootstrap.js',
    symbol: 'status-render-decision:renderStatus',
    reason: 'renderStatus() decide o conteúdo do painel por resolution.ready/reason (CONTACT_NOT_LINKED → fluxo de vínculo, demais → rótulo).',
    removalPhase: '7',
  }),
  entry({
    id: 'A2:manychat-contact-link-runtime:status-copy-map:ERROR_MESSAGES',
    gate: 'A2',
    file: 'src/manychat-contact-link-runtime.js',
    symbol: 'status-copy-map:ERROR_MESSAGES',
    reason: 'Copy seller-facing própria para status comercial (SOFT_DELETED) no fluxo manual de vínculo ManyChat.',
    removalPhase: '7',
  }),

  // A3 — segunda autoridade das áreas seller-facing.
  entry({
    id: 'A3:manychat-seller-panel-runtime:seller-area-authority',
    gate: 'A3',
    file: 'src/manychat-seller-panel-runtime.js',
    symbol: 'seller-area-authority',
    reason: 'Composição própria de seções AGORA/ANÁLISE/CLIENTE (data-yolen-section) independente de SELLER_AREAS.',
    removalPhase: '7',
  }),

  // A5 — política de análise fora da autoridade única.
  entry({
    id: 'A5:capture-resilience-null-base:analysis-policy',
    gate: 'A5',
    file: 'src/capture-resilience-null-base.js',
    symbol: 'analysis-policy',
    reason: 'Monkey-patch de YolenCompanionApi.analyzeConversation/getAnalysisJobStatus (hotfix de frescor/superseded) no WhatsApp.',
    removalPhase: '5',
  }),
  entry({
    id: 'A5:manychat-seller-panel-runtime:analysis-policy',
    gate: 'A5',
    file: 'src/manychat-seller-panel-runtime.js',
    symbol: 'analysis-policy',
    reason: 'Polling/timeout próprios (ANALYSIS_POLL_DELAYS_MS/ANALYSIS_POLL_TIMEOUT_MS) e análise disparada por captura no ManyChat.',
    removalPhase: '7',
  }),
  entry({
    id: 'A5:phase16-9-runtime-guard:analysis-policy',
    gate: 'A5',
    file: 'src/phase16-9-runtime-guard.js',
    symbol: 'analysis-policy',
    reason: 'Monkey-patch de api.analyzeConversation (guard de retry manual) no WhatsApp.',
    removalPhase: '5',
  }),
  entry({
    id: 'A5:ux8-interaction-consistency-runtime:analysis-policy',
    gate: 'A5',
    file: 'src/ux8-interaction-consistency-runtime.js',
    symbol: 'analysis-policy',
    reason: 'Monkey-patch de YolenCompanionApi.analyzeConversation (retry seller-facing) no WhatsApp.',
    removalPhase: '5',
  }),

  // A6 — resumo do lead composto por monkey-patch fora do controller único.
  entry({
    id: 'A6:lead-method-guidance-runtime:lead-summary-controller',
    gate: 'A6',
    file: 'src/lead-method-guidance-runtime.js',
    symbol: 'lead-summary-controller',
    reason: 'Wrapper de api.loadLeadSummary (orientação de método); carregado só pelo harness, ausente do manifest.',
    removalPhase: '5',
  }),
  entry({
    id: 'A6:lead-summary-runtime-cache:lead-summary-controller',
    gate: 'A6',
    file: 'src/lead-summary-runtime-cache.js',
    symbol: 'lead-summary-controller',
    reason: 'Wrapper de api.loadLeadSummary/saveLeadSummary (cache e refresh pós-save) no WhatsApp.',
    removalPhase: '5',
  }),
  entry({
    id: 'A6:seller-message-runtime:lead-summary-controller',
    gate: 'A6',
    file: 'src/seller-message-runtime.js',
    symbol: 'lead-summary-controller',
    reason: 'Wrapper de api.loadLeadSummary para alimentar a MENSAGEM no WhatsApp.',
    removalPhase: '5',
  }),

  // A9 — harness de integração diverge da composição do manifest.
  entry({
    id: 'A9:load-content-script:extra:lead-method-guidance-runtime.js',
    gate: 'A9',
    file: 'src/lead-method-guidance-runtime.js',
    symbol: 'harness-loads-module-absent-from-manifest:load-content-script:not-in-any-manifest',
    reason: 'tests/e3-test-support/load-content-script.mjs carrega módulo que nenhum content_script do manifest carrega.',
    removalPhase: '5',
  }),
  entry({
    id: 'A9:load-content-script:missing:lead-summary-expand-state.js',
    gate: 'A9',
    file: 'src/lead-summary-expand-state.js',
    symbol: 'manifest-module-omitted-by-harness:load-content-script',
    reason: 'Manifest WhatsApp carrega o módulo; o harness de integração não.',
    removalPhase: '5',
  }),
  entry({
    id: 'A9:load-content-script:missing:lead-summary-runtime-cache.js',
    gate: 'A9',
    file: 'src/lead-summary-runtime-cache.js',
    symbol: 'manifest-module-omitted-by-harness:load-content-script',
    reason: 'Manifest WhatsApp carrega o módulo (monkey-patch de loadLeadSummary); o harness de integração não.',
    removalPhase: '5',
  }),
  entry({
    id: 'A9:load-content-script:missing:phase16-9-runtime-guard.js',
    gate: 'A9',
    file: 'src/phase16-9-runtime-guard.js',
    symbol: 'manifest-module-omitted-by-harness:load-content-script',
    reason: 'Manifest WhatsApp carrega o módulo (guard de retry e bolhas de anexo); o harness de integração não.',
    removalPhase: '5',
  }),
  entry({
    id: 'A9:load-content-script:missing:ux8-interaction-consistency-runtime.js',
    gate: 'A9',
    file: 'src/ux8-interaction-consistency-runtime.js',
    symbol: 'manifest-module-omitted-by-harness:load-content-script',
    reason: 'Manifest WhatsApp carrega o módulo (wrapper de analyzeConversation); o harness de integração não.',
    removalPhase: '5',
  }),

  // A10 — runtime seller-facing paralelo no ManyChat (por responsabilidade).
  entry({
    id: 'A10:manychat-capture-bootstrap:parallel-commercial-action',
    gate: 'A10',
    file: 'src/manychat-capture-bootstrap.js',
    symbol: 'parallel-commercial-action',
    reason: 'Bootstrap dispara applySuggestedMessage (ação comercial) diretamente.',
    removalPhase: '7',
  }),
  entry({
    id: 'A10:manychat-capture-bootstrap:seller-action-routing',
    gate: 'A10',
    file: 'src/manychat-capture-bootstrap.js',
    symbol: 'seller-action-routing',
    reason: 'Roteador de cliques seller-facing próprio (aplicar sugestão, fluxo de vínculo manual).',
    removalPhase: '7',
  }),
  entry({
    id: 'A10:manychat-contact-link-runtime:manual-link-ui',
    gate: 'A10',
    file: 'src/manychat-contact-link-runtime.js',
    symbol: 'manual-link-ui',
    reason: 'UI de vínculo manual CONTACT_NOT_LINKED → buscar → selecionar → confirmar (SEARCH_LINKABLE_LEADS/FIRST_LINK_EXTERNAL_IDENTITY).',
    removalPhase: '7',
  }),
  entry({
    id: 'A10:manychat-seller-panel-runtime:parallel-commercial-action',
    gate: 'A10',
    file: 'src/manychat-seller-panel-runtime.js',
    symbol: 'parallel-commercial-action',
    reason: 'Sugestão de mensagem (suggested_message) e aplicação no composer decididas no runtime ManyChat.',
    removalPhase: '7',
  }),
  entry({
    id: 'A10:manychat-seller-panel-runtime:parallel-commercial-render',
    gate: 'A10',
    file: 'src/manychat-seller-panel-runtime.js',
    symbol: 'parallel-commercial-render',
    reason: 'Renderer seller-facing paralelo (AGORA/ANÁLISE/CLIENTE + sugestão).',
    removalPhase: '7',
  }),
  entry({
    id: 'A10:manychat-seller-panel-runtime:parallel-seller-state',
    gate: 'A10',
    file: 'src/manychat-seller-panel-runtime.js',
    symbol: 'parallel-seller-state',
    reason: 'Estado seller-facing próprio por conversation_key (decisionState/analysisViewModel/customerViewModel/methodGuidance).',
    removalPhase: '7',
  }),
  entry({
    id: 'A10:manychat-seller-panel-runtime:parallel-view-model-loading',
    gate: 'A10',
    file: 'src/manychat-seller-panel-runtime.js',
    symbol: 'parallel-view-model-loading',
    reason: 'Carregadores próprios de LOAD_CLIENT_CONTEXT/LOAD_DECISION_STATE/LOAD_*_VIEW_MODEL/LOAD_METHOD_GUIDANCE.',
    removalPhase: '7',
  }),

  // A11 — WhatsApp misturando plataforma e Core seller-facing.
  entry({
    id: 'A11:companion-reasoning-view:mixed-core-platform-runtime',
    gate: 'A11',
    file: 'src/companion-reasoning-view.js',
    symbol: 'mixed-core-platform-runtime',
    reason: 'View seller-facing que também observa/lê o DOM do WhatsApp ([data-pre-plain-text], bolhas de anexo).',
    removalPhase: '5',
  }),
  entry({
    id: 'A11:seller-message-runtime:mixed-core-platform-runtime',
    gate: 'A11',
    file: 'src/seller-message-runtime.js',
    symbol: 'mixed-core-platform-runtime',
    reason: 'MENSAGEM seller-facing e composer físico do WhatsApp (#main/footer) no mesmo módulo.',
    removalPhase: '5',
  }),
])
