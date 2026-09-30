import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  STATEFUL_COMMUNICATION_CONTRACT_VERSION,
} from './stateful-communication-contract.ts'

import {
  STATEFUL_COPILOT_PROMPT_VERSION,
} from './stateful-copilot-execution-plan.ts'

import {
  buildStatefulCopilotDiagnosticStructuredOutputFormat,
} from './stateful-copilot-json-schema.ts'

import {
  STATEFUL_COMMUNICATION_STRUCTURED_OUTPUT_FORMAT,
} from './stateful-communication-json-schema.ts'

import {
  MESSAGE_INTELLIGENCE_V2_CRITIC_STRUCTURED_OUTPUT_FORMAT,
} from './message-intelligence/v2/critic-json-schema.ts'

import {
  StatefulCopilotExecutionError,
  executeStatefulCopilotModelAttempt,
} from './stateful-copilot-executor.ts'

import {
  ANTHROPIC_API_VERSION,
  ANTHROPIC_MESSAGES_URL,
  DEFAULT_COMPANION_ANTHROPIC_MODEL,
  StatefulCopilotAnthropicProviderError,
  canonicalizeEnumCasing,
  completeGlobalEvidence,
  conformToSchema,
  createStatefulCopilotAnthropicProvider,
  emptySchemaConformanceStats,
  extractJsonText,
  prepareSchemaForAnthropic,
  resetAnthropicGrammarRejectionCache,
  resolveCompanionAnthropicEffort,
  resolveCompanionAnthropicModel,
  resolveCompanionAnthropicStage,
  resolveCompanionAnthropicThinking,
} from './stateful-copilot-anthropic-provider.ts'

import {
  createCompanionAIProvider,
  resolveCompanionAIProviderName,
} from './companion-ai-provider.ts'

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

const SIMPLE_FORMAT = {
  type: 'json_schema',
  name: 'teste_simples',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: { enum: ['pronto', 'aguardando'] },
      texto: { type: 'string', maxLength: 50 },
    },
    required: ['status', 'texto'],
  },
}

function request(overrides = {}) {
  return {
    prompt_version: 'prompt-teste-v1',
    output_contract_version: 'contrato-auxiliar-v1',
    system_prompt: 'SISTEMA',
    user_prompt: 'USUARIO',
    structured_output_format: SIMPLE_FORMAT,
    ...overrides,
  }
}

function claudeMessage({
  text = JSON.stringify({ status: 'pronto', texto: 'ok' }),
  stop_reason = 'end_turn',
  model = 'claude-sonnet-5-5',
  usage = { input_tokens: 100, output_tokens: 50 },
  withThinking = true,
} = {}) {
  return {
    id: 'msg_teste',
    type: 'message',
    role: 'assistant',
    model,
    content: [
      ...(withThinking
        ? [{ type: 'thinking', thinking: 'raciocínio interno', signature: 'sig' }]
        : []),
      { type: 'text', text },
    ],
    stop_reason,
    usage,
  }
}

function jsonResponse(status, payload, headers = {}) {
  return new Response(
    JSON.stringify(payload),
    {
      status,
      headers: {
        'content-type': 'application/json',
        'request-id': 'req_teste',
        ...headers,
      },
    },
  )
}

function fakeFetch(responses) {
  const calls = []
  const queue = [...responses]

  const impl = async (url, init) => {
    calls.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body),
    })

    const next = queue.shift()

    if (!next) {
      throw new Error('fetch chamado mais vezes que o esperado')
    }

    return typeof next === 'function'
      ? next(url, init)
      : next
  }

  return { impl, calls }
}

function provider(options = {}) {
  return createStatefulCopilotAnthropicProvider({
    api_key: 'chave-de-teste',
    env: {},
    log: () => {},
    sleep: async () => {},
    ...options,
  })
}

async function expectProviderError(promise, code) {
  await assert.rejects(
    promise,
    (error) => {
      assert.ok(error instanceof StatefulCopilotAnthropicProviderError)
      assert.ok(error instanceof StatefulCopilotExecutionError)
      assert.equal(error.code, code)
      return true
    },
  )
}

function withEnv(values, callback) {
  const previous = new Map(
    Object.keys(values).map((key) => [key, process.env[key]]),
  )

  for (const [key, value] of Object.entries(values)) {
    if (value === null) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  const restore = () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }

  try {
    const result = callback()

    if (result && typeof result.then === 'function') {
      return result.finally(restore)
    }

    restore()
    return result
  } catch (error) {
    restore()
    throw error
  }
}

