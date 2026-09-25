// FASE 7 — privacidade de resolução por canal (INV-6, Q3, §19.3) pelo
// background.js REAL (mesma sandbox node:vm dos demais testes de
// background): remetente app.manychat.com recebe só a allowlist e nunca o
// lead_id; o enriquecimento confirmado recebe o lead_id reinjetado pelo
// cycle_id autorizado; remetente WhatsApp segue com o payload atual.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import {
  createFakeFetchQueue,
  jsonResponse,
  loadBackgroundScript,
} from './e2-test-support/load-background-script.mjs'

const require = createRequire(import.meta.url)
const privacy = require('../src/companion-background-privacy.js')

const SESSION_KEY = 'yolen_companion_session'
const MANYCHAT_SENDER = { tab: { id: 11, url: 'https://app.manychat.com/fb1/chat/2' }, frameId: 0, url: 'https://app.manychat.com/fb1/chat/2' }
const WHATSAPP_SENDER = { tab: { id: 12, url: 'https://web.whatsapp.com/' }, frameId: 0, url: 'https://web.whatsapp.com/' }

function validSession() {
  return {
    ok: true,
    statusCode: 200,
    origin: 'https://cockpit-comercial-vocn.vercel.app',
    capturedAt: new Date().toISOString(),
    payload: { ok: true, companion_token: 'fake.token.value', expires_at: new Date(Date.now() + 3600e3).toISOString() },
  }
}

function rawOwnedResolution() {
  return {
    ok: true,
    status: 'OWNED_BY_ME',
    user_message: 'Lead vinculado à sua carteira.',
    phone: '5547999990001',
    phone_variants: ['5547999990001'],
    display_name: 'Nome Visível',
    lead: { id: 'lead-secret', name: 'Lead Autorizado', phone: '5547999990001', email: 'x@example.com', cpf_cnpj: '12345678901', deleted_at: null },
    lead_profile: { email: null, cpf: null, cnpj: null, birth_date: '1990-01-01', profession: null, cep: null, address_city: 'Joinville', phone_mobile: null },
    cycle: { id: 'cycle-1', status: 'contato', owner_user_id: 'user-secret', owner_name: 'Vendedor', current_group_id: 'g', next_action: 'ligar', next_action_date: '2026-10-01' },
    capabilities: { can_create_lead: false, can_analyze_conversation: true, can_apply_suggestion: true, can_open_pool: false, can_open_cycle: true },
    actions: { can_analyze_conversation: true, can_apply_suggestion: true, can_link_lead: false, open_yolen_url: '/sales-cycles/cycle-1', create_lead_url: '/leads/new?phone=5547999990001', pool_url: '/pool' },
    flags: { is_admin_or_manager: false, is_owned_by_me: true, is_pool: false, is_closed: false },
  }
}

test('ManyChat: RESOLVE_LEAD chega ao content só com a allowlist Q3 e a semântica de presença do cadastro', async () => {
  const fetchQueue = createFakeFetchQueue([async () => jsonResponse(200, rawOwnedResolution())])
  const bg = loadBackgroundScript({ fetchFn: fetchQueue.fetchFn, initialStorage: { [SESSION_KEY]: validSession() } })

  const response = await bg.sendMessage(
    { source: 'YOLEN_COMPANION', action: 'RESOLVE_LEAD', payload: { platform: 'manychat', platform_contact_key: 'k' } },
    MANYCHAT_SENDER,
  )

  assert.equal(response.ok, true)
  // Objetos da sandbox do background: compara por valor (JSON).
  assert.deepEqual(JSON.parse(JSON.stringify(response.payload)), {
    ok: true,
    status: 'OWNED_BY_ME',
    user_message: 'Lead vinculado à sua carteira.',
    lead_display: { name: 'Lead Autorizado' },
    cycle: { id: 'cycle-1', status: 'contato' },
    ownership_display: { owner_name: 'Vendedor' },
    capabilities: { can_create_lead: false, can_analyze_conversation: true, can_apply_suggestion: true, can_open_pool: false, can_open_cycle: true },
    actions: { can_analyze_conversation: true, can_apply_suggestion: true, can_link_lead: false },
    flags: { is_admin_or_manager: false, is_owned_by_me: true, is_pool: false, is_closed: false },
    enrichment_context: {
      available: true,
      fields: { email: 'present', cpf: 'present', cnpj: 'missing', birth_date: 'present', profession: 'missing', cep: 'missing', address_raw: 'present', phone_mobile: 'missing' },
    },
  })
  assert.doesNotMatch(JSON.stringify(response), /5547999990001|lead-secret|user-secret|x@example\.com|12345678901|Joinville|ligar/)
})

