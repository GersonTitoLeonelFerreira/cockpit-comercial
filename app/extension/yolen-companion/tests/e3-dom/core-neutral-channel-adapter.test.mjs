// FASE 5 — prova de independência do Companion Core.
//
// O MESMO Core, controllers e views de produção (os módulos compartilhados
// do manifest, sem whatsapp-adapter.js nem o content script do WhatsApp)
// são compostos pelo bootstrap compartilhado (companion-bootstrap.js) com
// um ChannelAdapter de contrato independente do WhatsApp
// (e3-test-support/contract-channel-adapter.mjs). O DOM disponível é só o
// container de montagem do painel Yolen; o transporte externo é o
// background fake do harness E3. Acesso não contratado ao adapter lança
// erro e é registrado.
//
// Este teste não substitui a paridade completa da FASE 8.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  WHATSAPP_MANIFEST_FILES,
  createLeadCalls,
  defaultAgoraDecisionState,
  defaultLeadResolution,
  ingestCalls,
  leadSummaryCalls,
  loadCompanionComposition,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'
import {
  ALL_CAPABILITIES,
  createContractChannelAdapter,
} from '../e3-test-support/contract-channel-adapter.mjs'

const SHARED_FILES = WHATSAPP_MANIFEST_FILES.filter(
  (file) => file !== 'whatsapp-adapter.js' && file !== 'content-script.js',
)

const PHONE_A = '5511988887777'
const PHONE_B = '5521977776666'
const CYCLE_A = 'cycle-neutral-a'
const CYCLE_B = 'cycle-neutral-b'
const SUMMARY_A = 'Cliente A perguntou sobre o preço do plano.'
const SUMMARY_B = 'Cliente B pediu para remarcar a demonstração.'
const MESSAGE_A = 'MENSAGEM_SUGERIDA_PARA_A_PELO_CANAL_CONTRATO'

function conversation(key, overrides = {}) {
  return {
    key,
    title: key === 'conv-a' ? 'Cliente A' : 'Cliente B',
    phone: key === 'conv-a' ? PHONE_A : PHONE_B,
    phoneEvidence: 'trusted',
    messages: [{ id: 'm1', text: key === 'conv-a' ? 'Quanto custa o plano?' : 'Podemos remarcar?', direction: 'incoming' }],
    draft: '',
    ...overrides,
  }
}

function resolutionFor(phone, cycleId, name) {
  return defaultLeadResolution({
    phone,
    lead: { id: `lead-${cycleId}`, name, phone, email: null, cpf_cnpj: null, deleted_at: null },
    cycle: { id: cycleId, status: 'contato', owner_user_id: 'user-1' },
  })
}

function summaryResult(_callCount, requestPayload) {
  const summary = requestPayload?.cycle_id === CYCLE_B ? SUMMARY_B : SUMMARY_A

  return {
    ok: true,
    data: {
      identity: { company_id: 'company-1', lead_id: 'lead-1', cycle_id: requestPayload?.cycle_id, conversation_key: requestPayload?.conversation_key },
      summary: { summary, version: 1, updated_at: '2026-08-25T12:00:00.000Z' },
      working_summary: summary,
    },
  }
}

function startNeutralCompanion({
  conversations = { 'conv-a': conversation('conv-a'), 'conv-b': conversation('conv-b') },
  initialKey = 'conv-a',
  capabilities = ALL_CAPABILITIES,
  ...compositionOptions
} = {}) {
  const runtime = loadCompanionComposition({
    files: SHARED_FILES,
    initialHtml: '<!doctype html><html><body></body></html>',
    resolutionsByPhone: {
      [PHONE_A]: resolutionFor(PHONE_A, CYCLE_A, 'Lead Alfa'),
      [PHONE_B]: resolutionFor(PHONE_B, CYCLE_B, 'Lead Beta'),
    },
    leadSummaryResult: summaryResult,
    ...compositionOptions,
  })

  const { adapter, controls } = createContractChannelAdapter({
    document: runtime.document,
    conversations,
    initialKey,
    capabilities,
  })

  const bootstrap = runtime.sandbox.YolenCompanionBootstrap.create({
    channelAdapter: adapter,
  })

  const started = bootstrap.start()

  return { ...runtime, adapter, controls, bootstrap, started }
}

