import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageIntelligenceV2CriticDrivenRepairExecutionPlan,
  buildMessageIntelligenceV2ExecutionPlan,
  buildMessageIntelligenceV2RepairExecutionPlan,
  MESSAGE_INTELLIGENCE_V2_PROMPT_VERSION,
} from './execution-plan.ts'

import {
  MESSAGE_INTELLIGENCE_V2_GENERATION_CONTRACT_VERSION,
} from './generation-contract.ts'

import {
  partnerScenario,
  priceScenario,
} from './fixtures.ts'

function buildPlan(scenario) {
  return buildMessageIntelligenceV2ExecutionPlan({
    snapshot: scenario.build(),
  })
}

test(
  'V2 execution plan: contract/prompt version corretos e prompts não vazios',
  () => {
    const plan = buildPlan(priceScenario)

    assert.equal(
      plan.prompt_version,
      MESSAGE_INTELLIGENCE_V2_PROMPT_VERSION,
    )
    assert.equal(
      plan.output_contract_version,
      MESSAGE_INTELLIGENCE_V2_GENERATION_CONTRACT_VERSION,
    )
    assert.ok(plan.system_prompt.trim())
    assert.ok(plan.user_prompt.trim())
  },
)

test(
  'V2 execution plan: seller_intent chega ao payload mas nunca entra em allowed_evidence',
  () => {
    const plan = buildPlan(priceScenario)
    const payload = JSON.parse(plan.user_prompt)

    assert.equal(
      payload.seller.seller_intent,
      priceScenario.seller_intent,
    )

    const evidence = payload.allowed_evidence

    for (const list of [
      evidence.message_ids,
      evidence.memory_ids,
      evidence.product_ids,
      evidence.fact_ids,
    ]) {
      assert.equal(
        list.includes(
          priceScenario.seller_intent,
        ),
        false,
      )
    }
  },
)

test(
  'V2 execution plan: mensagens da conversa atual aparecem em allowed_evidence.message_ids',
  () => {
    const plan = buildPlan(priceScenario)
    const snapshot = priceScenario.build()

    const expectedIds = snapshot.conversation.messages.map(
      message => message.message_id,
    )

    for (const id of expectedIds) {
      assert.ok(
        plan.normalization_context
          .allowed_evidence.message_ids.includes(
            id,
          ),
      )
    }
  },
)

test(
  'V2 execution plan: reconhece o sócio já mencionado no estado comercial, não apenas na intenção do vendedor',
  () => {
    const plan = buildPlan(partnerScenario)
    const payload = JSON.parse(plan.user_prompt)

    const factSummaries =
      payload.commercial_state.communication_observations
        .map(item => item.summary)
        .join(' ')

    assert.match(
      factSummaries,
      /sócio/iu,
    )
  },
)

test(
  'V2 execution plan: repair plan preserva payload original e adiciona repair_context',
  () => {
    const plan = buildPlan(priceScenario)

    const repairPlan =
      buildMessageIntelligenceV2RepairExecutionPlan({
        plan,
        previous_failure_code:
          'INVALID_V2_OUTPUT',
        previous_failure_path:
          'suggested_message',
        previous_failure_invariant:
          'TEXT_LENGTH_LIMIT',
      })

    const repairedPayload = JSON.parse(
      repairPlan.user_prompt,
    )
    const originalPayload = JSON.parse(
      plan.user_prompt,
    )

    assert.deepEqual(
      repairedPayload.seller,
      originalPayload.seller,
    )
    assert.equal(
      repairedPayload.repair_context
        .previous_failure_code,
      'INVALID_V2_OUTPUT',
    )
  },
)

function samplePreviousOutput(plan) {
  const productId =
    plan.normalization_context
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
          'O sistema integra automaticamente com qualquer ERP.',
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
      'O sistema integra automaticamente com qualquer ERP, então não tem com o que se preocupar.',
  }
}

test(
  'V2 execution plan: repair acionado pelo critic inclui previous_candidate com a mensagem/claims anteriores',
  () => {
    const plan = buildPlan(priceScenario)
    const previousOutput =
      samplePreviousOutput(plan)

    const criticRepairPlan =
      buildMessageIntelligenceV2CriticDrivenRepairExecutionPlan(
        {
          plan,
          previous_output: previousOutput,
          critic_feedback: {
            reason_codes: [
              'claim_source_mismatch',
            ],
            unsupported_claim_indexes: [0],
            concise_feedback:
              'A claim não é sustentada pela fonte citada.',
          },
        },
      )

    const payload = JSON.parse(
      criticRepairPlan.user_prompt,
    )

    assert.ok(
      payload.previous_candidate,
      'previous_candidate deveria estar presente no payload do repair',
    )
    assert.equal(
      payload.previous_candidate
        .suggested_message,
      previousOutput.suggested_message,
    )
    assert.deepEqual(
      payload.previous_candidate
        .grounded_claims,
      previousOutput.grounded_claims,
    )
    assert.equal(
      payload.previous_candidate
        .recommended_commercial_objective,
      previousOutput
        .recommended_commercial_objective,
    )
    assert.equal(
      payload.semantic_repair_context
        .concise_feedback,
      'A claim não é sustentada pela fonte citada.',
    )
  },
)

test(
  'V2 execution plan: previous_candidate não carrega campos internos além do contrato declarado (sem chain-of-thought)',
  () => {
    const plan = buildPlan(priceScenario)
    const previousOutput =
      samplePreviousOutput(plan)

    const criticRepairPlan =
      buildMessageIntelligenceV2CriticDrivenRepairExecutionPlan(
        {
          plan,
          previous_output: previousOutput,
          critic_feedback: {
            reason_codes: [
              'claim_source_mismatch',
            ],
            unsupported_claim_indexes: [0],
            concise_feedback: 'x',
          },
        },
      )

    const payload = JSON.parse(
      criticRepairPlan.user_prompt,
    )

    assert.deepEqual(
      Object.keys(
        payload.previous_candidate,
      ).sort(),
      [
        'customer_meaning',
        'grounded_claims',
        'method_alignment_summary',
        'recommended_commercial_objective',
        'seller_intent_interpretation',
        'suggested_message',
      ],
    )

    // contract_version, evidence_message_ids, evidence_memory_ids,
    // safety_self_check e current_turn_relevance não são raciocínio, mas
    // também não são necessários para o repair — confirma que não
    // vazaram, e nenhum campo de reasoning/chain-of-thought existe no
    // contrato para vazar em primeiro lugar.
    for (
      const forbiddenKey of [
        'reasoning',
        'chain_of_thought',
        'thoughts',
        'safety_self_check',
        'contract_version',
      ]
    ) {
      assert.equal(
        Object.hasOwn(
          payload.previous_candidate,
          forbiddenKey,
        ),
        false,
      )
    }
  },
)
