// Pacote de estabilização P0 — MSG-01 (correção focal pós-live): seleção
// de texto com o mouse no campo "o que você quer comunicar" da MENSAGEM.
//
// Contrato de produto (nos dois canais, mesmo Core): o campo é edição
// nativa de texto — clicar posiciona o cursor; pressionar, arrastar e
// soltar seleciona um trecho (palavra, várias palavras, começando no meio,
// da direita para a esquerda); digitar substitui a seleção; Backspace e
// Delete apagam a seleção; a seleção continua depois de um render de fundo
// sem dado comercial novo; o campo nunca é recriado e o foco não sai dele.
//
// O fluxo físico é pointerdown/mousedown → movimento → mouseup, com a
// semântica do navegador descrita em product-stability.mjs
// (mouseSelectText/pressKeyInField).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PARITY_PHONE,
  panelOf,
  startParityChannel,
  waitForBoth,
  waitForQuiet,
} from '../e3-test-support/cross-channel-parity.mjs'
import {
  defaultAgoraDecisionState,
  defaultClientContext,
  defaultLeadResolution,
} from '../e3-test-support/load-content-script.mjs'
import {
  installControlledPolling,
  mouseSelectText,
  pinAutomaticAnalysisDelay,
  pressKeyInField,
  realClick,
  runPolling,
  settleStabilityQueues,
} from '../e3-test-support/product-stability.mjs'

const CHANNELS = ['whatsapp', 'manychat']
const DRAFT = 'Quero responder ao cliente sobre o preço do plano anual hoje'
const SUMMARY = 'Cliente pediu a proposta do plano anual.'

function range(word) {
  const start = DRAFT.indexOf(word)
  assert.notEqual(start, -1, `pré-condição: "${word}" está no rascunho`)
  return { start, end: start + word.length }
}

function start(channel) {
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
        decisionStateResult: defaultAgoraDecisionState(),
        clientContextResult: defaultClientContext(),
        leadSummaryResult: (_count, request) => ({
          ok: true,
          data: {
            identity: { company_id: 'company-1', lead_id: 'lead-p0', cycle_id: request?.cycle_id, conversation_key: request?.conversation_key },
            summary: { summary: SUMMARY, version: 1, updated_at: '2026-09-20T12:00:00.000Z' },
            working_summary: SUMMARY,
          },
        }),
        messageGenerationResult: { status: 'ready', message: 'Mensagem gerada de teste.', error: null },
      },
    },
    {
      beforeLoad: ({ dom }) => {
        pinAutomaticAnalysisDelay(dom, 2 ** 31 - 1)
        installControlledPolling(dom)
      },
    },
  )
}

function intentField(runtime) {
  return panelOf(runtime)?.querySelector('[data-yolen-seller-message-intent]') ?? null
}

