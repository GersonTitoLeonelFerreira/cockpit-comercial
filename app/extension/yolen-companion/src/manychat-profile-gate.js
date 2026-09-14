;(function initYolenManyChatProfileGate(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const PROBE_SCHEMA_VERSION = 'yolen-manychat-evidence-v1'
  const PROFILE_CANDIDATE_SCHEMA_VERSION = 'yolen-manychat-profile-candidate-v1'

  const SAFE_SELECTOR_ATTRIBUTES = Object.freeze([
    'data-testid',
    'data-test',
    'data-test-id',
    'data-cy',
    'data-qa',
    'role',
    'aria-label',
    'contenteditable',
    'placeholder',
    'type',
    'name',
  ])

  const SAFE_PRESENCE_SELECTOR_ATTRIBUTES = Object.freeze([
    'data-title-at',
    'data-title-offset-bottom',
    'data-title',
  ])

  const MESSAGE_PRESENCE_RELATION = 'grandchild_of_conversation_root'

  const REQUIRED_BINDINGS = Object.freeze(['conversationRoot', 'messages'])
  const OPTIONAL_BINDINGS = Object.freeze([
    'channel',
    'contact',
    'assignment',
    'composer',
  ])
  const ALL_BINDINGS = Object.freeze([
    ...REQUIRED_BINDINGS,
    ...OPTIONAL_BINDINGS,
  ])

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function fail(code, message, path = null) {
    const error = new Error(message)
    error.name = 'YolenManyChatProfileGateError'
    error.code = code
    error.path = path
    throw error
  }

  function assertPrivacy(snapshot) {
    const privacy = snapshot.privacy
    if (!isObject(privacy)) {
      fail('PRIVACY_METADATA_REQUIRED', 'Snapshot de evidência precisa declarar privacy.', 'snapshot.privacy')
    }

    const forbidden = [
      ['text_content_collected', privacy.text_content_collected],
      ['input_values_collected', privacy.input_values_collected],
      ['network_sent', privacy.network_sent],
      ['persisted', privacy.persisted],
    ]

    for (const [name, value] of forbidden) {
      if (value !== false) {
        fail(
          'UNSAFE_EVIDENCE_SNAPSHOT',
          `Snapshot recusado: privacy.${name} precisa ser false.`,
          `snapshot.privacy.${name}`,
        )
      }
    }
  }

  function assertEvidenceSnapshot(snapshot) {
    if (!isObject(snapshot)) {
      fail('EVIDENCE_REQUIRED', 'Snapshot de evidência é obrigatório.', 'snapshot')
    }

    if (snapshot.schema_version !== PROBE_SCHEMA_VERSION) {
      fail(
        'UNSUPPORTED_EVIDENCE_SCHEMA',
        `schema_version precisa ser ${PROBE_SCHEMA_VERSION}.`,
        'snapshot.schema_version',
      )
    }

    if (snapshot.platform !== PLATFORM) {
      fail('INVALID_PLATFORM', 'Snapshot não pertence ao ManyChat.', 'snapshot.platform')
    }

    if (snapshot.supported !== true) {
      fail('UNSUPPORTED_SURFACE', 'Snapshot não representa uma conversa ManyChat suportada.', 'snapshot.supported')
    }

    if (!isObject(snapshot.surface) || typeof snapshot.surface.conversation_key !== 'string') {
      fail(
        'CONVERSATION_IDENTITY_REQUIRED',
        'Snapshot precisa conter surface.conversation_key.',
        'snapshot.surface.conversation_key',
      )
    }

    if (!snapshot.surface.conversation_key.startsWith('manychat:')) {
      fail(
        'INVALID_CONVERSATION_NAMESPACE',
        'conversation_key precisa permanecer namespaced como manychat.',
        'snapshot.surface.conversation_key',
      )
    }

    if (!Array.isArray(snapshot.candidates) || snapshot.candidates.length === 0) {
      fail('CANDIDATES_REQUIRED', 'Snapshot precisa conter candidatos estruturais.', 'snapshot.candidates')
    }

    assertPrivacy(snapshot)
    return snapshot
  }

  function normalizeTag(value) {
    if (typeof value !== 'string') return null
    const tag = value.trim().toLowerCase()
    return /^[a-z][a-z0-9-]*$/.test(tag) ? tag : null
  }

  function escapeCssString(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r/g, '\\r ')
      .replace(/\n/g, '\\a ')
  }

  function isRedacted(value) {
    return typeof value === 'string' && /^\[redacted-(?:email|number|id)\]$/i.test(value.trim())
  }

  function getCandidate(snapshot, index, path) {
    if (!Number.isInteger(index) || index < 0 || index >= snapshot.candidates.length) {
      fail('INVALID_CANDIDATE_INDEX', `${path}.candidate_index é inválido.`, `${path}.candidate_index`)
    }

    const candidate = snapshot.candidates[index]
    if (!isObject(candidate) || !isObject(candidate.attributes)) {
      fail('INVALID_CANDIDATE', `Candidato ${index} é inválido.`, path)
    }

    return candidate
  }

  function observedMatchCount(snapshot, tag, attribute, value) {
    let count = 0

    for (const candidate of snapshot.candidates) {
      if (!isObject(candidate) || !isObject(candidate.attributes)) continue
      const candidateTag = normalizeTag(candidate.tag)
      if (tag && candidateTag !== tag) continue
      if (candidate.attributes[attribute] === value) count += 1
    }

    return count
  }

  function compileValueBinding(snapshot, bindingName, binding) {
    const path = `mapping.${bindingName}`

    if (!isObject(binding)) {
      fail('BINDING_REQUIRED', `${path} precisa ser um objeto.`, path)
    }

    const attribute = typeof binding.attribute === 'string' ? binding.attribute.trim() : ''
    if (!SAFE_SELECTOR_ATTRIBUTES.includes(attribute)) {
      fail(
        'UNSAFE_SELECTOR_ATTRIBUTE',
        `${path}.attribute não pertence à allowlist estrutural.`,
        `${path}.attribute`,
      )
    }

    const candidate = getCandidate(snapshot, binding.candidate_index, path)
    const value = candidate.attributes[attribute]

    if (typeof value !== 'string' || !value.trim()) {
      fail(
        'ATTRIBUTE_NOT_OBSERVED',
        `${attribute} não foi observado no candidato informado.`,
        path,
      )
    }

    if (isRedacted(value)) {
      fail(
        'REDACTED_SELECTOR_VALUE',
        'Valor redigido não pode virar seletor de runtime.',
        path,
      )
    }

    const tag = binding.include_tag === false ? null : normalizeTag(candidate.tag)
    if (binding.include_tag !== false && !tag) {
      fail('INVALID_CANDIDATE_TAG', 'Tag estrutural inválida para compor seletor.', path)
    }

    const selector = `${tag ?? ''}[${attribute}="${escapeCssString(value)}"]`
    const matchCount = observedMatchCount(snapshot, tag, attribute, value)

    if (bindingName !== 'messages' && matchCount !== 1) {
      fail(
        'NON_UNIQUE_OBSERVED_SELECTOR',
        `${path} precisa identificar exatamente um candidato no snapshot observado.`,
        path,
      )
    }

    if (bindingName === 'messages' && matchCount < 1) {
      fail('MESSAGE_SELECTOR_NOT_OBSERVED', 'Seletor de mensagens não possui evidência observada.', path)
    }

    return Object.freeze({
      mode: 'attribute_value',
      candidate_index: binding.candidate_index,
      tag,
      attribute,
      observed_value: value,
      observed_match_count: matchCount,
      selector,
    })
  }

  function ancestorMatchesBinding(ancestor, binding) {
    if (!isObject(ancestor) || !isObject(ancestor.attributes)) return false
    if (binding.tag && normalizeTag(ancestor.tag) !== binding.tag) return false
    return ancestor.attributes[binding.attribute] === binding.observed_value
  }

  function normalizePresenceAttributes(value, path) {
    if (!Array.isArray(value) || value.length === 0) {
      fail(
        'PRESENCE_ATTRIBUTES_REQUIRED',
        `${path}.presence_attributes precisa conter atributos estruturais.`,
        `${path}.presence_attributes`,
      )
    }

    const normalized = []
    for (const raw of value) {
      const name = typeof raw === 'string' ? raw.trim() : ''
      if (!SAFE_PRESENCE_SELECTOR_ATTRIBUTES.includes(name)) {
        fail(
          'UNSAFE_PRESENCE_SELECTOR_ATTRIBUTE',
          `${name || '<vazio>'} não pertence à allowlist de presença estrutural.`,
          `${path}.presence_attributes`,
        )
      }
      if (!normalized.includes(name)) normalized.push(name)
    }

    return normalized
  }

  function candidateHasPresence(candidate, attributes) {
    const observed = Array.isArray(candidate?.attribute_presence)
      ? candidate.attribute_presence
      : []
    return attributes.every((name) => observed.includes(name))
  }

  function observedPresenceMatchCount(snapshot, tag, parentTag, attributes, rootBinding) {
    let count = 0

    for (const candidate of snapshot.candidates) {
      if (!isObject(candidate) || normalizeTag(candidate.tag) !== tag) continue
      if (!candidateHasPresence(candidate, attributes)) continue

      const immediateParent = candidate.ancestors?.[0]
      const grandParent = candidate.ancestors?.[1]
      if (normalizeTag(immediateParent?.tag) !== parentTag) continue
      if (!ancestorMatchesBinding(grandParent, rootBinding)) continue
      count += 1
    }

    return count
  }

  function compilePresenceMessagesBinding(snapshot, binding, conversationRootBinding) {
    const path = 'mapping.messages'

    if (!isObject(binding)) {
      fail('BINDING_REQUIRED', `${path} precisa ser um objeto.`, path)
    }

    if (binding.relation !== MESSAGE_PRESENCE_RELATION) {
      fail(
        'UNSAFE_MESSAGE_RELATION',
        `${path}.relation precisa ser ${MESSAGE_PRESENCE_RELATION}.`,
        `${path}.relation`,
      )
    }

    const candidate = getCandidate(snapshot, binding.candidate_index, path)
    const attributes = normalizePresenceAttributes(binding.presence_attributes, path)

    if (!candidateHasPresence(candidate, attributes)) {
      fail(
        'PRESENCE_ATTRIBUTE_NOT_OBSERVED',
        'A presença estrutural informada não foi observada no candidato.',
        path,
      )
    }

    const tag = normalizeTag(candidate.tag)
    const immediateParent = candidate.ancestors?.[0]
    const grandParent = candidate.ancestors?.[1]
    const parentTag = normalizeTag(immediateParent?.tag)

    if (!tag || !parentTag) {
      fail(
        'RELATIONAL_STRUCTURE_NOT_OBSERVED',
        'Candidato não possui estrutura ancestral suficiente para o seletor relacional.',
        path,
      )
    }

    if (!ancestorMatchesBinding(grandParent, conversationRootBinding)) {
      fail(
        'CONVERSATION_ROOT_RELATION_NOT_OBSERVED',
        'Candidato de mensagem não foi observado como neto do conversationRoot.',
        path,
      )
    }

    const presenceSelector = attributes.map((name) => `[${name}]`).join('')
    const selector = `:scope > ${parentTag} > ${tag}${presenceSelector}`
    const matchCount = observedPresenceMatchCount(
      snapshot,
      tag,
      parentTag,
      attributes,
      conversationRootBinding,
    )

    if (matchCount < 1) {
      fail(
        'MESSAGE_SELECTOR_NOT_OBSERVED',
        'Seletor relacional de mensagens não possui evidência observada.',
        path,
      )
    }

    return Object.freeze({
      mode: 'attribute_presence',
      relation: MESSAGE_PRESENCE_RELATION,
      candidate_index: binding.candidate_index,
      tag,
      parent_tag: parentTag,
      presence_attributes: Object.freeze(attributes.slice()),
      observed_match_count: matchCount,
      selector,
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

  function createFingerprint(snapshot, bindings) {
    const canonical = JSON.stringify({
      schema_version: snapshot.schema_version,
      platform: snapshot.platform,
      selectors: Object.fromEntries(
        Object.entries(bindings)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([name, value]) => [name, value?.selector ?? null]),
      ),
    })

    return `mc-profile-${fnv1a(canonical)}`
  }

  function buildEvidenceBoundProfileCandidate(snapshot, mapping) {
    assertEvidenceSnapshot(snapshot)

    if (!isObject(mapping)) {
      fail('MAPPING_REQUIRED', 'mapping é obrigatório.', 'mapping')
    }

    for (const name of Object.keys(mapping)) {
      if (!ALL_BINDINGS.includes(name)) {
        fail('UNKNOWN_BINDING', `Binding desconhecido: ${name}.`, `mapping.${name}`)
      }
    }

    for (const name of REQUIRED_BINDINGS) {
      if (!mapping[name]) {
        fail('REQUIRED_BINDING_MISSING', `mapping.${name} é obrigatório.`, `mapping.${name}`)
      }
    }

    const bindings = {}
    bindings.conversationRoot = compileValueBinding(
      snapshot,
      'conversationRoot',
      mapping.conversationRoot,
    )

    bindings.messages = mapping.messages.mode === 'attribute_presence'
      ? compilePresenceMessagesBinding(
          snapshot,
          mapping.messages,
          bindings.conversationRoot,
        )
      : compileValueBinding(snapshot, 'messages', mapping.messages)

    for (const name of OPTIONAL_BINDINGS) {
      bindings[name] = mapping[name]
        ? compileValueBinding(snapshot, name, mapping[name])
        : null
    }

    const selectors = Object.freeze(
      Object.fromEntries(
        ALL_BINDINGS.map((name) => [name, bindings[name]?.selector ?? null]),
      ),
    )

    const fingerprint = createFingerprint(snapshot, bindings)

    return Object.freeze({
      schema_version: PROFILE_CANDIDATE_SCHEMA_VERSION,
      platform: PLATFORM,
      evidence_schema_version: snapshot.schema_version,
      evidence_observed_at: snapshot.observed_at ?? null,
      conversation_namespace: 'manychat',
      fingerprint,
      selectors,
      bindings: Object.freeze(bindings),
      approved_for_runtime: false,
      capture_enabled: false,
      persistence_enabled: false,
      reasoning_enabled: false,
      requires_authenticated_dom_validation: true,
    })
  }

  const api = Object.freeze({
    PLATFORM,
    PROBE_SCHEMA_VERSION,
    PROFILE_CANDIDATE_SCHEMA_VERSION,
    SAFE_SELECTOR_ATTRIBUTES,
    SAFE_PRESENCE_SELECTOR_ATTRIBUTES,
    MESSAGE_PRESENCE_RELATION,
    REQUIRED_BINDINGS,
    OPTIONAL_BINDINGS,
    assertEvidenceSnapshot,
    buildEvidenceBoundProfileCandidate,
  })

  root.YolenManyChatProfileGate = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