// ---------------------------------------------------------------------------
// Etapa, modelo, esforço e raciocínio
// ---------------------------------------------------------------------------

test('identifica a etapa pelo contrato de saída', () => {
  assert.equal(
    resolveCompanionAnthropicStage({
      output_contract_version: STATEFUL_COPILOT_CONTRACT_VERSION,
    }),
    'diagnostic',
  )

  assert.equal(
    resolveCompanionAnthropicStage({
      output_contract_version: STATEFUL_COMMUNICATION_CONTRACT_VERSION,
    }),
    'communication',
  )

  assert.equal(
    resolveCompanionAnthropicStage({
      output_contract_version: 'lead-summary-v2',
    }),
    'auxiliary',
  )
})

test('modelo: padrão Sonnet, variáveis por etapa e modelo explícito do Claude', () => {
  assert.equal(
    resolveCompanionAnthropicModel({ stage: 'diagnostic', options: {}, env: {} }),
    DEFAULT_COMPANION_ANTHROPIC_MODEL,
  )

  const env = {
    COMPANION_ANTHROPIC_MODEL: 'claude-haiku-4-5',
    COMPANION_ANTHROPIC_DIAGNOSTIC_MODEL: 'claude-opus-5-5',
  }

  assert.equal(
    resolveCompanionAnthropicModel({ stage: 'diagnostic', options: {}, env }),
    'claude-opus-5-5',
  )

  assert.equal(
    resolveCompanionAnthropicModel({ stage: 'communication', options: {}, env }),
    'claude-haiku-4-5',
  )

  assert.equal(
    resolveCompanionAnthropicModel({ stage: 'auxiliary', options: {}, env }),
    'claude-haiku-4-5',
  )

  // Nome de modelo da OpenAI nunca vai para o Claude.
  assert.equal(
    resolveCompanionAnthropicModel({
      stage: 'auxiliary',
      options: { model: 'gpt-4.1-mini-2025-04-14' },
      env: {},
    }),
    DEFAULT_COMPANION_ANTHROPIC_MODEL,
  )

  assert.equal(
    resolveCompanionAnthropicModel({
      stage: 'communication',
      options: { model: 'claude-opus-5-5', communication_model: 'claude-sonnet-5-5' },
      env: {},
    }),
    'claude-sonnet-5-5',
  )
})

test('esforço: diagnóstico médio, demais baixo, variáveis válidas mudam', () => {
  assert.equal(resolveCompanionAnthropicEffort({ stage: 'diagnostic', options: {}, env: {} }), 'medium')
  assert.equal(resolveCompanionAnthropicEffort({ stage: 'communication', options: {}, env: {} }), 'low')
  assert.equal(resolveCompanionAnthropicEffort({ stage: 'auxiliary', options: {}, env: {} }), 'low')

  const env = {
    COMPANION_ANTHROPIC_DIAGNOSTIC_EFFORT: 'HIGH',
    COMPANION_ANTHROPIC_COMMUNICATION_EFFORT: 'invalido',
    COMPANION_ANTHROPIC_EFFORT: 'medium',
  }

  assert.equal(resolveCompanionAnthropicEffort({ stage: 'diagnostic', options: {}, env }), 'high')
  assert.equal(resolveCompanionAnthropicEffort({ stage: 'communication', options: {}, env }), 'low')
  assert.equal(resolveCompanionAnthropicEffort({ stage: 'auxiliary', options: {}, env }), 'medium')
  assert.equal(resolveCompanionAnthropicEffort({ stage: 'diagnostic', options: { effort: 'max' }, env }), 'max')
})

test('raciocínio adaptativo, exceto Haiku ou quando desligado', () => {
  assert.equal(resolveCompanionAnthropicThinking({ model: 'claude-sonnet-5-5', env: {} }), 'adaptive')
  assert.equal(resolveCompanionAnthropicThinking({ model: 'claude-haiku-4-5', env: {} }), 'disabled')
  assert.equal(
    resolveCompanionAnthropicThinking({
      model: 'claude-sonnet-5-5',
      env: { COMPANION_ANTHROPIC_THINKING: 'disabled' },
    }),
    'disabled',
  )
})

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function collectKeys(node, keys = new Set()) {
  if (Array.isArray(node)) {
    node.forEach((child) => collectKeys(child, keys))
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      keys.add(key)
      collectKeys(value, keys)
    }
  }

  return keys
}