// MENSAGEM aberta, rascunho digitado, cursor no fim.
async function readyDraft(channel) {
  const runtime = start(channel)
  await waitForBoth([runtime], (candidate) => candidate.calls.some((call) => call.action === 'LOAD_CUSTOMER_VIEW_MODEL'))
  await waitForQuiet([runtime])
  realClick(runtime, panelOf(runtime).querySelector('[data-yolen-seller-area="message"]'))
  await waitForBoth([runtime], (candidate) => Boolean(intentField(candidate)))
  await settleStabilityQueues(runtime)

  const field = intentField(runtime)
  realClick(runtime, field)
  field.value = DRAFT
  field.setSelectionRange(DRAFT.length, DRAFT.length)
  field.dispatchEvent(new runtime.window.InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  await settleStabilityQueues(runtime)

  return { runtime, field }
}

function selectedText(field) {
  return field.value.slice(field.selectionStart, field.selectionEnd)
}

function assertSelection(runtime, field, expected, label) {
  assert.equal(intentField(runtime), field, `${runtime.channel} ${label}: o campo não pode ser recriado`)
  assert.equal(runtime.document.activeElement, field, `${runtime.channel} ${label}: o foco continua no campo`)
  assert.equal(field.value, expected.value, `${runtime.channel} ${label}: texto`)
  assert.equal(field.selectionStart, expected.start, `${runtime.channel} ${label}: início da seleção`)
  assert.equal(field.selectionEnd, expected.end, `${runtime.channel} ${label}: fim da seleção`)
}

async function backgroundRender(runtime) {
  runPolling(runtime)
  await waitForQuiet([runtime], 300)
  await settleStabilityQueues(runtime)
}

function generateCalls(runtime) {
  return runtime.calls.filter((call) => call.action === 'LOAD_METHOD_GUIDANCE' && call.payload?.operation === 'generate_message')
}

for (const channel of CHANNELS) {
  test(`MSG-01 seleção (${channel}): clique simples posiciona o cursor (controle — já aprovado no live)`, async () => {
    const { runtime, field } = await readyDraft(channel)
    const target = range('preço').start

    mouseSelectText(runtime, field, { from: target, to: target })
    assertSelection(runtime, field, { value: DRAFT, start: target, end: target }, 'clique')
  })

  test(`MSG-01 seleção (${channel}): arrastar sobre uma palavra no meio do texto seleciona só ela e a seleção sobrevive a um render de fundo`, async () => {
    const { runtime, field } = await readyDraft(channel)
    const word = range('preço')

    mouseSelectText(runtime, field, { from: word.start, to: word.end })
    assertSelection(runtime, field, { value: DRAFT, ...word }, 'palavra selecionada')
    assert.equal(selectedText(field), 'preço')

    await backgroundRender(runtime)
    assertSelection(runtime, field, { value: DRAFT, ...word }, 'depois do render de fundo')
  })

  test(`MSG-01 seleção (${channel}): arrastar da direita para a esquerda seleciona várias palavras`, async () => {
    const { runtime, field } = await readyDraft(channel)
    const phrase = range('sobre o preço do plano')

    mouseSelectText(runtime, field, { from: phrase.end, to: phrase.start })
    assertSelection(runtime, field, { value: DRAFT, ...phrase }, 'trecho selecionado')
    assert.equal(selectedText(field), 'sobre o preço do plano')
    assert.equal(field.selectionDirection, 'backward')

    await backgroundRender(runtime)
    assertSelection(runtime, field, { value: DRAFT, ...phrase }, 'depois do render de fundo')
  })

  test(`MSG-01 seleção (${channel}): digitar substitui o trecho selecionado e "Gerar mensagem" envia o texto novo`, async () => {
    const { runtime, field } = await readyDraft(channel)
    const word = range('preço')

    mouseSelectText(runtime, field, { from: word.start, to: word.end })
    pressKeyInField(runtime, field, 'X')
    const expected = `${DRAFT.slice(0, word.start)}X${DRAFT.slice(word.end)}`
    assertSelection(runtime, field, { value: expected, start: word.start + 1, end: word.start + 1 }, 'seleção substituída')

    await backgroundRender(runtime)
    assertSelection(runtime, field, { value: expected, start: word.start + 1, end: word.start + 1 }, 'depois do render de fundo')

    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-seller-message-action="generate"]'))
    await waitForBoth([runtime], (candidate) => generateCalls(candidate).length === 1)
    assert.equal(generateCalls(runtime)[0].payload.seller_intent, expected)
  })

  test(`MSG-01 seleção (${channel}): Delete sobre a seleção apaga só o trecho selecionado`, async () => {
    const { runtime, field } = await readyDraft(channel)
    const phrase = range('do plano ')

    mouseSelectText(runtime, field, { from: phrase.start, to: phrase.end })
    pressKeyInField(runtime, field, 'Delete')
    const expected = `${DRAFT.slice(0, phrase.start)}${DRAFT.slice(phrase.end)}`
    assertSelection(runtime, field, { value: expected, start: phrase.start, end: phrase.start }, 'Delete')

    await backgroundRender(runtime)
    assertSelection(runtime, field, { value: expected, start: phrase.start, end: phrase.start }, 'depois do render de fundo')
  })

  test(`MSG-01 seleção (${channel}): Backspace sobre a seleção apaga só o trecho selecionado`, async () => {
    const { runtime, field } = await readyDraft(channel)
    const word = range('anual ')

    mouseSelectText(runtime, field, { from: word.end, to: word.start })
    pressKeyInField(runtime, field, 'Backspace')
    const expected = `${DRAFT.slice(0, word.start)}${DRAFT.slice(word.end)}`
    assertSelection(runtime, field, { value: expected, start: word.start, end: word.start }, 'Backspace')

    await backgroundRender(runtime)
    assertSelection(runtime, field, { value: expected, start: word.start, end: word.start }, 'depois do render de fundo')
  })
}
