/* global module */

;(function initYolenCompanionMessageMutations(root) {
  const MAX_CAPTURED_MESSAGE_LENGTH = 4000

  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\u200e/g, '')
      .trim()
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

  const api = Object.freeze({
    areCapturedMessagesEqual,
    buildMessageSnapshotFingerprint,
    cleanCapturedMessageText,
    getLatestDateMessageBlock,
    isDeletedMessageText,
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
