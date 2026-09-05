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
    // A mensagem padrão faz uma afirmação de valor/benefício, então
    // precisa de uma grounded_claim realmente sustentada pelo produto do
    // fixture (cujo texto contém "Plano Exemplo" / "Acompanhamento
    // estruturado").
    grounded_claims: [
      {
        claim:
          'O plano inclui acompanhamento estruturado durante todo o processo.',
        supported_by: {
          source: 'product',
          id: evidence.product_ids[0],
        },
      },
    ],
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

test(
  'V2 executor: afirmação factual sem nenhuma grounded_claim declarada é rejeitada',
  async () => {
    const plan = buildPlan(priceScenario)
    const good = generatedOutput(plan, {
      grounded_claims: [],
      suggested_message:
        'O sistema integra automaticamente com qualquer ERP, então não tem com o que se preocupar.',
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
          'V2_UNGROUNDED_FACTUAL_CLAIM',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: grounded_claim citando produto real que não sustenta a funcionalidade afirmada é rejeitada',
  async () => {
    const plan = buildPlan(priceScenario)
    const good = generatedOutput(plan, {
      grounded_claims: [
        {
          claim:
            'O sistema integra automaticamente com qualquer ERP do mercado.',
          supported_by: {
            source: 'product',
            id: plan.normalization_context
              .allowed_evidence
              .product_ids[0],
          },
        },
      ],
      suggested_message:
        'O sistema integra automaticamente com qualquer ERP do mercado, então não tem com o que se preocupar.',
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
          'V2_UNGROUNDED_FACTUAL_CLAIM',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: desconto genérico sem grounded_claim é rejeitado mesmo sem número explícito',
  async () => {
    const plan = buildPlan(priceScenario)
    const good = generatedOutput(plan, {
      grounded_claims: [],
      suggested_message:
        'Consigo liberar um desconto especial pra você fechar hoje.',
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
          'V2_UNGROUNDED_FACTUAL_CLAIM',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: garantia/ROI genérico sem grounded_claim é rejeitado',
  async () => {
    const plan = buildPlan(priceScenario)
    const good = generatedOutput(plan, {
      grounded_claims: [],
      suggested_message:
        'Garanto que o retorno sobre o investimento vem em poucos meses.',
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
          'V2_UNGROUNDED_FACTUAL_CLAIM',
        )
        return true
      },
    )
  },
)

test(
  'V2 executor: safety_self_check com qualquer campo false é rejeitado',
  async () => {
    const plan = buildPlan(priceScenario)

    for (
      const field of [
        'no_unsupported_commercial_claim',
        'no_commitment_assumed_beyond_evidence',
        'no_resolved_question_repeated',
      ]
    ) {
      const good = generatedOutput(plan, {
        safety_self_check: {
          ...safetySelfCheck(),
          [field]: false,
        },
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
            'V2_SAFETY_SELF_CHECK_NEGATIVE',
          )
          return true
        },
        `esperava rejeição para ${field}=false`,
      )
    }
  },
)

test(
  'V2 executor: claim declarada e sustentada pela fonte real passa (caso positivo de precisão)',
  async () => {
    const plan = buildPlan(priceScenario)
    const productId =
      plan.normalization_context
        .allowed_evidence.product_ids[0]

    const good = generatedOutput(plan, {
      grounded_claims: [
        {
          claim:
            'O plano oferece acompanhamento estruturado ao longo do processo comercial.',
          supported_by: {
            source: 'product',
            id: productId,
          },
        },
      ],
      suggested_message:
        'Esse valor cobre um acompanhamento estruturado ao longo de todo o processo — faz sentido pra você?',
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

// ============================================================================
// Deterministic repair — previous_rejected_candidate (Round 3, P0-B/P0-C)
//
// Até aqui o repair determinístico sabia QUAL regra falhou (failure code/
// path/invariant), mas não sabia O QUE o modelo escreveu que falhou — a
// saída bruta da primeira tentativa era descartada. Estes testes provam que
// a candidate rejeitada agora atravessa para a segunda tentativa (snapshot
// seguro, nunca como evidência), sem relaxar nenhum gate determinístico e
// sem abrir uma terceira geração.
// ============================================================================

function recordingProvider(outputs) {
  const calls = []

  const provider = async args => {
    calls.push(args)

    const index = Math.min(
      calls.length - 1,
      outputs.length - 1,
    )

    const next = outputs[index]

    if (next.raw_content !== undefined) {
      return {
        content: next.raw_content,
        provider: 'fake',
        model: 'fake-model-v2',
        request_id: `req-${calls.length}`,
        usage: {
          input_tokens: 120,
          output_tokens: 80,
          total_tokens: 200,
        },
      }
    }

    return {
      content: JSON.stringify(next.output),
      provider: 'fake',
      model: 'fake-model-v2',
      request_id: `req-${calls.length}`,
      usage: {
        input_tokens: 120,
        output_tokens: 80,
        total_tokens: 200,
      },
    }
  }

  provider.calls = calls

  return provider
}

test(
  'V2 executor: repair determinístico recebe a candidate rejeitada e corrige o fato protegido não sustentado (protected fact repair)',
  async () => {
    const plan = buildPlan(priceScenario)

    const rejected = generatedOutput(plan, {
      suggested_message:
        'Consigo fechar por R$ 50,00 esse mês, além do acompanhamento estruturado que já conversamos. Topa?',
    })

    const repaired = generatedOutput(plan, {
      suggested_message:
        'O valor cobre o acompanhamento estruturado durante todo o processo. Topa a gente seguir com isso?',
    })

    const provider = recordingProvider([
      { output: rejected },
      { output: repaired },
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
    assert.equal(
      result.execution.repair_reason,
      'deterministic',
    )
    assert.equal(
      result.output.suggested_message,
      repaired.suggested_message,
    )

    assert.equal(provider.calls.length, 2)

    const repairPayload = JSON.parse(
      provider.calls[1].user_prompt,
    )

    assert.ok(
      repairPayload.previous_rejected_candidate,
      'previous_rejected_candidate deveria estar presente no repair',
    )
    assert.equal(
      repairPayload.previous_rejected_candidate
        .suggested_message,
      rejected.suggested_message,
    )
    assert.equal(
      repairPayload.repair_context
        .previous_failure_code,
      'V2_UNSUPPORTED_PROTECTED_FACT',
    )

    // previous_rejected_candidate nunca pode virar/alterar evidência —
    // continua isolado dos blocos confiáveis do payload.
    assert.ok(
      !(
        'previous_rejected_candidate' in
        repairPayload.commercial_context
      ),
    )
    assert.ok(
      !(
        'previous_rejected_candidate' in
        repairPayload.commercial_state
      ),
    )
    assert.ok(
      !(
        'previous_rejected_candidate' in
        repairPayload.allowed_evidence
      ),
    )
    assert.deepEqual(
      repairPayload.allowed_evidence,
      JSON.parse(plan.user_prompt)
        .allowed_evidence,
    )
  },
)

test(
  'V2 executor: repair determinístico recebe a candidate rejeitada e corrige a grounded_claim não sustentada (grounded claim repair)',
  async () => {
    const plan = buildPlan(priceScenario)
    const productId =
      plan.normalization_context
        .allowed_evidence.product_ids[0]

    const rejected = generatedOutput(plan, {
      grounded_claims: [
        {
          claim:
            'O sistema integra automaticamente com qualquer ERP do mercado.',
          supported_by: {
            source: 'product',
            id: productId,
          },
        },
      ],
      suggested_message:
        'O sistema integra automaticamente com qualquer ERP do mercado, então não tem com o que se preocupar.',
    })

    const repaired = generatedOutput(plan, {
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
      suggested_message:
        'O plano inclui acompanhamento estruturado durante todo o processo, isso já ajuda no que você precisa?',
    })

    const provider = recordingProvider([
      { output: rejected },
      { output: repaired },
    ])

    const result =
      await executeMessageIntelligenceV2Plan({
        plan,
        provider,
      })

    assert.equal(result.execution.attempts, 2)
    assert.equal(
      result.output.suggested_message,
      repaired.suggested_message,
    )

    const repairPayload = JSON.parse(
      provider.calls[1].user_prompt,
    )

    assert.equal(
      repairPayload.previous_rejected_candidate
        .grounded_claims[0].claim,
      rejected.grounded_claims[0].claim,
    )
    assert.equal(
      repairPayload.repair_context
        .previous_failure_code,
      'V2_UNGROUNDED_FACTUAL_CLAIM',
    )
  },
)

test(
  'V2 executor: primeira tentativa sem JSON parseável não tem previous_rejected_candidate, mas o repair continua funcionando (invalid JSON fallback)',
  async () => {
    const plan = buildPlan(priceScenario)
    const repaired = generatedOutput(plan)

    const provider = recordingProvider([
      { raw_content: 'isso não é JSON' },
      { output: repaired },
    ])

    const result =
      await executeMessageIntelligenceV2Plan({
        plan,
        provider,
      })

    assert.equal(result.execution.attempts, 2)
    assert.equal(
      result.output.suggested_message,
      repaired.suggested_message,
    )

    const repairPayload = JSON.parse(
      provider.calls[1].user_prompt,
    )

    assert.ok(
      !(
        'previous_rejected_candidate' in
        repairPayload
      ),
    )
    assert.equal(
      repairPayload.repair_context
        .previous_failure_code,
      'INVALID_V2_JSON',
    )
  },
)

test(
  'V2 executor: candidate rejeitada com campo ausente/tipo inválido não quebra a projeção segura (malformed candidate)',
  async () => {
    const plan = buildPlan(priceScenario)

    const rejected = generatedOutput(plan, {
      // suggested_message com tipo inválido (não é string) e
      // grounded_claims parcialmente malformado — a saída foi rejeitada
      // exatamente por isso; a projeção segura precisa lidar com isso sem
      // lançar exceção.
      suggested_message: 12345,
      grounded_claims: [
        { claim: 'ok', supported_by: 'não é objeto' },
        'nem é um objeto',
      ],
    })

    const repaired = generatedOutput(plan)

    const provider = recordingProvider([
      { output: rejected },
      { output: repaired },
    ])

    const result =
      await executeMessageIntelligenceV2Plan({
        plan,
        provider,
      })

    assert.equal(result.execution.attempts, 2)
    assert.equal(
      result.output.suggested_message,
      repaired.suggested_message,
    )

    const repairPayload = JSON.parse(
      provider.calls[1].user_prompt,
    )

    assert.equal(
      repairPayload.previous_rejected_candidate
        .suggested_message,
      null,
    )
    assert.equal(
      repairPayload.previous_rejected_candidate
        .grounded_claims[0].claim,
      'ok',
    )
    assert.equal(
      repairPayload.previous_rejected_candidate
        .grounded_claims[0].supported_by,
      null,
    )
  },
)

test(
  'V2 executor: segunda tentativa também inválida continua falhando, sem terceira geração (bounded retry)',
  async () => {
    const plan = buildPlan(priceScenario)

    const rejected = generatedOutput(plan, {
      suggested_message:
        'Consigo fechar por R$ 50,00 esse mês.',
    })

    const provider = recordingProvider([
      { output: rejected },
      { output: rejected },
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

    assert.equal(provider.calls.length, 2)

    const repairPayload = JSON.parse(
      provider.calls[1].user_prompt,
    )

    assert.equal(
      repairPayload.previous_rejected_candidate
        .suggested_message,
      rejected.suggested_message,
    )
  },
)

// ============================================================================
// P1 — Protected facts: comparação por token completo canonicalizado, nunca
// por substring. "R$ 50" não pode ser aceito só porque "R$ 500" existe no
// contexto, nem "10%" só porque "110%" existe.
// ============================================================================

test(
  'V2 executor: P1 — R$ 50 na mensagem não é sustentado por R$ 500 no contexto (substring não é prova)',
  async () => {
    const plan = buildPlan(priceScenario)
    plan.normalization_context.grounding_text +=
      '\n"R$ 500"'

    const bad = generatedOutput(plan, {
      suggested_message:
        'Consigo fechar por R$ 50 esse mês, além do acompanhamento estruturado.',
    })

    const provider = queueProvider([
      { output: bad },
      { output: bad },
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
  'V2 executor: P1 — 10% na mensagem não é sustentado por 110% no contexto (substring não é prova)',
  async () => {
    const plan = buildPlan(priceScenario)
    plan.normalization_context.grounding_text +=
      '\n"110%"'

    const bad = generatedOutput(plan, {
      suggested_message:
        'Nessa condição o desconto aplicado é de 10%, faz sentido pra você?',
    })

    const provider = queueProvider([
      { output: bad },
      { output: bad },
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
  'V2 executor: P1 — mesmo valor protegido do contexto passa (R$ 500 == R$ 500)',
  async () => {
    const plan = buildPlan(priceScenario)
    plan.normalization_context.grounding_text +=
      '\n"R$ 500"'

    const good = generatedOutput(plan, {
      suggested_message:
        'Consigo fechar por R$ 500 esse mês, além do acompanhamento estruturado.',
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
  'V2 executor: P1 — múltiplos protected facts: todos precisam existir no contexto, um ausente já falha',
  async () => {
    const plan = buildPlan(priceScenario)
    plan.normalization_context.grounding_text +=
      '\n"R$ 500" "10%"'

    // R$ 500 está sustentado, mas 20% não bate com o único percentual do
    // contexto (10%) — um protected fact não sustentado já é suficiente
    // para falhar, mesmo com outro sustentado.
    const bad = generatedOutput(plan, {
      suggested_message:
        'O valor é R$ 500, com desconto de 20% esse mês.',
    })

    const provider = queueProvider([
      { output: bad },
      { output: bad },
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
  'V2 executor: P1 — repair determinístico corrige fato protegido não sustentado (comparação por token, não substring)',
  async () => {
    const plan = buildPlan(priceScenario)
    plan.normalization_context.grounding_text +=
      '\n"R$ 500"'

    const rejected = generatedOutput(plan, {
      suggested_message:
        'Consigo fechar por R$ 50 esse mês.',
    })

    const repaired = generatedOutput(plan, {
      suggested_message:
        'O valor é de R$ 500, além do acompanhamento estruturado.',
    })

    const provider = queueProvider([
      { output: rejected },
      { output: repaired },
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
    assert.equal(
      result.execution.repair_reason,
      'deterministic',
    )
    assert.equal(
      result.output.suggested_message,
      repaired.suggested_message,
    )
  },
)

// ============================================================================
// P2 — Uma grounded_claim citando memória histórica (resolved/superseded)
// precisa ser rejeitada: allowed_evidence.memory_ids só contém memória
// active (ver execution-plan.test.mjs para a cobertura de
// buildAllowedEvidence em si).
// ============================================================================

function memoryItem({
  memory_id,
  memory_status,
  summary = 'Item de memória de teste.',
}) {
  return {
    memory_id,
    collection: 'needs',
    kind: 'test_kind',
    summary,
    value: null,
    confidence: null,
    memory_status,
    created_in_state_version: 1,
    updated_in_state_version: 1,
    closed_in_state_version: null,
    evidence_message_ids: [],
    attributes: {},
    provenance: [],
  }
}

function buildPlanWithHistoricalMemory(
  scenario,
) {
  const snapshot = scenario.build()

  snapshot.customer.resolved_information = [
    ...snapshot.customer
      .resolved_information,
    memoryItem({
      memory_id: 'memory-resolved-1',
      memory_status: 'resolved',
      summary:
        'Cliente já disse que o valor é R$ 199,90.',
    }),
  ]

  snapshot.customer.superseded_information = [
    ...snapshot.customer
      .superseded_information,
    memoryItem({
      memory_id: 'memory-superseded-1',
      memory_status: 'superseded',
      summary:
        'Cliente havia dito algo que depois mudou.',
    }),
  ]

  return buildMessageIntelligenceV2ExecutionPlan(
    { snapshot },
  )
}

test(
  'V2 executor: P2 — grounded_claim citando memória resolved é rejeitada',
  async () => {
    const plan =
      buildPlanWithHistoricalMemory(
        priceScenario,
      )

    const bad = generatedOutput(plan, {
      grounded_claims: [
        {
          claim:
            'Cliente já disse que o valor é R$ 199,90.',
          supported_by: {
            source: 'memory',
            id: 'memory-resolved-1',
          },
        },
      ],
    })

    const provider = queueProvider([
      { output: bad },
      { output: bad },
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
  'V2 executor: P2 — grounded_claim citando memória superseded é rejeitada',
  async () => {
    const plan =
      buildPlanWithHistoricalMemory(
        priceScenario,
      )

    const bad = generatedOutput(plan, {
      grounded_claims: [
        {
          claim:
            'Cliente havia dito algo que depois mudou.',
          supported_by: {
            source: 'memory',
            id: 'memory-superseded-1',
          },
        },
      ],
    })

    const provider = queueProvider([
      { output: bad },
      { output: bad },
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

// ============================================================================
// Regressão de terceira revisão: afirmação factual/comercial sem nenhuma
// grounded_claim nunca pode surgir como generated — reforça a cobertura já
// existente com o exemplo literal auditado (garantia sem evidência).
// ============================================================================

test(
  'V2 executor: regressão — afirmação comercial sem grounded_claims nunca surge como generated (garantia sem evidência)',
  async () => {
    const plan = buildPlan(priceScenario)

    const bad = generatedOutput(plan, {
      grounded_claims: [],
      suggested_message:
        'O plano tem garantia vitalícia, então você não precisa se preocupar depois.',
    })

    const provider = queueProvider([
      { output: bad },
      { output: bad },
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
          'V2_UNGROUNDED_FACTUAL_CLAIM',
        )
        return true
      },
    )
  },
)