test('schema do diagnóstico cabe na saída estruturada do Claude', () => {
  for (const memoryIds of [[], ['stateful-memory-a', 'stateful-memory-b']]) {
    const format =
      buildStatefulCopilotDiagnosticStructuredOutputFormat({
        active_memory_ids: memoryIds,
      })

    const prepared =
      prepareSchemaForAnthropic(format.schema)

    assert.equal(prepared.grammar_eligible, true)
    assert.ok(prepared.union_parameter_count <= 16)
    assert.equal(prepared.optional_parameter_count, 0)

    const keys = collectKeys(prepared.schema)

    for (const unsupported of ['maxItems', 'minLength', 'maxLength', 'minimum', 'maximum']) {
      assert.equal(keys.has(unsupported), false, unsupported)
    }
  }

  const empty =
    prepareSchemaForAnthropic(
      buildStatefulCopilotDiagnosticStructuredOutputFormat({
        active_memory_ids: [],
      }).schema,
    )

  assert.match(
    empty.schema.properties.memory_ids.description,
    /lista sempre vazia \[\]/,
  )

  // O schema original não é alterado.
  const original =
    buildStatefulCopilotDiagnosticStructuredOutputFormat({ active_memory_ids: [] })

  assert.equal(original.schema.properties.memory_ids.maxItems, 0)
})

test('schema da comunicação e do crítico: restrições viram descrição', () => {
  const communication =
    prepareSchemaForAnthropic(STATEFUL_COMMUNICATION_STRUCTURED_OUTPUT_FORMAT.schema)

  assert.equal(communication.grammar_eligible, true)

  const critic =
    prepareSchemaForAnthropic(MESSAGE_INTELLIGENCE_V2_CRITIC_STRUCTURED_OUTPUT_FORMAT.schema)

  const keys = collectKeys(critic.schema)

  assert.equal(keys.has('minimum'), false)
  assert.equal(keys.has('maxItems'), false)
  assert.match(JSON.stringify(critic.schema), /Restrições:/)
})

test('schema acima dos limites do Claude vai para o prompt', () => {
  const properties = {}

  for (let index = 0; index < 17; index += 1) {
    properties[`campo_${index}`] = {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    }
  }

  const prepared =
    prepareSchemaForAnthropic({
      type: 'object',
      additionalProperties: false,
      properties,
      required: Object.keys(properties),
    })

  assert.equal(prepared.union_parameter_count, 17)
  assert.equal(prepared.grammar_eligible, false)

  const optional =
    prepareSchemaForAnthropic({
      type: 'object',
      properties: Object.fromEntries(
        Array.from({ length: 25 }, (_, index) => [`opcional_${index}`, { type: 'string' }]),
      ),
      required: [],
    })

  assert.equal(optional.optional_parameter_count, 25)
  assert.equal(optional.grammar_eligible, false)
  assert.equal(optional.schema.additionalProperties, false)
})

test('enum volta para a grafia exata do schema', () => {
  const schema = {
    type: 'object',
    properties: {
      papel: { enum: ['buyer', 'provider'] },
      talvez: { anyOf: [{ enum: ['sim', 'nao'] }, { type: 'null' }] },
      lista: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            status: { enum: ['open', 'resolved'] },
          },
        },
      },
      objeto_ou_nulo: {
        anyOf: [
          {
            type: 'object',
            properties: { nivel: { enum: ['alta', 'baixa'] } },
          },
          { type: 'null' },
        ],
      },
      livre: { type: 'string' },
    },
  }

  assert.deepEqual(
    canonicalizeEnumCasing(
      {
        papel: 'Buyer',
        talvez: 'SIM',
        lista: [{ status: 'Open' }, { status: 'resolved' }],
        objeto_ou_nulo: { nivel: 'Alta' },
        livre: 'Texto Livre',
      },
      schema,
    ),
    {
      papel: 'buyer',
      talvez: 'sim',
      lista: [{ status: 'open' }, { status: 'resolved' }],
      objeto_ou_nulo: { nivel: 'alta' },
      livre: 'Texto Livre',
    },
  )

  // Valor fora do enum não é inventado: fica como veio.
  assert.deepEqual(
    canonicalizeEnumCasing({ papel: 'outro' }, schema),
    { papel: 'outro' },
  )
})