function panelOf(document) {
  return document.getElementById('yolen-companion-panel')
}

function panelText(document) {
  return (panelOf(document)?.textContent || '').replace(/\s+/g, ' ')
}

function click(document, target) {
  target.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test('inicialização, sessão, resolução e quatro áreas com o adapter de contrato', async () => {
  const { document, calls, controls, started } = startNeutralCompanion()

  assert.equal(await started, true)
  await waitFor(() => calls.some((call) => call.action === 'GET_ME'))
  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_A))
  await waitFor(() => panelText(document).includes('Lead Alfa'))

  const panel = panelOf(document)
  assert.equal(panel.parentElement, document.body, 'painel montado no container do adapter')

  const areas = Array.from(panel.querySelectorAll('[data-yolen-seller-area]')).map((element) =>
    element.getAttribute('data-yolen-seller-area'),
  )
  assert.deepEqual(areas, ['now', 'message', 'analysis', 'client'])

  await waitFor(() => ingestCalls(calls).length > 0)
  assert.ok(
    ingestCalls(calls).at(-1).payload.messages.some((message) => message.message_key?.includes('conv-a::m1')),
    'mensagens normalizadas pelo adapter chegam à captura do Core',
  )

  // Nada fora do painel: o documento só tem o container de montagem.
  assert.deepEqual(
    Array.from(document.body.children).map((element) => element.id),
    ['yolen-companion-panel'],
  )
  assert.deepEqual(controls.violations, [])
})

function evidence(summary) {
  return { summary, evidence_message_ids: ['conv-a::m1'], memory_ids: [] }
}

function readingWithMessage() {
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    conversation_summary: { current_state: evidence('Cliente avaliando o preço.') },
    customer: {
      objectives: [], problems: [], impacts: [], needs: [], interests: [],
      decision_criteria: [], preferences: [], open_questions: [], objections: [],
      uncertainties: [], discussed_products: [], primary_product_interest: null,
      competitors: [], commitments: [], missing_discovery: [],
      resolved_information: [], superseded_information: [],
      communication: { patterns: [], events: [] },
    },
    commercial_evolution: [],
    method: { configured: false, name: null, stages: [], current_stage: null, adherence: { status: 'not_configured' }, recovery_guidance: null },
    seller_strengths: [],
    improvement_points: [],
    risks: { customer_objections: [], service_risks: [] },
    best_approach: { decision: 'handle_objection', reason: 'Tratar a objeção de preço.', channel: 'text', evidence_message_ids: [], memory_ids: [] },
    communication: { intervention_needed: true, recommended_question: null, recommended_message: MESSAGE_A },
    operations: {
      crm: { should_change_crm_stage: false, recommended_status: null, rationale: null, requires_human_confirmation: true },
      agenda: { should_change_agenda: false, expected_next_action_at: null, rationale: null, requires_human_confirmation: true },
    },
    evidence_message_ids: [],
    memory_ids: [],
  }
}

const JOB_ID = 'c'.repeat(64)

function analysisOptions() {
  return {
    analysisResult: {
      ok: true,
      data: { deep_analysis: { analysis_job_id: JOB_ID, status: 'queued', message_watermark: 'wm-1' } },
    },
    analysisJobStatusResult: {
      ok: true,
      data: {
        analysis_job_id: JOB_ID,
        status: 'succeeded',
        message_watermark: 'wm-1',
        result: {
          contract_version: 'phase12a-deep-seller-v1',
          engine_source: 'stateful',
          commercial_relevance: 'commercial',
          commercial_role: 'buyer',
          summary: 'Resumo profundo.',
          commercial_reading: readingWithMessage(),
          recommended_next_approach: 'Ver leitura comercial.',
          recommended_question: null,
          suggested_message: null,
        },
      },
    },
    decisionStateResult: defaultAgoraDecisionState(),
  }
}

