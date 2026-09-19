import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const runtimeApi = require('../src/manychat-contact-link-runtime.js')

// STEP 2A.3 — testes do runtime de vínculo CONTACT_NOT_LINKED -> buscar ->
// selecionar -> confirmar -> first-link. Único caller autorizado de
// FIRST_LINK_EXTERNAL_IDENTITY (POST /api/companion/link-lead, RPC
// rpc_link_companion_external_identity_first) — nunca chama nem referencia
// a RPC de relink.

const CONTACT_KEY_A = `manychat:contact:v1:sha256:${'a'.repeat(64)}`
const CONTACT_KEY_B = `manychat:contact:v1:sha256:${'b'.repeat(64)}`

function safeIdentity({ key = CONTACT_KEY_A, channel = null } = {}) {
  return {
    platform: 'manychat',
    platform_identity: { source: 'subscriber_id', key },
    channel_identity: channel ? { channel: 'whatsapp', source: 'whatsapp_user_id', key: channel } : null,
  }
}

function createQueuedSender(responders) {
  const calls = []
  return {
    calls,
    async sendMessage(message) {
      calls.push(message)
      const next = responders[calls.length - 1]
      if (!next) {
        throw new Error(`[fake-send-message] fila vazia na chamada ${calls.length}`)
      }
      return typeof next === 'function' ? next(message) : next
    },
  }
}

function createFakePanelMount() {
  const contents = []
  return {
    contents,
    setPanelContent(html) {
      contents.push(html)
    },
  }
}

function leadRow(overrides = {}) {
  return {
    id: 'lead-1',
    name: 'Cliente Exemplo',
    phone_hint: '•••• 7777',
    owner_name: null,
    cycle_status: 'contato',
    ...overrides,
  }
}

function searchOk(leads) {
  return { ok: true, payload: { ok: true, leads } }
}

function linkOk(status, overrides = {}) {
  return { ok: true, payload: { ok: true, status, lead_id: 'lead-1', ...overrides } }
}

function linkConflict() {
  return { ok: false, payload: { ok: false, status: 'ALREADY_LINKED_CONFLICT', error: 'x' } }
}

function createRuntime({
  sendMessage,
  panelMount = createFakePanelMount(),
  getSafeIdentity,
  getCurrentConversationKey = () => 'conv-1',
  onLinked,
} = {}) {
  const runtime = runtimeApi.createManyChatContactLinkRuntime({
    sendMessage: sendMessage ?? (async () => ({ ok: true, payload: {} })),
    panelMountApi: panelMount,
    getSafeIdentity: getSafeIdentity ?? (async () => safeIdentity()),
    getCurrentConversationKey,
    onLinked,
  })
  return { runtime, panelMount }
}

// Simula a fonte autoritativa da conversa atual (o que
// runtime.getCurrentConversationKey() representa no capture-runtime real):
// só muda quando o teste explicitamente simula uma navegação real — nunca
// por causa de uma resposta assíncrona antiga.
function createConversationController(initial) {
  let current = initial
  return {
    get: () => current,
    navigateTo: (key) => {
      current = key
    },
  }
}

// Simula exatamente o que o bootstrap faz quando conversation_changed
// dispara de verdade: navega a fonte autoritativa E invalida o fluxo de
// vínculo da conversa anterior — nunca uma das duas coisas isoladamente.
function simulateRealConversationChange(controller, runtime, fromConversationKey, toConversationKey) {
  runtime.invalidateConversation(fromConversationKey)
  controller.navigateTo(toConversationKey)
}

// --- A: estado inicial mostra o botão "Vincular lead" ---

test('A: renderContactLinkPanel no estado inicial mostra o botão Vincular lead', () => {
  const { runtime, panelMount } = createRuntime()

  runtime.renderContactLinkPanel('conv-1')

  const last = panelMount.contents.at(-1)
  assert.ok(last.includes('data-yolen-link-lead-start'))
  assert.ok(last.includes('Vincular lead'))
})

