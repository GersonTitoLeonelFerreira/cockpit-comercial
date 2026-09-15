;(function initYolenManyChatMessageProfile(root) {
  'use strict'

  const PLATFORM = 'manychat'

  function identityApi() {
    const api = root.YolenManyChatMessageIdentity
    if (!api || typeof api.extractManyChatMessageIdentity !== 'function') {
      const error = new Error('YolenManyChatMessageIdentity ausente.')
      error.name = 'YolenManyChatMessageProfileError'
      error.code = 'IDENTITY_UNAVAILABLE'
      throw error
    }
    return api
  }

  function contentApi() {
    const api = root.YolenManyChatMessageContent
    if (!api || typeof api.extractManyChatMessageContent !== 'function') {
      const error = new Error('YolenManyChatMessageContent ausente.')
      error.name = 'YolenManyChatMessageProfileError'
      error.code = 'CONTENT_UNAVAILABLE'
      throw error
    }
    return api
  }

  function buildMessageKey(nativeMessageId) {
    const value = typeof nativeMessageId === 'string' ? nativeMessageId.trim() : ''
    return value ? `${PLATFORM}:${encodeURIComponent(value)}` : null
  }

  // Lê uma mensagem elegível para captura a partir do wrapper DOM já
  // validado por manychat-message-semantics/identity/content. Usado como
  // profile.readMessage pelo manychat-dom-reader genérico.
  //
  // Retorna null para um nó que NÃO é elegível para virar mensagem
  // canônica nesta versão — o dom reader trata null como "pular este nó",
  // nunca como erro de lote (uma conversa real mistura mensagens elegíveis
  // com outras que ainda não têm evidência suficiente). Isso acontece
  // sempre que:
  //
  // - author_kind = automation: mensagens de automação/flow do ManyChat
  //   não possuem identidade nativa (data-mid) estável comprovada (ver
  //   manychat-message-identity.js) — nunca são persistidas como mensagem
  //   canônica nesta versão, para não arriscar histórico comercial falso
  //   (uma automação nunca pode contar como ação do vendedor ou decisão
  //   do cliente).
  // - author_kind = unknown, identidade nativa ausente/ambígua, ou
  //   conteúdo ainda não classificável (mídia visual não suportada, áudio
  //   ambíguo etc.): evidência insuficiente — fail closed, nunca inventa
  //   dado a partir de posição no DOM, texto ou timestamp isolado.
  function readManyChatMessage(node) {
    const content = contentApi().extractManyChatMessageContent(node)

    if (content.content_ready !== true) {
      return null
    }

    const identity = identityApi().extractManyChatMessageIdentity(node)
    const messageKey = buildMessageKey(identity.native_message_id)

    if (!messageKey || typeof identity.occurred_at !== 'string') {
      return null
    }

    return {
      message_key: messageKey,
      direction: identity.direction,
      author_kind: identity.author_kind,
      occurred_at: identity.occurred_at,
      content_type: content.content_type,
      text_content: content.text_content,
      audio_transcription: content.audio_transcription,
      is_deleted: false,
      deletion_reason: null,
    }
  }

  const api = Object.freeze({
    PLATFORM,
    buildMessageKey,
    readManyChatMessage,
  })

  root.YolenManyChatMessageProfile = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
