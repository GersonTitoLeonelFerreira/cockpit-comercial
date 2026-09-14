;(function initYolenManyChatAdapter(root) {
  'use strict'

  const PLATFORM = 'manychat'

  function createManyChatAdapter() {
    return Object.freeze({
      getPlatform() {
        return PLATFORM
      },
    })
  }

  const api = Object.freeze({
    PLATFORM,
    createManyChatAdapter,
  })

  root.YolenManyChatAdapter = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