// --- D (efeito): startLinkFlow abre a busca ---

test('startLinkFlow trava a safe identity atual em memória e abre a fase de busca', async () => {
  const { runtime, panelMount } = createRuntime()

  await runtime.startLinkFlow('conv-1')

  const last = panelMount.contents.at(-1)
  assert.ok(last.includes('data-yolen-link-lead-search'))
  assert.ok(last.includes('data-yolen-link-lead-query'))

  const state = runtime.getConversationLinkState('conv-1')
  assert.equal(state.phase, 'search')
  assert.equal(state.lockedIdentity.key, CONTACT_KEY_A)
  assert.equal(state.lockedConversationKey, 'conv-1')
})

test('startLinkFlow com identidade indisponível vai para erro, nunca abre busca', async () => {
  const { runtime, panelMount } = createRuntime({ getSafeIdentity: async () => null })

  await runtime.startLinkFlow('conv-1')

  assert.equal(runtime.getConversationLinkState('conv-1').phase, 'error')
  assert.ok(panelMount.contents.at(-1).includes('IDENTITY_NOT_READY'))
})

// --- E: busca sem termo suficiente nunca dispara chamada de rede ---

test('E: busca com termo curto demais não chama SEARCH_LINKABLE_LEADS', async () => {
  const fake = createQueuedSender([])
  const { runtime } = createRuntime({ sendMessage: fake.sendMessage })

  await runtime.startLinkFlow('conv-1')
  // "a" (1 char, 0 dígitos) e "" (vazio) não atingem nem o mínimo de nome
  // (2 chars) nem o de telefone (4 dígitos) — mesma regra do servidor.
  await runtime.runSearch('conv-1', 'a')
  await runtime.runSearch('conv-1', '')
  await runtime.runSearch('conv-1', '   ')

  assert.equal(fake.calls.length, 0)
})

// --- F: busca válida chama SEARCH_LINKABLE_LEADS com {query} apenas ---

test('F: busca válida chama SEARCH_LINKABLE_LEADS enviando somente {query}', async () => {
  const fake = createQueuedSender([searchOk([leadRow()])])
  const { runtime } = createRuntime({ sendMessage: fake.sendMessage })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'Cliente')

  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].action, 'SEARCH_LINKABLE_LEADS')
  assert.deepEqual(fake.calls[0].payload, { query: 'Cliente' })
})

// --- G: resultados são renderizados ---

test('G: resultados da busca aparecem no painel', async () => {
  const fake = createQueuedSender([searchOk([leadRow({ name: 'João Silva' })])])
  const { runtime, panelMount } = createRuntime({ sendMessage: fake.sendMessage })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'João')

  const last = panelMount.contents.at(-1)
  assert.ok(last.includes('João Silva'))
  assert.ok(last.includes('data-yolen-link-lead-select="lead-1"'))
})

// --- H: lead.name malicioso nunca vira markup ---

test('H: lead.name com HTML malicioso aparece como texto escapado, nunca como elemento', async () => {
  const malicious = '<img src=x onerror=alert(1)>'
  const fake = createQueuedSender([searchOk([leadRow({ name: malicious })])])
  const { runtime, panelMount } = createRuntime({ sendMessage: fake.sendMessage })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'Cliente')

  const last = panelMount.contents.at(-1)
  // "onerror=" como TEXTO puro (sem os delimitadores < > reais) é inerte —
  // só a ausência da tag/atributo de verdade importa para segurança.
  assert.equal(last.includes('<img'), false)
  assert.equal(last.includes('<img '), false)
  assert.ok(last.includes('&lt;img src=x onerror=alert(1)&gt;'))
})

// --- I: seleção de lead exige confirmação explícita ---

