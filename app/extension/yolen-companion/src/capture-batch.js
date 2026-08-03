;(function initYolenCompanionCaptureBatch(root, factory) {
    const api = factory()

    if (
      typeof module !== 'undefined' &&
      module.exports
    ) {
      module.exports = api
    }

    root.YolenCompanionCaptureBatch = api
  })(
    typeof globalThis !== 'undefined'
      ? globalThis
      : this,
    function createYolenCompanionCaptureBatch() {
      const CONTRACT_VERSION = 'pt4-c-v2'
      const DEFAULT_MAX_BATCH_SIZE = 200

      function isRecord(value) {
        return (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        )
      }

      function normalizeRequiredText(value) {
        if (typeof value !== 'string') {
          return null
        }

        const normalized = value.trim()

        return normalized || null
      }

      function normalizeNullableText(value) {
        if (typeof value !== 'string') {
          return null
        }

        const normalized = value.trim()

        return normalized || null
      }

      function normalizeOccurredAt(timestampMs) {
        const normalized = Number(timestampMs)

        if (
          !Number.isFinite(normalized) ||
          normalized <= 0
        ) {
          return null
        }

        const date = new Date(normalized)

        if (
          !Number.isFinite(date.getTime())
        ) {
          return null
        }

        return date.toISOString()
      }

      function normalizeDirection(value) {
        return value === 'outgoing'
          ? 'outgoing'
          : 'incoming'
      }

      function isCaptureResolutionEligible(
        resolution,
      ) {
        if (!isRecord(resolution)) {
          return false
        }

        const cycle =
          isRecord(resolution.cycle)
            ? resolution.cycle
            : null

        const actions =
          isRecord(resolution.actions)
            ? resolution.actions
            : null

        const flags =
          isRecord(resolution.flags)
            ? resolution.flags
            : null

        return Boolean(
          normalizeRequiredText(
            cycle?.id,
          ) &&
          actions
            ?.can_analyze_conversation ===
            true &&
          flags?.is_closed !== true &&
          resolution.status !==
            'CLOSED_CYCLE',
        )
      }

      function getAudioTranscription(
        messageKey,
        transcriptionsByKey,
      ) {
        if (!isRecord(transcriptionsByKey)) {
          return null
        }

        const entry = Object.values(
          transcriptionsByKey,
        ).find((transcription) => {
          return (
            transcription?.targetKey ===
            messageKey
          )
        })

        return normalizeNullableText(
          entry?.text,
        )
      }

      function buildActiveCaptureMessage(
        message,
        transcriptionsByKey,
      ) {
        if (!isRecord(message)) {
          return null
        }

        const messageKey =
          normalizeRequiredText(
            message.id,
          )

        const occurredAt =
          normalizeOccurredAt(
            message.timestampMs,
          )

        if (!messageKey || !occurredAt) {
          return null
        }

        const hasAudio =
          message.hasAudio === true

        const textContent =
          normalizeNullableText(
            message.text,
          )

        const audioTranscription =
          hasAudio
            ? getAudioTranscription(
                messageKey,
                transcriptionsByKey,
              )
            : null

        if (!hasAudio && !textContent) {
          return null
        }

        return {
          message_key: messageKey,
          direction:
            normalizeDirection(
              message.direction,
            ),
          occurred_at: occurredAt,
          content_type:
            hasAudio ? 'audio' : 'text',
          text_content: textContent,
          audio_transcription:
            audioTranscription,
          is_deleted: false,
        }
      }

      function buildDeletedCaptureMessage(
        message,
      ) {
        if (!isRecord(message)) {
          return null
        }

        const messageKey =
          normalizeRequiredText(
            message.id,
          )

        const occurredAt =
          normalizeOccurredAt(
            message.timestampMs,
          )

        if (!messageKey || !occurredAt) {
          return null
        }

        return {
          message_key: messageKey,
          direction:
            normalizeDirection(
              message.direction,
            ),
          occurred_at: occurredAt,
          content_type:
            message.hasAudio === true
              ? 'audio'
              : 'text',
          text_content: null,
          audio_transcription: null,
          is_deleted: true,
        }
      }

      function selectCaptureWindow({
        activeMessages = [],
        deletedMessages = [],
        pendingMutationKeys = [],
      } = {}) {
        const safeActiveMessages =
          Array.isArray(activeMessages)
            ? activeMessages
            : []

        const safeDeletedMessages =
          Array.isArray(deletedMessages)
            ? deletedMessages
            : []

        const combinedMessages = [
          ...safeActiveMessages,
          ...safeDeletedMessages,
        ].sort((first, second) => {
          if (
            first.timestampMs !==
            second.timestampMs
          ) {
            return (
              first.timestampMs -
              second.timestampMs
            )
          }

          return String(
            first.id || '',
          ).localeCompare(
            String(second.id || ''),
          )
        })

        if (combinedMessages.length === 0) {
          return {
            activeMessages: [],
            deletedMessages: [],
          }
        }

        const latestDateKey =
          combinedMessages[
            combinedMessages.length - 1
          ].dateKey

        const pendingKeys =
          new Set(
            Array.from(
              pendingMutationKeys || [],
            )
              .map((value) =>
                normalizeRequiredText(value),
              )
              .filter(Boolean),
          )

        const shouldIncludeMessage =
          (message) => {
            return (
              message?.dateKey ===
                latestDateKey ||
              pendingKeys.has(
                message?.id,
              )
            )
          }

        return {
          activeMessages:
            safeActiveMessages.filter(
              shouldIncludeMessage,
            ),
          deletedMessages:
            safeDeletedMessages.filter(
              shouldIncludeMessage,
            ),
        }
      }

      function buildCaptureMessages({
        activeMessages = [],
        deletedMessages = [],
        transcriptionsByKey = {},
      } = {}) {
        const messagesByKey = new Map()

        if (Array.isArray(deletedMessages)) {
          deletedMessages.forEach(
            (message) => {
              const normalized =
                buildDeletedCaptureMessage(
                  message,
                )

              if (normalized) {
                messagesByKey.set(
                  normalized.message_key,
                  normalized,
                )
              }
            },
          )
        }

        if (Array.isArray(activeMessages)) {
          activeMessages.forEach(
            (message) => {
              const normalized =
                buildActiveCaptureMessage(
                  message,
                  transcriptionsByKey,
                )

              if (normalized) {
                messagesByKey.set(
                  normalized.message_key,
                  normalized,
                )
              }
            },
          )
        }

        return Array.from(
          messagesByKey.values(),
        ).sort((first, second) => {
          if (
            first.occurred_at !==
            second.occurred_at
          ) {
            return first.occurred_at.localeCompare(
              second.occurred_at,
            )
          }

          return first.message_key.localeCompare(
            second.message_key,
          )
        })
      }

      function splitCaptureMessages(
        messages,
        maxBatchSize =
          DEFAULT_MAX_BATCH_SIZE,
      ) {
        if (!Array.isArray(messages)) {
          throw new Error(
            'As mensagens da captura precisam formar uma lista.',
          )
        }

        if (
          !Number.isInteger(maxBatchSize) ||
          maxBatchSize <= 0
        ) {
          throw new Error(
            'O limite do lote precisa ser um inteiro positivo.',
          )
        }

        const batches = []

        for (
          let index = 0;
          index < messages.length;
          index += maxBatchSize
        ) {
          batches.push(
            messages.slice(
              index,
              index + maxBatchSize,
            ),
          )
        }

        return batches
      }

      function fingerprintText(value) {
        const text = String(value || '')

        let hash = 2166136261

        for (
          let index = 0;
          index < text.length;
          index += 1
        ) {
          hash ^= text.charCodeAt(index)
          hash = Math.imul(
            hash,
            16777619,
          )
        }

        return `${text.length}:${(
          hash >>> 0
        ).toString(16)}`
      }

      function buildCaptureSnapshotKey({
        cycleId,
        conversationKey,
        messages,
      }) {
        return fingerprintText(
          JSON.stringify([
            cycleId,
            conversationKey,
            messages,
          ]),
        )
      }

      function buildCaptureIngestionPlan({
        cycleId,
        conversationKey,
        observedAt =
          new Date().toISOString(),
        activeMessages = [],
        deletedMessages = [],
        transcriptionsByKey = {},
        maxBatchSize =
          DEFAULT_MAX_BATCH_SIZE,
      } = {}) {
        const normalizedCycleId =
          normalizeRequiredText(cycleId)

          const normalizedConversationKey =
          normalizeRequiredText(
            conversationKey,
          )

        const normalizedObservedAt =
          normalizeOccurredAt(
            Date.parse(observedAt),
          )

        if (!normalizedCycleId) {
          throw new Error(
            'O ciclo comercial da captura é obrigatório.',
          )
        }

        if (!normalizedConversationKey) {
          throw new Error(
            'A chave da conversa da captura é obrigatória.',
          )
        }

        if (!normalizedObservedAt) {
          throw new Error(
            'O instante da observação da captura é inválido.',
          )
        }

        const messages =
          buildCaptureMessages({
            activeMessages,
            deletedMessages,
            transcriptionsByKey,
          })

        const snapshotKey =
          buildCaptureSnapshotKey({
            cycleId: normalizedCycleId,
            conversationKey:
              normalizedConversationKey,
            messages,
          })

        const batches =
          splitCaptureMessages(
            messages,
            maxBatchSize,
          ).map((batchMessages) => {
            return {
              contract_version:
                CONTRACT_VERSION,
              cycle_id:
                normalizedCycleId,
              conversation_key:
                normalizedConversationKey,
              observed_at:
                normalizedObservedAt,
              messages:
                batchMessages,
            }
          })

          return {
            snapshotKey,
            observedAt:
              normalizedObservedAt,
            messages,
            batches,
          }
      }

      return {
        CONTRACT_VERSION,
        DEFAULT_MAX_BATCH_SIZE,
        isCaptureResolutionEligible,
        selectCaptureWindow,
        buildCaptureMessages,
        splitCaptureMessages,
        buildCaptureSnapshotKey,
        buildCaptureIngestionPlan,
      }
    },
  )
