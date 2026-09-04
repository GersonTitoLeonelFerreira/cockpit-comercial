// Testes de invariantes do executor do Message Intelligence Engine V2.
//
// O modelo real é não determinístico — estes testes usam um provider fake
// e cobrem apenas o que precisa ser sempre verdade: evidência existe,
// grounded_claims referenciam fonte real, fatos protegidos sustentados,
// disciplina de commitment_status, sem vazamento de internals, gate de
// papel/relevância canônico neutraliza o modelo, repair único, erro de
// provedor não reparável não tenta repair. Qualidade semântica real é
// avaliada pelo eval ao vivo / simulador, não por assert.equal de texto.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageIntelligenceV2ExecutionPlan,
} from './execution-plan.ts'

import {
  executeMessageIntelligenceV2Plan,
  MessageIntelligenceV2ExecutionError,
} from './executor.ts'

import {
  StatefulCopilotExecutionError,
} from '../../stateful-copilot-executor.ts'

import {
  angryCustomerScenario,
  cancelledCommitmentScenario,
  coldFollowUpScenario,
  confirmedCommitmentScenario,
  priceScenario,
  rescheduleRequestedScenario,
  vagueDoubtScenario,
} from './fixtures.ts'

function safetySelfCheck() {
  return {
    no_unsupported_commercial_claim: true,
    no_commitment_assumed_beyond_evidence: true,
    no_resolved_question_repeated: true,
  }
}

function silenceOutput() {
  return {
    intervention_needed: false,
    current_turn_relevance: 'commercial',
    customer_meaning: 'Cliente apenas avisou algo operacional.',
    seller_intent_interpretation:
      'Vendedor quer apenas reconhecer a mensagem.',
    recommended_commercial_objective: null,
    method_alignment_summary: null,
    evidence_message_ids: [],
    evidence_memory_ids: [],
    grounded_claims: [],
    safety_self_check: safetySelfCheck(),
    suggested_message: null,
  }
}

function generatedOutput(plan, overrides = {}) {
  const evidence =
    plan.normalization_context.allowed_evidence

  return {
    intervention_needed: true,
    current_turn_relevance: 'commercial',
    customer_meaning:
      'Cliente concordou com a proposta, mas questiona o valor.',
    seller_intent_interpretation:
      'Vendedor quer justificar o valor sem pressionar.',
    recommended_commercial_objective:
      'address_objection',
    method_alignment_summary: null,
    evidence_message_ids: evidence.message_ids,
    evidence_memory_ids: [],
    grounded_claims: [],
    safety_self_check: safetySelfCheck(),
    suggested_message:
      'Faz sentido perguntar! O valor cobre o acompanhamento estruturado durante todo o processo. Consigo detalhar melhor algum ponto específico?',
    ...overrides,
  }
}

function queueProvider(responses) {
  let calls = 0

  const provider = async () => {
    const index = Math.min(
      calls,
      responses.length - 1,
    )

    const next = responses[index]

    calls += 1

    if (next.throw) {
      throw next.throw
    }

    return {
      content: JSON.stringify(next.output),
      provider: 'fake',
      model: 'fake-model-v2',
      request_id: `req-${calls}`,
      usage: {
        input_tokens: 120,
        output_tokens: 80,
        total_tokens: 200,
      },
    }
  }

  provider.callCount = () => calls

  return provider
}

function buildPlan(scenario) {
  return buildMessageIntelligenceV2ExecutionPlan({
    snapshot: scenario.build(),
  })
}

test(
  'V2 executor: output válido de intervenção passa na primeira tentativa',
  async () => {
    const plan = buildPlan(priceScenario)
    const provider = queueProvider([
      { output: generatedOutput(plan) },
    ])

    const result =
      await executeMessageIntelligenceV2Plan({
        plan,
        provider,
      })

    assert.equal(
      result.output.intervention_needed,
      true,
    )
    assert.equal(
      typeof result.output.suggested_message,
      'string',
    )
    assert.equal(result.execution.attempts, 1)
    assert.equal(
      result.execution.recovered_after_retry,
      false,
    )
    assert.equal(provider.callCount(), 1)
  },
)

