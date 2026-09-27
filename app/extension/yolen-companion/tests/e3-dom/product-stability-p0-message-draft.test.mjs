// Pacote de estabilização P0 — MSG-01: o campo "o que você quer comunicar"
// da aba MENSAGEM fica sob controle do vendedor.
//
// Contrato de produto (nos dois canais, mesmo Core):
// - enquanto o vendedor edita, o rascunho local é a autoridade: nenhum
//   render de fundo (polling, recarga de AGORA/ANÁLISE/CLIENTE, sessão,
//   mensagem nova, recarga do resumo) recria o campo, tira o foco, move o
//   cursor, altera a seleção ou troca o texto;
// - digitar, apagar (Backspace/Delete), editar no meio e selecionar
//   funcionam com textos de ~20, ~100, ~300 e ~800 caracteres;
// - política de rascunho: navegar entre as abas do Companion e
//   minimizar/expandir na MESMA conversa preservam o rascunho; trocar de
//   conversa descarta o rascunho (nunca é transportado de A para B e não é
//   restaurado ao voltar para A — política canônica já existente);
// - "Gerar mensagem" envia exatamente o texto confirmado no momento do
//   clique.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PARITY_CONVERSATIONS,
  PARITY_PHONE,
  panelOf,
  panelText,
  startParityChannel,
  startParityConversations,
  switchParityConversation,
  waitForBoth,
  waitForQuiet,
} from '../e3-test-support/cross-channel-parity.mjs'
import {
  defaultAgoraDecisionState,
  defaultClientContext,
  defaultLeadResolution,
} from '../e3-test-support/load-content-script.mjs'
import {
  appendIncomingMessage,
  countCalls,
  installControlledPolling,
  pinAutomaticAnalysisDelay,
  realClick,
  runPolling,
  settleStabilityQueues,
} from '../e3-test-support/product-stability.mjs'

const CHANNELS = ['whatsapp', 'manychat']
const NEVER_MS = 2 ** 31 - 1
const SUMMARY = 'Cliente pediu a proposta do plano anual.'
const UPDATED_SUMMARY = 'Cliente pediu a proposta do plano anual e perguntou sobre desconto.'

function draftOfLength(length) {
  const words = 'Quero responder ao cliente sobre o preço do plano anual e oferecer uma condição clara de pagamento '
  let text = ''
  while (text.length < length) text += words
  return text.slice(0, length)
}

function summaryResult(textForCall = () => SUMMARY) {
  return (count, request) => {
    const text = textForCall(count, request)
    return {
      ok: true,
      data: {
        identity: { company_id: 'company-1', lead_id: 'lead-p0', cycle_id: request?.cycle_id, conversation_key: request?.conversation_key },
        summary: { summary: text, version: 1, updated_at: '2026-09-20T12:00:00.000Z' },
        working_summary: text,
      },
    }
  }
}

// AGORA muda a cada recarga: todo polling produz HTML novo de área, o pior
// caso para o campo em edição.
let agoraRevision = 0
function changingAgora() {
  agoraRevision += 1
  return defaultAgoraDecisionState({
    silent: false,
    silent_reason: null,
    primary: {
      kind: 'respond_objection',
      priority: 'high',
      headline: `Responder a objeção de preço (revisão ${agoraRevision})`,
      explanation: 'O cliente questionou o valor do plano anual.',
      reason: 'objection_open',
      evidence_message_ids: ['m1'],
      cta: { kind: 'open_message', label: 'Preparar resposta' },
    },
    secondary: [],
  })
}

function start(channel, backend = {}) {
  return startParityChannel(
    channel,
    {
      resolution: defaultLeadResolution({
        status: 'OWNED_BY_ME',
        phone: PARITY_PHONE,
        lead: { id: 'lead-p0', name: 'Lead Estável', phone: PARITY_PHONE, email: null, cpf_cnpj: null, deleted_at: null },
        cycle: { id: 'cycle-p0', status: 'contato', owner_user_id: 'user-1' },
      }),
      messages: [{ mid: 'm1', text: 'Quanto custa o plano anual com implantação?' }],
      backend: {
        decisionStateResult: changingAgora,
        clientContextResult: defaultClientContext(),
        leadSummaryResult: summaryResult(),
        messageGenerationResult: { status: 'ready', message: 'Mensagem gerada de teste.', error: null },
        ...backend,
      },
    },
    {
      beforeLoad: ({ dom }) => {
        pinAutomaticAnalysisDelay(dom, NEVER_MS)
        installControlledPolling(dom)
      },
    },
  )
}

