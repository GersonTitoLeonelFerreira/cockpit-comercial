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

test(
  'B3.5 apresenta CRM e Agenda como operações distintas do contrato A4',
  () => {
    const operational =
      getBlock(
        'function getRichOperationalSuggestionHtml(',
        'function getCommercialReadingDisplayText(',
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
      /requires_human_confirmation/,
    )

    assert.match(
      operational,
      />\s*CRM\s*</,
    )

    assert.match(
      operational,
      />\s*Agenda\s*</,
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

test(
  'B3.5 mantém confirmação humana e não cria escrita automática na UX rica',
  () => {
    const operational =
      getBlock(
        'function getRichOperationalSuggestionHtml(',
        'function getCommercialReadingDisplayText(',
      )

    assert.match(
      operational,
      /canApplyCurrentSuggestion/,
    )

    assert.match(
      operational,
      /Nada será alterado sem sua confirmação/,
    )

    assert.match(
      operational,
      /não está disponível nesta leitura/,
    )

    assert.doesNotMatch(
      operational,
      /evidence_message_ids|memory_ids|contract_version|engine_source/,
    )

    assert.doesNotMatch(
      operational,
      /YolenCompanionApi|fetch\(|applyCurrentSuggestion\(/,
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
