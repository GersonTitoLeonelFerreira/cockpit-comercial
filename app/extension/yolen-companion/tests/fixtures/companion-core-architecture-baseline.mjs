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

// FASE 7 — as 12 entradas herdadas (A2/A3/A5/A10 do ManyChat legado) foram
// removidas junto com suas causas: manychat-capture-bootstrap.js,
// manychat-seller-panel-runtime.js e manychat-contact-link-runtime.js
// deixaram de existir; o ManyChat usa o mesmo bootstrap/Core/controllers/
// views do WhatsApp. A baseline termina vazia.
export const LEGACY_ARCHITECTURE_BASELINE = Object.freeze([])
