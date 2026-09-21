// Testes do simulador técnico interno do MIE V1.
//
// Cobre os requisitos mínimos da missão:
// 1. O simulador monta a conversa sintética sem tocar banco comercial.
// 2. O bot cliente recebe o histórico corretamente.
// 3. O MIE é chamado via runMessageIntelligenceV1 REAL.
// 4. Resultado "selected" é tratado corretamente.
// 5. Resultado "no_eligible_candidates" também é tratado.
// 6. "Usar como resposta" adiciona mensagem somente no estado da simulação.
// 7. Nenhuma ação automática é executada (defesa contra flags automáticas).
// 8. Nenhum insert em leads/sales_cycles/conversation_messages (nenhuma
//    dependência de banco nos módulos centrais do simulador).

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import {
  appendInboundMessage,
  appendOutboundMessage,
  startSimulatorConversation,
} from './conversation-engine.ts'

import {
  buildSimulatorRequest,
  buildSimulatorSources,
} from './synthetic-source.ts'

import {
  getSimulatorScenario,
  simulatorScenarioList,
} from './scenarios.ts'

import {
  runSimulatorMie,
  summarizeSimulatorMieResult,
  SimulatorUnsafeAutomaticActionError,
} from './run-simulator-mie.ts'

import {
  assembleMessageContextSnapshotV1,
} from '../context-assembler.ts'

import {
  runMessageIntelligenceFromSnapshotV1,
} from '../message-intelligence-runner.ts'

const referenceTime = '2026-09-04T12:00:00.000Z'

