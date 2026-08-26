import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const SRC_DIR = fileURLToPath(
  new URL('../../src/', import.meta.url),
)

const A = '+55 44 92000-6235'
const B = '+55 44 9961-0874'
const C = '+55 11 98888-7777'

function digits(value) {
  return String(value).replace(/\D/g, '')
}

function readSource(fileName) {
  return readFileSync(
    `${SRC_DIR}${fileName}`,
    'utf8',
  )
}

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms),
  )
}

async function waitFor(
  predicate,
  { timeoutMs = 3000, intervalMs = 20 } = {},
) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const value = predicate()

    if (value) {
      return value
    }

    await sleep(intervalMs)
  }

  throw new Error(
    `waitFor: condição não satisfeita em ${timeoutMs}ms`,
  )
}

function deferred() {
  let resolve
  let reject

  const promise = new Promise((next, fail) => {
    resolve = next
    reject = fail
  })

  return {
    promise,
    resolve,
    reject,
  }
}

function buildHtml(title = A) {
  return `<!doctype html>
    <html>
      <body>
        <div id="app">
          <div id="main">
            <header>
              <span title="${title}">${title}</span>
            </header>
            <div id="conversation-body"></div>
          </div>
        </div>
        <aside id="yolen-companion-panel">
          <section data-yolen-region="header">
            <button type="button" data-yolen-action="refresh">Atualizar</button>
          </section>
          <section data-yolen-region="registration-card"></section>
          <section data-yolen-region="lead-summary-card"></section>
        </aside>
      </body>
    </html>`
}

function createScenario({
  initialTitle = A,
  states = {},
  createLead,
} = {}) {
  const dom = new JSDOM(
    buildHtml(initialTitle),
    {
      url: 'https://web.whatsapp.com/',
      pretendToBeVisual: true,
      runScripts: 'outside-only',
    },
  )

  const { window } = dom
  const { document } = window
  const calls = []
  const phoneByTitle = new Map([
    [A, digits(A)],
    [B, digits(B)],
    [C, digits(C)],
  ])

  let currentPhone =
    phoneByTitle.get(initialTitle) ||
    digits(initialTitle)

  function currentTitle() {
    return document
      .querySelector('#main > header [title]')
      ?.getAttribute('title') || ''
  }

  window.YolenCompanionLeadEnrichmentContext = {
    getCandidates: () => [],
  }

  window.YolenCompanionApi = {
    getLastLeadLookupContext: () => ({
      phone: currentPhone,
      display_name: currentTitle(),
    }),
    resolveLead: async () => ({
      ok: true,
      payload: { ok: true },
    }),
    createLead: async (payload) => {
      calls.push({
        action: 'CREATE_LEAD',
        payload,
      })

      if (typeof createLead === 'function') {
        return createLead(payload)
      }

      return {
        ok: true,
        payload: {
          ok: true,
          lead: {
            id: `lead-${payload.phone}`,
            name: payload.name,
            phone: payload.phone,
          },
        },
      }
    },
  }

  window.eval(
    readSource(
      'conversation-isolation-runtime.js',
    ),
  )
  window.eval(
    readSource(
      'panel-stability-runtime.js',
    ),
  )
  window.eval(
    readSource('lead-automation.js'),
  )

  const panel = document.getElementById(
    'yolen-companion-panel',
  )
  const registrationRegion = panel.querySelector(
    '[data-yolen-region="registration-card"]',
  )
  const summaryRegion = panel.querySelector(
    '[data-yolen-region="lead-summary-card"]',
  )
  const refreshButton = panel.querySelector(
    '[data-yolen-action="refresh"]',
  )

  function renderCurrentConversation() {
    const title = currentTitle()
    currentPhone =
      phoneByTitle.get(title) ||
      digits(title)

    const state =
      states[title] || 'not-found'

    if (state === 'linked') {
      registrationRegion.replaceChildren()
      summaryRegion.innerHTML = [
        '<div data-linked-view>',
        `<strong>${title === B ? 'Cliente B' : title === C ? 'Cliente C' : 'Cliente A'}</strong>`,
        `<span>${currentPhone}</span>`,
        '</div>',
      ].join('')
      return
    }

    summaryRegion.replaceChildren()
    registrationRegion.innerHTML =
      window.YolenCompanionLeadAutomation
        .buildCreateLeadFormHtml()
    window.YolenCompanionLeadAutomation
      .bindCreateLeadForm(panel)
  }

  refreshButton.addEventListener(
    'click',
    renderCurrentConversation,
  )

  renderCurrentConversation()

  function switchConversation(title) {
    const titleNode = document.querySelector(
      '#main > header [title]',
    )

    titleNode.setAttribute('title', title)
    titleNode.textContent = title
  }

  function openContactSidebar() {
    const sidebar = document.createElement('aside')
    sidebar.setAttribute(
      'data-test-contact-sidebar',
      'true',
    )
    sidebar.innerHTML = [
      '<header>Dados do contato</header>',
      '<div>Foto e mídia do contato</div>',
      `<div>${currentTitle()}</div>`,
    ].join('')
    document
      .getElementById('app')
      .appendChild(sidebar)
    return sidebar
  }

  function form() {
    return document.querySelector(
      '[data-yolen-lead-create-form]',
    )
  }

  function setField(name, value) {
    const input = form()?.querySelector(
      `[name="${name}"]`,
    )
    assert.ok(input, `campo ${name} ausente`)
    input.value = value
    input.dispatchEvent(
      new window.Event('input', {
        bubbles: true,
        cancelable: true,
      }),
    )
    return input
  }

  return {
    dom,
    window,
    document,
    panel,
    calls,
    form,
    setField,
    switchConversation,
    openContactSidebar,
    renderCurrentConversation,
    runtime:
      window.YolenCompanionConversationRuntime,
  }
}