test('extrai o JSON de cercas de código ou de texto ao redor', () => {
  assert.equal(extractJsonText('```json\n{"a":1}\n```'), '{"a":1}')
  assert.equal(extractJsonText('Aqui está:\n{"a":{"b":2}}\nFim.'), '{"a":{"b":2}}')
  assert.equal(extractJsonText('  {"a":1}  '), '{"a":1}')
  assert.equal(extractJsonText('sem json'), 'sem json')
})

// ---------------------------------------------------------------------------
// Chamada ao Claude
// ---------------------------------------------------------------------------

test('diagnóstico: raciocínio, esforço médio, schema estruturado e sem cache', async () => {
  resetAnthropicGrammarRejectionCache()

  const { impl, calls } = fakeFetch([
    jsonResponse(200, claudeMessage({
      usage: {
        input_tokens: 1000,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 3000,
      },
    })),
  ])

  const format =
    buildStatefulCopilotDiagnosticStructuredOutputFormat({ active_memory_ids: [] })

  const response =
    await provider({ fetch_impl: impl })(
      request({
        output_contract_version: STATEFUL_COPILOT_CONTRACT_VERSION,
        structured_output_format: format,
      }),
    )

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, ANTHROPIC_MESSAGES_URL)
  assert.equal(calls[0].headers['x-api-key'], 'chave-de-teste')
  assert.equal(calls[0].headers['anthropic-version'], ANTHROPIC_API_VERSION)
  assert.equal('Authorization' in calls[0].headers, false)

  const body = calls[0].body

  assert.equal(body.model, DEFAULT_COMPANION_ANTHROPIC_MODEL)
  assert.equal(body.max_tokens, 8_000 + 12_000)
  assert.deepEqual(body.thinking, { type: 'adaptive' })
  assert.equal(body.output_config.effort, 'medium')
  assert.equal(body.output_config.format.type, 'json_schema')
  assert.equal('name' in body.output_config.format, false)
  assert.equal('strict' in body.output_config.format, false)
  assert.equal(collectKeys(body.output_config.format.schema).has('maxItems'), false)
  assert.deepEqual(body.system, [{ type: 'text', text: 'SISTEMA' }])
  assert.deepEqual(body.messages, [{ role: 'user', content: 'USUARIO' }])
  assert.equal('temperature' in body, false)

  assert.equal(response.provider, 'anthropic')
  assert.equal(response.model, 'claude-sonnet-5-5')
  assert.equal(response.request_id, 'req_teste')
  assert.deepEqual(response.usage, {
    input_tokens: 1000,
    output_tokens: 3000,
    total_tokens: 4000,
  })
})

test('comunicação: esforço baixo e cache no prompt de sistema', async () => {
  const { impl, calls } = fakeFetch([
    jsonResponse(200, claudeMessage({
      usage: {
        input_tokens: 200,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 0,
        output_tokens: 400,
      },
    })),
  ])

  const response =
    await provider({ fetch_impl: impl })(
      request({
        output_contract_version: STATEFUL_COMMUNICATION_CONTRACT_VERSION,
      }),
    )

  const body = calls[0].body

  assert.equal(body.output_config.effort, 'low')
  assert.equal(body.max_tokens, 8_000 + 4_000)
  assert.deepEqual(body.system[0].cache_control, { type: 'ephemeral' })

  // Leitura do cache conta como entrada.
  assert.equal(response.usage.input_tokens, 5200)
})

test('auxiliar: respeita prazo e limite de saída pedidos pela rota', async () => {
  const { impl, calls } = fakeFetch([
    jsonResponse(200, claudeMessage()),
  ])

  await provider({ fetch_impl: impl, timeout_ms: 45_000, max_output_tokens: 900 })(
    request(),
  )

  assert.equal(calls[0].body.max_tokens, 900 + 4_000)
})

test('enum com grafia diferente volta ao valor do schema no conteúdo', async () => {
  const { impl } = fakeFetch([
    jsonResponse(200, claudeMessage({
      text: JSON.stringify({ status: 'Pronto', texto: 'ok' }),
    })),
  ])

  const response =
    await provider({ fetch_impl: impl })(request())

  assert.deepEqual(JSON.parse(response.content), { status: 'pronto', texto: 'ok' })
})

