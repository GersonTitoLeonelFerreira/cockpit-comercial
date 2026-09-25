;(function initYolenCompanionLeadSummaryController(root) {

// Cache do working summary do lead (FASE 5). Antes era o wrapper
// lead-summary-runtime-cache.js sobre YolenCompanionApi.loadLeadSummary,
// chaveado por uma assinatura do DOM '#main' do WhatsApp. Agora é do
// controller de resumo, chaveado por cycle_id + conversation_key + a
// assinatura do snapshot de mensagens do ledger canônico do Core
// (independente de canal). Somente resumo utilizável vira "ready";
// requisições simultâneas do mesmo snapshot compartilham a mesma promise.
function createLeadSummaryCache() {
  const readyCache = new Map()
  const inFlightCache = new Map()

  function normalize(value) {
    return typeof value === 'string' ? value.trim() : ''
  }

  function getConversationPrefix(payload) {
    const cycleId = normalize(payload?.cycle_id)
    const conversationKey = normalize(payload?.conversation_key)

    return cycleId && conversationKey
      ? `${cycleId}::${conversationKey}::`
      : null
  }

  function buildCacheKey(payload, snapshotSignature) {
    const prefix = getConversationPrefix(payload)

    return prefix
      ? `${prefix}${String(snapshotSignature ?? '')}`
      : null
  }

  function hasUsableSummary(result) {
    if (!result?.ok || !result?.payload?.ok) {
      return false
    }

    const data = result.payload.data

    if (!data || typeof data !== 'object') {
      return false
    }

    const workingSummary = normalize(data.working_summary)
    const savedSummary = normalize(data.summary?.summary)

    return Boolean(workingSummary || savedSummary)
  }

  function clearConversation(payload) {
    const prefix = getConversationPrefix(payload)

    if (!prefix) {
      return
    }

    for (const key of [...readyCache.keys()]) {
      if (key.startsWith(prefix)) {
        readyCache.delete(key)
      }
    }

    for (const key of [...inFlightCache.keys()]) {
      if (key.startsWith(prefix)) {
        inFlightCache.delete(key)
      }
    }
  }

  function load(payload, snapshotSignature, loader) {
    const cacheKey = buildCacheKey(payload, snapshotSignature)

    if (!cacheKey) {
      return Promise.resolve(loader(payload))
    }

    if (readyCache.has(cacheKey)) {
      return Promise.resolve(readyCache.get(cacheKey))
    }

    if (inFlightCache.has(cacheKey)) {
      return inFlightCache.get(cacheKey)
    }

    const request = Promise.resolve(loader(payload))
      .then((result) => {
        // Um retorno vazio não é um estado definitivo. Ele pode acontecer
        // nos poucos instantes entre criar o lead, vincular a conversa e a
        // captura canônica chegar ao ciclo. Se for cacheado como "ready",
        // o Companion continua dizendo que não existe histórico mesmo
        // depois de as mensagens já estarem no banco.
        if (hasUsableSummary(result)) {
          readyCache.set(cacheKey, result)
        } else {
          readyCache.delete(cacheKey)
        }

        return result
      })
      .finally(() => {
        if (inFlightCache.get(cacheKey) === request) {
          inFlightCache.delete(cacheKey)
        }
      })

    inFlightCache.set(cacheKey, request)

    return request
  }

  // Salvamento confirmado substitui o cache pelo resumo persistido, sem
  // recompor.
  function replaceAfterSave(payload, snapshotSignature, result) {
    clearConversation(payload)

    const cacheKey = buildCacheKey(payload, snapshotSignature)

    if (cacheKey && hasUsableSummary(result)) {
      readyCache.set(cacheKey, result)
    }
  }

  return Object.freeze({
    load,
    replaceAfterSave,
    clearConversation,
    size() {
      return readyCache.size
    },
  })
}

function createCompanionLeadSummaryController(ctx) {
  // Dependências explícitas do Core (funções e referências estáveis).
  // Estado mutável do Core é lido via ctx.<nome> no momento do uso.
  const {
    captureOperationContext = () => null,
    isOperationContextCurrent = () => true,
    getCanonicalResolutionCycleId,
    getCaptureConversationKey,
    getLeadSummarySnapshotSignature,
    leadSummaryViewTools,
    messageController,
    renderPanel,
  } = ctx

  const leadSummaryCache = createLeadSummaryCache()

  // Invalidação explícita do resumo de uma conversa: captura confirmada,
  // registro confirmado ou registro já existente recuperado no preview.
  // Registro (ação explícita do vendedor) descarta também a mensagem
  // sugerida derivada do resumo anterior. Captura confirmada só invalida o
  // cache: se o resumo recarregado mudar, o contexto da mensagem muda junto
  // (a chave inclui o resumo); se não mudar, a intenção já digitada pelo
  // vendedor na MESMA conversa é preservada.
  function invalidateLeadSummaryForConversation(
    payload,
    { clearMessage = true } = {},
  ) {
    leadSummaryCache.clearConversation(payload)

    if (clearMessage) {
      messageController.clear(payload)
    }
  }

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
      messageController.clear()

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

    // Além do ciclo/chave de captura, a mesma geração de conversa/empresa/
    // sessão do Core: uma carga iniciada em A₁ não sincroniza a MENSAGEM de
    // A₂ (A→B→A).
    const operationContext =
      captureOperationContext()

    const isStillCurrentContext = () =>
      ctx.state.companionLeadSummaryCycleId === cycleId &&
      ctx.state.companionLeadSummaryConversationKey === conversationKey &&
      isOperationContextCurrent(operationContext)

    try {
      const result = await leadSummaryCache.load(
        {
          cycle_id: cycleId,
          conversation_key: conversationKey,
        },
        getLeadSummarySnapshotSignature(),
        (payload) =>
          window.YolenCompanionApi.loadLeadSummary(payload),
      )

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

      messageController.syncContext(
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

      leadSummaryCache.replaceAfterSave(
        {
          cycle_id: cycleId,
          conversation_key: conversationKey,
        },
        getLeadSummarySnapshotSignature(),
        result,
      )

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
    invalidateLeadSummaryForConversation,
  }
}

const api = Object.freeze({
  create: createCompanionLeadSummaryController,
  createLeadSummaryCache,
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
