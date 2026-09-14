import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const semantics = require('../src/manychat-message-semantics.js')

function node(classes) {
  return {
    classList: classes,
    getAttribute(name) {
      return name === 'class' ? classes.join(' ') : null
    },
  }
}

test('classifica incoming como fala do cliente', () => {
  const result = semantics.classifyManyChatMessageNode(
    node(['_wrapper_1pymr_1', '_typeIn_1pymr_7']),
  )

  assert.equal(result.direction, 'incoming')
  assert.equal(result.author_kind, 'customer')
  assert.equal(result.customer_evidence_eligible, true)
  assert.equal(result.seller_action_eligible, false)
  assert.equal(result.automation_context_only, false)
  assert.equal(result.reasoning_evidence_eligible, true)
})

test('classifica outgoing humano separadamente de automação', () => {
  const human = semantics.classifyManyChatMessageNode(
    node(['_wrapper_1pymr_1', '_typeOut_1pymr_25']),
  )
  const automation = semantics.classifyManyChatMessageNode(
    node([
      '_wrapper_1pymr_1',
      '_typeOut_1pymr_25',
      '_botMessage_1pymr_51',
    ]),
  )

  assert.equal(human.author_kind, 'human_agent')
  assert.equal(human.seller_action_eligible, true)
  assert.equal(human.reasoning_evidence_eligible, true)

  assert.equal(automation.author_kind, 'automation')
  assert.equal(automation.automation_context_only, true)
  assert.equal(automation.customer_evidence_eligible, false)
  assert.equal(automation.seller_action_eligible, false)
  assert.equal(automation.reasoning_evidence_eligible, false)
})

test('evidência conflitante falha fechada como unknown', () => {
  for (const classes of [
    ['_typeIn_hash', '_typeOut_hash'],
    ['_typeIn_hash', '_botMessage_hash'],
    ['sem-sinal-semantico'],
  ]) {
    const result = semantics.classifyManyChatMessageNode(node(classes))
    assert.equal(result.author_kind, 'unknown')
    assert.equal(result.reasoning_evidence_eligible, false)
  }
})

test('sumário reproduz cenário autenticado sem ler conteúdo', () => {
  const nodes = [
    ...Array.from({ length: 6 }, () => node(['_typeIn_hash'])),
    ...Array.from({ length: 12 }, () => node(['_typeOut_hash'])),
    ...Array.from({ length: 2 }, () =>
      node(['_typeOut_hash', '_botMessage_hash']),
    ),
  ]

  const summary = semantics.summarizeManyChatMessageNodes(nodes)

  assert.equal(summary.total, 20)
  assert.equal(summary.incoming_customer, 6)
  assert.equal(summary.outgoing_human, 12)
  assert.equal(summary.outgoing_automation, 2)
  assert.equal(summary.unknown, 0)
  assert.equal(summary.safe_for_semantic_validation, true)
  assert.deepEqual(summary.privacy, {
    text_content_read: false,
    input_values_read: false,
    network_sent: false,
    persisted: false,
  })
})

test('sumário bloqueia validação se qualquer autoria ficar ambígua', () => {
  const summary = semantics.summarizeManyChatMessageNodes([
    node(['_typeIn_hash']),
    node(['desconhecido']),
  ])

  assert.equal(summary.unknown, 1)
  assert.equal(summary.safe_for_semantic_validation, false)
})
