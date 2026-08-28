// Testes de DOM real (jsdom + node:vm) da FRENTE 1B — hotfix de runtime
// para o BLOCKER de release encontrado no smoke Firefox/WhatsApp:
//
//   1) "Lead criado. Atualizando o vínculo..." ficava preso (o vínculo não
//      aparecia sozinho, exigindo mais de um clique);
//   2) ao trocar de conversa A -> B, o Companion continuava mostrando o
//      telefone/nome da conversa A no card/formulário de criação de lead.
//
// Cobre os 10 cenários exigidos pelo Controle Mestre para esta frente.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  createLeadCalls,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const CONVERSATION_A_TITLE = '+55 44 8418-7870'
const CONVERSATION_B_TITLE = '+55 44 8445-7230'

const PHONE_A = onlyDigits(CONVERSATION_A_TITLE)
const PHONE_B = onlyDigits(CONVERSATION_B_TITLE)

function onlyDigits(value) {
  return String(value).replace(/\D/g, '')
}

function pageHtmlFor(headerTitle) {
  return buildWhatsAppPageHtml({
    headerTitle,
    messagesHtml: buildMessageHtml({
      id: 'msg-1',
      prePlainText: `[10:15, 21/08/2026] Cliente: `,
      text: 'Ola, bom dia',
    }),
  })
}

function getPanel(document) {
  return document.getElementById('yolen-companion-panel')
}

function dispatch(target, type, init = {}) {
  const EventCtor =
    target.Event ??
    target.defaultView?.Event ??
    target.ownerDocument?.defaultView?.Event ??
    Event
  target.dispatchEvent(
    new EventCtor(type, { bubbles: true, cancelable: true, ...init }),
  )
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function notFoundResolution(phone) {
  return defaultLeadResolution({
    phone,
    status: 'NOT_FOUND',
    lead: null,
    cycle: null,
  })
}

function ownedResolution(phone, overrides = {}) {
  return defaultLeadResolution({
    phone,
    status: 'OWNED_BY_ME',
    lead: {
      id: 'lead-new-1',
      name: 'Cliente Novo',
      phone,
      email: null,
      cpf_cnpj: null,
      deleted_at: null,
    },
    cycle: { id: 'cycle-new-1', status: 'novo', owner_user_id: 'user-1' },
    ...overrides,
  })
}

async function fillAndSubmit(document, name) {
  await waitFor(() =>
    Boolean(document.querySelector('[data-yolen-lead-create-form]')),
  )

  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.value = name
  dispatch(nameInput, 'input')

  const form = document.querySelector('[data-yolen-lead-create-form]')
  const submitButton = form.querySelector('.yolen-lead-create-submit')

  dispatch(submitButton, 'pointerdown')
  dispatch(submitButton, 'click')
  dispatch(form, 'submit')
}

test('TESTE 1: NOT_FOUND -> preenche -> cria uma vez -> resolve -> formulário some -> vínculo aparece', async () => {
  const resolutions = {
    [PHONE_A]: notFoundResolution(PHONE_A),
  }

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor(CONVERSATION_A_TITLE),
    resolutionsByPhone: resolutions,
    withStabilityRuntimes: true,
    createLeadResult: (payload) => {
      resolutions[PHONE_A] = ownedResolution(PHONE_A, {
        lead: {
          id: 'lead-new-1',
          name: payload?.name || 'Cliente Novo',
          phone: PHONE_A,
          email: null,
          cpf_cnpj: null,
          deleted_at: null,
        },
      })

      return {
        ok: true,
        lead_id: 'lead-new-1',
        cycle_id: 'cycle-new-1',
        owner_user_id: 'user-1',
      }
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await fillAndSubmit(document, 'Cliente Novo')

  await waitFor(() => createLeadCalls(calls).length > 0)
  assert.equal(createLeadCalls(calls).length, 1)
  assert.equal(createLeadCalls(calls)[0].payload.name, 'Cliente Novo')

  await waitFor(
    () => resolveLeadCalls(calls).length >= 2,
    { timeoutMs: 4000 },
  )

  await waitFor(
    () => document.querySelector('[data-yolen-lead-create-form]') === null,
    { timeoutMs: 4000 },
  )

  await waitFor(
    () => Boolean(document.querySelector('[data-yolen-action="open-cycle-yolen"]')),
    { timeoutMs: 4000 },
  )
})

test('TESTE 2: create sucesso com um resolve já em voo não perde o re-resolve (termina vinculado)', async () => {
  let releaseBlockedResolve
  const blockedResolveGate = new Promise((resolve) => {
    releaseBlockedResolve = resolve
  })
  // 'initial' -> (clique em "Atualizar" some enquanto o create está em
  // voo) -> 'blocked' (presa de propósito) -> 'after-block' (liberada).
  let phase = 'initial'

  const resolutions = {
    [PHONE_A]: async () => {
      if (phase === 'arm-next-blocks') {
        phase = 'blocked'
        await blockedResolveGate
        phase = 'after-block'
        return notFoundResolution(PHONE_A)
      }

      if (phase === 'after-block') {
        return ownedResolution(PHONE_A)
      }

      return notFoundResolution(PHONE_A)
    },
  }

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor(CONVERSATION_A_TITLE),
    resolutionsByPhone: resolutions,
    withStabilityRuntimes: true,
    createLeadResult: {
      ok: true,
      lead_id: 'lead-new-1',
      cycle_id: 'cycle-new-1',
      owner_user_id: 'user-1',
    },
  })

  await waitFor(() =>
    Boolean(document.querySelector('[data-yolen-lead-create-form]')),
  )
  await sleep(60)

  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.value = 'Cliente Novo'
  dispatch(nameInput, 'input')

  const form = document.querySelector('[data-yolen-lead-create-form]')
  const submitButton = form.querySelector('.yolen-lead-create-submit')

  // Dispara o create (que fica "creating" -> escondendo o formulário
  // sincronamente, antes de qualquer resposta de rede voltar) e, LOGO EM
  // SEGUIDA, um clique manual em "Atualizar" para a MESMA conversa — essa
  // segunda resolução é a que fica presa em voo de propósito.
  phase = 'arm-next-blocks'
  dispatch(submitButton, 'pointerdown')
  dispatch(submitButton, 'click')
  dispatch(form, 'submit')

  const panel = getPanel(document)
  dispatch(panel.querySelector('[data-yolen-action="refresh"]'), 'click')

  await waitFor(() => phase === 'blocked')
  await waitFor(() => createLeadCalls(calls).length > 0)

  // O create já terminou no backend (com a resolução manual ainda em
  // voo) — a reconsulta que createLeadForCurrentConversation() pediu
  // colide com ela e vira um no-op silencioso; não pode ficar perdida
  // para sempre.
  await sleep(80)
  releaseBlockedResolve()

  await waitFor(
    () => document.querySelector('[data-yolen-lead-create-form]') === null,
    { timeoutMs: 5000 },
  )
  await waitFor(
    () => Boolean(document.querySelector('[data-yolen-action="open-cycle-yolen"]')),
    { timeoutMs: 5000 },
  )

  assert.equal(createLeadCalls(calls).length, 1, 'nunca um segundo CREATE')
})

