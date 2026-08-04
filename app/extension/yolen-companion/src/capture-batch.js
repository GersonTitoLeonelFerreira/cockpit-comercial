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
      const CONTRACT_VERSION = 'pt4-c-v4'
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

      function normalizeObservedAt(value) {
        if (typeof value !== 'string') {
          return null
        }

        return normalizeOccurredAt(
          Date.parse(value),
        )
      }

      function normalizeBaseVersion(value) {
        if (typeof value !== 'string') {
          return null
        }

        const normalized = value.trim()

        return /^[1-9][0-9]*$/.test(
          normalized,
        )
          ? normalized
          : null
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

      function getAudioTranscriptionEntry(
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

        return isRecord(entry)
          ? entry
          : null
      }

      function getLatestObservedAt(
        ...values
      ) {
        const normalizedValues = values
          .map((value) =>
            normalizeObservedAt(value),
          )
          .filter(Boolean)
          .sort()

        return normalizedValues.length > 0
          ? normalizedValues[
              normalizedValues.length - 1
            ]
          : null
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

        const hasAudio =
          message.hasAudio === true

        const transcriptionEntry =
          hasAudio
            ? getAudioTranscriptionEntry(
                messageKey,
                transcriptionsByKey,
              )
            : null

        const observedAt =
          getLatestObservedAt(
            message.observedAt,
            transcriptionEntry?.occurredAt,
          )

        if (
          !messageKey ||
          !occurredAt ||
          !observedAt
        ) {
          return null
        }

        const textContent =
          normalizeNullableText(
            message.text,
          )

        const audioTranscription =
          hasAudio
            ? normalizeNullableText(
                transcriptionEntry?.text,
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
          observed_at: observedAt,
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

        const observedAt =
          normalizeObservedAt(
            message.observedAt,
          )

        if (
          !messageKey ||
          !occurredAt ||
          !observedAt
        ) {
          return null
        }

        return {
          message_key: messageKey,
          direction:
            normalizeDirection(
              message.direction,
            ),
          occurred_at: occurredAt,
          observed_at: observedAt,
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
        baseVersionsByMessageKey = {},
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
                const messageWithBaseVersion = {
                  ...normalized,
                  base_version:
                    normalizeBaseVersion(
                      baseVersionsByMessageKey[
                        normalized.message_key
                      ],
                    ),
                }

                messagesByKey.set(
                  messageWithBaseVersion
                    .message_key,
                  messageWithBaseVersion,
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
                const messageWithBaseVersion = {
                  ...normalized,
                  base_version:
                    normalizeBaseVersion(
                      baseVersionsByMessageKey[
                        normalized.message_key
                      ],
                    ),
                }

                messagesByKey.set(
                  messageWithBaseVersion
                    .message_key,
                  messageWithBaseVersion,
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
        const messageStates =
          Array.isArray(messages)
            ? messages.map((message) => {
                return [
                  message.message_key,
                  message.direction,
                  message.occurred_at,
                  message.base_version,
                  message.content_type,
                  message.text_content,
                  message.audio_transcription,
                  message.is_deleted,
                ]
              })
            : []

        return fingerprintText(
          JSON.stringify([
            cycleId,
            conversationKey,
            messageStates,
          ]),
        )
      }

      function buildCaptureIngestionPlan({
        cycleId,
        conversationKey,
        activeMessages = [],
        deletedMessages = [],
        transcriptionsByKey = {},
        baseVersionsByMessageKey = {},
        maxBatchSize =
          DEFAULT_MAX_BATCH_SIZE,
      } = {}) {
        const normalizedCycleId =
          normalizeRequiredText(cycleId)

        const normalizedConversationKey =
          normalizeRequiredText(
            conversationKey,
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

        const messages =
          buildCaptureMessages({
            activeMessages,
            deletedMessages,
            transcriptionsByKey,
            baseVersionsByMessageKey,
          })

        const normalizedObservedAt =
          messages.reduce(
            (latestObservedAt, message) => {
              const messageObservedAt =
                normalizeObservedAt(
                  message.observed_at,
                )

              if (!messageObservedAt) {
                return latestObservedAt
              }

              if (
                !latestObservedAt ||
                messageObservedAt >
                  latestObservedAt
              ) {
                return messageObservedAt
              }

              return latestObservedAt
            },
            null,
          )

        if (
          messages.length > 0 &&
          !normalizedObservedAt
        ) {
          throw new Error(
            'As mensagens da captura precisam possuir um instante de observação válido.',
          )
        }

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
