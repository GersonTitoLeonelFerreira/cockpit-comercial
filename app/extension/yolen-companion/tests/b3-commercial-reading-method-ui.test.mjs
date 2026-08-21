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
  'B3.3 renderiza somente o método oficial entregue pelo A4',
  () => {
    const method =
      getBlock(
        'function getCommercialMethodStatusLabel(',
        'function getRichCommercialReadingExpandedHtml(',
      )

    assert.match(
      method,
      /commercialReading[\s\S]*\?\.method/,
    )

    assert.match(
      method,
      /method\.configured/,
    )

    assert.match(
      method,
      /method\.name/,
    )

    assert.match(
      method,
      /method\.stages/,
    )

    assert.match(
      method,
      /stage\?\.step_order/,
    )

    assert.match(
      method,
      /stage\?\.name/,
    )

    assert.match(
      method,
      /stage\?\.status/,
    )

    assert.match(
      method,
      /stage\?\.explanation/,
    )
  },
)

test(
  'B3.3 preserva ausência de método sem inventar nome ou etapas',
  () => {
    const method =
      getBlock(
        'function getRichCommercialMethodHtml(',
        'function getRichCommercialReadingExpandedHtml(',
      )

    assert.match(
      method,
      /method\.configured ===[\s\S]*false/,
    )

    assert.match(
      method,
      /Nenhum método comercial está configurado para esta operação\./,
    )

    assert.match(
      method,
      /method\.configured !==[\s\S]*true/,
    )
  },
)

test(
  'B3.3 usa somente os cinco status oficiais do método e não transforma etapa em checklist',
  () => {
    const labels =
      getBlock(
        'function getCommercialMethodStatusLabel(',
        'function getRichCommercialMethodHtml(',
      )

    for (const status of [
      'completed',
      'partial',
      'not_started',
      'skipped',
      'not_applicable',
    ]) {
      assert.match(
        labels,
        new RegExp(status),
      )
    }

    assert.doesNotMatch(
      labels,
      /active|pending/,
    )

    const method =
      getBlock(
        'function getRichCommercialMethodHtml(',
        'function getRichCommercialReadingExpandedHtml(',
      )

    assert.doesNotMatch(
      method,
      /checkbox|<input|checklist/i,
    )

    assert.match(
      method,
      /não determina avanço automático/,
    )
  },
)

test(
  'B3.3 inclui método no contexto progressivo sem expor campos técnicos',
  () => {
    const expanded =
      getBlock(
        'function getRichCommercialReadingExpandedHtml(',
        'function getRichCommercialReadingCardHtml(',
      )

    assert.match(
      expanded,
      /getRichCommercialMethodHtml/,
    )

    assert.match(
      expanded,
      /Resumo, cliente, evolução, método/,
    )

    const method =
      getBlock(
        'function getCommercialMethodStatusLabel(',
        'function getRichCommercialReadingExpandedHtml(',
      )

    assert.doesNotMatch(
      method,
      /stage_key|evidence_message_ids|memory_ids|contract_version|engine_source/,
    )

    assert.doesNotMatch(
      method,
      /\.coaching|\.suggestion/,
    )
  },
)
