// STEP 2B.5-C1.1 — "SANITIZE MANYCHAT PHONE RESOLUTION IN BACKGROUND":
// RESOLVE_LEAD nunca é reaproveitado para o fallback de telefone do
// ManyChat, porque devolveria ao content script o payload CRU do backend
// — e esse payload cru inclui o telefone em vários lugares, inclusive
// embutido em actions.create_lead_url (buildCreateLeadUrl(phone,
// displayName), ver app/api/companion/resolve-lead/route.ts). A action
// RESOLVE_MANYCHAT_LEAD_BY_PHONE chama o MESMO endpoint com {phone} e
// sanitiza a resposta AQUI, no background, antes de qualquer retorno ao
// content script — mesma sandbox node:vm dos demais testes de
// background.js, código real, sem nenhuma alteração de comportamento
// simulada.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createFakeFetchQueue,
  jsonResponse,
  loadBackgroundScript,
} from './e2-test-support/load-background-script.mjs'

const SESSION_KEY = 'yolen_companion_session'
const TRUSTED_PHONE = '5547999990001'

function futureIso(secondsFromNow) {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString()
}

function validSession(overrides = {}) {
  return {
    ok: true,
    statusCode: 200,
    origin: 'https://cockpit-comercial-vocn.vercel.app',
    capturedAt: new Date().toISOString(),
    payload: {
      ok: true,
      companion_token: 'fake.token.value',
      expires_at: futureIso(6 * 60 * 60),
    },
    ...overrides,
  }
}

// Fixture REALISTA: reproduz exatamente o shape que
// buildResolutionPayload() em app/api/companion/resolve-lead/route.ts
// devolve para um lead resolvido — com o telefone bruto espalhado em
// phone, phone_variants, lead.phone, lead_profile.phone_mobile E dentro
// de actions.create_lead_url (a query string que buildCreateLeadUrl
// monta). Este é o shape que o teste anterior (commit 0868f460) NUNCA
// reproduziu, e que o sanitizador anterior (baseado em spread) deixava
// vazar via actions.create_lead_url.
function realisticRawBackendPayload({ phone = TRUSTED_PHONE, status = 'OWNED_BY_ME' } = {}) {
  return {
    ok: true,
    status,
    user_message: 'Lead identificado.',
    phone,
    phone_variants: [phone, `+${phone}`],
    display_name: 'Maria Cliente',
    lead: {
      id: 'lead-1',
      name: 'Maria Cliente',
      phone,
      email: 'maria@example.com',
      cpf_cnpj: null,
      deleted_at: null,
    },
    lead_profile: {
      email: 'maria@example.com',
      cpf: null,
      cnpj: null,
      birth_date: null,
      profession: null,
      cep: null,
      address_street: null,
      address_number: null,
      address_complement: null,
      address_neighborhood: null,
      address_city: null,
      address_state: null,
      phone_mobile: phone,
    },
    cycle: {
      id: 'cycle-1',
      status: 'ACTIVE',
      owner_user_id: 'user-1',
      owner_name: 'Vendedor',
      current_group_id: 'group-1',
      next_action: null,
      next_action_date: null,
    },
    actions: {
      can_analyze_conversation: true,
      can_apply_suggestion: true,
      can_create_lead_inside_extension: false,
      can_assign_pool_inside_extension: false,
      can_transfer_owner_inside_extension: false,
      can_link_lead: false,
      open_yolen_url: '/sales-cycles/cycle-1',
      create_lead_url: `/leads?source=companion&phone=${phone}&name=Maria+Cliente`,
      pool_url: '/pool',
    },
    flags: {
      is_admin_or_manager: true,
      is_owned_by_me: true,
      is_pool: false,
      is_closed: false,
    },
  }
}

test('background/RESOLVE_MANYCHAT_LEAD_BY_PHONE: sem sessão em cache retorna NO_COMPANION_SESSION e NÃO chama fetch', async () => {
  const fetchQueue = createFakeFetchQueue([])
  const bg = loadBackgroundScript({ fetchFn: fetchQueue.fetchFn })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'RESOLVE_MANYCHAT_LEAD_BY_PHONE',
    payload: { phone: TRUSTED_PHONE },
  })

  assert.equal(response.ok, false)
  assert.equal(response.statusCode, 401)
  assert.equal(response.payload.status, 'NO_COMPANION_SESSION')
  assert.equal(fetchQueue.calls.length, 0)
  assert.equal(JSON.stringify(response).includes(TRUSTED_PHONE), false)
})

