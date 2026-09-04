// Testes de integração do runner do Message Intelligence Engine V2.
//
// Usa um fetch_impl fake simulando a Responses API da OpenAI (mesmo
// contrato que createStatefulCopilotOpenAIProvider já espera) — sem rede,
// sem chave real. Cobre: config_not_ready, geração válida (critic pass),
// silêncio válido (critic nunca roda), saída malformada nunca chega ao
// seller, erro de provedor cai seguro, flags automáticos sempre false, e
// o fluxo completo do semantic critic (pass / repair único / block / sem
// terceira geração).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  runMessageIntelligenceV2,
} from './runner.ts'

import {
  priceScenario,
  vagueDoubtScenario,
} from './fixtures.ts'

import {
  buildMessageIntelligenceRequestFixture,
} from '../fixtures.ts'

const PRODUCT_ID =
  '70000000-0000-4000-8000-000000000001'

function baseRequest(overrides = {}) {
  return {
    ...buildMessageIntelligenceRequestFixture(),
    ...overrides,
  }
}

function fakeOpenAIResponse({
  outputObject,
  model = 'fake-model-v2',
  requestId = 'resp-fake-1',
  status = 200,
}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: header =>
        header === 'x-request-id'
          ? requestId
          : null,
    },
    text: async () =>
      JSON.stringify({
        object: 'response',
        status: 'completed',
        id: requestId,
        model,
        usage: {
          input_tokens: 300,
          output_tokens: 120,
          total_tokens: 420,
        },
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify(
                  outputObject,
                ),
              },
            ],
          },
        ],
      }),
  }
}

function fakeErrorResponse({
  status,
  body = {},
}) {
  return {
    ok: false,
    status,
    headers: {
      get: () => null,
    },
    text: async () => JSON.stringify(body),
  }
}

function queueFetch(responses) {
  let calls = 0

  const fetchImpl = async () => {
    const index = Math.min(
      calls,
      responses.length - 1,
    )

    calls += 1

    return responses[index]
  }

  fetchImpl.callCount = () => calls

  return fetchImpl
}

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
    customer_meaning: 'Cliente ainda avalia, sem pergunta nova.',
    seller_intent_interpretation:
      'Vendedor quer entender melhor sem pressionar.',
    recommended_commercial_objective: null,
    method_alignment_summary: null,
    evidence_message_ids: [],
    evidence_memory_ids: [],
    grounded_claims: [],
    safety_self_check: safetySelfCheck(),
    suggested_message: null,
  }
}

function goodPrimaryOutput(overrides = {}) {
  return {
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
    // ID do produto do fixture base
    // (MESSAGE_INTELLIGENCE_FIXTURE_IDS.product_profile_id em
    // ../fixtures.ts) — a mensagem faz uma afirmação de valor/benefício,
    // então precisa de uma grounded_claim realmente sustentada por essa
    // fonte.
    grounded_claims: [
      {
        claim:
          'O plano inclui acompanhamento estruturado durante todo o processo.',
        supported_by: {
          source: 'product',
          id: PRODUCT_ID,
        },
      },
    ],
    safety_self_check: safetySelfCheck(),
    suggested_message:
      'Faz sentido perguntar! O valor cobre acompanhamento estruturado durante todo o processo.',
    ...overrides,
  }
}

function criticOutput({
  verdict = 'pass',
  reason_codes = [],
  unsupported_claim_indexes = [],
  concise_feedback = verdict === 'pass'
    ? null
    : 'Ajuste necessário.',
  ...rest
} = {}) {
  return {
    verdict,
    reason_codes,
    unsupported_claim_indexes,
    missing_grounded_claim: false,
    claim_source_mismatch: false,
    semantic_mismatch: false,
    repeated_resolved_question: false,
    commitment_assumption: false,
    seller_intent_became_fact: false,
    method_violation: false,
    concise_feedback,
    ...rest,
  }
}

