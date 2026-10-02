// Rodada 5 (Parte A): uma mensagem recusada nunca segura a conversa.
// - recusa 400 que aponta uma mensagem: ela sai do lote (quarentena curta)
//   e as outras seguem na hora;
// - BASE_VERSION_WITHOUT_CANONICAL_STATE: reenvio sem base_version UMA vez;
// - o resultado leva capture_recovery para o alerta de captura do painel.
// API falsa, mensagens sintéticas.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const composition = require('../src/companion-core-api-composition.js')
const resilience = require('../src/capture-resilience.js')
const nullBase = require('../src/capture-resilience-null-base.js')
const captureBatch = require('../src/capture-batch.js')
const sellerView = require('../src/companion-seller-information-view.js')

const CONVERSATION_KEY = 'manychat:unknown:fb000%3Achat%3A42'

function message(key, overrides = {}) {
  return {
    message_key: `${CONVERSATION_KEY}::manychat:${key}`,
    direction: 'incoming',
    author_kind: 'customer',
    occurred_at: '2026-10-01T12:00:00.000Z',
    observed_at: '2026-10-01T12:01:00.000Z',
    base_version: null,
    content_type: 'text',
    text_content: `Mensagem ${key}`,
    audio_transcription: null,
    is_deleted: false,
    ...overrides,
  }
}

function payload(messages) {
  return {
    contract_version: 'pt4-c-v4',
    cycle_id: '20000000-0000-4000-8000-000000000001',
    conversation_key: CONVERSATION_KEY,
    observed_at: '2026-10-01T12:01:00.000Z',
    messages,
  }
}

function success(sent) {
  return {
    ok: true,
    statusCode: 200,
    payload: {
      ok: true,
      status: 'CAPTURE_INGESTED',
      message_results: sent.messages.map((item) => ({
        message_key: item.message_key,
        synced: true,
        canonical_version: '1',
        reason: null,
      })),
    },
  }
}

function rejection(statusCode, validation) {
  return {
    ok: false,
    statusCode,
    payload: {
      ok: false,
      status: 'CAPTURE_INGESTION_REJECTED',
      error: 'recusado',
      validation,
    },
  }
}

function createComposition(responder, { now } = {}) {
  const calls = []

  const api = {
    async ingestCapturedMessages(sent) {
      calls.push(JSON.parse(JSON.stringify(sent)))
      return responder(sent, calls.length)
    },
  }

  return {
    calls,
    composition: composition.create({
      getApi: () => api,
      captureResilienceTools: resilience,
      nullBaseRebaseTools: nullBase,
      now,
    }),
  }
}

test('recusa que aponta UMA mensagem: ela sai do lote e as outras são gravadas na hora', async () => {
  const bad = message('bad', { observed_at: '2026-10-01T12:30:00.000Z' })
  const { calls, composition: api } = createComposition((sent, attempt) =>
    attempt === 1
      ? rejection(400, { code: 'OBSERVED_AT_IN_FUTURE', message_index: 1, message_key: bad.message_key })
      : success(sent),
  )

  const result = await api.ingestCapturedMessages(payload([message('a'), bad, message('c')]))

  assert.equal(result.ok, true)
  assert.equal(calls.length, 2)
  assert.deepEqual(
    calls[1].messages.map((item) => item.message_key),
    [message('a').message_key, message('c').message_key],
  )
  assert.deepEqual(result.capture_recovery.isolated, [
    { message_key: bad.message_key, code: 'OBSERVED_AT_IN_FUTURE' },
  ])
  assert.equal(result.capture_recovery.failure_code, null)
})

test('contrato aponta a mensagem só pelo índice: o índice do lote enviado identifica a mensagem', async () => {
  const { calls, composition: api } = createComposition((sent, attempt) =>
    attempt === 1
      ? rejection(400, { code: 'MALFORMED_TEXT', path: 'messages[0].message_key', message_index: 0 })
      : success(sent),
  )

  const result = await api.ingestCapturedMessages(payload([message('x'), message('y')]))

  assert.equal(result.ok, true)
  assert.deepEqual(calls[1].messages.map((item) => item.message_key), [message('y').message_key])
  assert.equal(result.capture_recovery.isolated[0].code, 'MALFORMED_TEXT')
})

