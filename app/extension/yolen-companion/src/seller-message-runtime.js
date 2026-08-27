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

  function ensureStyles() {
    if (document.getElementById('yolen-seller-message-runtime-styles')) {
      return
    }

    const style = document.createElement('style')
    style.id = 'yolen-seller-message-runtime-styles'
    style.textContent = [
      '.yolen-seller-message-box{margin-top:14px;padding-top:14px;border-top:1px solid rgba(126,153,194,.16)}',
      '.yolen-seller-message-title{color:#8ea0b8;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}',
      '.yolen-seller-message-help{color:#9fb0c6;font-size:11px;line-height:1.45;margin-bottom:9px}',
      '.yolen-seller-message-presets{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px}',
      '.yolen-seller-message-preset{border:1px solid rgba(126,153,194,.25);background:rgba(21,36,57,.65);color:#cfe1f7;border-radius:999px;padding:6px 8px;font-size:10px;font-weight:700;cursor:pointer;text-align:left}',
      '.yolen-seller-message-preset:hover{border-color:rgba(147,197,253,.55)}',
      '.yolen-seller-message-intent{box-sizing:border-box;width:100%;min-height:68px;resize:vertical;border:1px solid rgba(126,153,194,.24);border-radius:10px;background:#0d1726;color:#eef6ff;padding:10px;font:inherit;font-size:12px;line-height:1.45;outline:none}',
      '.yolen-seller-message-intent:focus{border-color:rgba(96,165,250,.7)}',
      '.yolen-seller-message-generate{margin-top:8px;width:100%}',
      '.yolen-seller-message-result{margin-top:12px;padding:11px;border-radius:10px;background:rgba(9,20,34,.75);border:1px solid rgba(126,153,194,.18)}',
      '.yolen-seller-message-result-label{color:#8ea0b8;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:7px}',
      '.yolen-seller-message-result-text{color:#f2f7fd;font-size:12px;line-height:1.55;white-space:pre-wrap}',
      '.yolen-seller-message-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}',
      '.yolen-seller-message-note{margin-top:8px;color:#9fb0c6;font-size:10px;line-height:1.4}',
      '.yolen-seller-message-error{margin-top:8px;color:#fca5a5;font-size:10px;line-height:1.4}',
    ].join('')

    document.head?.appendChild(style)
  }

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

    ensureStyles()

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
    const disabled =
      !state.intent.trim() ||
      state.status === 'loading'

    const resultHtml =
      state.status === 'ready' && state.message
        ? [
            '<div class="yolen-seller-message-result">',
            '<div class="yolen-seller-message-result-label">Mensagem sugerida</div>',
            '<div class="yolen-seller-message-result-text">',
            escapeHtml(state.message),
            '</div>',
            '<div class="yolen-seller-message-actions">',
            '<button type="button" class="yolen-primary-button" data-yolen-seller-message-action="insert">Incluir no WhatsApp</button>',
            '<button type="button" class="yolen-secondary-button" data-yolen-seller-message-action="copy">Copiar</button>',
            '</div>',
            '<div class="yolen-seller-message-note">A Yolen não envia a mensagem. Revise antes de enviar.</div>',
            '</div>',
          ].join('')
        : state.status === 'loading'
          ? '<div class="yolen-seller-message-note">Gerando mensagem…</div>'
          : state.status === 'error'
            ? `<div class="yolen-seller-message-error">${escapeHtml(state.error || 'Não foi possível gerar a mensagem.')}</div>`
            : ''

    const feedbackHtml = state.feedback
      ? `<div class="yolen-seller-message-note">${escapeHtml(state.feedback)}</div>`
      : ''

    const html = [
      '<div class="yolen-seller-message-box">',
      '<div class="yolen-seller-message-title">O que você quer fazer agora?</div>',
      '<div class="yolen-seller-message-help">A orientação acima é uma recomendação. Diga o que você quer comunicar e a Yolen prepara a mensagem.</div>',
      '<div class="yolen-seller-message-presets">',
      presets.map((preset, index) => (
        `<button type="button" class="yolen-seller-message-preset" data-yolen-seller-message-preset="${index}">${escapeHtml(shortPresetLabel(preset))}</button>`
      )).join(''),
      '</div>',
      '<textarea class="yolen-seller-message-intent" data-yolen-seller-message-intent maxlength="1000" placeholder="Ex.: Quero responder ao ponto específico que o cliente trouxe.">',
      escapeHtml(state.intent),
      '</textarea>',
      '<button type="button" class="yolen-primary-button yolen-seller-message-generate" data-yolen-seller-message-action="generate"',
      disabled ? ' disabled' : '',
      '>',
      state.status === 'loading'
        ? 'Gerando…'
        : 'Gerar mensagem',
      '</button>',
      resultHtml,
      feedbackHtml,
      '</div>',
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

    latestRequestedContextKey =
      requestContextKey
    const requestId = latestRequestId + 1
    latestRequestId = requestId

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
