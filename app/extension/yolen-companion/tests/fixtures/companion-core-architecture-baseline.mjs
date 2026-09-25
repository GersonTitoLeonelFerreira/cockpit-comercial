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
    id: 'A5:manychat-seller-panel-runtime:analysis-policy',
    gate: 'A5',
    file: 'src/manychat-seller-panel-runtime.js',
    symbol: 'analysis-policy',
    reason: 'Polling/timeout próprios (ANALYSIS_POLL_DELAYS_MS/ANALYSIS_POLL_TIMEOUT_MS) e análise disparada por captura no ManyChat.',
    removalPhase: '7',
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
])
