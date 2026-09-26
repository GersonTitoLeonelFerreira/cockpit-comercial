// FASE 10 — LIVE-02 (causa raiz confirmada no Firefox real, build
// 9e5a6fee): ao transcrever, o painel exibiu
// "'atob' called on an object that does not implement interface Window."
// O ManyChatAdapter desacoplava Window.atob do receiver
// ((windowRef?.atob ?? root.atob)(base64)); no Firefox isso lança. O jsdom
// aceita a chamada sem receiver, então aqui o atob da página é substituído
// por um que exige Window como receiver — a mesma semântica do Firefox — e o
// caminho real ManyChatAdapter.getAudioSource → Core → TRANSCRIBE_AUDIO é
// exercitado pela composição real do manifest.

import assert from 'node:assert/strict'
import test from 'node:test'

import { panelOf, panelText, startParityChannel, waitForBoth, PARITY_PHONE, PARITY_AUDIO_BYTES } from '../e3-test-support/cross-channel-parity.mjs'
import { defaultAgoraDecisionState, defaultClientContext, defaultLeadResolution } from '../e3-test-support/load-content-script.mjs'

const FIREFOX_ATOB_ERROR = "'atob' called on an object that does not implement interface Window."

const receiverViolations = []

function installFirefoxAtobSemantics(window) {
  const nativeAtob = window.atob
  window.atob = function atob(value) {
    if (this !== window) {
      receiverViolations.push(FIREFOX_ATOB_ERROR)
      throw new TypeError(FIREFOX_ATOB_ERROR)
    }
    return nativeAtob.call(window, value)
  }
}

test('ManyChat: Window.atob com receiver exigido (Firefox) — o áudio vira Blob, getAudioSource conclui e TRANSCRIBE_AUDIO é chamado', async () => {
  const runtime = startParityChannel(
    'manychat',
    {
      resolution: defaultLeadResolution({
        status: 'OWNED_BY_ME',
        phone: PARITY_PHONE,
        lead: { id: 'lead-atob', name: 'Lead Atob', phone: PARITY_PHONE, email: null, cpf_cnpj: null, deleted_at: null },
        cycle: { id: 'cycle-atob', status: 'contato', owner_user_id: 'user-owner', owner_name: 'Vendedor Dono' },
        actions: { can_analyze_conversation: true, can_apply_suggestion: true, can_link_lead: false },
        flags: { is_owned_by_me: true, is_pool: false, is_closed: false },
        capabilities: { can_create_lead: false, can_analyze_conversation: true, can_apply_suggestion: true, can_open_pool: false, can_open_cycle: true },
      }),
      messages: [{ mid: 'm1', text: 'Mandei um áudio com a dúvida.' }, { mid: 'a-1', audio: true }],
      backend: { decisionStateResult: defaultAgoraDecisionState(), clientContextResult: defaultClientContext() },
    },
    { beforeLoad: ({ dom }) => installFirefoxAtobSemantics(dom.window) },
  )
  const runtimes = [runtime]
  const transcribeAction = () => panelOf(runtime)?.querySelector('[data-yolen-action="transcribe-audio"]') ?? null
  const transcribeCalls = () => runtime.calls.filter((call) => call.action === 'TRANSCRIBE_AUDIO')

  await waitForBoth(runtimes, () => Boolean(transcribeAction()), { timeoutMs: 15000 })
  transcribeAction().dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true, cancelable: true }))

  await waitForBoth(
    runtimes,
    () => transcribeCalls().length === 1 || receiverViolations.length > 0 || Boolean(panelOf(runtime).querySelector('[data-yolen-audio-transcription-status]')),
    { timeoutMs: 10000 },
  )
  assert.deepEqual(receiverViolations, [], 'atob chamado sem Window como receiver (erro do Firefox)')
  assert.doesNotMatch(panelText(runtime), /interface Window|Erro ao transcrever/, 'nenhum erro de transcrição chega ao vendedor')
  assert.equal(transcribeCalls().length, 1, 'TRANSCRIBE_AUDIO alcançado')

  const payload = transcribeCalls()[0].payload
  assert.equal(payload.cycle_id, 'cycle-atob')
  assert.equal(payload.mime_type, 'audio/ogg')
  assert.equal(Buffer.from(payload.audio_base64, 'base64').toString(), PARITY_AUDIO_BYTES, 'mesmos bytes: base64 → Blob → base64')

  await waitForBoth(runtimes, () => transcribeAction() === null, { timeoutMs: 10000 })
})
