import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const loader =
  readFileSync(
    new URL(
      '../server/analysis-view-model-loader.ts',
      import.meta.url,
    ),
    'utf8',
  )

const reasoningSource =
  readFileSync(
    new URL(
      '../server/canonical-seller-reasoning-source.ts',
      import.meta.url,
    ),
    'utf8',
  )

const sellerView =
  readFileSync(
    new URL(
      '../../extension/yolen-companion/src/companion-seller-information-view.js',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'ANÁLISE recebe diagnóstico do mesmo snapshot usado pelo Commercial Reasoning',
  () => {
    assert.match(
      loader,
      /loadCanonicalSellerReasoningBundle/,
    )

    assert.match(
      loader,
      /buildCommercialCoachingDiagnosis/,
    )

    assert.match(
      loader,
      /diagnostic_input:\s*reasoningBundle\s*\.diagnostic_input/,
    )

    assert.match(
      loader,
      /coaching_diagnosis:\s*coachingDiagnosis/,
    )
  },
)

test(
  'loader de reasoning preserva API antiga e expõe bundle sem duplicar autoridade',
  () => {
    assert.match(
      reasoningSource,
      /export async function loadCanonicalSellerReasoningBundle/,
    )

    assert.match(
      reasoningSource,
      /export async function loadCanonicalSellerReasoning/,
    )

    assert.match(
      reasoningSource,
      /return bundle\.reasoning/,
    )
  },
)

test(
  'ANÁLISE renderiza resumo de coaching antes dos detalhes existentes',
  () => {
    assert.match(
      sellerView,
      /function renderCoachingDiagnosis/,
    )

    const diagnosisIndex =
      sellerView.indexOf(
        'renderCoachingDiagnosis(analysisViewModel.coaching_diagnosis)',
      )

    const improvementsIndex =
      sellerView.indexOf(
        'renderImprovements(analysisViewModel.improvements)',
      )

    assert.ok(
      diagnosisIndex >= 0,
    )

    assert.ok(
      improvementsIndex >
        diagnosisIndex,
    )

    assert.match(
      sellerView,
      /Principal acerto/,
    )

    assert.match(
      sellerView,
      /Principal ajuste/,
    )
  },
)

test(
  'ANÁLISE continua informativa e não ganha ação de envio automático',
  () => {
    const diagnosisBlock =
      sellerView.slice(
        sellerView.indexOf(
          'function renderCoachingDiagnosis',
        ),
        sellerView.indexOf(
          'function renderStrengths',
        ),
      )

    assert.doesNotMatch(
      diagnosisBlock,
      /sendMessage|applySuggestedMessage|insertMessage|auto.?send/i,
    )
  },
)