test('TESTE 3: primeiro resolve pós-create ainda NOT_FOUND -> retry limitado -> segundo OWNED_BY_ME -> nenhum segundo CREATE', async () => {
  let armEventualConsistencyOnNextCall = false
  let firstPostCreateSeen = false

  const resolutions = {
    [PHONE_A]: () => {
      if (armEventualConsistencyOnNextCall && !firstPostCreateSeen) {
        // Primeira reconsulta depois do create: eventual consistency
        // ainda não propagou, continua NOT_FOUND.
        firstPostCreateSeen = true
        return notFoundResolution(PHONE_A)
      }

      if (firstPostCreateSeen) {
        return ownedResolution(PHONE_A)
      }

      return notFoundResolution(PHONE_A)
    },
  }

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor(CONVERSATION_A_TITLE),
    resolutionsByPhone: resolutions,
    withStabilityRuntimes: true,
    createLeadResult: {
      ok: true,
      lead_id: 'lead-new-1',
      cycle_id: 'cycle-new-1',
      owner_user_id: 'user-1',
    },
  })

  await waitFor(() =>
    Boolean(document.querySelector('[data-yolen-lead-create-form]')),
  )
  await sleep(60)

  armEventualConsistencyOnNextCall = true
  await fillAndSubmit(document, 'Cliente Novo')

  await waitFor(() => createLeadCalls(calls).length > 0)
  await waitFor(() => firstPostCreateSeen)

  // Retry limitado e com backoff — não é instantâneo, mas termina.
  await waitFor(
    () => document.querySelector('[data-yolen-lead-create-form]') === null,
    { timeoutMs: 6000 },
  )

  assert.equal(
    createLeadCalls(calls).length,
    1,
    'eventual consistency não pode gerar um segundo CREATE',
  )
})

