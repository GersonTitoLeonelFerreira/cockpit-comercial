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

  const panelMountApi = root.YolenManyChatPanelMount

  // Textos honestos: nunca reivindicam mais do que o Companion sabe de
  // verdade nesta versão. O painel completo (AGORA/ANÁLISE/CLIENTE) ainda
  // não está ligado — isto é só o status de identificação do contato, que
  // já reflete a MESMA resolução usada para decidir se a captura acontece.
  const STATUS_LABELS = Object.freeze({
    identity_not_ready: 'Yolen · aguardando identidade do ManyChat…',
    CONTACT_NOT_LINKED: 'Yolen · contato ainda não vinculado a um lead',
    NOT_FOUND: 'Yolen · lead não encontrado nesta empresa',
    OWNED_BY_OTHER: 'Yolen · lead pertence a outro vendedor',
    IN_POOL: 'Yolen · lead está no Pool',
    CLOSED_CYCLE: 'Yolen · lead com apenas ciclo fechado',
    LEAD_WITHOUT_CYCLE: 'Yolen · lead sem ciclo comercial ativo',
    SOFT_DELETED: 'Yolen · lead arquivado ou excluído',
    MULTIPLE_MATCHES: 'Yolen · mais de um lead encontrado',
  })

  function renderStatus(resolution) {
    if (!panelMountApi) return

    if (!resolution) {
      panelMountApi.setPanelContent('<div class="yolen-status">Yolen · carregando…</div>')
      return
    }

    if (resolution.ready === true) {
      panelMountApi.setPanelContent('<div class="yolen-status">Yolen · lead identificado</div>')
      return
    }

    const label = STATUS_LABELS[resolution.reason] ?? `Yolen · ${resolution.reason ?? 'status desconhecido'}`
    panelMountApi.setPanelContent(`<div class="yolen-status">${label}</div>`)
  }

  function syncPanel(conversationKey) {
    if (!panelMountApi) return

    panelMountApi.syncPanelVisibility()

    if (!panelMountApi.isConversationOpen(root.document)) return

    const state = conversationKey ? runtime.getConversationState(conversationKey) : null
    renderStatus(state?.resolution ?? null)
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
    onEvent(event) {
      if (event?.type === 'reader_event') {
        syncPanel(event.event?.conversation_key ?? null)
      } else if (event?.type === 'capture_result') {
        syncPanel(event.result?.conversation_key ?? null)
      }
    },
  })

  runtime.start()
  syncPanel(null)

  root.__YOLEN_MANYCHAT_CAPTURE_RUNTIME__ = runtime
})(typeof globalThis !== 'undefined' ? globalThis : this)