function intentField(runtime) {
  return panelOf(runtime)?.querySelector('[data-yolen-seller-message-intent]') ?? null
}

async function openMessageTab(runtime) {
  await waitForBoth([runtime], (candidate) => Boolean(panelOf(candidate)?.querySelector('[data-yolen-seller-area="message"]')))
  realClick(runtime, panelOf(runtime).querySelector('[data-yolen-seller-area="message"]'))
  await waitForBoth([runtime], (candidate) => Boolean(intentField(candidate)))
  await settleStabilityQueues(runtime)
  return intentField(runtime)
}

// Uma edição real do vendedor: o navegador altera o valor e o cursor e
// dispara `input`.
function edit(runtime, field, value, selectionStart = value.length, selectionEnd = selectionStart, inputType = 'insertText') {
  field.value = value
  field.setSelectionRange(selectionStart, selectionEnd)
  field.dispatchEvent(new runtime.window.InputEvent('input', { bubbles: true, inputType }))
}

// Render de fundo sem ação do vendedor: um ciclo de polling do Core (ticker
// de AGORA/ANÁLISE/CLIENTE + refresh de sessão), com as respostas.
async function backgroundRender(runtime) {
  runPolling(runtime)
  await waitForQuiet([runtime], 300)
  await settleStabilityQueues(runtime)
}

function assertFieldUnderSellerControl(runtime, field, expected, label) {
  assert.equal(intentField(runtime), field, `${runtime.channel} ${label}: o campo não pode ser recriado`)
  assert.equal(runtime.document.activeElement, field, `${runtime.channel} ${label}: o foco continua no campo`)
  assert.equal(field.value, expected.value, `${runtime.channel} ${label}: texto intacto`)
  assert.equal(field.selectionStart, expected.selectionStart, `${runtime.channel} ${label}: início do cursor/seleção`)
  assert.equal(field.selectionEnd, expected.selectionEnd, `${runtime.channel} ${label}: fim do cursor/seleção`)
}

function generateCalls(runtime) {
  return runtime.calls.filter((call) => call.action === 'LOAD_METHOD_GUIDANCE' && call.payload?.operation === 'generate_message')
}

async function readyMessageField(channel, backend) {
  const runtime = start(channel, backend)
  await waitForBoth([runtime], (candidate) => candidate.calls.some((call) => call.action === 'LOAD_CUSTOMER_VIEW_MODEL'))
  await waitForQuiet([runtime])
  const field = await openMessageTab(runtime)
  realClick(runtime, field)
  await waitForQuiet([runtime])
  await settleStabilityQueues(runtime)
  assert.equal(intentField(runtime), field, 'pré-condição: focar o campo não o recria')
  return { runtime, field }
}

