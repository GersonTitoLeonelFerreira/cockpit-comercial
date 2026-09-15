;(function initYolenManyChatMainWorldIdentityProbe(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const PROBE_HASH = '#yolen-mainworld-identity-probe'
  const PROBE_BUTTON_ID = 'yolen-manychat-mainworld-identity-probe'
  const MESSAGE_ROOT_SELECTOR = 'div[data-test-id="chat-messages-list"]'
  const MAX_SCOPE_DEPTH = 8
  const MAX_SCOPE_NODES = 240
  const MAX_FIBER_DEPTH = 30
  const MAX_OBJECT_DEPTH = 4
  const MAX_OBJECT_VISITS = 2500
  const MAX_COLLECTION_SIZE = 80

  const IDENTITY_KEY_PATTERN = /^(?:contact[_-]?id|subscriber[_-]?id|user[_-]?id|customer[_-]?id|phone|phone[_-]?number|mobile|whatsapp[_-]?id|wa[_-]?id)$/i

  function requiredText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  function normalizePrimitive(value) {
    if (typeof value === 'string') {
      const text = value.trim()
      return text && text.length <= 500 ? text : null
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }

    return null
  }

  function normalizeLocatorSegment(value) {
    const text = requiredText(value)
    if (!text) return null
    return /^\d+$/.test(text) ? '[]' : text.slice(0, 120)
  }

  function safeLocator(parts) {
    return parts
      .map(normalizeLocatorSegment)
      .filter(Boolean)
      .join('.')
      .slice(0, 500)
  }

  function findReactFiberKey(node) {
    if (!node || typeof node !== 'object') return null

    try {
      return (
        Object.keys(node).find(
          (key) =>
            key.startsWith('__reactFiber$') ||
            key.startsWith('__reactInternalInstance$'),
        ) || null
      )
    } catch {
      return null
    }
  }

  function getFiber(node) {
    const key = findReactFiberKey(node)
    if (!key) return null

    try {
      return node[key] ?? null
    } catch {
      return null
    }
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object'
  }

  function boundedEntries(value) {
    if (!isRecord(value)) return []

    try {
      if (Array.isArray(value)) {
        return value
          .slice(0, MAX_COLLECTION_SIZE)
          .map((item, index) => [String(index), item])
      }

      return Object.entries(value).slice(0, MAX_COLLECTION_SIZE)
    } catch {
      return []
    }
  }

  function collectCandidatesFromObject(
    value,
    basePath,
    output,
    state,
    seen,
    depth = 0,
  ) {
    if (!isRecord(value) || depth > MAX_OBJECT_DEPTH) return
    if (state.visits >= MAX_OBJECT_VISITS) return
    if (seen.has(value)) return

    seen.add(value)
    state.visits += 1

    for (const [rawKey, child] of boundedEntries(value)) {
      if (state.visits >= MAX_OBJECT_VISITS) break

      const key = requiredText(rawKey)
      if (!key) continue

      const path = [...basePath, key]
      const primitive = normalizePrimitive(child)

      if (primitive && IDENTITY_KEY_PATTERN.test(key)) {
        const locator = safeLocator(path)
        if (locator) {
          if (!output.has(locator)) output.set(locator, new Set())
          output.get(locator).add(primitive)
        }
      }

      if (isRecord(child)) {
        collectCandidatesFromObject(
          child,
          path,
          output,
          state,
          seen,
          depth + 1,
        )
      }
    }
  }

  function collectCandidatesFromFiber(fiber, output) {
    const seenObjects = new WeakSet()
    const state = { visits: 0 }
    let current = fiber
    let fiberDepth = 0

    while (
      current &&
      fiberDepth < MAX_FIBER_DEPTH &&
      state.visits < MAX_OBJECT_VISITS
    ) {
      for (const sourceName of ['memoizedProps', 'pendingProps', 'memoizedState']) {
        let source = null
        try {
          source = current[sourceName]
        } catch {
          source = null
        }

        if (isRecord(source)) {
          collectCandidatesFromObject(
            source,
            [`fiber${fiberDepth}`, sourceName],
            output,
            state,
            seenObjects,
          )
        }
      }

      try {
        current = current.return ?? null
      } catch {
        current = null
      }
      fiberDepth += 1
    }
  }

  function scopeNodes(messageRoot) {
    const nodes = []
    const seen = new Set()

    function add(node) {
      if (!node || seen.has(node) || nodes.length >= MAX_SCOPE_NODES) return
      seen.add(node)
      nodes.push(node)
    }

    let current = messageRoot
    let depth = 0

    while (current && depth <= MAX_SCOPE_DEPTH) {
      add(current)

      try {
        const children = current.querySelectorAll?.('*') ?? []
        for (const node of Array.from(children).slice(0, 40)) add(node)
      } catch {
        // diagnóstico fail-closed: ignora escopo ilegível
      }

      current = current.parentElement ?? null
      depth += 1
    }

    return nodes
  }

  function snapshotCandidateMap(documentRef = root.document) {
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

    const output = new Map()
    let nodesWithFiber = 0

    for (const node of scopeNodes(messageRoot)) {
      const fiber = getFiber(node)
      if (!fiber) continue
      nodesWithFiber += 1
      collectCandidatesFromFiber(fiber, output)
    }

    const secretEntries = [...output.entries()]
      .map(([locator, values]) => ({
        locator,
        values: [...values].sort(),
      }))
      .sort((a, b) => a.locator.localeCompare(b.locator))

    return Object.freeze({
      ready: true,
      reason: null,
      secret: Object.freeze({ entries: secretEntries }),
      safe: Object.freeze({
        schema_version: 'yolen-manychat-mainworld-identity-evidence-v1',
        platform: PLATFORM,
        react_fiber_found: nodesWithFiber > 0,
        nodes_with_fiber: nodesWithFiber,
        candidate_locator_count: secretEntries.length,
        candidate_locators: Object.freeze(
          secretEntries.map((item) => item.locator),
        ),
        privacy: Object.freeze({
          raw_identity_value_exposed: false,
          hashes_exposed: false,
          raw_message_text_exposed: false,
          persisted: false,
          network_sent: false,
        }),
      }),
    })
  }

  function valuesEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false
    return left.every((value, index) => value === right[index])
  }

  function entryMap(snapshot) {
    const map = new Map()
    for (const entry of snapshot?.secret?.entries ?? []) {
      map.set(entry.locator, entry.values)
    }
    return map
  }

  function evaluateABAReturn(baseline, distinct, current) {
    if (!baseline?.ready || !distinct?.ready || !current?.ready) {
      return Object.freeze({
        pass: false,
        reason: 'evidence_missing',
        safe: null,
      })
    }

    const a = entryMap(baseline)
    const b = entryMap(distinct)
    const a2 = entryMap(current)
    const proven = []

    for (const [locator, baselineValues] of a.entries()) {
      const distinctValues = b.get(locator)
      const returnedValues = a2.get(locator)

      if (!distinctValues || !returnedValues) continue
      if (baselineValues.length === 0) continue

      if (
        !valuesEqual(baselineValues, distinctValues) &&
        valuesEqual(baselineValues, returnedValues)
      ) {
        proven.push(locator)
      }
    }

    proven.sort()

    return Object.freeze({
      pass: proven.length > 0,
      reason: proven.length > 0 ? null : 'stable_internal_identity_not_proven',
      safe: Object.freeze({
        schema_version: 'yolen-manychat-mainworld-identity-result-v1',
        platform: PLATFORM,
        react_fiber_found:
          baseline.safe.react_fiber_found ||
          distinct.safe.react_fiber_found ||
          current.safe.react_fiber_found,
        proven_locator_count: proven.length,
        proven_locators: Object.freeze(proven),
        pass: proven.length > 0,
        privacy: Object.freeze({
          raw_identity_value_exposed: false,
          hashes_exposed: false,
          raw_message_text_exposed: false,
          persisted: false,
          network_sent: false,
        }),
      }),
    })
  }

  async function copySafeReport(value, navigatorRef = root.navigator) {
    try {
      if (navigatorRef?.clipboard?.writeText) {
        await navigatorRef.clipboard.writeText(
          JSON.stringify(value, null, 2),
        )
        return true
      }
    } catch {
      return false
    }

    return false
  }

  function installProbe({
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
    button.textContent = 'Yolen · capturar identidade interna A'
    button.setAttribute(
      'aria-label',
      'Validar identidade interna da conversa ManyChat',
    )

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
        const current = snapshotCandidateMap(documentRef)

        if (!current.ready) {
          const safe = {
            schema_version: 'yolen-manychat-mainworld-identity-result-v1',
            platform: PLATFORM,
            pass: false,
            reason: current.reason,
          }
          button.dataset.yolenMainworldIdentityProbeResult = JSON.stringify(safe)
          button.textContent = `Yolen · identidade indisponível (${current.reason})`
          await copySafeReport(safe, navigatorRef)
          return
        }

        if (!baseline) {
          baseline = current
          const safe = { ...current.safe, stage: 'baseline_captured' }
          button.dataset.yolenMainworldIdentityProbeResult = JSON.stringify(safe)
          button.textContent = 'Yolen · A capturada — abra B'
          await copySafeReport(safe, navigatorRef)
          return
        }

        if (!distinct) {
          distinct = current
          const safe = { ...current.safe, stage: 'distinct_captured' }
          button.dataset.yolenMainworldIdentityProbeResult = JSON.stringify(safe)
          button.textContent = 'Yolen · B capturada — volte para A'
          await copySafeReport(safe, navigatorRef)
          return
        }

        const evaluated = evaluateABAReturn(baseline, distinct, current)
        const safe = {
          ...evaluated.safe,
          stage: 'returned_to_baseline_evaluated',
        }

        button.dataset.yolenMainworldIdentityProbeResult = JSON.stringify(safe)
        button.dataset.yolenMainworldIdentityProbePassed = evaluated.pass
          ? 'true'
          : 'false'
        button.textContent = evaluated.pass
          ? 'Yolen · identidade interna PASS · relatório copiado'
          : 'Yolen · identidade interna não provada · relatório copiado'
        await copySafeReport(safe, navigatorRef)
      } catch {
        const safe = {
          schema_version: 'yolen-manychat-mainworld-identity-result-v1',
          platform: PLATFORM,
          pass: false,
          reason: 'runtime_exception',
        }
        button.dataset.yolenMainworldIdentityProbeResult = JSON.stringify(safe)
        button.dataset.yolenMainworldIdentityProbePassed = 'false'
        button.textContent = 'Yolen · identidade interna falhou (runtime)'
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
    IDENTITY_KEY_PATTERN,
    findReactFiberKey,
    snapshotCandidateMap,
    evaluateABAReturn,
    installProbe,
  })

  root.YolenManyChatMainWorldIdentityProbe = api

  const runtimeWindow = root.window ?? root
  const runtimeDocument = root.document ?? runtimeWindow?.document ?? null

  const autoInstall = () => {
    if (!runtimeDocument) return
    if (root.__YOLEN_MANYCHAT_MAINWORLD_IDENTITY_PROBE_INSTALLED__) return

    const installed = installProbe({
      window: runtimeWindow,
      document: runtimeDocument,
      navigator: root.navigator ?? runtimeWindow?.navigator,
    })

    if (installed) {
      root.__YOLEN_MANYCHAT_MAINWORLD_IDENTITY_PROBE_INSTALLED__ = true
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
