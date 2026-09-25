;(function initYolenManyChatCompanion(root) {
  'use strict'

  // FASE 7 — content script do ManyChat: cria o ManyChatAdapter
  // (manychat-channel-adapter.js) e entrega a composição ao MESMO bootstrap
  // compartilhado do WhatsApp (companion-bootstrap.js), que monta o Companion
  // Core único com os mesmos controllers e views. Nenhuma decisão comercial,
  // de copy ou de apresentação acontece aqui.
  //
  // Kill switch (manychat-feature-flags.js): com a flag desligada (builds
  // normais) nada é criado — sem adapter, sem painel, sem rede.
  const flags = root.YolenManyChatFeatureFlags

  if (flags?.MANYCHAT_CAPTURE_ENABLED !== true) {
    return
  }

  // Isolamento A → B: a fronteira canônica de conversa compartilhada é
  // pré-condição da composição (o Core é o dono do reset/invalidação).
  if (!root.YolenCompanionConversationBoundary) {
    throw new Error(
      'Fronteira canônica de conversa do Companion não carregada.',
    )
  }

  const channelAdapter =
    root.YolenManyChatChannelAdapter.create()

  root.YolenCompanionBootstrap
    .create({
      channelAdapter,
    })
    .start()
})(typeof globalThis !== 'undefined' ? globalThis : this)
