// FASE 4B.5M/4B.5N — ações seller-facing do card de contato decididas
// pelas capabilities canônicas do DomainResolutionViewModel (nunca pelo
// status), e navegação reconstruída a partir do estado canônico.
//
// defaultLeadResolution() espelha as capabilities de ação que o backend
// resolve-lead devolve (can_create_lead ↔ NOT_FOUND, can_open_pool ↔
// IN_POOL, can_open_cycle ↔ lead && cycle); os cenários de mutação
// sobrescrevem `capabilities` para provar que a autoridade é a
// capability, não uma coincidência com o status.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWhatsAppPageHtml,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const HEADER_TITLE = '+55 11 98888-7777'
const PHONE = '5511988887777'

const CREATE_FLOW_SELECTOR =
  '[data-yolen-lead-create-form], [data-yolen-action="create-lead-yolen"]'
const OPEN_POOL_SELECTOR = '[data-yolen-action="open-pool"]'
const OPEN_CYCLE_SELECTOR = '[data-yolen-action="open-cycle-yolen"]'

function leadFor(name) {
  return { id: `lead-${name}`, name, phone: PHONE, email: null, cpf_cnpj: null, deleted_at: null }
}

async function loadResolved(resolution, isResolved) {
  const { document, window, calls } = loadContentScript({
    initialHtml: buildWhatsAppPageHtml({ headerTitle: HEADER_TITLE }),
    resolutionsByPhone: { [PHONE]: resolution },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => isResolved(document))

  return { document, window, calls }
}

function cardIncludes(text) {
  return (document) =>
    document.querySelector('.yolen-contact-card')?.textContent?.includes(text)
}

function actionPresence(document) {
  return {
    create: Boolean(document.querySelector(CREATE_FLOW_SELECTOR)),
    pool: Boolean(document.querySelector(OPEN_POOL_SELECTOR)),
    cycle: Boolean(document.querySelector(OPEN_CYCLE_SELECTOR)),
  }
}

const NOT_FOUND_DESCRIPTION = 'Este contato ainda não existe na Yolen.'

test('matriz DOM: NOT_FOUND oferece somente o fluxo de criação', async () => {
  const { document } = await loadResolved(
    defaultLeadResolution({ status: 'NOT_FOUND', lead: null, cycle: null }),
    (doc) => Boolean(doc.querySelector(CREATE_FLOW_SELECTOR)),
  )

  assert.deepEqual(actionPresence(document), { create: true, pool: false, cycle: false })
})

test('matriz DOM: IN_POOL oferece somente Abrir Pool', async () => {
  const { document } = await loadResolved(
    defaultLeadResolution({
      status: 'IN_POOL',
      lead: leadFor('Lead Pool'),
      cycle: { id: 'cycle-pool', status: 'contato', owner_user_id: null },
      flags: { is_owned_by_me: false, is_pool: true, is_closed: false },
    }),
    cardIncludes('Lead Pool'),
  )

  assert.deepEqual(actionPresence(document), { create: false, pool: true, cycle: false })
})

for (const [status, name, cycle, flags] of [
  ['OWNED_BY_ME', 'Lead Meu', { id: 'cycle-me', status: 'contato', owner_user_id: 'user-1' }, { is_owned_by_me: true, is_pool: false, is_closed: false }],
  ['OWNED_BY_OTHER', 'Lead Outro', { id: 'cycle-other', status: 'contato', owner_user_id: 'user-2' }, { is_owned_by_me: false, is_pool: false, is_closed: false }],
  ['CLOSED_CYCLE', 'Lead Fechado', { id: 'cycle-closed', status: 'ganho', owner_user_id: 'user-1' }, { is_owned_by_me: true, is_pool: false, is_closed: true }],
]) {
  test(`matriz DOM: ${status} oferece somente Abrir vínculo`, async () => {
    const { document } = await loadResolved(
      defaultLeadResolution({ status, lead: leadFor(name), cycle, flags }),
      cardIncludes(name),
    )

    assert.deepEqual(actionPresence(document), { create: false, pool: false, cycle: true })
  })
}

test('mutação: NOT_FOUND com can_create_lead=false não oferece criação', async () => {
  const { document } = await loadResolved(
    defaultLeadResolution({
      status: 'NOT_FOUND',
      lead: null,
      cycle: null,
      capabilities: { can_create_lead: false },
    }),
    cardIncludes(NOT_FOUND_DESCRIPTION),
  )

  assert.equal(
    document.querySelector(CREATE_FLOW_SELECTOR),
    null,
    'status NOT_FOUND sozinho não autoriza criação',
  )
})

test('mutação: IN_POOL com can_open_pool=false não oferece Abrir Pool', async () => {
  const { document } = await loadResolved(
    defaultLeadResolution({
      status: 'IN_POOL',
      lead: leadFor('Lead Pool Negado'),
      cycle: { id: 'cycle-pool-denied', status: 'contato', owner_user_id: null },
      flags: { is_owned_by_me: false, is_pool: true, is_closed: false },
      capabilities: { can_open_pool: false },
    }),
    cardIncludes('Lead Pool Negado'),
  )

  assert.equal(
    document.querySelector(OPEN_POOL_SELECTOR),
    null,
    'status IN_POOL sozinho não autoriza Abrir Pool',
  )
})

test('mutação inversa: capability can_open_pool=true oferece Abrir Pool mesmo com status OWNED_BY_OTHER', async () => {
  const { document } = await loadResolved(
    defaultLeadResolution({
      status: 'OWNED_BY_OTHER',
      lead: leadFor('Lead Pool Canonico'),
      cycle: { id: 'cycle-pool-canonical', status: 'contato', owner_user_id: 'user-2' },
      flags: { is_owned_by_me: false, is_pool: false, is_closed: false },
      capabilities: { can_open_pool: true },
    }),
    cardIncludes('Lead Pool Canonico'),
  )

  assert.ok(document.querySelector(OPEN_POOL_SELECTOR))
  assert.equal(document.querySelector(OPEN_CYCLE_SELECTOR), null)
})
