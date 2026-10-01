// Rodada 5 (Parte A, item 7): /api/companion/connect recebia ~500 chamadas
// em 15 min no preview — cada aba aberta da Yolen pedia a sessão a cada
// 15 s (o token vale 6 h). Agora: ao abrir, a cada 5 min com a aba
// visível, e ao sair da aba/janela (a troca de empresa continua chegando
// ao canal). Relógio e eventos falsos.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const SOURCE = readFileSync(
  new URL('../src/yolen-page-bridge.js', import.meta.url),
  'utf8',
)

const ORIGIN = 'https://preview.example'

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function createBridge() {
  const fetches = []
  const intervals = []
  const windowListeners = {}
  const documentListeners = {}
  const clock = { now: Date.parse('2026-10-01T12:00:00.000Z') }

  const document = {
    currentScript: { dataset: { yolenAllowedOrigins: ORIGIN } },
    visibilityState: 'visible',
    addEventListener(name, listener) {
      documentListeners[name] = listener
    },
  }

  const sandbox = {
    console,
    Date: { now: () => clock.now },
    document,
    window: {
      location: { origin: ORIGIN, pathname: '/dashboard' },
      postMessage: () => {},
      setInterval(callback, delay) {
        intervals.push({ callback, delay })
        return intervals.length
      },
      addEventListener(name, listener) {
        windowListeners[name] = listener
      },
    },
    fetch: async (url) => {
      fetches.push(url)
      return { ok: true, status: 200, json: async () => ({ ok: true, companion_token: 't' }) }
    },
  }

  vm.createContext(sandbox)
  vm.runInContext(SOURCE, sandbox, { filename: 'yolen-page-bridge.js' })

  return {
    fetches,
    intervals,
    clock,
    document,
    fire: (name) => (windowListeners[name] || documentListeners[name])?.(),
  }
}

test('abre a página: uma chamada; o intervalo é de 5 minutos (não 15 s)', async () => {
  const bridge = createBridge()
  await settle()

  assert.equal(bridge.fetches.length, 1)
  assert.equal(bridge.intervals.length, 1)
  assert.equal(bridge.intervals[0].delay, 5 * 60 * 1000)
})

test('15 minutos com a aba visível: 1 chamada ao abrir + 3 do intervalo', async () => {
  const bridge = createBridge()
  await settle()

  for (let tick = 0; tick < 3; tick += 1) {
    bridge.clock.now += 5 * 60 * 1000
    bridge.intervals[0].callback()
    await settle()
  }

  assert.equal(bridge.fetches.length, 4)
})

test('aba escondida: o intervalo não chama', async () => {
  const bridge = createBridge()
  await settle()

  bridge.document.visibilityState = 'hidden'
  bridge.clock.now += 5 * 60 * 1000
  bridge.intervals[0].callback()
  await settle()

  assert.equal(bridge.fetches.length, 1)
})

test('sair da aba ou da janela renova na hora (troca de empresa chega ao canal), voltar respeita o intervalo mínimo', async () => {
  const bridge = createBridge()
  await settle()

  // Voltar logo depois de abrir não chama de novo.
  bridge.fire('focus')
  await settle()
  assert.equal(bridge.fetches.length, 1)

  // Saiu da janela (ex.: foi para o WhatsApp): renova mesmo dentro dos 30 s.
  bridge.clock.now += 5 * 1000
  bridge.fire('blur')
  await settle()
  assert.equal(bridge.fetches.length, 2)

  bridge.document.visibilityState = 'hidden'
  bridge.clock.now += 1000
  bridge.fire('visibilitychange')
  await settle()
  assert.equal(bridge.fetches.length, 3)

  // Voltou para a aba em menos de 30 s: nada.
  bridge.document.visibilityState = 'visible'
  bridge.clock.now += 1000
  bridge.fire('visibilitychange')
  await settle()
  assert.equal(bridge.fetches.length, 3)

  // Depois de 30 s, voltar renova.
  bridge.clock.now += 31 * 1000
  bridge.fire('focus')
  await settle()
  assert.equal(bridge.fetches.length, 4)
})
