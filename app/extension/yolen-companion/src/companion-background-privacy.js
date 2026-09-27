;(function initYolenCompanionBackgroundPrivacy(root) {
  'use strict'

  // FASE 7 — privacidade de resolução por canal (INV-6, Q3, §19.3).
  //
  // O content script ManyChat nunca recebe payload bruto de lead. Este
  // módulo roda SÓ no background: reduz as respostas de RESOLVE_LEAD e
  // CREATE_LEAD à allowlist do DomainResolutionViewModel e guarda em
  // memória do background (nunca em storage) a referência privada
  // necessária para operações server-side posteriores — hoje, o lead_id do
  // enriquecimento cadastral confirmado, reinjetado aqui a partir do
  // cycle_id autorizado. O WhatsApp segue recebendo o payload atual.

  const MANYCHAT_HOST = 'app.manychat.com'
  const MAX_PRIVATE_REFERENCES = 200

  const ENRICHMENT_FIELDS = Object.freeze([
    'email',
    'cpf',
    'cnpj',
    'birth_date',
    'profession',
    'cep',
    'address_raw',
    'phone_mobile',
  ])

  const COMPARE_ACTION = 'COMPARE_LEAD_ENRICHMENT_CANDIDATES'

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function readSenderUrl(sender) {
    return String(sender?.tab?.url || sender?.url || sender?.origin || '')
  }

  // Origem exata do remetente (https://app.manychat.com), sem depender do
  // global URL: nenhum subdomínio/sufixo parecido é aceito.
  const MANYCHAT_ORIGIN_PATTERN = /^https:\/\/app\.manychat\.com(?:[/?#]|$)/i

  function isManyChatSender(sender) {
    return MANYCHAT_ORIGIN_PATTERN.test(readSenderUrl(sender))
  }

  function readSenderTabKey(sender) {
    const tabId = sender?.tab?.id
    return tabId === undefined || tabId === null ? 'no-tab' : String(tabId)
  }

  function textOrNull(value) {
    return typeof value === 'string' && value.trim() ? value : null
  }

  function booleanFlags(source, keys) {
    if (!isRecord(source)) {
      return {}
    }

    const flags = {}

    for (const key of keys) {
      if (typeof source[key] === 'boolean') {
        flags[key] = source[key]
      }
    }

    return flags
  }

  // Comparação única do enriquecimento (companion-enrichment-comparison.js),
  // carregada antes deste módulo no background; a mesma regra roda no
  // content do WhatsApp (§19.4).
  function comparisonTools() {
    const comparison = root.YolenCompanionEnrichmentComparison
    if (!comparison) {
      throw new Error('Comparação de enriquecimento do Companion não carregada.')
    }
    return comparison
  }

  // Semântica de presença (§19.3): o valor nunca sai do background.
  function readEnrichmentFieldState(field, lead, profile) {
    return comparisonTools().readCurrentEnrichmentValue(field, lead, profile) ? 'present' : 'missing'
  }

  function buildEnrichmentContext(payload) {
    const lead = isRecord(payload?.lead) ? payload.lead : null
    const cycleId = textOrNull(payload?.cycle?.id)

    if (payload?.status !== 'OWNED_BY_ME' || !lead?.id || !cycleId) {
      return { available: false, fields: {} }
    }

    const profile = isRecord(payload.lead_profile) ? payload.lead_profile : {}
    const fields = {}

    for (const field of ENRICHMENT_FIELDS) {
      fields[field] = readEnrichmentFieldState(field, lead, profile)
    }

    return { available: true, fields }
  }

  // Allowlist Q3: status, user_message, cycle.id/status,
  // lead_display.name, ownership_display.owner_name, capabilities e flags
  // declarados, ações booleanas e o contexto semântico de enriquecimento.
  // Fora: telefone, phone_variants, display_name, lead bruto, lead_profile,
  // owner_user_id, current_group_id, next_action* e URLs com PII.
  function sanitizeResolutionPayload(payload) {
    if (!isRecord(payload)) {
      return payload
    }

    if (payload.ok !== true) {
      return {
        ok: false,
        status: textOrNull(payload.status),
        error: textOrNull(payload.error),
      }
    }

    const leadName = textOrNull(payload.lead_display?.name) ?? textOrNull(payload.lead?.name)
    const ownerName =
      textOrNull(payload.ownership_display?.owner_name) ?? textOrNull(payload.cycle?.owner_name)

    return {
      ok: true,
      status: textOrNull(payload.status),
      user_message: textOrNull(payload.user_message),
      lead_display: leadName ? { name: leadName } : null,
      cycle: textOrNull(payload.cycle?.id)
        ? { id: payload.cycle.id, status: textOrNull(payload.cycle.status) }
        : null,
      ownership_display: ownerName ? { owner_name: ownerName } : null,
      capabilities: booleanFlags(payload.capabilities, [
        'can_create_lead',
        'can_analyze_conversation',
        'can_apply_suggestion',
        'can_open_pool',
        'can_open_cycle',
      ]),
      actions: booleanFlags(payload.actions, [
        'can_analyze_conversation',
        'can_apply_suggestion',
        'can_create_lead_inside_extension',
        'can_assign_pool_inside_extension',
        'can_transfer_owner_inside_extension',
        'can_link_lead',
      ]),
      flags: booleanFlags(payload.flags, [
        'is_admin_or_manager',
        'is_owned_by_me',
        'is_pool',
        'is_closed',
      ]),
      enrichment_context: buildEnrichmentContext(payload),
    }
  }

  function sanitizeCreateLeadPayload(payload) {
    if (!isRecord(payload)) {
      return payload
    }

    return {
      ok: payload.ok === true,
      status: textOrNull(payload.status),
      code: textOrNull(payload.code),
      error: textOrNull(payload.error),
    }
  }

  function createBackgroundPrivacy() {
    // tab → cycle_id → { leadId, lead, profile } (dados cadastrais privados
    // para CAS e comparação). Memória do service worker apenas.
    const privateReferences = new Map()

    function rememberLeadReference(sender, payload) {
      const cycleId = textOrNull(payload?.cycle?.id)
      const leadId = textOrNull(payload?.lead?.id)

      if (payload?.ok !== true || payload?.status !== 'OWNED_BY_ME' || !cycleId || !leadId) {
        return
      }

      const key = `${readSenderTabKey(sender)}::${cycleId}`
      privateReferences.delete(key)
      privateReferences.set(key, {
        leadId,
        lead: {
          phone: payload.lead.phone ?? null,
          email: payload.lead.email ?? null,
          cpf_cnpj: payload.lead.cpf_cnpj ?? null,
        },
        profile: isRecord(payload.lead_profile) ? { ...payload.lead_profile } : {},
      })

      while (privateReferences.size > MAX_PRIVATE_REFERENCES) {
        privateReferences.delete(privateReferences.keys().next().value)
      }
    }

    function readLeadReference(sender, cycleId) {
      return privateReferences.get(`${readSenderTabKey(sender)}::${String(cycleId || '')}`) ?? null
    }

    function unavailableReference() {
      return {
        response: {
          ok: false,
          statusCode: 409,
          payload: {
            ok: false,
            status: 'LEAD_REFERENCE_UNAVAILABLE',
            error: 'Atualize o lead antes de alterar o cadastro.',
          },
        },
      }
    }

    // Comparação privada (§19.3): só missing/same/different, calculada com
    // a mesma regra do content do WhatsApp sobre o cadastro em memória.
    function comparePrivately(message, sender) {
      const reference = readLeadReference(sender, message.payload?.cycle_id)
      if (!reference) return unavailableReference()

      const tools = { areEquivalentPhones: root.YolenCompanionLeadEnrichment?.areEquivalentPhones }
      const candidates = Array.isArray(message.payload?.candidates) ? message.payload.candidates : []
      const comparisons = candidates
        .filter((candidate) => ENRICHMENT_FIELDS.includes(candidate?.field) && typeof candidate?.normalized_value === 'string')
        .map((candidate) => ({
          field: candidate.field,
          normalized_value: candidate.normalized_value,
          comparison: comparisonTools().compareEnrichmentCandidate(
            candidate,
            {
              lead: reference.lead,
              profile: reference.profile,
              conversationPhone: textOrNull(message.payload?.conversation_phone),
            },
            tools,
          ),
        }))

      return { response: { ok: true, statusCode: 200, payload: { ok: true, comparisons } } }
    }

    // Antes do transporte: devolve { message } a encaminhar ou { response }
    // para responder sem rede.
    function prepareRequest(message, sender) {
      if (message?.action === COMPARE_ACTION) {
        // Só o canal sanitizado usa a comparação privada; nunca vai à rede.
        return isManyChatSender(sender)
          ? comparePrivately(message, sender)
          : { response: { ok: false, statusCode: 400, payload: { ok: false, status: 'UNSUPPORTED_CHANNEL' } } }
      }

      if (!isManyChatSender(sender) || message?.action !== 'APPLY_LEAD_ENRICHMENT') {
        return { message }
      }

      const reference = readLeadReference(sender, message.payload?.cycle_id)
      if (!reference) return unavailableReference()

      // lead_id e valor atual (CAS) vêm do cadastro privado; o content
      // nunca os conhece.
      return {
        message: {
          ...message,
          payload: {
            ...message.payload,
            lead_id: reference.leadId,
            expected_current_value: comparisonTools().readCurrentEnrichmentValue(
              message.payload?.field,
              reference.lead,
              reference.profile,
            ),
          },
        },
      }
    }

    function sanitizeResponse(message, sender, response) {
      if (!isManyChatSender(sender) || !isRecord(response)) {
        return response
      }

      if (message?.action === 'RESOLVE_LEAD') {
        rememberLeadReference(sender, response.payload)
        return { ...response, payload: sanitizeResolutionPayload(response.payload) }
      }

      if (message?.action === 'CREATE_LEAD') {
        return { ...response, payload: sanitizeCreateLeadPayload(response.payload) }
      }

      return response
    }

    function clear() {
      privateReferences.clear()
    }

    return Object.freeze({ prepareRequest, sanitizeResponse, clear })
  }

  const api = Object.freeze({
    MANYCHAT_HOST,
    ENRICHMENT_FIELDS,
    isManyChatSender,
    sanitizeResolutionPayload,
    sanitizeCreateLeadPayload,
    createBackgroundPrivacy,
  })

  root.YolenCompanionBackgroundPrivacy = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
