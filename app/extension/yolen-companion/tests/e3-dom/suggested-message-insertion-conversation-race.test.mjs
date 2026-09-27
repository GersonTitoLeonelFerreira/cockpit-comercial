// FASE 5 — corrida da inserção da mensagem sugerida (auditoria de
// 988774aa). Composição REAL do manifest (WhatsAppAdapter + Core +
// controllers + views) em jsdom, com transporte controlado.
//
// Cenários:
// 1. ANÁLISE, janela física: o WhatsApp já mostra B, mas o Core ainda
//    está em A (debounce do observer). "Inserir" não pode escrever a
//    mensagem de A no campo de B nem registrar o uso.
// 2. ANÁLISE, A→B→A durante o registro: o registro de A termina depois que
//    o vendedor foi para B e voltou para A (nova geração). O resultado
//    atrasado não pode armar o envio pendente na geração nova — um envio
//    manual em A₂ não pode ser registrado como uso da sugestão de A₁.
// 3. MENSAGEM, janela física: mesmo cenário 1 pela aba MENSAGEM.
// 4. Rascunho ocupado: sem confirmação humana, nada é substituído.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  defaultAgoraDecisionState,
  defaultLeadResolution,
  ingestCalls,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const CONVERSATION_A_TITLE = '+55 11 98888-7777'
const CONVERSATION_B_TITLE = '+55 21 97777-6666'
const PHONE_A = '5511988887777'
const PHONE_B = '5521977776666'
const CYCLE_A = 'cycle-race-a'
const CYCLE_B = 'cycle-race-b'
const MESSAGE_A = 'MENSAGEM_SUGERIDA_DA_CONVERSA_A_NUNCA_EM_B'
const MARKER_A = 'MENSAGEM_DA_ABA_MENSAGEM_DA_CONVERSA_A'
const SUMMARY_A = 'Cliente A perguntou sobre o preço do plano.'
const SUMMARY_B = 'Cliente B pediu para remarcar a demonstração.'

function pageHtml({ draft = '' } = {}) {
  const messagesHtml = buildMessageHtml({
    id: 'msg-a1',
    prePlainText: '[10:00, 21/08/2026] Cliente A: ',
    text: 'O preço ficou acima do que eu esperava.',
  })

  return `<!doctype html><html><body>
    <div id="app">
      <div id="main">
        <header><span title="${CONVERSATION_A_TITLE}">${CONVERSATION_A_TITLE}</span></header>
        <div id="conversation-body">${messagesHtml}</div>
        <footer>
          <div contenteditable="true" role="textbox" data-lexical-editor="true">${draft}</div>
          <button type="button" aria-label="Enviar"><span data-icon="send"></span></button>
        </footer>
      </div>
    </div>
  </body></html>`
}

function evidence(summary) {
  return { summary, evidence_message_ids: ['msg-a1'], memory_ids: [] }
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

function deepOutput(reading) {
  return {
    contract_version: 'phase12a-deep-seller-v1',
    engine_source: 'stateful',
    commercial_relevance: 'commercial',
    commercial_role: 'buyer',
    summary: 'Resumo profundo da conversa.',
    commercial_reading: reading,
    recommended_next_approach: 'Ver leitura comercial.',
    recommended_question: null,
    suggested_message: null,
  }
}

const JOB_ID = 'e'.repeat(64)

function scenarioOptions(overrides = {}) {
  return {
    initialHtml: pageHtml(),
    resolutionsByPhone: {
      [PHONE_A]: defaultLeadResolution({ phone: PHONE_A, cycle: { id: CYCLE_A, status: 'contato', owner_user_id: 'user-1' } }),
      [PHONE_B]: defaultLeadResolution({ phone: PHONE_B, cycle: { id: CYCLE_B, status: 'contato', owner_user_id: 'user-1' } }),
    },
    analysisResult: {
      ok: true,
      data: { deep_analysis: { analysis_job_id: JOB_ID, status: 'queued', message_watermark: 'wm-1' } },
    },
    analysisJobStatusResult: {
      ok: true,
      data: { analysis_job_id: JOB_ID, status: 'succeeded', message_watermark: 'wm-1', result: deepOutput(readingWithMessage()) },
    },
    decisionStateResult: defaultAgoraDecisionState(),
    leadSummaryResult: (_callCount, requestPayload) => ({
      ok: true,
      data: {
        identity: { company_id: 'company-1', lead_id: 'lead-1', cycle_id: requestPayload?.cycle_id, conversation_key: requestPayload?.conversation_key },
        summary: {
          summary: requestPayload?.cycle_id === CYCLE_B ? SUMMARY_B : SUMMARY_A,
          version: 1,
          updated_at: '2026-08-25T12:00:00.000Z',
        },
        working_summary: requestPayload?.cycle_id === CYCLE_B ? SUMMARY_B : SUMMARY_A,
      },
    }),
    ...overrides,
  }
}

function click(document, target) {
  target.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }))
}

