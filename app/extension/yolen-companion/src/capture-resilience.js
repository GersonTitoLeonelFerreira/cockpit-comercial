;(function initYolenCompanionCaptureResilience(
  root,
  factory,
) {
  const api = factory(root)

  if (
    typeof module !== 'undefined' &&
    module.exports
  ) {
    module.exports = api
  }

  root.YolenCompanionCaptureResilience =
    api
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : this,
  function createYolenCompanionCaptureResilience(
    root,
  ) {
    const DEFAULT_RETRY_DELAY_MS = 1000
    const MAX_RETRY_DELAY_MS = 30000
    const MAX_TRACKED_CONVERSATIONS = 100

    function normalizeRequiredText(value) {
      if (typeof value !== 'string') {
        return null
      }

      const normalized = value.trim()

      return normalized || null
    }

    function normalizePositiveVersion(value) {
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

    function isSuccessfulResult(result) {
      return Boolean(
        result?.ok === true &&
        result?.payload?.ok === true,
      )
    }

    function isRetryableResult(result) {
      const statusCode = Number(
        result?.statusCode || 0,
      )

      return (
        statusCode === 0 ||
        statusCode === 401 ||
        statusCode >= 500
      )
    }

    function buildFailureResult(error) {
      return {
        ok: false,
        statusCode: 0,
        payload: {
          ok: false,
          error:
            error instanceof Error &&
            error.message
              ? error.message
              : 'Falha transitória ao consultar a Yolen.',
        },
      }
    }

    function sleep(
      delayMs,
      timerRoot = root,
    ) {
      return new Promise((resolve) => {
        timerRoot.setTimeout(
          resolve,
          delayMs,
        )
      })
    }

    async function resolveLeadWithRetry(
      resolveLead,
      payload,
      options = {},
    ) {
      const maxAttempts =
        options.maxAttempts === Infinity
          ? Infinity
          : Number.isInteger(
                options.maxAttempts,
              ) &&
              options.maxAttempts > 0
            ? options.maxAttempts
            : 5

      const baseDelayMs =
        Number.isFinite(
          options.baseDelayMs,
        ) &&
        options.baseDelayMs >= 0
          ? options.baseDelayMs
          : DEFAULT_RETRY_DELAY_MS

      const maxDelayMs =
        Number.isFinite(
          options.maxDelayMs,
        ) &&
        options.maxDelayMs >=
          baseDelayMs
          ? options.maxDelayMs
          : MAX_RETRY_DELAY_MS

      const sleepFn =
        typeof options.sleepFn ===
        'function'
          ? options.sleepFn
          : (delayMs) =>
              sleep(delayMs)

      let attempt = 0

      while (attempt < maxAttempts) {
        attempt += 1

        let result

        try {
          result = await resolveLead(
            payload,
          )
        } catch (error) {
          result = buildFailureResult(
            error,
          )
        }

        if (
          isSuccessfulResult(result) ||
          !isRetryableResult(result) ||
          attempt >= maxAttempts
        ) {
          return result
        }

        const retryDelay = Math.min(
          maxDelayMs,
          baseDelayMs *
            2 ** Math.min(
              attempt - 1,
              10,
            ),
        )

        await sleepFn(retryDelay)
      }

      return buildFailureResult(
        new Error(
          'A consulta do lead não pôde ser concluída.',
        ),
      )
    }

    function createCaptureCoordinator() {
      const statesByConversation =
        new Map()

      function getConversationState(
        conversationKey,
      ) {
        const normalizedConversationKey =
          normalizeRequiredText(
            conversationKey,
          )

        if (!normalizedConversationKey) {
          return null
        }

        let conversationState =
          statesByConversation.get(
            normalizedConversationKey,
          )

        if (!conversationState) {
          conversationState = new Map()

          statesByConversation.set(
            normalizedConversationKey,
            conversationState,
          )
        } else {
          statesByConversation.delete(
            normalizedConversationKey,
          )

          statesByConversation.set(
            normalizedConversationKey,
            conversationState,
          )
        }

        if (
          statesByConversation.size >
          MAX_TRACKED_CONVERSATIONS
        ) {
          const oldestConversationKey =
            statesByConversation
              .keys()
              .next()
              .value

          if (oldestConversationKey) {
            statesByConversation.delete(
              oldestConversationKey,
            )
          }
        }

        return conversationState
      }

      function getMessageState(
        conversationKey,
        messageKey,
      ) {
        const conversationState =
          getConversationState(
            conversationKey,
          )

        const normalizedMessageKey =
          normalizeRequiredText(
            messageKey,
          )

        if (
          !conversationState ||
          !normalizedMessageKey
        ) {
          return null
        }

        let messageState =
          conversationState.get(
            normalizedMessageKey,
          )

        if (!messageState) {
          messageState = {
            currentVersion: null,
            confirmedVersions:
              new Set(),
          }

          conversationState.set(
            normalizedMessageKey,
            messageState,
          )
        }

        return messageState
      }

      function recordResponse(
        conversationKey,
        messageResults,
      ) {
        if (!Array.isArray(messageResults)) {
          return
        }

        messageResults.forEach(
          (result) => {
            if (result?.synced !== true) {
              return
            }

            const messageKey =
              normalizeRequiredText(
                result.message_key,
              )

            const canonicalVersion =
              normalizePositiveVersion(
                result.canonical_version,
              )

            if (
              !messageKey ||
              !canonicalVersion
            ) {
              return
            }

            const messageState =
              getMessageState(
                conversationKey,
                messageKey,
              )

            if (!messageState) {
              return
            }

            messageState.currentVersion =
              canonicalVersion

            messageState.confirmedVersions.add(
              canonicalVersion,
            )
          },
        )
      }

      function preparePayload(payload) {
        const conversationKey =
          normalizeRequiredText(
            payload?.conversation_key,
          )

        if (
          !conversationKey ||
          !Array.isArray(
            payload?.messages,
          )
        ) {
          return payload
        }

        let changed = false

        const messages =
          payload.messages.map(
            (message) => {
              const messageKey =
                normalizeRequiredText(
                  message?.message_key,
                )

              const baseVersion =
                normalizePositiveVersion(
                  message?.base_version,
                )

              if (
                !messageKey ||
                !baseVersion
              ) {
                return message
              }

              const messageState =
                getMessageState(
                  conversationKey,
                  messageKey,
                )

              if (
                !messageState
                  ?.currentVersion ||
                messageState
                  .currentVersion ===
                  baseVersion ||
                !messageState
                  .confirmedVersions
                  .has(baseVersion)
              ) {
                return message
              }

              changed = true

              return {
                ...message,
                base_version:
                  messageState
                    .currentVersion,
              }
            },
          )

        return changed
          ? {
              ...payload,
              messages,
            }
          : payload
      }

      return {
        preparePayload,
        recordResponse,
      }
    }

    function daysInMonth(
      year,
      month,
    ) {
      return new Date(
        year,
        month,
        0,
      ).getDate()
    }

    function normalize12HourParts({
      month,
      day,
      year,
      hour,
      minute,
      second,
      meridiem,
      includeSeconds,
    }) {
      let normalizedYear =
        Number(year)
      const normalizedMonth =
        Number(month)
      const normalizedDay =
        Number(day)
      const normalizedHour =
        Number(hour)
      const normalizedMinute =
        Number(minute)
      const normalizedSecond =
        Number(second || 0)
      const normalizedMeridiem =
        String(meridiem || '')
          .trim()
          .toUpperCase()

      if (normalizedYear < 100) {
        normalizedYear += 2000
      }

      if (
        !Number.isInteger(
          normalizedYear,
        ) ||
        normalizedYear < 1 ||
        normalizedMonth < 1 ||
        normalizedMonth > 12 ||
        normalizedDay < 1 ||
        normalizedDay >
          daysInMonth(
            normalizedYear,
            normalizedMonth,
          ) ||
        normalizedHour < 1 ||
        normalizedHour > 12 ||
        normalizedMinute < 0 ||
        normalizedMinute > 59 ||
        normalizedSecond < 0 ||
        normalizedSecond > 59 ||
        !['AM', 'PM'].includes(
          normalizedMeridiem,
        )
      ) {
        return null
      }

      let hour24 =
        normalizedHour % 12

      if (
        normalizedMeridiem === 'PM'
      ) {
        hour24 += 12
      }

      const timeParts = [
        String(hour24).padStart(
          2,
          '0',
        ),
        String(normalizedMinute).padStart(
          2,
          '0',
        ),
      ]

      if (includeSeconds) {
        timeParts.push(
          String(normalizedSecond).padStart(
            2,
            '0',
          ),
        )
      }

      return [
        timeParts.join(':'),
        [
          String(normalizedDay).padStart(
            2,
            '0',
          ),
          String(normalizedMonth).padStart(
            2,
            '0',
          ),
          String(normalizedYear).padStart(
            4,
            '0',
          ),
        ].join('/'),
      ].join(', ')
    }

    function normalizeWhatsAppPrePlainText(
      value,
    ) {
      if (typeof value !== 'string') {
        return value
      }

      const timeFirstPattern =
        /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\s*,\s*(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\]/i

      const dateFirstPattern =
        /\[(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\s*,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\]/i

      const timeFirstMatch =
        value.match(timeFirstPattern)

      if (timeFirstMatch) {
        const normalized =
          normalize12HourParts({
            hour: timeFirstMatch[1],
            minute: timeFirstMatch[2],
            second: timeFirstMatch[3],
            meridiem:
              timeFirstMatch[4],
            month: timeFirstMatch[5],
            day: timeFirstMatch[6],
            year: timeFirstMatch[7],
            includeSeconds:
              Boolean(
                timeFirstMatch[3],
              ),
          })

        return normalized
          ? value.replace(
              timeFirstMatch[0],
              `[${normalized}]`,
            )
          : value
      }

      const dateFirstMatch =
        value.match(dateFirstPattern)

      if (dateFirstMatch) {
        const normalized =
          normalize12HourParts({
            month: dateFirstMatch[1],
            day: dateFirstMatch[2],
            year: dateFirstMatch[3],
            hour: dateFirstMatch[4],
            minute: dateFirstMatch[5],
            second: dateFirstMatch[6],
            meridiem:
              dateFirstMatch[7],
            includeSeconds:
              Boolean(
                dateFirstMatch[6],
              ),
          })

        return normalized
          ? value.replace(
              dateFirstMatch[0],
              `[${normalized}]`,
            )
          : value
      }

      return value
    }

    return {
      createCaptureCoordinator,
      isRetryableResult,
      normalizeWhatsAppPrePlainText,
      resolveLeadWithRetry,
    }
  },
)