test(
  'V2 executor: silêncio válido (intervention_needed=false) passa',
  async () => {
    const plan = buildPlan(vagueDoubtScenario)
    const provider = queueProvider([
      { output: silenceOutput() },
    ])

    const result =
      await executeMessageIntelligenceV2Plan({
        plan,
        provider,
      })

    assert.equal(
      result.output.intervention_needed,
      false,
    )
    assert.equal(
      result.output.suggested_message,
      null,
    )
  },
)

test(
  'V2 executor: campo obrigatório ausente repara uma vez e passa',
  async () => {
    const plan = buildPlan(priceScenario)
    const good = generatedOutput(plan)
    const { method_alignment_summary, ...missingField } =
      good
    void method_alignment_summary

    const provider = queueProvider([
      { output: missingField },
      { output: good },
    ])

    const result =
      await executeMessageIntelligenceV2Plan({
        plan,
        provider,
      })

    assert.equal(result.execution.attempts, 2)
    assert.equal(
      result.execution.recovered_after_retry,
      true,
    )
    assert.equal(provider.callCount(), 2)
  },
)

test(
  'V2 executor: campo obrigatório ausente nas duas tentativas falha sem terceira chamada',
  async () => {
    const plan = buildPlan(priceScenario)
    const good = generatedOutput(plan)
    const { method_alignment_summary, ...missingField } =
      good
    void method_alignment_summary

    const provider = queueProvider([
      { output: missingField },
      { output: missingField },
    ])

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2Plan({
          plan,
          provider,
        }),
      MessageIntelligenceV2ExecutionError,
    )

    assert.equal(provider.callCount(), 2)
  },
)

test(
  'V2 executor: campo extra não autorizado é rejeitado',
  async () => {
    const plan = buildPlan(priceScenario)
    const good = generatedOutput(plan)

    const provider = queueProvider([
      {
        output: {
          ...good,
          unexpected_field: 'nao deveria existir',
        },
      },
      { output: good },
    ])

    const result =
      await executeMessageIntelligenceV2Plan({
        plan,
        provider,
      })

    assert.equal(
      result.execution.recovered_after_retry,
      true,
    )
  },
)

