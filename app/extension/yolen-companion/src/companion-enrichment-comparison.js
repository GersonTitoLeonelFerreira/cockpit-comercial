;(function initYolenCompanionEnrichmentComparison(root) {
  'use strict'

  // FASE 8 — dono único da comparação de enriquecimento cadastral (contrato
  // §19.3/§19.4). Módulo puro, carregado no content (controller) e no
  // background (canal com resolução sanitizada): a MESMA regra decide
  // missing / same / different nos dois canais. O valor atual nunca sai
  // daqui para a view — só a semântica.

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

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '')
  }

  function addressValue(profile) {
    const parts = [
      profile?.address_street,
      profile?.address_number,
      profile?.address_complement,
      profile?.address_neighborhood,
      profile?.address_city,
      profile?.address_state,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)

    return parts.length > 0 ? parts.join(', ') : null
  }

  // Valor cadastrado atual de um campo (mesmo mapeamento usado até a FASE 7
  // pelo controller de enriquecimento).
  function readCurrentEnrichmentValue(field, lead, profile) {
    const currentLead = lead || {}
    const currentProfile = profile || {}
    const cpfCnpj = onlyDigits(currentLead.cpf_cnpj)

    if (field === 'email') return currentLead.email || currentProfile.email || null
    if (field === 'cpf') return currentProfile.cpf || (cpfCnpj.length === 11 ? cpfCnpj : null)
    if (field === 'cnpj') return currentProfile.cnpj || (cpfCnpj.length === 14 ? cpfCnpj : null)
    if (field === 'birth_date') return currentProfile.birth_date || null
    if (field === 'profession') return currentProfile.profession || null
    if (field === 'cep') return currentProfile.cep || null
    if (field === 'address_raw') return addressValue(currentProfile)
    if (field === 'phone_mobile') return currentProfile.phone_mobile || null
    return null
  }

  function normalizeComparisonValue(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function areSameEnrichmentValue(field, currentValue, candidateValue, tools = {}) {
    if (!currentValue || !candidateValue) return false

    if (field === 'cpf' || field === 'cnpj' || field === 'cep') {
      return onlyDigits(currentValue) === onlyDigits(candidateValue)
    }

    if (field === 'phone_mobile' && typeof tools.areEquivalentPhones === 'function') {
      return tools.areEquivalentPhones(currentValue, candidateValue)
    }

    const current = normalizeComparisonValue(currentValue)
    const candidate = normalizeComparisonValue(candidateValue)
    if (!current || !candidate) return false

    if (field === 'address_raw') {
      return current === candidate || current.includes(candidate) || candidate.includes(current)
    }

    return current === candidate
  }

  // candidate: { field, normalized_value }
  // context:   { lead, profile, conversationPhone }
  // tools:     { areEquivalentPhones }
  // → 'missing' | 'same' | 'different'
  function compareEnrichmentCandidate(candidate, context = {}, tools = {}) {
    const field = candidate?.field
    const value = candidate?.normalized_value

    // O telefone principal do lead (cadastrado ou, sem ele, o da conversa)
    // nunca é "telefone adicional".
    if (field === 'phone_mobile' && typeof tools.areEquivalentPhones === 'function') {
      const ownPhone = context.lead?.phone || context.conversationPhone || null
      if (ownPhone && tools.areEquivalentPhones(ownPhone, value)) return 'same'
    }

    const current = readCurrentEnrichmentValue(field, context.lead, context.profile)
    if (!current) return 'missing'
    return areSameEnrichmentValue(field, current, value, tools) ? 'same' : 'different'
  }

  const api = Object.freeze({
    ENRICHMENT_FIELDS,
    readCurrentEnrichmentValue,
    areSameEnrichmentValue,
    compareEnrichmentCandidate,
  })

  root.YolenCompanionEnrichmentComparison = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