async function analyzeUntilInsertAvailable(document, calls) {
  await waitFor(() => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0)
  await waitFor(() => document.querySelector('[data-yolen-action="analyze-conversation"]'))
  click(document, document.querySelector('[data-yolen-action="analyze-conversation"]'))

  return waitFor(
    () => document.querySelector('[data-yolen-action="insert-suggested-message"]'),
    { timeoutMs: 12000 },
  )
}

async function openMessageAreaAndGenerate(document, calls) {
  await waitFor(() => leadSummaryCalls(calls).length > 0)
  await waitFor(() => document.querySelector('[data-yolen-seller-area="message"]'))
  click(document, document.querySelector('[data-yolen-seller-area="message"]'))
  await waitFor(() => document.querySelector('[data-yolen-seller-message-intent]'))

  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  intentField.value = 'Quero responder sobre o preço.'
  intentField.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))
  click(document, document.querySelector('[data-yolen-seller-message-action="generate"]'))
}

function registerCalls(calls, action) {
  return calls.filter(
    (call) => call.action === 'REGISTER_MESSAGE_ACTION' && (!action || call.payload?.action === action),
  )
}

test('evidência de telefone ausente não resolve nem inventa telefone; pendente passa a confiável e resolve', async () => {
  const conversations = {
    'conv-a': conversation('conv-a', { phoneEvidence: 'absent' }),
    'conv-b': conversation('conv-b'),
  }
  const { document, calls, controls } = startNeutralCompanion({ conversations })

  await waitFor(() => controls.calls.some((call) => call.name === 'acquireContactEvidence'))
  await waitFor(() => panelText(document).includes('Telefone ainda não disponível'))
  assert.match(panelText(document), /A Yolen não altera a navegação do Canal Contrato/)
  await sleep(800)
  assert.equal(resolveLeadCalls(calls).length, 0, 'sem evidência confiável não há resolução nem criação')
  assert.equal(document.querySelector('[data-yolen-lead-create-form]'), null)

  // A mesma conversa passa a ter evidência confiável (ex.: dado novo do
  // canal): o Core resolve a partir do snapshot, sem nova tentativa física.
  conversations['conv-a'].phoneEvidence = 'trusted'
  controls.emitChange()

  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_A))
  await waitFor(() => panelText(document).includes('Lead Alfa'))
  assert.deepEqual(controls.violations, [])
})

test('NOT_FOUND → CREATE com telefone confiável → re-resolve vincula o lead', async () => {
  const resolutions = {
    [PHONE_A]: defaultLeadResolution({ phone: PHONE_A, status: 'NOT_FOUND', lead: null, cycle: null }),
  }

  const { document, calls, controls } = startNeutralCompanion({
    resolutionsByPhone: resolutions,
    createLeadResult: (payload) => {
      resolutions[PHONE_A] = resolutionFor(PHONE_A, CYCLE_A, payload?.name || 'Lead Novo')
      return { ok: true, lead_id: `lead-${CYCLE_A}`, cycle_id: CYCLE_A, owner_user_id: 'user-1' }
    },
  })

  await waitFor(() => document.querySelector('[data-yolen-lead-create-form]'))
  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.value = 'Lead Criado'
  nameInput.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))

  const form = document.querySelector('[data-yolen-lead-create-form]')
  const submit = form.querySelector('.yolen-lead-create-submit')
  submit.dispatchEvent(new document.defaultView.Event('pointerdown', { bubbles: true }))
  click(document, submit)
  form.dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }))

  await waitFor(() => createLeadCalls(calls).length === 1)
  assert.equal(createLeadCalls(calls)[0].payload.phone, PHONE_A)
  await waitFor(() => resolveLeadCalls(calls).length >= 2)
  await waitFor(() => document.querySelector('[data-yolen-lead-create-form]') === null)
  await waitFor(() => document.querySelector('[data-yolen-action="open-cycle-yolen"]'))
  assert.equal(createLeadCalls(calls).length, 1)
  assert.deepEqual(controls.violations, [])
})