test('o bot cliente recebe o histórico da conversa e a persona do cenário na chamada ao provedor de IA', async () => {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-simulator'

  const { generateSimulatorCustomerReply } = await import('./customer-ai.ts')

  const scenario = getSimulatorScenario('need_partner')

  const conversation = [
    { id: '1', direction: 'inbound', text: scenario.initial_message, occurred_at: referenceTime },
    { id: '2', direction: 'outbound', text: 'Posso te ajudar a levar isso para o seu sócio.', occurred_at: referenceTime },
  ]

  const originalFetch = globalThis.fetch
  let capturedBody = null

  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body)

    return {
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: 'Beleza, vou perguntar pra ele e te retorno.' } },
        ],
      }),
    }
  }

  try {
    const reply = await generateSimulatorCustomerReply({ scenario, conversation })

    assert.equal(reply, 'Beleza, vou perguntar pra ele e te retorno.')

    assert.ok(capturedBody)
    const [systemMessage, userMessage] = capturedBody.messages

    assert.equal(systemMessage.role, 'system')
    assert.ok(systemMessage.content.includes(scenario.persona))

    assert.equal(userMessage.role, 'user')
    assert.ok(userMessage.content.includes(scenario.initial_message))
    assert.ok(userMessage.content.includes('Posso te ajudar a levar isso para o seu sócio.'))
    assert.ok(userMessage.content.includes('CLIENTE:'))
    assert.ok(userMessage.content.includes('VENDEDOR:'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

function forbiddenDbSourceFiles() {
  return [
    'conversation-engine.ts',
    'synthetic-source.ts',
    'customer-ai.ts',
    'run-simulator-mie.ts',
    'scenarios.ts',
  ]
}

test('nenhum módulo central do simulador importa Supabase ou tabelas comerciais reais', async () => {
  const forbiddenPatterns = [
    '@supabase',
    'createClient(',
    'createServerClient(',
    "from('leads')",
    "from('sales_cycles')",
    "from('cycle_events')",
    "from('conversation_messages')",
  ]

  for (const fileName of forbiddenDbSourceFiles()) {
    const filePath = fileURLToPath(new URL(fileName, import.meta.url))
    const source = await readFile(filePath, 'utf8')

    for (const pattern of forbiddenPatterns) {
      assert.equal(
        source.includes(pattern),
        false,
        `${fileName} não deveria conter "${pattern}"`,
      )
    }
  }
})

test('simulatorScenarioList expõe exatamente os 5 cenários mínimos', () => {
  const scenarios = simulatorScenarioList()

  assert.equal(scenarios.length, 5)

  for (const scenario of scenarios) {
    assert.equal(typeof scenario.initial_message, 'string')
    assert.ok(scenario.initial_message.length > 0)
  }
})

test('startSimulatorConversation monta a conversa sintética em memória a partir do cenário', () => {
  const scenario = getSimulatorScenario('price')
  assert.ok(scenario)

  const conversation = startSimulatorConversation({
    initial_message: scenario.initial_message,
    reference_time: referenceTime,
  })

  assert.equal(conversation.length, 1)
  assert.equal(conversation[0].direction, 'inbound')
  assert.equal(conversation[0].text, scenario.initial_message)
})

test('appendOutboundMessage e appendInboundMessage alteram apenas o array local (estado da simulação)', () => {
  const scenario = getSimulatorScenario('price')
  const initial = startSimulatorConversation({
    initial_message: scenario.initial_message,
    reference_time: referenceTime,
  })

  const withOutbound = appendOutboundMessage(
    initial,
    'Entendo a preocupação com o valor.',
    referenceTime,
  )

  // A conversa original não é mutada.
  assert.equal(initial.length, 1)
  assert.equal(withOutbound.length, 2)
  assert.equal(withOutbound[1].direction, 'outbound')
  assert.equal(withOutbound[1].text, 'Entendo a preocupação com o valor.')

  const withInbound = appendInboundMessage(
    withOutbound,
    'Ok, faz sentido.',
    referenceTime,
  )

  assert.equal(withOutbound.length, 2)
  assert.equal(withInbound.length, 3)
  assert.equal(withInbound[2].direction, 'inbound')
})

test('buildSimulatorSources converte o histórico sintético no formato esperado pelo MIE (bot cliente recebe o histórico corretamente)', () => {
  const scenario = getSimulatorScenario('competitor')

  const conversation = [
    { id: '1', direction: 'inbound', text: 'Mensagem do cliente.', occurred_at: referenceTime },
    { id: '2', direction: 'outbound', text: 'Mensagem do vendedor.', occurred_at: referenceTime },
  ]

  const sources = buildSimulatorSources({
    scenario,
    conversation,
    reference_time: referenceTime,
  })

  const messages = sources.real_context.diagnostic_input.conversation.messages

  assert.equal(messages.length, 2)
  assert.equal(messages[0].direction, 'incoming')
  assert.equal(messages[0].text_content, 'Mensagem do cliente.')
  assert.equal(messages[1].direction, 'outgoing')
  assert.equal(messages[1].text_content, 'Mensagem do vendedor.')
  assert.equal(sources.commercial_reading, null)
})

test('cada um dos 5 cenários carrega no source bundle a evidência comercial correspondente ao que está escrito na conversa', () => {
  // Prova, via o context-assembler REAL (não modificado), que o estado
  // sintético de cada cenário chega no snapshot do MIE na coleção correta
  // e com evidence_message_ids apontando para a mensagem sintética real.

  const expectations = {
    price: (snapshot, firstMessageId) => {
      assert.equal(snapshot.customer.objections.length, 1)
      assert.deepEqual(
        snapshot.customer.objections[0].evidence_message_ids,
        [firstMessageId],
      )
    },
    think_it_over: (snapshot, firstMessageId) => {
      // Incerteza/decisão pendente — nunca objeção específica.
      assert.equal(snapshot.customer.objections.length, 0)
      assert.equal(snapshot.customer.uncertainties.length, 1)
      assert.deepEqual(
        snapshot.customer.uncertainties[0].evidence_message_ids,
        [firstMessageId],
      )
    },
    need_partner: (snapshot, firstMessageId) => {
      assert.equal(snapshot.customer.missing_discovery.length, 1)
      assert.deepEqual(
        snapshot.customer.missing_discovery[0].evidence_message_ids,
        [firstMessageId],
      )
    },
    competitor: (snapshot, firstMessageId) => {
      assert.equal(snapshot.customer.competitors.length, 1)
      assert.deepEqual(
        snapshot.customer.competitors[0].evidence_message_ids,
        [firstMessageId],
      )
    },
    cold_follow_up: (snapshot, firstMessageId) => {
      assert.equal(snapshot.customer.commitments.length, 1)
      assert.deepEqual(
        snapshot.customer.commitments[0].evidence_message_ids,
        [firstMessageId],
      )
    },
  }

  for (const [scenarioKey, assertForScenario] of Object.entries(expectations)) {
    const scenario = getSimulatorScenario(scenarioKey)
    assert.ok(scenario, `cenário ${scenarioKey} deveria existir`)

    const conversation = startSimulatorConversation({
      initial_message: scenario.initial_message,
      reference_time: referenceTime,
    })

    const request = buildSimulatorRequest({
      scenario,
      seller_intent: scenario.default_seller_intent,
      reference_time: referenceTime,
      request_id: `test-${scenarioKey}`,
    })

    const sources = buildSimulatorSources({
      scenario,
      conversation,
      reference_time: referenceTime,
    })

    const snapshot = assembleMessageContextSnapshotV1({ request, sources })

    assertForScenario(snapshot, conversation[0].id)
  }
})

test('MIE é chamado via o runner REAL (runMessageIntelligenceV1 / runMessageIntelligenceFromSnapshotV1) e retorna um status válido', async () => {
  const scenario = getSimulatorScenario('price')

  const conversation = startSimulatorConversation({
    initial_message: scenario.initial_message,
    reference_time: referenceTime,
  })

  const summary = await runSimulatorMie({
    scenario,
    conversation,
    seller_intent: scenario.default_seller_intent,
    reference_time: referenceTime,
  })

  const validStatuses = [
    'selected',
    'no_acceptable_message',
    'no_eligible_candidates',
    'blocked',
    'approval_required',
    'inconsistent_input',
  ]

  assert.ok(validStatuses.includes(summary.status))
  assert.equal(summary.would_surface_message, summary.status === 'selected')
  assert.equal(typeof summary.candidate_count, 'number')
  assert.equal(typeof summary.hard_gate_pass_count, 'number')

  // Prova adicional de que é o pipeline real: request + sources -> snapshot ->
  // runMessageIntelligenceFromSnapshotV1 produz o mesmo contrato usado pela
  // suíte oficial do MIE.
  const request = buildSimulatorRequest({
    scenario,
    seller_intent: scenario.default_seller_intent,
    reference_time: referenceTime,
    request_id: 'test-request',
  })

  const sources = buildSimulatorSources({
    scenario,
    conversation,
    reference_time: referenceTime,
  })

  const snapshot = assembleMessageContextSnapshotV1({ request, sources })
  const run = runMessageIntelligenceFromSnapshotV1(snapshot)

  assert.equal(run.contract_version, 'message-intelligence-runner-v1')
  assert.ok(validStatuses.includes(run.final_message_result.status))
})

test('summarizeSimulatorMieResult trata corretamente o status "selected"', () => {
  const fakeResult = {
    final_message_result: {
      status: 'selected',
      final_message: {
        candidate_id: 'c1',
        text: 'Mensagem final sugerida pelo MIE.',
        critic_status: 'recommended',
        overall_score: 88,
      },
    },
    hard_gate_result: {
      status: 'all_passed',
    },
    shadow_evaluation: {
      would_surface_message: true,
      candidate_count: 2,
      hard_gate_pass_count: 2,
      selected_critic_status: 'recommended',
      selected_overall_score: 88,
      automatic_send: false,
      automatic_crm_write: false,
      automatic_agenda_write: false,
    },
  }

  const summary = summarizeSimulatorMieResult(fakeResult)

  assert.equal(summary.status, 'selected')
  assert.equal(summary.final_message_text, 'Mensagem final sugerida pelo MIE.')
  assert.equal(summary.would_surface_message, true)
  assert.equal(summary.hard_gate_status, 'all_passed')
})

test('summarizeSimulatorMieResult trata corretamente o status "no_eligible_candidates"', () => {
  const fakeResult = {
    final_message_result: {
      status: 'no_eligible_candidates',
      final_message: null,
    },
    hard_gate_result: {
      status: 'all_failed',
    },
    shadow_evaluation: {
      would_surface_message: false,
      candidate_count: 0,
      hard_gate_pass_count: 0,
      selected_critic_status: null,
      selected_overall_score: null,
      automatic_send: false,
      automatic_crm_write: false,
      automatic_agenda_write: false,
    },
  }

  const summary = summarizeSimulatorMieResult(fakeResult)

  assert.equal(summary.status, 'no_eligible_candidates')
  assert.equal(summary.final_message_text, null)
  assert.equal(summary.would_surface_message, false)
  assert.equal(summary.hard_gate_status, 'all_failed')
})

test('summarizeSimulatorMieResult bloqueia qualquer resultado com flag de ação automática ativa (nenhuma ação automática é executada)', () => {
  const unsafeResult = {
    final_message_result: {
      status: 'selected',
      final_message: {
        candidate_id: 'c1',
        text: 'Não deveria aparecer.',
        critic_status: 'recommended',
        overall_score: 90,
      },
    },
    hard_gate_result: {
      status: 'all_passed',
    },
    shadow_evaluation: {
      would_surface_message: true,
      candidate_count: 1,
      hard_gate_pass_count: 1,
      selected_critic_status: 'recommended',
      selected_overall_score: 90,
      automatic_send: true,
      automatic_crm_write: false,
      automatic_agenda_write: false,
    },
  }

  assert.throws(
    () => summarizeSimulatorMieResult(unsafeResult),
    SimulatorUnsafeAutomaticActionError,
  )
})