// Fonte real usada pelo runner: reaproveita o mesmo par request/sources dos
// fixtures V1, mas com a conversa e o seller_intent do cenário V2. Como o
// runner monta o snapshot via assembleMessageContextSnapshotV1 a partir de
// sources, construímos um loader que devolve sources equivalentes ao que
// gerou o snapshot do cenário (mesmos IDs), evitando duas fontes distintas
// de verdade.
async function loadSourcesForScenario(scenario) {
  const fixturesModule = await import('../fixtures.ts')
  const sources =
    fixturesModule.buildMessageIntelligenceSourcesFixture()

  const snapshot = scenario.build()

  const realContext = sources.real_context

  realContext.diagnostic_input.conversation.messages =
    snapshot.conversation.messages.map(
      message => ({
        id: message.message_id,
        message_key: message.message_key,
        version: message.version,
        sequence: message.sequence,
        direction: message.direction,
        occurred_at: message.occurred_at,
        observed_at: message.observed_at,
        content_type: message.content_type,
        text_content: message.text_content,
        audio_transcription:
          message.audio_transcription,
      }),
    )

  const activeIds = snapshot.conversation.messages.map(
    message => message.message_id,
  )

  realContext.diagnostic_input.conversation.active_message_ids =
    activeIds
  realContext.known_message_ids = activeIds
  realContext.active_message_ids = activeIds

  realContext.state_read.state.commitments =
    snapshot.customer.commitments.map(item => ({
      id: item.memory_id,
      kind: item.kind,
      summary: item.summary,
      commitment_status:
        item.attributes.commitment_status,
      scheduled_at: null,
      proposed_at: null,
      evidence_message_ids:
        item.evidence_message_ids,
      memory_status: item.memory_status,
      created_in_state_version: 1,
      updated_in_state_version: 3,
      closed_in_state_version: null,
    }))

  return sources
}

function baseRunArgs({
  sources,
  scenario,
  fetch_impl,
}) {
  return {
    request: baseRequest({
      seller_intent: scenario.seller_intent,
    }),
    load_sources: async () => sources,
    env: {
      OPENAI_MESSAGE_INTELLIGENCE_MODEL:
        'gpt-mie-v2-fake',
    },
    provider_options: {
      api_key: 'fake-key',
      fetch_impl,
    },
  }
}

test(
  'V2 runner: sem modelo configurado retorna config_not_ready sem chamar o provedor',
  async () => {
    const sources = await loadSourcesForScenario(
      priceScenario,
    )

    let fetchCalls = 0

    const result = await runMessageIntelligenceV2({
      request: baseRequest({
        seller_intent:
          priceScenario.seller_intent,
      }),
      load_sources: async () => sources,
      env: {},
      provider_options: {
        fetch_impl: async () => {
          fetchCalls += 1
          throw new Error(
            'não deveria ser chamado',
          )
        },
      },
    })

    assert.equal(result.status, 'config_not_ready')
    assert.equal(result.final_message, null)
    assert.equal(fetchCalls, 0)
    assert.equal(result.critic, null)
    assert.equal(
      result.safety.would_surface_message,
      false,
    )
    assert.equal(result.safety.automatic_send, false)
  },
)

