;(function initYolenCompanionNullBaseRebase(
  root,
  factory,
) {
  const api = factory()

  if (
    typeof module !== 'undefined' &&
    module.exports
  ) {
    module.exports = api
  }

  root.YolenCompanionNullBaseRebase = api

  if (
    root.window === root &&
    root.YolenCompanionApi
  ) {
    api.installNullBaseRebaseHotfix(root)
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : this,
  function createYolenCompanionNullBaseRebase() {
    const API_PATCH = Symbol.for(
      'yolen.companion.capture-resilience.null-base-rebase',
    )
    const MAX_TRACKED_CONVERSATIONS = 100
    const MAX_TRACKED_MESSAGES_PER_CONVERSATION = 500

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

    function isNullBaseVersion(value) {
      return (
        value === null ||
        value === undefined
      )
    }

    function isSuccessfulResult(result) {
      return Boolean(
        result?.ok === true &&
          result?.payload?.ok === true,
      )
    }

    function createNullBaseRebaseTracker() {
      const confirmedVersionsByConversation =
        new Map()

      function getConversationVersions(
        conversationKey,
        createIfMissing = false,
      ) {
        const normalizedConversationKey =
          normalizeRequiredText(
            conversationKey,
          )

        if (!normalizedConversationKey) {
          return null
        }

        let versions =
          confirmedVersionsByConversation.get(
            normalizedConversationKey,
          )

        if (!versions && createIfMissing) {
          versions = new Map()
          confirmedVersionsByConversation.set(
            normalizedConversationKey,
            versions,
          )

          if (
            confirmedVersionsByConversation
              .size >
            MAX_TRACKED_CONVERSATIONS
          ) {
            const oldestConversationKey =
              confirmedVersionsByConversation
                .keys()
                .next()
                .value

            if (oldestConversationKey) {
              confirmedVersionsByConversation.delete(
                oldestConversationKey,
              )
            }
          }
        }

        return versions || null
      }

      function preparePayload(payload) {
        const conversationKey =
          normalizeRequiredText(
            payload?.conversation_key,
          )

        if (
          !conversationKey ||
          !Array.isArray(payload?.messages)
        ) {
          return {
            payload,
            nullBaseMessageKeys: [],
          }
        }

        const versions =
          getConversationVersions(
            conversationKey,
          )

        const nullBaseMessageKeys = []
        let changed = false

        const messages = payload.messages.map(
          (message) => {
            const messageKey =
              normalizeRequiredText(
                message?.message_key,
              )

            if (
              !messageKey ||
              !isNullBaseVersion(
                message?.base_version,
              )
            ) {
              return message
            }

            const confirmedVersion =
              versions?.get(messageKey) ||
              null

            if (!confirmedVersion) {
              nullBaseMessageKeys.push(
                messageKey,
              )

              return message
            }

            changed = true

            return {
              ...message,
              base_version:
                confirmedVersion,
            }
          },
        )

        return {
          payload: changed
            ? {
                ...payload,
                messages,
              }
            : payload,
          nullBaseMessageKeys,
        }
      }

      function recordResponse(
        conversationKey,
        nullBaseMessageKeys,
        messageResults,
      ) {
        if (
          !Array.isArray(
            nullBaseMessageKeys,
          ) ||
          nullBaseMessageKeys.length === 0 ||
          !Array.isArray(messageResults)
        ) {
          return
        }

        const pendingKeys = new Set(
          nullBaseMessageKeys,
        )
        const versions =
          getConversationVersions(
            conversationKey,
            true,
          )

        if (!versions) {
          return
        }

        messageResults.forEach((result) => {
          if (result?.synced !== true) {
            return
          }

          const messageKey =
            normalizeRequiredText(
              result?.message_key,
            )
          const canonicalVersion =
            normalizePositiveVersion(
              result?.canonical_version,
            )

          if (
            !messageKey ||
            !pendingKeys.has(messageKey) ||
            !canonicalVersion
          ) {
            return
          }

          versions.delete(messageKey)
          versions.set(
            messageKey,
            canonicalVersion,
          )

          if (
            versions.size >
            MAX_TRACKED_MESSAGES_PER_CONVERSATION
          ) {
            const oldestMessageKey =
              versions.keys().next().value

            if (oldestMessageKey) {
              versions.delete(
                oldestMessageKey,
              )
            }
          }
        })
      }

      return {
        preparePayload,
        recordResponse,
      }
    }

    function installNullBaseRebaseHotfix(
      target,
    ) {
      const companionApi =
        target?.YolenCompanionApi

      if (
        !companionApi ||
        typeof companionApi
          .ingestCapturedMessages !==
          'function'
      ) {
        return null
      }

      if (companionApi[API_PATCH]) {
        return companionApi[API_PATCH]
      }

      const tracker =
        createNullBaseRebaseTracker()
      const originalIngestCapturedMessages =
        companionApi
          .ingestCapturedMessages
          .bind(companionApi)

      companionApi.ingestCapturedMessages =
        async function nullBaseAwareIngestion(
          payload,
        ) {
          const prepared =
            tracker.preparePayload(payload)

          const result =
            await originalIngestCapturedMessages(
              prepared.payload,
            )

          if (isSuccessfulResult(result)) {
            tracker.recordResponse(
              prepared.payload
                ?.conversation_key,
              prepared.nullBaseMessageKeys,
              result.payload
                ?.message_results,
            )
          }

          return result
        }

      const installedState = {
        tracker,
        originalIngestCapturedMessages,
      }

      Object.defineProperty(
        companionApi,
        API_PATCH,
        {
          configurable: false,
          enumerable: false,
          value: installedState,
          writable: false,
        },
      )

      return installedState
    }

    return {
      createNullBaseRebaseTracker,
      installNullBaseRebaseHotfix,
    }
  },
)
