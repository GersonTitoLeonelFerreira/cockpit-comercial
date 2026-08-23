/* global module */

;(function initYolenCompanionConversationRegistrationTools(root) {
  // "Registrar conversa" — funções puras usadas pelo content-script para
  // garantir que um resultado (sucesso, erro ou preview) só seja aplicado
  // à conversa para a qual ele foi pedido. Isso impede que uma resposta
  // que chega depois de o vendedor trocar de conversa "vaze" para a
  // conversa nova (isolamento entre clientes/ciclos na UI).

  function normalizeKey(value) {
    return typeof value === 'string' ? value.trim() : ''
  }

  function shouldApplyConversationRegistrationResult({
    requestCycleId,
    requestConversationKey,
    currentCycleId,
    currentConversationKey,
  }) {
    const requestCycle = normalizeKey(requestCycleId)
    const requestKey = normalizeKey(requestConversationKey)
    const currentCycle = normalizeKey(currentCycleId)
    const currentKey = normalizeKey(currentConversationKey)

    if (!requestCycle || !requestKey || !currentCycle || !currentKey) {
      return false
    }

    return (
      requestCycle === currentCycle &&
      requestKey === currentKey
    )
  }

  function buildConversationRegistrationKey({
    cycleId,
    conversationKey,
  }) {
    return `${normalizeKey(cycleId)}::${normalizeKey(conversationKey)}`
  }

  const api = Object.freeze({
    shouldApplyConversationRegistrationResult,
    buildConversationRegistrationKey,
  })

  root.YolenCompanionConversationRegistrationTools = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : window,
)
