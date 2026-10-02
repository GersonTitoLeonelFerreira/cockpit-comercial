;(function initYolenManyChatMessageProfile(root) {
  'use strict'

  const PLATFORM = 'manychat'

  function identityApi() {
    const api = root.YolenManyChatMessageIdentity
    if (!api || typeof api.extractManyChatMessageIdentity !== 'function') {
      const error = new Error('YolenManyChatMessageIdentity ausente.')
      error.name = 'YolenManyChatMessageProfileError'
      error.code = 'IDENTITY_UNAVAILABLE'
      throw error
    }
    return api
  }

  function contentApi() {
    const api = root.YolenManyChatMessageContent
    if (!api || typeof api.extractManyChatMessageContent !== 'function') {
      const error = new Error('YolenManyChatMessageContent ausente.')
      error.name = 'YolenManyChatMessageProfileError'
      error.code = 'CONTENT_UNAVAILABLE'
      throw error
    }
    return api
  }

  function buildMessageKey(nativeMessageId) {
    const value = typeof nativeMessageId === 'string' ? nativeMessageId.trim() : ''
    return value ? `${PLATFORM}:${encodeURIComponent(value)}` : null
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
  }

  // ------------------------------------------------------------------
  // Mensagens do bot (rodada 6). O ManyChat não dá data-mid às mensagens
  // de automação; a chave vem do minuto + começo do texto (estável entre
  // leituras, inclusive com o texto cortado ou expandido) e, para dois
  // textos iguais no mesmo minuto, a ordem na leitura.
  const AUTOMATION_KEY_TEXT_LENGTH = 80
  const OPTIONS_PREFIX = '[opções: '
  const TRUNCATED_MARK = ' [texto cortado no ManyChat]'
  const CHOICE_PREFIX = '[escolheu no menu] '

  // ------------------------------------------------------------------
  // Eventos do sistema de atendimento (rodada 9, B). Mesmas frases do
  // classificador do servidor (app/lib/companion/full-reading/
  // conversation-events.ts); os testes conferem os dois com as mesmas
  // linhas. Úteis: atribuição de atendente, conversa fechada ou reaberta,
  // automação pausada (entram no ledger com o texto da linha, os links no
  // lugar). Internos (campo personalizado, tag, regra ou automação
  // acionada, atraso inteligente, mudança de fila) não entram.
  const OPTIONS_SUFFIX = /\n?\s*\[opções: [^\]]*\]\s*$/
  const MOVED_PATTERNS = [
    /^a conversa foi movida de (.+?) para (.+?)$/i,
    /^conversa movida de (.+?) para (.+?)$/i,
    /^conversation (?:was )?moved from (.+?) to (.+?)$/i,
  ]
  const CLOSED_STATE = /fechad|closed/i
  const ASSIGNMENT_PATTERNS = [
    /^atribuir automaticamente a (.+?) pela automação\b/i,
    /^conversa atribuída automaticamente a (.+?)$/i,
    /^conversa atribuída a (.+?)$/i,
    /^conversation (?:was )?assigned to (.+?)$/i,
  ]
  const AUTOMATION_PAUSED =
    /automação das respostas foi desativada|respostas automáticas (?:foram )?(?:pausadas|desativadas)|automação (?:foi )?pausada|automation (?:was )?paused/i
  const INTERNAL_PATTERNS = [
    /^campo personalizado\b/i,
    /^tag (?:adicionada|removida)\b/i,
    /^regra acionada\b/i,
    /^a automação foi acionada\b/i,
    /^automação acionada\b/i,
    /atraso inteligente/i,
    /^conversa desatribuída\b/i,
    /^atribuição (?:removida|desfeita)\b/i,
    /^custom field\b/i,
    /^tag (?:added|removed)\b/i,
    /^rule triggered\b/i,
    /^automation (?:was )?triggered\b/i,
    /^smart delay\b/i,
    /^conversation (?:was )?unassigned\b/i,
  ]

  function stripEnd(value) {
    return String(value || '').replace(/[\s.:;]+$/, '').trim()
  }

  // { kind: 'assignment'|'closed'|'reopened'|'automation_paused'|'internal' }
  // ou null (mensagem de verdade).
  function classifyManyChatEventText(rawText) {
    if (typeof rawText !== 'string') {
      return null
    }

    const text = rawText.replace(OPTIONS_SUFFIX, '').replace(/\s+/g, ' ').trim()

    if (!text) {
      return null
    }

    for (const pattern of MOVED_PATTERNS) {
      const match = pattern.exec(stripEnd(text))

      if (match) {
        const from = match[1] || ''
        const to = match[2] || ''

        if (CLOSED_STATE.test(to) && !CLOSED_STATE.test(from)) {
          return { kind: 'closed' }
        }

        if (CLOSED_STATE.test(from) && !CLOSED_STATE.test(to)) {
          return { kind: 'reopened' }
        }

        return { kind: 'internal' }
      }
    }

    for (const pattern of ASSIGNMENT_PATTERNS) {
      const match = pattern.exec(stripEnd(text))

      if (match) {
        return stripEnd(match[1]) ? { kind: 'assignment' } : { kind: 'internal' }
      }
    }

    if (AUTOMATION_PAUSED.test(text)) {
      return { kind: 'automation_paused' }
    }

    if (INTERNAL_PATTERNS.some((pattern) => pattern.test(text))) {
      return { kind: 'internal' }
    }

    return null
  }

  function automationKeyText(body) {
    return String(body || '')
      .replace(/(?:…|\.\.\.)\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, AUTOMATION_KEY_TEXT_LENGTH)
  }

  function buildAutomationBaseKey(content) {
    if (content.native_message_id) {
      return buildMessageKey(content.native_message_id)
    }

    const minute = content.occurred_at.slice(0, 16)
    const text = automationKeyText(content.body) || content.buttons.join('|')

    return `${PLATFORM}:auto:${fnv1a(`${minute}|${text}`)}`
  }

  function buildAutomationText(content) {
    const parts = []

    if (content.body) {
      parts.push(content.truncated ? `${content.body}${TRUNCATED_MARK}` : content.body)
    }

    if (content.buttons.length > 0) {
      parts.push(`${OPTIONS_PREFIX}${content.buttons.join(' · ')}]`)
    }

    return parts.join('\n')
  }

  // Lê uma mensagem elegível para captura a partir do wrapper DOM já
  // validado por manychat-message-semantics/identity/content. Usado como
  // profile.readMessage pelo manychat-dom-reader genérico.
  //
  // Retorna null para um nó que NÃO é elegível para virar mensagem
  // canônica nesta versão — o dom reader trata null como "pular este nó",
  // nunca como erro de lote (uma conversa real mistura mensagens elegíveis
  // com outras que ainda não têm evidência suficiente). Isso acontece
  // sempre que:
  //
  // - author_kind = automation: mensagens de automação/flow do ManyChat
  //   não possuem identidade nativa (data-mid) estável comprovada (ver
  //   manychat-message-identity.js) — nunca são persistidas como mensagem
  //   canônica nesta versão, para não arriscar histórico comercial falso
  //   (uma automação nunca pode contar como ação do vendedor ou decisão
  //   do cliente).
  // - author_kind = unknown, identidade nativa ausente/ambígua, ou
  //   conteúdo ainda não classificável (mídia visual não suportada, áudio
  //   ambíguo etc.): evidência insuficiente — fail closed, nunca inventa
  //   dado a partir de posição no DOM, texto ou timestamp isolado.
  function readManyChatAutomation(node, collection) {
    const extract = contentApi().extractManyChatAutomationContent

    if (typeof extract !== 'function') {
      return null
    }

    const content = extract(node)

    if (!content) {
      return null
    }

    // Rodada 9 (B1): linha de sistema pela estrutura; o texto é a reserva.
    // Evento interno (ou linha de sistema que não é um evento útil) não
    // vira mensagem. A ausência dele nunca é exclusão: o ManyChat não marca
    // mensagem apagada e o servidor não trata sumiço como exclusão.
    const lineText = content.line_text || content.body
    const textEvent =
      classifyManyChatEventText(lineText) ??
      classifyManyChatEventText(buildAutomationText(content))
    const isEvent = content.system_line === true || textEvent !== null

    if (isEvent && (!textEvent || textEvent.kind === 'internal')) {
      return null
    }

    const baseKey = buildAutomationBaseKey(content)

    if (!baseKey) {
      return null
    }

    let messageKey = baseKey

    if (collection) {
      const seen = (collection.automationKeys.get(baseKey) ?? 0) + 1
      collection.automationKeys.set(baseKey, seen)
      messageKey = seen === 1 ? baseKey : `${baseKey}:${seen}`
      collection.details.set(messageKey, Object.freeze({
        automation_body: isEvent ? lineText : content.body,
        buttons: isEvent ? [] : content.buttons,
        system_event: isEvent ? textEvent.kind : null,
      }))
    }

    return {
      message_key: messageKey,
      direction: 'outgoing',
      author_kind: 'automation',
      occurred_at: content.occurred_at,
      content_type: 'text',
      // Evento útil: o texto da linha, com os links no lugar (sem
      // "[opções: ...]").
      text_content: isEvent ? lineText : buildAutomationText(content),
      audio_transcription: null,
      is_deleted: false,
      deletion_reason: null,
    }
  }

  function readManyChatMessage(node, collectionArgument = null) {
    // O dom reader chama readMessage(node, index, surface): só um objeto
    // de coleção conta.
    const collection =
      collectionArgument &&
      typeof collectionArgument === 'object' &&
      collectionArgument.details instanceof Map
        ? collectionArgument
        : null

    const content = contentApi().extractManyChatMessageContent(node)

    if (content.author_kind === 'automation') {
      return readManyChatAutomation(node, collection)
    }

    if (content.content_ready !== true) {
      return null
    }

    const identity = identityApi().extractManyChatMessageIdentity(node)
    const messageKey = buildMessageKey(identity.native_message_id)

    if (!messageKey || typeof identity.occurred_at !== 'string') {
      return null
    }

    if (collection && content.quoted_text) {
      collection.details.set(messageKey, Object.freeze({
        quoted_text: content.quoted_text,
        quote_label: content.quote_label ?? null,
      }))
    }

    return {
      message_key: messageKey,
      direction: identity.direction,
      author_kind: identity.author_kind,
      occurred_at: identity.occurred_at,
      content_type: content.content_type,
      text_content: content.text_content,
      audio_transcription: content.audio_transcription,
      is_deleted: false,
      deletion_reason: null,
    }
  }

  // Uma leitura da conversa visível: chaves do bot sem colisão e o que cada
  // bolha citava, para a reconciliação depois de ler todas.
  function createManyChatCollection() {
    const collection = {
      automationKeys: new Map(),
      details: new Map(),
    }

    return Object.freeze({
      details: collection.details,
      read: (node) => readManyChatMessage(node, collection),
    })
  }

  // ------------------------------------------------------------------
  // Reconciliação (rodada 6): com todas as mensagens visíveis lidas, tira
  // a citação que ainda ficou colada no texto de um cliente/vendedor (a
  // estrutura nem sempre a separa) e marca a escolha num botão do bot como
  // "[escolheu no menu] X". A citação é procurada no começo da bolha:
  // rótulo curto + o texto de uma mensagem anterior visível (inteiro, ou
  // cortado com "…"), seguido da resposta.
  // Rótulo de quem foi citado ("Bot", nome da página): curto e sem
  // pontuação de frase. Exigir rótulo e autoria diferente evita tirar de
  // uma mensagem um começo que só coincide com outra mensagem.
  const QUOTE_LABEL_MAX = 40
  const QUOTE_MIN_MATCH = 8
  const CHOICE_MAX_LENGTH = 40
  const CHOICE_MAX_WORDS = 6

  function squash(text) {
    const chars = []
    const positions = []

    for (let index = 0; index < text.length; index += 1) {
      if (!/\s/.test(text[index])) {
        chars.push(text[index])
        positions.push(index)
      }
    }

    return { value: chars.join(''), positions }
  }

  function normalizeChoice(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR')
  }

  function readOptions(text) {
    const match = /\[opções: ([^\]]*)\]\s*$/.exec(String(text || ''))
    return match ? match[1].split(' · ').map(normalizeChoice).filter(Boolean) : []
  }

  function quotableBody(message, details) {
    const fromDetails = details?.get(message.message_key)?.automation_body

    if (typeof fromDetails === 'string' && fromDetails) {
      return fromDetails
    }

    return String(message.text_content || '')
      .replace(/\n?\[opções: [^\]]*\]\s*$/, '')
      .replace(/ \[texto cortado no ManyChat\]$/, '')
  }

  function findQuoted(text, candidates, details, { requireLabel = true, authorKind = null } = {}) {
    const target = squash(text)
    let best = null

    for (const candidate of candidates) {
      if (authorKind && candidate.author_kind === authorKind) {
        continue
      }

      const body = squash(quotableBody(candidate, details)).value

      if (body.length < QUOTE_MIN_MATCH) {
        continue
      }

      const head = body.slice(0, QUOTE_MIN_MATCH)
      const start = target.value.indexOf(head)

      if (start < 0 || start > QUOTE_LABEL_MAX) {
        continue
      }

      let matched = 0

      while (
        matched < body.length &&
        start + matched < target.value.length &&
        target.value[start + matched] === body[matched]
      ) {
        matched += 1
      }

      let end = start + matched

      if (matched < body.length) {
        const rest = target.value.slice(end)
        const ellipsis = rest.startsWith('…') ? 1 : rest.startsWith('...') ? 3 : 0

        if (!ellipsis) {
          continue
        }

        end += ellipsis
      }

      if (end >= target.value.length) {
        continue
      }

      const labelEnd = start > 0 ? target.positions[start] : 0
      const label = text.slice(0, labelEnd).trim()

      if (
        label.length > QUOTE_LABEL_MAX ||
        /[.!?;]/.test(label) ||
        (requireLabel && !label)
      ) {
        continue
      }

      if (!best || matched > best.matched) {
        best = {
          matched,
          candidate,
          label,
          reply: text.slice(target.positions[end]).trim(),
        }
      }
    }

    return best
  }

  // Bot citado mas já fora da tela: "Bot" + texto cortado com "…" + resposta.
  function findOffscreenBotQuote(text) {
    if (!/^Bot(?=[^\s\p{Ll}])/u.test(text)) {
      return null
    }

    const cut = Math.max(text.lastIndexOf('…'), text.lastIndexOf('...'))

    if (cut <= 3) {
      return null
    }

    const reply = text.slice(cut + (text[cut] === '…' ? 1 : 3)).trim()

    return reply ? { candidate: null, label: 'Bot', reply } : null
  }

  function looksLikeChoice(reply) {
    const value = String(reply || '').trim()

    return (
      value.length > 0 &&
      value.length <= CHOICE_MAX_LENGTH &&
      !/[\n?]/.test(value) &&
      value.split(/\s+/).length <= CHOICE_MAX_WORDS
    )
  }

  function isBotQuote(quote) {
    return (
      quote.candidate?.author_kind === 'automation' ||
      (!quote.candidate && /^bot$/i.test(String(quote.label || '').trim()))
    )
  }

  function isChoice(quote, details) {
    if (!isBotQuote(quote)) {
      return false
    }

    const options =
      quote.candidate
        ? (details?.get(quote.candidate.message_key)?.buttons ?? []).map(normalizeChoice)
        : []

    const listed =
      options.length > 0
        ? options
        : quote.candidate
          ? readOptions(quote.candidate.text_content)
          : []

    return listed.length > 0
      ? listed.includes(normalizeChoice(quote.reply))
      : looksLikeChoice(quote.reply)
  }

  function reconcileManyChatMessages(messages, details = new Map()) {
    const list = Array.from(messages ?? [])

    return list.map((message, index) => {
      if (
        message.content_type !== 'text' ||
        (message.author_kind !== 'customer' && message.author_kind !== 'human_agent') ||
        typeof message.text_content !== 'string' ||
        !message.text_content
      ) {
        return message
      }

      const earlier = list.slice(0, index).filter(
        (candidate) =>
          candidate.content_type === 'text' &&
          typeof candidate.text_content === 'string' &&
          candidate.text_content,
      )

      const structural = details.get(message.message_key)
      let quote = null

      if (structural?.quoted_text) {
        // A estrutura já separou: só falta saber quem foi citado.
        const found = findQuoted(
          `${structural.quoted_text} ${message.text_content}`,
          earlier,
          details,
          { requireLabel: false },
        )

        quote = {
          candidate: found?.candidate ?? null,
          label: structural.quote_label ?? found?.label ?? null,
          reply: message.text_content,
        }
      } else {
        quote =
          findQuoted(message.text_content, earlier, details, { authorKind: message.author_kind }) ??
          (message.author_kind === 'customer' ? findOffscreenBotQuote(message.text_content) : null)
      }

      if (!quote || !quote.reply) {
        return message
      }

      const text =
        message.author_kind === 'customer' && isChoice(quote, details)
          ? `${CHOICE_PREFIX}${quote.reply}`
          : quote.reply

      return text === message.text_content
        ? message
        : Object.freeze({ ...message, text_content: text })
    })
  }

  const api = Object.freeze({
    PLATFORM,
    CHOICE_PREFIX,
    buildMessageKey,
    classifyManyChatEventText,
    createManyChatCollection,
    readManyChatMessage,
    reconcileManyChatMessages,
  })

  root.YolenManyChatMessageProfile = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
