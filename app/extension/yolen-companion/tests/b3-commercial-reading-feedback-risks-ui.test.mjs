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
    // Onda 4: a separação deixou de ser só visual dentro de um bloco —
    // service_risks (erro do vendedor, aparece em ANÁLISE) e
    // customer_objections (resistência do cliente, aparece em CLIENTE)
    // agora vivem em funções diferentes, cada uma cega para o campo da
    // outra.
    const serviceRisksBlock =
      getBlock(
        'function getRichServiceRisksHtml(',
        'function getRichCustomerObjectionsHtml(',
      )

    assert.match(
      serviceRisksBlock,
      /risks\?\.service_risks/,
    )

    assert.doesNotMatch(
      serviceRisksBlock,
      /customer_objections/,
    )

    assert.match(
      serviceRisksBlock,
      /Riscos no atendimento/,
    )

    const customerObjectionsBlock =
      getBlock(
        'function getRichCustomerObjectionsHtml(',
        'function getAnaliseDetailsHtml(',
      )

    assert.match(
      customerObjectionsBlock,
      /risks\?\.customer_objections/,
    )

    assert.doesNotMatch(
      customerObjectionsBlock,
      /service_risks/,
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
  'B3.4 permanece no contexto progressivo (ANÁLISE) e não expõe evidência técnica ou coaching legado',
  () => {
    const coachingDetails =
      getBlock(
        'function getCompanionCoachingDetailsHtml(',
        'function getCompanionMethodDetailsHtml(',
      )

    assert.match(
      coachingDetails,
      /getRichSellerStrengthsHtml/,
    )

    assert.match(
      coachingDetails,
      /getRichImprovementPointsHtml/,
    )

    assert.match(
      coachingDetails,
      /title: 'Coaching'/,
    )

    const serviceRisksDetails =
      getBlock(
        'function getCompanionServiceRisksDetailsHtml(',
        'function getCompanionAnaliseTabHtml(',
      )

    assert.match(
      serviceRisksDetails,
      /getRichServiceRisksHtml/,
    )

    const b34 =
      getBlock(
        'function getRichSellerStrengthsHtml(',
        'function getAnaliseDetailsHtml(',
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