test('mensagem isolada fica em quarentena: o próximo lote nem a envia (mesmo conteúdo, dentro do prazo)', async () => {
  let clock = Date.parse('2026-10-01T12:00:00.000Z')
  const bad = message('bad')
  const { calls, composition: api } = createComposition(
    (sent) =>
      sent.messages.some((item) => item.message_key === bad.message_key)
        ? rejection(400, { code: 'CAPTURE_RPC_VALIDATION', message_key: bad.message_key })
        : success(sent),
    { now: () => clock },
  )

  await api.ingestCapturedMessages(payload([message('a'), bad]))
  assert.equal(calls.length, 2)

  const second = await api.ingestCapturedMessages(payload([message('a'), bad, message('b')]))
  assert.equal(calls.length, 3)
  assert.deepEqual(
    calls[2].messages.map((item) => item.message_key),
    [message('a').message_key, message('b').message_key],
  )
  assert.deepEqual(second.capture_recovery.isolated, [
    { message_key: bad.message_key, code: 'CAPTURE_RPC_VALIDATION' },
  ])

  // Prazo vencido: volta a tentar (e é isolada de novo, sem travar).
  clock += 11 * 60 * 1000
  await api.ingestCapturedMessages(payload([message('a'), bad]))
  assert.equal(calls.length, 5)
})

test('lote só com mensagens recusadas: nada a enviar, sem loop', async () => {
  const bad = message('bad')
  const { calls, composition: api } = createComposition(() =>
    rejection(400, { code: 'OBSERVED_AT_IN_FUTURE', message_index: 0 }),
  )

  const result = await api.ingestCapturedMessages(payload([bad]))

  assert.equal(calls.length, 1)
  assert.equal(result.ok, true)
  assert.equal(result.payload.status, 'CAPTURE_NOTHING_TO_SEND')
  assert.deepEqual(result.payload.message_results, [])
})

test('base_version sem estado canônico: reenvia sem base_version UMA vez e esquece a versão lembrada', async () => {
  const known = message('known', { base_version: '2' })
  const stale = message('stale', { base_version: '4' })
  const { calls, composition: api } = createComposition((sent, attempt) =>
    attempt === 1
      ? rejection(400, {
          code: 'BASE_VERSION_WITHOUT_CANONICAL_STATE',
          message_keys: [stale.message_key],
        })
      : success(sent),
  )

  const result = await api.ingestCapturedMessages(payload([known, stale, message('new')]))

  assert.equal(result.ok, true)
  assert.equal(calls.length, 2)
  assert.deepEqual(
    calls[1].messages.map((item) => [item.message_key, item.base_version]),
    [
      [known.message_key, '2'],
      [stale.message_key, null],
      [message('new').message_key, null],
    ],
  )
  assert.deepEqual(result.capture_recovery.rebased_message_keys, [stale.message_key])
})

test('base_version recusada de novo depois do reenvio: para (sem loop) e devolve a falha', async () => {
  const stale = message('stale', { base_version: '4' })
  const { calls, composition: api } = createComposition(() =>
    rejection(400, { code: 'BASE_VERSION_WITHOUT_CANONICAL_STATE', message_keys: [stale.message_key] }),
  )

  const result = await api.ingestCapturedMessages(payload([stale]))

  assert.equal(calls.length, 2)
  assert.equal(calls[1].messages[0].base_version, null)
  assert.equal(result.ok, false)
  assert.equal(result.capture_recovery.failure_code, 'BASE_VERSION_WITHOUT_CANONICAL_STATE')
})

test('sem chaves apontadas, o reenvio tira base_version de todas que tinham', async () => {
  const { calls, composition: api } = createComposition((sent, attempt) =>
    attempt === 1
      ? rejection(400, { code: 'BASE_VERSION_WITHOUT_CANONICAL_STATE' })
      : success(sent),
  )

  await api.ingestCapturedMessages(
    payload([message('a', { base_version: '1' }), message('b', { base_version: '3' })]),
  )

  assert.deepEqual(calls[1].messages.map((item) => item.base_version), [null, null])
})

test('falha do servidor (500) não isola nada: devolve a falha com código para o alerta', async () => {
  const { calls, composition: api } = createComposition(() =>
    rejection(500, { code: 'CAPTURE_RPC_BODY_REJECTED' }),
  )

  const result = await api.ingestCapturedMessages(payload([message('a'), message('b')]))

  assert.equal(calls.length, 1)
  assert.equal(result.ok, false)
  assert.equal(result.statusCode, 500)
  assert.deepEqual(result.capture_recovery.isolated, [])
  assert.equal(result.capture_recovery.failure_code, 'CAPTURE_RPC_BODY_REJECTED')
})