test(
  'V2 executor: message_id inexistente em evidence_message_ids é rejeitado',
  async () => {
    const plan = buildPlan(priceScenario)
    const good = generatedOutput(plan, {
      evidence_message_ids: [
        'message-id-inexistente',
      ],
    })

    const provider = queueProvider([
      { output: good },
      { output: good },
    ])

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2Plan({
          plan,
          provider,
        }),
      error => {
        assert.equal(
          error.code,
          'V2_EVIDENCE_MESSAGE_UNAUTHORIZED',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: memory_id inexistente em evidence_memory_ids é rejeitado',
  async () => {
    const plan = buildPlan(priceScenario)
    const good = generatedOutput(plan, {
      evidence_memory_ids: [
        'memory-id-inexistente',
      ],
    })

    const provider = queueProvider([
      { output: good },
      { output: good },
    ])

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2Plan({
          plan,
          provider,
        }),
      error => {
        assert.equal(
          error.code,
          'V2_EVIDENCE_MEMORY_UNAUTHORIZED',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: grounded_claims com referência de produto inexistente é rejeitado',
  async () => {
    const plan = buildPlan(priceScenario)
    const good = generatedOutput(plan, {
      grounded_claims: [
        {
          claim: 'O plano inclui suporte 24h.',
          supported_by: {
            source: 'product',
            id: 'produto-inexistente',
          },
        },
      ],
    })

    const provider = queueProvider([
      { output: good },
      { output: good },
    ])

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2Plan({
          plan,
          provider,
        }),
      error => {
        assert.equal(
          error.code,
          'V2_GROUNDED_CLAIM_REF_INVALID',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: seller_intent nunca é uma fonte de evidência válida',
  async () => {
    const plan = buildPlan(priceScenario)

    // seller_intent nunca é adicionado a nenhum conjunto de
    // allowed_evidence — logo qualquer tentativa de citá-lo como memória
    // ou mensagem falha na mesma checagem estrutural de referência.
    const good = generatedOutput(plan, {
      grounded_claims: [
        {
          claim: 'O vendedor quer confirmar o agendamento.',
          supported_by: {
            source: 'memory',
            id: 'seller_intent',
          },
        },
      ],
    })

    const provider = queueProvider([
      { output: good },
      { output: good },
    ])

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2Plan({
          plan,
          provider,
        }),
      error => {
        assert.equal(
          error.code,
          'V2_GROUNDED_CLAIM_REF_INVALID',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: valor monetário não sustentado pelo contexto publicado é rejeitado',
  async () => {
    const plan = buildPlan(priceScenario)
    const good = generatedOutput(plan, {
      suggested_message:
        'Consigo fechar por R$ 50,00 esse mês, topa?',
    })

    const provider = queueProvider([
      { output: good },
      { output: good },
    ])

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2Plan({
          plan,
          provider,
        }),
      error => {
        assert.equal(
          error.code,
          'V2_UNSUPPORTED_PROTECTED_FACT',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: fato protegido sustentado pelo estado comercial ativo passa',
  async () => {
    const plan = buildPlan(priceScenario)

    // "10%" aparece literalmente no fact_value já carregado no contexto de
    // grounding (serializado a partir de commercial_state), então a
    // checagem de substring encontra sustentação real.
    plan.normalization_context.grounding_text +=
      '\n"10%"'

    const good = generatedOutput(plan, {
      suggested_message:
        'Nessa condição o desconto aplicado é de 10%, faz sentido pra você?',
    })

    const provider = queueProvider([
      { output: good },
    ])

    const result =
      await executeMessageIntelligenceV2Plan({
        plan,
        provider,
      })

    assert.equal(
      result.output.suggested_message,
      good.suggested_message,
    )
  },
)

test(
  'V2 executor: linguagem de confirmação sem compromisso confirmado é rejeitada (proposed != confirmed)',
  async () => {
    const plan = buildPlan(coldFollowUpScenario)
    const good = generatedOutput(plan, {
      evidence_memory_ids:
        plan.normalization_context.allowed_evidence
          .memory_ids,
      suggested_message:
        'Oi! Sem problema, ficou combinado então: seguimos com o que já tínhamos alinhado.',
    })

    const provider = queueProvider([
      { output: good },
      { output: good },
    ])

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2Plan({
          plan,
          provider,
        }),
      error => {
        assert.equal(
          error.code,
          'V2_UNSUPPORTED_COMMITMENT_CONFIRMATION',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: linguagem de confirmação com compromisso confirmed citado passa',
  async () => {
    const plan = buildPlan(
      confirmedCommitmentScenario,
    )

    const confirmedMemoryId =
      plan.normalization_context.commitments.find(
        commitment =>
          commitment.commitment_status ===
          'confirmed',
      )?.memory_id

    assert.ok(confirmedMemoryId)

    const good = generatedOutput(plan, {
      evidence_memory_ids: [confirmedMemoryId],
      suggested_message:
        'Combinado! Vamos seguir conforme confirmamos, qualquer coisa me avisa.',
    })

    const provider = queueProvider([
      { output: good },
    ])

    const result =
      await executeMessageIntelligenceV2Plan({
        plan,
        provider,
      })

    assert.equal(
      result.output.suggested_message,
      good.suggested_message,
    )
  },
)

test(
  'V2 executor: cancelled não pode ser tratado como compromisso ativo',
  async () => {
    const plan = buildPlan(
      cancelledCommitmentScenario,
    )

    const cancelledMemoryId =
      plan.normalization_context.commitments[0]
        .memory_id

    const good = generatedOutput(plan, {
      evidence_memory_ids: [cancelledMemoryId],
      suggested_message:
        'Perfeito, então está confirmado que seguimos com o que já tínhamos combinado.',
    })

    const provider = queueProvider([
      { output: good },
      { output: good },
    ])

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2Plan({
          plan,
          provider,
        }),
      error => {
        assert.equal(
          error.code,
          'V2_UNSUPPORTED_COMMITMENT_CONFIRMATION',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: reschedule_requested não confirma o horário original',
  async () => {
    const plan = buildPlan(
      rescheduleRequestedScenario,
    )

    const rescheduleMemoryId =
      plan.normalization_context.commitments[0]
        .memory_id

    const good = generatedOutput(plan, {
      evidence_memory_ids: [rescheduleMemoryId],
      suggested_message:
        'Show, então está confirmado que seguimos com o horário combinado original.',
    })

    const provider = queueProvider([
      { output: good },
      { output: good },
    ])

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2Plan({
          plan,
          provider,
        }),
      error => {
        assert.equal(
          error.code,
          'V2_UNSUPPORTED_COMMITMENT_CONFIRMATION',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: intervention_needed=false com mensagem sugerida é rejeitado',
  async () => {
    const plan = buildPlan(vagueDoubtScenario)
    const good = {
      ...silenceOutput(),
      suggested_message: 'Isso não deveria existir.',
    }

    const provider = queueProvider([
      { output: good },
      { output: good },
    ])

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2Plan({
          plan,
          provider,
        }),
      error => {
        assert.equal(
          error.code,
          'V2_NO_INTERVENTION_REQUIRES_SILENCE',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: mensagem que vaza internals é rejeitada',
  async () => {
    const plan = buildPlan(priceScenario)
    const good = generatedOutput(plan, {
      suggested_message:
        'Segundo o método, esse é o score de aderência do candidate.',
    })

    const provider = queueProvider([
      { output: good },
      { output: good },
    ])

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2Plan({
          plan,
          provider,
        }),
      error => {
        assert.equal(
          error.code,
          'V2_MESSAGE_LEAKS_INTERNALS',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: mensagem acima do limite de 900 caracteres é rejeitada',
  async () => {
    const plan = buildPlan(priceScenario)
    const good = generatedOutput(plan, {
      suggested_message: 'a'.repeat(901),
    })

    const provider = queueProvider([
      { output: good },
      { output: good },
    ])

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2Plan({
          plan,
          provider,
        }),
      error => {
        assert.equal(error.code, 'INVALID_V2_OUTPUT')
        return true
      },
    )
  },
)

test(
  'V2 executor: gate canônico de commercial_role neutraliza o modelo mesmo quando ele sugere mensagem',
  async () => {
    const plan = buildPlan(angryCustomerScenario)
    plan.normalization_context.canonical_commercial_role =
      'provider'

    const good = generatedOutput(plan)

    const provider = queueProvider([
      { output: good },
    ])

    const result =
      await executeMessageIntelligenceV2Plan({
        plan,
        provider,
      })

    assert.equal(
      result.output.intervention_needed,
      false,
    )
    assert.equal(
      result.output.suggested_message,
      null,
    )
  },
)

test(
  'V2 executor: gate canônico de commercial_relevance non_commercial neutraliza o modelo',
  async () => {
    const plan = buildPlan(angryCustomerScenario)
    plan.normalization_context.canonical_commercial_relevance =
      'non_commercial'

    const good = generatedOutput(plan)

    const provider = queueProvider([
      { output: good },
    ])

    const result =
      await executeMessageIntelligenceV2Plan({
        plan,
        provider,
      })

    assert.equal(
      result.output.intervention_needed,
      false,
    )
    assert.equal(
      result.output.suggested_message,
      null,
    )
  },
)

test(
  'V2 executor: erro de provedor não reparável não tenta uma segunda vez',
  async () => {
    const plan = buildPlan(priceScenario)

    const provider = queueProvider([
      {
        throw: new StatefulCopilotExecutionError({
          code: 'OPENAI_AUTHENTICATION_FAILED',
          message: 'A autenticação com a OpenAI falhou.',
          status_code: 401,
          retryable: false,
        }),
      },
      { output: generatedOutput(plan) },
    ])

    await assert.rejects(
      () =>
        executeMessageIntelligenceV2Plan({
          plan,
          provider,
        }),
      error => {
        assert.equal(
          error.code,
          'OPENAI_AUTHENTICATION_FAILED',
        )
        return true
      },
    )

    assert.equal(provider.callCount(), 1)
  },
)