test('TESTE 4: conversa A no formulário -> troca para B antes de criar -> formulário de B nunca contém telefone/nome de A', async () => {
  const resolutions = {
    [PHONE_A]: notFoundResolution(PHONE_A),
    [PHONE_B]: notFoundResolution(PHONE_B),
  }

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor(CONVERSATION_A_TITLE),
    resolutionsByPhone: resolutions,
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() =>
    Boolean(document.querySelector('[data-yolen-lead-create-form]')),
  )

  const phoneFieldA = document.querySelector('[name="yolen-lead-phone"]')
  assert.equal(phoneFieldA.value, PHONE_A)

  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.value = 'Rascunho de A'
  dispatch(nameInput, 'input')

  const header = document.querySelector('header span[title]')
  header.setAttribute('title', CONVERSATION_B_TITLE)
  header.textContent = CONVERSATION_B_TITLE
  dispatch(header, 'click')

  await waitFor(() =>
    resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_B),
  )
  await waitFor(() =>
    Boolean(document.querySelector('[data-yolen-lead-create-form]')),
  )

  const phoneFieldB = document.querySelector('[name="yolen-lead-phone"]')
  assert.equal(phoneFieldB.value, PHONE_B)
  assert.notEqual(phoneFieldB.value, PHONE_A)

  const nameInputB = document.querySelector('[name="yolen-lead-name"]')
  assert.notEqual(nameInputB.value, 'Rascunho de A')

  const panelHtml = getPanel(document).innerHTML
  assert.doesNotMatch(panelHtml, new RegExp(PHONE_A))
})

test('TESTE 5: CREATE de A em andamento -> troca para B -> CREATE de A termina -> resultado de A não altera UI de B', async () => {
  let releaseCreate
  const createGate = new Promise((resolve) => {
    releaseCreate = resolve
  })

  const resolutions = {
    [PHONE_A]: notFoundResolution(PHONE_A),
    [PHONE_B]: notFoundResolution(PHONE_B),
  }

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor(CONVERSATION_A_TITLE),
    resolutionsByPhone: resolutions,
    withStabilityRuntimes: true,
    createLeadResult: async () => {
      await createGate
      resolutions[PHONE_A] = ownedResolution(PHONE_A)
      return {
        ok: true,
        lead_id: 'lead-a-1',
        cycle_id: 'cycle-a-1',
        owner_user_id: 'user-1',
      }
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await fillAndSubmit(document, 'Cliente A')
  await waitFor(() => createLeadCalls(calls).length > 0)

  // Troca para B ENQUANTO o create de A ainda está em voo no backend.
  const header = document.querySelector('header span[title]')
  header.setAttribute('title', CONVERSATION_B_TITLE)
  header.textContent = CONVERSATION_B_TITLE
  dispatch(header, 'click')

  await waitFor(() =>
    resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_B),
  )
  await waitFor(() =>
    Boolean(document.querySelector('[data-yolen-lead-create-form]')),
  )

  const phoneFieldB = document.querySelector('[name="yolen-lead-phone"]')
  assert.equal(phoneFieldB.value, PHONE_B)

  // Agora o create de A termina no backend.
  releaseCreate()
  await sleep(80)

  // A UI continua sendo a de B: o formulário de B não pode ter sido
  // substituído pelo vínculo de A, nem "Criando/Atualizando o vínculo"
  // de A pode ter aparecido em cima de B.
  const panel = getPanel(document)
  assert.doesNotMatch(panel.innerHTML, /Lead criado\. Atualizando o vínculo/)

  const phoneFieldAfter = document.querySelector('[name="yolen-lead-phone"]')
  assert.ok(phoneFieldAfter, 'B continua com formulário de criação (A não vinculou B)')
  assert.equal(phoneFieldAfter.value, PHONE_B)
})

test('TESTE 6: DOM do Companion nunca contém o telefone da conversa anterior depois de trocar de conversa', async () => {
  const resolutions = {
    [PHONE_A]: notFoundResolution(PHONE_A),
    [PHONE_B]: notFoundResolution(PHONE_B),
  }

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor(CONVERSATION_A_TITLE),
    resolutionsByPhone: resolutions,
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() =>
    Boolean(document.querySelector('[data-yolen-lead-create-form]')),
  )

  assert.equal(
    document.querySelector('[name="yolen-lead-phone"]').value,
    PHONE_A,
  )

  const header = document.querySelector('header span[title]')
  header.setAttribute('title', CONVERSATION_B_TITLE)
  header.textContent = CONVERSATION_B_TITLE
  dispatch(header, 'click')

  await waitFor(() =>
    resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_B),
  )
  await sleep(50)

  const panel = getPanel(document)
  assert.doesNotMatch(
    panel.innerHTML,
    new RegExp(PHONE_A),
    'telefone da conversa anterior não pode sobreviver na região de contato',
  )
})

