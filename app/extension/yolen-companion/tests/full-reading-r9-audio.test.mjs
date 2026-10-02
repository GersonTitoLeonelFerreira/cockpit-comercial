// Rodada 9 (HML), Fase 3: transcrição automática de áudio com a leitura
// completa. Alvos e textos sintéticos.
//
// - Ordem: primeiro os áudios do cliente, depois os do vendedor.
// - Limites: até 6 por conversa por hora; mais de 5 minutos fica para o
//   botão (o painel avisa); já transcrito não repete.
// - Espera: enquanto a transcrição roda (até 60 s), o pedido do painel leva
//   audio_hold e o servidor não inicia leitura; a faixa diz "Transcrevendo
//   áudio 1 de 2…".
// - Falha: "Não consegui transcrever 1 áudio." com "Tentar de novo"; a
//   leitura segue com "[áudio sem transcrição]".

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const analysis = require('../src/companion-analysis-controller.js')
const view = require('../src/companion-seller-information-view.js')

const readSrc = (name) =>
  readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8')

const target = (key, index, durationSeconds = 20) => ({ key, index, durationSeconds })

test('I1/I2: fila — cliente primeiro, depois vendedor, na ordem; mais de 5 min e já transcrito ficam fora; falha só volta com "Tentar de novo"', () => {
  const messages = [
    { id: 'a', direction: 'outgoing', authorKind: 'human_agent' },
    { id: 'b', direction: 'incoming', authorKind: 'customer' },
    { id: 'c', direction: 'outgoing', authorKind: 'human_agent' },
    { id: 'd', direction: 'incoming', authorKind: 'customer' },
    { id: 'e', direction: 'incoming', authorKind: 'customer' },
    { id: 'f', direction: 'incoming', authorKind: 'customer' },
  ]

  const plan =
    analysis.planAutoTranscriptionQueue({
      targets: [target('a', 0), target('b', 1), target('c', 2), target('d', 3, 301), target('e', 4), target('f', 5)],
      messages,
      isTranscribed: (item) => item.key === 'e',
      isFailed: (item) => item.key === 'f',
    })

  assert.deepEqual(plan.queue.map((item) => item.key), ['b', 'a', 'c'])
  assert.equal(plan.long, 1)
  assert.equal(plan.failed, 1)
  assert.equal(analysis.AUTO_TRANSCRIPTION_MAX_SECONDS, 300)

  // Exatamente 5 minutos ainda entra.
  assert.deepEqual(
    analysis.planAutoTranscriptionQueue({ targets: [target('x', 0, 300)], messages: [] }).queue.map((item) => item.key),
    ['x'],
  )
})

test('I2: até 6 transcrições automáticas por conversa por hora', () => {
  const now = Date.parse('2026-10-02T21:00:00.000Z')
  const minutes = (value) => now - value * 60_000

  assert.equal(analysis.AUTO_TRANSCRIPTION_HOURLY_LIMIT, 6)
  assert.equal(analysis.remainingAutoTranscriptions({ attempts: [], now }).remaining, 6)
  assert.equal(analysis.remainingAutoTranscriptions({ attempts: [1, 2, 3, 4, 5, 6].map(minutes), now }).remaining, 0)

  // As de mais de uma hora saem da conta.
  const mixed = analysis.remainingAutoTranscriptions({ attempts: [5, 10, 61, 70, 80, 90].map(minutes), now })

  assert.equal(mixed.remaining, 4)
  assert.equal(mixed.recent.length, 2)
})

