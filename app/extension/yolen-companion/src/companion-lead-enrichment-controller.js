;(function initYolenCompanionLeadEnrichmentController(root) {
  'use strict'

  const SOURCE = 'YOLEN_COMPANION'

  const CONFIRMABLE_FIELDS = Object.freeze([
    'email',
    'cpf',
    'cnpj',
    'birth_date',
    'profession',
    'cep',
    'phone_mobile',
  ])

  function leadEnrichmentTools() {
    return root.YolenCompanionLeadEnrichment ?? null
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '')
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

  // MESMA regra de comparação que content-script.js#areSameLeadEnrichmentValue
  // usa para os campos não-telefônicos — nunca uma segunda definição de
  // "já consta no cadastro". phone_mobile NUNCA passa por aqui: a
  // comparação de telefone é feita no servidor (ver
  // app/api/companion/lead-enrichment-context/route.ts), que nunca
  // devolve o telefone atual ao content script.
  function areSameNonPhoneValue(field, currentValue, candidateValue) {
    if (!currentValue || !candidateValue) return false

    if (field === 'cpf' || field === 'cnpj' || field === 'cep') {
      return onlyDigits(currentValue) === onlyDigits(candidateValue)
    }

    const currentNormalized = normalizeComparisonValue(currentValue)
    const candidateNormalized = normalizeComparisonValue(candidateValue)

    if (!currentNormalized || !candidateNormalized) return false

    if (field === 'address_raw') {
      return (
        currentNormalized === candidateNormalized ||
        currentNormalized.includes(candidateNormalized) ||
        candidateNormalized.includes(currentNormalized)
      )
    }

    return currentNormalized === candidateNormalized
  }

  function isConfirmableCandidate(candidate) {
    return CONFIRMABLE_FIELDS.includes(candidate?.field)
  }

  function buildCandidateKey({ leadId, candidate }) {
    const evidenceIds = Array.isArray(candidate?.evidence_message_ids)
      ? candidate.evidence_message_ids
      : []

    return [
      leadId || '',
      candidate?.field || '',
      candidate?.normalized_value || '',
      candidate?.current_value || '',
      ...evidenceIds,
    ].join('::')
  }

  // Extração pura dos candidatos a partir de mensagens já observadas
  // (ledger) — reaproveita 100% lead-enrichment.js (mesmo módulo que o
  // WhatsApp usa), nunca uma segunda regra de detecção de padrão.
  function extractCandidatesFromMessages(messages, options = {}) {
    const tools = leadEnrichmentTools()

    if (
      !tools ||
      typeof tools.extractLeadEnrichmentCandidates !== 'function' ||
      typeof tools.isLeadEnrichmentCandidate !== 'function' ||
      !Array.isArray(messages)
    ) {
      return []
    }

    return tools
      .extractLeadEnrichmentCandidates(messages, options)
      .filter((candidate) => tools.isLeadEnrichmentCandidate(candidate))
  }

  // Consulta LOAD_LEAD_ENRICHMENT_CONTEXT — a ÚNICA fonte de lead_id e de
  // valores atuais para comparação no ManyChat (nunca o payload de
  // RESOLVE_LEAD/RESOLVE_MANYCHAT_LEAD_BY_PHONE, que continua sanitizado
  // de propósito). phoneCandidateValues são os normalized_value já
  // extraídos localmente (nunca o telefone atual do lead).
  async function loadEnrichmentContext({ sendMessage, cycleId, phoneCandidateValues }) {
    if (typeof sendMessage !== 'function') {
      throw new Error('sendMessage é obrigatório.')
    }

    try {
      const response = await sendMessage({
        source: SOURCE,
        action: 'LOAD_LEAD_ENRICHMENT_CONTEXT',
        payload: {
          cycle_id: cycleId,
          phone_candidates: Array.isArray(phoneCandidateValues) ? phoneCandidateValues : [],
        },
      })

      if (response?.ok !== true || response?.payload?.ok !== true || !response?.payload?.data) {
        return Object.freeze({
          status: 'error',
          error: response?.payload?.error || 'Não foi possível consultar o cadastro atual.',
        })
      }

      const data = response.payload.data

      return Object.freeze({
        status: 'ready',
        leadId: data.lead_id || null,
        currentValues: data.current_values && typeof data.current_values === 'object' ? data.current_values : {},
        phoneRegistered: data.phone_registered === true,
        phoneMatches: Array.isArray(data.phone_matches) ? data.phone_matches : [],
      })
    } catch (error) {
      return Object.freeze({
        status: 'error',
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Falha de comunicação ao consultar o cadastro atual.',
      })
    }
  }

  // Anota os candidatos extraídos com current_value/comparison/key —
  // MESMA semântica de filtragem que content-script.js#getLeadEnrichmentCandidates
  // usa para o ramo isOwnedLead (um candidato cujo valor já bate com o
  // cadastro nunca aparece: nada para confirmar). phone_mobile nunca
  // expõe current_value (hardening de telefone) — quando o telefone
  // detectado difere de um telefone JÁ cadastrado (comparison
  // 'different_locked'), a confirmação automática fica bloqueada (ver
  // isCandidateConfirmableNow) porque expected_current_value nunca pode
  // ser reconstruído sem expor o valor atual.
  function annotateCandidates({ candidates, leadId, currentValues, phoneRegistered, phoneMatches }) {
    if (!Array.isArray(candidates)) return []

    const phoneMatchByValue = new Map(
      (Array.isArray(phoneMatches) ? phoneMatches : []).map((entry) => [
        entry?.normalized_value,
        entry?.matches === true,
      ]),
    )

    return candidates.flatMap((candidate) => {
      if (candidate.field === 'phone_mobile') {
        const alreadyMatches = phoneMatchByValue.get(candidate.normalized_value) === true
        if (alreadyMatches) return []

        return [
          {
            ...candidate,
            current_value: null,
            comparison: phoneRegistered ? 'different_locked' : 'missing',
            key: buildCandidateKey({ leadId, candidate }),
          },
        ]
      }

      const currentValue = currentValues?.[candidate.field] ?? null

      if (currentValue && areSameNonPhoneValue(candidate.field, currentValue, candidate.normalized_value)) {
        return []
      }

      return [
        {
          ...candidate,
          current_value: currentValue || null,
          comparison: currentValue ? 'different' : 'missing',
          key: buildCandidateKey({ leadId, candidate }),
        },
      ]
    })
  }

  // Um candidato só pode ser confirmado por ação explícita do vendedor
  // quando: (1) o campo é confirmável, (2) exige confirmação humana (o
  // próprio candidato já carrega isso), e (3) NÃO é o caso
  // 'different_locked' (telefone diferente de um já cadastrado — nunca
  // confirmável via ManyChat, ver annotateCandidates acima).
  function isCandidateConfirmableNow(candidate) {
    return (
      isConfirmableCandidate(candidate) &&
      candidate?.requires_human_confirmation === true &&
      candidate?.comparison !== 'different_locked'
    )
  }

  // Aplica a confirmação — MESMA action/contrato que o WhatsApp já usa
  // (APPLY_LEAD_ENRICHMENT -> /api/companion/enrich-lead), nunca um
  // segundo endpoint. leadId vem SEMPRE de loadEnrichmentContext (nunca
  // do payload de resolução sanitizado).
  async function applyCandidate({ sendMessage, leadId, cycleId, candidate }) {
    if (typeof sendMessage !== 'function') {
      throw new Error('sendMessage é obrigatório.')
    }

    if (!leadId || !cycleId) {
      return Object.freeze({ status: 'error', error: 'Lead ou ciclo indisponível.' })
    }

    if (!isCandidateConfirmableNow(candidate)) {
      return Object.freeze({
        status: 'error',
        error: 'Este dado exige revisão manual antes de alterar o cadastro.',
      })
    }

    try {
      const response = await sendMessage({
        source: SOURCE,
        action: 'APPLY_LEAD_ENRICHMENT',
        payload: {
          lead_id: leadId,
          cycle_id: cycleId,
          field: candidate.field,
          value: candidate.normalized_value,
          expected_current_value: candidate.current_value || null,
          evidence_message_ids: candidate.evidence_message_ids,
          confirmed_by_human: true,
        },
      })

      if (response?.ok !== true || response?.payload?.ok !== true) {
        return Object.freeze({
          status: 'error',
          error: response?.payload?.error || 'Não foi possível atualizar o cadastro.',
        })
      }

      return Object.freeze({ status: 'success' })
    } catch (error) {
      return Object.freeze({
        status: 'error',
        error: error instanceof Error && error.message ? error.message : 'Erro ao atualizar o cadastro.',
      })
    }
  }

  const api = Object.freeze({
    extractCandidatesFromMessages,
    loadEnrichmentContext,
    annotateCandidates,
    isConfirmableCandidate,
    isCandidateConfirmableNow,
    applyCandidate,
    buildCandidateKey,
  })

  root.YolenCompanionLeadEnrichmentController = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
