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
  assert.equal(result.bot_message, false)

  // FASE 6: a classificação é só mecânica de plataforma (direção/autoria);
  // elegibilidade para evidência/ação/raciocínio é decisão do Core.
  for (const productFlag of [
    'customer_evidence_eligible',
    'seller_action_eligible',
    'automation_context_only',
    'reasoning_evidence_eligible',
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(result, productFlag), false, productFlag)
  }
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
  assert.equal(human.direction, 'outgoing')
  assert.equal(human.bot_message, false)

  assert.equal(automation.author_kind, 'automation')
  assert.equal(automation.direction, 'outgoing')
  assert.equal(automation.bot_message, true)
})

test('evidência conflitante falha fechada como unknown', () => {
  for (const classes of [
    ['_typeIn_hash', '_typeOut_hash'],
    ['_typeIn_hash', '_botMessage_hash'],
    ['sem-sinal-semantico'],
  ]) {
    const result = semantics.classifyManyChatMessageNode(node(classes))
    assert.equal(result.author_kind, 'unknown')
    assert.equal(result.direction, 'unknown')
    assert.ok(result.reason)
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
