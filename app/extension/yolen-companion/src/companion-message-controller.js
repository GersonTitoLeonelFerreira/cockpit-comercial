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
  // Rodada 7: com a leitura completa no painel, a geração antiga
  // (method-guidance, IA) nunca é chamada.
  isLegacyAiDisabled = () => false,
} = {}) {
  // Estado da MENSAGEM por conversa (cycle_id + conversation_key). O
  // rascunho da intenção é do vendedor e da conversa: sobrevive a um
  // resumo recarregado da MESMA conversa (ex.: mensagem nova do cliente);
  // só o resultado gerado a partir do resumo anterior deixa de valer
  // (MSG-01). Trocar de conversa limpa tudo (clear()).
  const stateByConversation = new Map()
  // Read-model canônico da ANÁLISE por conversa. Ele não decide técnica
  // nem próximo passo no cliente: só permite que a aba MENSAGEM transforme
  // a decisão já tomada pelo CoachingDiagnosis em atalhos executáveis.
  const analysisViewModelByConversation = new Map()
  let currentContext = null
  let renderQueued = false
  // Leitura completa (HML, flag no backend): quando a AGORA traz a
  // leitura, a MENSAGEM vem dela — objetivo recomendado, mensagem
  // sugerida ou "não enviar agora" — e o objetivo/mensagem do motor
  // antigo não aparecem. Sem leitura (flag desligada, falha), nada muda.
  let currentFullReading = null

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
      currentFullReading = null
      stateByConversation.clear()
      analysisViewModelByConversation.clear()
      removeVisibleComposer()
      return
    }

    if (
      currentFullReading &&
      buildRequestContextKey(
        currentFullReading.payload,
      ) === requestKey
    ) {
      currentFullReading = null
    }

    // Limpeza ESCOPADA invalida somente o estado/copy da MENSAGEM.
    // O CoachingDiagnosis pertence ao AnalysisViewModel canônico e continua
    // válido até a ANÁLISE ser realmente atualizada ou a fronteira inteira
    // da conversa ser descartada. Removê-lo aqui fazia a MENSAGEM cair
    // silenciosamente para seller_intents legados após registrar conversa.
    stateByConversation.delete(requestKey)

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

    const conversationKey =
      buildRequestContextKey(context.payload)

    let state =
      stateByConversation.get(conversationKey)

    if (!state) {
      state = {
        contextKey: context.key,
        intent: '',
        status: 'idle',
        message: null,
        error: null,
        feedback: null,
      }

      stateByConversation.set(
        conversationKey,
        state,
      )
    } else if (state.contextKey !== context.key) {
      // Resumo novo da MESMA conversa: a mensagem gerada a partir do
      // resumo anterior deixa de valer; o rascunho continua.
      Object.assign(state, {
        contextKey: context.key,
        status: 'idle',
        message: null,
        error: null,
        feedback: null,
      })
    }

    return state
  }

  function isStateCurrent(context, state) {
    return (
      stateByConversation.get(
        buildRequestContextKey(context.payload),
      ) === state &&
      state.contextKey === context.key
    )
  }

  function getFullReadingContext() {
    return currentFullReading
      ? {
          payload: currentFullReading.payload,
          key: currentFullReading.key,
          operationContext:
            currentFullReading.operationContext,
          fullReading: currentFullReading.view,
        }
      : null
  }

  // Contexto que a MENSAGEM usa agora: o da leitura completa, quando
  // existe; senão o do resumo do lead (comportamento de hoje).
  function getActiveContext() {
    return getFullReadingContext() || currentContext
  }

  function getFullReadingPresets(view) {
    return view?.mode === 'send' &&
      typeof view.recommended_objective === 'string' &&
      view.recommended_objective.trim()
      ? [view.recommended_objective.trim()]
      : []
  }

  // A decisão canônica muda quando muda o momentum, o frescor da intenção
  // ou a técnica — não quando "há 18 dias" vira "há 19 dias". Textos com
  // duração relativa ficam fora da assinatura de revisão do coaching.
  function stableCoachingSignaturePayload(diagnosis) {
    if (!diagnosis || typeof diagnosis !== 'object') {
      return diagnosis
    }

    const temporal =
      diagnosis.temporal &&
      typeof diagnosis.temporal === 'object'
        ? {
            momentum_state:
              diagnosis.temporal.momentum_state ?? null,
            intent_freshness:
              diagnosis.temporal.intent_freshness ?? null,
            reactivation_mode:
              diagnosis.temporal.reactivation_mode ?? null,
            requalify_before_continuing:
              diagnosis.temporal.requalify_before_continuing ?? null,
          }
        : null

    const intent =
      diagnosis.client_intent_now &&
      typeof diagnosis.client_intent_now === 'object'
        ? {
            ...diagnosis.client_intent_now,
            label: null,
          }
        : diagnosis.client_intent_now ?? null

    return {
      ...diagnosis,
      client_intent_now: intent,
      temporal,
      synthesis: null,
    }
  }

  function getGuidance(context) {
    return context?.data?.method_guidance || null
  }

  function getAnalysisViewModel(context) {
    const requestKey =
      buildRequestContextKey(
        context?.payload,
      )

    return requestKey
      ? analysisViewModelByConversation
          .get(requestKey)
          ?.data ?? null
      : null
  }

  // Opt-out do cliente ("não quero mais receber mensagens"): nenhuma
  // mensagem é permitida, nem de encerramento.
  function isCustomerContactOptOut(
    analysisViewModel,
  ) {
    const diagnosis =
      analysisViewModel?.coaching_diagnosis

    return Boolean(
      diagnosis &&
      diagnosis.status !== 'silent' &&
      diagnosis.temporal
        ?.contact_allowed === false
    )
  }

  function isCanonicalNoMessageState(
    analysisViewModel,
  ) {
    const diagnosis =
      analysisViewModel?.coaching_diagnosis

    return Boolean(
      diagnosis &&
      diagnosis.status !== 'silent' &&
      (
        diagnosis
          .chosen_technique
          ?.id ===
          'technique.commitment_wait' ||
        isCustomerContactOptOut(
          analysisViewModel,
        )
      )
    )
  }

  function getCoachingPresets(analysisViewModel) {
    const diagnosis =
      analysisViewModel?.coaching_diagnosis

    if (
      !diagnosis ||
      diagnosis.status === 'silent'
    ) {
      return []
    }

    const techniqueId =
      String(
        diagnosis
          .chosen_technique
          ?.id || '',
      )

    if (
      isCanonicalNoMessageState(
        analysisViewModel,
      )
    ) {
      return []
    }

    const presets = []

    // Tradução seller-facing da técnica já escolhida pelo Core.
    // Não existe seleção comercial nova aqui: o controller só converte
    // a decisão canônica em uma intenção clicável para o vendedor.
    if (
      techniqueId ===
        'technique.contextual_reengagement'
    ) {
      presets.push(
        'Quero criar um microcompromisso para retomar esta conversa sem repetir a pergunta anterior.',
        'Quero confirmar se o interesse continua antes de voltar ao próximo passo.',
      )
    } else if (
      techniqueId ===
        'technique.guided_choice'
    ) {
      presets.push(
        'Quero reduzir a fricção do próximo passo com poucas opções reais.',
        'Quero transformar a decisão aberta em uma escolha simples para o cliente.',
      )
    }

    const nextAction =
      typeof diagnosis
        .next_action === 'string'
        ? diagnosis
            .next_action
            .trim()
        : ''

    if (nextAction) {
      presets.push(
        `Quero executar este próximo objetivo: ${nextAction}`,
      )
    }

    return Array.from(
      new Set(
        presets.filter(Boolean),
      ),
    ).slice(0, 3)
  }

  function getPresets(
    guidance,
    analysisViewModel,
  ) {
    if (
      isCanonicalNoMessageState(
        analysisViewModel,
      )
    ) {
      // Decisão canônica de espera tem precedência sobre qualquer fallback
      // legado: não converta "aguardar" em intenção outbound.
      return []
    }

    const coaching =
      getCoachingPresets(
        analysisViewModel,
      )

    if (coaching.length > 0) {
      return coaching
    }

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
    return String(value || '')
      .replace(/^Quero\s+/i, '')
      .replace(/[.]$/, '')
      .trim()
  }

  const INTENT_MAX_LENGTH = 1000

  // Por que algo pedido pelo vendedor não entrou na copy (ex.: valor sem
  // confirmação oficial). A instrução do vendedor não cria fato.
  function renderAdvisories(advisories) {
    const items = Array.isArray(advisories)
      ? advisories.filter((item) => typeof item === 'string' && item.trim())
      : []

    if (items.length === 0) {
      return ''
    }

    return `<div class="yolen-message-advisory" data-yolen-seller-message-advisory>${items.map((item) => escapeHtml(item)).join('<br>')}</div>`
  }

  // Trace factual (claim → fonte → autoridade → status): SOMENTE no pacote
  // HML. O backend só o envia em preview; o pacote PROD nunca o desenha.
  function renderHomologFactTrace(factTrace) {
    const environment =
      typeof globalThis !== 'undefined'
        ? globalThis.YolenCompanionEnvironment
        : null

    if (
      environment?.channel !== 'homolog' ||
      !factTrace ||
      typeof factTrace !== 'object'
    ) {
      return ''
    }

    const claims = Array.isArray(factTrace.fact_trace) ? factTrace.fact_trace : []
    const blocked = Array.isArray(factTrace.blocked_claims) ? factTrace.blocked_claims : []
    const excluded = Array.isArray(factTrace.excluded_evidence) ? factTrace.excluded_evidence : []

    const claimRow = (entry) => [
      '<li>',
      `<strong>${escapeHtml(String(entry?.status || ''))}</strong> · ${escapeHtml(String(entry?.kind || ''))}`,
      ` · “${escapeHtml(String(entry?.claim || ''))}”`,
      ` · fontes: ${escapeHtml((Array.isArray(entry?.sources) ? entry.sources : []).join(', ') || 'nenhuma')}`,
      entry?.reason ? ` · ${escapeHtml(String(entry.reason))}` : '',
      '</li>',
    ].join('')
    const claimRows = claims.map(claimRow)
    const blockedRows = blocked.map(claimRow)

    const excludedRows = excluded.map((entry) =>
      `<li>${escapeHtml(String(entry?.source_type || ''))}:${escapeHtml(String(entry?.source_id ?? '-'))} · ${escapeHtml(String(entry?.reason || ''))}</li>`,
    )

    return [
      '<details class="yolen-message-fact-trace" data-yolen-seller-message-fact-trace>',
      `<summary>HML · rastreio factual (${claims.length} afirmações, ${blocked.length} removidas, ${excluded.length} evidências excluídas)</summary>`,
      claimRows.length > 0 ? `<ul>${claimRows.join('')}</ul>` : '<div>Nenhuma afirmação factual específica.</div>',
      blockedRows.length > 0 ? `<div>Removidas da copy (sem fonte válida):</div><ul>${blockedRows.join('')}</ul>` : '',
      excludedRows.length > 0 ? `<div>Evidências fora da cadeia factual:</div><ul>${excludedRows.join('')}</ul>` : '',
      '</details>',
    ].join('')
  }

  function renderComposer() {
    if (currentFullReading) {
      renderFullReadingComposer()
      return
    }

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
    const analysisViewModel =
      getAnalysisViewModel(context)
    const canonicalNoMessage =
      isCanonicalNoMessageState(
        analysisViewModel,
      )
    const coachingPresets =
      getCoachingPresets(
        analysisViewModel,
      )
    const presets = getPresets(
      guidance,
      analysisViewModel,
    )
    const trimmedIntent = state.intent.trim()
    const disabled =
      canonicalNoMessage ||
      !trimmedIntent ||
      state.status === 'loading'

    // Card do resultado só aparece com uma mensagem pronta — loading,
    // no_message e error usam um status compacto (uma linha, sem card),
    // para nunca competir em altura com o card do objetivo.
    const resultHtml =
      canonicalNoMessage
        ? isCustomerContactOptOut(
            analysisViewModel,
          )
          ? '<div class="yolen-message-status">O cliente pediu para não receber mais contato. Não envie nenhuma nova mensagem.</div>'
          : '<div class="yolen-message-status">A Yolen recomenda aguardar a resposta do cliente. Não há uma mensagem necessária agora.</div>'
        : state.status === 'ready' && state.message
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
            renderAdvisories(state.advisories),
            '<div class="yolen-message-footnote">A Yolen não envia mensagens automaticamente. Revise antes de enviar.</div>',
            renderHomologFactTrace(state.factTrace),
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

    const objectiveHtml =
      canonicalNoMessage
        ? [
            '<div class="yolen-message-objective-card">',
            '<div class="yolen-message-objective-title">Objetivo da mensagem</div>',
            '<div class="yolen-message-objective-help">A decisão comercial atual é aguardar. A Yolen não recomenda iniciar uma nova mensagem agora.</div>',
            '</div>',
          ].join('')
        : [
            '<div class="yolen-message-objective-card">',
            '<div class="yolen-message-objective-title">Objetivo da mensagem</div>',
            '<div class="yolen-message-objective-help">Escolha um foco ou descreva o que você quer comunicar.</div>',
            '<div class="yolen-message-presets">',
            presets.map((preset, index) => {
              const recommended =
                coachingPresets.length > 0 &&
                index === 0 &&
                coachingPresets[0] === preset

              return `<button type="button" class="yolen-message-preset${preset.trim() === trimmedIntent ? ' yolen-message-preset--active' : ''}" data-yolen-seller-message-preset="${index}">${recommended ? '<span class="yolen-message-preset-recommended">Recomendado pela Yolen · </span>' : ''}${escapeHtml(shortPresetLabel(preset))}</button>`
            }).join(''),
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
          ].join('')

    const html = [
      objectiveHtml,
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
    applyComposerHtml(
      box,
      html,
      context,
      state,
    )
  }

  // Ícones fixos (traço, sem emoji) do composer da leitura completa.
  const FULL_READING_COPY_ICON =
    '<svg class="yolen-fr-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>'

  const FULL_READING_CHEVRON_ICON =
    '<svg class="yolen-fr-icon yolen-fr-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>'

  const FULL_READING_DRAFT_SELECTOR =
    '[data-yolen-fr-draft]'

  // "Para: confirmar o horário da visita" — objetivo curto, sem ponto final.
  function toObjectiveLine(value) {
    const text =
      String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.!]+$/, '')

    if (text.length > 1 && /[a-zà-ÿ]/.test(text.charAt(1))) {
      return text.charAt(0).toLocaleLowerCase('pt-BR') + text.slice(1)
    }

    return text
  }

  function setFullReadingMessage(state, message, source, objective) {
    state.status = 'ready'
    state.message = message
    state.messageSource = source
    state.messageObjective = objective
    state.messageVersion = (state.messageVersion || 0) + 1
    state.error = null
  }

  // Composer da leitura completa. O HTML leva só marcadores; o texto do
  // modelo (motivo, objetivo, mensagem) entra depois com textContent ou
  // value — nunca como HTML.
  //
  //   send:    Mensagem pronta (Para: ..., editável, Incluir/Copiar) e,
  //            recolhido, "Escrever com outro objetivo".
  //   no_send: Nada a enviar agora (motivo) e, recolhido, "Escrever mesmo
  //            assim".
  function renderFullReadingComposer() {
    const context = getFullReadingContext()

    if (!context) {
      return
    }

    const dedicatedMount = document.querySelector(
      '[data-yolen-seller-message-mount]',
    )

    if (!dedicatedMount) {
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

    if (box.parentElement !== dedicatedMount) {
      dedicatedMount.appendChild(box)
    }

    const view = context.fullReading
    const state = getState(context)

    // Leitura que manda falar com o cliente: a mensagem da seção
    // "Mensagem sugerida" já vem pronta para Incluir/Copiar.
    if (
      state.status === 'idle' &&
      !state.message &&
      view.mode === 'send' &&
      typeof view.suggested_message === 'string' &&
      view.suggested_message.trim()
    ) {
      setFullReadingMessage(
        state,
        view.suggested_message.trim(),
        'reading',
        view.objective || view.recommended_objective || '',
      )
    }

    const trimmedIntent = state.intent.trim()
    const noSend = view.mode === 'no_send'
    const ready = state.status === 'ready' && typeof state.message === 'string'
    const objective = ready ? toObjectiveLine(state.messageObjective) : ''
    // v5 (rodada 8): o que revisar antes de enviar, embaixo da mensagem da
    // leitura (não da gerada com outro objetivo).
    const observation =
      ready &&
      state.messageSource === 'reading' &&
      typeof view.observation === 'string'
        ? view.observation.trim()
        : ''

    const noSendHtml = noSend
      ? [
          '<section class="yolen-fr-card" data-yolen-fr-card="no_send" data-yolen-full-reading-message-notice>',
          '<div class="yolen-fr-card-head"><div class="yolen-fr-label">Mensagem</div></div>',
          '<div class="yolen-fr-title">Nada a enviar agora</div>',
          '<div class="yolen-fr-body" data-yolen-fr-text="reason"></div>',
          '</section>',
        ].join('')
      : ''

    const messageHtml = ready
      ? [
          '<section class="yolen-fr-card yolen-fr-card--highlight" data-yolen-fr-card="message" data-yolen-full-reading-message-result>',
          '<div class="yolen-fr-card-head">',
          '<div class="yolen-fr-label">Mensagem pronta</div>',
          `<span class="yolen-fr-pill yolen-fr-pill--info">${
            state.messageSource === 'reading' ? 'Da leitura' : 'Outro objetivo'
          }</span>`,
          '</div>',
          objective
            ? '<div class="yolen-fr-for"><span class="yolen-fr-for-label">Para:</span> <span data-yolen-fr-text="objective"></span></div>'
            : '',
          '<textarea class="yolen-fr-draft" data-yolen-fr-draft rows="7" aria-label="Mensagem pronta (você pode editar)"></textarea>',
          '<div class="yolen-fr-actions">',
          `<button type="button" class="yolen-fr-button yolen-fr-button--primary" data-yolen-seller-message-action="insert">Incluir no ${escapeHtml(platformDisplayName)}</button>`,
          `<button type="button" class="yolen-fr-button yolen-fr-button--secondary" data-yolen-seller-message-action="copy">${FULL_READING_COPY_ICON}Copiar</button>`,
          '</div>',
          observation
            ? '<div class="yolen-fr-body yolen-fr-observation" data-yolen-fr-text="observation" data-yolen-full-reading-message-observation></div>'
            : '',
          '<div class="yolen-fr-note">A Yolen não envia sozinha. Revise antes de mandar.</div>',
          '</section>',
        ].join('')
      : ''

    const statusHtml =
      state.status === 'loading'
        ? '<div class="yolen-message-status"><span class="yolen-message-spinner" aria-hidden="true"></span>Gerando mensagem…</div>'
        : state.status === 'error'
          ? `<div class="yolen-message-status yolen-message-status--error">${escapeHtml(state.error || 'Não foi possível gerar a mensagem.')}</div>`
          : ''

    const customHtml = [
      `<details class="yolen-fr-collapse" data-yolen-fr-custom${state.customOpen ? ' open' : ''}>`,
      `<summary class="yolen-fr-collapse-summary"><span>${
        noSend ? 'Escrever mesmo assim' : 'Escrever com outro objetivo'
      }</span>${FULL_READING_CHEVRON_ICON}</summary>`,
      '<div class="yolen-fr-collapse-body">',
      '<div class="yolen-message-intent-field">',
      `<textarea class="yolen-message-intent" data-yolen-seller-message-intent maxlength="${INTENT_MAX_LENGTH}" aria-label="O que você quer comunicar" placeholder="Ex.: Quero responder ao ponto específico que o cliente trouxe."></textarea>`,
      `<div class="yolen-message-intent-counter" data-yolen-seller-message-counter>${state.intent.length} / ${INTENT_MAX_LENGTH}</div>`,
      '</div>',
      '<button type="button" class="yolen-fr-button yolen-fr-button--primary yolen-message-generate" data-yolen-seller-message-action="generate"',
      !trimmedIntent || state.status === 'loading' ? ' disabled' : '',
      '>',
      state.status === 'loading'
        ? '<span class="yolen-message-spinner" aria-hidden="true"></span>Gerando…'
        : 'Gerar mensagem',
      '</button>',
      '</div>',
      '</details>',
    ].join('')

    const feedbackHtml = state.feedback
      ? `<div class="yolen-message-feedback">${escapeHtml(state.feedback)}</div>`
      : ''

    const html = [
      noSendHtml,
      messageHtml,
      feedbackHtml,
      statusHtml,
      customHtml,
    ].join('')

    const texts = {
      reason: noSend ? String(view.no_send_reason || view.section_text || '') : '',
      objective,
      observation,
    }

    const renderKey = hashText(
      `${html}::${JSON.stringify(texts)}::${state.messageVersion || 0}`,
    )

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
    applyComposerHtml(
      box,
      html,
      context,
      state,
    )

    for (const [name, value] of Object.entries(texts)) {
      const target = box.querySelector(
        `[data-yolen-fr-text="${name}"]`,
      )

      if (target && target.textContent !== value) {
        target.textContent = value
      }
    }

    // A mensagem é editável: o valor do campo só é reposto quando chega
    // uma mensagem nova (da leitura ou gerada) ou quando o campo foi
    // recriado; a edição do vendedor fica no estado a cada tecla.
    const draft = box.querySelector(
      FULL_READING_DRAFT_SELECTOR,
    )

    if (
      draft &&
      (
        draft.__yolenMessageVersion !== state.messageVersion ||
        (
          draft.value !== state.message &&
          draft.ownerDocument.activeElement !== draft
        )
      )
    ) {
      draft.value = state.message || ''
      draft.__yolenMessageVersion = state.messageVersion
    }

    const field = box.querySelector(
      '[data-yolen-seller-message-intent]',
    )

    if (field && field.value !== state.intent) {
      field.value = state.intent
    }
  }

  const INTENT_FIELD_SELECTOR =
    '[data-yolen-seller-message-intent]'

  // O campo de intenção é criado uma vez por conversa e nunca recriado por
  // render: enquanto o vendedor edita, o valor do DOM é a autoridade (o
  // evento input o copia para o estado). O resto do composer (atalhos,
  // contador, botão, resultado) é trocado quando o HTML calculado muda.
  // Antes, todo render com texto novo trocava box.innerHTML inteiro: o
  // campo era recriado a cada render de fundo (polling, AGORA/ANÁLISE,
  // sessão) e o vendedor perdia foco, cursor e seleção no meio da
  // digitação (MSG-01).
  function applyComposerHtml(
    box,
    html,
    context,
    state,
  ) {
    const conversationKey =
      buildRequestContextKey(context.payload)

    const field = box.querySelector(
      INTENT_FIELD_SELECTOR,
    )

    if (
      !field ||
      box.__yolenComposerConversationKey !==
        conversationKey
    ) {
      box.innerHTML = html
      box.__yolenComposerConversationKey =
        conversationKey
      return
    }

    const template =
      document.createElement('template')
    template.innerHTML = html

    let kept = field
    let nextKept =
      template.content.querySelector(
        INTENT_FIELD_SELECTOR,
      )

    if (!nextKept) {
      // O estado canônico de espera remove deliberadamente o campo de
      // intenção. Nesse caso não existe nó equivalente para preservar:
      // remonte o composer inteiro para exibir a UI no-message sem manter
      // o textarea antigo nem dereferenciar nextKept=null.
      box.innerHTML = html
      box.__yolenComposerConversationKey =
        conversationKey
      return
    }

    while (kept !== box) {
      replaceChangedSiblings(
        kept,
        nextKept,
      )
      kept = kept.parentNode
      nextKept = nextKept.parentNode
    }

    // Só uma mudança feita pela própria MENSAGEM (atalho escolhido)
    // diverge do campo; a digitação já está no estado.
    if (field.value !== state.intent) {
      field.value = state.intent
    }
  }

  function serializeNodes(nodes) {
    return nodes
      .map((node) => node.outerHTML ?? node.textContent)
      .join('')
  }

  // Troca os irmãos de `kept` (antes e depois dele) pelos de `nextKept`
  // quando o HTML deles mudou; `kept` permanece o mesmo nó.
  function replaceChangedSiblings(
    kept,
    nextKept,
  ) {
    const parent = kept.parentNode
    const current = Array.from(parent.childNodes)
    const next = Array.from(
      nextKept.parentNode.childNodes,
    )
    const keptIndex = current.indexOf(kept)
    const nextKeptIndex = next.indexOf(nextKept)

    for (const [
      currentNodes,
      nextNodes,
      reference,
    ] of [
      [
        current.slice(0, keptIndex),
        next.slice(0, nextKeptIndex),
        kept,
      ],
      [
        current.slice(keptIndex + 1),
        next.slice(nextKeptIndex + 1),
        null,
      ],
    ]) {
      if (
        serializeNodes(currentNodes) ===
        serializeNodes(nextNodes)
      ) {
        continue
      }

      currentNodes.forEach((node) => node.remove())
      nextNodes.forEach((node) =>
        parent.insertBefore(node, reference),
      )
    }
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

  // "Gerar mensagem" com a leitura completa: o backend chama o Claude com
  // a transcrição, a leitura, o kanban, o cadastro e o objetivo. Não passa
  // pelo motor antigo e não grava nada.
  async function requestFullReadingGeneration(context, state) {
    if (!state.intent.trim()) {
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
    state.messageSource = null
    state.feedback = null
    queueRender()

    const isStillCurrent = () =>
      isStateCurrent(context, state) &&
      isOperationContextCurrent(context.operationContext)

    let result

    try {
      result = await runtime.sendMessage({
        source: 'YOLEN_COMPANION',
        action: 'GENERATE_FULL_READING_MESSAGE',
        baseUrl:
          typeof getBaseUrl === 'function'
            ? getBaseUrl() ?? null
            : null,
        payload: {
          cycle_id: context.payload.cycle_id,
          conversation_key:
            context.payload.conversation_key,
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

    const generation =
      result?.payload?.data

    if (
      !result?.ok ||
      !result?.payload?.ok ||
      generation?.status !== 'ready' ||
      typeof generation.message !== 'string' ||
      !generation.message.trim()
    ) {
      state.status = 'error'
      state.error =
        result?.payload?.error ||
        'Não foi possível gerar a mensagem agora.'
      queueRender()
      return
    }

    setFullReadingMessage(
      state,
      generation.message.trim(),
      'generated',
      state.intent.trim(),
    )
    queueRender()
  }

  async function requestGeneration() {
    const fullReadingContext = getFullReadingContext()

    if (fullReadingContext) {
      const fullReadingState = getState(fullReadingContext)

      if (fullReadingState) {
        await requestFullReadingGeneration(
          fullReadingContext,
          fullReadingState,
        )
      }

      return
    }

    const context = currentContext
    const state = getState(context)

    if (!context || !state) {
      return
    }

    if (isLegacyAiDisabled() === true) {
      return
    }

    if (
      isCanonicalNoMessageState(
        getAnalysisViewModel(context),
      )
    ) {
      state.status = 'no_message'
      state.message = null
      state.error = null
      state.feedback = null
      queueRender()
      return
    }

    if (!state.intent.trim()) {
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
    state.advisories = []
    state.factTrace = null
    queueRender()

    const requestKey =
      buildRequestContextKey(
        context.payload,
      )

    const coachingRevisionAtStart =
      requestKey
        ? analysisViewModelByConversation
            .get(requestKey)
            ?.revision ?? 0
        : 0

    // Resposta de uma geração cujo contexto já não é o atual (troca de
    // conversa, empresa ou sessão) OU cuja decisão canônica de coaching
    // mudou enquanto o backend estava em voo é descartada. A revisão é
    // monotônica: A→B→A continua sendo mudança e não pode "voltar" à mesma
    // assinatura para ressuscitar uma resposta antiga.
    const isStillCurrent = () =>
      isStateCurrent(context, state) &&
      isOperationContextCurrent(context.operationContext) &&
      (
        !requestKey ||
        (
          analysisViewModelByConversation
            .get(requestKey)
            ?.revision ?? 0
        ) === coachingRevisionAtStart
      )

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
    state.advisories = Array.isArray(generation.advisories)
      ? generation.advisories
      : []
    state.factTrace =
      generation.fact_trace && typeof generation.fact_trace === 'object'
        ? generation.fact_trace
        : null
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
    const context = getActiveContext()
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
    const context = getActiveContext()
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
      !isStateCurrent(context, state) ||
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

  // A AGORA chama a cada render com a view de mensagem da leitura (ou
  // null). Idempotente: só redesenha quando a leitura muda.
  function syncFullReading(payload, view) {
    const requestKey =
      buildRequestContextKey(payload)

    const valid =
      requestKey &&
      view &&
      typeof view === 'object' &&
      (view.mode === 'send' || view.mode === 'no_send')

    if (!valid) {
      if (
        currentFullReading &&
        (
          !requestKey ||
          buildRequestContextKey(
            currentFullReading.payload,
          ) === requestKey
        )
      ) {
        currentFullReading = null
        removeVisibleComposer()
        queueRender()
      }

      return false
    }

    const key = [
      'full-reading',
      requestKey,
      String(view.run_id || ''),
      view.mode,
      hashText(
        `${view.section_text || ''}::${view.recommended_objective || ''}`,
      ),
    ].join('::')

    if (currentFullReading?.key === key) {
      return true
    }

    currentFullReading = {
      payload: {
        cycle_id: String(payload.cycle_id).trim(),
        conversation_key: String(payload.conversation_key).trim(),
      },
      view,
      key,
      operationContext: captureOperationContext(),
    }
    queueRender()
    return true
  }

  function syncAnalysisViewModel(
    payload,
    data,
  ) {
    const requestKey =
      buildRequestContextKey(
        payload,
      )

    if (
      !requestKey ||
      !data ||
      typeof data !== 'object'
    ) {
      return false
    }

    const coachingDiagnosis =
      data.coaching_diagnosis ??
      null

    // Ausência de diagnóstico é o baseline: não existe decisão canônica
    // para invalidar uma geração iniciada apenas com o lead summary.
    // Uma assinatura só nasce quando há CoachingDiagnosis real.
    const signature =
      coachingDiagnosis === null
        ? null
        : hashText(
            JSON.stringify(
              stableCoachingSignaturePayload(
                coachingDiagnosis,
              ),
            ),
          )

    const previous =
      analysisViewModelByConversation
        .get(requestKey)

    // O primeiro sync ausente→null é apenas baseline e não invalida
    // geração. Depois que existe cache, porém, qualquer mudança de
    // assinatura é uma mudança real de decisão — inclusive diagnóstico
    // existente→null, que remove coaching antes disponível.
    const coachingChanged =
      previous
        ? previous.signature !==
          signature
        : signature !== null

    const revision =
      coachingChanged
        ? (previous?.revision ?? 0) + 1
        : previous?.revision ?? 0

    analysisViewModelByConversation
      .set(
        requestKey,
        {
          data,
          signature,
          revision,
        },
      )

    if (coachingChanged) {
      const state =
        stateByConversation.get(
          requestKey,
        )

      if (state) {
        Object.assign(
          state,
          {
            status: 'idle',
            message: null,
            error: null,
            feedback: null,
          },
        )
      }
    }

    if (
      currentContext &&
      buildRequestContextKey(
        currentContext.payload,
      ) === requestKey
    ) {
      queueRender()
    }

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

      const state = getState(getActiveContext())

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

  // Mensagem pronta editável (leitura completa): a edição vai para o
  // estado sem redesenhar (redesenhar derrubaria o cursor), e é ela que
  // Incluir/Copiar usam.
  document.addEventListener(
    'input',
    (event) => {
      const draft = event.target?.closest?.(
        FULL_READING_DRAFT_SELECTOR,
      )

      if (!draft) {
        return
      }

      const state = getState(getFullReadingContext())

      if (!state || state.status !== 'ready') {
        return
      }

      state.message = String(draft.value || '')
      state.feedback = null
    },
    true,
  )

  // "Escrever com outro objetivo" aberto continua aberto entre renders.
  document.addEventListener(
    'toggle',
    (event) => {
      const details = event.target

      if (
        !details ||
        typeof details.matches !== 'function' ||
        !details.matches('[data-yolen-fr-custom]')
      ) {
        return
      }

      const state = getState(getFullReadingContext())

      if (state) {
        state.customOpen = details.open === true
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
        const fullReadingContext = getFullReadingContext()
        const context = fullReadingContext || currentContext
        const state = getState(context)
        const presets =
          fullReadingContext
            ? getFullReadingPresets(fullReadingContext.fullReading)
            : getPresets(
                getGuidance(context),
                getAnalysisViewModel(context),
              )
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
          state.messageSource = null
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
    if (currentFullReading) {
      if (
        !document.querySelector('[data-yolen-seller-message-box]') &&
        document.querySelector('[data-yolen-seller-message-mount]')
      ) {
        queueRender()
      }

      return
    }

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
    syncAnalysisViewModel,
    syncFullReading,
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
