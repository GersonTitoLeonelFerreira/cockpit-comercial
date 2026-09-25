;(function initYolenCompanionLeadSummaryController(root) {
function createCompanionLeadSummaryController(ctx) {
  // Dependências explícitas do Core (funções e referências estáveis).
  // Estado mutável do Core é lido via ctx.<nome> no momento do uso.
  const {
    getCanonicalResolutionCycleId,
    getCaptureConversationKey,
    leadSummaryViewTools,
    renderPanel,
  } = ctx

  // Carrega o working summary factual do lead. A rota combina memória
  // persistente, registros históricos confirmados e mensagens canônicas;
  // somente o salvamento da memória consolidada continua dependendo de ação
  // explícita do vendedor (ver handleSaveLeadSummaryClick).
  async function loadCompanionLeadSummaryForCurrentCycle() {
    const cycleId =
      getCanonicalResolutionCycleId()

    const conversationKey =
      getCaptureConversationKey()

    if (!cycleId || !conversationKey) {
      window.YolenCompanionSellerMessageRuntime
        ?.clear?.()

      ctx.state = {
        ...ctx.state,
        companionLeadSummary: {
          status: 'idle',
        },
        companionLeadSummaryCycleId: null,
        companionLeadSummaryConversationKey: null,
        companionLeadSummarySaveStatus: null,
        companionLeadSummarySaveError: null,
        companionLeadSummaryDraftValue: null,
      }

      renderPanel()
      return
    }

    ctx.state = {
      ...ctx.state,
      companionLeadSummary: {
        status: 'loading',
      },
      companionLeadSummaryCycleId: cycleId,
      companionLeadSummaryConversationKey: conversationKey,
      companionLeadSummarySaveStatus: null,
      companionLeadSummarySaveError: null,
      companionLeadSummaryDraftValue: null,
    }

    renderPanel()

    const isStillCurrentContext = () =>
      ctx.state.companionLeadSummaryCycleId === cycleId &&
      ctx.state.companionLeadSummaryConversationKey === conversationKey

    try {
      const result = await window.YolenCompanionApi.loadLeadSummary({
        cycle_id: cycleId,
        conversation_key: conversationKey,
      })

      if (!isStillCurrentContext()) {
        return
      }

      if (!result?.ok || !result.payload?.ok) {
        ctx.state = {
          ...ctx.state,
          companionLeadSummary: {
            status: 'error',
            error:
              result?.payload?.error ||
              'Não foi possível carregar o resumo salvo na Yolen.',
          },
        }

        renderPanel()
        return
      }

      ctx.state = {
        ...ctx.state,
        companionLeadSummary: {
          status: 'ready',
          data: result.payload.data,
        },
      }

      renderPanel()

      window.YolenCompanionSellerMessageRuntime
        ?.syncContext?.(
          {
            cycle_id: cycleId,
            conversation_key: conversationKey,
          },
          result.payload.data,
        )
    } catch (error) {
      if (!isStillCurrentContext()) {
        return
      }

      ctx.state = {
        ...ctx.state,
        companionLeadSummary: {
          status: 'error',
          error:
            error instanceof Error && error.message
              ? error.message
              : 'Não foi possível carregar o resumo salvo na Yolen.',
        },
      }

      renderPanel()
    }
  }

  // Salva o resumo por ação EXPLÍCITA do vendedor (clique no botão) — nunca
  // automaticamente. compare-and-set: envia expected_version = versão atual
  // conhecida (ou null se ainda não existe nenhuma); um 409 significa que
  // outra ação salvou uma versão mais nova nesse meio-tempo, e o cartão
  // mostra o aviso de conflito em vez de sobrescrever.
  async function handleSaveLeadSummaryClick(summaryText) {
    const cycleId = getCanonicalResolutionCycleId()
    const conversationKey = getCaptureConversationKey()

    if (!cycleId || !conversationKey) {
      return
    }

    const expectedVersion =
      ctx.state.companionLeadSummary?.data?.summary?.version ?? null

    ctx.state = {
      ...ctx.state,
      companionLeadSummarySaveStatus: 'saving',
      companionLeadSummarySaveError: null,
      companionLeadSummaryDraftValue: summaryText,
    }

    renderPanel()

    try {
      const result = await window.YolenCompanionApi.saveLeadSummary({
        cycle_id: cycleId,
        conversation_key: conversationKey,
        summary: summaryText,
        expected_version: expectedVersion,
      })

      if (
        getCanonicalResolutionCycleId() !== cycleId ||
        getCaptureConversationKey() !== conversationKey
      ) {
        return
      }

      if (result?.payload?.code === 'LEAD_SUMMARY_VERSION_CONFLICT') {
        ctx.state = {
          ...ctx.state,
          companionLeadSummarySaveStatus: 'conflict',
          companionLeadSummarySaveError: null,
        }

        renderPanel()
        return
      }

      if (!result?.ok || !result.payload?.ok) {
        ctx.state = {
          ...ctx.state,
          companionLeadSummarySaveStatus: 'error',
          companionLeadSummarySaveError:
            result?.payload?.error || 'Não foi possível salvar o resumo.',
        }

        renderPanel()
        return
      }

      const previousSummaryData =
        ctx.state.companionLeadSummary?.data || {}
      const persistedSummary =
        result.payload.data.summary || null

      ctx.state = {
        ...ctx.state,
        companionLeadSummary: {
          status: 'ready',
          data: {
            ...previousSummaryData,
            ...result.payload.data,
            working_summary:
              persistedSummary?.summary ||
              previousSummaryData.working_summary ||
              null,
            working_summary_source: 'canonical',
            has_unsaved_changes: false,
            current_message_watermark:
              persistedSummary
                ?.last_message_watermark ??
              previousSummaryData
                .current_message_watermark ??
              null,
          },
        },
        companionLeadSummarySaveStatus: null,
        companionLeadSummarySaveError: null,
        companionLeadSummaryDraftValue: null,
      }

      renderPanel()
    } catch (error) {
      ctx.state = {
        ...ctx.state,
        companionLeadSummarySaveStatus: 'error',
        companionLeadSummarySaveError:
          error instanceof Error && error.message
            ? error.message
            : 'Não foi possível salvar o resumo.',
      }

      renderPanel()
    }
  }

  function getCompanionLeadSummaryCardHtml() {
    if (ctx.state.companionLeadSummary?.status === 'idle') {
      return ''
    }

    return `
      <div class="yolen-card yolen-lead-summary-card">
        <div class="yolen-section-label">
          Resumo salvo na Yolen
        </div>

        ${leadSummaryViewTools.renderLeadSummarySection({
          ...ctx.state.companionLeadSummary,
          saveStatus: ctx.state.companionLeadSummarySaveStatus,
          saveError: ctx.state.companionLeadSummarySaveError,
          draftValue: ctx.state.companionLeadSummaryDraftValue,
        })}
      </div>
    `
  }

  return {
    loadCompanionLeadSummaryForCurrentCycle,
    handleSaveLeadSummaryClick,
    getCompanionLeadSummaryCardHtml,
  }
}

const api = Object.freeze({
  create: createCompanionLeadSummaryController,
})

root.YolenCompanionLeadSummaryController = api

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