test('P0: A→B invalida imediatamente formulário, número e dados seller-facing de A', async () => {
  const scenario = createScenario({
    states: {
      [A]: 'not-found',
      [B]: 'linked',
    },
  })

  const formA = scenario.form()
  assert.ok(formA)

  scenario.setField('yolen-lead-name', 'Dori')
  scenario.setField(
    'yolen-lead-document',
    '12345678901',
  )

  const createButtonA = formA.querySelector(
    'button[type="submit"]',
  )
  formA
    .querySelector('[name="yolen-lead-name"]')
    .focus()

  scenario.switchConversation(B)

  await waitFor(() =>
    scenario.document
      .querySelector('[data-linked-view]')
      ?.textContent.includes('Cliente B'),
  )

  const text = scenario.panel.textContent

  assert.equal(formA.isConnected, false)
  assert.equal(createButtonA.isConnected, false)
  assert.equal(text.includes('Dori'), false)
  assert.equal(text.includes('12345678901'), false)
  assert.equal(text.includes(digits(A)), false)
  assert.equal(text.includes('Cliente B'), true)
})

test('async stale A após B não escreve feedback nem refresh na superfície de B', async () => {
  const pendingA = deferred()
  let refreshCount = 0

  const scenario = createScenario({
    states: {
      [A]: 'not-found',
      [B]: 'linked',
    },
    createLead: (payload) => {
      if (payload.phone === digits(A)) {
        return pendingA.promise
      }

      return {
        ok: true,
        payload: { ok: true },
      }
    },
  })

  scenario.panel
    .querySelector('[data-yolen-action="refresh"]')
    .addEventListener('click', () => {
      refreshCount += 1
    })

  scenario.setField('yolen-lead-name', 'Dori')
  scenario.form()
    .querySelector('button[type="submit"]')
    .click()

  await waitFor(() => scenario.calls.length === 1)

  scenario.switchConversation(B)
  await waitFor(() =>
    scenario.panel.textContent.includes('Cliente B'),
  )
  const refreshAfterSwitch = refreshCount

  pendingA.resolve({
    ok: true,
    payload: {
      ok: true,
      lead: {
        id: 'lead-a',
        name: 'Dori',
        phone: digits(A),
      },
    },
  })

  await sleep(120)

  assert.equal(
    scenario.panel.textContent.includes('Cliente B'),
    true,
  )
  assert.equal(
    scenario.panel.textContent.includes('Dori'),
    false,
  )
  assert.equal(refreshCount, refreshAfterSwitch)
})

test('Dados do contato não muda identidade, não reseta draft e não reseta scroll', async () => {
  const scenario = createScenario({
    states: {
      [A]: 'not-found',
    },
  })

  scenario.setField('yolen-lead-name', 'Dori')
  scenario.panel.scrollTop = 123

  const formBefore = scenario.form()
  const epochBefore =
    scenario.runtime.getConversationEpoch()
  const keyBefore =
    scenario.runtime.getCurrentConversationKey()

  scenario.openContactSidebar()
  await sleep(80)

  assert.equal(
    scenario.runtime.getConversationEpoch(),
    epochBefore,
  )
  assert.equal(
    scenario.runtime.getCurrentConversationKey(),
    keyBefore,
  )
  assert.equal(scenario.form(), formBefore)
  assert.equal(
    scenario.form()
      .querySelector('[name="yolen-lead-name"]')
      .value,
    'Dori',
  )
  assert.equal(scenario.panel.scrollTop, 123)
})