test('I: selecionar um resultado abre a confirmação explícita, sem vincular ainda', async () => {
  const fake = createQueuedSender([searchOk([leadRow({ name: 'João Silva' })])])
  const { runtime, panelMount } = createRuntime({ sendMessage: fake.sendMessage })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'João')
  runtime.selectLead('conv-1', 'lead-1')

  assert.equal(runtime.getConversationLinkState('conv-1').phase, 'confirm')
  const last = panelMount.contents.at(-1)
  assert.ok(last.includes('João Silva'))
  assert.ok(last.includes('data-yolen-link-lead-confirm'))
  assert.equal(fake.calls.length, 1, 'nenhuma chamada de rede nova só por selecionar')
})

// --- J: cancelar nunca dispara first-link ---

test('J: cancelar a confirmação nunca chama FIRST_LINK_EXTERNAL_IDENTITY', async () => {
  const fake = createQueuedSender([searchOk([leadRow()])])
  const { runtime } = createRuntime({ sendMessage: fake.sendMessage })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'Cliente')
  runtime.selectLead('conv-1', 'lead-1')
  runtime.cancelSelection('conv-1')

  assert.equal(runtime.getConversationLinkState('conv-1').phase, 'search')
  assert.equal(
    fake.calls.some((call) => call.action === 'FIRST_LINK_EXTERNAL_IDENTITY'),
    false,
  )
})

// --- K/L/M: confirmar chama FIRST_LINK_EXTERNAL_IDENTITY exatamente uma
// vez, com body mínimo e seguro ---

test('K/L: confirmar chama FIRST_LINK_EXTERNAL_IDENTITY exatamente uma vez, sem company_id/actor_user_id/identity_source/ids brutos', async () => {
  const fake = createQueuedSender([searchOk([leadRow()]), linkOk('LINKED')])
  const { runtime } = createRuntime({ sendMessage: fake.sendMessage })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'Cliente')
  runtime.selectLead('conv-1', 'lead-1')
  await runtime.confirmLink('conv-1')

  const linkCalls = fake.calls.filter((call) => call.action === 'FIRST_LINK_EXTERNAL_IDENTITY')
  assert.equal(linkCalls.length, 1)

  const body = linkCalls[0].payload
  assert.deepEqual(Object.keys(body).sort(), ['channel', 'confirmed', 'lead_id', 'platform', 'platform_contact_key'])
  assert.equal(body.platform, 'manychat')
  assert.equal(body.platform_contact_key, CONTACT_KEY_A)
  assert.equal(body.lead_id, 'lead-1')
  assert.equal(body.confirmed, true)

  const raw = JSON.stringify(body)
  assert.equal(raw.includes('company'), false)
  assert.equal(raw.includes('actor'), false)
  assert.equal(raw.includes('identity_source'), false)
  assert.equal(raw.includes('subscriber'), false)
  assert.equal(raw.includes('wa_id'), false)
})

// --- M: channel só "whatsapp" quando a safe identity prova canal whatsapp ---

test('M: channel é "whatsapp" quando a safe identity (revalidada) traz channel_identity whatsapp', async () => {
  const fake = createQueuedSender([searchOk([leadRow()]), linkOk('LINKED')])
  const { runtime } = createRuntime({
    sendMessage: fake.sendMessage,
    getSafeIdentity: async () => safeIdentity({ channel: `manychat:channel:whatsapp:v1:sha256:${'c'.repeat(64)}` }),
  })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'Cliente')
  runtime.selectLead('conv-1', 'lead-1')
  await runtime.confirmLink('conv-1')

  const linkCall = fake.calls.find((call) => call.action === 'FIRST_LINK_EXTERNAL_IDENTITY')
  assert.equal(linkCall.payload.channel, 'whatsapp')
})

test('M: channel é null quando a safe identity não tem channel_identity', async () => {
  const fake = createQueuedSender([searchOk([leadRow()]), linkOk('LINKED')])
  const { runtime } = createRuntime({ sendMessage: fake.sendMessage })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'Cliente')
  runtime.selectLead('conv-1', 'lead-1')
  await runtime.confirmLink('conv-1')

  const linkCall = fake.calls.find((call) => call.action === 'FIRST_LINK_EXTERNAL_IDENTITY')
  assert.equal(linkCall.payload.channel, null)
})