test('schema recusado pela API: repete com o schema no prompt e lembra da recusa', async () => {
  resetAnthropicGrammarRejectionCache()

  const { impl, calls } = fakeFetch([
    jsonResponse(400, {
      type: 'error',
      error: { type: 'invalid_request_error', message: 'Schema is too complex for compilation.' },
    }),
    jsonResponse(200, claudeMessage({
      text: '```json\n{"status":"aguardando","texto":"ok"}\n```',
    })),
    jsonResponse(200, claudeMessage()),
  ])

  const call = provider({ fetch_impl: impl })

  const response =
    await call(request())

  assert.equal(calls.length, 2)
  assert.ok(calls[0].body.output_config.format)
  assert.equal(calls[1].body.output_config.format, undefined)
  assert.match(calls[1].body.system[0].text, /<json_schema>/)
  assert.match(calls[1].body.system[0].text, /"required"/)
  assert.deepEqual(JSON.parse(response.content), { status: 'aguardando', texto: 'ok' })

  // Mesmo schema de novo: já vai direto no prompt.
  await call(request())

  assert.equal(calls.length, 3)
  assert.equal(calls[2].body.output_config.format, undefined)
  assert.match(calls[2].body.system[0].text, /<json_schema>/)

  resetAnthropicGrammarRejectionCache()
})

test('raciocínio recusado pela API: repete sem raciocínio e sem esforço', async () => {
  resetAnthropicGrammarRejectionCache()

  const { impl, calls } = fakeFetch([
    jsonResponse(400, {
      type: 'error',
      error: { type: 'invalid_request_error', message: 'adaptive thinking is not supported for this model' },
    }),
    jsonResponse(200, claudeMessage({ withThinking: false })),
  ])

  await provider({ fetch_impl: impl })(request())

  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0].body.thinking, { type: 'adaptive' })
  assert.equal(calls[1].body.thinking, undefined)
  assert.equal(calls[1].body.output_config.effort, undefined)
  assert.ok(calls[1].body.output_config.format)
})

test('sobrecarga momentânea: uma nova tentativa', async () => {
  let slept = 0

  const { impl, calls } = fakeFetch([
    jsonResponse(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }),
    jsonResponse(200, claudeMessage()),
  ])

  await provider({
    fetch_impl: impl,
    sleep: async () => {
      slept += 1
    },
  })(request())

  assert.equal(calls.length, 2)
  assert.equal(slept, 1)
})

