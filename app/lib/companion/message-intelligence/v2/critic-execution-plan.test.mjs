import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageIntelligenceV2ExecutionPlan,
} from './execution-plan.ts'

import {
  buildMessageIntelligenceV2CriticExecutionPlan,
  MESSAGE_INTELLIGENCE_V2_CRITIC_PROMPT_VERSION,
} from './critic-execution-plan.ts'

import {
  MESSAGE_INTELLIGENCE_V2_CRITIC_CONTRACT_VERSION,
} from './critic-contract.ts'

import {
  priceScenario,
} from './fixtures.ts'

function buildPrimaryPlan(scenario) {
  return buildMessageIntelligenceV2ExecutionPlan({
    snapshot: scenario.build(),
  })
}

function goodOutput(primaryPlan, overrides = {}) {
  const productId =
    primaryPlan.normalization_context
      .allowed_evidence.product_ids[0]

  return {
    contract_version:
      'message-intelligence-v2-generation-v1',
    intervention_needed: true,
    current_turn_relevance: 'commercial',
    customer_meaning:
      'Cliente concorda mas questiona o valor.',
    seller_intent_interpretation:
      'Vendedor quer justificar sem pressionar.',
    recommended_commercial_objective:
      'address_objection',
    method_alignment_summary: null,
    evidence_message_ids: [],
    evidence_memory_ids: [],
    grounded_claims: [
      {
        claim:
          'O plano inclui acompanhamento estruturado durante todo o processo.',
        supported_by: {
          source: 'product',
          id: productId,
        },
      },
    ],
    safety_self_check: {
      no_unsupported_commercial_claim: true,
      no_commitment_assumed_beyond_evidence: true,
      no_resolved_question_repeated: true,
    },
    suggested_message:
      'Faz sentido perguntar! O valor cobre acompanhamento estruturado durante todo o processo.',
    ...overrides,
  }
}

test(
  'V2 critic plan: contract/prompt version corretos e prompts não vazios',
  () => {
    const primaryPlan = buildPrimaryPlan(
      priceScenario,
    )
    const output = goodOutput(primaryPlan)

    const criticPlan =
      buildMessageIntelligenceV2CriticExecutionPlan(
        {
          primaryPlan,
          output,
        },
      )

    assert.equal(
      criticPlan.prompt_version,
      MESSAGE_INTELLIGENCE_V2_CRITIC_PROMPT_VERSION,
    )
    assert.equal(
      criticPlan.output_contract_version,
      MESSAGE_INTELLIGENCE_V2_CRITIC_CONTRACT_VERSION,
    )
    assert.ok(criticPlan.system_prompt.trim())
    assert.ok(criticPlan.user_prompt.trim())
    assert.equal(criticPlan.claim_count, 1)
  },
)

test(
  'V2 critic plan: grounded_claims chegam com o conteúdo real da fonte citada (source_content)',
  () => {
    const primaryPlan = buildPrimaryPlan(
      priceScenario,
    )
    const output = goodOutput(primaryPlan)

    const criticPlan =
      buildMessageIntelligenceV2CriticExecutionPlan(
        {
          primaryPlan,
          output,
        },
      )

    const payload = JSON.parse(
      criticPlan.user_prompt,
    )

    assert.equal(
      payload.candidate.grounded_claims.length,
      1,
    )

    const claimPayload =
      payload.candidate.grounded_claims[0]

    assert.equal(claimPayload.index, 0)
    assert.equal(
      claimPayload.claim,
      output.grounded_claims[0].claim,
    )
    assert.ok(
      claimPayload.source_content,
      'source_content deveria estar presente para uma fonte real',
    )
    assert.match(
      claimPayload.source_content,
      /Plano Exemplo|Acompanhamento estruturado/i,
    )
  },
)

test(
  'V2 critic plan: fonte inexistente resulta em source_content=null (não inventa conteúdo)',
  () => {
    const primaryPlan = buildPrimaryPlan(
      priceScenario,
    )
    const output = goodOutput(primaryPlan, {
      grounded_claims: [
        {
          claim: 'Claim citando ID inexistente.',
          supported_by: {
            source: 'product',
            id: 'produto-inexistente',
          },
        },
      ],
    })

    const criticPlan =
      buildMessageIntelligenceV2CriticExecutionPlan(
        {
          primaryPlan,
          output,
        },
      )

    const payload = JSON.parse(
      criticPlan.user_prompt,
    )

    assert.equal(
      payload.candidate.grounded_claims[0]
        .source_content,
      null,
    )
  },
)

test(
  'V2 critic plan: payload inclui seller_intent, conversa, método e comportamentos obrigatórios/proibidos',
  () => {
    const primaryPlan = buildPrimaryPlan(
      priceScenario,
    )
    const output = goodOutput(primaryPlan)

    const criticPlan =
      buildMessageIntelligenceV2CriticExecutionPlan(
        {
          primaryPlan,
          output,
        },
      )

    const payload = JSON.parse(
      criticPlan.user_prompt,
    )

    assert.equal(
      payload.seller_intent.seller_intent,
      priceScenario.seller_intent,
    )
    assert.ok(
      Array.isArray(
        payload.conversation.current_messages,
      ) &&
        payload.conversation
          .current_messages.length > 0,
    )
    assert.ok(
      'sales_method' in payload,
    )
    assert.ok(
      Array.isArray(
        payload.required_behaviors,
      ),
    )
    assert.ok(
      Array.isArray(
        payload.prohibited_behaviors,
      ),
    )
    assert.ok(
      'commitments' in
        payload.commercial_state,
    )
    assert.ok(
      'resolved_information' in
        payload.commercial_state,
    )
  },
)

test(
  'V2 critic plan: candidate reflete exatamente a mensagem e interpretação da geração primária',
  () => {
    const primaryPlan = buildPrimaryPlan(
      priceScenario,
    )
    const output = goodOutput(primaryPlan)

    const criticPlan =
      buildMessageIntelligenceV2CriticExecutionPlan(
        {
          primaryPlan,
          output,
        },
      )

    const payload = JSON.parse(
      criticPlan.user_prompt,
    )

    assert.equal(
      payload.candidate.suggested_message,
      output.suggested_message,
    )
    assert.equal(
      payload.candidate.customer_meaning,
      output.customer_meaning,
    )
    assert.equal(
      payload.candidate
        .recommended_commercial_objective,
      output.recommended_commercial_objective,
    )
  },
)