// --- N/O: LINKED e IDEMPOTENT disparam refresh (onLinked) ---

for (const status of ['LINKED', 'IDEMPOTENT_ALREADY_LINKED_TO_TARGET']) {
  test(`N/O: ${status} reseta o fluxo e chama onLinked com {conversationKey, expectedPlatform, expectedIdentityKey} (refresh de resolução)`, async () => {
    const fake = createQueuedSender([searchOk([leadRow()]), linkOk(status)])
    let onLinkedCalledWith = null

    const { runtime } = createRuntime({
      sendMessage: fake.sendMessage,
      onLinked: async (context) => {
        onLinkedCalledWith = context
      },
    })

    await runtime.startLinkFlow('conv-1')
    await runtime.runSearch('conv-1', 'Cliente')
    runtime.selectLead('conv-1', 'lead-1')
    await runtime.confirmLink('conv-1')

    assert.deepEqual(onLinkedCalledWith, {
      conversationKey: 'conv-1',
      expectedPlatform: 'manychat',
      expectedIdentityKey: CONTACT_KEY_A,
    })
    assert.equal(runtime.getConversationLinkState('conv-1').phase, 'prompt')
  })
}

// --- P: ALREADY_LINKED_CONFLICT nunca tenta relink, sempre chama onLinked ---

test('P: ALREADY_LINKED_CONFLICT nunca chama nenhuma action de relink e sempre reexecuta a resolução (onLinked)', async () => {
  const fake = createQueuedSender([searchOk([leadRow()]), linkConflict()])
  let onLinkedCalled = false

  const { runtime, panelMount } = createRuntime({
    sendMessage: fake.sendMessage,
    onLinked: async () => {
      onLinkedCalled = true
    },
  })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'Cliente')
  runtime.selectLead('conv-1', 'lead-1')
  await runtime.confirmLink('conv-1')

  assert.equal(onLinkedCalled, true)
  assert.equal(
    fake.calls.some((call) => String(call.action ?? '').toLowerCase().includes('relink')),
    false,
  )
  assert.equal(
    fake.calls.filter((call) => call.action === 'FIRST_LINK_EXTERNAL_IDENTITY').length,
    1,
    'exatamente uma tentativa — nunca uma segunda chamada "forçando" o vínculo',
  )
  assert.ok(panelMount.contents.some((html) => html.includes('vinculado enquanto você concluía')))
})

// --- Q: identidade mudou entre abrir e confirmar -> CONTACT_CHANGED ---

test('Q: safe identity muda entre abertura e confirmação -> CONTACT_CHANGED, zero first-link', async () => {
  const fake = createQueuedSender([searchOk([leadRow()])])
  let identityCallCount = 0

  const { runtime, panelMount } = createRuntime({
    sendMessage: fake.sendMessage,
    getSafeIdentity: async () => {
      identityCallCount += 1
      // Primeira chamada (startLinkFlow): identidade A. Segunda chamada
      // (revalidação no confirmLink): identidade B — o vendedor mudou de
      // conversa/contato entre o clique inicial e a confirmação.
      return identityCallCount === 1 ? safeIdentity({ key: CONTACT_KEY_A }) : safeIdentity({ key: CONTACT_KEY_B })
    },
  })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'Cliente')
  runtime.selectLead('conv-1', 'lead-1')
  await runtime.confirmLink('conv-1')

  const state = runtime.getConversationLinkState('conv-1')
  assert.equal(state.phase, 'error')
  assert.equal(state.error.code, 'CONTACT_CHANGED')
  assert.equal(
    fake.calls.some((call) => call.action === 'FIRST_LINK_EXTERNAL_IDENTITY'),
    false,
  )
  assert.ok(panelMount.contents.at(-1).includes('mudou de conversa'))
})

// --- R: conversation_key mudou -> CONTACT_CHANGED, zero first-link ---

