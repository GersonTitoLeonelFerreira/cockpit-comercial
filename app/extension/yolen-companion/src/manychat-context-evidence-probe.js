;(function initYolenManyChatContextEvidenceProbe(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const PROBE_HASH = '#yolen-context-probe'
  const PROBE_BUTTON_ID = 'yolen-manychat-context-probe'
  const MESSAGE_ROOT_SELECTOR = 'div[data-test-id="chat-messages-list"]'
  const MAX_SCOPE_DEPTH = 7

  const CHANNEL_PATTERNS = Object.freeze([
    ['whatsapp', /(^|[^a-z])whatsapp([^a-z]|$)/i],
    ['instagram', /(^|[^a-z])instagram([^a-z]|$)/i],
    ['messenger', /(^|[^a-z])(?:facebook[\s_-]+)?messenger([^a-z]|$)/i],
    ['telegram', /(^|[^a-z])telegram([^a-z]|$)/i],
  ])

  const STRUCTURED_CONTACT_ATTRIBUTES = Object.freeze([
    'data-contact-id',
    'data-subscriber-id',
    'data-user-id',
    'data-client-id',
    'data-customer-id',
    'data-phone',
    'data-phone-number',
    'data-mobile',
    'data-whatsapp-id',
  ])

  const SEMANTIC_CHANNEL_ATTRIBUTES = Object.freeze([
    'aria-label',
    'title',
    'alt',
    'data-test-id',
    'data-testid',
  ])

  function requiredText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function dependency(name, method) {
    const api = root[name]
    if (!api || typeof api[method] !== 'function') {
      const error = new Error(`${name}.${method} indisponível.`)
      error.name = 'YolenManyChatContextEvidenceProbeError'
      error.code = 'DEPENDENCY_UNAVAILABLE'
      throw error
    }
    return api
  }

  function channelFromValue(value, { exactText = false } = {}) {
    const text = requiredText(value)
    if (!text) return null

    const normalized = text.toLowerCase()

    if (exactText) {
      if (normalized === 'whatsapp') return 'whatsapp'
      if (normalized === 'instagram') return 'instagram'
      if (normalized === 'messenger') return 'messenger'
      if (normalized === 'facebook messenger') return 'messenger'
      if (normalized === 'telegram') return 'telegram'
      return null
    }

    for (const [channel, pattern] of CHANNEL_PATTERNS) {
      if (pattern.test(normalized)) return channel
    }

    return null
  }

  function allNodes(scope) {
    if (!scope || typeof scope.querySelectorAll !== 'function') return []

    try {
      return [scope, ...Array.from(scope.querySelectorAll('*'))]
    } catch {
      return [scope]
    }
  }

  function insideMessageRoot(node, messageRoot) {
    if (!node || !messageRoot) return false
    if (node === messageRoot) return true

    try {
      return typeof messageRoot.contains === 'function'
        ? messageRoot.contains(node)
        : false
    } catch {
      return false
    }
  }

  function getAttribute(node, name) {
    if (!node || typeof node.getAttribute !== 'function') return null
    try {
      return requiredText(node.getAttribute(name))
    } catch {
      return null
    }
  }

  function detectChannelSignals(scope, messageRoot) {
    const counts = new Map()

    for (const node of allNodes(scope)) {
      if (insideMessageRoot(node, messageRoot)) continue

      const textChannel = channelFromValue(node?.textContent, { exactText: true })
      if (textChannel) {
        counts.set(textChannel, (counts.get(textChannel) || 0) + 1)
      }

      for (const attributeName of SEMANTIC_CHANNEL_ATTRIBUTES) {
        const attributeChannel = channelFromValue(
          getAttribute(node, attributeName),
        )
        if (!attributeChannel) continue
        counts.set(attributeChannel, (counts.get(attributeChannel) || 0) + 1)
      }
    }

    const channels = [...counts.keys()].sort()

    return Object.freeze({
      ready: channels.length === 1,
      ambiguous: channels.length > 1,
      channels,
      signal_count: [...counts.values()].reduce((sum, value) => sum + value, 0),
    })
  }

  function hrefIdentity(value) {
    const href = requiredText(value)
    if (!href) return null

    if (/^tel:/i.test(href)) {
      const secret = href.slice(4).trim()
      return secret
        ? { source_kind: 'tel_href', attribute_name: 'href', secret }
        : null
    }

    try {
      const url = new URL(href, 'https://app.manychat.com')
      const host = url.hostname.toLowerCase()

      if (host === 'wa.me') {
        const secret = requiredText(url.pathname.replace(/^\/+/, ''))
        return secret
          ? { source_kind: 'whatsapp_href', attribute_name: 'href', secret }
          : null
      }

      if (
        host === 'api.whatsapp.com' &&
        url.pathname.toLowerCase().includes('/send')
      ) {
        const secret = requiredText(url.searchParams.get('phone'))
        return secret
          ? { source_kind: 'whatsapp_href', attribute_name: 'href', secret }
          : null
      }
    } catch {
      return null
    }

    return null
  }

  function collectStructuredContactCandidates(scope, messageRoot) {
    const internal = []
    const safeSources = new Map()

    for (const node of allNodes(scope)) {
      if (insideMessageRoot(node, messageRoot)) continue

      for (const attributeName of STRUCTURED_CONTACT_ATTRIBUTES) {
        const value = getAttribute(node, attributeName)
        if (!value) continue

        internal.push({
          source_kind: 'structured_attribute',
          attribute_name: attributeName,
          secret: value,
        })

        const key = `structured_attribute:${attributeName}`
        safeSources.set(key, (safeSources.get(key) || 0) + 1)
      }

      const href = hrefIdentity(getAttribute(node, 'href'))
      if (href) {
        internal.push(href)
        const key = `${href.source_kind}:${href.attribute_name}`
        safeSources.set(key, (safeSources.get(key) || 0) + 1)
      }
    }

    const deduplicated = new Map()
    for (const item of internal) {
      const key = `${item.source_kind}|${item.attribute_name}|${item.secret}`
      if (!deduplicated.has(key)) deduplicated.set(key, item)
    }

    const secretKeys = [...deduplicated.keys()].sort()
    const sources = [...safeSources.entries()]
      .map(([key, count]) => {
        const [sourceKind, attributeName] = key.split(':')
        return Object.freeze({
          source_kind: sourceKind,
          attribute_name: attributeName,
          count,
        })
      })
      .sort((a, b) =>
        `${a.source_kind}:${a.attribute_name}`.localeCompare(
          `${b.source_kind}:${b.attribute_name}`,
        ),
      )

    return Object.freeze({
      secret_keys: secretKeys,
      safe: Object.freeze({
        candidate_count: secretKeys.length,
        source_count: sources.length,
        sources,
      }),
    })
  }

  function buildScopeLevels(messageRoot, maxDepth = MAX_SCOPE_DEPTH) {
    const levels = []
    let current = messageRoot?.parentElement ?? null
    let depth = 1

    while (current && depth <= maxDepth) {
      levels.push({ depth, scope: current })
      current = current.parentElement ?? null
      depth += 1
    }

    return levels
  }

  function secretSetEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }

    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) return false
    }

    return true
  }

  function collectContextEvidence(documentRef = root.document) {
    if (!documentRef || typeof documentRef.querySelector !== 'function') {
      return Object.freeze({
        ready: false,
        reason: 'document_unavailable',
        secret: null,
        safe: null,
      })
    }

    const messageRoot = documentRef.querySelector(MESSAGE_ROOT_SELECTOR)
    if (!messageRoot) {
      return Object.freeze({
        ready: false,
        reason: 'message_root_not_found',
        secret: null,
        safe: null,
      })
    }

    const surfaceApi = dependency(
      'YolenManyChatSurface',
      'getCurrentConversationSurface',
    )
    const surface = surfaceApi.getCurrentConversationSurface()

    if (!surface?.supported || !requiredText(surface.conversation_key)) {
      return Object.freeze({
        ready: false,
        reason: surface?.reason || 'conversation_surface_not_ready',
        secret: null,
        safe: null,
      })
    }

    const levels = buildScopeLevels(messageRoot)
    const internalLevels = []
    const safeLevels = []

    for (const { depth, scope } of levels) {
      const channel = detectChannelSignals(scope, messageRoot)
      const contact = collectStructuredContactCandidates(scope, messageRoot)

      internalLevels.push({
        depth,
        channel,
        contact_secret_keys: contact.secret_keys,
      })

      safeLevels.push(
        Object.freeze({
          depth,
          channel_ready: channel.ready,
          channel_ambiguous: channel.ambiguous,
          channels: channel.channels,
          channel_signal_count: channel.signal_count,
          contact_candidate_count: contact.safe.candidate_count,
          contact_sources: contact.safe.sources,
        }),
      )
    }

    return Object.freeze({
      ready: true,
      reason: null,
      secret: Object.freeze({
        workspace_token: requiredText(surface.account_key),
        conversation_key: surface.conversation_key,
        levels: internalLevels,
      }),
      safe: Object.freeze({
        schema_version: 'yolen-manychat-context-evidence-v1',
        platform: PLATFORM,
        surface_ready: true,
        contact_identity_ready: false,
        levels: safeLevels,
        privacy: Object.freeze({
          raw_text_exposed: false,
          raw_contact_value_exposed: false,
          raw_route_token_exposed: false,
          hashes_exposed: false,
          persisted: false,
          network_sent: false,
        }),
      }),
    })
  }

  function evaluateReturnToBaseline(baseline, distinct, current) {
    if (!baseline?.ready || !distinct?.ready || !current?.ready) {
      return Object.freeze({
        pass: false,
        reason: 'evidence_missing',
        safe: null,
      })
    }

    const sameWorkspace =
      baseline.secret.workspace_token === current.secret.workspace_token &&
      baseline.secret.workspace_token === distinct.secret.workspace_token
    const distinctConversation =
      baseline.secret.conversation_key !== distinct.secret.conversation_key
    const returnedToBaseline =
      baseline.secret.conversation_key === current.secret.conversation_key

    const passingDepths = []
    const channelDepths = []

    for (const baselineLevel of baseline.secret.levels) {
      const depth = baselineLevel.depth
      const distinctLevel = distinct.secret.levels.find((item) => item.depth === depth)
      const currentLevel = current.secret.levels.find((item) => item.depth === depth)
      if (!distinctLevel || !currentLevel) continue

      if (
        baselineLevel.channel.ready &&
        distinctLevel.channel.ready &&
        currentLevel.channel.ready &&
        baselineLevel.channel.channels[0] === distinctLevel.channel.channels[0] &&
        baselineLevel.channel.channels[0] === currentLevel.channel.channels[0]
      ) {
        channelDepths.push(depth)
      }

      const baselineKeys = baselineLevel.contact_secret_keys
      const distinctKeys = distinctLevel.contact_secret_keys
      const currentKeys = currentLevel.contact_secret_keys

      if (
        baselineKeys.length > 0 &&
        !secretSetEqual(baselineKeys, distinctKeys) &&
        secretSetEqual(baselineKeys, currentKeys)
      ) {
        passingDepths.push(depth)
      }
    }

    const pass = Boolean(
      sameWorkspace &&
      distinctConversation &&
      returnedToBaseline &&
      passingDepths.length > 0,
    )

    return Object.freeze({
      pass,
      reason: pass ? null : 'structured_contact_identity_not_proven',
      safe: Object.freeze({
        schema_version: 'yolen-manychat-context-evidence-result-v1',
        platform: PLATFORM,
        same_workspace: sameWorkspace,
        distinct_conversation_seen: distinctConversation,
        returned_to_baseline: returnedToBaseline,
        stable_channel_depths: channelDepths,
        structured_contact_identity_depths: passingDepths,
        structured_contact_identity_ready: passingDepths.length > 0,
        pass,
        privacy: Object.freeze({
          raw_text_exposed: false,
          raw_contact_value_exposed: false,
          raw_route_token_exposed: false,
          hashes_exposed: false,
          persisted: false,
          network_sent: false,
        }),
      }),
    })
  }

  async function copySafeReport(value, navigatorRef = root.navigator) {
    const text = JSON.stringify(value, null, 2)

    try {
      if (navigatorRef?.clipboard?.writeText) {
        await navigatorRef.clipboard.writeText(text)
        return true
      }
    } catch {
      return false
    }

    return false
  }

  function installContextEvidenceProbe({
    window: windowRef = root.window,
    document: documentRef = root.document,
    navigator: navigatorRef = root.navigator,
  } = {}) {
    if (
      !windowRef ||
      !documentRef?.body ||
      windowRef.location?.hash !== PROBE_HASH
    ) {
      return null
    }

    const existing = documentRef.getElementById?.(PROBE_BUTTON_ID)
    if (existing) return existing

    let baseline = null
    let distinct = null

    const button = documentRef.createElement('button')
    button.id = PROBE_BUTTON_ID
    button.type = 'button'
    button.textContent = 'Yolen · capturar contexto A'
    button.setAttribute('aria-label', 'Validar contexto estrutural da conversa ManyChat')
    Object.assign(button.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '2147483647',
      padding: '10px 14px',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,.2)',
      background: '#111318',
      color: '#edf2f7',
      font: '600 12px/1.2 system-ui, sans-serif',
      cursor: 'pointer',
      boxShadow: '0 8px 24px rgba(0,0,0,.35)',
    })

    button.addEventListener('click', async (event) => {
      if (event.isTrusted !== true || button.disabled) return

      button.disabled = true

      try {
        const current = collectContextEvidence(documentRef)
        if (!current.ready) {
          const safe = {
            schema_version: 'yolen-manychat-context-evidence-result-v1',
            platform: PLATFORM,
            pass: false,
            reason: current.reason,
            privacy: {
              raw_text_exposed: false,
              raw_contact_value_exposed: false,
              raw_route_token_exposed: false,
              hashes_exposed: false,
              persisted: false,
              network_sent: false,
            },
          }
          button.dataset.yolenContextProbeResult = JSON.stringify(safe)
          button.textContent = `Yolen · contexto indisponível (${current.reason})`
          await copySafeReport(safe, navigatorRef)
          return
        }

        if (!baseline) {
          baseline = current
          const safe = {
            ...current.safe,
            stage: 'baseline_captured',
          }
          button.dataset.yolenContextProbeResult = JSON.stringify(safe)
          button.textContent = 'Yolen · A capturado — abra B'
          await copySafeReport(safe, navigatorRef)
          return
        }

        if (!distinct) {
          if (
            current.secret.workspace_token !== baseline.secret.workspace_token
          ) {
            const safe = {
              ...current.safe,
              stage: 'workspace_changed',
            }
            button.dataset.yolenContextProbeResult = JSON.stringify(safe)
            button.textContent = 'Yolen · workspace mudou — volte ao original'
            await copySafeReport(safe, navigatorRef)
            return
          }

          if (
            current.secret.conversation_key === baseline.secret.conversation_key
          ) {
            const safe = {
              ...current.safe,
              stage: 'baseline_unchanged',
            }
            button.dataset.yolenContextProbeResult = JSON.stringify(safe)
            button.textContent = 'Yolen · ainda na conversa A'
            await copySafeReport(safe, navigatorRef)
            return
          }

          distinct = current
          const safe = {
            ...current.safe,
            stage: 'distinct_conversation_captured',
          }
          button.dataset.yolenContextProbeResult = JSON.stringify(safe)
          button.textContent = 'Yolen · B capturado — volte para A'
          await copySafeReport(safe, navigatorRef)
          return
        }

        const evaluated = evaluateReturnToBaseline(
          baseline,
          distinct,
          current,
        )
        const safe = {
          ...evaluated.safe,
          stage: 'returned_to_baseline_evaluated',
        }

        button.dataset.yolenContextProbeResult = JSON.stringify(safe)
        button.dataset.yolenContextProbePassed = evaluated.pass ? 'true' : 'false'

        if (evaluated.pass) {
          button.textContent = 'Yolen · contexto estruturado PASS · relatório copiado'
        } else if ((safe.stable_channel_depths?.length || 0) > 0) {
          button.textContent = 'Yolen · canal PASS · contato estruturado não provado'
        } else {
          button.textContent = 'Yolen · contexto inconclusivo'
        }

        await copySafeReport(safe, navigatorRef)
      } catch (error) {
        const safe = {
          schema_version: 'yolen-manychat-context-evidence-result-v1',
          platform: PLATFORM,
          pass: false,
          reason: error?.code || 'runtime_exception',
          privacy: {
            raw_text_exposed: false,
            raw_contact_value_exposed: false,
            raw_route_token_exposed: false,
            hashes_exposed: false,
            persisted: false,
            network_sent: false,
          },
        }
        button.dataset.yolenContextProbeResult = JSON.stringify(safe)
        button.dataset.yolenContextProbePassed = 'false'
        button.textContent = 'Yolen · contexto falhou (runtime)'
        await copySafeReport(safe, navigatorRef)
      } finally {
        button.disabled = false
      }
    })

    documentRef.body.appendChild(button)
    return button
  }

  const api = Object.freeze({
    PLATFORM,
    PROBE_HASH,
    PROBE_BUTTON_ID,
    MESSAGE_ROOT_SELECTOR,
    MAX_SCOPE_DEPTH,
    STRUCTURED_CONTACT_ATTRIBUTES,
    channelFromValue,
    detectChannelSignals,
    hrefIdentity,
    collectStructuredContactCandidates,
    collectContextEvidence,
    evaluateReturnToBaseline,
    copySafeReport,
    installContextEvidenceProbe,
  })

  root.YolenManyChatContextEvidenceProbe = api

  const runtimeWindow = root.window ?? root
  const runtimeDocument = root.document ?? runtimeWindow?.document ?? null

  const autoInstall = () => {
    if (!runtimeDocument) return

    if (!root.__YOLEN_MANYCHAT_CONTEXT_EVIDENCE_PROBE_INSTALLED__) {
      const installed = installContextEvidenceProbe({
        window: runtimeWindow,
        document: runtimeDocument,
        navigator: root.navigator ?? runtimeWindow?.navigator,
      })

      if (installed) {
        root.__YOLEN_MANYCHAT_CONTEXT_EVIDENCE_PROBE_INSTALLED__ = true
      }
    }
  }

  autoInstall()

  if (typeof runtimeWindow?.addEventListener === 'function') {
    runtimeWindow.addEventListener('hashchange', autoInstall)
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