test('TESTE 7: "Lead criado. Atualizando o vínculo..." não permanece indefinidamente', async () => {
  let leadCreated = false

  const resolutions = {
    [PHONE_A]: async () => {
      if (!leadCreated) {
        return notFoundResolution(PHONE_A)
      }

      // Um pequeno atraso deliberado na reconsulta pós-create: dá tempo
      // do teste observar "Atualizando o vínculo..." antes dele ser
      // substituído pelo vínculo real (numa rede real isso nunca é
      // instantâneo).
      await sleep(120)

      return ownedResolution(PHONE_A)
    },
  }

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor(CONVERSATION_A_TITLE),
    resolutionsByPhone: resolutions,
    withStabilityRuntimes: true,
    createLeadResult: () => {
      leadCreated = true

      return {
        ok: true,
        lead_id: 'lead-new-1',
        cycle_id: 'cycle-new-1',
        owner_user_id: 'user-1',
      }
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await fillAndSubmit(document, 'Cliente Novo')
  await waitFor(() => createLeadCalls(calls).length > 0)

  await waitFor(() =>
    getPanel(document).innerHTML.includes('Atualizando o vínculo'),
  )

  // O estado de "atualizando" precisa desaparecer sozinho (substituído
  // pelo vínculo real) dentro de um tempo limitado — nunca indefinido.
  await waitFor(
    () =>
      !getPanel(document).innerHTML.includes('Atualizando o vínculo'),
    { timeoutMs: 5000 },
  )
})

test('TESTE 8: duplo/triplo clique rápido gera exatamente 1 CREATE', async () => {
  const resolutions = {
    [PHONE_A]: notFoundResolution(PHONE_A),
  }

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor(CONVERSATION_A_TITLE),
    resolutionsByPhone: resolutions,
    withStabilityRuntimes: true,
    createLeadResult: {
      ok: true,
      lead_id: 'lead-new-1',
      cycle_id: 'cycle-new-1',
      owner_user_id: 'user-1',
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() =>
    Boolean(document.querySelector('[data-yolen-lead-create-form]')),
  )

  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.value = 'Cliente Novo'
  dispatch(nameInput, 'input')

  const form = document.querySelector('[data-yolen-lead-create-form]')

  // Três submits "quase simultâneos" (o vendedor clicando/apertando
  // Enter várias vezes seguidas antes de qualquer resposta voltar).
  dispatch(form, 'submit')
  dispatch(form, 'submit')
  dispatch(form, 'submit')

  await waitFor(() => createLeadCalls(calls).length > 0)
  await sleep(80)

  assert.equal(createLeadCalls(calls).length, 1)
})

test('TESTE 9: erro real no CREATE -> botão volta a poder tentar, nenhum falso "criado"', async () => {
  const resolutions = {
    [PHONE_A]: notFoundResolution(PHONE_A),
  }

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor(CONVERSATION_A_TITLE),
    resolutionsByPhone: resolutions,
    withStabilityRuntimes: true,
    createLeadResult: {
      ok: false,
      code: 'invalid_document',
      error: 'Documento inválido.',
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await fillAndSubmit(document, 'Cliente Novo')

  await waitFor(() => createLeadCalls(calls).length > 0)

  await waitFor(() =>
    getPanel(document).innerHTML.includes('Documento inválido'),
  )

  assert.doesNotMatch(
    getPanel(document).innerHTML,
    /Lead criado/,
    'um erro real nunca pode aparentar sucesso',
  )

  const submitButtonAfterError = document.querySelector(
    '.yolen-lead-create-submit',
  )
  assert.ok(
    submitButtonAfterError,
    'o formulário/botão precisa voltar para o vendedor poder tentar de novo',
  )
  assert.equal(submitButtonAfterError.disabled, false)
})

test('TESTE 10: active_lead_conflict/concurrent_create_conflict resolve o vínculo em vez de criar de novo', async () => {
  let armConflictResolutionOnNextCall = false

  const resolutions = {
    [PHONE_A]: () => {
      if (armConflictResolutionOnNextCall) {
        armConflictResolutionOnNextCall = false
        return ownedResolution(PHONE_A)
      }

      return notFoundResolution(PHONE_A)
    },
  }

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor(CONVERSATION_A_TITLE),
    resolutionsByPhone: resolutions,
    withStabilityRuntimes: true,
    createLeadResult: {
      ok: false,
      code: 'active_lead_conflict',
      error: 'Já existe um lead ativo para este telefone.',
    },
  })

  await waitFor(() =>
    Boolean(document.querySelector('[data-yolen-lead-create-form]')),
  )
  await sleep(60)

  armConflictResolutionOnNextCall = true
  await fillAndSubmit(document, 'Cliente Novo')

  await waitFor(() => createLeadCalls(calls).length > 0)

  await waitFor(
    () => document.querySelector('[data-yolen-lead-create-form]') === null,
    { timeoutMs: 4000 },
  )

  assert.equal(
    createLeadCalls(calls).length,
    1,
    'conflito resolve o vínculo existente, nunca dispara um segundo CREATE',
  )
})
