/* global module */

;(function initYolenCompanionLeadEnrichment(root) {
  const CONTRACT_VERSION =
    'b2-lead-enrichment-candidates-v1'

  const CANDIDATE_FIELDS = Object.freeze([
    'email',
    'cpf',
    'cnpj',
    'birth_date',
    'profession',
    'cep',
    'address_raw',
    'phone_mobile',
  ])

  const CONFIDENCE_LEVELS = Object.freeze([
    'high',
    'medium',
  ])

  const SENSITIVITY_LEVELS = Object.freeze([
    'normal',
    'personal',
    'sensitive_document',
  ])

  const THIRD_PARTY_PATTERN =
    /\b(?:minha|meu|da|do|de)\s+(?:esposa|marido|m[aã]e|pai|filh[oa]|irm[aã]o|namorad[oa]|s[oó]ci[oa]|amig[oa]|cliente|funcion[aá]ri[oa])\b/i

  function cleanText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t\f\v]+/g, ' ')
      .trim()
  }

  function onlyDigits(value) {
    return String(value || '')
      .replace(/\D/g, '')
  }

  function hasRepeatedDigits(value) {
    return /^(\d)\1+$/.test(value)
  }

  function isValidCPF(value) {
    const cpf = onlyDigits(value)

    if (
      cpf.length !== 11 ||
      hasRepeatedDigits(cpf)
    ) {
      return false
    }

    let sum = 0

    for (
      let index = 0;
      index < 9;
      index += 1
    ) {
      sum +=
        Number(cpf[index]) *
        (10 - index)
    }

    let firstCheck =
      (sum * 10) % 11

    if (firstCheck === 10) {
      firstCheck = 0
    }

    if (
      firstCheck !==
      Number(cpf[9])
    ) {
      return false
    }

    sum = 0

    for (
      let index = 0;
      index < 10;
      index += 1
    ) {
      sum +=
        Number(cpf[index]) *
        (11 - index)
    }

    let secondCheck =
      (sum * 10) % 11

    if (secondCheck === 10) {
      secondCheck = 0
    }

    return (
      secondCheck ===
      Number(cpf[10])
    )
  }

  function isValidCNPJ(value) {
    const cnpj = onlyDigits(value)

    if (
      cnpj.length !== 14 ||
      hasRepeatedDigits(cnpj)
    ) {
      return false
    }

    const calculateDigit = (
      base,
      weights,
    ) => {
      const sum = base
        .split('')
        .reduce(
          (
            total,
            digit,
            index,
          ) =>
            total +
            Number(digit) *
              weights[index],
          0,
        )

      const remainder = sum % 11

      return remainder < 2
        ? 0
        : 11 - remainder
    }

    const base12 =
      cnpj.slice(0, 12)

    const firstDigit =
      calculateDigit(
        base12,
        [
          5, 4, 3, 2, 9, 8, 7,
          6, 5, 4, 3, 2,
        ],
      )

    const base13 =
      base12 + firstDigit

    const secondDigit =
      calculateDigit(
        base13,
        [
          6, 5, 4, 3, 2, 9, 8,
          7, 6, 5, 4, 3, 2,
        ],
      )

    return (
      cnpj ===
      base12 +
        firstDigit +
        secondDigit
    )
  }

  function normalizeEmail(value) {
    return cleanText(value)
      .toLowerCase()
  }

  function normalizeDate(value) {
    const match =
      String(value || '')
        .trim()
        .match(
          /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/,
        )

    if (!match) {
      return null
    }

    const day = Number(match[1])
    const month = Number(match[2])
    const year = Number(match[3])

    if (
      year < 1900 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      return null
    }

    const date =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day,
        ),
      )

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !==
        month - 1 ||
      date.getUTCDate() !== day ||
      date.getTime() > Date.now()
    ) {
      return null
    }

    return [
      String(year).padStart(4, '0'),
      String(month).padStart(2, '0'),
      String(day).padStart(2, '0'),
    ].join('-')
  }

  function normalizeCEP(value) {
    const digits = onlyDigits(value)

    return digits.length === 8
      ? digits
      : null
  }

  function normalizePhone(value) {
    const digits = onlyDigits(value)

    if (
      digits.length < 10 ||
      digits.length > 13 ||
      hasRepeatedDigits(digits)
    ) {
      return null
    }

    return digits
  }

  function buildPhoneVariants(value) {
    const digits =
      normalizePhone(value)

    const variants =
      new Set()

    if (!digits) {
      return variants
    }

    variants.add(digits)

    const local =
      digits.startsWith('55') &&
      (
        digits.length === 12 ||
        digits.length === 13
      )
        ? digits.slice(2)
        : digits

    if (
      local.length === 10 ||
      local.length === 11
    ) {
      variants.add(local)
      variants.add(`55${local}`)

      const ddd =
        local.slice(0, 2)

      if (local.length === 10) {
        const withNinthDigit =
          `${ddd}9${local.slice(2)}`

        variants.add(withNinthDigit)
        variants.add(
          `55${withNinthDigit}`,
        )
      }

      if (
        local.length === 11 &&
        local[2] === '9'
      ) {
        const withoutNinthDigit =
          `${ddd}${local.slice(3)}`

        variants.add(
          withoutNinthDigit,
        )
        variants.add(
          `55${withoutNinthDigit}`,
        )
      }
    }

    return variants
  }

  function areEquivalentPhones(
    first,
    second,
  ) {
    const firstVariants =
      buildPhoneVariants(first)

    const secondVariants =
      buildPhoneVariants(second)

    for (
      const variant of
      firstVariants
    ) {
      if (
        secondVariants.has(
          variant,
        )
      ) {
        return true
      }
    }

    return false
  }

  function getEvidenceText(message) {
    const parts = [
      cleanText(message?.text),
      cleanText(
        message?.audio_transcription,
      ),
    ].filter(Boolean)

    return Array.from(
      new Set(parts),
    ).join('\n')
  }

  function getMessageId(message) {
    const id =
      cleanText(message?.id)

    return id || null
  }

  function isIncomingMessage(message) {
    return (
      String(
        message?.direction || '',
      ).toLowerCase() ===
      'incoming'
    )
  }

  function hasThirdPartyContextNear(
    text,
    index,
  ) {
    const start =
      Math.max(0, index - 90)

    const end =
      Math.min(
        text.length,
        index + 120,
      )

    return THIRD_PARTY_PATTERN.test(
      text.slice(start, end),
    )
  }

  function hasExplicitOwnershipNear(
    text,
    index,
    fieldPattern,
  ) {
    const start =
      Math.max(0, index - 80)

    const end =
      Math.min(
        text.length,
        index + 80,
      )

    return fieldPattern.test(
      text.slice(start, end),
    )
  }

  function createCandidate({
    field,
    value,
    normalizedValue,
    messageId,
    confidence,
    sensitivity,
    detection,
  }) {
    return {
      contract_version:
        CONTRACT_VERSION,
      field,
      value,
      normalized_value:
        normalizedValue,
      source: 'conversation',
      evidence_message_ids:
        [messageId],
      confidence,
      subject: 'lead',
      sensitivity,
      detection,
      requires_human_confirmation:
        true,
    }
  }

  function collectMatches(
    text,
    pattern,
    callback,
  ) {
    pattern.lastIndex = 0

    let match

    while (
      (
        match =
          pattern.exec(text)
      ) !== null
    ) {
      callback(match)

      if (
        match[0] === ''
      ) {
        pattern.lastIndex += 1
      }
    }
  }

  function extractEmailCandidates(
    text,
    messageId,
  ) {
    const candidates = []
    const pattern =
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi

    collectMatches(
      text,
      pattern,
      (match) => {
        if (
          hasThirdPartyContextNear(
            text,
            match.index,
          )
        ) {
          return
        }

        const normalized =
          normalizeEmail(match[0])

        const explicit =
          hasExplicitOwnershipNear(
            text,
            match.index,
            /(?:\bmeu\s+e-?mail\b|\be-?mail\s*(?:é|e|:))/i,
          )

        candidates.push(
          createCandidate({
            field: 'email',
            value: match[0],
            normalizedValue:
              normalized,
            messageId,
            confidence:
              explicit
                ? 'high'
                : 'medium',
            sensitivity:
              'normal',
            detection:
              explicit
                ? 'explicit_statement'
                : 'pattern',
          }),
        )
      },
    )

    return candidates
  }

  function extractDocumentCandidates(
    text,
    messageId,
  ) {
    const candidates = []

    const cpfPattern =
      /\b(?:meu\s+cpf|cpf)\b\s*(?:é|e|:|-)?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/gi

    collectMatches(
      text,
      cpfPattern,
      (match) => {
        const digits =
          onlyDigits(match[1])

        if (
          hasThirdPartyContextNear(
            text,
            match.index,
          ) ||
          !isValidCPF(digits)
        ) {
          return
        }

        candidates.push(
          createCandidate({
            field: 'cpf',
            value: match[1],
            normalizedValue:
              digits,
            messageId,
            confidence: 'high',
            sensitivity:
              'sensitive_document',
            detection:
              'explicit_statement',
          }),
        )
      },
    )

    const cnpjPattern =
      /\b(?:meu\s+cnpj|cnpj)\b\s*(?:é|e|:|-)?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/gi

    collectMatches(
      text,
      cnpjPattern,
      (match) => {
        const digits =
          onlyDigits(match[1])

        if (
          hasThirdPartyContextNear(
            text,
            match.index,
          ) ||
          !isValidCNPJ(digits)
        ) {
          return
        }

        candidates.push(
          createCandidate({
            field: 'cnpj',
            value: match[1],
            normalizedValue:
              digits,
            messageId,
            confidence: 'high',
            sensitivity:
              'sensitive_document',
            detection:
              'explicit_statement',
          }),
        )
      },
    )

    return candidates
  }

  function extractBirthDateCandidates(
    text,
    messageId,
  ) {
    const candidates = []
    const pattern =
      /\b(?:minha\s+data\s+de\s+nascimento|data\s+de\s+nascimento|meu\s+nascimento|nasci(?:\s+em)?)\b\s*(?:é|e|:|-)?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})/gi

    collectMatches(
      text,
      pattern,
      (match) => {
        const normalized =
          normalizeDate(match[1])

        if (
          !normalized ||
          hasThirdPartyContextNear(
            text,
            match.index,
          )
        ) {
          return
        }

        candidates.push(
          createCandidate({
            field: 'birth_date',
            value: match[1],
            normalizedValue:
              normalized,
            messageId,
            confidence: 'high',
            sensitivity:
              'personal',
            detection:
              'explicit_statement',
          }),
        )
      },
    )

    return candidates
  }

  function normalizeProfession(value) {
    return cleanText(value)
      .replace(
        /\s+e\s+(?:moro|tenho|meu|minha|sou)\b[\s\S]*$/i,
        '',
      )
      .replace(/[,:;.!?]+$/g, '')
      .trim()
  }

  function extractProfessionCandidates(
    text,
    messageId,
  ) {
    const candidates = []
    const pattern =
      /\b(?:minha\s+profiss[aã]o\s+(?:é|e)|trabalho\s+como|atuo\s+como)\s+([^,.!?;\n]{2,80})/gi

    collectMatches(
      text,
      pattern,
      (match) => {
        const normalized =
          normalizeProfession(
            match[1],
          )

        if (
          normalized.length < 2 ||
          normalized.length > 80
        ) {
          return
        }

        candidates.push(
          createCandidate({
            field: 'profession',
            value: normalized,
            normalizedValue:
              normalized,
            messageId,
            confidence: 'high',
            sensitivity:
              'personal',
            detection:
              'explicit_statement',
          }),
        )
      },
    )

    return candidates
  }

  function extractCEPCandidates(
    text,
    messageId,
  ) {
    const candidates = []
    const pattern =
      /\b(?:meu\s+cep|cep)\b\s*(?:é|e|:|-)?\s*(\d{5}-?\d{3})/gi

    collectMatches(
      text,
      pattern,
      (match) => {
        const normalized =
          normalizeCEP(match[1])

        if (
          !normalized ||
          hasThirdPartyContextNear(
            text,
            match.index,
          )
        ) {
          return
        }

        candidates.push(
          createCandidate({
            field: 'cep',
            value: match[1],
            normalizedValue:
              normalized,
            messageId,
            confidence: 'high',
            sensitivity:
              'personal',
            detection:
              'explicit_statement',
          }),
        )
      },
    )

    return candidates
  }

  function extractAddressCandidates(
    text,
    messageId,
  ) {
    const candidates = []
    const pattern =
      /\b(?:meu\s+endere[cç]o\s*(?:é|e|:)?|endere[cç]o\s*:)\s*([^;\n]{5,160})/gi

    collectMatches(
      text,
      pattern,
      (match) => {
        const normalized =
          cleanText(match[1])
            .replace(/[.!?]+$/g, '')
            .trim()

        if (
          normalized.length < 5 ||
          hasThirdPartyContextNear(
            text,
            match.index,
          )
        ) {
          return
        }

        candidates.push(
          createCandidate({
            field: 'address_raw',
            value: normalized,
            normalizedValue:
              normalized,
            messageId,
            confidence: 'high',
            sensitivity:
              'personal',
            detection:
              'explicit_statement',
          }),
        )
      },
    )

    return candidates
  }

  function extractPhoneCandidates(
    text,
    messageId,
    currentPhone,
  ) {
    const candidates = []
    const pattern =
      /\b(?:meu\s+(?:outro\s+)?(?:telefone|celular|n[uú]mero)|(?:telefone|celular)\s*:|pode\s+me\s+chamar\s+no)\s*(?:é|e|:|-)?\s*(\+?\d[\d\s().-]{8,}\d)/gi

    collectMatches(
      text,
      pattern,
      (match) => {
        const normalized =
          normalizePhone(match[1])

        if (
          !normalized ||
          hasThirdPartyContextNear(
            text,
            match.index,
          ) ||
          (
            currentPhone &&
            areEquivalentPhones(
              normalized,
              currentPhone,
            )
          )
        ) {
          return
        }

        candidates.push(
          createCandidate({
            field: 'phone_mobile',
            value: match[1],
            normalizedValue:
              normalized,
            messageId,
            confidence: 'high',
            sensitivity:
              'personal',
            detection:
              'explicit_statement',
          }),
        )
      },
    )

    return candidates
  }

  function extractCandidatesFromMessage(
    message,
    options = {},
  ) {
    if (
      !isIncomingMessage(message)
    ) {
      return []
    }

    const messageId =
      getMessageId(message)

    const text =
      getEvidenceText(message)

    if (
      !messageId ||
      !text
    ) {
      return []
    }

    return [
      ...extractEmailCandidates(
        text,
        messageId,
      ),
      ...extractDocumentCandidates(
        text,
        messageId,
      ),
      ...extractBirthDateCandidates(
        text,
        messageId,
      ),
      ...extractProfessionCandidates(
        text,
        messageId,
      ),
      ...extractCEPCandidates(
        text,
        messageId,
      ),
      ...extractAddressCandidates(
        text,
        messageId,
      ),
      ...extractPhoneCandidates(
        text,
        messageId,
        options.currentPhone || null,
      ),
    ]
  }

  function getCandidateKey(
    candidate,
  ) {
    return [
      candidate.field,
      candidate.normalized_value,
    ].join(':')
  }

  function mergeCandidateEvidence(
    first,
    second,
  ) {
    const confidence =
      first.confidence === 'high' ||
      second.confidence === 'high'
        ? 'high'
        : 'medium'

    return {
      ...first,
      confidence,
      evidence_message_ids:
        Array.from(
          new Set([
            ...first
              .evidence_message_ids,
            ...second
              .evidence_message_ids,
          ]),
        ),
    }
  }

  function extractLeadEnrichmentCandidates(
    messages,
    options = {},
  ) {
    if (!Array.isArray(messages)) {
      return []
    }

    const byKey =
      new Map()

    messages.forEach((message) => {
      extractCandidatesFromMessage(
        message,
        options,
      ).forEach((candidate) => {
        const key =
          getCandidateKey(candidate)

        const existing =
          byKey.get(key)

        byKey.set(
          key,
          existing
            ? mergeCandidateEvidence(
                existing,
                candidate,
              )
            : candidate,
        )
      })
    })

    return Array.from(
      byKey.values(),
    )
  }

  function isLeadEnrichmentCandidate(
    value,
  ) {
    return Boolean(
      value &&
      typeof value === 'object' &&
      value.contract_version ===
        CONTRACT_VERSION &&
      CANDIDATE_FIELDS.includes(
        value.field,
      ) &&
      typeof value.value ===
        'string' &&
      value.value.trim() &&
      typeof value.normalized_value ===
        'string' &&
      value.normalized_value.trim() &&
      value.source ===
        'conversation' &&
      Array.isArray(
        value.evidence_message_ids,
      ) &&
      value.evidence_message_ids.length >
        0 &&
      value.evidence_message_ids.every(
        (messageId) =>
          typeof messageId ===
            'string' &&
          messageId.trim(),
      ) &&
      CONFIDENCE_LEVELS.includes(
        value.confidence,
      ) &&
      value.subject === 'lead' &&
      SENSITIVITY_LEVELS.includes(
        value.sensitivity,
      ) &&
      value.requires_human_confirmation ===
        true
    )
  }

  const api = Object.freeze({
    CONTRACT_VERSION,
    CANDIDATE_FIELDS,
    CONFIDENCE_LEVELS,
    SENSITIVITY_LEVELS,
    areEquivalentPhones,
    extractCandidatesFromMessage,
    extractLeadEnrichmentCandidates,
    isLeadEnrichmentCandidate,
    isValidCPF,
    isValidCNPJ,
    normalizeDate,
  })

  root.YolenCompanionLeadEnrichment =
    api

  if (
    typeof module !== 'undefined' &&
    module.exports
  ) {
    module.exports = api
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : window,
)