function input(document, target) {
  target.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))
}

function composerOf(document) {
  return document.querySelector('#main footer [contenteditable="true"]')
}

// jsdom não implementa execCommand: mesmo mock usado em
// ux8-message-tab-dom (escrita síncrona no campo focado).
function installExecCommand(document) {
  document.execCommand = (command, _showUi, value) => {
    const composer = composerOf(document)

    if (command === 'delete') {
      composer.textContent = ''
      return true
    }

    if (command !== 'insertText') {
      return false
    }

    composer.textContent = `${composer.textContent}${value}`
    return true
  }
}

function setWhatsAppConversation(document, { title, messageId, text }) {
  const header = document.querySelector('header span[title]')
  header.setAttribute('title', title)
  header.textContent = title
  document.getElementById('conversation-body').innerHTML = buildMessageHtml({
    id: messageId,
    prePlainText: `[11:00, 21/08/2026] ${title}: `,
    text,
  })
}

function registerCalls(calls, action) {
  return calls.filter(
    (call) =>
      call.action === 'REGISTER_MESSAGE_ACTION' &&
      (!action || call.payload?.action === action),
  )
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

test('ANÁLISE: com o WhatsApp já em B e o Core ainda em A, "Inserir" não escreve a mensagem de A em B nem registra uso', async () => {
  const { document, calls } = loadContentScript(scenarioOptions())
  installExecCommand(document)

  const insertButton = await analyzeUntilInsertAvailable(document, calls)

  // Troca física da conversa sem mudar as mensagens analisadas (o cenário
  // em que o guard de "análise desatualizada" não protege), seguida do
  // clique no painel (ainda de A): o observer do Core ainda não rodou.
  const header = document.querySelector('header span[title]')
  header.setAttribute('title', CONVERSATION_B_TITLE)
  header.textContent = CONVERSATION_B_TITLE
  click(document, insertButton)

  await sleep(800)

  assert.doesNotMatch(
    composerOf(document).textContent,
    new RegExp(MESSAGE_A),
    'a mensagem de A não pode ser escrita no campo da conversa B',
  )
  assert.equal(registerCalls(calls, 'inserted').length, 0, 'uso de A não pode ser registrado quando a inserção não aconteceu em A')
})

test('ANÁLISE: troca A→B durante a verificação da escrita não confirma a inserção nem registra uso de A', async () => {
  const { document, calls } = loadContentScript(scenarioOptions())

  // Editor assíncrono: o texto só aparece no campo 120 ms depois do
  // comando (a verificação do adapter espera em passos de 50 ms).
  document.execCommand = (command, _showUi, value) => {
    const composer = composerOf(document)

    if (command === 'delete') {
      composer.textContent = ''
      return true
    }

    if (command !== 'insertText') {
      return false
    }

    setTimeout(() => {
      composer.textContent = value
    }, 120)
    return true
  }

  const insertButton = await analyzeUntilInsertAvailable(document, calls)
  click(document, insertButton)

  await sleep(20)
  setWhatsAppConversation(document, { title: CONVERSATION_B_TITLE, messageId: 'msg-b1', text: 'Mensagem de B' })

  await sleep(1500)

  assert.equal(
    registerCalls(calls, 'inserted').length,
    0,
    'texto coincidente encontrado depois da troca não confirma a inserção de A',
  )
})

test('ANÁLISE: registro atrasado de A (A→B→A) não arma envio pendente na geração nova nem registra envio manual de A₂ como uso da sugestão de A₁', async () => {
  let releaseRegistration
  const heldRegistration = new Promise((resolve) => {
    releaseRegistration = resolve
  })

  const { document, calls } = loadContentScript(
    scenarioOptions({
      messageActionResult: (payload) =>
        payload?.action === 'inserted'
          ? heldRegistration
          : { ok: true, data: { already_registered: false } },
    }),
  )
  installExecCommand(document)

  const insertButton = await analyzeUntilInsertAvailable(document, calls)
  click(document, insertButton)

  await waitFor(() => registerCalls(calls, 'inserted').length === 1)
  assert.match(composerOf(document).textContent, new RegExp(MESSAGE_A), 'inserção em A acontece normalmente')
  assert.equal(registerCalls(calls, 'inserted')[0].payload.cycle_id, CYCLE_A)

  // A → B → A com o registro de A₁ ainda em voo.
  const resolvesBeforeB = resolveLeadCalls(calls).length
  composerOf(document).textContent = ''
  setWhatsAppConversation(document, { title: CONVERSATION_B_TITLE, messageId: 'msg-b1', text: 'Mensagem de B' })
  await waitFor(() => resolveLeadCalls(calls).some((call, index) => index >= resolvesBeforeB && call.payload.phone === PHONE_B))

  setWhatsAppConversation(document, { title: CONVERSATION_A_TITLE, messageId: 'msg-a2', text: 'Voltei para A' })
  // A₂ é uma geração nova: o ledger de A é recapturado (a resolução pode
  // vir do cache da composição de transporte, sem nova chamada).
  await waitFor(() =>
    ingestCalls(calls).some((call) =>
      (call.payload?.messages ?? []).some((message) => message.message_key?.includes('msg-a2')),
    ),
  )
  await sleep(300)

  releaseRegistration({ ok: true, data: { already_registered: false } })
  await sleep(100)

  // Envio manual de um texto qualquer em A₂.
  composerOf(document).textContent = 'Oi, tudo bem?'
  click(document, document.querySelector('#main footer button[aria-label="Enviar"]'))
  await sleep(600)

  assert.equal(
    registerCalls(calls, 'sent').length,
    0,
    'o envio manual em A₂ não pode ser registrado como uso da sugestão inserida em A₁',
  )
})

test('ANÁLISE: rascunho existente só é substituído com confirmação humana', async () => {
  const { document, window, calls } = loadContentScript(scenarioOptions({ initialHtml: pageHtml({ draft: 'Rascunho do vendedor' }) }))
  installExecCommand(document)

  let confirmations = 0
  window.confirm = () => {
    confirmations += 1
    return false
  }

  const insertButton = await analyzeUntilInsertAvailable(document, calls)
  click(document, insertButton)
  await sleep(200)

  assert.equal(confirmations, 1)
  assert.equal(composerOf(document).textContent, 'Rascunho do vendedor')
  assert.equal(registerCalls(calls, 'inserted').length, 0)
})

test('MENSAGEM: com o WhatsApp já em B e o Core ainda em A, "Incluir" não escreve a mensagem de A em B', async () => {
  const { document, calls } = loadContentScript(
    scenarioOptions({
      messageGenerationResult: { status: 'ready', message: MARKER_A, error: null },
    }),
  )
  installExecCommand(document)

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => document.querySelector('[data-yolen-seller-area="message"]'))
  click(document, document.querySelector('[data-yolen-seller-area="message"]'))
  await waitFor(() => document.querySelector('[data-yolen-seller-message-intent]'))

  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  intentField.value = 'Quero responder sobre o preço.'
  input(document, intentField)
  click(document, document.querySelector('[data-yolen-seller-message-action="generate"]'))
  await waitFor(() => document.querySelector('[data-yolen-seller-message-action="insert"]'))

  setWhatsAppConversation(document, { title: CONVERSATION_B_TITLE, messageId: 'msg-b1', text: 'Mensagem de B' })
  click(document, document.querySelector('[data-yolen-seller-message-action="insert"]'))
  await sleep(50)

  assert.doesNotMatch(
    composerOf(document).textContent,
    new RegExp(MARKER_A),
    'a mensagem gerada para A não pode ser incluída no campo da conversa B',
  )
})

test('controle positivo: na mesma conversa/geração, o envio manual depois da inserção continua registrado como uso da sugestão', async () => {
  const { document, calls } = loadContentScript(scenarioOptions())
  installExecCommand(document)

  const insertButton = await analyzeUntilInsertAvailable(document, calls)
  click(document, insertButton)
  await waitFor(() => registerCalls(calls, 'inserted').length === 1)
  await sleep(100)

  click(document, document.querySelector('#main footer button[aria-label="Enviar"]'))

  await waitFor(() => registerCalls(calls, 'sent').length === 1)
  assert.equal(registerCalls(calls, 'sent')[0].payload.cycle_id, CYCLE_A)
})
