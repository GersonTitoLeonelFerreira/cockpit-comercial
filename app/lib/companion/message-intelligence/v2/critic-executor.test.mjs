// Testes de invariantes do executor do semantic critic — provider fake,
// sem chamada real de modelo. Cobrem apenas o contrato estrutural (o
// critic real é não determinístico e é avaliado por eval ao vivo, não por
// estes testes): schema, enums, índices de claim dentro do intervalo, e a
// exigência de concise_feedback quando o veredito não é "pass".

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageIntelligenceV2ExecutionPlan,
} from './execution-plan.ts'

import {
  buildMessageIntelligenceV2CriticExecutionPlan,
} from './critic-execution-plan.ts'

import {
  executeMessageIntelligenceV2CriticAttempt,
  MessageIntelligenceV2CriticExecutionError,
} from './critic-executor.ts'

import {
  priceScenario,
} from './fixtures.ts'

function buildPlan() {
  const primaryPlan =
    buildMessageIntelligenceV2ExecutionPlan({
      snapshot: priceScenario.build(),
    })

  const productId =
    primaryPlan.normalization_context
      .allowed_evidence.product_ids[0]

  const output = {
    contract_version:
      'message-intelligence-v2-generation-v1',
    intervention_needed: true,
    current_turn_relevance: 'commercial',
    customer_meaning: 'x',
    seller_intent_interpretation: 'x',
    recommended_commercial_objective:
      'address_objection',
    method_alignment_summary: null,
    evidence_message_ids: [],
    evidence_memory_ids: [],
    grounded_claims: [
      {
        claim: 'Claim de teste.',
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
    suggested_message: 'Mensagem de teste.',
  }

  return buildMessageIntelligenceV2CriticExecutionPlan(
    {
      primaryPlan,
      output,
    },
  )
}

function fakeProvider(outputObject) {
  return async () => ({
    content: JSON.stringify(outputObject),
    provider: 'fake',
    model: 'fake-critic-model',
    request_id: 'critic-req-1',
    usage: {
      input_tokens: 50,
      output_tokens: 20,
      total_tokens: 70,
    },
  })
}

function validCriticOutput(overrides = {}) {
  return {
    verdict: 'pass',
    reason_codes: [],
    unsupported_claim_indexes: [],
    missing_grounded_claim: false,
    claim_source_mismatch: false,
    semantic_mismatch: false,
    repeated_resolved_question: false,
    commitment_assumption: false,
    seller_intent_became_fact: false,
    method_violation: false,
    concise_feedback: null,
    ...overrides,
  }
}

test(
  'V2 critic executor: veredito pass válido é aceito',
  async () => {
    const plan = buildPlan()

    const result =
      await executeMessageIntelligenceV2CriticAttempt(
        {
          plan,
          provider: fakeProvider(
            validCriticOutput(),
          ),
        },
      )

    assert.equal(
      result.output.verdict,
      'pass',
    )
    assert.equal(
      result.output.concise_feedback,
      null,
    )
    assert.equal(
      result.execution.provider,
      'fake',
    )
  },
)

test(
  'V2 critic executor: veredito repair com concise_feedback é aceito',
  async () => {
    const plan = buildPlan()

    const result =
      await executeMessageIntelligenceV2CriticAttempt(
        {
          plan,
          provider: fakeProvider(
            validCriticOutput({
              verdict: 'repair',
              reason_codes: [
                'semantic_mismatch',
                'unsupported_claim',
              ],
              semantic_mismatch: true,
              unsupported_claim_indexes: [0],
              concise_feedback:
                'A claim usa um adjetivo não sustentado.',
            }),
          ),
        },
      )

    assert.equal(
      result.output.verdict,
      'repair',
    )
    assert.deepEqual(
      result.output
        .unsupported_claim_indexes,
      [0],
    )
  },
)

test(
  'V2 critic executor: verdict inválido é rejeitado',
  async () => {
    const plan = buildPlan()

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider: fakeProvider(
              validCriticOutput({
                verdict: 'maybe',
              }),
            ),
          },
        ),
      MessageIntelligenceV2CriticExecutionError,
    )
  },
)

test(
  'V2 critic executor: reason_code fora do enum é rejeitado',
  async () => {
    const plan = buildPlan()

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider: fakeProvider(
              validCriticOutput({
                reason_codes: [
                  'algo_inventado',
                ],
              }),
            ),
          },
        ),
      MessageIntelligenceV2CriticExecutionError,
    )
  },
)

test(
  'V2 critic executor: unsupported_claim_indexes fora do intervalo de grounded_claims é rejeitado',
  async () => {
    const plan = buildPlan()

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider: fakeProvider(
              validCriticOutput({
                verdict: 'repair',
                concise_feedback: 'x',
                // plan.claim_count === 1, então o único índice válido é 0
                unsupported_claim_indexes: [
                  5,
                ],
              }),
            ),
          },
        ),
      MessageIntelligenceV2CriticExecutionError,
    )
  },
)

test(
  'V2 critic executor: concise_feedback null com verdict != pass é rejeitado',
  async () => {
    const plan = buildPlan()

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider: fakeProvider(
              validCriticOutput({
                verdict: 'block',
                concise_feedback: null,
              }),
            ),
          },
        ),
      MessageIntelligenceV2CriticExecutionError,
    )
  },
)

