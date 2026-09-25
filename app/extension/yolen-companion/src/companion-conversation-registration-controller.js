;(function initYolenCompanionConversationRegistrationController(root) {
function createCompanionConversationRegistrationController(ctx) {
  // Dependências explícitas do Core (funções e referências estáveis).
  // Estado mutável do Core é lido via ctx.<nome> no momento do uso.
  const {
    escapeHtml,
    getCanonicalResolutionCycleId,
    getCaptureConversationKey,
    invalidateLeadSummaryForConversation,
    loadCompanionLeadSummaryForCurrentCycle,
    renderPanel,
  } = ctx

  // ---------------------------------------------------------------------
  // Registrar conversa — registro factual e manual da conversa atual no
  // histórico do lead. Independente da análise profunda (V2): não lê nem
  // depende de state.conversationAnalysis, não sugere mensagem, não altera
  // CRM/Agenda. O estado fica indexado por (cycle_id + conversation_key)
  // para nunca vazar entre conversas quando o vendedor troca de contato
  // enquanto uma chamada está em andamento.
  // ---------------------------------------------------------------------

  function canRegisterCurrentConversation() {
    return Boolean(
      ctx.state.connected &&
        !ctx.state.isSelfConversation &&
        getCanonicalResolutionCycleId(),
    )
  }

  function getConversationRegistrationKey() {
    const cycleId = getCanonicalResolutionCycleId()
    const conversationKey =
      typeof getCaptureConversationKey === 'function'
        ? getCaptureConversationKey()
        : null

    if (!cycleId || !conversationKey) {
      return null
    }

    return globalThis.YolenCompanionConversationRegistrationTools.buildConversationRegistrationKey(
      {
        cycleId,
        conversationKey,
      },
    )
  }

  function getCurrentConversationRegistrationEntry() {
    const key = getConversationRegistrationKey()

    if (!key) {
      return null
    }

    return (ctx.state.conversationRegistrations || {})[key] || null
  }

  function applyConversationRegistrationUpdate({
    key,
    requestCycleId,
    requestConversationKey,
    patch,
  }) {
    ctx.state = {
      ...ctx.state,
      conversationRegistrations: {
        ...(ctx.state.conversationRegistrations || {}),
        [key]: {
          ...(ctx.state.conversationRegistrations?.[key] || {}),
          ...patch,
        },
      },
    }

    const stillCurrent =
      globalThis.YolenCompanionConversationRegistrationTools.shouldApplyConversationRegistrationResult(
        {
          requestCycleId,
          requestConversationKey,
          currentCycleId: getCanonicalResolutionCycleId(),
          currentConversationKey:
            typeof getCaptureConversationKey === 'function'
              ? getCaptureConversationKey()
              : null,
        },
      )

    if (stillCurrent) {
      renderPanel()
    }
  }

  async function registerCurrentConversation() {
    if (!canRegisterCurrentConversation()) {
      return
    }

    const cycleId = getCanonicalResolutionCycleId()
    const conversationKey =
      typeof getCaptureConversationKey === 'function'
        ? getCaptureConversationKey()
        : null

    if (!cycleId || !conversationKey) {
      return
    }

    const key = globalThis.YolenCompanionConversationRegistrationTools.buildConversationRegistrationKey(
      {
        cycleId,
        conversationKey,
      },
    )

    applyConversationRegistrationUpdate({
      key,
      requestCycleId: cycleId,
      requestConversationKey: conversationKey,
      patch: {
        status: 'previewing',
        summary_text: null,
        watermark: null,
        confirmation_token: null,
        message_count: null,
        occurred_at: null,
        error_message: null,
        already_registered: false,
      },
    })

    let previewResult

    try {
      previewResult = await window.YolenCompanionApi.previewConversationRegistration({
        cycle_id: cycleId,
        conversation_key: conversationKey,
      })
    } catch (error) {
      applyConversationRegistrationUpdate({
        key,
        requestCycleId: cycleId,
        requestConversationKey: conversationKey,
        patch: {
          status: 'error',
          error_message:
            error instanceof Error && error.message
              ? error.message
              : 'Não foi possível gerar o resumo da conversa.',
        },
      })
      return
    }

    if (!previewResult?.ok || !previewResult.payload?.ok || !previewResult.payload?.data) {
      applyConversationRegistrationUpdate({
        key,
        requestCycleId: cycleId,
        requestConversationKey: conversationKey,
        patch: {
          status: 'error',
          error_message:
            previewResult?.payload?.error || 'Não foi possível gerar o resumo da conversa.',
        },
      })
      return
    }

    const data = previewResult.payload.data
    const alreadyRegistered = data.already_registered === true

    applyConversationRegistrationUpdate({
      key,
      requestCycleId: cycleId,
      requestConversationKey: conversationKey,
      patch: {
        status: alreadyRegistered ? 'success' : 'preview_ready',
        summary_text: data.summary_text || '',
        watermark: data.watermark || null,
        confirmation_token: data.confirmation_token || null,
        message_count: data.message_count ?? null,
        occurred_at: data.occurred_at || null,
        already_registered: alreadyRegistered,
        error_message: null,
      },
    })

    if (alreadyRegistered) {
      // Registro já existente recuperado no preview: o resumo anterior (e
      // a mensagem derivada dele) deixa de valer.
      invalidateLeadSummaryForConversation({
        cycle_id: cycleId,
        conversation_key: conversationKey,
      })

      await loadCompanionLeadSummaryForCurrentCycle()
    }
  }

  function canConfirmConversationRegistration() {
    const entry = getCurrentConversationRegistrationEntry()
    return Boolean(entry) && entry.status === 'preview_ready' && Boolean(entry.confirmation_token)
  }

  async function confirmCurrentConversationRegistration() {
    if (!canConfirmConversationRegistration()) {
      return
    }

    const cycleId = getCanonicalResolutionCycleId()
    const conversationKey =
      typeof getCaptureConversationKey === 'function'
        ? getCaptureConversationKey()
        : null

    if (!cycleId || !conversationKey) {
      return
    }

    const key = globalThis.YolenCompanionConversationRegistrationTools.buildConversationRegistrationKey(
      {
        cycleId,
        conversationKey,
      },
    )

    const entry = getCurrentConversationRegistrationEntry()

    if (!entry || entry.status !== 'preview_ready' || !entry.confirmation_token) {
      return
    }

    applyConversationRegistrationUpdate({
      key,
      requestCycleId: cycleId,
      requestConversationKey: conversationKey,
      patch: {
        status: 'saving',
        error_message: null,
      },
    })

    let confirmResult

    try {
      confirmResult = await window.YolenCompanionApi.confirmConversationRegistration({
        cycle_id: cycleId,
        conversation_key: conversationKey,
        confirmation_token: entry.confirmation_token,
        summary_text: entry.summary_text,
      })
    } catch (error) {
      applyConversationRegistrationUpdate({
        key,
        requestCycleId: cycleId,
        requestConversationKey: conversationKey,
        patch: {
          status: 'error',
          error_message:
            error instanceof Error && error.message
              ? error.message
              : 'Não foi possível registrar a conversa no histórico.',
        },
      })
      return
    }

    if (!confirmResult?.ok || !confirmResult.payload?.ok || !confirmResult.payload?.data) {
      const code = confirmResult?.payload?.code
      const isStale = [
        'REGISTER_CONVERSATION_STALE_WATERMARK',
        'REGISTER_CONVERSATION_INVALID_CONFIRMATION_TOKEN',
        'REGISTER_CONVERSATION_CONFIRMATION_TOKEN_SCOPE_MISMATCH',
        'REGISTER_CONVERSATION_CYCLE_MISMATCH',
        'REGISTER_CONVERSATION_CONVERSATION_KEY_MISMATCH',
        'REGISTER_CONVERSATION_SUMMARY_MISMATCH',
      ].includes(code)

      applyConversationRegistrationUpdate({
        key,
        requestCycleId: cycleId,
        requestConversationKey: conversationKey,
        patch: {
          status: isStale ? 'stale' : 'error',
          error_message:
            confirmResult?.payload?.error ||
            'Não foi possível registrar a conversa no histórico.',
        },
      })
      return
    }

    const data = confirmResult.payload.data

    applyConversationRegistrationUpdate({
      key,
      requestCycleId: cycleId,
      requestConversationKey: conversationKey,
      patch: {
        status: 'success',
        summary_text: data.summary_text || entry.summary_text,
        occurred_at: data.occurred_at || null,
        already_registered: data.already_registered === true,
        error_message: null,
      },
    })

    // O registro confirmado passa a ser uma fonte histórica do working
    // summary: invalida explicitamente o snapshot anterior (e a mensagem
    // derivada dele); a nova leitura faz a UI refletir o marco salvo
    // imediatamente, inclusive quando antes ela exibia o estado vazio.
    invalidateLeadSummaryForConversation({
      cycle_id: cycleId,
      conversation_key: conversationKey,
    })

    await loadCompanionLeadSummaryForCurrentCycle()
  }

  function cancelCurrentConversationRegistration() {
    const key = getConversationRegistrationKey()

    if (!key || !ctx.state.conversationRegistrations?.[key]) {
      return
    }

    const nextRegistrations = {
      ...ctx.state.conversationRegistrations,
    }

    delete nextRegistrations[key]

    ctx.state = {
      ...ctx.state,
      conversationRegistrations: nextRegistrations,
    }

    renderPanel()
  }

  function getConversationRegistrationCardHtml() {
    if (!canRegisterCurrentConversation()) {
      return ''
    }

    const entry = getCurrentConversationRegistrationEntry()
    const status = entry?.status || 'idle'

    const body = (() => {
      if (status === 'previewing') {
        return `
          <div class="yolen-card-description">Gerando resumo…</div>
          <button class="yolen-secondary-button" type="button" disabled>Gerando resumo…</button>
        `
      }

      if (status === 'preview_ready') {
        return `
          <div class="yolen-card-description yolen-conversation-registration-preview">
            ${escapeHtml(entry?.summary_text || '')}
          </div>
          <div class="yolen-inline-actions">
            <button class="yolen-primary-button" type="button" data-yolen-action="confirm-conversation-registration">
              Confirmar registro
            </button>
            <button class="yolen-tertiary-button" type="button" data-yolen-action="cancel-conversation-registration">
              Cancelar
            </button>
          </div>
        `
      }

      if (status === 'saving') {
        return `
          <div class="yolen-card-description">Registrando no histórico…</div>
          <button class="yolen-primary-button" type="button" disabled>Registrando no histórico…</button>
        `
      }

      if (status === 'success') {
        return `
          <div class="yolen-card-description yolen-conversation-registration-preview">
            ${escapeHtml(entry?.summary_text || '')}
          </div>
          <div class="yolen-decision-kicker">Conversa registrada no histórico</div>
          <button class="yolen-secondary-button" type="button" data-yolen-action="register-conversation">
            Registrar novamente
          </button>
        `
      }

      if (status === 'stale') {
        return `
          <div class="yolen-card-description">
            ${escapeHtml(
              entry?.error_message ||
                'A conversa mudou desde a geração do resumo. Gere novamente.',
            )}
          </div>
          <button class="yolen-secondary-button" type="button" data-yolen-action="register-conversation">
            Gerar novamente
          </button>
        `
      }

      if (status === 'error') {
        return `
          <div class="yolen-card-description yolen-status-warning">
            ${escapeHtml(entry?.error_message || 'Não foi possível registrar. Tentar novamente.')}
          </div>
          <button class="yolen-secondary-button" type="button" data-yolen-action="register-conversation">
            Tentar novamente
          </button>
        `
      }

      return `
        <button class="yolen-secondary-button" type="button" data-yolen-action="register-conversation">
          Registrar conversa
        </button>
      `
    })()

    return `
      <div class="yolen-card yolen-conversation-registration-card">
        <div class="yolen-section-label">Histórico do lead</div>
        ${body}
      </div>
    `
  }

  return {
    registerCurrentConversation,
    confirmCurrentConversationRegistration,
    cancelCurrentConversationRegistration,
    getConversationRegistrationCardHtml,
  }
}

const api = Object.freeze({
  create: createCompanionConversationRegistrationController,
})

root.YolenCompanionConversationRegistrationController = api

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