test('R: conversation_key atual mudou antes da confirmação -> CONTACT_CHANGED, zero first-link', async () => {
  const fake = createQueuedSender([searchOk([leadRow()])])
  let currentKey = 'conv-1'

  const { runtime } = createRuntime({
    sendMessage: fake.sendMessage,
    getCurrentConversationKey: () => currentKey,
  })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'Cliente')
  runtime.selectLead('conv-1', 'lead-1')

  // Vendedor navegou para outra conversa antes de clicar em confirmar.
  currentKey = 'conv-2'

  await runtime.confirmLink('conv-1')

  const state = runtime.getConversationLinkState('conv-1')
  assert.equal(state.phase, 'error')
  assert.equal(state.error.code, 'CONTACT_CHANGED')
  assert.equal(
    fake.calls.some((call) => call.action === 'FIRST_LINK_EXTERNAL_IDENTITY'),
    false,
  )
})

// --- S: A -> B -> A nunca herda estado de A em B ---

test('S: B nunca herda query/seleção/confirmação de A enquanto A ainda é a conversa atual', async () => {
  const fake = createQueuedSender([searchOk([leadRow({ name: 'Lead da conversa A' })])])
  const controller = createConversationController('conv-a')
  const { runtime } = createRuntime({ sendMessage: fake.sendMessage, getCurrentConversationKey: controller.get })

  await runtime.startLinkFlow('conv-a')
  await runtime.runSearch('conv-a', 'Cliente')
  runtime.selectLead('conv-a', 'lead-1')

  const stateA = runtime.getConversationLinkState('conv-a')
  assert.equal(stateA.phase, 'confirm')

  const stateB = runtime.getConversationLinkState('conv-b')
  assert.equal(stateB.phase, 'prompt')
  assert.equal(stateB.query, '')
  assert.deepEqual(stateB.results, [])
  assert.equal(stateB.selectedLead, null)
})

// --- Correção 2 (STEP 2A.3, hardening final): A → B → A NUNCA retoma uma
// confirmação/busca antiga — uma troca de conversa REAL sempre invalida o
// fluxo da conversa anterior. Substitui a expectativa antiga do teste S,
// que preservava a confirmação de A indefinidamente (contrato inseguro
// para uma ação sensível de escrita). ---

test('A→B→A: uma troca de conversa real invalida o fluxo antigo — A volta para prompt, nunca retoma a confirmação', async () => {
  const fake = createQueuedSender([searchOk([leadRow({ name: 'Lead da conversa A' })])])
  const controller = createConversationController('conv-a')
  const { runtime } = createRuntime({ sendMessage: fake.sendMessage, getCurrentConversationKey: controller.get })

  await runtime.startLinkFlow('conv-a')
  await runtime.runSearch('conv-a', 'Cliente')
  runtime.selectLead('conv-a', 'lead-1')

  assert.equal(runtime.getConversationLinkState('conv-a').phase, 'confirm')

  // Troca de conversa REAL (equivalente ao bootstrap recebendo
  // conversation_changed): invalida A antes de B assumir o painel.
  simulateRealConversationChange(controller, runtime, 'conv-a', 'conv-b')

  // Vendedor volta para a conversa A.
  controller.navigateTo('conv-a')

  const stateA = runtime.getConversationLinkState('conv-a')
  assert.equal(stateA.phase, 'prompt')
  assert.equal(stateA.selectedLead, null)
  assert.equal(stateA.query, '')
  assert.deepEqual(stateA.results, [])
  assert.equal(stateA.lockedIdentity, null)
  assert.equal(stateA.lockedConversationKey, null)
})

// --- T: duplo clique em Confirmar dispara só UMA requisição ---