test('I1/I3: o core transcreve sozinho pelo mesmo fluxo, um por vez, e segura a leitura até 60 s', () => {
  const core = readSrc('companion-core.js')
  const controller = readSrc('companion-analysis-controller.js')

  // Mesmo fluxo do botão (mesma rota do serviço de transcrição).
  assert.match(core, /async function transcribeNextVisibleAudio\(\{\s*target: requestedTarget = null,\s*\} = \{\}\)/)
  assert.match(core, /window\.YolenCompanionApi\.transcribeAudio\(/)

  // Só com a leitura completa no painel, depois de recuperar as
  // transcrições já salvas na Yolen (não repete).
  const canRun = core.slice(core.indexOf('function canRunAutoTranscription()'), core.indexOf('function canRunAutoTranscription()') + 600)

  assert.match(canRun, /isFullReadingPanelMode\(\)/)
  assert.match(canRun, /state\.audioTranscriptionHistoryCycleId === cycleId/)
  assert.match(canRun, /!state\.audioTranscriptionHistoryLoading/)

  // Um por vez.
  const check = core.slice(core.indexOf('function runAutoTranscriptionCheck()'), core.indexOf('function runAutoTranscriptionCheck()') + 2500)

  assert.match(check, /if \(state\.audioTranscriptionLoading\) \{\s*return\s*\}/)
  assert.match(check, /transcribeNextVisibleAudio\(\{ target \}\)/)

  // A espera vai no pedido do painel (até 60 s).
  assert.match(core, /const AUTO_TRANSCRIPTION_HOLD_MS = 60 \* 1000/)
  // Rodada 10 (B1): os 60 s contam do primeiro pedido segurado, já antes
  // de a fila começar.
  assert.match(core, /now - autoTranscriptionHoldStartedAt\.at > AUTO_TRANSCRIPTION_HOLD_MS/)
  // Depois da última transcrição, segura mais um pouco (a captura leva o
  // texto) e então pede a atualização: uma leitura só, já com o texto.
  assert.match(core, /const AUTO_TRANSCRIPTION_CAPTURE_GRACE_MS = 5000/)
  assert.match(core, /AUTO_TRANSCRIPTION_CAPTURE_GRACE_MS \+ 500\)/)
  assert.match(core, /get getFullReadingAudioHold\(\) \{\s*return getFullReadingAudioHold\s*\}/)
  assert.equal((controller.match(/\.\.\.readFullReadingAudioHold\(\),/g) || []).length, 2)
  assert.match(controller, /\? \{ audio_hold: hold \}/)
})

test('I3: faixa "Transcrevendo áudio 1 de 2…" sem o contador da leitura', () => {
  const agora = {
    state: 'running',
    notice: 'Transcrevendo áudio 1 de 2…',
    failure_code: null,
    kanban: { status: 'contato', label: 'Contato' },
    kanban_line: 'Etapa no kanban: Contato',
    main: null,
    next_step: null,
    conduct: null,
    stage_card: null,
    facts: [],
    before_send: [],
    message: null,
    kanban_late: false,
    hide_stage_sla: false,
    locks: [],
    footer: null,
    run_id: null,
    status: {
      running: 'first',
      running_since: null,
      failure: null,
      retry_at: null,
      refresh: { label: 'Atualizar', mode: 'always', disabled: true, hint: null, full: null },
      nothing_new_since: null,
      band: { kind: 'audio', text: 'Transcrevendo áudio 1 de 2…' },
      message_outdated: false,
      pending_until: null,
      review_at: null,
    },
    view_key: 'agora-audio',
  }

  const dom = new JSDOM(`<!doctype html><div id="root">${view.renderFullReadingSlot('agora', agora)}</div>`)
  const root = dom.window.document.getElementById('root')

  assert.equal(view.hydrateFullReadingSlots(root, { agora }), 1)

  const notice = root.querySelector('[data-yolen-full-reading-notice]')

  assert.equal(notice.getAttribute('data-yolen-fr-band'), 'audio')
  assert.equal(notice.querySelector('.yolen-fr-notice-text').textContent, 'Transcrevendo áudio 1 de 2…')
  assert.doesNotMatch(notice.textContent, /costuma levar/)
  assert.equal(root.querySelector('[data-yolen-action="full-reading-refresh"]').disabled, true)
})

test('I4/I2: falha mostra "Não consegui transcrever 1 áudio." com "Tentar de novo"; áudio longo avisa e o botão manual continua', () => {
  const core = readSrc('companion-core.js')
  const notice = core.slice(core.indexOf('function getAutoTranscriptionNoticeHtml()'), core.indexOf('function getAutoTranscriptionNoticeHtml()') + 2200)

  assert.match(notice, /'Não consegui transcrever 1 áudio\.'/)
  assert.match(notice, /data-yolen-action="auto-transcription-retry">Tentar de novo</)
  assert.match(notice, /mais de 5 minutos e não é transcrito sozinho: use "Transcrever áudio"/)

  // O retry limpa as falhas e tenta de novo; o botão manual continua.
  assert.match(core, /data-yolen-action="auto-transcription-retry"\]'\),\s*'click',\s*\(\) => \{\s*retryFailedAutoTranscriptions\(\)/)
  assert.match(core, /data-yolen-action="transcribe-audio"/)

  // O aviso aparece no AGORA e na ANÁLISE da leitura.
  assert.match(core, /'agora',\s*fullReadingAgora,\s*\) \+\s*getAutoTranscriptionNoticeHtml\(\) \+/)
  assert.match(core, /'analysis',\s*fullReadingAnalysis,\s*\)\}\s*\$\{getAutoTranscriptionNoticeHtml\(\)\}/)
})
