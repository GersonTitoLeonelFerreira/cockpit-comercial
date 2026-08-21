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

const styles =
  readFileSync(
    new URL(
      '../src/styles.css',
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
  'B3.2 expõe resumo cliente e evolução somente em divulgação progressiva',
  () => {
    const expanded =
      getBlock(
        'function getCommercialReadingDisplayText(',
        'function getRichCommercialReadingCardHtml(',
      )

    assert.match(
      expanded,
      /<details class="yolen-rich-details">/,
    )

    assert.match(
      expanded,
      /Resumo da conversa/,
    )

    assert.match(
      expanded,
      /Cliente/,
    )

    assert.match(
      expanded,
      /Evolução comercial/,
    )

    assert.match(
      expanded,
      /Ver contexto comercial/,
    )

    assert.doesNotMatch(
      expanded,
      /<details[^>]*open/,
    )
  },
)

test(
  'B3.2 consome diretamente os campos oficiais do A4 sem expor evidência técnica',
  () => {
    const expanded =
      getBlock(
        'function getCommercialReadingDisplayText(',
        'function getRichCommercialReadingCardHtml(',
      )

    for (const field of [
      'initial_context',
      'evolution',
      'important_events',
      'last_customer_request_or_decision',
      'needs',
      'interests',
      'decision_criteria',
      'preferences',
      'open_questions',
      'objections',
      'uncertainties',
      'commercial_evolution',
    ]) {
      assert.match(
        expanded,
        new RegExp(field),
      )
    }

    assert.doesNotMatch(
      expanded,
      /evidence_message_ids|memory_ids|contract_version|engine_source/,
    )

    assert.doesNotMatch(
      expanded,
      /\.coaching|\.suggestion/,
    )
  },
)

test(
  'B3.2 preserva todos os status oficiais da evolução comercial',
  () => {
    const expanded =
      getBlock(
        'function getCommercialEvolutionStatusLabel(',
        'function getRichCommercialReadingCardHtml(',
      )

    for (const status of [
      'completed',
      'active',
      'partial',
      'pending',
      'not_started',
      'skipped',
      'not_applicable',
    ]) {
      assert.match(
        expanded,
        new RegExp(status),
      )
    }

    assert.match(
      expanded,
      /item\.status/,
    )

    assert.match(
      expanded,
      /item\.explanation/,
    )
  },
)

test(
  'B3.2 omite grupos vazios e possui estilo próprio sem alterar o card compacto',
  () => {
    const expanded =
      getBlock(
        'function getRichReadingListHtml(',
        'function getRichCommercialReadingCardHtml(',
      )

    assert.match(
      expanded,
      /summaries\.length === 0/,
    )

    assert.match(
      expanded,
      /groups\.length === 0/,
    )

    assert.match(
      expanded,
      /items\.length === 0/,
    )

    assert.match(
      expanded,
      /sections\.length === 0/,
    )

    assert.match(
      styles,
      /\.yolen-rich-details/,
    )

    assert.match(
      styles,
      /\.yolen-rich-section/,
    )

    assert.match(
      styles,
      /\.yolen-rich-evolution-item/,
    )

    assert.match(
      styles,
      /\.yolen-rich-status-completed/,
    )
  },
)
