import assert from 'node:assert/strict'
import test from 'node:test'

import conversationRegistrationTools from '../src/conversation-registration-tools.js'

const {
  buildConversationRegistrationKey,
  shouldApplyConversationRegistrationResult,
} = conversationRegistrationTools

// Cenário D: vendedor inicia "Registrar conversa" na conversa A, troca para
// a conversa B antes da resposta chegar. O resultado de A não pode ser
// aplicado como se fosse de B.

test('resultado é aplicado quando a conversa atual ainda é a mesma que pediu o registro', () => {
  const applies = shouldApplyConversationRegistrationResult({
    requestCycleId: 'cycle-a',
    requestConversationKey: 'phone:5547999990001',
    currentCycleId: 'cycle-a',
    currentConversationKey: 'phone:5547999990001',
  })

  assert.equal(applies, true)
})

test('resultado da conversa A não é aplicado se o vendedor já está na conversa B (troca de conversation_key)', () => {
  const applies = shouldApplyConversationRegistrationResult({
    requestCycleId: 'cycle-a',
    requestConversationKey: 'phone:5547999990001',
    currentCycleId: 'cycle-a',
    currentConversationKey: 'phone:5547999990002',
  })

  assert.equal(applies, false)
})

test('resultado da conversa A não é aplicado se o vendedor já está em outro ciclo (troca de cycle_id)', () => {
  const applies = shouldApplyConversationRegistrationResult({
    requestCycleId: 'cycle-a',
    requestConversationKey: 'phone:5547999990001',
    currentCycleId: 'cycle-b',
    currentConversationKey: 'phone:5547999990001',
  })

  assert.equal(applies, false)
})

test('valores ausentes nunca são tratados como correspondência válida', () => {
  assert.equal(
    shouldApplyConversationRegistrationResult({
      requestCycleId: '',
      requestConversationKey: 'phone:5547999990001',
      currentCycleId: 'cycle-a',
      currentConversationKey: 'phone:5547999990001',
    }),
    false,
  )

  assert.equal(
    shouldApplyConversationRegistrationResult({
      requestCycleId: 'cycle-a',
      requestConversationKey: 'phone:5547999990001',
      currentCycleId: null,
      currentConversationKey: undefined,
    }),
    false,
  )
})

test('buildConversationRegistrationKey combina cycle_id e conversation_key de forma estável', () => {
  const key1 = buildConversationRegistrationKey({ cycleId: 'cycle-a', conversationKey: 'phone:5547999990001' })
  const key2 = buildConversationRegistrationKey({ cycleId: 'cycle-a', conversationKey: 'phone:5547999990001' })
  const key3 = buildConversationRegistrationKey({ cycleId: 'cycle-a', conversationKey: 'phone:5547999990002' })

  assert.equal(key1, key2)
  assert.notEqual(key1, key3)
})
