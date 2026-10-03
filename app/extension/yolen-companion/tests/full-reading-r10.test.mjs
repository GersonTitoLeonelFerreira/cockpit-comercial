// Rodada 10 (HML), lado da extensão. Textos e chaves sintéticos.
//
// - A1: depois do "Aplicar no kanban" dar certo, o selo, o Kanban da Análise
//   e o Relacionamento mostram a etapa nova na hora; o cartão vira "Etapa
//   aplicada: <etapa>" por uns 3 s e some, sem esperar leitura.
// - B: a espera do áudio vale desde o primeiro pedido do painel (antes de a
//   fila começar), até 60 s; sequência da evidência: uma leitura só, depois
//   das transcrições.
// - E: ciclo encerrado só no HML — captura com a capability do servidor;
//   recusa da RPC (defesa: banco sem a migração) sem aviso e sem repetir; abas
//   abrem só com a captura aceita e o cliente escrevendo depois do
//   encerramento.
// - G: "Atualizar" e "Ler a conversa inteira" sem quebrar palavra.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { JSDOM } from 'jsdom'

import {
  planFullReadingPanel,
} from '../../../lib/server/full-reading-panel.ts'

const require = createRequire(import.meta.url)
const analysis = require('../src/companion-analysis-controller.js')
const view = require('../src/companion-seller-information-view.js')
const captureBatch = require('../src/capture-batch.js')
const resolutionController = require('../src/companion-lead-resolution-controller.js')
const privacy = require('../src/companion-background-privacy.js')

const readSrc = (name) =>
  readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8')

const sliceFrom = (source, marker, length = 3000) =>
  source.slice(source.indexOf(marker), source.indexOf(marker) + length)

function agoraView(overrides = {}) {
  return {
    state: 'ready',
    notice: null,
    failure_code: null,
    kanban: { status: 'negociacao', label: 'Negociação' },
    kanban_line: 'Etapa no kanban: Negociação',
    main: null,
    next_step: { turn: 'vendedor', turn_label: 'Sua vez', title: 'Responder o valor', complement: '', why: 'O cliente perguntou.' },
    conduct: null,
    stage_card: null,
    facts: [],
    before_send: [],
    message: null,
    kanban_late: false,
    hide_stage_sla: false,
    locks: [],
    footer: 'Leitura completa · 02/10, 19:32',
    run_id: 'run-sintetico',
    status: {
      running: null,
      running_since: null,
      failure: null,
      retry_at: null,
      refresh: { label: 'Atualizar', mode: 'if_changed', disabled: false, hint: null, full: { label: 'Ler a conversa inteira' } },
      nothing_new_since: null,
      band: null,
      message_outdated: false,
      pending_until: null,
      review_at: null,
    },
    view_key: 'agora-r10',
    ...overrides,
  }
}

function render(agora) {
  const dom = new JSDOM(`<!doctype html><div id="root">${view.renderFullReadingSlot('agora', agora)}</div>`)
  const root = dom.window.document.getElementById('root')

  view.hydrateFullReadingSlots(root, { agora })

  return root
}

// ---------------------------------------------------------------------------
// A1. Etapa aplicada na hora
// ---------------------------------------------------------------------------

test('A1: o cartão vira "Etapa aplicada: Negociação", sem botão', () => {
  const root = render(agoraView({
    stage_card: { kind: 'applied', current_label: 'Negociação', suggested_label: 'Negociação', suggested_status: 'negociacao' },
  }))

  const applied = root.querySelector('[data-yolen-full-reading-stage-applied]')

  assert.ok(applied)
  assert.equal(applied.textContent, 'Etapa aplicada: Negociação')
  assert.equal(applied.getAttribute('role'), 'status')
  assert.equal(root.querySelector('[data-yolen-action="full-reading-stage"]'), null)
  assert.doesNotMatch(root.textContent, /Novo/)
})