for (const channel of CHANNELS) {
  for (const length of [20, 100, 300, 800]) {
    test(`MSG-01 (${channel}, ~${length} caracteres): digitar, apagar, editar no meio e selecionar sobrevivem a renders de fundo; Gerar envia o texto do clique`, async () => {
      const { runtime, field } = await readyMessageField(channel)
      const text = draftOfLength(length)
      const chunk = Math.max(1, Math.ceil(length / 4))

      // Digitação em rajadas com render de fundo entre elas (append).
      for (let end = chunk; end < length + chunk; end += chunk) {
        const value = text.slice(0, Math.min(end, length))
        edit(runtime, field, value)
        await backgroundRender(runtime)
        assertFieldUnderSellerControl(runtime, field, { value, selectionStart: value.length, selectionEnd: value.length }, `digitando até ${value.length}`)
      }

      // Cursor no meio + Backspace.
      const middle = Math.floor(length / 2)
      let value = text.slice(0, middle - 1) + text.slice(middle)
      edit(runtime, field, value, middle - 1, middle - 1, 'deleteContentBackward')
      await backgroundRender(runtime)
      assertFieldUnderSellerControl(runtime, field, { value, selectionStart: middle - 1, selectionEnd: middle - 1 }, 'Backspace no meio')

      // Delete (apaga à frente do cursor).
      value = value.slice(0, middle - 1) + value.slice(middle)
      edit(runtime, field, value, middle - 1, middle - 1, 'deleteContentForward')
      await backgroundRender(runtime)
      assertFieldUnderSellerControl(runtime, field, { value, selectionStart: middle - 1, selectionEnd: middle - 1 }, 'Delete no meio')

      // Inserção no meio.
      value = `${value.slice(0, 2)}XY${value.slice(2)}`
      edit(runtime, field, value, 4, 4)
      await backgroundRender(runtime)
      assertFieldUnderSellerControl(runtime, field, { value, selectionStart: 4, selectionEnd: 4 }, 'inserção no meio')

      // Seleção estável (sem editar).
      field.setSelectionRange(1, Math.min(value.length, 9))
      await backgroundRender(runtime)
      assertFieldUnderSellerControl(runtime, field, { value, selectionStart: 1, selectionEnd: Math.min(value.length, 9) }, 'seleção')

      const expectedIntent = field.value.trim()
      realClick(runtime, panelOf(runtime).querySelector('[data-yolen-seller-message-action="generate"]'))
      await waitForBoth([runtime], (candidate) => generateCalls(candidate).length === 1)
      assert.equal(generateCalls(runtime)[0].payload.seller_intent, expectedIntent, 'Gerar mensagem consome exatamente o texto do clique')
    })
  }

  test(`MSG-01 (${channel}): resumo recarregado por mensagem nova durante a digitação não troca nem apaga o rascunho`, async () => {
    const { runtime, field } = await readyMessageField(channel, {
      leadSummaryResult: summaryResult((count) => (count > 1 ? UPDATED_SUMMARY : SUMMARY)),
    })
    const draft = 'Quero confirmar o desconto para fechamento hoje'
    edit(runtime, field, draft)
    const summaryCalls = countCalls(runtime, 'LOAD_LEAD_SUMMARY')

    appendIncomingMessage(runtime, { mid: 'm2', text: 'Se eu fechar hoje tem desconto?' })
    await waitForBoth([runtime], (candidate) => countCalls(candidate, 'LOAD_LEAD_SUMMARY') > summaryCalls)
    await waitForQuiet([runtime])
    await settleStabilityQueues(runtime)
    assertFieldUnderSellerControl(runtime, field, { value: draft, selectionStart: draft.length, selectionEnd: draft.length }, 'resumo recarregado')

    // Sair do campo deixa as áreas aplicarem o resumo novo; o rascunho da
    // conversa continua o mesmo.
    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-seller-area="now"]'))
    await settleStabilityQueues(runtime)
    await waitForBoth([runtime], (candidate) => panelText(candidate).includes(UPDATED_SUMMARY))
    const reopened = await openMessageTab(runtime)
    assert.equal(reopened.value, draft, 'rascunho preservado depois do resumo novo')

    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-seller-message-action="generate"]'))
    await waitForBoth([runtime], (candidate) => generateCalls(candidate).length === 1)
    assert.equal(generateCalls(runtime)[0].payload.seller_intent, draft)
    assert.equal(generateCalls(runtime)[0].payload.working_summary, UPDATED_SUMMARY)
  })

  test(`MSG-01 (${channel}): navegar entre abas e minimizar/expandir na mesma conversa preservam o rascunho`, async () => {
    const { runtime, field } = await readyMessageField(channel)
    const draft = 'Quero propor uma reunião amanhã às dez'
    edit(runtime, field, draft)

    for (const area of ['now', 'analysis', 'client', 'message']) {
      realClick(runtime, panelOf(runtime).querySelector(`[data-yolen-seller-area="${area}"]`))
      await settleStabilityQueues(runtime)
    }
    await waitForBoth([runtime], (candidate) => Boolean(intentField(candidate)))
    assert.equal(intentField(runtime).value, draft, 'rascunho preservado na navegação interna')

    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-action="collapse-companion"]'))
    await settleStabilityQueues(runtime)
    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-action="expand-companion"]'))
    await settleStabilityQueues(runtime)
    await waitForBoth([runtime], (candidate) => Boolean(intentField(candidate)))
    assert.equal(intentField(runtime).value, draft, 'rascunho preservado ao minimizar/expandir')
  })
}

