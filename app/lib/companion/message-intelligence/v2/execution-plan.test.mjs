import assert from 'node:assert/strict'
import test from 'node:test'

import {
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
