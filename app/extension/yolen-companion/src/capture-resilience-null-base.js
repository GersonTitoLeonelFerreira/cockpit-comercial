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
    api.installAnalysisScrollFreshnessHotfix(root)
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : this,
  function createYolenCompanionNullBaseRebase() {
    const API_PATCH = Symbol.for(
      'yolen.companion.capture-resilience.null-base-rebase',
    )
    const ANALYSIS_API_PATCH = Symbol.for(
      'yolen.companion.analysis-scroll-freshness',
    )
    const MAX_TRACKED_CONVERSATIONS = 100
    const MAX_TRACKED_MESSAGES_PER_CONVERSATION = 500
    const MAX_TRACKED_ANALYSIS_CONTEXTS = 100

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

    function isRecord(value) {
      return Boolean(
        value &&
          typeof value === 'object' &&
          !Array.isArray(value),
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

    function isSyntheticDomSupersededResult(
      result,
    ) {
      const data =
        result?.payload?.data

      return Boolean(
        result?.ok === true &&
          result?.payload?.ok === true &&
          data?.status === 'superseded' &&
          !Object.prototype.hasOwnProperty.call(
            data,
            'cycle_id',
          ) &&
          !Object.prototype.hasOwnProperty.call(
            data,
            'conversation_key',
          ),
      )
    }

    function promoteDeepSellerResult(
      deepResult,
      analysisData,
    ) {
      if (
        !isRecord(deepResult) ||
        deepResult.contract_version !==
          'phase12a-deep-seller-v1' ||
        !isRecord(
          deepResult.commercial_reading,
        )
      ) {
        return null
      }

      const isCommercial =
        deepResult.commercial_relevance ===
          'commercial'

      if (isRecord(analysisData)) {
        const previousSuggestion =
          isRecord(analysisData.suggestion)
            ? analysisData.suggestion
            : {}

        const previousCoaching =
          isRecord(analysisData.coaching)
            ? analysisData.coaching
            : {}

        analysisData.engine_source =
          'stateful'

        analysisData.commercial_reading =
          deepResult.commercial_reading

        analysisData.commercial_relevance =
          deepResult.commercial_relevance

        analysisData.suggestion = {
          ...previousSuggestion,
          summary:
            typeof deepResult.summary ===
            'string'
              ? deepResult.summary
              : previousSuggestion.summary ??
                '',
          next_action:
            isCommercial &&
            typeof deepResult
              .recommended_next_approach ===
              'string'
              ? deepResult
                  .recommended_next_approach
              : null,
          next_action_date:
            isCommercial
              ? previousSuggestion
                  .next_action_date ??
                null
              : null,
          recommended_status:
            isCommercial
              ? previousSuggestion
                  .recommended_status ??
                null
              : null,
        }

        analysisData.coaching =
          isCommercial
            ? {
                ...previousCoaching,
                recommended_next_approach:
                  deepResult
                    .recommended_next_approach ??
                  null,
                recommended_question:
                  deepResult
                    .recommended_question ??
                  null,
                suggested_message:
                  deepResult
                    .suggested_message ??
                  null,
              }
            : {
                recommended_next_approach:
                  null,
                recommended_question:
                  null,
                suggested_message:
                  null,
              }
      }

      return {
        ...deepResult,
        interpretation: {
          current_moment: {
            summary:
              deepResult.summary ?? '',
          },
        },
        strategy: {
          suggested_message:
            isCommercial
              ? deepResult.suggested_message ??
                null
              : null,
        },
      }
    }

    function getCompanionRuntime(target) {
      return (
        target?.browser?.runtime ||
        target?.chrome?.runtime ||
        null
      )
    }

    async function sendAuthoritativeCompanionAction(
      target,
      companionApi,
      action,
      payload,
    ) {
      const runtime =
        getCompanionRuntime(target)

      if (
        !runtime ||
        typeof runtime.sendMessage !==
          'function'
      ) {
        return null
      }

      try {
        return await runtime.sendMessage({
          source: 'YOLEN_COMPANION',
          action,
          baseUrl:
            typeof companionApi.getBaseUrl ===
            'function'
              ? companionApi.getBaseUrl()
              : undefined,
          payload: payload || null,
        })
      } catch {
        return null
      }
    }

    function rememberAnalysisContext(
      contexts,
      analysisJobId,
      value,
    ) {
      if (!analysisJobId) {
        return
      }

      contexts.delete(analysisJobId)
      contexts.set(
        analysisJobId,
        value,
      )

      if (
        contexts.size >
        MAX_TRACKED_ANALYSIS_CONTEXTS
      ) {
        const oldestAnalysisJobId =
          contexts.keys().next().value

        if (oldestAnalysisJobId) {
          contexts.delete(
            oldestAnalysisJobId,
          )
        }
      }
    }

    function installAnalysisScrollFreshnessHotfix(
      target,
    ) {
      const companionApi =
        target?.YolenCompanionApi

      if (
        !companionApi ||
        typeof companionApi
          .analyzeConversation !==
          'function' ||
        typeof companionApi
          .getAnalysisJobStatus !==
          'function'
      ) {
        return null
      }

      if (companionApi[ANALYSIS_API_PATCH]) {
        return companionApi[
          ANALYSIS_API_PATCH
        ]
      }

      const analysisContexts =
        new Map()

      const originalAnalyzeConversation =
        companionApi
          .analyzeConversation
          .bind(companionApi)

      const originalGetAnalysisJobStatus =
        companionApi
          .getAnalysisJobStatus
          .bind(companionApi)

      companionApi.analyzeConversation =
        async function scrollSafeAnalyzeConversation(
          payload,
        ) {
          const result =
            await originalAnalyzeConversation(
              payload,
            )

          let deepAnalysis =
            result?.payload?.data
              ?.deep_analysis

          const analysisJobId =
            normalizeRequiredText(
              deepAnalysis
                ?.analysis_job_id,
            )

          if (!analysisJobId) {
            return result
          }

          rememberAnalysisContext(
            analysisContexts,
            analysisJobId,
            {
              analysisDataRef:
                result.payload.data,
              conversationKey:
                normalizeRequiredText(
                  payload?.conversation_key,
                ),
              messageWatermark:
                normalizeRequiredText(
                  deepAnalysis
                    ?.message_watermark,
                ) ||
                normalizeRequiredText(
                  payload
                    ?.message_snapshot_hash,
                ),
            },
          )

          const forceSucceededRefresh =
            payload?.force_reanalysis ===
              true &&
            deepAnalysis?.status ===
              'succeeded'

          const retryFailedAnalysis =
            payload?.retry_failed_job ===
              true &&
            deepAnalysis?.status ===
              'failed'

          if (
            !forceSucceededRefresh &&
            !retryFailedAnalysis
          ) {
            return result
          }

          const retryResult =
            await sendAuthoritativeCompanionAction(
              target,
              companionApi,
              'RETRY_ANALYSIS_JOB',
              {
                analysis_job_id:
                  analysisJobId,
                allow_succeeded:
                  forceSucceededRefresh,
              },
            )

          const retried =
            retryResult?.payload?.data

          if (
            retryResult?.ok === true &&
            retryResult?.payload?.ok ===
              true &&
            retried?.analysis_job_id ===
              analysisJobId &&
            (
              retried.status === 'queued' ||
              retried.status === 'running'
            )
          ) {
            deepAnalysis = {
              ...deepAnalysis,
              status: retried.status,
              message_watermark:
                retried.message_watermark ||
                deepAnalysis
                  .message_watermark,
            }

            result.payload.data.deep_analysis =
              deepAnalysis
          }

          return result
        }

      companionApi.getAnalysisJobStatus =
        async function scrollSafeAnalysisJobStatus(
          payload,
        ) {
          const result =
            await originalGetAnalysisJobStatus(
              payload,
            )

          if (
            !isSyntheticDomSupersededResult(
              result,
            )
          ) {
            return result
          }

          const analysisJobId =
            normalizeRequiredText(
              payload?.analysis_job_id,
            )

          if (!analysisJobId) {
            return result
          }

          const authoritative =
            await sendAuthoritativeCompanionAction(
              target,
              companionApi,
              'GET_ANALYSIS_JOB_STATUS',
              {
                analysis_job_id:
                  analysisJobId,
              },
            )

          if (
            authoritative?.ok !== true ||
            authoritative?.payload?.ok !==
              true ||
            !isRecord(
              authoritative.payload.data,
            )
          ) {
            return result
          }

          const data =
            authoritative.payload.data

          const context =
            analysisContexts.get(
              analysisJobId,
            )

          if (
            data.status === 'succeeded' &&
            context &&
            (
              !context.messageWatermark ||
              !data.message_watermark ||
              data.message_watermark ===
                context.messageWatermark
            )
          ) {
            const promoted =
              promoteDeepSellerResult(
                data.result,
                context.analysisDataRef,
              )

            if (promoted) {
              data.result = promoted
            }
          }

          return authoritative
        }

      const installedState = {
        analysisContexts,
        originalAnalyzeConversation,
        originalGetAnalysisJobStatus,
      }

      Object.defineProperty(
        companionApi,
        ANALYSIS_API_PATCH,
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
      installAnalysisScrollFreshnessHotfix,
      installNullBaseRebaseHotfix,
      isSyntheticDomSupersededResult,
      promoteDeepSellerResult,
    }
  },
)
