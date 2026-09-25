;(function initYolenManyChatMessageSemantics(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const AUTHOR_KIND = Object.freeze({
    CUSTOMER: 'customer',
    HUMAN_AGENT: 'human_agent',
    AUTOMATION: 'automation',
    UNKNOWN: 'unknown',
  })

  function classTokens(node) {
    if (!node) return []

    try {
      if (node.classList && typeof node.classList[Symbol.iterator] === 'function') {
        return Array.from(node.classList).filter((value) => typeof value === 'string')
      }

      const raw = typeof node.getAttribute === 'function'
        ? node.getAttribute('class')
        : null

      return typeof raw === 'string'
        ? raw.split(/\s+/).filter(Boolean)
        : []
    } catch {
      return []
    }
  }

  function hasSemanticToken(tokens, name) {
    const pattern = new RegExp(`(?:^|_)${name}(?:_|$)`, 'i')
    return tokens.some((token) => pattern.test(token))
  }

  function classifyManyChatMessageNode(node) {
    const tokens = classTokens(node)
    const typeIn = hasSemanticToken(tokens, 'typeIn')
    const typeOut = hasSemanticToken(tokens, 'typeOut')
    const botMessage = hasSemanticToken(tokens, 'botMessage')

    let direction = 'unknown'
    let authorKind = AUTHOR_KIND.UNKNOWN
    let reason = 'insufficient_structural_evidence'

    if (typeIn && typeOut) {
      reason = 'conflicting_direction_evidence'
    } else if (typeIn && botMessage) {
      reason = 'conflicting_incoming_bot_evidence'
    } else if (typeIn) {
      direction = 'incoming'
      authorKind = AUTHOR_KIND.CUSTOMER
      reason = null
    } else if (typeOut && botMessage) {
      direction = 'outgoing'
      authorKind = AUTHOR_KIND.AUTOMATION
      reason = null
    } else if (typeOut) {
      direction = 'outgoing'
      authorKind = AUTHOR_KIND.HUMAN_AGENT
      reason = null
    }

    return Object.freeze({
      platform: PLATFORM,
      direction,
      author_kind: authorKind,
      reason,
      bot_message: botMessage,
    })
  }

  function summarizeManyChatMessageNodes(nodes) {
    const list = Array.from(nodes ?? [])
    const classifications = list.map(classifyManyChatMessageNode)

    return Object.freeze({
      platform: PLATFORM,
      total: classifications.length,
      incoming_customer: classifications.filter(
        (item) => item.author_kind === AUTHOR_KIND.CUSTOMER,
      ).length,
      outgoing_human: classifications.filter(
        (item) => item.author_kind === AUTHOR_KIND.HUMAN_AGENT,
      ).length,
      outgoing_automation: classifications.filter(
        (item) => item.author_kind === AUTHOR_KIND.AUTOMATION,
      ).length,
      unknown: classifications.filter(
        (item) => item.author_kind === AUTHOR_KIND.UNKNOWN,
      ).length,
      safe_for_semantic_validation:
        classifications.length > 0 &&
        classifications.every(
          (item) => item.author_kind !== AUTHOR_KIND.UNKNOWN,
        ),
      privacy: Object.freeze({
        text_content_read: false,
        input_values_read: false,
        network_sent: false,
        persisted: false,
      }),
    })
  }

  const api = Object.freeze({
    PLATFORM,
    AUTHOR_KIND,
    classifyManyChatMessageNode,
    summarizeManyChatMessageNodes,
  })

  root.YolenManyChatMessageSemantics = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