test(
  'V2 runner: critic aprova de primeira — 1 primary + 1 critic',
  async () => {
    const sources = await loadSourcesForScenario(
      priceScenario,
    )

    const fetchImpl = queueFetch([
      fakeOpenAIResponse({
        outputObject: goodPrimaryOutput(),
      }),
      fakeOpenAIResponse({
        outputObject: criticOutput({
          verdict: 'pass',
        }),
      }),
    ])

    const result = await runMessageIntelligenceV2(
      baseRunArgs({
        sources,
        scenario: priceScenario,
        fetch_impl: fetchImpl,
      }),
    )

    assert.equal(result.status, 'generated')
    assert.equal(
      typeof result.final_message,
      'string',
    )
    assert.equal(
      result.safety.would_surface_message,
      true,
    )
    assert.equal(result.safety.automatic_send, false)
    assert.equal(
      result.safety.automatic_crm_write,
      false,
    )
    assert.equal(
      result.safety.automatic_agenda_write,
      false,
    )
    assert.equal(
      result.model_config.model,
      'gpt-mie-v2-fake',
    )
    assert.equal(
      result.model_config.source,
      'message_intelligence_env',
    )
    assert.equal(result.execution.attempts, 1)
    assert.equal(
      result.execution.repair_reason,
      null,
    )
    assert.equal(
      result.critic.first.verdict,
      'pass',
    )
    assert.equal(result.critic.second, null)
    assert.equal(fetchImpl.callCount(), 2)
    assert.equal(
      typeof result.phase_durations_ms.primary,
      'number',
    )
    assert.equal(
      typeof result.phase_durations_ms
        .critic_first,
      'number',
    )
    assert.equal(
      result.phase_durations_ms.repair,
      null,
    )
  },
)

test(
  'V2 runner: silêncio válido não chama o critic e não gera mensagem de preenchimento',
  async () => {
    const sources = await loadSourcesForScenario(
      vagueDoubtScenario,
    )

    const fetchImpl = queueFetch([
      fakeOpenAIResponse({
        outputObject: silenceOutput(),
      }),
    ])

    const result = await runMessageIntelligenceV2(
      baseRunArgs({
        sources,
        scenario: vagueDoubtScenario,
        fetch_impl: fetchImpl,
      }),
    )

    assert.equal(result.status, 'no_message')
    assert.equal(result.final_message, null)
    assert.equal(result.critic, null)
    assert.equal(
      result.safety.would_surface_message,
      false,
    )
    // Sem claim customer-facing nenhuma, o critic nunca deveria ser
    // chamado — só a geração primária consumiu o fetch fake.
    assert.equal(fetchImpl.callCount(), 1)
  },
)

test(
  'V2 runner: saída malformada nas duas tentativas nunca chega ao seller (critic nunca roda)',
  async () => {
    const sources = await loadSourcesForScenario(
      priceScenario,
    )

    const malformed = {
      // intervention_needed ausente de propósito
      current_turn_relevance: 'commercial',
      customer_meaning: 'x',
      seller_intent_interpretation: 'x',
      recommended_commercial_objective: null,
      method_alignment_summary: null,
      evidence_message_ids: [],
      evidence_memory_ids: [],
      grounded_claims: [],
      safety_self_check: safetySelfCheck(),
      suggested_message: null,
    }

    const fetchImpl = queueFetch([
      fakeOpenAIResponse({
        outputObject: malformed,
      }),
      fakeOpenAIResponse({
        outputObject: malformed,
      }),
    ])

    const result = await runMessageIntelligenceV2(
      baseRunArgs({
        sources,
        scenario: priceScenario,
        fetch_impl: fetchImpl,
      }),
    )

    assert.equal(result.status, 'invalid_output')
    assert.equal(result.final_message, null)
    assert.equal(result.critic, null)
    assert.equal(
      result.safety.would_surface_message,
      false,
    )
    assert.ok(result.error)
    assert.equal(fetchImpl.callCount(), 2)
  },
)

test(
  'V2 runner: erro de provedor (401) cai seguro sem mensagem',
  async () => {
    const sources = await loadSourcesForScenario(
      priceScenario,
    )

    const result = await runMessageIntelligenceV2(
      baseRunArgs({
        sources,
        scenario: priceScenario,
        fetch_impl: queueFetch([
          fakeErrorResponse({ status: 401 }),
        ]),
      }),
    )

    assert.equal(result.status, 'provider_error')
    assert.equal(result.final_message, null)
    assert.equal(result.critic, null)
    assert.equal(
      result.safety.would_surface_message,
      false,
    )
    assert.equal(
      result.error.code,
      'OPENAI_AUTHENTICATION_FAILED',
    )
  },
)