test('MENSAGEM: geração, cópia e inclusão pelo contrato; rascunho ocupado é preservado', async () => {
  const { document, window, calls, controls } = startNeutralCompanion({
    messageGenerationResult: { status: 'ready', message: MESSAGE_A, error: null },
  })

  let copied = null
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { async writeText(value) { copied = value } },
  })

  await openMessageAreaAndGenerate(document, calls)
  await waitFor(() => document.querySelector('[data-yolen-seller-message-action="insert"]'))

  assert.equal(
    document.querySelector('[data-yolen-seller-message-action="insert"]').textContent,
    'Incluir no Canal Contrato',
  )

  click(document, document.querySelector('[data-yolen-seller-message-action="copy"]'))
  await sleep(20)
  assert.equal(copied, MESSAGE_A)

  controls.current.draft = 'Rascunho do vendedor'
  click(document, document.querySelector('[data-yolen-seller-message-action="insert"]'))
  await waitFor(() => panelText(document).includes('já contém texto'))
  assert.equal(controls.current.draft, 'Rascunho do vendedor')

  controls.current.draft = ''
  click(document, document.querySelector('[data-yolen-seller-message-action="insert"]'))
  await sleep(20)
  assert.equal(controls.current.draft, MESSAGE_A)
  assert.deepEqual(controls.sent, [], 'incluir nunca envia')
  assert.deepEqual(controls.violations, [])
})

test('ANÁLISE: inserção com rascunho ocupado exige confirmação humana e registra o uso da conversa atual', async () => {
  const { document, window, calls, controls } = startNeutralCompanion(analysisOptions())

  const confirmations = []
  window.confirm = (text) => {
    confirmations.push(text)
    return confirmations.length > 1
  }

  const insertButton = await analyzeUntilInsertAvailable(document, calls)
  assert.match(insertButton.textContent, /Inserir no Canal Contrato/)

  controls.current.draft = 'Rascunho do vendedor'
  click(document, insertButton)
  await sleep(100)
  assert.equal(controls.current.draft, 'Rascunho do vendedor', 'recusa preserva o rascunho')
  assert.match(confirmations[0], /O campo do Canal Contrato já tem texto/)
  assert.equal(registerCalls(calls, 'inserted').length, 0)

  click(document, document.querySelector('[data-yolen-action="insert-suggested-message"]'))
  await waitFor(() => registerCalls(calls, 'inserted').length === 1)
  assert.equal(controls.current.draft, MESSAGE_A)
  assert.equal(registerCalls(calls, 'inserted')[0].payload.cycle_id, CYCLE_A)
  assert.deepEqual(
    controls.calls.filter((call) => call.name === 'applyMessage').map((call) => ({ ...call.detail.expected })),
    [{ conversationKey: 'conv-a', replaceExisting: true }],
  )
  assert.deepEqual(controls.violations, [])
})

test('pré-envio: o Core decide sobre a tentativa normalizada; "Enviar mesmo assim" envia uma única vez o rascunho confirmado', async () => {
  const { document, calls, controls } = startNeutralCompanion(analysisOptions())

  await analyzeUntilInsertAvailable(document, calls)

  const risky = 'Te dou 20% de desconto se fechar hoje'
  controls.typeDraft(risky)
  await sleep(50)

  assert.deepEqual({ ...controls.userSend() }, { block: true }, 'rascunho arriscado é bloqueado pelo gate')
  assert.deepEqual(controls.sent, [])

  await waitFor(() => document.querySelector('[data-yolen-action="send-pre-send-anyway"]'))
  click(document, document.querySelector('[data-yolen-action="send-pre-send-anyway"]'))

  await waitFor(() => controls.sent.length === 1)
  await sleep(400)
  assert.equal(controls.sent.length, 1, 'sem envio duplicado nem recursão')
  assert.equal(controls.sent[0].text, risky)

  const trigger = controls.calls.filter((call) => call.name === 'triggerSend')
  assert.equal(trigger.length, 1)
  assert.deepEqual({ ...trigger[0].detail }, { conversationKey: 'conv-a', draftText: risky })
  assert.deepEqual(controls.violations, [])
})

