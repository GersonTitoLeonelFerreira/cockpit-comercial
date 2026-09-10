import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const contentScript =
  readFileSync(
    new URL(
      '../src/content-script.js',
      import.meta.url,
    ),
    'utf8',
  )

function getBlock(
  startMarker,
  endMarker,
) {
  const start =
    contentScript.indexOf(
      startMarker,
    )

  const end =
    contentScript.indexOf(
      endMarker,
      start,
    )

  assert.notEqual(
    start,
    -1,
  )

  assert.notEqual(
    end,
    -1,
  )

  return contentScript.slice(
    start,
    end,
  )
}

// FASE 16.6 — getRichOperationalSuggestionHtml (o card HTML rico que
// lia should_change_crm_stage/should_change_agenda diretamente) foi
// removido por ser código morto (zero chamadores reais desde a
// recalibração de AGORA na FASE 16.5 — era exclusivo da cadeia
// getRichCommercialReadingCardHtml, já confirmada ausente em
// b3-commercial-reading-ui.test.mjs). Os mesmos campos do contrato A4
// (should_change_crm_stage/recommended_status/should_change_agenda/
// expected_next_action_at/requires_human_confirmation) continuam
// vivos em dois lugares distintos: a checagem de "existe mudança
// operacional?" (hasRichCommercialReadingOperationalChange, coberta em
// b3-commercial-reading-ui.test.mjs) e o texto de confirmação humana
// antes de aplicar (buildRichApplyConfirmationText, testado aqui).
test(
  'B3.5 apresenta CRM e Agenda como operações distintas do contrato A4',
  () => {
    const operational =
      getBlock(
        'function buildRichApplyConfirmationText(',
        'function buildApplyConfirmationText()',
      )

    assert.match(
      operational,
      /should_change_crm_stage/,
    )

    assert.match(
      operational,
      /recommended_status/,
    )

    assert.match(
      operational,
      /should_change_agenda/,
    )

    assert.match(
      operational,
      /expected_next_action_at/,
    )

    assert.match(
      operational,
      /CRM:/,
    )

    assert.match(
      operational,
      /Agenda:/,
    )

    assert.match(
      operational,
      /crm\.rationale/,
    )

    assert.match(
      operational,
      /agenda\.rationale/,
    )
  },
)

test(
  'B3.5 usa rótulo contextual para confirmar CRM Agenda ou ambos',
  () => {
    const labels =
      getBlock(
        'function getApplySuggestionButtonLabel()',
        'function getAnalysisActionButton()',
      )

    assert.match(
      labels,
      /getActiveCommercialReading/,
    )

    assert.match(
      labels,
      /Confirmar CRM e Agenda/,
    )

    assert.match(
      labels,
      /Confirmar atualização do CRM/,
    )

    assert.match(
      labels,
      /Confirmar atualização da Agenda/,
    )

    assert.doesNotMatch(
      labels,
      /\.suggestion|\.coaching/,
    )
  },
)

test(
  'B3.5 confirmação rich usa operações oficiais e não o suggestion legado',
  () => {
    const richConfirmation =
      getBlock(
        'function buildRichApplyConfirmationText(',
        'function buildApplyConfirmationText()',
      )

    assert.match(
      richConfirmation,
      /isRichCommercialReadingApplyCompatible/,
    )

    assert.match(
      richConfirmation,
      /operations/,
    )

    assert.match(
      richConfirmation,
      /recommended_status/,
    )

    assert.match(
      richConfirmation,
      /expected_next_action_at/,
    )

    assert.match(
      richConfirmation,
      /Motivo do CRM/,
    )

    assert.match(
      richConfirmation,
      /Motivo da Agenda/,
    )

    assert.match(
      richConfirmation,
      /Nada será alterado sem sua confirmação/,
    )

    assert.match(
      richConfirmation,
      /registrada no histórico/,
    )

    assert.doesNotMatch(
      richConfirmation,
      /\.suggestion|\.coaching/,
    )
  },
)

test(
  'B3.5 preserva fallback legado apenas quando não existe leitura rica',
  () => {
    const confirmation =
      getBlock(
        'function buildApplyConfirmationText()',
        'async function applyCurrentSuggestion()',
      )

    const readingIndex =
      confirmation.indexOf(
        'getActiveCommercialReading',
      )

    const richIndex =
      confirmation.indexOf(
        'buildRichApplyConfirmationText',
      )

    const legacyIndex =
      confirmation.indexOf(
        '.suggestion',
      )

    assert.ok(
      readingIndex >= 0 &&
      richIndex > readingIndex &&
      legacyIndex > richIndex,
    )

    assert.match(
      confirmation,
      /Esta atualização não está disponível nesta leitura/,
    )

    assert.match(
      confirmation,
      /Confirmar aplicação da sugestão na Yolen/,
    )
  },
)

// FASE 16.6 — mesma remoção de código morto do teste acima. A garantia
// "confirmação humana antes de qualquer escrita" agora é verificada
// diretamente no gate real de aplicação (applyCurrentSuggestion): ele
// sempre checa canApplyCurrentSuggestion() e sempre passa por
// window.confirm(buildApplyConfirmationText()) antes de prosseguir —
// nenhuma chamada à API acontece fora desse fluxo.
test(
  'B3.5 mantém confirmação humana e não cria escrita automática na UX rica',
  () => {
    const confirmationText =
      getBlock(
        'function buildRichApplyConfirmationText(',
        'function buildApplyConfirmationText()',
      )

    assert.match(
      confirmationText,
      /Nada será alterado sem sua confirmação/,
    )

    assert.doesNotMatch(
      confirmationText,
      /evidence_message_ids|memory_ids|contract_version|engine_source/,
    )

    const applyGate =
      getBlock(
        'async function applyCurrentSuggestion()',
        'function startSessionAutoRefresh()',
      )

    assert.match(
      applyGate,
      /canApplyCurrentSuggestion\(\)/,
    )

    assert.match(
      applyGate,
      /window\.confirm\(\s*buildApplyConfirmationText\(\)\s*\)/,
    )

    const actions =
      getBlock(
        'function getAnalysisActionButton()',
        'function getCompanionDecisionBadge()',
      )

    assert.match(
      actions,
      /getApplySuggestionButtonLabel/,
    )
  },
)
