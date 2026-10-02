;(function initYolenManyChatMessageContent(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const SCHEMA_VERSION = 'yolen-manychat-message-content-evidence-v1'

  function identityApi() {
    const api = root.YolenManyChatMessageIdentity
    if (!api || typeof api.extractManyChatMessageIdentity !== 'function') {
      const error = new Error('YolenManyChatMessageIdentity ausente.')
      error.name = 'YolenManyChatMessageContentError'
      error.code = 'IDENTITY_UNAVAILABLE'
      throw error
    }
    return api
  }

  function queryAll(node, selector) {
    if (!node || typeof node.querySelectorAll !== 'function') return []
    try {
      return Array.from(node.querySelectorAll(selector))
    } catch {
      return []
    }
  }

  function readText(node) {
    try {
      return typeof node?.textContent === 'string' ? node.textContent : ''
    } catch {
      return ''
    }
  }

  // ------------------------------------------------------------------
  // Estrutura da bolha (rodada 6). O ManyChat mostra numa bolha só: a
  // citação de outra mensagem (resposta a uma mensagem do bot ou do
  // vendedor, com o rótulo de quem foi citado), o texto e, nas mensagens
  // do bot, os botões. textContent junta tudo sem separador — era assim
  // que "Bot" + texto do bot + escolha do cliente chegavam como fala do
  // cliente. Aqui a citação, os botões e o controle "ver mais" saem do
  // texto pela estrutura (tag, role, classes do CSS module e data-test-id).
  // Sem nada disso na bolha, o texto é exatamente o textContent de antes
  // (nenhuma mensagem já gravada muda de versão à toa).

  const ELEMENT_NODE = 1
  const TEXT_NODE = 3

  const EXPAND_CONTROL_TEXT =
    /^(?:ver mais|ler mais|mostrar mais|exibir mais|show more|read more|see more|more)$/i

  function elementTokens(element) {
    const tokens = []

    try {
      const className =
        typeof element.getAttribute === 'function'
          ? element.getAttribute('class')
          : null

      if (typeof className === 'string') {
        tokens.push(...className.split(/\s+/).filter(Boolean))
      }

      for (const name of ['data-test-id', 'data-testid']) {
        const value =
          typeof element.getAttribute === 'function'
            ? element.getAttribute(name)
            : null

        if (typeof value === 'string' && value) {
          tokens.push(value)
        }
      }
    } catch {
      return tokens
    }

    return tokens
  }

  function tagName(element) {
    return typeof element?.tagName === 'string'
      ? element.tagName.toUpperCase()
      : ''
  }

  function isQuoteElement(element) {
    if (tagName(element) === 'BLOCKQUOTE') {
      return true
    }

    return elementTokens(element).some((token) =>
      /quot/i.test(token) ||
      /(?:^|[_-])(?:reply|replyto|replied|repliedmessage|replymessage|messagereply|replycontext|context|contextmessage)(?:[_-]|$)/i.test(token),
    )
  }

  function isButtonElement(element) {
    const tag = tagName(element)

    if (tag === 'BUTTON' || tag === 'A') {
      return true
    }

    try {
      if (element.getAttribute?.('role') === 'button') {
        return true
      }
    } catch {
      return false
    }

    return elementTokens(element).some((token) =>
      /button|(?:^|[_-])btns?(?:[_-]|$)|quickrepl/i.test(token),
    )
  }

  function isMetaElement(element) {
    return elementTokens(element).some((token) =>
      /(?:^|[_-])(?:time|timestamp|date|status|avatar|author|sender|name|username)(?:[_-]|$)/i.test(token),
    )
  }

  function isTruncationElement(element) {
    return elementTokens(element).some((token) =>
      /truncat|ellips|(?:^|[_-])(?:clamp|clamped|collapsed)(?:[_-]|$)/i.test(token),
    )
  }

  function childNodesOf(node) {
    try {
      return node && node.childNodes ? Array.from(node.childNodes) : null
    } catch {
      return null
    }
  }

  // Elementos (fora de citações/botões já marcados) que casam com `match`,
  // do mais externo para dentro: um botão dentro de uma citação fica na
  // citação.
  function findOutermost(node, match) {
    const found = []

    const visit = (current) => {
      for (const child of childNodesOf(current) || []) {
        if (child?.nodeType !== ELEMENT_NODE) {
          continue
        }

        if (match(child)) {
          found.push(child)
          continue
        }

        visit(child)
      }
    }

    visit(node)

    return found
  }

  const BLOCK_TAGS =
    new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'HEADER', 'FOOTER'])

  // textContent sem os subárvores puladas (mesma concatenação, sem
  // separador novo). blockBreaks: espaço entre blocos (só no texto do bot,
  // que é novo; o texto humano continua idêntico ao textContent).
  function textExcluding(node, skipped, { blockBreaks = false } = {}) {
    if (skipped.length === 0 && !blockBreaks) {
      return readText(node)
    }

    if (!childNodesOf(node)) {
      return readText(node)
    }

    const parts = []

    const visit = (current) => {
      for (const child of childNodesOf(current) || []) {
        if (child?.nodeType === TEXT_NODE) {
          parts.push(typeof child.nodeValue === 'string' ? child.nodeValue : '')
        } else if (child?.nodeType === ELEMENT_NODE && !skipped.includes(child)) {
          const block = blockBreaks && BLOCK_TAGS.has(tagName(child))

          if (block) parts.push(' ')
          visit(child)
          if (block) parts.push(' ')
        }
      }
    }

    visit(node)

    return parts.join('')
  }

  function collapse(value) {
    return String(value || '').replace(/\s+/g, ' ').trim()
  }

  // Bolha humana (cliente ou vendedor): a citação sai do texto e fica à
  // parte; o rótulo de quem foi citado ("Bot", nome da página) é o primeiro
  // pedaço dela quando vem num elemento próprio.
  function splitHumanBubble(contentNode) {
    if (!childNodesOf(contentNode)) {
      return null
    }

    const quotes = findOutermost(contentNode, isQuoteElement)

    if (quotes.length === 0) {
      return null
    }

    const reply = collapse(textExcluding(contentNode, quotes))

    if (!reply) {
      return null
    }

    const quoteNode = quotes[0]
    const labelNode = findOutermost(quoteNode, isMetaElement)[0] ?? null

    return Object.freeze({
      text: reply,
      quoted_text: collapse(textExcluding(quoteNode, labelNode ? [labelNode] : [])),
      quote_label: labelNode ? collapse(readText(labelNode)) : null,
    })
  }

  // Botões: o elemento de botão mais interno (um contêiner "_buttons_"
  // com vários botões dentro não é um botão).
  function findButtons(node) {
    const found = []

    const visit = (current) => {
      for (const child of childNodesOf(current) || []) {
        if (child?.nodeType !== ELEMENT_NODE) {
          continue
        }

        if (isButtonElement(child) && findOutermost(child, isButtonElement).length === 0) {
          found.push(child)
          continue
        }

        visit(child)
      }
    }

    visit(node)

    return found
  }

  function readFullTextHint(contentNode, visible) {
    const stem = visible.replace(/(?:…|\.\.\.)\s*$/, '').trim()

    if (stem.length < 8) {
      return null
    }

    const candidates = []

    const visit = (current) => {
      for (const attribute of ['title', 'aria-label', 'data-full-text']) {
        try {
          const value = current.getAttribute?.(attribute)

          if (typeof value === 'string') {
            candidates.push(collapse(value))
          }
        } catch {
          // ignora atributo ilegível
        }
      }

      for (const child of childNodesOf(current) || []) {
        if (child?.nodeType === ELEMENT_NODE) {
          visit(child)
        }
      }
    }

    visit(contentNode)

    return candidates.find((value) => value.length > stem.length && value.startsWith(stem)) ?? null
  }

  // Bolha do bot: texto sem botões nem "ver mais", rótulos dos botões à
  // parte, e se o texto veio cortado pelo ManyChat (com o texto inteiro
  // quando ele existe no DOM).
  function readAutomationBubble(contentNode) {
    if (!contentNode) {
      return null
    }

    const structured = Boolean(childNodesOf(contentNode))
    const buttons = structured ? findButtons(contentNode) : []
    const meta = structured ? findOutermost(contentNode, isMetaElement) : []
    const labels = []
    let expandable = false

    for (const button of buttons) {
      const label = collapse(readText(button))

      if (!label) {
        continue
      }

      if (EXPAND_CONTROL_TEXT.test(label)) {
        expandable = true
        continue
      }

      if (!labels.includes(label)) {
        labels.push(label)
      }
    }

    let body = collapse(textExcluding(contentNode, [...buttons, ...meta], { blockBreaks: true }))
    const endsCut = /(?:…|\.\.\.)$/.test(body)
    const cutByLayout =
      endsCut &&
      (expandable || (structured && findOutermost(contentNode, isTruncationElement).length > 0))

    let truncated = false

    if (endsCut && (cutByLayout || expandable)) {
      const full = structured ? readFullTextHint(contentNode, body) : null

      if (full) {
        body = full
      } else {
        truncated = true
      }
    }

    return Object.freeze({
      body,
      buttons: Object.freeze(labels),
      truncated,
    })
  }

  // ------------------------------------------------------------------
  // Linha de sistema (rodada 9, B1). O ManyChat mostra na conversa, além das
  // bolhas, linhas do sistema de atendimento ("Conversa atribuída a ...",
  // "Regra acionada", "Tag adicionada"). Elas chegam com as mesmas marcas
  // de saída do bot (_typeOut_ + _botMessage_), mas não são mensagem. A
  // estrutura que as separa é a classe do CSS module (ou data-test-id) de
  // linha de sistema/evento no wrapper ou dentro dele. O texto
  // (manychat-message-profile.js) é a reserva quando a estrutura não diz.
  const SYSTEM_LINE_TOKEN =
    /(?:^|[_-])(?:system|systemMessage|systemLine|systemEvent|event|eventMessage|eventLine|activity|activityMessage|notification|serviceMessage|liveChatEvent|timelineEvent|conversationEvent)(?:[_-]|$)/i

  function isManyChatSystemLine(node) {
    if (!node) {
      return false
    }

    if (elementTokens(node).some((token) => SYSTEM_LINE_TOKEN.test(token))) {
      return true
    }

    return findOutermost(node, (element) =>
      elementTokens(element).some((token) => SYSTEM_LINE_TOKEN.test(token)),
    ).length > 0
  }

  function findSingleNativeContentNode(node) {
    const matches = queryAll(node, '[data-mid]')
    return Object.freeze({
      count: matches.length,
      node: matches.length === 1 ? matches[0] : null,
    })
  }

  function structuralMedia(node) {
    return Object.freeze({
      audio: queryAll(node, 'audio').length,
      video: queryAll(node, 'video').length,
      image: queryAll(node, 'img').length,
      canvas: queryAll(node, 'canvas').length,
    })
  }

  function base(identity) {
    return {
      schema_version: SCHEMA_VERSION,
      platform: PLATFORM,
      author_kind: identity?.author_kind ?? 'unknown',
      direction: identity?.direction ?? 'unknown',
      message_key_eligible: identity?.message_key_eligible === true,
      identity_ready: identity?.ready === true,
      content_type: null,
      text_content: null,
      audio_transcription: null,
      content_node_source: null,
      content_node_count: 0,
      content_ready: false,
      reason: null,
      capture_enabled: false,
      persistence_enabled: false,
      reasoning_enabled: false,
    }
  }

  function extractManyChatMessageContent(node) {
    const identity = identityApi().extractManyChatMessageIdentity(node)
    const evidence = base(identity)

    if (identity.author_kind === 'automation') {
      return Object.freeze({
        ...evidence,
        reason: 'automation_content_context_only',
      })
    }

    if (identity.author_kind === 'unknown') {
      return Object.freeze({
        ...evidence,
        reason: 'semantic_author_unknown',
      })
    }

    if (!identity.ready) {
      return Object.freeze({
        ...evidence,
        reason: identity.reason ?? 'identity_not_ready',
      })
    }

    const native = findSingleNativeContentNode(node)
    if (native.count !== 1 || !native.node) {
      return Object.freeze({
        ...evidence,
        content_node_count: native.count,
        reason:
          native.count === 0
            ? 'native_content_node_missing'
            : 'native_content_node_ambiguous',
      })
    }

    const text = readText(native.node)
    const media = structuralMedia(native.node)
    const hasText = text.length > 0
    const hasUnsupportedVisualMedia =
      media.video > 0 || media.image > 0 || media.canvas > 0

    if (hasUnsupportedVisualMedia) {
      return Object.freeze({
        ...evidence,
        content_node_source: 'data-mid',
        content_node_count: 1,
        reason: 'visual_media_content_not_validated',
      })
    }

    if (media.audio > 1) {
      return Object.freeze({
        ...evidence,
        content_node_source: 'data-mid',
        content_node_count: 1,
        reason: 'audio_content_ambiguous',
      })
    }

    if (media.audio === 1 && hasText) {
      return Object.freeze({
        ...evidence,
        content_node_source: 'data-mid',
        content_node_count: 1,
        reason: 'mixed_audio_text_content_not_validated',
      })
    }

    if (media.audio === 1) {
      return Object.freeze({
        ...evidence,
        content_type: 'audio',
        text_content: null,
        audio_transcription: null,
        content_node_source: 'data-mid',
        content_node_count: 1,
        content_ready: true,
        reason: null,
      })
    }

    if (hasText) {
      // Resposta com citação: só a resposta vira o texto; a citação fica
      // à parte (quoted_text), para a captura saber o que foi citado.
      const bubble = splitHumanBubble(native.node)

      return Object.freeze({
        ...evidence,
        content_type: 'text',
        text_content: bubble ? bubble.text : text,
        audio_transcription: null,
        content_node_source: 'data-mid',
        content_node_count: 1,
        content_ready: true,
        reason: null,
        quoted_text: bubble?.quoted_text || null,
        quote_label: bubble?.quote_label || null,
      })
    }

    return Object.freeze({
      ...evidence,
      content_node_source: 'data-mid',
      content_node_count: 1,
      reason: 'empty_content_not_classified',
    })
  }

  // Mensagem do bot para a captura (rodada 6): saída da empresa, autoria
  // automation, nunca fala do cliente nem ação do vendedor. A evidência de
  // diagnóstico (extractManyChatMessageContent) continua tratando
  // automação como contexto.
  function extractManyChatAutomationContent(node) {
    const identity = identityApi().extractManyChatMessageIdentity(node)

    if (identity.author_kind !== 'automation' || typeof identity.occurred_at !== 'string') {
      return null
    }

    const native = findSingleNativeContentNode(node)
    const contentNode = native.count === 1 && native.node ? native.node : node
    const media = structuralMedia(contentNode)

    if (media.audio > 0 || media.video > 0) {
      return null
    }

    const bubble = readAutomationBubble(contentNode)

    if (!bubble || (!bubble.body && bubble.buttons.length === 0)) {
      return null
    }

    return Object.freeze({
      occurred_at: identity.occurred_at,
      native_message_id:
        native.count === 1
          ? (native.node?.getAttribute?.('data-mid') || '').trim() || null
          : null,
      body: bubble.body,
      buttons: bubble.buttons,
      truncated: bubble.truncated,
      // Rodada 9: linha de sistema pela estrutura, e o texto da linha com
      // os links no lugar (o nome da regra ou da automação não é opção de
      // menu).
      system_line: isManyChatSystemLine(node),
      line_text: collapse(textExcluding(contentNode, [], { blockBreaks: true })),
    })
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
  }

  function safeManyChatMessageContentView(value) {
    const text = typeof value?.text_content === 'string'
      ? value.text_content
      : null

    return Object.freeze({
      schema_version: value?.schema_version ?? SCHEMA_VERSION,
      platform: value?.platform ?? PLATFORM,
      author_kind: value?.author_kind ?? 'unknown',
      direction: value?.direction ?? 'unknown',
      content_type: value?.content_type ?? null,
      content_node_source: value?.content_node_source ?? null,
      content_node_count: Number.isInteger(value?.content_node_count)
        ? value.content_node_count
        : 0,
      text_present: Boolean(text),
      text_length: text?.length ?? 0,
      text_fingerprint: text ? fnv1a(text) : null,
      audio_transcription_present:
        typeof value?.audio_transcription === 'string' &&
        value.audio_transcription.length > 0,
      content_ready: value?.content_ready === true,
      reason: value?.reason ?? null,
      privacy: Object.freeze({
        raw_text_exposed: false,
        input_values_read: false,
        network_sent: false,
        persisted: false,
      }),
    })
  }

  function summarizeManyChatMessageContent(nodes) {
    const evidence = Array.from(nodes ?? []).map(extractManyChatMessageContent)

    return Object.freeze({
      schema_version: 'yolen-manychat-message-content-summary-v1',
      platform: PLATFORM,
      total: evidence.length,
      human_total: evidence.filter(
        (item) => item.author_kind === 'customer' || item.author_kind === 'human_agent',
      ).length,
      text_ready: evidence.filter(
        (item) => item.content_ready && item.content_type === 'text',
      ).length,
      audio_ready: evidence.filter(
        (item) => item.content_ready && item.content_type === 'audio',
      ).length,
      automation_total: evidence.filter(
        (item) => item.author_kind === 'automation',
      ).length,
      automation_blocked: evidence.filter(
        (item) =>
          item.author_kind === 'automation' &&
          item.content_ready === false &&
          item.reason === 'automation_content_context_only',
      ).length,
      unknown_total: evidence.filter(
        (item) => item.author_kind === 'unknown',
      ).length,
      not_ready_total: evidence.filter((item) => !item.content_ready).length,
      privacy: Object.freeze({
        raw_text_exposed: false,
        input_values_read: false,
        network_sent: false,
        persisted: false,
      }),
    })
  }

  const api = Object.freeze({
    PLATFORM,
    SCHEMA_VERSION,
    extractManyChatMessageContent,
    extractManyChatAutomationContent,
    isManyChatSystemLine,
    safeManyChatMessageContentView,
    summarizeManyChatMessageContent,
  })

  root.YolenManyChatMessageContent = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