test('A1: depois do "Aplicar" dar certo, a tela muda sem esperar leitura — selo, Kanban da Análise e Relacionamento na hora; cartão por ~3 s', () => {
  const core = readSrc('companion-core.js')

  assert.match(core, /const FULL_READING_APPLIED_CARD_MS = 3000/)

  // O sucesso do "Aplicar" guarda a etapa e redesenha antes de qualquer
  // resposta do servidor; a releitura de resolução e o pedido do painel
  // vêm depois.
  const success = sliceFrom(core, '// Rodada 10 (A1): a tela mostra a etapa nova na hora', 900)

  assert.match(success, /rememberAppliedStage\(card, request\.cycle_id\)\s*renderPanel\(\)/)
  assert.match(success, /resolveCurrentLead\(\)/)
  assert.match(success, /requestFullReadingRefresh\(\)/)

  // Selo do topo (resolução) e Relacionamento (contexto do cliente).
  const remember = sliceFrom(core, 'function rememberAppliedStage(card, cycleId) {', 2200)

  assert.match(remember, /cycle: \{ \.\.\.resolution\.cycle, status: card\.suggested_status \}/)
  assert.match(remember, /current_status: card\.suggested_status/)
  assert.match(remember, /FULL_READING_APPLIED_CARD_MS \+ 50/)

  // AGORA: kanban e cartão; ANÁLISE: o bloco Kanban do resumo.
  const applied = sliceFrom(core, 'function withAppliedStage(view, kind) {', 1800)

  assert.match(applied, /kanban: \{ status: applied\.status, label: applied\.label \}/)
  assert.match(applied, /kind: 'applied'/)
  assert.match(applied, /card && card\.suggested_status === applied\.status\s*\?\s*null/)
  assert.match(applied, /block\?\.key === 'kanban'/)
  // Rodada 11: o estado local do "Incluir na leitura" vai por cima.
  assert.match(core, /\? withAttachmentState\(\s*withAppliedStage\(\s*withCaptureFailureNotice\(\s*readFullReadingView\(\s*state\.agoraDecisionState\.data,\s*\),\s*\),\s*'agora',\s*\),\s*'agora',\s*\)/)
  assert.match(core, /\? withAttachmentState\(\s*withAppliedStage\(\s*withCaptureFailureNotice\(\s*readFullReadingView\(\s*state\.analysisViewModel\.data,\s*\),\s*\),\s*'analysis',\s*\),\s*'analysis',\s*\)/)
})

// ---------------------------------------------------------------------------
// B. Áudio antes da primeira leitura
// ---------------------------------------------------------------------------

