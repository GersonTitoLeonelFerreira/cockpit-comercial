;(function initYolenCompanionSellerMessageEngine(root) {
  'use strict'

  // STEP 2B.5-D1 — "FECHAR PARIDADE REAL DO COMPANION": extraído de
  // seller-message-runtime.js (WhatsApp). Este módulo é o SELLER MESSAGE
  // ENGINE compartilhado — stateByContext, working summary/presets/
  // intent, geração via LOAD_METHOD_GUIDANCE(operation:'generate_message'),
  // loading/ready/no_message/error, copy, renderização no MESMO mount
  // ([data-yolen-seller-message-mount]) e todos os stale guards
  // (contexto por cycle/conversation, requestId, boundary de renderização)
  // — nunca duplicado por plataforma.
  //
  // A ÚNICA coisa que muda por plataforma é o COMPOSER ADAPTER, injetado
  // via options.applyMessage(text) -> {applied, reason} (mesmo contrato
  // que manychat-composer.js#applyManyChatComposerSuggestion já usa) e
  // options.mapApplyResultToFeedback(result) -> string (o texto seller-
  // facing, nunca hardcoded "WhatsApp" aqui dentro). WhatsApp continua
  // com seu próprio composer adapter (insertIntoWhatsAppComposer, em
  // seller-message-runtime.js); ManyChat usa manychat-composer.js.
  function createSellerMessageEngine(options = {}) {
    const documentRef = options.documentRef ?? root.document
    const windowRef = options.windowRef ?? documentRef?.defaultView ?? root.window ?? root
    const sendMessage = options.sendMessage
    if (typeof sendMessage !== 'function') {
      throw new Error('options.sendMessage é obrigatório.')
    }

    const getBaseUrl = typeof options.getBaseUrl === 'function' ? options.getBaseUrl : () => null
    const applyMessage = options.applyMessage
    if (typeof applyMessage !== 'function') {
      throw new Error('options.applyMessage (composer adapter) é obrigatório.')
    }

    const mapApplyResultToFeedback =
      typeof options.mapApplyResultToFeedback === 'function'
        ? options.mapApplyResultToFeedback
        : (result) =>
            result?.applied
              ? 'Mensagem aplicada. Revise antes de enviar.'
              : 'Não foi possível aplicar automaticamente. Use Copiar.'

    const applyButtonLabel = typeof options.applyButtonLabel === 'string' ? options.applyButtonLabel : 'Aplicar mensagem'
    const mountSelector = options.mountSelector ?? '[data-yolen-seller-message-mount]'

    // Fallback legado (pré-UX8, hoje inatingível em produção — a única
    // superfície ativa é o mount dedicado — mas preservado tal como
    // existia em seller-message-runtime.js, nunca removido sem mandato
    // explícito): só o WhatsApp o usa (guidanceSlot dentro do card de
    // resumo do lead). ManyChat nunca passa isso.
    const legacyFallbackSelector = options.legacyFallbackSelector ?? null
    const isLegacyShellActive = typeof options.isLegacyShellActive === 'function' ? options.isLegacyShellActive : () => true

    // Guard de frescor opcional (WhatsApp: o valor do textarea oculto do
    // resumo do lead precisa bater com o working_summary do contexto
    // atual, prova de que o card de resumo visível é o mesmo que gerou
    // este contexto). Plataformas cujo próprio render() só é chamado
    // depois de já confirmar a conversationKey atual (ManyChat) não
    // precisam de um guard extra — o default aceita sempre.
    const freshnessCheck = typeof options.freshnessCheck === 'function' ? options.freshnessCheck : () => true

    // Lido AO VIVO a cada chamada (nunca capturado uma vez na criação do
    // engine): navigator.clipboard pode não existir ainda no instante em
    // que o engine é criado (ex.: só é definido/injetado depois, como em
    // ambiente de teste) — o mesmo comportamento que o código original já
    // tinha ao chamar navigator.clipboard.writeText(...) diretamente a
    // cada clique em Copiar.
    function resolveClipboard() {
      return windowRef?.navigator?.clipboard ?? root.navigator?.clipboard ?? null
    }

    const stateByContext = new Map()
    let currentContext = null
    let latestRequestedContextKey = null
    let latestRequestId = 0
    let renderQueued = false

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
        typeof data?.working_summary === 'string' && data.working_summary.trim()
          ? data.working_summary.trim()
          : typeof data?.summary?.summary === 'string'
            ? data.summary.summary.trim()
            : ''

      const cycleId = String(payload?.cycle_id || '').trim()
      const conversationKey = String(payload?.conversation_key || '').trim()

      if (!cycleId || !conversationKey || !workingSummary) {
        return null
      }

      return {
        payload: { cycle_id: cycleId, conversation_key: conversationKey },
        data,
        workingSummary,
        key: [cycleId, conversationKey, hashText(workingSummary)].join('::'),
      }
    }

    function buildRequestContextKey(payload) {
      const cycleId = String(payload?.cycle_id || '').trim()
      const conversationKey = String(payload?.conversation_key || '').trim()
      return cycleId && conversationKey ? `${cycleId}::${conversationKey}` : null
    }

    function removeVisibleComposer() {
      documentRef?.querySelector?.('[data-yolen-seller-message-box]')?.remove?.()
    }

    function clearContext(payload) {
      const requestKey = buildRequestContextKey(payload)

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

      if (currentContext && buildRequestContextKey(currentContext.payload) === requestKey) {
        currentContext = null
        removeVisibleComposer()
      }

      latestRequestId += 1
    }

    function getState(context) {
      if (!context) return null

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
      const contextual = Array.isArray(guidance?.seller_intents)
        ? guidance.seller_intents
            .filter((value) => typeof value === 'string' && value.trim())
            .map((value) => value.trim())
            .slice(0, 3)
        : []

      if (contextual.length > 0) {
        return contextual
      }

      if (typeof guidance?.next_step === 'string' && guidance.next_step.trim()) {
        return [`Quero seguir este próximo passo: ${guidance.next_step.trim()}`]
      }

      if (guidance?.status === 'not_applicable') {
        return ['Quero responder somente ao assunto atual, sem transformar isso em venda.']
      }

      return ['Quero responder ao ponto principal desta conversa.']
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

    function findMount() {
      const dedicatedMount = documentRef?.querySelector?.(mountSelector) ?? null
      const legacySlot = legacyFallbackSelector ? (documentRef?.querySelector?.(legacyFallbackSelector) ?? null) : null

      return { dedicatedMount, legacySlot }
    }

    function renderComposer() {
      const context = currentContext
      if (!context) return

      if (!freshnessCheck(context)) return

      const { dedicatedMount, legacySlot } = findMount()

      if (!dedicatedMount && !legacySlot) return

      if (isLegacyShellActive() && !dedicatedMount) {
        // Sem mount dedicado dentro do shell atual não há fallback válido
        // — a orientação/resumo continuam visíveis; só o composer some
        // até o mount dedicado voltar (evita competir com um runtime de
        // estabilidade de UI que remove composers fora do mount a cada
        // mutation).
        removeVisibleComposer()
        return
      }

      const guidance = getGuidance(context)

      let box = documentRef.querySelector('[data-yolen-seller-message-box]')

      if (!box) {
        box = documentRef.createElement('div')
        box.setAttribute('data-yolen-seller-message-box', '')
        box.className = 'yolen-message-workspace'
      }

      if (dedicatedMount) {
        if (box.parentElement !== dedicatedMount) {
          dedicatedMount.appendChild(box)
        }
      } else if (legacySlot && box.previousElementSibling !== legacySlot) {
        legacySlot.insertAdjacentElement('afterend', box)
      }

      const state = getState(context)
      const presets = getPresets(guidance)
      const trimmedIntent = state.intent.trim()
      const disabled = !trimmedIntent || state.status === 'loading'

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
              `<button type="button" class="yolen-primary-button" data-yolen-seller-message-action="insert">${escapeHtml(applyButtonLabel)}</button>`,
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

      const feedbackHtml = state.feedback ? `<div class="yolen-message-feedback">${escapeHtml(state.feedback)}</div>` : ''

      const html = [
        '<div class="yolen-message-objective-card">',
        '<div class="yolen-message-objective-title">Objetivo da mensagem</div>',
        '<div class="yolen-message-objective-help">Escolha um foco ou descreva o que você quer comunicar.</div>',
        '<div class="yolen-message-presets">',
        presets
          .map(
            (preset, index) =>
              `<button type="button" class="yolen-message-preset${preset.trim() === trimmedIntent ? ' yolen-message-preset--active' : ''}" data-yolen-seller-message-preset="${index}">${escapeHtml(shortPresetLabel(preset))}</button>`,
          )
          .join(''),
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
        state.status === 'loading' ? '<span class="yolen-message-spinner" aria-hidden="true"></span>Gerando…' : 'Gerar mensagem',
        '</button>',
        '</div>',
        resultHtml,
        feedbackHtml,
      ].join('')

      const renderKey = hashText(html)

      if (box.getAttribute('data-yolen-render-key') === renderKey) {
        return
      }

      box.setAttribute('data-yolen-render-key', renderKey)
      box.innerHTML = html
    }

    function queueRender() {
      if (renderQueued) return
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

      state.status = 'loading'
      state.error = null
      state.message = null
      state.feedback = null
      queueRender()

      // O servidor carrega, ele mesmo, a mesma fotografia canônica e o
      // mesmo Commercial Reasoning usados por AGORA/ANÁLISE/CLIENTE — este
      // engine nunca envia uma orientação própria, só o intent do
      // vendedor e o working summary do contexto atual.
      let result

      try {
        result = await sendMessage({
          source: 'YOLEN_COMPANION',
          action: 'LOAD_METHOD_GUIDANCE',
          baseUrl: getBaseUrl(),
          payload: {
            operation: 'generate_message',
            cycle_id: context.payload.cycle_id,
            conversation_key: context.payload.conversation_key,
            working_summary: context.workingSummary,
            seller_intent: state.intent.trim(),
          },
        })
      } catch (error) {
        state.status = 'error'
        state.error = error instanceof Error && error.message ? error.message : 'Falha de comunicação ao gerar a mensagem.'
        queueRender()
        return
      }

      if (!result?.ok || !result?.payload?.ok || !result?.payload?.data) {
        state.status = 'error'
        state.error = result?.payload?.error || 'Não foi possível gerar a mensagem agora.'
        queueRender()
        return
      }

      const generation = result.payload.data

      if (generation.status === 'no_message') {
        state.status = 'no_message'
        state.message = null
        state.error = null
        queueRender()
        return
      }

      if (generation.status !== 'ready' || typeof generation.message !== 'string' || !generation.message.trim()) {
        state.status = 'error'
        state.error = generation.error || 'A Yolen não conseguiu produzir uma mensagem válida.'
        queueRender()
        return
      }

      state.status = 'ready'
      state.message = generation.message.trim()
      state.error = null
      queueRender()
    }

    function insertMessage() {
      const state = getState(currentContext)
      if (!state?.message) return

      const result = applyMessage(state.message)
      state.feedback = mapApplyResultToFeedback(result)
      queueRender()
    }

    async function copyMessage() {
      const state = getState(currentContext)
      if (!state?.message) return

      try {
        const clipboard = resolveClipboard()
        if (!clipboard) throw new Error('clipboard_unavailable')
        await clipboard.writeText(state.message)
        state.feedback = 'Mensagem copiada.'
      } catch {
        state.feedback = 'Não foi possível copiar automaticamente. Selecione a mensagem manualmente.'
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
      latestRequestedContextKey = buildRequestContextKey(payload)
      queueRender()
      return true
    }

    // Par de funções que reproduz EXATAMENTE o bookkeeping stale-guard que
    // o hook de api.loadLeadSummary do WhatsApp já fazia em volta do await
    // de rede — beginLeadSummaryRequest ANTES do await (marca esta como a
    // requisição/contexto vigente, e já derruba o composer visível se o
    // vendedor já saiu daquele contexto antes da resposta chegar),
    // applyLeadSummaryResponse DEPOIS do await (só aplica o resultado se
    // nenhuma requisição/contexto mais nova assumiu o lugar enquanto essa
    // estava em voo). Nunca uma segunda convenção de staleness por
    // plataforma — ambas chamam exatamente este par.
    function beginLeadSummaryRequest(payload) {
      const requestContextKey = buildRequestContextKey(payload)
      const visibleContextKey = buildRequestContextKey(currentContext?.payload)

      latestRequestedContextKey = requestContextKey
      const requestId = latestRequestId + 1
      latestRequestId = requestId

      if (!requestContextKey || (visibleContextKey && visibleContextKey !== requestContextKey)) {
        currentContext = null
        removeVisibleComposer()
      }

      return { requestId, requestContextKey }
    }

    function applyLeadSummaryResponse(token, payload, { ok, data }) {
      if (latestRequestId !== token.requestId || latestRequestedContextKey !== token.requestContextKey) {
        return
      }

      if (ok && data) {
        syncContext(payload, data)
      } else {
        currentContext = null
        removeVisibleComposer()
      }
    }

    function attachEventDelegation() {
      // STEP 2B.5-D1: documentRef pode não ter um DOM real por trás (ex.:
      // teste de lógica pura sem jsdom, que só exercita
      // syncContext/beginLeadSummaryRequest/etc., nunca cliques de
      // verdade) — falha fechado (sem listeners) em vez de derrubar a
      // criação do engine inteiro. Em produção documentRef é sempre o
      // document real da aba, então isto nunca muda o comportamento
      // existente.
      if (typeof documentRef?.addEventListener !== 'function') return

      documentRef.addEventListener(
        'input',
        (event) => {
          const input = event.target?.closest?.('[data-yolen-seller-message-intent]')
          if (!input) return

          const state = getState(currentContext)
          if (!state) return

          state.intent = String(input.value || '')
          state.feedback = null

          const button = documentRef.querySelector('[data-yolen-seller-message-action="generate"]')
          if (button) {
            button.disabled = !state.intent.trim() || state.status === 'loading'
          }

          const counter = documentRef.querySelector('[data-yolen-seller-message-counter]')
          if (counter) {
            counter.textContent = `${state.intent.length} / ${INTENT_MAX_LENGTH}`
          }
        },
        true,
      )

      documentRef.addEventListener(
        'click',
        (event) => {
          const presetButton = event.target?.closest?.('[data-yolen-seller-message-preset]')

          if (presetButton) {
            const context = currentContext
            const state = getState(context)
            const presets = getPresets(getGuidance(context))
            const index = Number(presetButton.getAttribute('data-yolen-seller-message-preset'))

            if (state && Number.isInteger(index) && presets[index]) {
              state.intent = presets[index]
              state.status = 'idle'
              state.message = null
              state.error = null
              state.feedback = null
              queueRender()
            }

            return
          }

          const actionButton = event.target?.closest?.('[data-yolen-seller-message-action]')
          if (!actionButton) return

          const action = actionButton.getAttribute('data-yolen-seller-message-action')

          if (action === 'generate') {
            void requestGeneration()
            return
          }

          if (action === 'insert') {
            insertMessage()
            return
          }

          if (action === 'copy') {
            void copyMessage()
          }
        },
        true,
      )
    }

    function attachMutationObserver() {
      if (typeof windowRef?.MutationObserver !== 'function' && typeof root.MutationObserver !== 'function') {
        return
      }

      const MutationObserverCtor = windowRef?.MutationObserver ?? root.MutationObserver

      const observer = new MutationObserverCtor(() => {
        if (!currentContext) return

        const box = documentRef.querySelector('[data-yolen-seller-message-box]')
        const { dedicatedMount, legacySlot } = findMount()

        if (!box && (dedicatedMount || (legacySlot && !isLegacyShellActive()))) {
          queueRender()
        }
      })

      observer.observe(documentRef.documentElement, { childList: true, subtree: true })

      return observer
    }

    attachEventDelegation()

    if (options.observeMutations !== false) {
      attachMutationObserver()
    }

    return Object.freeze({
      render: queueRender,
      syncContext,
      beginLeadSummaryRequest,
      applyLeadSummaryResponse,
      clear: clearContext,
      requestGeneration,
      insertMessage,
      copyMessage,
      getState: () => getState(currentContext),
    })
  }

  const api = Object.freeze({ createSellerMessageEngine })

  root.YolenCompanionSellerMessageEngine = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