test('falhas viram erros do executor com código próprio', async () => {
  await expectProviderError(
    provider({ api_key: null, env: {} })(request()),
    'ANTHROPIC_NOT_CONFIGURED',
  )

  {
    const { impl } = fakeFetch([
      jsonResponse(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    ])

    await assert.rejects(
      provider({ fetch_impl: impl })(request()),
      (error) => {
        assert.equal(error.code, 'ANTHROPIC_AUTHENTICATION_FAILED')
        assert.equal(error.retryable, false)
        return true
      },
    )
  }

  {
    const { impl } = fakeFetch([
      jsonResponse(200, claudeMessage({ stop_reason: 'max_tokens' })),
    ])

    await assert.rejects(
      provider({ fetch_impl: impl })(request()),
      (error) => {
        assert.equal(error.code, 'ANTHROPIC_RESPONSE_INCOMPLETE')
        assert.equal(error.retryable, true)
        return true
      },
    )
  }

  {
    const { impl } = fakeFetch([
      jsonResponse(200, claudeMessage({ stop_reason: 'refusal' })),
    ])

    await expectProviderError(
      provider({ fetch_impl: impl })(request()),
      'ANTHROPIC_MODEL_REFUSAL',
    )
  }

  {
    const { impl } = fakeFetch([
      jsonResponse(200, claudeMessage({ text: '   ' })),
    ])

    await expectProviderError(
      provider({ fetch_impl: impl })(request()),
      'ANTHROPIC_EMPTY_OUTPUT',
    )
  }

  {
    const { impl } = fakeFetch([
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
    ])

    await expectProviderError(
      provider({ fetch_impl: impl, timeout_ms: 10 })(request()),
      'ANTHROPIC_REQUEST_TIMEOUT',
    )
  }

  await expectProviderError(
    provider()(request({ system_prompt: '  ' })),
    'INVALID_ANTHROPIC_PROVIDER_REQUEST',
  )
})

test('Haiku: sem raciocínio e sem parâmetro de esforço', async () => {
  const { impl, calls } = fakeFetch([
    jsonResponse(200, claudeMessage({ withThinking: false, model: 'claude-haiku-4-5' })),
  ])

  await provider({ fetch_impl: impl, model: 'claude-haiku-4-5' })(request())

  const body = calls[0].body

  assert.equal(body.model, 'claude-haiku-4-5')
  assert.equal(body.thinking, undefined)
  assert.equal(body.output_config.effort, undefined)
  assert.equal(body.max_tokens, 2_000)
})

test('os logs não levam conteúdo da conversa', async () => {
  const events = []

  const { impl } = fakeFetch([
    jsonResponse(200, claudeMessage()),
  ])

  await provider({
    fetch_impl: impl,
    log: (event, fields) => events.push({ event, fields }),
  })(
    request({
      system_prompt: 'SEGREDO DO SISTEMA',
      user_prompt: 'CONVERSA DO CLIENTE',
    }),
  )

  assert.equal(events.length, 1)
  assert.equal(events[0].event, 'provider_call_succeeded')

  const serialized = JSON.stringify(events)

  assert.equal(serialized.includes('SEGREDO DO SISTEMA'), false)
  assert.equal(serialized.includes('CONVERSA DO CLIENTE'), false)
  assert.equal(serialized.includes('chave-de-teste'), false)
})

// ---------------------------------------------------------------------------
// Encaixe no executor real do diagnóstico
// ---------------------------------------------------------------------------

function diagnosticPlan() {
  return {
    mode: 'model',
    request: {
      prompt_version: STATEFUL_COPILOT_PROMPT_VERSION,
      output_contract_version: STATEFUL_COPILOT_CONTRACT_VERSION,
      system_prompt: 'SYSTEM PROMPT STATEFUL',
      user_prompt: 'USER PROMPT STATEFUL',
      normalization_context: {
        available_message_ids: ['m2', 'm3'],
        customer_message_ids: ['m2', 'm3'],
        available_products: [],
        previous_communication_observations: [],
        available_memory_ids: [],
        active_memory_ids: [],
        expected_previous_state_version: null,
        current_crm_status: 'respondeu',
        prohibited_statuses: ['ganho', 'perdido'],
        reference_time: '2026-08-06T00:30:00-03:00',
      },
    },
  }
}

function emptyPatch() {
  return {
    facts_to_add: [],
    fact_ids_to_supersede: [],
    needs_to_add: [],
    need_ids_to_resolve: [],
    need_ids_to_supersede: [],
    open_loops_to_add: [],
    open_loop_ids_to_resolve: [],
    open_loop_ids_to_supersede: [],
    objections_to_add: [],
    objection_ids_to_resolve: [],
    objection_ids_to_supersede: [],
    commitments_to_upsert: [],
    signals_to_add: [],
    signal_ids_to_resolve: [],
    uncertainties_to_add: [],
    uncertainty_ids_to_resolve: [],
    uncertainty_ids_to_supersede: [],
  }
}

function validDiagnosticOutput({ role = 'buyer', relevance = 'commercial' } = {}) {
  return {
    contract_version: STATEFUL_COPILOT_CONTRACT_VERSION,
    previous_state_version: null,
    analyzed_message_ids: ['m2', 'm3'],
    commercial_role: role,
    commercial_relevance: relevance,
    interpretation: {
      what_changed: {
        summary: 'O cliente perguntou sobre o investimento.',
        evidence_message_ids: ['m3'],
      },
      what_remains_valid: [],
      current_moment: {
        summary: 'O cliente mantém interesse e quer entender o investimento.',
        evidence_message_ids: ['m2', 'm3'],
        memory_ids: [],
      },
      customer_need: {
        summary: 'Compreender o investimento antes de avançar.',
        evidence_message_ids: ['m3'],
        memory_ids: [],
      },
      uncertainties: [],
    },
    state_patch: emptyPatch(),
    strategy: {
      method_application: 'Responder a pergunta antes de pressionar por avanço.',
      rationale: 'Existe uma pergunta comercial objetiva ainda sem resposta.',
      next_move: 'Esclarecer o investimento de forma contextualizada.',
      recommended_question: null,
      suggested_message: 'Entendi. Vou te explicar como funciona o investimento e o que está incluído.',
      evidence_message_ids: ['m2', 'm3'],
      memory_ids: [],
    },
    operational_suggestions: {
      crm: {
        should_change_crm_stage: false,
        recommended_status: null,
        rationale: null,
        requires_human_confirmation: true,
      },
      agenda: {
        should_change_agenda: false,
        expected_next_action_at: null,
        rationale: null,
        requires_human_confirmation: true,
      },
    },
    evidence_message_ids: ['m2', 'm3'],
    memory_ids: [],
  }
}

test('o executor do diagnóstico aceita a resposta do Claude sem mudar nada no pipeline', async () => {
  resetAnthropicGrammarRejectionCache()

  const { impl, calls } = fakeFetch([
    jsonResponse(200, claudeMessage({
      // Grafia diferente em enums: o provedor corrige antes do normalizador.
      text: JSON.stringify(validDiagnosticOutput({ role: 'Buyer', relevance: 'Commercial' })),
      usage: { input_tokens: 12_000, output_tokens: 2_500 },
    })),
  ])

  const result =
    await executeStatefulCopilotModelAttempt({
      plan: diagnosticPlan(),
      provider: provider({ fetch_impl: impl }),
    })

  assert.deepEqual(result.output, validDiagnosticOutput())
  assert.equal(result.execution.provider, 'anthropic')
  assert.equal(result.execution.model, 'claude-sonnet-5-5')
  assert.equal(result.execution.request_id, 'req_teste')
  assert.deepEqual(result.execution.usage, {
    input_tokens: 12_000,
    output_tokens: 2_500,
    total_tokens: 14_500,
  })

  // O pedido levou o schema do próprio diagnóstico, já adaptado.
  const sentSchema = calls[0].body.output_config.format.schema

  assert.deepEqual(
    Object.keys(sentSchema.properties),
    Object.keys(
      buildStatefulCopilotDiagnosticStructuredOutputFormat({ active_memory_ids: [] })
        .schema.properties,
    ),
  )
})

test('conformidade: completa listas e nulos, tira extras, filtra enums, corta máximo e IDs repetidos', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      memory_ids: { type: 'array', items: { type: 'string' }, maxItems: 0 },
      evidence_message_ids: { type: 'array', items: { type: 'string' } },
      status: { anyOf: [{ enum: ['aberto', 'fechado'] }, { type: 'null' }] },
      papel: { enum: ['buyer', 'provider'] },
      memorias_ativas: { type: 'array', items: { enum: ['mem-1', 'mem-2'] } },
      pergunta: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      obj: {
        type: 'object',
        additionalProperties: false,
        properties: { lista: { type: 'array', items: { type: 'string' } } },
        required: ['lista'],
      },
    },
    required: ['memory_ids', 'evidence_message_ids', 'status', 'papel', 'memorias_ativas', 'pergunta', 'obj'],
  }

  const stats = emptySchemaConformanceStats()

  const output =
    conformToSchema(
      {
        memory_ids: ['m1'],
        evidence_message_ids: ['m1', 'm1', 'm2'],
        status: 'desconhecido',
        papel: 'Buyer',
        memorias_ativas: ['mem-1', 'm3', 'MEM-2'],
        obj: { lista: null, extra: 1 },
        campo_extra: 'x',
      },
      schema,
      stats,
    )

  assert.deepEqual(output, {
    memory_ids: [],
    evidence_message_ids: ['m1', 'm2'],
    status: null,
    papel: 'buyer',
    memorias_ativas: ['mem-1', 'mem-2'],
    obj: { lista: [] },
    pergunta: null,
  })

  assert.deepEqual(stats, {
    filled_missing: 2,
    removed_extra_keys: 2,
    removed_invalid_items: 1,
    truncated_arrays: 1,
    removed_duplicates: 1,
    nulled_invalid_values: 1,
    global_evidence_added: 0,
  })

  // Texto livre e campos obrigatórios que não são lista nem nulo ficam como vieram.
  assert.deepEqual(
    conformToSchema(
      { texto: 'Qualquer Coisa' },
      {
        type: 'object',
        additionalProperties: false,
        properties: { texto: { type: 'string' }, obrigatorio: { type: 'string' } },
        required: ['texto', 'obrigatorio'],
      },
    ),
    { texto: 'Qualquer Coisa' },
  )
})

