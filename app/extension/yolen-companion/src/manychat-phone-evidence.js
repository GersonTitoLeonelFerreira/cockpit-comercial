;(function initYolenManyChatPhoneEvidence(root) {
  'use strict'

  // STEP 2B.5-C1 — extrator DE TELEFONE, read-only, sem side effects, sem
  // MutationObserver, sem rede, sem log, sem persistência. Implementa
  // EXATAMENTE a regra provada ao vivo no ManyChat real (drawer "Exibir
  // contato" FECHADO):
  //
  //   - candidato = elemento cujo texto PRÓPRIO (só os nós de texto
  //     filhos diretos, nunca o texto de elementos descendentes) contém
  //     somente dígitos/formatação (dígitos, +, espaço, parênteses, ponto
  //     ou hífen);
  //   - excluído explicitamente: qualquer elemento dentro de
  //     [data-test-id="details-subscriber-id"] (é ID interno, nunca
  //     telefone — confirmado ao vivo);
  //   - normalizado para dígitos puros;
  //   - aceito SOMENTE se: começa com "55" e tem 12 ou 13 dígitos (gate
  //     E.164 brasileiro atual — o mesmo comprimento validado ao vivo);
  //   - precisa estar dentro de um contexto ancestral (até 8 níveis, o
  //     mesmo limite já usado em manychat-mainworld-identity-probe.js)
  //     cujo texto contenha semanticamente "WhatsApp";
  //   - deduplicado por valor normalizado;
  //   - exatamente 1 valor distinto = trusted; 0 = unavailable; >1 =
  //     ambiguous (fail-closed — nunca escolhe "o primeiro").
  //
  // Não usa manychat-mainworld-identity-probe.js (React fiber/MAIN world)
  // — não é necessário: o telefone já está em texto normal do DOM,
  // legível de qualquer world. Não usa wa_id/subscriber_id como telefone
  // em nenhuma circunstância. Não usa classes CSS geradas
  // (userColumnContent_.../contentRow_.../mainContent_...) como seletor —
  // os sufixos são instáveis; a única exclusão estrutural é o
  // data-test-id explícito acima.

  const PLATFORM = 'manychat'
  const MAX_ANCESTOR_DEPTH = 8
  const MAX_CANDIDATE_ELEMENTS = 5000
  const SUBSCRIBER_ID_SELECTOR = '[data-test-id="details-subscriber-id"]'
  const WHATSAPP_CONTEXT_TOKEN = 'whatsapp'

  const OWN_TEXT_PATTERN = /^[\d+\s().-]+$/
  const BRAZIL_PHONE_PATTERN = /^55\d{10,11}$/

  function ownText(element) {
    if (!element || !element.childNodes) return ''

    let text = ''
    for (const child of element.childNodes) {
      if (child.nodeType === 3 /* TEXT_NODE */) {
        text += child.textContent ?? ''
      }
    }
    return text.trim()
  }

  function onlyDigits(value) {
    return String(value ?? '').replace(/\D+/g, '')
  }

  function isExcludedBySubscriberId(element) {
    return typeof element.closest === 'function' && Boolean(element.closest(SUBSCRIBER_ID_SELECTOR))
  }

  function hasWhatsAppAncestorContext(element) {
    let current = element
    let depth = 0

    while (current && depth <= MAX_ANCESTOR_DEPTH) {
      let text = ''
      try {
        text = String(current.textContent ?? '')
      } catch {
        text = ''
      }

      if (text.toLowerCase().includes(WHATSAPP_CONTEXT_TOKEN)) {
        return true
      }

      current = current.parentElement ?? null
      depth += 1
    }

    return false
  }

  // Coleta todos os candidatos plausíveis (já filtrados pelo gate E.164
  // brasileiro + contexto WhatsApp + exclusão do subscriber id), sem
  // deduplicar ainda — a decisão final (trusted/unavailable/ambiguous)
  // acontece em resolveTrustedPhone, a partir do conjunto de valores
  // normalizados distintos encontrados aqui.
  function collectCandidatePhones(documentRef) {
    if (!documentRef || typeof documentRef.querySelectorAll !== 'function') {
      return []
    }

    let elements = []
    try {
      elements = Array.from(documentRef.querySelectorAll('*')).slice(
        0,
        MAX_CANDIDATE_ELEMENTS,
      )
    } catch {
      return []
    }

    const distinctValues = new Set()

    for (const element of elements) {
      let text
      try {
        text = ownText(element)
      } catch {
        continue
      }

      if (!text || !OWN_TEXT_PATTERN.test(text)) continue

      try {
        if (isExcludedBySubscriberId(element)) continue
      } catch {
        continue
      }

      const digits = onlyDigits(text)
      if (!BRAZIL_PHONE_PATTERN.test(digits)) continue

      try {
        if (!hasWhatsAppAncestorContext(element)) continue
      } catch {
        continue
      }

      distinctValues.add(digits)
    }

    return [...distinctValues]
  }

  // API pública: resolveTrustedPhone(document) -> {ready, phone, evidence}
  // ou {ready:false, reason}. `phone` só existe no valor de retorno desta
  // chamada síncrona — o chamador é responsável por nunca persistir,
  // logar ou reencaminhar esse valor além da chamada privilegiada de
  // resolve-lead em phone mode (ver manychat-capture-runtime.js).
  function resolveTrustedPhone(documentRef = root.document) {
    const distinctValues = collectCandidatePhones(documentRef)

    if (distinctValues.length === 0) {
      return Object.freeze({ ready: false, reason: 'phone_unavailable' })
    }

    if (distinctValues.length > 1) {
      return Object.freeze({ ready: false, reason: 'phone_ambiguous' })
    }

    return Object.freeze({
      ready: true,
      phone: distinctValues[0],
      evidence: Object.freeze({
        source: 'manychat_dom_whatsapp_context_v1',
        candidate_count: 1,
      }),
    })
  }

  const api = Object.freeze({
    PLATFORM,
    MAX_ANCESTOR_DEPTH,
    SUBSCRIBER_ID_SELECTOR,
    resolveTrustedPhone,
  })

  root.YolenManyChatPhoneEvidence = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