test(
  'V2 critic executor: campo obrigatório ausente é rejeitado',
  async () => {
    const plan = buildPlan()
    const { method_violation, ...missingField } =
      validCriticOutput()
    void method_violation

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider: fakeProvider(
              missingField,
            ),
          },
        ),
      MessageIntelligenceV2CriticExecutionError,
    )
  },
)

test(
  'V2 critic executor: sem repair próprio — uma única chamada, JSON malformado propaga o erro imediatamente',
  async () => {
    const plan = buildPlan()

    let calls = 0

    const provider = async () => {
      calls += 1
      return {
        content: 'isso não é JSON',
        provider: 'fake',
        model: 'fake-critic-model',
        request_id: 'req',
        usage: null,
      }
    }

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider,
          },
        ),
      MessageIntelligenceV2CriticExecutionError,
    )

    assert.equal(calls, 1)
  },
)

test(
  'V2 critic executor: verdict=pass com missing_grounded_claim=true é rejeitado',
  async () => {
    const plan = buildPlan()

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider: fakeProvider(
              validCriticOutput({
                verdict: 'pass',
                missing_grounded_claim: true,
              }),
            ),
          },
        ),
      error => {
        assert.equal(
          error.code,
          'INVALID_V2_CRITIC_OUTPUT_INCONSISTENT',
        )
        return true
      },
    )
  },
)

test(
  'V2 critic executor: verdict=pass com reason_codes não vazio é rejeitado',
  async () => {
    const plan = buildPlan()

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider: fakeProvider(
              validCriticOutput({
                verdict: 'pass',
                reason_codes: ['other'],
              }),
            ),
          },
        ),
      error => {
        assert.equal(
          error.code,
          'INVALID_V2_CRITIC_OUTPUT_INCONSISTENT',
        )
        return true
      },
    )
  },
)

test(
  'V2 critic executor: verdict=pass com unsupported_claim_indexes não vazio é rejeitado',
  async () => {
    const plan = buildPlan()

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider: fakeProvider(
              validCriticOutput({
                verdict: 'pass',
                unsupported_claim_indexes: [
                  0,
                ],
              }),
            ),
          },
        ),
      error => {
        assert.equal(
          error.code,
          'INVALID_V2_CRITIC_OUTPUT_INCONSISTENT',
        )
        return true
      },
    )
  },
)

test(
  'V2 critic executor: verdict=pass com concise_feedback não nulo é rejeitado',
  async () => {
    const plan = buildPlan()

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider: fakeProvider(
              validCriticOutput({
                verdict: 'pass',
                concise_feedback:
                  'Isso não deveria existir num pass.',
              }),
            ),
          },
        ),
      error => {
        assert.equal(
          error.code,
          'INVALID_V2_CRITIC_OUTPUT_INCONSISTENT',
        )
        return true
      },
    )
  },
)

test(
  'V2 critic executor: verdict=repair sem nenhum sinal de falha é rejeitado',
  async () => {
    const plan = buildPlan()

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider: fakeProvider(
              validCriticOutput({
                verdict: 'repair',
                concise_feedback:
                  'Feedback presente, mas nenhum sinal concreto.',
              }),
            ),
          },
        ),
      error => {
        assert.equal(
          error.code,
          'INVALID_V2_CRITIC_OUTPUT_INCONSISTENT',
        )
        return true
      },
    )
  },
)

test(
  'V2 critic executor: verdict=block sem nenhum sinal de falha é rejeitado',
  async () => {
    const plan = buildPlan()

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider: fakeProvider(
              validCriticOutput({
                verdict: 'block',
                concise_feedback:
                  'Feedback presente, mas nenhum sinal concreto.',
              }),
            ),
          },
        ),
      error => {
        assert.equal(
          error.code,
          'INVALID_V2_CRITIC_OUTPUT_INCONSISTENT',
        )
        return true
      },
    )
  },
)

test(
  'V2 critic executor: boolean true sem reason_code correspondente é rejeitado',
  async () => {
    const plan = buildPlan()

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider: fakeProvider(
              validCriticOutput({
                verdict: 'repair',
                method_violation: true,
                // reason_codes não contém 'method_violation'
                reason_codes: [
                  'semantic_mismatch',
                ],
                concise_feedback:
                  'Viola comportamento, mas o reason_code não bate.',
              }),
            ),
          },
        ),
      error => {
        assert.equal(
          error.code,
          'INVALID_V2_CRITIC_OUTPUT_INCONSISTENT',
        )
        return true
      },
    )
  },
)

test(
  'V2 critic executor: unsupported_claim_indexes não vazio sem reason_code correspondente é rejeitado',
  async () => {
    const plan = buildPlan()

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2CriticAttempt(
          {
            plan,
            provider: fakeProvider(
              validCriticOutput({
                verdict: 'repair',
                unsupported_claim_indexes: [
                  0,
                ],
                reason_codes: [
                  'method_violation',
                ],
                method_violation: true,
                concise_feedback:
                  'Índice de claim não sustentado sem reason_code compatível.',
              }),
            ),
          },
        ),
      error => {
        assert.equal(
          error.code,
          'INVALID_V2_CRITIC_OUTPUT_INCONSISTENT',
        )
        return true
      },
    )
  },
)
