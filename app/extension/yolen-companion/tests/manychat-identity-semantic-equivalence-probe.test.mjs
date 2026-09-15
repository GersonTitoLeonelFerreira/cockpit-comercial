import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const identityProbe = require('../src/manychat-mainworld-identity-probe.js')
const semanticProbe = require('../src/manychat-mainworld-report-export.js')

function snapshot(entries) {
  return {
    ready: true,
    reason: null,
    secret: {
      entries: entries.map(([locator, values]) => ({
        locator,
        values: [...values],
      })),
    },
    safe: {
      react_fiber_found: true,
    },
  }
}

function buildTriplet({ ambiguousSubscriber = false } = {}) {
  const subscriberA = ambiguousSubscriber ? ['sub-a', 'other-a'] : ['sub-a']
  const subscriberB = ambiguousSubscriber ? ['sub-b', 'other-b'] : ['sub-b']

  const locators = {
    subscriber: 'fiber0.memoizedProps.children.[].props.subscriberId',
    thread: 'fiber1.memoizedProps.thread.user_id',
    userObject: 'fiber1.memoizedProps.thread.user.user_id',
    whatsapp: 'fiber1.memoizedProps.thread.user.wa_id',
    event: 'fiber1.memoizedProps.thread.last_lc_event.user_id',
    data: 'fiber1.memoizedProps.data.user_id',
  }

  const a = snapshot([
    [locators.subscriber, subscriberA],
    [locators.thread, ['sub-a']],
    [locators.userObject, ['sub-a']],
    [locators.whatsapp, ['wa-a']],
    [locators.event, ['sub-a']],
    [locators.data, ['sub-a']],
  ])

  const b = snapshot([
    [locators.subscriber, subscriberB],
    [locators.thread, ['sub-b']],
    [locators.userObject, ['sub-b']],
    [locators.whatsapp, ['wa-b']],
    [locators.event, ['sub-b']],
    [locators.data, ['sub-b']],
  ])

  const a2 = snapshot([
    [locators.subscriber, subscriberA],
    [locators.thread, ['sub-a']],
    [locators.userObject, ['sub-a']],
    [locators.whatsapp, ['wa-a']],
    [locators.event, ['sub-a']],
    [locators.data, ['sub-a']],
  ])

  return { a, b, a2 }
}

test('classifica locators ManyChat nas famílias semânticas esperadas', () => {
  assert.equal(
    semanticProbe.familyForLocator(
      'fiber0.memoizedProps.children.[].props.subscriberId',
    ),
    'subscriber_id',
  )
  assert.equal(
    semanticProbe.familyForLocator(
      'fiber1.memoizedProps.thread.user_id',
    ),
    'thread_user_id',
  )
  assert.equal(
    semanticProbe.familyForLocator(
      'fiber1.memoizedProps.thread.user.user_id',
    ),
    'user_object_user_id',
  )
  assert.equal(
    semanticProbe.familyForLocator(
      'fiber1.memoizedProps.thread.user.wa_id',
    ),
    'whatsapp_user_id',
  )
  assert.equal(
    semanticProbe.familyForLocator('fiber1.memoizedProps.generic.id'),
    null,
  )
})

test('prova subscriber_id como candidato canônico quando identidades internas corroboram', () => {
  const { a, b, a2 } = buildTriplet()

  const result = semanticProbe.analyzeSemanticEquivalence(
    a,
    b,
    a2,
    identityProbe,
  )

  assert.equal(result.pass, true)
  assert.equal(result.reason, null)
  assert.equal(
    result.safe.decision.platform_identity_candidate,
    'subscriber_id',
  )
  assert.equal(result.safe.decision.platform_identity_corroborated, true)
  assert.equal(result.safe.decision.ready_for_namespace_design, true)
  assert.ok(
    result.safe.decision.corroborated_by.includes('thread_user_id'),
  )
  assert.ok(
    result.safe.decision.corroborated_by.includes('user_object_user_id'),
  )

  const relation = result.safe.relations.find(
    (item) =>
      item.left === 'subscriber_id' &&
      item.right === 'whatsapp_user_id',
  )

  assert.equal(relation.relation, 'distinct_value')

  const serialized = JSON.stringify(result.safe)
  assert.doesNotMatch(serialized, /sub-a|sub-b|wa-a|wa-b|other-a|other-b/)
  assert.equal(result.safe.privacy.raw_identity_value_exposed, false)
  assert.equal(result.safe.privacy.hashes_exposed, false)
  assert.equal(result.safe.privacy.persisted, false)
  assert.equal(result.safe.privacy.network_sent, false)
})

test('falha fechado quando subscriber_id não é singleton consistente', () => {
  const { a, b, a2 } = buildTriplet({ ambiguousSubscriber: true })

  const result = semanticProbe.analyzeSemanticEquivalence(
    a,
    b,
    a2,
    identityProbe,
  )

  assert.equal(result.pass, false)
  assert.equal(
    result.reason,
    'canonical_platform_identity_not_corroborated',
  )

  const subscriber = result.safe.families.find(
    (item) => item.family === 'subscriber_id',
  )

  assert.equal(subscriber.status, 'ambiguous')
  assert.equal(result.safe.decision.platform_identity_candidate, null)
  assert.equal(result.safe.decision.ready_for_namespace_design, false)
})

test('download semântico gera JSON seguro com nome próprio', () => {
  let anchor = null
  let clicked = 0

  const documentRef = {
    body: {
      appendChild(node) {
        anchor = node
      },
    },
    createElement(tag) {
      assert.equal(tag, 'a')
      return {
        href: '',
        download: '',
        style: {},
        click() {
          clicked += 1
        },
        remove() {},
      }
    },
  }

  const ok = semanticProbe.downloadReport(
    {
      schema_version: 'yolen-manychat-identity-semantic-equivalence-v1',
      pass: true,
      decision: {
        platform_identity_candidate: 'subscriber_id',
      },
    },
    documentRef,
    semanticProbe.SEMANTIC_FILE_NAME,
  )

  assert.equal(ok, true)
  assert.equal(clicked, 1)
  assert.equal(
    anchor.download,
    'yolen-manychat-identity-semantic-report.json',
  )
  assert.match(anchor.href, /^data:application\/json;charset=utf-8,/)
})
