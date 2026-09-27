import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route =
  readFileSync(
    new URL(
      '../../api/companion/method-guidance/route.ts',
      import.meta.url,
    ),
    'utf8',
  )

const messageSource =
  readFileSync(
    new URL(
      './lead-seller-message.ts',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'MENSAGEM constrói strategy a partir do mesmo reasoning bundle e snapshot canônico',
  () => {
    const block =
      route.slice(
        route.indexOf(
          "if (operation === 'generate_message') {",
        ),
        route.indexOf(
          'const canonicalMessages = await loadCanonicalMessages',
        ),
      )

    assert.match(
      block,
      /loadCanonicalSellerReasoningBundle/,
    )

    assert.match(
      block,
      /buildCommercialCoachingDiagnosis/,
    )

    assert.match(
      block,
      /buildCommercialMessageStrategy/,
    )

    assert.match(
      block,
      /messageStrategy/,
    )

    assert.match(
      block,
      /messageStrategy:\s*messageStrategy/,
    )
  },
)

test(
  'composeSellerMessage recebe strategy sem reativar segundo motor comercial',
  () => {
    assert.match(
      messageSource,
      /messageStrategy\?:\s*CommercialMessageStrategy \| null/,
    )

    assert.match(
      messageSource,
      /message_strategy:\s*messageStrategy/,
    )

    assert.match(
      messageSource,
      /evaluateCommercialMessageDraft/,
    )

    assert.doesNotMatch(
      route,
      /tryGenerateActivatedMessageIntelligenceSellerMessageV1|tryGenerateActivatedMessageIntelligenceSellerMessageV2/,
    )
  },
)

test(
  'prompt de MENSAGEM trata strategy como plano e grounding como limite duro',
  () => {
    assert.match(
      messageSource,
      /message_strategy é o plano determinístico/i,
    )

    assert.match(
      messageSource,
      /prohibited_moves/i,
    )

    assert.match(
      messageSource,
      /facts_required_but_missing/i,
    )
  },
)
