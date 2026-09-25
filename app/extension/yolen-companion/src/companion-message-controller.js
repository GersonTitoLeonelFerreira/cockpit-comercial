;(function initYolenCompanionMessageController(root) {
// Controller de MENSAGEM do Core (FASE 5). Dono do estado da mensagem
// sugerida por contexto (cycle_id + conversation_key + resumo), da
// intenção do vendedor, da geração explícita, do HTML do composer da aba
// MENSAGEM e das ações Incluir/Copiar. Não conhece o DOM da plataforma: a
// escrita no campo de mensagem do canal é a dependência explícita
// insertIntoComposer (ChannelAdapter), que devolve um código de resultado.
// A sincronização com o resumo do lead é explícita: o controller de resumo
// chama syncContext() quando o resumo fica pronto e o Core chama clear()
// na troca de conversa — nenhum wrapper de YolenCompanionApi.
function createCompanionMessageController({
  insertIntoComposer,
  getBaseUrl,
  // Nome de exibição do canal (contrato §5): só interpolado em copy.
  platformDisplayName = '',
  // Contexto de operação do Core (conversa/geração/empresa/sessão). A
  // geração, a cópia e a inclusão só produzem efeitos enquanto o contexto
  // em que o resumo foi sincronizado continuar vivo.
  captureOperationContext = () => null,
  isOperationContextCurrent = () => true,
} = {}) {
  const stateByContext = new Map()
  let currentContext = null
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

  const UX8_SHELL_SELECTOR =
    '#yolen-companion-panel[data-yolen-ux-build="UX8"]'

  function isUx8ShellActive() {
    return Boolean(
      document.querySelector(UX8_SHELL_SELECTOR),
    )
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

    if (isUx8ShellActive() && !dedicatedMount) {
      // Dentro do shell UX8 o composer só existe no mount dedicado. Sem
      // ele, inserir no fallback legado (depois do guidanceSlot) entra em
      // loop com ux8-interaction-consistency-runtime.js, que remove
      // qualquer composer fora do mount a cada mutation — a orientação
      // acima permanece visível; só o composer fica ausente até o mount
      // dedicado voltar.
      removeVisibleComposer()
      return
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
            '<button type="button" class="yolen-primary-button" data-yolen-seller-message-action="insert">Incluir no ' + escapeHtml(platformDisplayName) + '</button>',
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

    // Resposta de uma geração cujo contexto já não é o atual (troca de
    // conversa, A→B→A, empresa ou sessão) é descartada sem tocar em nada.
    const isStillCurrent = () =>
      stateByContext.get(context.key) === state &&
      isOperationContextCurrent(context.operationContext)

    // FASE 16.9 — a mensagem não envia mais uma orientação própria
    // (guidance_status/guidance_stage_name/guidance_next_step) ao
    // servidor. O servidor carrega, ele mesmo, a mesma fotografia
    // canônica e o mesmo Commercial Reasoning usados por AGORA/ANÁLISE/
    // CLIENTE (ver app/api/companion/method-guidance/route.ts) — nunca a
    // orientação legada que este runtime ainda lê localmente só para
    // sugerir presets de intenção (getGuidance/getPresets abaixo).
    let result

    try {
      result = await runtime.sendMessage({
        source: 'YOLEN_COMPANION',
        action: 'LOAD_METHOD_GUIDANCE',
        baseUrl:
          typeof getBaseUrl === 'function'
            ? getBaseUrl() ?? null
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
        },
      })
    } catch (error) {
      if (!isStillCurrent()) {
        return
      }

      state.status = 'error'
      state.error =
        error instanceof Error && error.message
          ? error.message
          : 'Falha de comunicação ao gerar a mensagem.'
      queueRender()
      return
    }

    if (!isStillCurrent()) {
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

  // Resultado da escrita no campo de mensagem do canal (ChannelAdapter) →
  // feedback seller-facing. Nunca envia: só preenche um campo vazio.
  const INSERT_FEEDBACK = Object.freeze({
    composer_unavailable:
      `Não encontrei o campo de mensagem do ${platformDisplayName}. Use Copiar.`,
    composer_not_empty:
      `O campo do ${platformDisplayName} já contém texto. Envie ou limpe o rascunho antes de incluir a sugestão.`,
    insert_failed:
      'Não foi possível incluir automaticamente. Use Copiar.',
    insert_unconfirmed:
      'Não foi possível confirmar a inserção. Use Copiar.',
    inserted:
      `Mensagem incluída no ${platformDisplayName}. Revise antes de enviar.`,
    conversation_changed:
      'A conversa mudou. Nada foi incluído.',
  })

  function insertIntoChannelComposer() {
    const context = currentContext
    const state = getState(context)

    if (!state?.message) {
      return
    }

    const outcome =
      !isOperationContextCurrent(context.operationContext)
        ? 'conversation_changed'
        : typeof insertIntoComposer === 'function'
          ? insertIntoComposer(state.message, {
              conversationKey:
                context.operationContext?.conversationKey || null,
            })
          : 'composer_unavailable'

    state.feedback =
      INSERT_FEEDBACK[outcome] ||
      INSERT_FEEDBACK.insert_failed
    queueRender()
  }

  async function copyMessage() {
    const context = currentContext
    const state = getState(context)

    if (!state?.message) {
      return
    }

    let feedback

    try {
      await navigator.clipboard.writeText(
        state.message,
      )
      feedback = 'Mensagem copiada.'
    } catch {
      feedback =
        'Não foi possível copiar automaticamente. Selecione a mensagem manualmente.'
    }

    if (
      stateByContext.get(context.key) !== state ||
      !isOperationContextCurrent(context.operationContext)
    ) {
      return
    }

    state.feedback = feedback
    queueRender()
  }

  function syncContext(payload, data) {
    const context = buildContext(payload, data)

    if (!context) {
      currentContext = null
      removeVisibleComposer()
      return false
    }

    context.operationContext =
      captureOperationContext()
    currentContext = context
    queueRender()
    return true
  }


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
        insertIntoChannelComposer()
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

    // Só remonta quando o shell do resumo foi recriado. Dentro do shell
    // UX8 sem o mount dedicado não há fallback legado a remontar — evita
    // reenfileirar renderComposer() a cada mutation enquanto o mount
    // está fora do ar (renderComposer() já é um no-op nesse caso, mas
    // sem este guard o observer ficaria re-testando a cada mutation
    // irrelevante do WhatsApp).
    if (
      !box &&
      summaryInput &&
      (
        dedicatedMount ||
        (guidanceSlot && !isUx8ShellActive())
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

  return Object.freeze({
    render: queueRender,
    syncContext,
    clear(payload) {
      clearContext(payload)
    },
  })
}

const api = Object.freeze({
  create: createCompanionMessageController,
})

root.YolenCompanionMessageController = api

if (
  typeof module !== 'undefined' &&
  module.exports
) {
  module.exports = api
}
})(typeof globalThis !== 'undefined' ? globalThis : window)
