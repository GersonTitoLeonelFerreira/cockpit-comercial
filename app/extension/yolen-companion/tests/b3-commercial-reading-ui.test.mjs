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
  'B3.1 ativa leitura rica somente com stateful e commercial_reading',
  () => {
    const gate =
      getBlock(
        'function getActiveCommercialReading()',
        'function normalizeOperationalText',
      )

    assert.match(
      gate,
      /engine_source[\s\S]*!==[\s\S]*'stateful'/,
    )

    assert.match(
      gate,
      /commercial_reading/,
    )

    const dispatch =
      getBlock(
        'function getCompanionAgoraTabHtml()',
        'function getLeadEnrichmentAddressValue',
      )

    assert.match(
      dispatch,
      /getActiveCommercialReading/,
    )

    assert.match(
      dispatch,
      /getRichCommercialReadingCardHtml/,
    )

    assert.match(
      dispatch,
      /getLegacyAnalysisCardHtml/,
    )
  },
)

test(
  'B3.1 renderiza decisão a partir do contrato A4 sem reconstrução por coaching',
  () => {
    const rich =
      getBlock(
        'function getCommercialReadingDecisionLabel(',
        'function getCompanionAgoraTabHtml()',
      )

    assert.match(
      rich,
      /conversation_summary/,
    )

    assert.match(
      rich,
      /best_approach/,
    )

    assert.match(
      rich,
      /communication/,
    )

    assert.match(
      rich,
      /operations/,
    )

    assert.doesNotMatch(
      rich,
      /evidence_message_ids|memory_ids|contract_version|engine_source/,
    )

    assert.doesNotMatch(
      rich,
      /\.coaching|\.suggestion/,
    )
  },
)

test(
  'B3.1 usa comunicação rica e preserva coaching apenas como fallback legado',
  () => {
    const messageBlock =
      getBlock(
        'function getSuggestedMessage()',
        'function getSuggestedMessageHtml()',
      )

    const readingIndex =
      messageBlock.indexOf(
        'getActiveCommercialReading',
      )

    const interventionIndex =
      messageBlock.indexOf(
        'intervention_needed',
      )

    const recommendedIndex =
      messageBlock.indexOf(
        'recommended_message',
      )

    const coachingIndex =
      messageBlock.indexOf(
        '.coaching',
      )

    assert.ok(
      readingIndex >= 0,
    )

    assert.ok(
      interventionIndex >
        readingIndex,
    )

    assert.ok(
      recommendedIndex >
        interventionIndex,
    )

    assert.ok(
      coachingIndex >
        recommendedIndex,
    )
  },
)

test(
  'B3.1 respeita espera espaço e ausência de intervenção',
  () => {
    const rich =
      getBlock(
        'function getCommercialReadingDecisionLabel(',
        'function getCompanionAgoraTabHtml()',
      )

    assert.match(
      rich,
      /wait:\s*'Aguardar'/,
    )

    assert.match(
      rich,
      /give_space:\s*'Dar espaço'/,
    )

    assert.match(
      rich,
      /no_intervention:[\s\S]*'Não intervir'/,
    )

    assert.match(
      rich,
      /intervention_needed[\s\S]*!==[\s\S]*true/,
    )
  },
)

test(
  'B3.1 apresenta CRM e Agenda do contrato e mantém confirmação humana',
  () => {
    const operational =
      getBlock(
        'function hasRichCommercialReadingOperationalChange(',
        'function canApplyCurrentSuggestion()',
      )

    assert.match(
      operational,
      /should_change_crm_stage/,
    )

    assert.match(
      operational,
      /should_change_agenda/,
    )

    assert.match(
      operational,
      /recommended_status/,
    )

    assert.match(
      operational,
      /expected_next_action_at/,
    )

    assert.match(
      operational,
      /requires_human_confirmation/,
    )

    const rich =
      getBlock(
        'function getCommercialReadingDecisionLabel(',
        'function getCompanionAgoraTabHtml()',
      )

    assert.match(
      rich,
      /Nada será alterado sem sua confirmação\./,
    )
  },
)

test(
  'B3.1 preserva renderer legado para V1 e respostas sem leitura rica',
  () => {
    const legacy =
      getBlock(
        'function getLegacyAnalysisCardHtml()',
        'function getCommercialReadingDecisionLabel(',
      )

    assert.match(
      legacy,
      /getCompanionNextMoveText/,
    )

    assert.match(
      legacy,
      /getOperationalSuggestionHtml/,
    )

    assert.match(
      legacy,
      /getSuggestedMessageHtml/,
    )
  },
)
