import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(
  fileURLToPath(
    new URL('../src/lead-summary-expand-state.js', import.meta.url),
  ),
  'utf8',
)

function createHarness() {
  let clickListener = null
  let observerCallback = null
  let renderedDetails = []

  const hiddenInput = { value: 'Resumo completo da Larissa' }
  const readyRoot = {
    querySelector(selector) {
      return selector === '[data-yolen-textarea="lead-summary"]'
        ? hiddenInput
        : null
    },
  }

  function createDetails() {
    return {
      open: false,
      closest(selector) {
        return selector === '.yolen-lead-summary--ready'
          ? readyRoot
          : null
      },
      querySelector() {
        return null
      },
    }
  }

  const details = createDetails()
  renderedDetails = [details]

  const summary = {
    closest() {
      return details
    },
  }

  const target = {
    closest(selector) {
      return selector === '.yolen-lead-summary-toggle'
        ? summary
        : null
    },
  }

  class FakeMutationObserver {
    constructor(callback) {
      observerCallback = callback
    }
    observe() {}
  }

  const document = {
    documentElement: {},
    addEventListener(type, listener) {
      if (type === 'click') {
        clickListener = listener
      }
    },
    querySelectorAll() {
      return renderedDetails
    },
  }

  const sandbox = {
    document,
    MutationObserver: FakeMutationObserver,
    Promise,
    Map,
    Array,
    Object,
    String,
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, {
    filename: 'lead-summary-expand-state.js',
  })

  return {
    details,
    target,
    click() {
      let prevented = false
      clickListener({
        target,
        preventDefault() {
          prevented = true
        },
      })
      return prevented
    },
    rerender() {
      const replacement = createDetails()
      renderedDetails = [replacement]
      observerCallback([
        {
          target: {
            nodeType: 1,
            closest(selector) {
              return selector === '#yolen-companion-panel'
                ? this
                : null
            },
          },
          addedNodes: [],
        },
      ])
      return replacement
    },
  }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

test('clique abre e fecha o resumo sem depender do toggle nativo', async () => {
  const harness = createHarness()

  assert.equal(harness.click(), true)
  await flush()
  assert.equal(harness.details.open, true)

  assert.equal(harness.click(), true)
  await flush()
  assert.equal(harness.details.open, false)
})

test('rerender do Companion preserva o resumo aberto', async () => {
  const harness = createHarness()

  harness.click()
  await flush()
  assert.equal(harness.details.open, true)

  const replacement = harness.rerender()
  await flush()

  assert.equal(replacement.open, true)
})
