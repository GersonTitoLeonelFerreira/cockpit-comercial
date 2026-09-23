;(function initSellerMessageRuntime(root) {
  const api = root.YolenCompanionApi

  if (
    !api ||
    typeof api.loadLeadSummary !== 'function' ||
    api.__sellerMessageWrapped === true
  ) {
    return
  }

  const engineApi = root.YolenCompanionSellerMessageEngine
  if (!engineApi || typeof engineApi.createSellerMessageEngine !== 'function') {
    throw new Error('Módulo compartilhado do seller message engine não carregado.')
  }

  const originalLoadLeadSummary =
    api.loadLeadSummary.bind(api)

  function getRuntime() {
    if (root.browser?.runtime?.sendMessage) {
      return root.browser.runtime
    }

    if (root.chrome?.runtime?.sendMessage) {
      return root.chrome.runtime
    }

    return null
  }

  // STEP 2B.5-D1: adapter de sendMessage compatível com o contrato do
  // engine compartilhado (que espera uma função sendMessage(message) que
  // retorna uma Promise) — reaproveita o MESMO runtime.sendMessage já
  // usado no resto do WhatsApp, nunca um segundo transporte.
  function sendMessage(message) {
    const runtime = getRuntime()

    if (!runtime) {
      return Promise.reject(new Error('Runtime da extensão indisponível.'))
    }

    return runtime.sendMessage(message)
  }

  const UX8_SHELL_SELECTOR =
    '#yolen-companion-panel[data-yolen-ux-build="UX8"]'

  function isUx8ShellActive() {
    return Boolean(
      document.querySelector(UX8_SHELL_SELECTOR),
    )
  }

  // Composer adapter do WhatsApp — MESMO contrato {applied, reason} que
  // manychat-composer.js#applyManyChatComposerSuggestion já usa. Nunca
  // sobrescreve texto existente, nunca envia. Lógica idêntica à que já
  // existia aqui antes da extração do engine compartilhado.
  function getWhatsAppComposer() {
    const main =
      document.querySelector('#main')

    const scope =
      main?.querySelector('footer') ||
      main

    if (!scope) {
      return null
    }

    const preferred = [
      '[data-testid="conversation-compose-box-input"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
    ]

    for (const selector of preferred) {
      const candidate = scope.querySelector(selector)

      if (
        candidate &&
        !candidate.closest('#yolen-companion-panel')
      ) {
        return candidate
      }
    }

    return null
  }

  function normalize(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function insertIntoWhatsAppComposer(text) {
    const composer = getWhatsAppComposer()

    if (!composer) {
      return Object.freeze({ applied: false, reason: 'composer_not_found' })
    }

    if (normalize(composer.textContent)) {
      composer.focus()
      return Object.freeze({ applied: false, reason: 'composer_not_empty' })
    }

    composer.focus()

    let inserted = false

    try {
      if (typeof document.execCommand === 'function') {
        inserted =
          document.execCommand(
            'insertText',
            false,
            text,
          ) === true
      }
    } catch {
      inserted = false
    }

    if (!inserted) {
      try {
        composer.textContent = text
        composer.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: text,
          }),
        )
      } catch {
        return Object.freeze({ applied: false, reason: 'apply_exception' })
      }
    }

    const currentText = normalize(composer.textContent)
    const expected = normalize(text)

    if (
      !currentText ||
      currentText.slice(0, 40) !==
        expected.slice(0, 40)
    ) {
      return Object.freeze({ applied: false, reason: 'apply_verification_failed' })
    }

    composer.focus()
    return Object.freeze({ applied: true, reason: null })
  }

  // Textos seller-facing exclusivos do WhatsApp (mesma redação de antes
  // da extração do engine — zero regressão visual/textual).
  function mapWhatsAppApplyResult(result) {
    if (result?.applied) {
      return 'Mensagem incluída no WhatsApp. Revise antes de enviar.'
    }

    if (result?.reason === 'composer_not_found') {
      return 'Não encontrei o campo de mensagem do WhatsApp. Use Copiar.'
    }

    if (result?.reason === 'composer_not_empty') {
      return 'O campo do WhatsApp já contém texto. Envie ou limpe o rascunho antes de incluir a sugestão.'
    }

    if (result?.reason === 'apply_verification_failed') {
      return 'Não foi possível confirmar a inserção. Use Copiar.'
    }

    return 'Não foi possível incluir automaticamente. Use Copiar.'
  }

  const engine = engineApi.createSellerMessageEngine({
    documentRef: document,
    windowRef: window,
    sendMessage,
    getBaseUrl: () => (typeof api.getBaseUrl === 'function' ? api.getBaseUrl() : null),
    applyMessage: insertIntoWhatsAppComposer,
    mapApplyResultToFeedback: mapWhatsAppApplyResult,
    applyButtonLabel: 'Incluir no WhatsApp',
    mountSelector: '[data-yolen-seller-message-mount]',
    legacyFallbackSelector: '[data-yolen-method-guidance-slot]',
    isLegacyShellActive: isUx8ShellActive,
    freshnessCheck(context) {
      const summaryInput = document.querySelector(
        '[data-yolen-textarea="lead-summary"]',
      )

      return Boolean(
        summaryInput &&
          String(summaryInput.value || '').trim() === context.workingSummary,
      )
    },
  })

  api.loadLeadSummary = async function loadLeadSummaryWithSellerMessage(payload) {
    const token = engine.beginLeadSummaryRequest(payload)

    const result =
      await originalLoadLeadSummary(payload)
    const data = result?.payload?.data

    engine.applyLeadSummaryResponse(token, payload, {
      ok: Boolean(result?.ok && result?.payload?.ok && data),
      data,
    })

    return result
  }

  api.__sellerMessageWrapped = true

  root.YolenCompanionSellerMessageRuntime = Object.freeze({
    render: engine.render,
    syncContext: engine.syncContext,
    clear(payload) {
      engine.clear(payload)
    },
  })
})(typeof globalThis !== 'undefined' ? globalThis : window)
