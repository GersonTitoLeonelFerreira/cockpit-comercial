// FASE 10 — LIVE-02: no ManyChat real, "Transcrever áudio 1 de 1" virava
// "Transcrevendo áudio 1 de 1..." e nunca terminava — sem transcrição, sem
// erro e sem nova tentativa. Os logs de produção não têm nenhuma chamada a
// /api/companion/transcribe-audio no período: a espera parou antes da
// transcrição (obtenção física do áudio), e o Core não limita essa espera.
//
// Reproducer automatizado: a fonte do áudio nunca responde. O vendedor
// precisa sair do loading com erro visível e poder tentar de novo, e um
// resultado atrasado da tentativa abandonada nunca é aplicado. Mesmo Core
// nos dois canais (composições reais do manifest).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PARITY_PHONE,
  panelOf,
  panelText,
  sleep,
  startParityChannel,
  waitForBoth,
} from '../e3-test-support/cross-channel-parity.mjs'
import {
  defaultAgoraDecisionState,
  defaultClientContext,
  defaultLeadResolution,
} from '../e3-test-support/load-content-script.mjs'

const WATCHDOG_MS = 1500

function ownedResolution() {
  return defaultLeadResolution({
    status: 'OWNED_BY_ME',
    phone: PARITY_PHONE,
    lead: { id: 'lead-audio', name: 'Lead Áudio', phone: PARITY_PHONE, email: null, cpf_cnpj: null, deleted_at: null },
    cycle: { id: 'cycle-audio-stall', status: 'contato', owner_user_id: 'user-owner', owner_name: 'Vendedor Dono' },
    actions: { can_analyze_conversation: true, can_apply_suggestion: true, can_link_lead: false },
    flags: { is_owned_by_me: true, is_pool: false, is_closed: false },
    capabilities: { can_create_lead: false, can_analyze_conversation: true, can_apply_suggestion: true, can_open_pool: false, can_open_cycle: true },
  })
}

const transcribeAction = (runtime) => panelOf(runtime)?.querySelector('[data-yolen-action="transcribe-audio"]') ?? null
const transcribeCalls = (runtime) => runtime.calls.filter((call) => call.action === 'TRANSCRIBE_AUDIO')

function click(runtime, target) {
  target.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true, cancelable: true }))
}

for (const channel of ['manychat', 'whatsapp']) {
  test(`${channel}: fonte de áudio que nunca responde não deixa "Transcrevendo" preso — erro visível, nova tentativa, resultado tardio descartado`, async () => {
    let sourceCalls = 0
    const late = []
    const runtime = startParityChannel(
      channel,
      {
        resolution: ownedResolution(),
        messages: [{ mid: 'm1', text: 'Mandei um áudio com a dúvida.' }, { mid: 'a-1', audio: true }],
        backend: {
          decisionStateResult: defaultAgoraDecisionState(),
          clientContextResult: defaultClientContext(),
        },
        // 1ª tentativa: a obtenção física nunca responde (até ser liberada
        // tarde). 2ª tentativa: responde normalmente.
        audioSource: () => {
          sourceCalls += 1
          if (sourceCalls === 1) return new Promise((resolve) => late.push(() => resolve('ok')))
          return 'ok'
        },
      },
      {
        beforeLoad: ({ dom }) => {
          dom.window.__yolenCompanionAudioTranscriptionWatchdogMsForTests = WATCHDOG_MS
        },
      },
    )
    const runtimes = [runtime]

    await waitForBoth(runtimes, (item) => Boolean(transcribeAction(item)), { timeoutMs: 15000 })
    click(runtime, transcribeAction(runtime))
    await waitForBoth(runtimes, (item) => sourceCalls === 1 && /Transcrevendo áudio 1 de 1/.test(panelText(item)))

    // Depois do limite: loading encerrado, erro visível ao vendedor e ação
    // de nova tentativa habilitada.
    await sleep(WATCHDOG_MS + 800)
    const action = transcribeAction(runtime)
    assert.ok(action, 'ação de transcrever continua disponível')
    assert.equal(action.disabled, false, 'loading encerrado: nova tentativa habilitada')
    assert.match(panelText(runtime), /Transcrever áudio 1 de 1/)
    assert.doesNotMatch(panelText(runtime), /Transcrevendo áudio/)
    assert.match(
      panelOf(runtime).querySelector('[data-yolen-audio-transcription-status]')?.textContent ?? '',
      /Não foi possível concluir a transcrição do áudio agora\. Tente novamente\./,
      'erro seller-facing visível junto da ação',
    )
    assert.equal(transcribeCalls(runtime).length, 0)

    // Resultado tardio da tentativa abandonada nunca vira transcrição.
    for (const release of late) release()
    await sleep(800)
    assert.equal(transcribeCalls(runtime).length, 0, 'tentativa abandonada nunca transcreve')

    // Nova tentativa funciona e conclui.
    click(runtime, transcribeAction(runtime))
    await waitForBoth(runtimes, (item) => transcribeCalls(item).length === 1, { timeoutMs: 10000 })
    await waitForBoth(runtimes, (item) => transcribeAction(item) === null, { timeoutMs: 10000 })
    assert.equal(transcribeCalls(runtime)[0].payload.cycle_id, 'cycle-audio-stall')
  })
}
