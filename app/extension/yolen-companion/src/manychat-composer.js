;(function initYolenManyChatComposer(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const CONVERSATION_ANCHOR_SELECTOR = '[data-test-id="chat-messages-list"]'

  // Evidência live confirmada: o composer real do ManyChat é um <textarea>
  // sem qualquer atributo estável (aria-label, role, data-test-id) e sem
  // classe não-gerada. As classes observadas (_input_*, _inputWrapper_*,
  // _inputScrollContainer_*, _wrapper_*, _base_*, _chatColumn_*,
  // _contentRow_*, _mainContent_*) são hashes de build e NUNCA podem virar
  // seletor. O único fato estrutural comprovado é: existe exatamente UM
  // <textarea> visível/habilitável na conversa aberta. Por isso a
  // resolução aqui é estrutural (tag + estado, nunca classe) e fail-closed
  // quando esse fato não se sustenta (0 ou mais de 1 candidato).

  function isVisible(node, documentRef) {
    if (!node || typeof node !== 'object') return false
    if (node.hidden === true) return false

    // Checagem pelo display/visibility do PRÓPRIO elemento (não do
    // subtree renderizado): pega o caso comum de "este textarea tem
    // display:none/visibility:hidden", mas não substitui um motor de
    // layout real (jsdom não tem um). offsetParent seria mais robusto em
    // navegador real, mas é sempre null em jsdom (sem layout), então não é
    // usado aqui para não gerar falso-negativo em teste.
    const windowRef = documentRef?.defaultView ?? root.window ?? root
    if (typeof windowRef?.getComputedStyle === 'function') {
      try {
        const style = windowRef.getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden') {
          return false
        }
      } catch {
        // segue avaliando por outros sinais
      }
    }

    return true
  }

  // Hardening trazido da referência congelada (STEP 2B.5-D1): o campo de
  // intenção da MENSAGEM do próprio Companion também é um <textarea> dentro
  // do painel da Yolen — nunca é candidato ao composer real do ManyChat.
  function isEligibleTextarea(node, documentRef) {
    if (!node || node.tagName !== 'TEXTAREA') return false
    if (node.disabled === true) return false
    if (node.readOnly === true) return false
    if (typeof node.closest === 'function' && node.closest('#yolen-companion-panel')) return false
    return isVisible(node, documentRef)
  }

  // Resolve o composer de forma estrutural e fail-closed: exige a âncora
  // de conversa válida e exatamente UM <textarea> elegível. Nunca escreve
  // em campo ambíguo.
  function resolveManyChatComposer({ document: documentRef = root.document } = {}) {
    if (!documentRef || typeof documentRef.querySelector !== 'function') {
      return Object.freeze({ ready: false, reason: 'document_unavailable', node: null })
    }

    if (!documentRef.querySelector(CONVERSATION_ANCHOR_SELECTOR)) {
      return Object.freeze({ ready: false, reason: 'conversation_anchor_missing', node: null })
    }

    let candidates
    try {
      candidates = Array.from(documentRef.querySelectorAll('textarea')).filter((node) =>
        isEligibleTextarea(node, documentRef),
      )
    } catch {
      return Object.freeze({ ready: false, reason: 'query_failed', node: null })
    }

    if (candidates.length === 0) {
      return Object.freeze({ ready: false, reason: 'composer_not_found', node: null })
    }

    if (candidates.length > 1) {
      return Object.freeze({ ready: false, reason: 'composer_ambiguous', node: null })
    }

    return Object.freeze({ ready: true, reason: null, node: candidates[0] })
  }

  function nativeValueSetter(node, windowRef) {
    const TextAreaProto = windowRef?.HTMLTextAreaElement?.prototype
    const descriptor = TextAreaProto
      ? Object.getOwnPropertyDescriptor(TextAreaProto, 'value')
      : null

    return typeof descriptor?.set === 'function' ? descriptor.set : null
  }

  // Aplica texto sugerido no composer por AÇÃO EXPLÍCITA do vendedor.
  // Nunca envia, nunca clica em enviar, nunca sobrescreve texto já
  // existente (preserva o que o vendedor já escreveu — fail closed em vez
  // de decidir por ele), dispara os eventos que o React precisa para
  // reconhecer a mudança, e valida que o valor realmente entrou antes de
  // reportar sucesso.
  // replaceExisting (FASE 6): só com substituição confirmada pelo vendedor
  // (decisão do Core); sem ela, rascunho existente continua preservado.
  function applyManyChatComposerSuggestion({
    document: documentRef = root.document,
    window: windowRef = documentRef?.defaultView ?? root.window ?? root,
    text,
    replaceExisting = false,
  } = {}) {
    const suggestion = typeof text === 'string' ? text.trim() : ''
    if (!suggestion) {
      return Object.freeze({ applied: false, reason: 'suggestion_empty' })
    }

    const resolved = resolveManyChatComposer({ document: documentRef })
    if (!resolved.ready) {
      return Object.freeze({ applied: false, reason: resolved.reason })
    }

    const node = resolved.node

    if (
      typeof node.value === 'string' &&
      node.value.trim().length > 0 &&
      replaceExisting !== true
    ) {
      return Object.freeze({ applied: false, reason: 'composer_not_empty' })
    }

    const setValue = nativeValueSetter(node, windowRef)

    try {
      if (setValue) {
        setValue.call(node, suggestion)
      } else {
        node.value = suggestion
      }

      const EventCtor = windowRef?.Event ?? (typeof Event !== 'undefined' ? Event : null)
      if (EventCtor) {
        node.dispatchEvent(new EventCtor('input', { bubbles: true }))
        node.dispatchEvent(new EventCtor('change', { bubbles: true }))
      }

      if (typeof node.focus === 'function') {
        node.focus()
      }

      if (typeof node.setSelectionRange === 'function') {
        const end = node.value.length
        node.setSelectionRange(end, end)
      }
    } catch (error) {
      return Object.freeze({
        applied: false,
        reason: 'apply_exception',
        detail: error instanceof Error ? error.message : null,
      })
    }

    if (node.value !== suggestion) {
      return Object.freeze({ applied: false, reason: 'apply_verification_failed' })
    }

    return Object.freeze({ applied: true, reason: null })
  }

  const api = Object.freeze({
    PLATFORM,
    CONVERSATION_ANCHOR_SELECTOR,
    resolveManyChatComposer,
    applyManyChatComposerSuggestion,
  })

  root.YolenManyChatComposer = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