test('ManyChat: APPLY_LEAD_ENRICHMENT recebe o lead_id pelo cycle_id autorizado; sem referência, nada vai à rede', async () => {
  const fetchQueue = createFakeFetchQueue([
    async () => jsonResponse(200, rawOwnedResolution()),
    async () => jsonResponse(200, { ok: true, status: 'APPLIED' }),
  ])
  const bg = loadBackgroundScript({ fetchFn: fetchQueue.fetchFn, initialStorage: { [SESSION_KEY]: validSession() } })

  const refused = await bg.sendMessage(
    { source: 'YOLEN_COMPANION', action: 'APPLY_LEAD_ENRICHMENT', payload: { lead_id: null, cycle_id: 'cycle-1', field: 'cnpj', value: '1' } },
    MANYCHAT_SENDER,
  )
  assert.equal(refused.ok, false)
  assert.equal(refused.payload.status, 'LEAD_REFERENCE_UNAVAILABLE')
  assert.equal(fetchQueue.calls.length, 0)

  await bg.sendMessage(
    { source: 'YOLEN_COMPANION', action: 'RESOLVE_LEAD', payload: { platform: 'manychat', platform_contact_key: 'k' } },
    MANYCHAT_SENDER,
  )

  const applied = await bg.sendMessage(
    { source: 'YOLEN_COMPANION', action: 'APPLY_LEAD_ENRICHMENT', payload: { lead_id: 'forjado', cycle_id: 'cycle-1', field: 'cnpj', value: '1' } },
    MANYCHAT_SENDER,
  )
  assert.equal(applied.ok, true)
  assert.equal(fetchQueue.calls.length, 2)
  assert.match(fetchQueue.calls[1].url, /\/api\/companion\/enrich-lead$/)
  assert.equal(JSON.parse(fetchQueue.calls[1].init.body).lead_id, 'lead-secret', 'referência do background, nunca a do content')

  // Outra aba não herda a referência privada.
  const otherTab = await bg.sendMessage(
    { source: 'YOLEN_COMPANION', action: 'APPLY_LEAD_ENRICHMENT', payload: { lead_id: null, cycle_id: 'cycle-1', field: 'cnpj', value: '1' } },
    { ...MANYCHAT_SENDER, tab: { ...MANYCHAT_SENDER.tab, id: 99 } },
  )
  assert.equal(otherTab.payload.status, 'LEAD_REFERENCE_UNAVAILABLE')
  assert.equal(fetchQueue.calls.length, 2)
})

test('ManyChat: CREATE_LEAD devolve só ok/status/code/error', async () => {
  const fetchQueue = createFakeFetchQueue([
    async () => jsonResponse(200, { ok: true, lead_id: 'lead-new', cycle_id: 'c', owner_user_id: 'u', lead: { id: 'lead-new', phone: '5547999990001' } }),
  ])
  const bg = loadBackgroundScript({ fetchFn: fetchQueue.fetchFn, initialStorage: { [SESSION_KEY]: validSession() } })

  const response = await bg.sendMessage(
    { source: 'YOLEN_COMPANION', action: 'CREATE_LEAD', payload: { name: 'N', phone: '5547999990001' } },
    MANYCHAT_SENDER,
  )
  assert.deepEqual(JSON.parse(JSON.stringify(response.payload)), { ok: true, status: null, code: null, error: null })
})

test('WhatsApp (controle): payload de resolução segue inalterado', async () => {
  const fetchQueue = createFakeFetchQueue([async () => jsonResponse(200, rawOwnedResolution())])
  const bg = loadBackgroundScript({ fetchFn: fetchQueue.fetchFn, initialStorage: { [SESSION_KEY]: validSession() } })

  const response = await bg.sendMessage(
    { source: 'YOLEN_COMPANION', action: 'RESOLVE_LEAD', payload: { phone: '5547999990001' } },
    WHATSAPP_SENDER,
  )
  assert.deepEqual(JSON.parse(JSON.stringify(response.payload)), rawOwnedResolution())
})

test('remetente: só app.manychat.com é tratado como ManyChat', () => {
  assert.equal(privacy.isManyChatSender(MANYCHAT_SENDER), true)
  assert.equal(privacy.isManyChatSender(WHATSAPP_SENDER), false)
  assert.equal(privacy.isManyChatSender({ tab: { url: 'https://app.manychat.com.evil.test/' } }), false)
  assert.equal(privacy.isManyChatSender({}), false)
})

test('sanitizador sem spread: campo desconhecido do backend nunca atravessa', () => {
  const sanitized = privacy.sanitizeResolutionPayload({ ...rawOwnedResolution(), new_private_field: 'segredo' })
  assert.equal('new_private_field' in sanitized, false)
  assert.doesNotMatch(JSON.stringify(sanitized), /segredo/)
})
