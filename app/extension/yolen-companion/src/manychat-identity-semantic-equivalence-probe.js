;(function initYolenManyChatIdentitySemanticEquivalenceProbe(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const PROBE_HASH = '#yolen-identity-equivalence-probe'
  const PROBE_BUTTON_ID = 'yolen-manychat-identity-equivalence-probe'
  const FILE_NAME = 'yolen-manychat-identity-semantic-report.json'

  const FAMILY_DEFINITIONS = Object.freeze([
    Object.freeze({
      family: 'subscriber_id',
      matches: (locator) => /(?:^|\.)subscriberId$/i.test(locator),
    }),
    Object.freeze({
      family: 'thread_user_id',
      matches: (locator) => /\.thread\.user_id$/i.test(locator),
    }),
    Object.freeze({
      family: 'user_object_user_id',
      matches: (locator) =>
        /\.thread\.user\.user_id$/i.test(locator) ||
        /(?:^|\.)user\.user_id$/i.test(locator),
    }),
    Object.freeze({
      family: 'whatsapp_user_id',
      matches: (locator) =>
        /\.thread\.user\.wa_id$/i.test(locator) ||
        /(?:^|\.)user\.wa_id$/i.test(locator),
    }),
    Object.freeze({
      family: 'last_event_user_id',
      matches: (locator) => /\.thread\.last_lc_event\.user_id$/i.test(locator),
    }),
    Object.freeze({
      family: 'data_user_id',
      matches: (locator) => /(?:^|\.)data\.user_id$/i.test(locator),
    }),
  ])

  function requiredText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  function familyForLocator(locator) {
    const value = requiredText(locator)
    if (!value) return null

    for (const definition of FAMILY_DEFINITIONS) {
      if (definition.matches(value)) return definition.family
    }

    return null
  }

  function entryMap(snapshot) {
    const map = new Map()

    for (const entry of snapshot?.secret?.entries ?? []) {
      const locator = requiredText(entry?.locator)
      const values = Array.isArray(entry?.values) ? entry.values : null
      if (!locator || !values) continue
      map.set(locator, [...values])
    }

    return map
  }

  function valuesEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false
    return left.every((value, index) => value === right[index])
  }

  function buildStableFamily({ family, locators, baseline, distinct, current }) {
    const baselineMap = entryMap(baseline)
    const distinctMap = entryMap(distinct)
    const currentMap = entryMap(current)

    const singleton = []

    for (const locator of locators) {
      const a = baselineMap.get(locator)
      const b = distinctMap.get(locator)
      const a2 = currentMap.get(locator)

      if (!a || !b || !a2) continue
      if (a.length !== 1 || b.length !== 1 || a2.length !== 1) continue
      if (a[0] === b[0]) continue
      if (a[0] !== a2[0]) continue

      singleton.push({ locator, a: a[0], b: b[0], a2: a2[0] })
    }

    const safeBase = {
      family,
      proven_locator_count: locators.length,
      singleton_locator_count: singleton.length,
      proven_locators: Object.freeze([...locators].sort()),
    }

    if (locators.length === 0) {
      return {
        safe: Object.freeze({ ...safeBase, status: 'missing' }),
        secret: null,
      }
    }

    if (singleton.length === 0) {
      return {
        safe: Object.freeze({ ...safeBase, status: 'ambiguous' }),
        secret: null,
      }
    }

    const aValues = new Set(singleton.map((item) => item.a))
    const bValues = new Set(singleton.map((item) => item.b))
    const a2Values = new Set(singleton.map((item) => item.a2))

    if (aValues.size !== 1 || bValues.size !== 1 || a2Values.size !== 1) {
      return {
        safe: Object.freeze({ ...safeBase, status: 'conflicting' }),
        secret: null,
      }
    }

    const [a] = aValues
    const [b] = bValues
    const [a2] = a2Values

    if (a === b || a !== a2) {
      return {
        safe: Object.freeze({ ...safeBase, status: 'conflicting' }),
        secret: null,
      }
    }

    return {
      safe: Object.freeze({ ...safeBase, status: 'stable_singleton' }),
      secret: Object.freeze({ a, b, a2 }),
    }
  }

  function relationBetween(left, right) {
    if (!left?.secret || !right?.secret) return 'unavailable'

    const same =
      left.secret.a === right.secret.a &&
      left.secret.b === right.secret.b &&
      left.secret.a2 === right.secret.a2

    return same ? 'same_value' : 'distinct_value'
  }

  function analyzeSemanticEquivalence(baseline, distinct, current, identityApi) {
    if (!identityApi || typeof identityApi.evaluateABAReturn !== 'function') {
      return Object.freeze({
        pass: false,
        reason: 'identity_api_unavailable',
        safe: null,
      })
    }

    const evaluated = identityApi.evaluateABAReturn(baseline, distinct, current)
    const provenLocators = evaluated?.safe?.proven_locators ?? []

    if (!evaluated?.pass || !Array.isArray(provenLocators)) {
      return Object.freeze({
        pass: false,
        reason: evaluated?.reason ?? 'identity_not_proven',
        safe: evaluated?.safe ?? null,
      })
    }

    const byFamily = new Map(
      FAMILY_DEFINITIONS.map((definition) => [definition.family, []]),
    )

    for (const locator of provenLocators) {
      const family = familyForLocator(locator)
      if (!family) continue
      byFamily.get(family).push(locator)
    }

    const familyResults = new Map()

    for (const definition of FAMILY_DEFINITIONS) {
      familyResults.set(
        definition.family,
        buildStableFamily({
          family: definition.family,
          locators: byFamily.get(definition.family),
          baseline,
          distinct,
          current,
        }),
      )
    }

    const families = FAMILY_DEFINITIONS.map(
      (definition) => familyResults.get(definition.family).safe,
    )

    const relations = []

    for (let leftIndex = 0; leftIndex < FAMILY_DEFINITIONS.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < FAMILY_DEFINITIONS.length;
        rightIndex += 1
      ) {
        const leftFamily = FAMILY_DEFINITIONS[leftIndex].family
        const rightFamily = FAMILY_DEFINITIONS[rightIndex].family

        relations.push(
          Object.freeze({
            left: leftFamily,
            right: rightFamily,
            relation: relationBetween(
              familyResults.get(leftFamily),
              familyResults.get(rightFamily),
            ),
          }),
        )
      }
    }

    const relation = (left, right) => {
      const direct = relations.find(
        (item) => item.left === left && item.right === right,
      )
      if (direct) return direct.relation

      const reverse = relations.find(
        (item) => item.left === right && item.right === left,
      )
      return reverse?.relation ?? 'unavailable'
    }

    const subscriber = familyResults.get('subscriber_id')
    const whatsapp = familyResults.get('whatsapp_user_id')
    const corroboratedBy = [
      'thread_user_id',
      'user_object_user_id',
      'data_user_id',
    ].filter(
      (family) => relation('subscriber_id', family) === 'same_value',
    )

    const platformIdentityReady =
      subscriber?.safe?.status === 'stable_singleton' &&
      corroboratedBy.length > 0

    const channelIdentityObserved =
      whatsapp?.safe?.status === 'stable_singleton'

    const safe = Object.freeze({
      schema_version: 'yolen-manychat-identity-semantic-equivalence-v1',
      platform: PLATFORM,
      source_identity_pass: true,
      proven_locator_count: provenLocators.length,
      families: Object.freeze(families),
      relations: Object.freeze(relations),
      decision: Object.freeze({
        platform_identity_candidate:
          subscriber?.safe?.status === 'stable_singleton'
            ? 'subscriber_id'
            : null,
        platform_identity_corroborated: platformIdentityReady,
        corroborated_by: Object.freeze(corroboratedBy),
        channel_identity_candidate: channelIdentityObserved
          ? 'whatsapp_user_id'
          : null,
        ready_for_namespace_design: platformIdentityReady,
      }),
      privacy: Object.freeze({
        raw_identity_value_exposed: false,
        hashes_exposed: false,
        raw_message_text_exposed: false,
        persisted: false,
        network_sent: false,
      }),
    })

    return Object.freeze({
      pass: platformIdentityReady,
      reason: platformIdentityReady
        ? null
        : 'canonical_platform_identity_not_corroborated',
      safe,
    })
  }

  function downloadReport(report, documentRef = root.document) {
    if (!documentRef?.body) return false

    const payload = `${JSON.stringify(report, null, 2)}\n`
    const href = `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`
    const anchor = documentRef.createElement('a')

    anchor.href = href
    anchor.download = FILE_NAME
    anchor.style.display = 'none'
    documentRef.body.appendChild(anchor)

    try {
      anchor.click()
      return true
    } catch {
      return false
    } finally {
      anchor.remove()
    }
  }

  function installProbe({
    document: documentRef = root.document,
    identityApi = root.YolenManyChatMainWorldIdentityProbe,
  } = {}) {
    if (!documentRef?.body || !identityApi?.snapshotCandidateMap) return null

    const existing = documentRef.getElementById?.(PROBE_BUTTON_ID)
    if (existing) return existing

    let baseline = null
    let distinct = null

    const button = documentRef.createElement('button')
    button.id = PROBE_BUTTON_ID
    button.type = 'button'
    button.textContent = 'Yolen · capturar semântica A'

    Object.assign(button.style, {
      position: 'fixed',
      right: '20px',
      bottom: '68px',
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

    button.addEventListener('click', (event) => {
      if (event.isTrusted !== true || button.disabled) return
      button.disabled = true

      try {
        const current = identityApi.snapshotCandidateMap(documentRef)

        if (!current?.ready) {
          button.textContent = `Yolen · semântica indisponível (${current?.reason ?? 'evidence_missing'})`
          return
        }

        if (!baseline) {
          baseline = current
          button.textContent = 'Yolen · semântica A capturada — abra B'
          return
        }

        if (!distinct) {
          distinct = current
          button.textContent = 'Yolen · semântica B capturada — volte para A'
          return
        }

        const result = analyzeSemanticEquivalence(
          baseline,
          distinct,
          current,
          identityApi,
        )

        const report = Object.freeze({
          ...(result.safe ?? {
            schema_version: 'yolen-manychat-identity-semantic-equivalence-v1',
            platform: PLATFORM,
          }),
          pass: result.pass,
          reason: result.reason,
          stage: 'semantic_equivalence_evaluated',
        })

        button.dataset.yolenManychatSemanticResult = JSON.stringify(report)
        const downloaded = downloadReport(report, documentRef)

        button.textContent = result.pass
          ? downloaded
            ? 'Yolen · semântica PASS · relatório baixado'
            : 'Yolen · semântica PASS · download falhou'
          : downloaded
            ? 'Yolen · semântica inconclusiva · relatório baixado'
            : 'Yolen · semântica inconclusiva · download falhou'
      } catch {
        button.textContent = 'Yolen · semântica falhou (runtime)'
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
    FILE_NAME,
    FAMILY_DEFINITIONS,
    familyForLocator,
    analyzeSemanticEquivalence,
    downloadReport,
    installProbe,
  })

  root.YolenManyChatIdentitySemanticEquivalenceProbe = api

  const armedAtStart = root.location?.hash === PROBE_HASH

  const autoInstall = () => {
    if (!armedAtStart) return
    installProbe()
  }

  autoInstall()

  if (armedAtStart && !root.document?.body) {
    root.document?.addEventListener?.('DOMContentLoaded', autoInstall, { once: true })
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