test('Dados do contato aberto: pointerdown + atividade DOM + click gera uma única submissão', async () => {
  const scenario = createScenario({
    states: {
      [A]: 'not-found',
    },
  })

  scenario.setField('yolen-lead-name', 'Dori')
  const button = scenario.form().querySelector(
    'button[type="submit"]',
  )

  button.dispatchEvent(
    new scenario.window.Event('pointerdown', {
      bubbles: true,
      cancelable: true,
    }),
  )

  scenario.openContactSidebar()
  await sleep(40)

  assert.equal(button.isConnected, true)
  button.click()

  await waitFor(() => scenario.calls.length === 1)
  await sleep(80)

  assert.equal(scenario.calls.length, 1)
})

test('create success remove o form authoritative e refresh monta estado vinculado', async () => {
  const states = {
    [A]: 'not-found',
  }

  const scenario = createScenario({
    states,
    createLead: async (payload) => {
      states[A] = 'linked'
      return {
        ok: true,
        payload: {
          ok: true,
          lead: {
            id: 'lead-created',
            name: payload.name,
            phone: payload.phone,
          },
        },
      }
    },
  })

  scenario.setField(
    'yolen-lead-name',
    'Dori Vinculada',
  )
  const oldForm = scenario.form()

  oldForm
    .querySelector('button[type="submit"]')
    .click()

  await waitFor(() => scenario.calls.length === 1)
  await waitFor(() =>
    scenario.document.querySelector(
      '[data-linked-view]',
    ),
  )

  assert.equal(oldForm.isConnected, false)
  assert.equal(scenario.form(), null)
  assert.equal(
    scenario.panel.textContent.includes('Cliente A'),
    true,
  )
})

test('A→B→A restaura somente o draft pertencente a A', async () => {
  const scenario = createScenario({
    states: {
      [A]: 'not-found',
      [B]: 'not-found',
    },
  })

  scenario.setField('yolen-lead-name', 'Dori')
  scenario.setField(
    'yolen-lead-document',
    '12345678901',
  )

  scenario.switchConversation(B)
  await waitFor(() =>
    scenario.form()
      ?.querySelector('[name="yolen-lead-phone"]')
      ?.value === digits(B),
  )
  scenario.setField(
    'yolen-lead-name',
    'Beatriz',
  )

  scenario.switchConversation(A)
  await waitFor(() =>
    scenario.form()
      ?.querySelector('[name="yolen-lead-phone"]')
      ?.value === digits(A),
  )

  assert.equal(
    scenario.form()
      .querySelector('[name="yolen-lead-name"]')
      .value,
    'Dori',
  )
  assert.equal(
    scenario.form()
      .querySelector('[name="yolen-lead-document"]')
      .value,
    '12345678901',
  )
  assert.equal(
    scenario.form().textContent.includes('Beatriz'),
    false,
  )
})

test('A→B→C com creates A/B pendentes: somente C permanece authoritative', async () => {
  const pendingA = deferred()
  const pendingB = deferred()
  const states = {
    [A]: 'not-found',
    [B]: 'not-found',
    [C]: 'linked',
  }

  const scenario = createScenario({
    states,
    createLead: (payload) => {
      if (payload.phone === digits(A)) {
        return pendingA.promise
      }

      if (payload.phone === digits(B)) {
        return pendingB.promise
      }

      return {
        ok: true,
        payload: { ok: true },
      }
    },
  })

  scenario.setField('yolen-lead-name', 'Dori')
  scenario.form()
    .querySelector('button[type="submit"]')
    .click()
  await waitFor(() => scenario.calls.length === 1)

  scenario.switchConversation(B)
  await waitFor(() =>
    scenario.form()
      ?.querySelector('[name="yolen-lead-phone"]')
      ?.value === digits(B),
  )
  scenario.setField(
    'yolen-lead-name',
    'Beatriz',
  )
  scenario.form()
    .querySelector('button[type="submit"]')
    .click()
  await waitFor(() => scenario.calls.length === 2)

  scenario.switchConversation(C)
  await waitFor(() =>
    scenario.panel.textContent.includes('Cliente C'),
  )

  pendingA.resolve({
    ok: true,
    payload: { ok: true },
  })
  pendingB.resolve({
    ok: true,
    payload: { ok: true },
  })

  await sleep(120)

  assert.equal(
    scenario.panel.textContent.includes('Cliente C'),
    true,
  )
  assert.equal(
    scenario.panel.textContent.includes('Dori'),
    false,
  )
  assert.equal(
    scenario.panel.textContent.includes('Beatriz'),
    false,
  )
  assert.equal(scenario.form(), null)
})