test(
  'V2 runner: critic pede repair — primary + critic + repair + critic (aprova na segunda)',
  async () => {
    const sources = await loadSourcesForScenario(
      priceScenario,
    )

    const fetchImpl = queueFetch([
      fakeOpenAIResponse({
        outputObject: goodPrimaryOutput(),
      }),
      fakeOpenAIResponse({
        outputObject: criticOutput({
          verdict: 'repair',
          reason_codes: ['semantic_mismatch'],
          concise_feedback:
            'Remova o adjetivo não sustentado.',
        }),
      }),
      fakeOpenAIResponse({
        outputObject: goodPrimaryOutput({
          suggested_message:
            'Faz sentido perguntar! O valor cobre acompanhamento estruturado, sem exageros.',
        }),
      }),
      fakeOpenAIResponse({
        outputObject: criticOutput({
          verdict: 'pass',
        }),
      }),
    ])

    const result = await runMessageIntelligenceV2(
      baseRunArgs({
        sources,
        scenario: priceScenario,
        fetch_impl: fetchImpl,
      }),
    )

    assert.equal(result.status, 'generated')
    assert.equal(result.execution.attempts, 2)
    assert.equal(
      result.execution.recovered_after_retry,
      true,
    )
    assert.equal(
      result.execution.repair_reason,
      'semantic_critic',
    )
    assert.equal(
      result.critic.first.verdict,
      'repair',
    )
    assert.equal(
      result.critic.second.verdict,
      'pass',
    )
    assert.equal(fetchImpl.callCount(), 4)
    assert.equal(
      typeof result.phase_durations_ms.repair,
      'number',
    )
    assert.equal(
      typeof result.phase_durations_ms
        .critic_second,
      'number',
    )
  },
)

test(
  'V2 runner: critic pede repair mas o orçamento já foi usado pela validação determinística — bloqueia sem terceira geração',
  async () => {
    const sources = await loadSourcesForScenario(
      priceScenario,
    )

    const malformedFirstAttempt = {
      // intervention_needed ausente força repair determinístico na
      // própria geração primária, consumindo o único orçamento.
      current_turn_relevance: 'commercial',
      customer_meaning: 'x',
      seller_intent_interpretation: 'x',
      recommended_commercial_objective: null,
      method_alignment_summary: null,
      evidence_message_ids: [],
      evidence_memory_ids: [],
      grounded_claims: [],
      safety_self_check: safetySelfCheck(),
      suggested_message: null,
    }

    const fetchImpl = queueFetch([
      fakeOpenAIResponse({
        outputObject: malformedFirstAttempt,
      }),
      fakeOpenAIResponse({
        outputObject: goodPrimaryOutput(),
      }),
      fakeOpenAIResponse({
        outputObject: criticOutput({
          verdict: 'repair',
          concise_feedback:
            'Precisa de mais uma correção.',
        }),
      }),
    ])

    const result = await runMessageIntelligenceV2(
      baseRunArgs({
        sources,
        scenario: priceScenario,
        fetch_impl: fetchImpl,
      }),
    )

    assert.equal(result.status, 'invalid_output')
    assert.equal(
      result.error.code,
      'V2_SEMANTIC_CRITIC_REPAIR_EXHAUSTED',
    )
    assert.equal(
      result.critic.first.verdict,
      'repair',
    )
    assert.equal(result.critic.second, null)
    // 2 gerações primárias (determinístico) + 1 critic — nunca uma 4ª
    // chamada (nem repair adicional, nem segundo critic).
    assert.equal(fetchImpl.callCount(), 3)
  },
)

