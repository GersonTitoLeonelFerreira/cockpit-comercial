(function initCompanionConversationBoundary(root) {
  'use strict'

  function normalizeOptionalKey(value) {
    return (
      typeof value === 'string' &&
      value.length > 0
        ? value
        : null
    )
  }

  function createConversationBoundary(
    initialContext = {},
  ) {
    let generation = 0

    let conversationKey =
      normalizeOptionalKey(
        initialContext.conversationKey,
      )

    let companyId =
      normalizeOptionalKey(
        initialContext.companyId,
      )

    function createSnapshot() {
      return Object.freeze({
        generation,
        conversationKey,
        companyId,
      })
    }

    function getContext() {
      return createSnapshot()
    }

    function advanceBoundary(
      nextContext = {},
    ) {
      generation += 1

      if (
        Object.prototype.hasOwnProperty.call(
          nextContext,
          'conversationKey',
        )
      ) {
        conversationKey =
          normalizeOptionalKey(
            nextContext.conversationKey,
          )
      }

      if (
        Object.prototype.hasOwnProperty.call(
          nextContext,
          'companyId',
        )
      ) {
        companyId =
          normalizeOptionalKey(
            nextContext.companyId,
          )
      }

      return createSnapshot()
    }

    function captureToken() {
      return createSnapshot()
    }

    function isTokenCurrent(token) {
      return Boolean(
        token &&
        token.generation === generation &&
        token.conversationKey ===
          conversationKey &&
        token.companyId === companyId,
      )
    }

    return Object.freeze({
      getContext,
      advanceBoundary,
      captureToken,
      isTokenCurrent,
    })
  }

  const api = Object.freeze({
    createConversationBoundary,
  })

  root.YolenCompanionConversationBoundary =
    api

  if (
    typeof module !== 'undefined' &&
    module.exports
  ) {
    module.exports = api
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : this,
)