test('capabilities indisponíveis: sem interceptação, áudio, inserção nem busca de telefone — mesmo estado canônico', async () => {
  const limited = {
    canProvideTrustedPhone: false,
    canProvideDisplayName: false,
    canReadMessages: true,
    canObserveConversationChanges: true,
    canApplyMessage: false,
    canInterceptSend: false,
    canReadAudio: false,
    canRequestContactDetails: false,
    canClassifyGroupOrSelf: false,
    canDetectDeletedOrEdited: false,
    canProvideMountPoint: true,
  }

  const { document, calls, controls } = startNeutralCompanion({
    capabilities: limited,
    conversations: { 'conv-a': conversation('conv-a', { phoneEvidence: 'absent' }) },
    messageGenerationResult: { status: 'ready', message: MESSAGE_A, error: null },
  })

  await waitFor(() => panelOf(document))
  await sleep(1200)

  assert.deepEqual(controls.subscriptionCounts, { host: 1, draft: 0, send: 0 })
  assert.equal(controls.calls.some((call) => call.name === 'listenToAudioBridge'), false)
  assert.equal(controls.calls.some((call) => call.name === 'acquireContactEvidence'), false)
  assert.equal(resolveLeadCalls(calls).length, 0)
  assert.deepEqual(controls.violations, [])
})

test('capability de montagem indisponível: o Core não renderiza (fail-closed)', async () => {
  const { document, controls } = startNeutralCompanion({
    capabilities: { ...ALL_CAPABILITIES, canProvideMountPoint: false },
  })

  await sleep(800)
  assert.equal(panelOf(document), null)
  assert.equal(controls.calls.some((call) => call.name === 'getMountPoint'), false)
  assert.deepEqual(controls.violations, [])
})

test('A→B→A: cada troca é uma geração nova; resultado atrasado de A₁ não aparece em B nem em A₂', async () => {
  let releaseFirstGeneration
  let generationCount = 0

  const { document, calls, controls } = startNeutralCompanion({
    messageGenerationResult: () => {
      generationCount += 1

      if (generationCount === 1) {
        return new Promise((resolve) => {
          releaseFirstGeneration = () => resolve({ status: 'ready', message: MESSAGE_A, error: null })
        })
      }

      return { status: 'ready', message: 'Mensagem nova', error: null }
    },
  })

  await openMessageAreaAndGenerate(document, calls)
  await waitFor(() => typeof releaseFirstGeneration === 'function')

  const resolvesBeforeB = resolveLeadCalls(calls).length
  controls.switchTo('conv-b')
  await waitFor(() => resolveLeadCalls(calls).slice(resolvesBeforeB).some((call) => call.payload.phone === PHONE_B))
  await waitFor(() => panelText(document).includes('Lead Beta'))
  assert.doesNotMatch(panelText(document), /Lead Alfa/)

  controls.switchTo('conv-a')
  await waitFor(() => panelText(document).includes('Lead Alfa'))
  await sleep(300)

  releaseFirstGeneration()
  await sleep(300)

  assert.doesNotMatch(panelText(document), new RegExp(MESSAGE_A), 'geração de A₁ não reaparece em A₂')
  assert.equal(document.querySelector('[data-yolen-seller-message-action="insert"]'), null)
  assert.deepEqual(controls.violations, [])
})