test('diagnóstico: a lista global de evidências recebe as evidências citadas', () => {
  const stats = emptySchemaConformanceStats()

  const output =
    completeGlobalEvidence(
      {
        evidence_message_ids: ['m2'],
        interpretation: {
          what_changed: { evidence_message_ids: ['m3'] },
          what_remains_valid: [{ evidence_message_ids: ['m1', 'm2'] }],
        },
      },
      stats,
    )

  assert.deepEqual(output.evidence_message_ids, ['m2', 'm3', 'm1'])
  assert.equal(stats.global_evidence_added, 2)

  // Sem lista global, nada muda.
  assert.deepEqual(completeGlobalEvidence({ a: 1 }), { a: 1 })
})

test('resposta com os desvios vistos no teste real passa no contrato do diagnóstico', async () => {
  resetAnthropicGrammarRejectionCache()

  // Desvios reais do modo com schema no prompt: memória com ID de mensagem,
  // lista de memória omitida, evidência citada que faltou na lista global e
  // campo fora do schema.
  const broken = validDiagnosticOutput({ role: 'Buyer' })
  delete broken.interpretation.current_moment.memory_ids
  broken.strategy.memory_ids = ['m2']
  broken.evidence_message_ids = ['m2']
  broken.observacao_extra = 'fora do schema'

  const events = []

  const { impl } = fakeFetch([
    jsonResponse(400, {
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.',
      },
    }),
    jsonResponse(200, claudeMessage({ text: JSON.stringify(broken) })),
  ])

  const result =
    await executeStatefulCopilotModelAttempt({
      plan: diagnosticPlan(),
      provider: provider({
        fetch_impl: impl,
        log: (event, fields) => events.push({ event, fields }),
      }),
    })

  assert.deepEqual(result.output, validDiagnosticOutput())
  assert.equal(result.execution.provider, 'anthropic')

  const succeeded = events.find((entry) => entry.event === 'provider_call_succeeded')

  assert.equal(succeeded.fields.output_mode, 'prompt')
  assert.equal(succeeded.fields.conformance.truncated_arrays, 1)
  assert.equal(succeeded.fields.conformance.filled_missing, 1)
  assert.equal(succeeded.fields.conformance.removed_extra_keys, 1)
  assert.equal(succeeded.fields.conformance.global_evidence_added, 1)

  resetAnthropicGrammarRejectionCache()
})

