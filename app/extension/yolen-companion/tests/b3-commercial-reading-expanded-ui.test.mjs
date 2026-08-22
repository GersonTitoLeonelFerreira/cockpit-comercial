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
  'B3.2 expõe contexto/cliente/evolução somente em divulgação progressiva (áreas ANÁLISE e CLIENTE)',
  () => {
    // Onda 4: deixou de ser um único <details> "Ver contexto comercial" —
    // vira a área CLIENTE (contexto/o que sabemos/em aberto, visível de
    // cara — timeline é a única parte secundária, ver b189) e a área
    // ANÁLISE (coaching/método/progresso/riscos, cada bloco no seu
    // próprio <details>, resumo primeiro).
    const clienteBuckets =
      getBlock(
        'function getCompanionClientContextNarrativeHtml(',
        'function getCommercialEvolutionStatusLabel(',
      )

    assert.match(
      clienteBuckets,
      /Contexto/,
    )

    assert.match(
      clienteBuckets,
      /O que sabemos/,
    )

    assert.match(
      clienteBuckets,
      /Em aberto/,
    )

    const analiseTab =
      getBlock(
        'function getAnaliseDetailsHtml(',
        'function getCompanionRelationshipSectionHtml(',
      )

    assert.match(
      analiseTab,
      /<details class="yolen-rich-details yolen-analise-details"/,
    )

    const evolutionDetails =
      getBlock(
        'function getCompanionEvolutionDetailsHtml(',
        'function getCompanionServiceRisksDetailsHtml(',
      )

    assert.match(
      evolutionDetails,
      /Progresso comercial/,
    )

    assert.match(
      evolutionDetails,
      /getRichCommercialEvolutionHtml/,
    )

    assert.match(
      contentScript,
      /Evolução comercial/,
    )
  },
)

test(
  'B3.2 consome diretamente os campos oficiais do A4 sem expor evidência técnica',
  () => {
    const clienteAndAnalise =
      getBlock(
        'function getCompanionClientContextNarrativeHtml(',
        'function getCompanionRelationshipSectionHtml(',
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
        clienteAndAnalise,
        new RegExp(field),
      )
    }

    assert.doesNotMatch(
      clienteAndAnalise,
      /evidence_message_ids|memory_ids|contract_version|engine_source/,
    )

    assert.doesNotMatch(
      clienteAndAnalise,
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
        'function getCommercialMethodStatusLabel(',
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
        'function getCompanionKnownAboutClientHtml(',
      )

    assert.match(
      expanded,
      /summaries\.length === 0/,
    )

    const clienteGroups =
      getBlock(
        'function getCompanionKnownAboutClientHtml(',
        'function getCommercialEvolutionStatusLabel(',
      )

    assert.match(
      clienteGroups,
      /groups\.length === 0/,
    )

    const analiseTab =
      getBlock(
        'function getCompanionAnaliseTabHtml() {',
        'function getCompanionRelationshipSectionHtml(',
      )

    assert.match(
      analiseTab,
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

    assert.match(
      styles,
      /\.yolen-analise-details/,
    )

    assert.match(
      styles,
      /\.yolen-cliente-tab/,
    )
  },
)