test('troca de empresa: resultado atrasado da empresa anterior não altera o contexto novo', async () => {
  let getMeCount = 0
  let releaseFirstGeneration

  const { document, calls, controls } = startNeutralCompanion({
    getMeResult: () => {
      getMeCount += 1
      const companyId = getMeCount === 1 ? 'company-1' : 'company-2'

      return {
        ok: true,
        statusCode: 200,
        origin: 'https://cockpit-comercial-vocn.vercel.app',
        payload: {
          ok: true,
          user: { id: 'user-1', full_name: 'Vendedor Teste' },
          active_company: { id: companyId, name: `Empresa ${companyId}`, role: 'member' },
        },
      }
    },
    messageGenerationResult: () =>
      new Promise((resolve) => {
        releaseFirstGeneration = () => resolve({ status: 'ready', message: MESSAGE_A, error: null })
      }),
  })

  await openMessageAreaAndGenerate(document, calls)
  await waitFor(() => typeof releaseFirstGeneration === 'function')

  const resolvesBefore = resolveLeadCalls(calls).length
  click(document, document.querySelector('[data-yolen-action="refresh"]'))
  await waitFor(() => getMeCount >= 2)
  await waitFor(() => resolveLeadCalls(calls).length > resolvesBefore)
  await sleep(300)

  releaseFirstGeneration()
  await sleep(300)

  assert.doesNotMatch(panelText(document), new RegExp(MESSAGE_A))
  assert.deepEqual(controls.violations, [])
})

test('caminho real: WhatsAppAdapter + Core + views reais pela composição exata do manifest', async () => {
  const header = '+55 11 98888-7777'
  const { document, calls } = loadContentScript({
    initialHtml: `<!doctype html><html><body><div id="app"><div id="main">
      <header><span title="${header}">${header}</span></header>
      <div id="conversation-body"></div>
      <footer><div contenteditable="true" role="textbox" data-lexical-editor="true"></div></footer>
    </div></div></body></html>`,
    resolutionsByPhone: { [PHONE_A]: resolutionFor(PHONE_A, CYCLE_A, 'Lead Alfa') },
    leadSummaryResult: summaryResult,
    messageGenerationResult: { status: 'ready', message: MESSAGE_A, error: null },
  })

  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_A))
  await waitFor(() => panelText(document).includes('Lead Alfa'))

  const areas = Array.from(panelOf(document).querySelectorAll('[data-yolen-seller-area]')).map((element) =>
    element.getAttribute('data-yolen-seller-area'),
  )
  assert.deepEqual(areas, ['now', 'message', 'analysis', 'client'])

  await openMessageAreaAndGenerate(document, calls)
  await waitFor(() => document.querySelector('[data-yolen-seller-message-action="insert"]'))
  assert.equal(
    document.querySelector('[data-yolen-seller-message-action="insert"]').textContent,
    'Incluir no WhatsApp',
  )
})

test('capability de inserção indisponível: MENSAGEM mostra o estado canônico de campo indisponível e oferece Copiar', async () => {
  const { document, calls, controls } = startNeutralCompanion({
    capabilities: { ...ALL_CAPABILITIES, canApplyMessage: false },
    messageGenerationResult: { status: 'ready', message: MESSAGE_A, error: null },
  })

  await openMessageAreaAndGenerate(document, calls)
  await waitFor(() => document.querySelector('[data-yolen-seller-message-action="insert"]'))
  click(document, document.querySelector('[data-yolen-seller-message-action="insert"]'))

  await waitFor(() => panelText(document).includes('Não encontrei o campo de mensagem do Canal Contrato. Use Copiar.'))
  assert.equal(controls.current.draft, '')
  assert.equal(controls.calls.some((call) => call.name === 'insertTextIntoEmptyComposer'), false)
  assert.ok(document.querySelector('[data-yolen-seller-message-action="copy"]'))
  assert.deepEqual(controls.violations, [])
})
