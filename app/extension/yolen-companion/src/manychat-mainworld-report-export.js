;(function initYolenManyChatMainWorldReportExport(root) {
  'use strict'

  const PROBE_BUTTON_ID = 'yolen-manychat-mainworld-identity-probe'
  const FINAL_STAGE = 'returned_to_baseline_evaluated'
  const FILE_NAME = 'yolen-manychat-mainworld-identity-report.json'
  const SEMANTIC_FILE_NAME = 'yolen-manychat-identity-semantic-report.json'

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

  function parseReport(value) {
    if (typeof value !== 'string' || !value.trim()) return null

    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : null
    } catch {
      return null
    }
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
      if (a[0] === b[0] || a[0] !== a2[0]) continue

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

    return (
      left.secret.a === right.secret.a &&
      left.secret.b === right.secret.b &&
      left.secret.a2 === right.secret.a2
    )
      ? 'same_value'
      : 'distinct_value'
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
      platform: 'manychat',
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

  function downloadReport(
    report,
    documentRef = root.document,
    fileName = FILE_NAME,
  ) {
    if (!documentRef?.body) return false

    const payload = `${JSON.stringify(report, null, 2)}\n`
    const href = `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`
    const anchor = documentRef.createElement('a')

    anchor.href = href
    anchor.download = fileName
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

  function installReportExport(
    documentRef = root.document,
    identityApi = root.YolenManyChatMainWorldIdentityProbe,
  ) {
    if (!documentRef || typeof documentRef.addEventListener !== 'function') {
      return false
    }

    if (root.__YOLEN_MANYCHAT_MAINWORLD_REPORT_EXPORT_INSTALLED__) {
      return true
    }

    let semanticBaseline = null
    let semanticDistinct = null

    documentRef.addEventListener(
      'click',
      (event) => {
        if (event?.isTrusted !== true) return

        const button = event.target?.closest?.(`#${PROBE_BUTTON_ID}`)
        if (!button) return

        const report = parseReport(
          button.dataset?.yolenMainworldIdentityProbeResult,
        )
        if (!report) return

        const snapshot = identityApi?.snapshotCandidateMap?.(documentRef) ?? null

        if (report.stage === 'baseline_captured') {
          if (snapshot?.ready) semanticBaseline = snapshot
          return
        }

        if (report.stage === 'distinct_captured') {
          if (snapshot?.ready) semanticDistinct = snapshot
          return
        }

        if (report.stage !== FINAL_STAGE) return
        if (button.dataset?.yolenMainworldReportExported === 'true') return

        if (
          semanticBaseline?.ready &&
          semanticDistinct?.ready &&
          snapshot?.ready &&
          identityApi
        ) {
          const semantic = analyzeSemanticEquivalence(
            semanticBaseline,
            semanticDistinct,
            snapshot,
            identityApi,
          )

          const semanticReport = {
            ...(semantic.safe ?? {
              schema_version: 'yolen-manychat-identity-semantic-equivalence-v1',
              platform: 'manychat',
            }),
            pass: semantic.pass,
            reason: semantic.reason,
            stage: 'semantic_equivalence_evaluated',
          }

          const downloaded = downloadReport(
            semanticReport,
            documentRef,
            SEMANTIC_FILE_NAME,
          )

          button.dataset.yolenMainworldReportExported = downloaded
            ? 'true'
            : 'false'
          button.dataset.yolenManychatSemanticResult = JSON.stringify(semanticReport)

          if (downloaded) {
            button.textContent = semantic.pass
              ? 'Yolen · semântica PASS · relatório baixado'
              : 'Yolen · semântica inconclusiva · relatório baixado'
          }
          return
        }

        const downloaded = downloadReport(report, documentRef)
        button.dataset.yolenMainworldReportExported = downloaded
          ? 'true'
          : 'false'

        if (downloaded) {
          button.textContent = report.pass === true
            ? 'Yolen · identidade interna PASS · relatório baixado'
            : 'Yolen · identidade interna não provada · relatório baixado'
        }
      },
      false,
    )

    root.__YOLEN_MANYCHAT_MAINWORLD_REPORT_EXPORT_INSTALLED__ = true
    return true
  }

  const api = Object.freeze({
    PROBE_BUTTON_ID,
    FINAL_STAGE,
    FILE_NAME,
    SEMANTIC_FILE_NAME,
    FAMILY_DEFINITIONS,
    parseReport,
    familyForLocator,
    analyzeSemanticEquivalence,
    downloadReport,
    installReportExport,
  })

  root.YolenManyChatMainWorldReportExport = api
  installReportExport()

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