// A → B → A: o rascunho é da conversa. Nunca vai para B; ao voltar para A a
// política canônica (troca de conversa descarta o rascunho) vale.
function conversationResolution(id) {
  const phone = PARITY_CONVERSATIONS[id].phone
  const cycleId = `cycle-conv-${id.toLowerCase()}`
  return defaultLeadResolution({
    status: 'OWNED_BY_ME',
    phone,
    lead: { id: `lead-${cycleId}`, name: id === 'A' ? 'Lead Alfa' : 'Lead Beta', phone, email: null, cpf_cnpj: null, deleted_at: null },
    cycle: { id: cycleId, status: 'contato', owner_user_id: 'user-1' },
  })
}

function summaryLoadedFor(cycleId) {
  return (runtime) => {
    const last = runtime.calls.filter((call) => call.action === 'LOAD_LEAD_SUMMARY').at(-1)
    return last?.payload?.cycle_id === cycleId && Boolean(panelOf(runtime)?.querySelector('[data-yolen-seller-message-mount]'))
  }
}

for (const channel of CHANNELS) {
  test(`MSG-01 (${channel}): A → B → A — rascunho de A nunca aparece em B; ao voltar para A o rascunho foi descartado`, async () => {
    const runtime = startParityConversations(
      channel,
      {
        A: { resolution: conversationResolution('A'), messages: [{ mid: 'm1', text: 'Mensagem da conversa A sobre preço.' }] },
        B: { resolution: conversationResolution('B'), messages: [{ mid: 'm1', text: 'Mensagem da conversa B sobre prazo.' }] },
      },
      {
        decisionStateResult: defaultAgoraDecisionState(),
        clientContextResult: defaultClientContext(),
        leadSummaryResult: summaryResult((_count, request) => `Resumo do ciclo ${request?.cycle_id}.`),
        beforeLoad: ({ dom }) => pinAutomaticAnalysisDelay(dom, NEVER_MS),
      },
    )
    const draftA = 'RASCUNHO_EXCLUSIVO_DA_CONVERSA_A'
    const draftB = 'RASCUNHO_EXCLUSIVO_DA_CONVERSA_B'

    await waitForBoth([runtime], summaryLoadedFor('cycle-conv-a'))
    await waitForQuiet([runtime])
    edit(runtime, await openMessageTab(runtime), draftA)

    switchParityConversation(runtime, 'B')
    await waitForBoth([runtime], (candidate) => panelText(candidate).includes('Lead Beta'))
    await waitForBoth([runtime], summaryLoadedFor('cycle-conv-b'))
    await waitForQuiet([runtime])
    const fieldB = await openMessageTab(runtime)
    assert.equal(fieldB.value, '', 'B abre sem rascunho')
    assert.doesNotMatch(panelOf(runtime).innerHTML, new RegExp(draftA), 'rascunho de A nunca aparece em B')
    edit(runtime, fieldB, draftB)

    switchParityConversation(runtime, 'A')
    await waitForBoth([runtime], (candidate) => panelText(candidate).includes('Lead Alfa'))
    await waitForBoth([runtime], summaryLoadedFor('cycle-conv-a'))
    await waitForQuiet([runtime])
    const fieldA = await openMessageTab(runtime)
    assert.equal(fieldA.value, '', 'política: trocar de conversa descarta o rascunho')
    assert.doesNotMatch(panelOf(runtime).innerHTML, new RegExp(`${draftA}|${draftB}`), 'nenhum rascunho atravessa conversas')
  })
}