test('B1: a espera vale já no primeiro pedido, antes de a fila começar ("Transcrevendo áudio 1 de 2…")', () => {
  // Conversa aberta: 2 áudios sem transcrição na fila automática, nenhuma
  // transcrição rodando ainda.
  assert.deepEqual(
    analysis.computeAutoTranscriptionHold({ batch: null, pendingCount: 2, remaining: 6, now: 0 }),
    { current: 1, total: 2 },
  )

  // Limite por hora: só o que ainda cabe.
  assert.deepEqual(
    analysis.computeAutoTranscriptionHold({ batch: null, pendingCount: 3, remaining: 1, now: 0 }),
    { current: 1, total: 1 },
  )

  // Nada a transcrever (ou sem cota): sem espera.
  assert.equal(analysis.computeAutoTranscriptionHold({ batch: null, pendingCount: 0, remaining: 6, now: 0 }), null)
  assert.equal(analysis.computeAutoTranscriptionHold({ batch: null, pendingCount: 2, remaining: 0, now: 0 }), null)

  // O core mede a fila antes do lote existir e corta em 60 s desde o
  // primeiro pedido segurado.
  const core = readSrc('companion-core.js')
  const hold = sliceFrom(core, 'function getFullReadingAudioHold() {', 1800)

  assert.match(hold, /if \(!batch && conversationKey && canRunAutoTranscription\(\)\) \{\s*pendingCount = getAutoTranscriptionCandidates\(\)\.queue\.length/)
  assert.match(hold, /now - autoTranscriptionHoldStartedAt\.at > AUTO_TRANSCRIPTION_HOLD_MS/)
})

test('B2: sequência da evidência — conversa aberta com 2 áudios sem transcrição: uma leitura só, depois das transcrições', () => {
  const NOW = Date.parse('2026-10-02T22:31:23.000Z')
  const at = (seconds) => NOW + seconds * 1000
  const iso = (ms) => new Date(ms).toISOString()

  // Ledger: a conversa (26 mensagens) já capturada; nenhuma leitura ainda.
  const planAt = (ms, audioHold) =>
    planFullReadingPanel({
      runs: [],
      cycleId: '9d000000-0000-4000-8000-0000000000c1',
      kanban: { status: 'novo', stage_entered_at: iso(at(-3600)), next_action: null, next_action_date: null, closed_at: null },
      latestObservedAt: iso(at(-5)),
      latestCustomerObservedAt: iso(at(-5)),
      force: false,
      now: iso(ms),
      audioHold,
    })

  const timeline = [
    // 0 s: painel abre; a fila ainda não começou.
    { t: 0, hold: analysis.computeAutoTranscriptionHold({ batch: null, pendingCount: 2, remaining: 6, now: at(0) }) },
    // 1 s: transcrevendo o 1º.
    { t: 1, hold: analysis.computeAutoTranscriptionHold({ batch: { total: 2, done: 0, succeeded: 0, finishedAt: null }, now: at(1) }) },
    // 5 s: o 1º pronto, transcrevendo o 2º.
    { t: 5, hold: analysis.computeAutoTranscriptionHold({ batch: { total: 2, done: 1, succeeded: 1, finishedAt: null }, now: at(5) }) },
    // 8 s: os dois prontos; a captura leva o texto (folga de 5 s).
    { t: 8, hold: analysis.computeAutoTranscriptionHold({ batch: { total: 2, done: 2, succeeded: 2, finishedAt: at(7) }, now: at(8) }) },
    // 13 s: folga acabou.
    { t: 13, hold: analysis.computeAutoTranscriptionHold({ batch: { total: 2, done: 2, succeeded: 2, finishedAt: at(7) }, now: at(13) }) },
  ]

  assert.deepEqual(timeline.map((step) => step.hold), [
    { current: 1, total: 2 },
    { current: 1, total: 2 },
    { current: 2, total: 2 },
    { current: 2, total: 2 },
    null,
  ])

  const actions =
    timeline.map((step) => planAt(at(step.t), step.hold).action)

  // Nenhuma leitura enquanto transcreve; uma só depois.
  assert.deepEqual(actions, ['hold', 'hold', 'hold', 'hold', 'start'])
  assert.equal(actions.filter((action) => action === 'start').length, 1)
})

// ---------------------------------------------------------------------------
// E. Ciclo encerrado (HML)
// ---------------------------------------------------------------------------

const closedResolution = (capabilities = {}) => ({
  ok: true,
  status: 'CLOSED_CYCLE',
  cycle: { id: '9e000000-0000-4000-8000-0000000000c1', status: 'ganho' },
  capabilities: { can_analyze_conversation: false, ...capabilities },
  actions: { can_analyze_conversation: false },
  flags: { is_closed: true },
})

test('E3: a extensão captura ciclo encerrado só com a capability do HML; sem ela, como hoje', () => {
  assert.equal(captureBatch.isCaptureResolutionEligible(closedResolution()), false)
  assert.equal(captureBatch.isCaptureResolutionEligible(closedResolution({ full_reading_panel: true })), false)
  assert.equal(captureBatch.isCaptureResolutionEligible(closedResolution({ can_read_closed_cycle: true })), true)

  // Ciclo aberto continua igual.
  assert.equal(captureBatch.isCaptureResolutionEligible({
    status: 'OWNED_BY_ME',
    cycle: { id: '9e000000-0000-4000-8000-0000000000c2', status: 'contato' },
    actions: { can_analyze_conversation: true },
    flags: { is_closed: false },
  }), true)

  // A capability passa pelo filtro de privacidade do background e chega ao
  // modelo da resolução; sem a flag, a chave não existe.
  const sanitized = privacy.sanitizeResolutionPayload(closedResolution({ can_read_closed_cycle: true }))

  assert.equal(sanitized.capabilities.can_read_closed_cycle, true)

  const viewModel = resolutionController.createDomainResolutionViewModel(sanitized)

  assert.equal(viewModel.capabilities.can_read_closed_cycle, true)
  assert.equal('can_read_closed_cycle' in resolutionController.createDomainResolutionViewModel(privacy.sanitizeResolutionPayload(closedResolution())).capabilities, false)

  // O workspace canônico continua fechado para o ciclo encerrado.
  assert.equal(resolutionController.deriveCanonicalResolutionOutcome(viewModel).workspace_ready, false)
})

test('E4: recusa da RPC (defesa: banco sem a migração) não vira aviso de falha nem repete; abas só com a captura aceita e o cliente depois do encerramento', () => {
  const core = readSrc('companion-core.js')

  // Recusa silenciosa: sem alerta, ciclo descansa 10 min.
  assert.match(core, /const CLOSED_CYCLE_CAPTURE_UNAVAILABLE =\s*'CLOSED_CYCLE_CAPTURE_UNAVAILABLE'/)
  assert.match(core, /const CLOSED_CYCLE_CAPTURE_PARK_MS =\s*10 \* 60 \* 1000/)

  const recovery = sliceFrom(core, 'function applyCaptureRecovery(', 1600)

  assert.match(recovery, /recovery\.failure_code ===\s*CLOSED_CYCLE_CAPTURE_UNAVAILABLE\s*\) \{\s*parkClosedCycleCapture\(\s*payload\?\.cycle_id,\s*\)\s*return null/)

  const canIngest = sliceFrom(core, 'function canIngestCurrentCapture() {', 900)

  assert.match(canIngest, /!isClosedCycleCaptureParked\(\s*state\.leadResolutionViewModel\?\.cycle\?\.id,\s*\)/)
  assert.match(core, /isClosedCycleCaptureParked\(\s*plan\.batches\?\.\[0\]\?\.cycle_id,\s*\)/)

  // Abas: capability + captura aceita com service = true.
  const workspace = sliceFrom(core, 'function withClosedServiceWorkspace(', 900)

  assert.match(workspace, /resolution\?\.status !== 'CLOSED_CYCLE'/)
  assert.match(workspace, /resolution\?\.capabilities\?\.can_read_closed_cycle !== true/)
  assert.match(workspace, /!closedServiceCycleIds\.has\(resolution\?\.cycle\?\.id\)/)

  const remember = sliceFrom(core, 'function rememberClosedCycleCapture(', 1400)

  assert.match(remember, /closed\.service !== true/)
  assert.match(remember, /loadAgoraDecisionStateForCurrentCycle\(\)/)
  assert.match(core, /rememberClosedCycleCapture\(\s*payload,\s*result\.payload,\s*\)/)
  assert.match(core, /applyClosedServiceWorkspace\(\)\s*renderPanel\(\)\s*loadSavedAudioTranscriptionsForCurrentCycle\(\)/)
})

// ---------------------------------------------------------------------------
// G. Rodapé do painel
// ---------------------------------------------------------------------------

test('G1: "Atualizar" e "Ler a conversa inteira" sem quebrar palavra; sem espaço, o segundo desce inteiro', () => {
  const css = readSrc('styles.css')

  assert.match(css, /#yolen-companion-panel \.yolen-fr-footer \{\s*flex-wrap: wrap;/)
  assert.match(css, /#yolen-companion-panel \.yolen-fr-footer > \.yolen-fr-button \{\s*flex: 0 0 auto;\s*white-space: nowrap;\s*word-break: normal;\s*overflow-wrap: normal;\s*\}/)
  assert.match(css, /#yolen-companion-panel \.yolen-fr-footer > \.yolen-full-reading-footer \{\s*flex: 1 1 auto;\s*min-width: 0;\s*\}/)

  // Os dois botões são filhos diretos do rodapé.
  const root = render(agoraView())
  const footer = root.querySelector('[data-yolen-fr-footer]')
  const buttons = [...footer.children].filter((child) => child.classList.contains('yolen-fr-button'))

  assert.deepEqual(buttons.map((button) => button.textContent.trim()), ['Atualizar', 'Ler a conversa inteira'])
})
