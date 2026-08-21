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
  'B3.4 usa diretamente acertos e melhorias comprovados pelo contrato A4',
  () => {
    const block =
      getBlock(
        'function getRichSellerStrengthsHtml(',
        'function getCommercialRiskSeverityLabel(',
      )

    assert.match(
      block,
      /seller_strengths/,
    )

    assert.match(
      block,
      /improvement_points/,
    )

    assert.match(
      block,
      /item\?\.summary/,
    )

    assert.match(
      block,
      /item\?\.impact/,
    )

    assert.match(
      block,
      /Acertos do vendedor/,
    )

    assert.match(
      block,
      /Pontos de melhoria/,
    )
  },
)

test(
  'B3.4 mantém objeções do cliente separadas dos riscos no atendimento',
  () => {
    const risks =
      getBlock(
        'function getCommercialRiskSeverityLabel(',
        'function getRichCommercialReadingExpandedHtml(',
      )

    assert.match(
      risks,
      /risks\.customer_objections/,
    )

    assert.match(
      risks,
      /risks\.service_risks/,
    )

    assert.match(
      risks,
      /Objeções do cliente/,
    )

    assert.match(
      risks,
      /Riscos no atendimento/,
    )

    const customerIndex =
      risks.indexOf(
        'risks.customer_objections',
      )

    const serviceIndex =
      risks.indexOf(
        'risks.service_risks',
      )

    assert.ok(
      customerIndex >= 0 &&
      serviceIndex > customerIndex,
    )
  },
)

test(
  'B3.4 preserva as três severidades oficiais sem expor enum técnico ao vendedor',
  () => {
    const severity =
      getBlock(
        'function getCommercialRiskSeverityLabel(',
        'function getRichRiskGroupHtml(',
      )

    assert.match(
      severity,
      /low: 'Baixo'/,
    )

    assert.match(
      severity,
      /medium: 'Médio'/,
    )

    assert.match(
      severity,
      /high: 'Alto'/,
    )
  },
)

test(
  'B3.4 permanece no contexto progressivo e não expõe evidência técnica ou coaching legado',
  () => {
    const expanded =
      getBlock(
        'function getRichCommercialReadingExpandedHtml(',
        'function getRichCommercialReadingCardHtml(',
      )

    assert.match(
      expanded,
      /getRichSellerStrengthsHtml/,
    )

    assert.match(
      expanded,
      /getRichImprovementPointsHtml/,
    )

    assert.match(
      expanded,
      /getRichCommercialRisksHtml/,
    )

    assert.match(
      expanded,
      /Resumo, cliente, evolução, método, atendimento e riscos/,
    )

    const b34 =
      getBlock(
        'function getRichSellerStrengthsHtml(',
        'function getRichCommercialReadingExpandedHtml(',
      )

    assert.doesNotMatch(
      b34,
      /evidence_message_ids|memory_ids|contract_version|engine_source|stage_key/,
    )

    assert.doesNotMatch(
      b34,
      /\.coaching|\.suggestion/,
    )
  },
)