test('background/RESOLVE_MANYCHAT_LEAD_BY_PHONE: envia ao backend SOMENTE {phone}, nunca message.payload inteiro', async () => {
  const fetchQueue = createFakeFetchQueue([
    async () => jsonResponse(200, realisticRawBackendPayload()),
  ])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: { [SESSION_KEY]: validSession() },
  })

  await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'RESOLVE_MANYCHAT_LEAD_BY_PHONE',
    // Payload deliberadamente "sujo", como se o content script tivesse
    // enviado campos extras por engano — nenhum deles pode chegar ao
    // backend além de phone.
    payload: {
      phone: TRUSTED_PHONE,
      platform: 'manychat',
      platform_contact_key: 'manychat:contact:v1:sha256:' + 'a'.repeat(64),
      display_name: 'Não deveria ir',
    },
  })

  assert.equal(fetchQueue.calls.length, 1)
  const call = fetchQueue.calls[0]
  assert.equal(call.url, 'https://cockpit-comercial-vocn.vercel.app/api/companion/resolve-lead')
  assert.deepEqual(JSON.parse(call.init.body), { phone: TRUSTED_PHONE })
})

test('background/RESOLVE_MANYCHAT_LEAD_BY_PHONE: resposta sanitizada nunca contém o telefone bruto, mesmo com o shape REAL do backend (create_lead_url incluso)', async () => {
  const fetchQueue = createFakeFetchQueue([
    async () => jsonResponse(200, realisticRawBackendPayload()),
  ])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: { [SESSION_KEY]: validSession() },
  })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'RESOLVE_MANYCHAT_LEAD_BY_PHONE',
    payload: { phone: TRUSTED_PHONE },
  })

  assert.equal(response.ok, true)

  // Prova terminal: nenhuma forma do telefone bruto sobrevive na resposta
  // que o background devolve ao content script — nem em campos óbvios
  // (phone/phone_variants/lead.phone/lead_profile.phone_mobile), nem
  // embutida numa URL (actions.create_lead_url).
  assert.equal(JSON.stringify(response).includes(TRUSTED_PHONE), false)

  // Comparação campo a campo (nunca assert.deepEqual/deepStrictEqual):
  // response.payload é um objeto criado DENTRO da sandbox node:vm de
  // background.js, nunca reference-equal a um literal do realm externo
  // deste arquivo de teste, mesmo com estrutura idêntica.
  assert.equal(response.payload.status, 'OWNED_BY_ME')
  assert.equal(response.payload.cycle?.id, 'cycle-1')
  assert.equal(response.payload.actions?.can_analyze_conversation, true)
  assert.equal(response.payload.flags?.is_closed, false)
  assert.equal(Object.keys(response.payload).sort().join(','), 'actions,cycle,flags,status')
  assert.equal(Object.keys(response.payload.cycle).join(','), 'id')
  assert.equal(Object.keys(response.payload.actions).join(','), 'can_analyze_conversation')
  assert.equal(Object.keys(response.payload.flags).join(','), 'is_closed')

  assert.equal('phone' in response.payload, false)
  assert.equal('phone_variants' in response.payload, false)
  assert.equal('lead' in response.payload, false)
  assert.equal('lead_profile' in response.payload, false)
  assert.equal('display_name' in response.payload, false)
  assert.equal('user_message' in response.payload, false)
  assert.equal('create_lead_url' in response.payload.actions, false)
  assert.equal('open_yolen_url' in response.payload.actions, false)
  assert.equal('pool_url' in response.payload.actions, false)
  assert.equal('can_apply_suggestion' in response.payload.actions, false)
  assert.equal('can_link_lead' in response.payload.actions, false)
  assert.equal('is_admin_or_manager' in response.payload.flags, false)
  assert.equal('is_owned_by_me' in response.payload.flags, false)
  assert.equal('is_pool' in response.payload.flags, false)
})