test(
  'V2 runner: critic bloqueia de primeira — sem regeneração nenhuma',
  async () => {
    const sources = await loadSourcesForScenario(
      priceScenario,
    )

    const fetchImpl = queueFetch([
      fakeOpenAIResponse({
        outputObject: goodPrimaryOutput(),
      }),
      fakeOpenAIResponse({
        outputObject: criticOutput({
          verdict: 'block',
          reason_codes: ['method_violation'],
          concise_feedback:
            'Viola comportamento proibido.',
        }),
      }),
    ])

    const result = await runMessageIntelligenceV2(
      baseRunArgs({
        sources,
        scenario: priceScenario,
        fetch_impl: fetchImpl,
      }),
    )

    assert.equal(result.status, 'invalid_output')
    assert.equal(
      result.error.code,
      'V2_SEMANTIC_CRITIC_BLOCKED',
    )
    assert.equal(
      result.critic.first.verdict,
      'block',
    )
    assert.equal(result.critic.second, null)
    assert.equal(fetchImpl.callCount(), 2)
  },
)

test(
  'V2 runner: segunda avaliação do critic não-pass bloqueia, sem terceira geração',
  async () => {
    const sources = await loadSourcesForScenario(
      priceScenario,
    )

    const fetchImpl = queueFetch([
      fakeOpenAIResponse({
        outputObject: goodPrimaryOutput(),
      }),
      fakeOpenAIResponse({
        outputObject: criticOutput({
          verdict: 'repair',
          concise_feedback: 'Corrija X.',
        }),
      }),
      fakeOpenAIResponse({
        outputObject: goodPrimaryOutput({
          suggested_message:
            'Segunda tentativa, ainda com problema.',
        }),
      }),
      fakeOpenAIResponse({
        outputObject: criticOutput({
          verdict: 'block',
          concise_feedback:
            'Ainda não está correto.',
        }),
      }),
    ])

    const result = await runMessageIntelligenceV2(
      baseRunArgs({
        sources,
        scenario: priceScenario,
        fetch_impl: fetchImpl,
      }),
    )

    assert.equal(result.status, 'invalid_output')
    assert.equal(
      result.error.code,
      'V2_SEMANTIC_CRITIC_BLOCKED',
    )
    assert.equal(
      result.critic.second.verdict,
      'block',
    )
    // Exatamente 4 chamadas — nunca uma 5ª (nem terceira geração, nem
    // terceiro critic).
    assert.equal(fetchImpl.callCount(), 4)
  },
)

test(
  'V2 runner: falha estrutural do critic (JSON malformado) nunca surfa mensagem não revisada',
  async () => {
    const sources = await loadSourcesForScenario(
      priceScenario,
    )

    const fetchImpl = queueFetch([
      fakeOpenAIResponse({
        outputObject: goodPrimaryOutput(),
      }),
      {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({
            object: 'response',
            status: 'completed',
            id: 'critic-broken',
            model: 'fake-model-v2',
            usage: null,
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: 'isso não é JSON válido',
                  },
                ],
              },
            ],
          }),
      },
    ])

    const result = await runMessageIntelligenceV2(
      baseRunArgs({
        sources,
        scenario: priceScenario,
        fetch_impl: fetchImpl,
      }),
    )

    assert.equal(result.status, 'invalid_output')
    assert.equal(result.final_message, null)
    assert.equal(
      result.safety.would_surface_message,
      false,
    )
    assert.equal(result.critic, null)
    assert.equal(fetchImpl.callCount(), 2)
  },
)

test(
  'V2 runner: erro de provedor no critic (401) cai seguro sem mensagem, mesmo com primary válido',
  async () => {
    const sources = await loadSourcesForScenario(
      priceScenario,
    )

    const fetchImpl = queueFetch([
      fakeOpenAIResponse({
        outputObject: goodPrimaryOutput(),
      }),
      fakeErrorResponse({ status: 401 }),
    ])

    const result = await runMessageIntelligenceV2(
      baseRunArgs({
        sources,
        scenario: priceScenario,
        fetch_impl: fetchImpl,
      }),
    )

    assert.equal(result.status, 'provider_error')
    assert.equal(result.final_message, null)
    assert.equal(result.critic, null)
    assert.equal(
      result.error.code,
      'OPENAI_AUTHENTICATION_FAILED',
    )
  },
)
