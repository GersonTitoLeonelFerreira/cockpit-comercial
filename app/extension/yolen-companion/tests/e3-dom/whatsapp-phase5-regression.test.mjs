// FASE 5 — regressão WhatsApp obrigatória do Plano Mestre (áreas sem
// cobertura comportamental E3 dedicada até aqui): registro da conversa no
// histórico (preview → confirmação e erro → nova tentativa),
// enriquecimento confirmado pelo vendedor e transcrição de áudio suportada.
// Composição exata do manifest (WhatsAppAdapter real + Core + views).
// As demais áreas da regressão estão mapeadas no FASE_5_EXECUTION.md.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const TITLE = '+55 11 98888-7777'
const PHONE = '5511988887777'
const CYCLE = 'cycle-regression'

function pageHtml(messagesHtml) {
  return `<!doctype html><html><body>
    <div id="app">
      <div id="main">
        <header><span title="${TITLE}">${TITLE}</span></header>
        <div id="conversation-body">${messagesHtml}</div>
        <footer><div contenteditable="true" role="textbox" data-lexical-editor="true"></div></footer>
      </div>
    </div>
  </body></html>`
}

function textMessage(id, text, direction = 'incoming') {
  return buildMessageHtml({
    id,
    prePlainText: '[10:00, 21/08/2026] Cliente: ',
    text,
    direction,
  })
}

function resolution() {
  return defaultLeadResolution({
    phone: PHONE,
    lead: { id: 'lead-regression', name: 'Lead Regressão', phone: PHONE, email: null, cpf_cnpj: null, deleted_at: null },
    cycle: { id: CYCLE, status: 'contato', owner_user_id: 'user-1' },
  })
}

function click(document, target) {
  target.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }))
}

function actionCalls(calls, action) {
  return calls.filter((call) => call.action === action)
}

async function openClientArea(document) {
  await waitFor(() => document.querySelector('[data-yolen-seller-area="client"]'))
  click(document, document.querySelector('[data-yolen-seller-area="client"]'))
  await waitFor(() => !document.querySelector('[data-yolen-seller-panel="client"]')?.hidden)
}

test('registro da conversa: erro mostra nova tentativa; preview → confirmação registra no histórico do ciclo atual', async () => {
  let previewCount = 0

  const { document, calls } = loadContentScript({
    initialHtml: pageHtml(textMessage('msg-1', 'Quero fechar o plano anual.')),
    resolutionsByPhone: { [PHONE]: resolution() },
    registrationPreviewResult: () => {
      previewCount += 1

      if (previewCount === 1) {
        return { ok: false, error: 'Falha temporária ao gerar o resumo.' }
      }

      return {
        ok: true,
        data: {
          summary_text: 'RESUMO_DO_REGISTRO_DA_CONVERSA',
          watermark: 'wm-1',
          confirmation_token: 'token-1',
          message_count: 1,
          occurred_at: '2026-08-21T13:00:00.000Z',
          already_registered: false,
        },
      }
    },
    registrationConfirmResult: { ok: true, data: { registered: true, event_id: 'event-1' } },
  })

  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE))
  await openClientArea(document)

  await waitFor(() => document.querySelector('[data-yolen-action="register-conversation"]'))
  click(document, document.querySelector('[data-yolen-action="register-conversation"]'))

  await waitFor(() => document.body.textContent.includes('Falha temporária ao gerar o resumo.'))
  assert.match(document.querySelector('[data-yolen-action="register-conversation"]').textContent, /Tentar novamente/)

  click(document, document.querySelector('[data-yolen-action="register-conversation"]'))
  await waitFor(() => document.querySelector('[data-yolen-action="confirm-conversation-registration"]'))
  assert.match(document.body.textContent, /RESUMO_DO_REGISTRO_DA_CONVERSA/)

  click(document, document.querySelector('[data-yolen-action="confirm-conversation-registration"]'))
  await waitFor(() => actionCalls(calls, 'CONFIRM_CONVERSATION_REGISTRATION').length === 1)

  const confirm = actionCalls(calls, 'CONFIRM_CONVERSATION_REGISTRATION')[0].payload
  assert.equal(confirm.cycle_id, CYCLE)
  assert.equal(confirm.confirmation_token, 'token-1')
  assert.equal(actionCalls(calls, 'PREVIEW_CONVERSATION_REGISTRATION').length, 2)
})

test('enriquecimento: dado cadastral citado pelo cliente só é aplicado com confirmação do vendedor', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtml(textMessage('msg-1', 'Pode mandar a proposta para cliente.regressao@example.com por favor.')),
    resolutionsByPhone: { [PHONE]: resolution() },
  })

  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE))
  await openClientArea(document)

  await waitFor(() => document.querySelector('[data-yolen-action="confirm-lead-enrichment"]'))
  assert.equal(actionCalls(calls, 'APPLY_LEAD_ENRICHMENT').length, 0, 'nada é aplicado sem confirmação')

  click(document, document.querySelector('[data-yolen-action="confirm-lead-enrichment"]'))
  await waitFor(() => actionCalls(calls, 'APPLY_LEAD_ENRICHMENT').length === 1)

  const payload = actionCalls(calls, 'APPLY_LEAD_ENRICHMENT')[0].payload
  assert.equal(payload.value, 'cliente.regressao@example.com')
  assert.equal(payload.confirmed_by_human, true)
})

test('áudio suportado: o Core pede a fonte ao adapter por handle opaco e transcreve pela Yolen', async () => {
  const audioMessage = `<div class="message-in" data-id="audio-1"><div data-pre-plain-text="[10:05, 21/08/2026] Cliente: "><audio src="https://audio.test/audio-1.ogg"></audio></div></div>`

  const fetched = []
  const { dom, document, calls } = loadContentScript({
    initialHtml: pageHtml(textMessage('msg-1', 'Mandei um áudio.') + audioMessage),
    resolutionsByPhone: { [PHONE]: resolution() },
    fetchImpl: async (url) => {
      fetched.push(String(url))

      return {
        ok: true,
        status: 200,
        blob: async () => new dom.window.Blob(['OggS-audio'], { type: 'audio/ogg' }),
        json: async () => ({ ok: true }),
      }
    },
  })

  // jsdom não tem layout: o adapter só considera áudio visível com área > 0.
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({
    width: 120, height: 32, top: 0, left: 0, right: 120, bottom: 32,
  })

  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE))
  await waitFor(() => document.querySelector('[data-yolen-action="transcribe-audio"]'), { timeoutMs: 10000 })

  click(document, document.querySelector('[data-yolen-action="transcribe-audio"]'))
  await waitFor(() => actionCalls(calls, 'TRANSCRIBE_AUDIO').length === 1)

  const payload = actionCalls(calls, 'TRANSCRIBE_AUDIO')[0].payload
  assert.equal(payload.cycle_id, CYCLE)
  assert.equal(payload.mime_type, 'audio/ogg')
  assert.equal(payload.file_name, 'whatsapp-audio-1.webm')
  assert.equal(payload.audio_target_key, 'audio-1')
  assert.ok(payload.audio_base64.length > 0)
  assert.deepEqual(fetched, ['https://audio.test/audio-1.ogg'])

  // Sem áudio pendente, a ação de transcrever deixa de ser oferecida.
  await waitFor(() => document.querySelector('[data-yolen-action="transcribe-audio"]') === null)
})
