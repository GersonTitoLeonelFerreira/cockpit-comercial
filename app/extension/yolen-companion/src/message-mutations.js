/* global module */

;(function initYolenCompanionMessageMutations(root) {
  const MAX_CAPTURED_MESSAGE_LENGTH = 100000
  const MAX_ANALYSIS_MESSAGE_LENGTH = 4000

  function normalizeText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u200e/g, '')
      .split('\n')
      .map((line) => {
        return line
          .replace(/[ \t\f\v]+/g, ' ')
          .trim()
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  function readCapturedElementText(
    element,
  ) {
    if (!element) {
      return ''
    }

    const renderedText =
      typeof element.innerText ===
      'string'
        ? element.innerText
        : ''

    if (renderedText.trim()) {
      return renderedText
    }

    if (
      typeof element.cloneNode ===
      'function'
    ) {
      const clone =
        element.cloneNode(true)

      clone
        .querySelectorAll?.('br')
        .forEach((lineBreak) => {
          lineBreak.replaceWith?.(
            '\n',
          )
        })

      if (
        typeof clone.textContent ===
        'string'
      ) {
        return clone.textContent
      }
    }

    return typeof element.textContent ===
      'string'
      ? element.textContent
      : ''
  }


  function cleanCapturedMessageText(value) {
    const text = normalizeText(value)

    if (
      !text ||
      /^(\d{1,2}:\d{2}\s*)+$/.test(text)
    ) {
      return ''
    }

    return text.slice(
      0,
      MAX_CAPTURED_MESSAGE_LENGTH,
    )
  }

  function prepareCapturedMessageTextForAnalysis(
    value,
  ) {
    return cleanCapturedMessageText(
      value,
    ).slice(
      0,
      MAX_ANALYSIS_MESSAGE_LENGTH,
    )
  }

  function pickCapturedMessageText(
    candidates,
  ) {
    if (!Array.isArray(candidates)) {
      return ''
    }

    const normalizedCandidates =
      candidates
        .map((candidate) => {
          if (
            typeof candidate ===
            'string'
          ) {
            return {
              text:
                cleanCapturedMessageText(
                  candidate,
                ),
              isQuoted: false,
            }
          }

          return {
            text:
              cleanCapturedMessageText(
                candidate?.text,
              ),
            isQuoted:
              candidate?.isQuoted ===
              true,
          }
        })
        .filter((candidate) => {
          return (
            !candidate.isQuoted &&
            candidate.text
          )
        })

    if (
      normalizedCandidates.length === 0
    ) {
      return ''
    }

    const uniqueTexts =
      Array.from(
        new Set(
          normalizedCandidates.map(
            (candidate) =>
              candidate.text,
          ),
        ),
      )

    uniqueTexts.sort(
      (first, second) =>
        second.length - first.length,
    )

    return uniqueTexts[0] || ''
  }

  function buildStableCaptureConversationKey(
    {
      phone,
      title,
    } = {},
  ) {
    const normalizedPhone =
      String(phone || '')
        .replace(/\D/g, '')

    if (
      normalizedPhone.length >= 10 &&
      normalizedPhone.length <= 15
    ) {
      return `phone:${normalizedPhone}`
    }

    const normalizedTitle =
      normalizeText(title)
        .toLocaleLowerCase('pt-BR')
        .slice(0, 200)

    return normalizedTitle
      ? `title:${normalizedTitle}`
      : null
  }

  function inferCapturedMessageDirection(
    {
      hasOutgoingClass = false,
      hasIncomingClass = false,
      dataId = '',
      messageLeft,
      messageWidth,
      conversationLeft,
      conversationWidth,
    } = {},
  ) {
    if (hasOutgoingClass) {
      return 'outgoing'
    }

    if (hasIncomingClass) {
      return 'incoming'
    }

    const normalizedDataId =
      String(dataId || '')

    if (
      normalizedDataId.startsWith(
        'true_',
      ) ||
      normalizedDataId.includes(
        '_true_',
      )
    ) {
      return 'outgoing'
    }

    if (
      normalizedDataId.startsWith(
        'false_',
      ) ||
      normalizedDataId.includes(
        '_false_',
      )
    ) {
      return 'incoming'
    }

    const geometry = [
      messageLeft,
      messageWidth,
      conversationLeft,
      conversationWidth,
    ].map(Number)

    if (
      geometry.every(
        Number.isFinite,
      ) &&
      geometry[1] > 0 &&
      geometry[3] > 0
    ) {
      const messageCenter =
        geometry[0] +
        geometry[1] / 2

      const conversationCenter =
        geometry[2] +
        geometry[3] / 2

      return messageCenter >
        conversationCenter
        ? 'outgoing'
        : 'incoming'
    }

    return 'incoming'
  }

  function isDeletedMessageText(value) {
    const text = normalizeText(
      value,
    ).toLowerCase()

    if (!text) {
      return false
    }

    return [
      'mensagem apagada',
      'esta mensagem foi apagada',
      'você apagou esta mensagem',
      'this message was deleted',
      'you deleted this message',
    ].some((deletedText) =>
      text.includes(deletedText),
    )
  }

  function areCapturedMessagesEqual(
    currentMessage,
    nextMessage,
  ) {
    if (!currentMessage || !nextMessage) {
      return false
    }

    return (
      currentMessage.id ===
        nextMessage.id &&
      currentMessage.timestampMs ===
        nextMessage.timestampMs &&
      currentMessage.timestampLabel ===
        nextMessage.timestampLabel &&
      currentMessage.dateKey ===
        nextMessage.dateKey &&
      currentMessage.direction ===
        nextMessage.direction &&
      currentMessage.sender ===
        nextMessage.sender &&
      currentMessage.text ===
        nextMessage.text &&
      currentMessage.hasAudio ===
        nextMessage.hasAudio
    )
  }

  function getLatestDateMessageBlock(
    messages,
    limit = 80,
  ) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return []
    }

    const latestMessage =
      messages[messages.length - 1]

    const latestDateKey =
      latestMessage?.dateKey ||
      latestMessage?.date_key ||
      null

    const latestMessages =
      latestDateKey
        ? messages.filter((message) => {
            return (
              message?.dateKey ===
                latestDateKey ||
              message?.date_key ===
                latestDateKey
            )
          })
        : messages

    return latestMessages.slice(
      -Math.max(1, Number(limit) || 80),
    )
  }

  function buildFingerprint(value) {
    const text = String(value || '')
      .replace(/\r\n/g, '\n')
      .trim()

    let hash = 2166136261

    for (
      let index = 0;
      index < text.length;
      index += 1
    ) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }

    return `${text.length}:${(
      hash >>> 0
    ).toString(16)}`
  }

  function buildMessageSnapshotFingerprint(
    messages,
    deletedMessageIds = [],
  ) {
    const messageLines = Array.isArray(
      messages,
    )
      ? messages.map((message) => {
          return [
            message?.id || '',
            message?.timestamp_ms ??
              message?.timestampMs ??
              '',
            message?.direction || '',
            message?.text || '',
            message?.audio_transcription ||
              '',
            message?.has_audio ??
              message?.hasAudio ??
              false,
          ].join('|')
        })
      : []

    const deletedLines = Array.from(
      deletedMessageIds || [],
    )
      .map((id) => String(id || '').trim())
      .filter(Boolean)
      .sort()
      .map((id) => `deleted|${id}`)

    const source = [
      ...messageLines,
      ...deletedLines,
    ].join('\n')

    if (source.length < 15) {
      return null
    }

    return buildFingerprint(source)
  }

  // Blocker 2 (Fase 12A, Frente 2B, re-auditoria do Controle Mestre):
  // a antiga findSafeDisappearedMessageIds() foi removida. Ela tentava
  // inferir exclusão a partir do desaparecimento de um elemento do DOM
  // (rolagem/virtualização do WhatsApp Web), mas isso nunca prova
  // exclusão real — o único sinal confiável é o marcador explícito de
  // exclusão do próprio WhatsApp (isDeletedMessageText). Uma mensagem
  // que só sai da consulta atual do DOM permanece ativa e intocada.

  const api = Object.freeze({
    areCapturedMessagesEqual,
    buildMessageSnapshotFingerprint,
    buildStableCaptureConversationKey,
    cleanCapturedMessageText,
    getLatestDateMessageBlock,
    inferCapturedMessageDirection,
    isDeletedMessageText,
    pickCapturedMessageText,
    prepareCapturedMessageTextForAnalysis,
    readCapturedElementText,
  })

  root.YolenCompanionMessageMutations =
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
    : window,
)
