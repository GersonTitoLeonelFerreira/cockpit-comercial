;(function initYolenManyChatCaptureBootstrap(root) {
  'use strict'

  // Ponto de entrada real do runtime de captura ManyChat: só faz alguma
  // coisa se o kill switch (manychat-feature-flags.js) estiver ligado.
  // Enquanto MANYCHAT_CAPTURE_ENABLED for false, este arquivo carrega e
  // não faz nada — nenhuma leitura de DOM além da checagem da flag,
  // nenhuma mensagem para o background, nenhum tráfego de rede.
  const flags = root.YolenManyChatFeatureFlags
  if (!flags || flags.MANYCHAT_CAPTURE_ENABLED !== true) {
    return
  }

  const runtimeApi = root.YolenManyChatCaptureRuntime
  if (!runtimeApi || typeof runtimeApi.createManyChatCaptureRuntime !== 'function') {
    return
  }

  // Únicos seletores validados ao vivo (A → B → A, com evidência de
  // autoria/identidade/conteúdo/áudio real) até esta versão. channel e
  // assignment ficam de fora deliberadamente: nenhuma evidência de DOM ou
  // de estado interno foi encontrada para nenhum dos dois, e
  // manychat-adapter.js não os exige mais (são metadados informativos,
  // nunca usados por autorização ou pela ingestão de captura).
  const SELECTORS = Object.freeze({
    conversationRoot: 'div[data-test-id="chat-messages-list"]',
    messages: ':scope > div > div[data-title-at][data-title-offset-bottom][data-title]',
  })

  function extensionApi() {
    return root.browser ?? root.chrome
  }

  function sendMessage(message) {
    const api = extensionApi()
    if (!api?.runtime || typeof api.runtime.sendMessage !== 'function') {
      return Promise.reject(new Error('runtime.sendMessage indisponível.'))
    }

    if (root.browser?.runtime?.sendMessage) {
      return root.browser.runtime.sendMessage(message)
    }

    return new Promise((resolve, reject) => {
      try {
        api.runtime.sendMessage(message, (response) => {
          const runtimeError = api.runtime.lastError
          if (runtimeError) {
            reject(new Error(runtimeError.message || 'Falha no runtime da extensão.'))
            return
          }
          resolve(response)
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  const runtime = runtimeApi.createManyChatCaptureRuntime({
    selectors: SELECTORS,
    sendMessage,
  })

  runtime.start()

  root.__YOLEN_MANYCHAT_CAPTURE_RUNTIME__ = runtime
})(typeof globalThis !== 'undefined' ? globalThis : this)
