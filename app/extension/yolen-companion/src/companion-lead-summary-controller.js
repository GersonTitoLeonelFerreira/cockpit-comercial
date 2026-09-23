;(function initYolenCompanionLeadSummaryController(root) {
  'use strict'

  const SOURCE = 'YOLEN_COMPANION'

  // STEP 2B.5-D1 — "FECHAR PARIDADE REAL DO COMPANION": normaliza as
  // MESMAS duas ações de background que o WhatsApp já usa
  // (LOAD_LEAD_SUMMARY/SAVE_LEAD_SUMMARY, via window.YolenCompanionApi em
  // yolen-api.js) para um resultado de status previsível
  // (idle/loading/ready/error, e conflict para save) — nunca um backend
  // novo, nunca uma segunda leitura de resumo. O WhatsApp continua
  // chamando window.YolenCompanionApi.loadLeadSummary/saveLeadSummary
  // diretamente (esse é o ponto de hook que
  // seller-message-runtime.js/lead-method-guidance-runtime.js decoram —
  // trocar essa chamada quebraria a cadeia de hooks), mas a MESMA
  // semântica de status implementada aqui é o contrato que qualquer
  // plataforma sem essa cadeia de hooks (ManyChat) pode consumir
  // diretamente, sem reimplementar a lógica de status por conta própria.

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  // Carrega o resumo salvo na Yolen para {cycle_id, conversation_key}.
  // Resultado: {status:'ready', data} | {status:'error', error}.
  async function loadLeadSummary({ sendMessage, cycleId, conversationKey }) {
    if (typeof sendMessage !== 'function') {
      throw new Error('sendMessage é obrigatório.')
    }

    try {
      const response = await sendMessage({
        source: SOURCE,
        action: 'LOAD_LEAD_SUMMARY',
        payload: { cycle_id: cycleId, conversation_key: conversationKey },
      })

      if (response?.ok !== true || response?.payload?.ok !== true) {
        return Object.freeze({
          status: 'error',
          error: response?.payload?.error ?? 'Não foi possível carregar o resumo salvo na Yolen.',
        })
      }

      return Object.freeze({ status: 'ready', data: response.payload.data })
    } catch (error) {
      return Object.freeze({
        status: 'error',
        error: error instanceof Error && error.message ? error.message : 'Não foi possível carregar o resumo salvo na Yolen.',
      })
    }
  }

  // Salva o resumo por AÇÃO EXPLÍCITA do vendedor — nunca automaticamente
  // (mesmo contrato do WhatsApp: compare-and-set via expected_version).
  // Resultado: {status:'ready', data} | {status:'conflict'} | {status:'error', error}.
  async function saveLeadSummary({ sendMessage, cycleId, conversationKey, summary, expectedVersion = null }) {
    if (typeof sendMessage !== 'function') {
      throw new Error('sendMessage é obrigatório.')
    }

    try {
      const response = await sendMessage({
        source: SOURCE,
        action: 'SAVE_LEAD_SUMMARY',
        payload: {
          cycle_id: cycleId,
          conversation_key: conversationKey,
          summary,
          expected_version: expectedVersion,
        },
      })

      if (response?.payload?.code === 'LEAD_SUMMARY_VERSION_CONFLICT') {
        return Object.freeze({ status: 'conflict' })
      }

      if (response?.ok !== true || response?.payload?.ok !== true) {
        return Object.freeze({
          status: 'error',
          error: response?.payload?.error ?? 'Não foi possível salvar o resumo.',
        })
      }

      return Object.freeze({ status: 'ready', data: response.payload.data })
    } catch (error) {
      return Object.freeze({
        status: 'error',
        error: error instanceof Error && error.message ? error.message : 'Não foi possível salvar o resumo.',
      })
    }
  }

  // Extrai a versão esperada (compare-and-set) do MESMO caminho que o
  // WhatsApp já lê — nunca uma segunda convenção de onde a versão mora.
  function extractExpectedVersion(leadSummaryData) {
    return isObject(leadSummaryData) && isObject(leadSummaryData.summary) && leadSummaryData.summary.version != null
      ? leadSummaryData.summary.version
      : null
  }

  const api = Object.freeze({
    loadLeadSummary,
    saveLeadSummary,
    extractExpectedVersion,
  })

  root.YolenCompanionLeadSummaryController = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
