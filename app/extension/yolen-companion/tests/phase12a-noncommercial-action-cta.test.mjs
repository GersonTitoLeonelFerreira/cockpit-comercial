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

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)

  return contentScript.slice(
    start,
    end,
  )
}

test(
  '12A non-commercial neutraliza operação seller-facing no fallback legacy',
  () => {
    const relevance =
      getBlock(
        'function getLegacySuggestionCommercialRelevance()',
        'function hasOperationalSuggestionChange()',
      )

    assert.match(
      relevance,
      /commercial_relevance:/,
    )

    assert.match(
      relevance,
      /non_commercial/,
    )

    assert.match(
      relevance,
      /uncertain/,
    )

    const operational =
      getBlock(
        'function hasOperationalSuggestionChange()',
        'function hasRichCommercialReadingOperationalChange(',
      )

    assert.match(
      operational,
      /!isLegacySuggestionCommerciallyActionable\(\)/,
    )
  },
)

test(
  '12A non-commercial não expõe próximo passo ou mensagem do coaching legacy',
  () => {
    const nextMove =
      getBlock(
        'function getCompanionNextMoveText()',
        'function getOperationalSuggestionHtml()',
      )

    assert.match(
      nextMove,
      /!isLegacySuggestionCommerciallyActionable\(\)/,
    )

    const message =
      getBlock(
        'function getSuggestedMessage()',
        'function getAudioTranscriptionHtml()',
      )

    assert.match(
      message,
      /!isLegacySuggestionCommerciallyActionable\(\)/,
    )
  },
)