test('texto com metade de emoji sai da extensão bem formado (U+FFFD), igual ao servidor', () => {
  const messages = captureBatch.buildCaptureMessages({
    activeMessages: [
      {
        id: 'manychat:key-1',
        timestampMs: Date.parse('2026-10-01T12:00:00.000Z'),
        direction: 'incoming',
        author_kind: 'customer',
        text: 'Fechado! \uD83D',
        hasAudio: false,
        observedAt: '2026-10-01T12:01:00.000Z',
      },
    ],
  })

  assert.equal(messages[0].text_content, 'Fechado! �')
  assert.equal(messages[0].text_content.isWellFormed(), true)
  assert.equal(captureBatch.toWellFormedText('ok 😀'), 'ok 😀')
  assert.equal(captureBatch.toWellFormedText('\uDE00x'), '�x')
})

// Rodada 8 (E5): nenhum código interno no texto do painel; o código da
// falha só muda a chave da view (para o slot redesenhar).
test('painel: conversa vazia por falha de captura mostra o aviso (sem o código no texto)', () => {
  const view = {
    view_key: 'k',
    state: 'failed',
    failure_code: 'EMPTY_CONVERSATION',
    notice: 'As mensagens desta conversa ainda não chegaram à Yolen.',
  }

  assert.equal(
    sellerView.applyCaptureFailureNotice(view, 'CAPTURE_RPC_BODY_REJECTED').notice,
    'As mensagens desta conversa ainda não chegaram à Yolen: a captura desta conversa está sendo recusada.',
  )

  // A chave da view muda junto (o slot já hidratado re-renderiza).
  assert.equal(
    sellerView.applyCaptureFailureNotice(view, 'CAPTURE_RPC_BODY_REJECTED').view_key,
    'k|capture:CAPTURE_RPC_BODY_REJECTED',
  )

  // Sem alerta de captura, o aviso do servidor fica.
  assert.equal(sellerView.applyCaptureFailureNotice(view, null), view)

  // Outra falha da leitura não vira aviso de captura.
  const other = { ...view, failure_code: 'RUN_EXPIRED', notice: 'x' }
  assert.equal(sellerView.applyCaptureFailureNotice(other, 'CAPTURE_RPC_BODY_REJECTED'), other)

  // O código nunca carrega texto arbitrário (nem na chave).
  assert.equal(
    sellerView.applyCaptureFailureNotice(view, 'HTTP_500<img>').view_key,
    'k|capture:HTTP_500_img_',
  )
})

test('o Core grava o alerta de captura e usa o helper do painel (contrato de fonte)', async () => {
  const { readFileSync } = await import('node:fs')
  const core = readFileSync(new URL('../src/companion-core.js', import.meta.url), 'utf8')

  assert.match(core, /applyCaptureRecovery\(\s*contextKey,\s*payload,\s*result,\s*\)/)
  assert.match(core, /forgetConfirmedCaptureVersions\(/)
  assert.match(core, /\.applyCaptureFailureNotice\(\s*view,\s*getCurrentCaptureAlert\(\)\?\.code,\s*\)/)
})

test('painel: o aviso da captura recusada aparece no slot já hidratado com a view sem alerta', async () => {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>')
  const root = dom.window.document.getElementById('root')

  const view = {
    view_key: 'agora-empty',
    state: 'failed',
    failure_code: 'EMPTY_CONVERSATION',
    notice: 'As mensagens desta conversa ainda não chegaram à Yolen.',
    kanban: { status: 'novo', label: 'Novo' },
    kanban_line: 'Etapa no kanban: Novo',
    main: null,
  }

  // Mesmo caminho do Core: o render monta o slot com a view atual e a
  // hidratação preenche.
  const render = (current) => {
    root.innerHTML = sellerView.renderFullReadingSlot('agora', current)
    sellerView.hydrateFullReadingSlots(root, { agora: current, analysis: null }, {})
  }

  render(view)
  assert.match(root.textContent, /ainda não chegaram à Yolen\./)

  render(sellerView.applyCaptureFailureNotice(view, 'CAPTURE_RPC_BODY_REJECTED'))
  assert.match(root.textContent, /ainda não chegaram à Yolen: a captura desta conversa está sendo recusada\./)
  assert.doesNotMatch(root.textContent, /CAPTURE_RPC_BODY_REJECTED/)
})
