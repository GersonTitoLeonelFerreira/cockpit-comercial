;(function initYolenCompanionConversationRegistrationController(root) {
  'use strict'

  const SOURCE = 'YOLEN_COMPANION'

  // STEP 2B.5-D1 (Blocker D) — "FECHAR PARIDADE REAL DO COMPANION":
  // normaliza as MESMAS duas ações de background que o WhatsApp já usa
  // (PREVIEW_CONVERSATION_REGISTRATION/CONFIRM_CONVERSATION_REGISTRATION,
  // via window.YolenCompanionApi em yolen-api.js) para o MESMO conjunto de
  // status que content-script.js#getConversationRegistrationCardHtml já
  // conhece (idle/previewing/preview_ready/saving/success/stale/error) —
  // nunca um backend novo, nunca uma segunda convenção de status. O
  // WhatsApp continua chamando window.YolenCompanionApi diretamente (não
  // há nenhuma cadeia de hooks decorando essas duas ações, ao contrário de
  // loadLeadSummary — então não há razão para preservar aquele call site
  // especificamente; mas content-script.js mantém sua própria máquina de
  // estado inline, já testada, e este controlador existe para ser a fonte
  // ÚNICA que qualquer plataforma sem essa máquina de estado local
  // (ManyChat) pode consumir diretamente, reproduzindo a MESMA regra de
  // status/stale-code — nunca uma segunda implementação da mesma regra.

  // Mesma allowlist de códigos de erro que content-script.js já usa para
  // decidir 'stale' vs 'error' genérico em confirmConversationRegistration.
  const STALE_ERROR_CODES = Object.freeze([
    'REGISTER_CONVERSATION_STALE_WATERMARK',
    'REGISTER_CONVERSATION_INVALID_CONFIRMATION_TOKEN',
    'REGISTER_CONVERSATION_CONFIRMATION_TOKEN_SCOPE_MISMATCH',
    'REGISTER_CONVERSATION_CYCLE_MISMATCH',
    'REGISTER_CONVERSATION_CONVERSATION_KEY_MISMATCH',
    'REGISTER_CONVERSATION_SUMMARY_MISMATCH',
  ])

  // Gera o resumo da conversa para prévia — nunca registra nada sozinho.
  // Resultado:
  //   {status:'preview_ready', summaryText, watermark, confirmationToken, messageCount, occurredAt}
  //   {status:'success', summaryText, occurredAt, alreadyRegistered:true} (backend já tinha registro)
  //   {status:'error', error}
  async function previewConversationRegistration({ sendMessage, cycleId, conversationKey }) {
    if (typeof sendMessage !== 'function') {
      throw new Error('sendMessage é obrigatório.')
    }

    try {
      const response = await sendMessage({
        source: SOURCE,
        action: 'PREVIEW_CONVERSATION_REGISTRATION',
        payload: { cycle_id: cycleId, conversation_key: conversationKey },
      })

      if (response?.ok !== true || response?.payload?.ok !== true || !response?.payload?.data) {
        return Object.freeze({
          status: 'error',
          error: response?.payload?.error || 'Não foi possível gerar o resumo da conversa.',
        })
      }

      const data = response.payload.data
      const alreadyRegistered = data.already_registered === true

      return Object.freeze({
        status: alreadyRegistered ? 'success' : 'preview_ready',
        summaryText: data.summary_text || '',
        watermark: data.watermark || null,
        confirmationToken: data.confirmation_token || null,
        messageCount: data.message_count ?? null,
        occurredAt: data.occurred_at || null,
        alreadyRegistered,
      })
    } catch (error) {
      return Object.freeze({
        status: 'error',
        error: error instanceof Error && error.message ? error.message : 'Não foi possível gerar o resumo da conversa.',
      })
    }
  }

  // Confirma o registro por AÇÃO EXPLÍCITA do vendedor (nunca automático)
  // — exige o confirmation_token já emitido por uma prévia. Resultado:
  //   {status:'success', summaryText, occurredAt, alreadyRegistered}
  //   {status:'stale', error} — o mesmo código de watermark/token
  //   já inválido do WhatsApp; o card deve oferecer "Gerar novamente"
  //   {status:'error', error} — falha genérica, "Tentar novamente"
  async function confirmConversationRegistration({
    sendMessage,
    cycleId,
    conversationKey,
    confirmationToken,
    summaryText,
  }) {
    if (typeof sendMessage !== 'function') {
      throw new Error('sendMessage é obrigatório.')
    }

    try {
      const response = await sendMessage({
        source: SOURCE,
        action: 'CONFIRM_CONVERSATION_REGISTRATION',
        payload: {
          cycle_id: cycleId,
          conversation_key: conversationKey,
          confirmation_token: confirmationToken,
          summary_text: summaryText,
        },
      })

      if (response?.ok !== true || response?.payload?.ok !== true || !response?.payload?.data) {
        const code = response?.payload?.code
        const isStale = STALE_ERROR_CODES.includes(code)

        return Object.freeze({
          status: isStale ? 'stale' : 'error',
          error: response?.payload?.error || 'Não foi possível registrar a conversa no histórico.',
        })
      }

      const data = response.payload.data

      return Object.freeze({
        status: 'success',
        summaryText: data.summary_text || summaryText,
        occurredAt: data.occurred_at || null,
        alreadyRegistered: data.already_registered === true,
      })
    } catch (error) {
      return Object.freeze({
        status: 'error',
        error: error instanceof Error && error.message ? error.message : 'Não foi possível registrar a conversa no histórico.',
      })
    }
  }

  const api = Object.freeze({
    previewConversationRegistration,
    confirmConversationRegistration,
    STALE_ERROR_CODES,
  })

  root.YolenCompanionConversationRegistrationController = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
