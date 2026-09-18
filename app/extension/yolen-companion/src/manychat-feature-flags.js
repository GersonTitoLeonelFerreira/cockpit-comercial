;(function initYolenManyChatFeatureFlags(root) {
  'use strict'

  // Kill switch do ManyChat produtivo (captura real + tráfego de rede para
  // o backend Yolen). Constante fixa dentro do content script isolated
  // world: a página do ManyChat não tem acesso a este closure, então não
  // consegue ligar/desligar por conta própria. Para desativar em uma
  // regressão crítica: mude para false e gere um novo pacote — não exige
  // tocar em nenhum outro arquivo.
  //
  // Default seguro: false. Só fica true depois que o E2E real (mensagens,
  // áudio, reasoning, seller-facing, composer) tiver sido validado ao vivo
  // no ManyChat, sem regressão no WhatsApp.
  const MANYCHAT_CAPTURE_ENABLED = false

  const api = Object.freeze({
    MANYCHAT_CAPTURE_ENABLED,
  })

  root.YolenManyChatFeatureFlags = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