test('T: duplo clique em confirmar (enquanto linking) dispara somente uma requisição de first-link', async () => {
  let resolveLink
  const linkPromise = new Promise((resolve) => {
    resolveLink = resolve
  })

  const calls = []
  const sendMessage = async (message) => {
    calls.push(message)
    if (message.action === 'SEARCH_LINKABLE_LEADS') {
      return searchOk([leadRow()])
    }
    if (message.action === 'FIRST_LINK_EXTERNAL_IDENTITY') {
      await linkPromise
      return linkOk('LINKED')
    }
    throw new Error(`ação inesperada: ${message.action}`)
  }

  const { runtime } = createRuntime({ sendMessage })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'Cliente')
  runtime.selectLead('conv-1', 'lead-1')

  const firstConfirm = runtime.confirmLink('conv-1')
  const secondConfirm = runtime.confirmLink('conv-1')

  resolveLink()
  await Promise.all([firstConfirm, secondConfirm])

  assert.equal(
    calls.filter((call) => call.action === 'FIRST_LINK_EXTERNAL_IDENTITY').length,
    1,
  )
})

// --- U: erro de rede permite nova tentativa explícita, nunca auto-loop ---

test('U: erro de rede na confirmação vai para estado de erro recuperável, sem retry automático', async () => {
  const fake = createQueuedSender([searchOk([leadRow()]), () => Promise.reject(new Error('offline'))])
  const { runtime, panelMount } = createRuntime({ sendMessage: fake.sendMessage })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'Cliente')
  runtime.selectLead('conv-1', 'lead-1')
  await runtime.confirmLink('conv-1')

  const state = runtime.getConversationLinkState('conv-1')
  assert.equal(state.phase, 'error')
  assert.equal(state.error.code, 'NETWORK_ERROR')
  assert.equal(fake.calls.length, 2, 'nenhuma segunda tentativa automática')
  assert.ok(panelMount.contents.at(-1).includes('data-yolen-link-lead-retry'))
})

test('U: erro de rede na busca também é recuperável e não repete sozinho', async () => {
  const fake = createQueuedSender([() => Promise.reject(new Error('offline'))])
  const { runtime } = createRuntime({ sendMessage: fake.sendMessage })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'Cliente')

  const state = runtime.getConversationLinkState('conv-1')
  assert.equal(state.error.code, 'NETWORK_ERROR')
  assert.equal(fake.calls.length, 1)
})

// --- backend error mapping nunca vaza mensagem interna ---

test('mapeamento de erro do backend nunca exibe mensagem interna crua para status desconhecido', async () => {
  const fake = createQueuedSender([
    { ok: false, payload: { ok: false, status: 'SOME_INTERNAL_DB_ERROR_CODE_123', error: 'duplicate key value violates unique constraint' } },
  ])
  const { runtime, panelMount } = createRuntime({ sendMessage: fake.sendMessage })

  await runtime.startLinkFlow('conv-1')
  await runtime.runSearch('conv-1', 'Cliente')

  const last = panelMount.contents.at(-1)
  assert.equal(last.includes('duplicate key value'), false)
  assert.equal(last.includes('constraint'), false)
})

// -----------------------------------------------------------------------
// STEP 2A.3 — hardening final (auditoria de race condition A→B):
// respostas assíncronas antigas de A nunca podem repintar o painel depois
// que a conversa realmente aberta já é B, e uma troca de conversa real
// sempre invalida o fluxo em andamento de quem foi deixado para trás.
// -----------------------------------------------------------------------

test('Hardening A: startLinkFlow(A) com identidade em voo — troca real para B chega antes da resposta — painel de B nunca é sobrescrito por A, e A fica invalidado', async () => {
  let resolveIdentity
  const identityPromise = new Promise((resolve) => {
    resolveIdentity = resolve
  })

  const controller = createConversationController('conv-a')
  const { runtime, panelMount } = createRuntime({
    getCurrentConversationKey: controller.get,
    getSafeIdentity: () => identityPromise,
  })

  // B já está com seu próprio conteúdo pintado (o painel "pertence" a B a
  // partir daqui).
  runtime.renderContactLinkPanel('conv-b')
  const panelWritesBeforeStale = panelMount.contents.length

  const startFlowPromise = runtime.startLinkFlow('conv-a')

  // Troca de conversa REAL acontece ENQUANTO a identidade de A ainda está
  // em voo — exatamente como o bootstrap faria ao receber
  // conversation_changed.
  simulateRealConversationChange(controller, runtime, 'conv-a', 'conv-b')
  runtime.renderContactLinkPanel('conv-b')
  const panelWritesAfterNavigatingAwayFromA = panelMount.contents.length

  // Só agora a resposta antiga de A chega.
  resolveIdentity(safeIdentity({ key: CONTACT_KEY_A }))
  await startFlowPromise

  // Nenhuma escrita nova no painel depois que B assumiu — a resposta
  // desatualizada de A nunca se materializou em DOM.
  assert.equal(panelMount.contents.length, panelWritesAfterNavigatingAwayFromA)
  assert.ok(panelWritesAfterNavigatingAwayFromA > panelWritesBeforeStale, 'sanity: B realmente pintou o painel')

  const stateA = runtime.getConversationLinkState('conv-a')
  assert.equal(stateA.phase, 'prompt')
  assert.equal(stateA.lockedIdentity, null)
})

