import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const probe = require('../src/manychat-mainworld-identity-probe.js')

function buildDocument({ contactId = 'contact-a', phone = '5547999990001' } = {}) {
  const fiber = {
    memoizedProps: {
      contact: {
        contactId,
        phone,
        name: 'não deve virar identidade',
      },
      generic: {
        id: 'generic-id-ignored',
      },
    },
    pendingProps: null,
    memoizedState: null,
    return: null,
  }

  const messageRoot = {
    __reactFiber$test: fiber,
    parentElement: null,
    querySelectorAll() {
      return []
    },
  }

  return {
    querySelector(selector) {
      return selector === probe.MESSAGE_ROOT_SELECTOR ? messageRoot : null
    },
  }
}

test('descobre React fiber e publica apenas locators sem valores pessoais', () => {
  const snapshot = probe.snapshotCandidateMap(buildDocument())

  assert.equal(snapshot.ready, true)
  assert.equal(snapshot.safe.react_fiber_found, true)
  assert.equal(snapshot.safe.candidate_locator_count, 2)
  assert.ok(
    snapshot.safe.candidate_locators.some((value) => value.endsWith('.contact.contactId')),
  )
  assert.ok(
    snapshot.safe.candidate_locators.some((value) => value.endsWith('.contact.phone')),
  )

  const serialized = JSON.stringify(snapshot.safe)
  assert.doesNotMatch(serialized, /contact-a/)
  assert.doesNotMatch(serialized, /5547999990001/)
  assert.doesNotMatch(serialized, /generic-id-ignored/)
  assert.equal(snapshot.safe.privacy.raw_identity_value_exposed, false)
  assert.equal(snapshot.safe.privacy.network_sent, false)
  assert.equal(snapshot.safe.privacy.persisted, false)
})

test('A → B → A prova locator somente quando valor muda e retorna', () => {
  const a = probe.snapshotCandidateMap(
    buildDocument({ contactId: 'contact-a', phone: '111' }),
  )
  const b = probe.snapshotCandidateMap(
    buildDocument({ contactId: 'contact-b', phone: '222' }),
  )
  const a2 = probe.snapshotCandidateMap(
    buildDocument({ contactId: 'contact-a', phone: '111' }),
  )

  const result = probe.evaluateABAReturn(a, b, a2)

  assert.equal(result.pass, true)
  assert.ok(result.safe.proven_locator_count >= 2)
  assert.equal(result.safe.pass, true)

  const serialized = JSON.stringify(result.safe)
  assert.doesNotMatch(serialized, /contact-a/)
  assert.doesNotMatch(serialized, /contact-b/)
  assert.doesNotMatch(serialized, /111/)
  assert.doesNotMatch(serialized, /222/)
})

test('falha fechado quando B não muda a identidade', () => {
  const a = probe.snapshotCandidateMap(
    buildDocument({ contactId: 'same', phone: '111' }),
  )
  const b = probe.snapshotCandidateMap(
    buildDocument({ contactId: 'same', phone: '111' }),
  )
  const a2 = probe.snapshotCandidateMap(
    buildDocument({ contactId: 'same', phone: '111' }),
  )

  const result = probe.evaluateABAReturn(a, b, a2)

  assert.equal(result.pass, false)
  assert.equal(result.reason, 'stable_internal_identity_not_proven')
  assert.equal(result.safe.proven_locator_count, 0)
})

test('não promove campo genérico id para identidade do contato', () => {
  const documentRef = buildDocument({ contactId: '', phone: '' })
  const snapshot = probe.snapshotCandidateMap(documentRef)

  assert.equal(snapshot.ready, true)
  assert.equal(snapshot.safe.candidate_locator_count, 0)
})

test('findReactFiberKey aceita React moderno e legado sem fixar sufixo', () => {
  assert.equal(
    probe.findReactFiberKey({ __reactFiber$abc: {} }),
    '__reactFiber$abc',
  )
  assert.equal(
    probe.findReactFiberKey({ __reactInternalInstance$xyz: {} }),
    '__reactInternalInstance$xyz',
  )
  assert.equal(probe.findReactFiberKey({}), null)
})
