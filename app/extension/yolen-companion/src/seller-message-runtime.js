;(function initSellerMessageRuntime(root) {
  const api = root.YolenCompanionApi

  if (
    !api ||
    typeof api.loadLeadSummary !== 'function' ||
    api.__sellerMessageWrapped === true
  ) {
    return
  }

  const originalLoadLeadSummary =
    api.loadLeadSummary.bind(api)

  const stateByContext = new Map()
  let currentContext = null
  let latestRequestedContextKey = null
  let latestRequestId = 0
  let renderQueued = false

  function getRuntime() {
    if (root.browser?.runtime?.sendMessage) {
      return root.browser.runtime
    }

    if (root.chrome?.runtime?.sendMessage) {
      return root.chrome.runtime
    }

    return null
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function hashText(value) {
    const text = String(value || '')
    let hash = 2166136261

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }

    return `${text.length}:${(hash >>> 0).toString(16)}`
  }

  function buildContext(payload, data) {
    const workingSummary =
      typeof data?.working_summary === 'string' &&
      data.working_summary.trim()
        ? data.working_summary.trim()
        : typeof data?.summary?.summary === 'string'
          ? data.summary.summary.trim()
          : ''

    const cycleId =
      String(payload?.cycle_id || '').trim()
    const conversationKey =
      String(payload?.conversation_key || '').trim()

    if (!cycleId || !conversationKey || !workingSummary) {
      return null
    }

    return {
      payload: {
        cycle_id: cycleId,
        conversation_key: conversationKey,
      },
      data,
      workingSummary,
      key: [
        cycleId,
        conversationKey,
        hashText(workingSummary),
      ].join('::'),
    }
  }

  function buildRequestContextKey(payload) {
    const cycleId =
      String(payload?.cycle_id || '').trim()
    const conversationKey =
      String(payload?.conversation_key || '').trim()

    return cycleId && conversationKey
      ? `${cycleId}::${conversationKey}`
      : null
  }

  function removeVisibleComposer() {
    document.querySelector(
      '[data-yolen-seller-message-box]',
    )?.remove?.()
  }

  function clearContext(payload) {
    const requestKey =
      buildRequestContextKey(payload)

    if (!requestKey) {
      currentContext = null
      latestRequestedContextKey = null
      latestRequestId += 1
      stateByContext.clear()
      removeVisibleComposer()
      return
    }

    const prefix = `${requestKey}::`

    for (const key of stateByContext.keys()) {
      if (key.startsWith(prefix)) {
        stateByContext.delete(key)
      }
    }

    if (
      currentContext &&
      buildRequestContextKey(
        currentContext.payload,
      ) === requestKey
    ) {
      currentContext = null
      removeVisibleComposer()
    }

    latestRequestId += 1
  }

  function getState(context) {
    if (!context) {
      return null
    }

    if (!stateByContext.has(context.key)) {
      stateByContext.set(context.key, {
        intent: '',
        status: 'idle',
        message: null,
        error: null,
        feedback: null,
      })
    }

    return stateByContext.get(context.key)
  }

  function getGuidance(context) {
    return context?.data?.method_guidance || null
  }

  function getPresets(guidance) {
    const contextual = Array.isArray(
      guidance?.seller_intents,
    )
      ? guidance.seller_intents
          .filter(
            (value) =>
              typeof value === 'string' &&
              value.trim(),
          )
          .map((value) => value.trim())
          .slice(0, 3)
      : []

    if (contextual.length > 0) {
      return contextual
    }

    if (
      typeof guidance?.next_step === 'string' &&
      guidance.next_step.trim()
    ) {
      return [
        `Quero seguir este próximo passo: ${guidance.next_step.trim()}`,
      ]
    }

    if (guidance?.status === 'not_applicable') {
      return [
        'Quero responder somente ao assunto atual, sem transformar isso em venda.',
      ]
    }

    return [
      'Quero responder ao ponto principal desta conversa.',
    ]
  }

  function shortPresetLabel(value) {
    const normalized = String(value || '')
      .replace(/^Quero\s+/i, '')
      .replace(/[.]$/, '')
      .trim()

    if (normalized.length <= 26) {
      return normalized
    }

    return `${normalized.slice(0, 25).trim()}…`
  }

  const INTENT_MAX_LENGTH = 1000

  function renderComposer() {
    const context = currentContext

    if (!context) {
      return
    }

    const summaryInput = document.querySelector(
      '[data-yolen-textarea="lead-summary"]',
    )

    if (
      !summaryInput ||
      String(summaryInput.value || '').trim() !==
        context.workingSummary
    ) {
      return
    }

    const guidanceSlot = document.querySelector(
      '[data-yolen-method-guidance-slot]',
    )

    const dedicatedMount = document.querySelector(
      '[data-yolen-seller-message-mount]',
    )

    if (!guidanceSlot && !dedicatedMount) {
      return
    }

    const guidance = getGuidance(context)
    const guidanceLabel = guidanceSlot?.querySelector?.(
      '.yolen-method-guidance-label',
    )

    if (
      guidanceLabel &&
      guidanceLabel.textContent !== 'Orientação da Yolen'
    ) {
      guidanceLabel.textContent = 'Orientação da Yolen'
    }

    let box = document.querySelector(
      '[data-yolen-seller-message-box]',
    )

    if (!box) {
      box = document.createElement('div')
      box.setAttribute(
        'data-yolen-seller-message-box',
        '',
      )
      box.className = 'yolen-message-workspace'
    }

    if (dedicatedMount) {
      if (box.parentElement !== dedicatedMount) {
        dedicatedMount.appendChild(box)
      }
    } else if (
      guidanceSlot &&
      box.previousElementSibling !== guidanceSlot
    ) {
      guidanceSlot.insertAdjacentElement(
        'afterend',
        box,
      )
    }

    const state = getState(context)
    const presets = getPresets(guidance)
    const trimmedIntent = state.intent.trim()
    const disabled =
      !trimmedIntent ||
      state.status === 'loading'

    // Card do resultado só aparece com uma mensagem pronta — loading,
    // no_message e error usam um status compacto (uma linha, sem card),
    // para nunca competir em altura com o card do objetivo.
    const resultHtml =
      state.status === 'ready' && state.message
        ? [
            '<div class="yolen-message-result-card">',
            '<div class="yolen-message-result-label">✨ Mensagem sugerida</div>',
            '<div class="yolen-message-result-scroll">',
            '<div class="yolen-message-result-text">',
            escapeHtml(state.message),
            '</div>',
            '</div>',
            '<div class="yolen-message-actions">',
            '<button type="button" class="yolen-primary-button" data-yolen-seller-message-action="insert">Incluir no WhatsApp</button>',
            '<button type="button" class="yolen-secondary-button" data-yolen-seller-message-action="copy">Copiar</button>',
            '</div>',
            '<div class="yolen-message-footnote">A Yolen não envia mensagens automaticamente. Revise antes de enviar.</div>',
            '</div>',
          ].join('')
        : state.status === 'loading'
          ? '<div class="yolen-message-status"><span class="yolen-message-spinner" aria-hidden="true"></span>Gerando mensagem…</div>'
          : state.status === 'no_message'
            ? '<div class="yolen-message-status">Não há uma mensagem necessária agora.</div>'
            : state.status === 'error'
              ? `<div class="yolen-message-status yolen-message-status--error">${escapeHtml(state.error || 'Não foi possível gerar a mensagem.')}</div>`
              : ''

    const feedbackHtml = state.feedback
      ? `<div class="yolen-message-feedback">${escapeHtml(state.feedback)}</div>`
      : ''

    const html = [
      '<div class="yolen-message-objective-card">',
      '<div class="yolen-message-objective-title">Objetivo da mensagem</div>',
      '<div class="yolen-message-objective-help">Escolha um foco ou descreva o que você quer comunicar.</div>',
      '<div class="yolen-message-presets">',
      presets.map((preset, index) => (
        `<button type="button" class="yolen-message-preset${preset.trim() === trimmedIntent ? ' yolen-message-preset--active' : ''}" data-yolen-seller-message-preset="${index}">${escapeHtml(shortPresetLabel(preset))}</button>`
      )).join(''),
      '</div>',
      '<div class="yolen-message-intent-field">',
      `<textarea class="yolen-message-intent" data-yolen-seller-message-intent maxlength="${INTENT_MAX_LENGTH}" placeholder="Ex.: Quero responder ao ponto específico que o cliente trouxe.">`,
      escapeHtml(state.intent),
      '</textarea>',
      `<div class="yolen-message-intent-counter" data-yolen-seller-message-counter>${state.intent.length} / ${INTENT_MAX_LENGTH}</div>`,
      '</div>',
      '<button type="button" class="yolen-primary-button yolen-message-generate" data-yolen-seller-message-action="generate"',
      disabled ? ' disabled' : '',
      '>',
      state.status === 'loading'
        ? '<span class="yolen-message-spinner" aria-hidden="true"></span>Gerando…'
        : 'Gerar mensagem',
      '</button>',
      '</div>',
      resultHtml,
      feedbackHtml,
    ].join('')

    const renderKey = hashText(html)

    if (
      box.getAttribute('data-yolen-render-key') ===
      renderKey
    ) {
      return
    }

    box.setAttribute(
      'data-yolen-render-key',
      renderKey,
    )
    box.innerHTML = html
  }

  function queueRender() {
    if (renderQueued) {
      return
    }

    renderQueued = true

    Promise.resolve().then(() => {
      renderQueued = false
      renderComposer()
    })
  }

  async function requestGeneration() {
    const context = currentContext
    const state = getState(context)

    if (!context || !state || !state.intent.trim()) {
      return
    }

    const runtime = getRuntime()

    if (!runtime) {
      state.status = 'error'
      state.error =
        'Runtime da extensão indisponível para gerar a mensagem.'
      queueRender()
      return
    }

    state.status = 'loading'
    state.error = null
    state.message = null
    state.feedback = null
    queueRender()

    const guidance = getGuidance(context)

    let result

    try {
      result = await runtime.sendMessage({
        source: 'YOLEN_COMPANION',
        action: 'LOAD_METHOD_GUIDANCE',
        baseUrl:
          typeof api.getBaseUrl === 'function'
            ? api.getBaseUrl()
            : null,
        payload: {
          operation: 'generate_message',
          cycle_id: context.payload.cycle_id,
          conversation_key:
            context.payload.conversation_key,
          working_summary:
            context.workingSummary,
          seller_intent:
            state.intent.trim(),
          guidance_status:
            guidance?.status ?? null,
          guidance_stage_name:
            guidance?.stage_name ?? null,
          guidance_next_step:
            guidance?.next_step ?? null,
        },
      })
    } catch (error) {
      state.status = 'error'
      state.error =
        error instanceof Error && error.message
          ? error.message
          : 'Falha de comunicação ao gerar a mensagem.'
      queueRender()
      return
    }

    if (
      !result?.ok ||
      !result?.payload?.ok ||
      !result?.payload?.data
    ) {
      state.status = 'error'
      state.error =
        result?.payload?.error ||
        'Não foi possível gerar a mensagem agora.'
      queueRender()
      return
    }

    const generation = result.payload.data

    if (generation.status === 'no_message') {
      // Silêncio válido: a Yolen decidiu, sem erro, que nenhuma
      // mensagem deveria ser sugerida agora. Não é um erro — não insere,
      // não copia e não envia nada.
      state.status = 'no_message'
      state.message = null
      state.error = null
      queueRender()
      return
    }

    if (
      generation.status !== 'ready' ||
      typeof generation.message !== 'string' ||
      !generation.message.trim()
    ) {
      state.status = 'error'
      state.error =
        generation.error ||
        'A Yolen não conseguiu produzir uma mensagem válida.'
      queueRender()
      return
    }

    state.status = 'ready'
    state.message = generation.message.trim()
    state.error = null
    queueRender()
  }

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

  function insertIntoWhatsApp() {
    const state = getState(currentContext)

    if (!state?.message) {
      return
    }

    const composer = getWhatsAppComposer()

    if (!composer) {
      state.feedback =
        'Não encontrei o campo de mensagem do WhatsApp. Use Copiar.'
      queueRender()
      return
    }

    if (normalize(composer.textContent)) {
      state.feedback =
        'O campo do WhatsApp já contém texto. Envie ou limpe o rascunho antes de incluir a sugestão.'
      queueRender()
      composer.focus()
      return
    }

    composer.focus()

    let inserted = false

    try {
      if (typeof document.execCommand === 'function') {
        inserted =
          document.execCommand(
            'insertText',
            false,
            state.message,
          ) === true
      }
    } catch {
      inserted = false
    }

    if (!inserted) {
      try {
        composer.textContent = state.message
        composer.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: state.message,
          }),
        )
      } catch {
        state.feedback =
          'Não foi possível incluir automaticamente. Use Copiar.'
        queueRender()
        return
      }
    }

    const currentText = normalize(composer.textContent)
    const expected = normalize(state.message)

    if (
      !currentText ||
      currentText.slice(0, 40) !==
        expected.slice(0, 40)
    ) {
      state.feedback =
        'Não foi possível confirmar a inserção. Use Copiar.'
      queueRender()
      return
    }

    state.feedback =
      'Mensagem incluída no WhatsApp. Revise antes de enviar.'
    queueRender()
    composer.focus()
  }

  async function copyMessage() {
    const state = getState(currentContext)

    if (!state?.message) {
      return
    }

    try {
      await navigator.clipboard.writeText(
        state.message,
      )
      state.feedback = 'Mensagem copiada.'
    } catch {
      state.feedback =
        'Não foi possível copiar automaticamente. Selecione a mensagem manualmente.'
    }

    queueRender()
  }

  function syncContext(payload, data) {
    const context = buildContext(payload, data)

    if (!context) {
      currentContext = null
      removeVisibleComposer()
      return false
    }

    currentContext = context
    latestRequestedContextKey =
      buildRequestContextKey(payload)
    queueRender()
    return true
  }

  api.loadLeadSummary = async function loadLeadSummaryWithSellerMessage(payload) {
    const requestContextKey =
      buildRequestContextKey(payload)

    const visibleContextKey =
      buildRequestContextKey(
        currentContext?.payload,
      )

    latestRequestedContextKey =
      requestContextKey
    const requestId = latestRequestId + 1
    latestRequestId = requestId

    if (
      !requestContextKey ||
      (
        visibleContextKey &&
        visibleContextKey !==
          requestContextKey
      )
    ) {
      // A nova conversa ainda pode estar carregando, mas o vendedor já
      // saiu da anterior. O compositor antigo deixa de existir antes do
      // await para impossibilitar Gerar/Incluir/Copiar com contexto A.
      currentContext = null
      removeVisibleComposer()
    }

    const result =
      await originalLoadLeadSummary(payload)
    const data = result?.payload?.data

    if (
      latestRequestId !== requestId ||
      latestRequestedContextKey !==
      requestContextKey
    ) {
      return result
    }

    if (
      result?.ok &&
      result?.payload?.ok &&
      data
    ) {
      syncContext(payload, data)
    } else {
      currentContext = null
      removeVisibleComposer()
    }

    return result
  }

  api.__sellerMessageWrapped = true

  document.addEventListener(
    'input',
    (event) => {
      const input = event.target?.closest?.(
        '[data-yolen-seller-message-intent]',
      )

      if (!input) {
        return
      }

      const state = getState(currentContext)

      if (!state) {
        return
      }

      state.intent = String(input.value || '')
      state.feedback = null

      const button = document.querySelector(
        '[data-yolen-seller-message-action="generate"]',
      )

      if (button) {
        button.disabled =
          !state.intent.trim() ||
          state.status === 'loading'
      }

      // Atualizado diretamente (sem queueRender) pelo mesmo motivo do
      // botão acima: re-renderizar o box a cada tecla recriaria a
      // textarea e derrubaria o foco/posição do cursor do vendedor.
      const counter = document.querySelector(
        '[data-yolen-seller-message-counter]',
      )

      if (counter) {
        counter.textContent = `${state.intent.length} / ${INTENT_MAX_LENGTH}`
      }
    },
    true,
  )

  document.addEventListener(
    'click',
    (event) => {
      const presetButton =
        event.target?.closest?.(
          '[data-yolen-seller-message-preset]',
        )

      if (presetButton) {
        const context = currentContext
        const state = getState(context)
        const presets =
          getPresets(getGuidance(context))
        const index = Number(
          presetButton.getAttribute(
            'data-yolen-seller-message-preset',
          ),
        )

        if (
          state &&
          Number.isInteger(index) &&
          presets[index]
        ) {
          state.intent = presets[index]
          state.status = 'idle'
          state.message = null
          state.error = null
          state.feedback = null
          queueRender()
        }

        return
      }

      const actionButton =
        event.target?.closest?.(
          '[data-yolen-seller-message-action]',
        )

      if (!actionButton) {
        return
      }

      const action =
        actionButton.getAttribute(
          'data-yolen-seller-message-action',
        )

      if (action === 'generate') {
        void requestGeneration()
        return
      }

      if (action === 'insert') {
        insertIntoWhatsApp()
        return
      }

      if (action === 'copy') {
        void copyMessage()
      }
    },
    true,
  )

  const observer = new MutationObserver(() => {
    if (!currentContext) {
      return
    }

    const box = document.querySelector(
      '[data-yolen-seller-message-box]',
    )
    const summaryInput = document.querySelector(
      '[data-yolen-textarea="lead-summary"]',
    )
    const guidanceSlot = document.querySelector(
      '[data-yolen-method-guidance-slot]',
    )
    const dedicatedMount = document.querySelector(
      '[data-yolen-seller-message-mount]',
    )

    // Só remonta quando o shell do resumo foi recriado.
    if (
      !box &&
      summaryInput &&
      (
        dedicatedMount ||
        guidanceSlot
      )
    ) {
      queueRender()
    }
  })

  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true,
    },
  )

  root.YolenCompanionSellerMessageRuntime = Object.freeze({
    render: queueRender,
    syncContext,
    clear(payload) {
      clearContext(payload)
    },
  })
})(typeof globalThis !== 'undefined' ? globalThis : window)