// ---------------------------------------------------------------------------
// Fábrica
// ---------------------------------------------------------------------------

test('fábrica: OpenAI por padrão, Claude com COMPANION_AI_PROVIDER=anthropic', async () => {
  assert.equal(resolveCompanionAIProviderName({}), 'openai')
  assert.equal(resolveCompanionAIProviderName({ COMPANION_AI_PROVIDER: 'Anthropic' }), 'anthropic')
  assert.equal(resolveCompanionAIProviderName({ COMPANION_AI_PROVIDER: 'claude' }), 'anthropic')
  assert.equal(resolveCompanionAIProviderName({ COMPANION_AI_PROVIDER: 'outra' }), 'openai')

  const openAiCalls = []

  await withEnv({ COMPANION_AI_PROVIDER: null }, async () => {
    const openAi =
      createCompanionAIProvider({
        api_key: 'openai-teste',
        fetch_impl: async (url) => {
          openAiCalls.push(url)
          return jsonResponse(200, {
            object: 'response',
            status: 'completed',
            model: 'gpt-4.1-mini-2025-04-14',
            output: [
              {
                type: 'message',
                content: [{ type: 'output_text', text: '{"status":"pronto","texto":"ok"}' }],
              },
            ],
          })
        },
      })

    const response = await openAi(request())

    assert.equal(response.provider, 'openai')
  })

  assert.equal(openAiCalls.length, 1)
  assert.match(openAiCalls[0], /api\.openai\.com/)

  const claudeCalls = []

  await withEnv(
    {
      COMPANION_AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'anthropic-teste',
    },
    async () => {
      const claude =
        createCompanionAIProvider({
          // Chave e modelo da OpenAI são ignorados pelo Claude.
          api_key: 'openai-teste',
          model: 'gpt-4.1-mini-2025-04-14',
          timeout_ms: 45_000,
          max_output_tokens: 900,
          fetch_impl: async (url, init) => {
            claudeCalls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
            return jsonResponse(200, claudeMessage())
          },
        })

      const response = await claude(request())

      assert.equal(response.provider, 'anthropic')
    },
  )

  assert.equal(claudeCalls.length, 1)
  assert.equal(claudeCalls[0].url, ANTHROPIC_MESSAGES_URL)
  assert.equal(claudeCalls[0].headers['x-api-key'], 'anthropic-teste')
  assert.equal(claudeCalls[0].body.model, DEFAULT_COMPANION_ANTHROPIC_MODEL)
  assert.equal(claudeCalls[0].body.max_tokens, 900 + 4_000)
})
