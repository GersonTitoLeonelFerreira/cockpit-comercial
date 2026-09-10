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
    // FASE 13 Frente 2 — a checagem engine_source/commercial_reading saiu
    // do corpo de getActiveCommercialReading() e passou para
    // extractStatefulCommercialReading(), a função pura que agora decide
    // "isto é uma leitura comercial stateful válida?" tanto para o
    // resultado ao vivo (getActiveCommercialReading) quanto para o
    // snapshot persistido de CLIENTE (rememberLastKnownClientCommercial
    // ReadingIfPresent) — getActiveCommercialReading() virou um delegador
    // fino. O gate continua o mesmo; só a localização mudou.
    const gate =
      getBlock(
        'function extractStatefulCommercialReading',
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

    // FASE 16.6 — o dispatch de ANÁLISE não decide mais rich/legado a
    // partir de getActiveCommercialReading(): a leitura detalhada agora
    // vem pronta do ANÁLISE seller-facing view model (Integrated
    // Commercial Context, traduzido por
    // app/lib/server/analysis-view-model.ts, buscado por
    // loadAnalysisViewModelForCurrentCycle) — só o guard de escopo
    // (cycleId/conversationKey/companyId) decide se o view model já
    // pronto pode ser exibido. getLegacyAnalysisCardHtml continua como
    // fallback para o formato V1/sem leitura rica (mandato §35: "não
    // remover fallback funcional sem entender por que existe").
    const dispatch =
      getBlock(
        'function getDetailedAnalysisAreaHtml()',
        'function getLeadEnrichmentAddressValue',
      )

    assert.match(
      dispatch,
      /state\.analysisViewModel\?\.status === 'ready'/,
    )

    assert.match(
      dispatch,
      /sellerInformationViewTools\.renderAnalysisViewModel/,
    )

    assert.match(
      dispatch,
      /getLegacyAnalysisCardHtml/,
    )

    assert.doesNotMatch(
      dispatch,
      /getRichCommercialReadingCardHtml/,
    )
  },
)

// FASE 16.6 — o card local que este teste cobria
// (getRichCommercialReadingCardHtml, um "AGORA" pré-16.5 que traduzia
// best_approach/conversation_summary/communication/operations
// diretamente no content-script.js) foi removido por ser código morto:
// zero chamadores reais desde a recalibração de AGORA na FASE 16.5
// (confirmado no teste "B3.1 ativa leitura rica..." acima, que verifica
// sua ausência), e a tradução decision→categoria de apresentação que
// ele fazia localmente (getCommercialReadingDecisionLabel/
// getCommercialReadingChannelLabel, também removidas por ficarem
// órfãs) agora vive server-side, exaustivamente testada em
// app/lib/server/analysis-view-model.test.mjs
// (DECISION_TO_OPPORTUNITY_STATUS cobre os 23 valores de
// CommercialReadingDecision, incluindo o caso `wait`/`give_space`/
// `no_intervention` que os dois testes antigos cobriam aqui).
test(
  'B3.1 tradução local de decision/channel foi removida (agora vive em analysis-view-model.ts)',
  () => {
    assert.doesNotMatch(
      contentScript,
      /function getCommercialReadingDecisionLabel\(/,
    )

    assert.doesNotMatch(
      contentScript,
      /function getCommercialReadingChannelLabel\(/,
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

    // FASE 16.6 — "Nada será alterado sem sua confirmação." continua
    // presente no fallback legado (getLegacyAnalysisCardHtml) e no
    // diálogo de confirmação de aplicação de sugestão — não mais
    // dentro do card rico removido (getRichCommercialReadingCardHtml),
    // então a checagem passa a ser sobre o arquivo inteiro.
    assert.match(
      contentScript,
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
        'function getCommercialReadingDisplayText(',
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