test('background/RESOLVE_MANYCHAT_LEAD_BY_PHONE: mesmo para NOT_FOUND (sem lead/cycle), create_lead_url com telefone embutido nunca sobrevive', async () => {
  const rawNotFound = {
    ok: true,
    status: 'NOT_FOUND',
    user_message: 'Nenhum lead encontrado.',
    phone: TRUSTED_PHONE,
    phone_variants: [TRUSTED_PHONE],
    display_name: null,
    lead: null,
    lead_profile: null,
    cycle: null,
    actions: {
      can_analyze_conversation: false,
      can_apply_suggestion: false,
      can_create_lead_inside_extension: false,
      can_assign_pool_inside_extension: false,
      can_transfer_owner_inside_extension: false,
      can_link_lead: false,
      open_yolen_url: '/leads',
      create_lead_url: `/leads?source=companion&phone=${TRUSTED_PHONE}`,
      pool_url: '/pool',
    },
    flags: {
      is_admin_or_manager: false,
      is_owned_by_me: false,
      is_pool: false,
      is_closed: false,
    },
  }

  const fetchQueue = createFakeFetchQueue([async () => jsonResponse(200, rawNotFound)])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: { [SESSION_KEY]: validSession() },
  })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'RESOLVE_MANYCHAT_LEAD_BY_PHONE',
    payload: { phone: TRUSTED_PHONE },
  })

  assert.equal(JSON.stringify(response).includes(TRUSTED_PHONE), false)
  assert.equal(response.payload.status, 'NOT_FOUND')
  assert.equal(response.payload.cycle, null)
  assert.equal(response.payload.actions?.can_analyze_conversation, false)
  assert.equal(response.payload.flags?.is_closed, false)
  assert.equal(Object.keys(response.payload).sort().join(','), 'actions,cycle,flags,status')
})

test('background/RESOLVE_MANYCHAT_LEAD_BY_PHONE: falha de rede/sessão devolve status transiente sem inventar cycle/actions/flags', async () => {
  const fetchQueue = createFakeFetchQueue([
    async () => {
      throw new Error('boom')
    },
  ])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: { [SESSION_KEY]: validSession() },
  })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'RESOLVE_MANYCHAT_LEAD_BY_PHONE',
    payload: { phone: TRUSTED_PHONE },
  })

  assert.equal(response.ok, false)
  assert.equal(response.payload.status, 'NETWORK_ERROR')
  assert.equal(response.payload.cycle, null)
  assert.equal(response.payload.actions, null)
  assert.equal(response.payload.flags, null)
  assert.equal(Object.keys(response.payload).sort().join(','), 'actions,cycle,flags,status')
})

test('background/RESOLVE_LEAD (identidade externa): continua exatamente como antes — payload completo, sem sanitização, sem mudança de comportamento', async () => {
  const fetchQueue = createFakeFetchQueue([
    async () => jsonResponse(200, realisticRawBackendPayload({ status: 'OWNED_BY_ME' })),
  ])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: { [SESSION_KEY]: validSession() },
  })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'RESOLVE_LEAD',
    payload: {
      platform: 'manychat',
      platform_contact_key: 'manychat:contact:v1:sha256:' + 'a'.repeat(64),
    },
  })

  assert.equal(fetchQueue.calls.length, 1)
  const call = fetchQueue.calls[0]
  assert.equal(call.url, 'https://cockpit-comercial-vocn.vercel.app/api/companion/resolve-lead')
  assert.deepEqual(JSON.parse(call.init.body), {
    platform: 'manychat',
    platform_contact_key: 'manychat:contact:v1:sha256:' + 'a'.repeat(64),
  })

  // RESOLVE_LEAD nunca sanitiza — quem sanitiza é o content runtime
  // (sanitizeLeadResolutionPayload em manychat-capture-runtime.js), como
  // já acontecia antes desta etapa. O background só sanitiza a action
  // dedicada de telefone.
  assert.equal(response.payload.actions.create_lead_url, `/leads?source=companion&phone=${TRUSTED_PHONE}&name=Maria+Cliente`)
  assert.equal(response.payload.phone, TRUSTED_PHONE)
})