test('Hardening B: runSearch(A) em voo — troca real para B — resposta de busca de A chega — nenhum resultado de A aparece sobre B', async () => {
  let resolveSearch
  const searchPromise = new Promise((resolve) => {
    resolveSearch = resolve
  })

  const controller = createConversationController('conv-a')
  const { runtime, panelMount } = createRuntime({
    getCurrentConversationKey: controller.get,
    sendMessage: async (message) => {
      if (message.action === 'SEARCH_LINKABLE_LEADS') return searchPromise
      throw new Error(`ação inesperada: ${message.action}`)
    },
  })

  await runtime.startLinkFlow('conv-a')
  const searchPromiseHandle = runtime.runSearch('conv-a', 'Cliente')

  simulateRealConversationChange(controller, runtime, 'conv-a', 'conv-b')
  runtime.renderContactLinkPanel('conv-b')
  const panelWritesAfterNavigatingAway = panelMount.contents.length

  resolveSearch(searchOk([leadRow({ name: 'Resultado de A — nunca deveria aparecer em B' })]))
  await searchPromiseHandle

  const allPaintedHtml = panelMount.contents.join('\n')
  assert.equal(allPaintedHtml.includes('Resultado de A'), false)
  assert.equal(panelMount.contents.length, panelWritesAfterNavigatingAway)

  const stateA = runtime.getConversationLinkState('conv-a')
  assert.equal(stateA.phase, 'prompt', 'A foi invalidado pela troca real de conversa')
})

test('Hardening C: A em confirm — troca real para B — volta para A — a confirmação antiga não existe mais', async () => {
  const fake = createQueuedSender([searchOk([leadRow()])])
  const controller = createConversationController('conv-a')
  const { runtime } = createRuntime({ sendMessage: fake.sendMessage, getCurrentConversationKey: controller.get })

  await runtime.startLinkFlow('conv-a')
  await runtime.runSearch('conv-a', 'Cliente')
  runtime.selectLead('conv-a', 'lead-1')
  assert.equal(runtime.getConversationLinkState('conv-a').phase, 'confirm')

  simulateRealConversationChange(controller, runtime, 'conv-a', 'conv-b')
  controller.navigateTo('conv-a')

  const state = runtime.getConversationLinkState('conv-a')
  assert.equal(state.phase, 'prompt')
  assert.equal(state.selectedLead, null)
})

// --- Correção 11 (STEP 2A.3, hardening final): "__", "_%", "%_" locais
// nunca disparam SEARCH_LINKABLE_LEADS, mesmo tendo >= 2 caracteres brutos ---

for (const wildcardQuery of ['__', '_%', '%_']) {
  test(`Hardening I: query "${wildcardQuery}" nunca dispara SEARCH_LINKABLE_LEADS`, async () => {
    const fake = createQueuedSender([])
    const { runtime } = createRuntime({ sendMessage: fake.sendMessage })

    await runtime.startLinkFlow('conv-1')
    await runtime.runSearch('conv-1', wildcardQuery)

    assert.equal(fake.calls.length, 0)
  })
}
