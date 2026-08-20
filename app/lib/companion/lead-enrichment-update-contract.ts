export const LEAD_ENRICHMENT_UPDATE_FIELDS = [
  'email',
  'cpf',
  'cnpj',
  'birth_date',
  'profession',
  'cep',
  'phone_mobile',
] as const

export type LeadEnrichmentUpdateField =
  (typeof LEAD_ENRICHMENT_UPDATE_FIELDS)[number]

export type LeadEnrichmentUpdateInput = {
  leadId: string
  cycleId: string
  field: LeadEnrichmentUpdateField
  value: string
  expectedCurrentValue: string | null
  evidenceMessageIds: string[]
  confirmedByHuman: true
}

type NormalizeResult =
  | {
      ok: true
      value: LeadEnrichmentUpdateInput
    }
  | {
      ok: false
      code: string
      error: string
    }

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const FIELD_SET =
  new Set<string>(
    LEAD_ENRICHMENT_UPDATE_FIELDS,
  )

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function onlyDigits(value: unknown) {
  return String(value ?? '')
    .replace(/\D/g, '')
}

function cleanText(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value)
}

function isValidCpf(value: string) {
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

function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value)

  if (
    cnpj.length !== 14 ||
    hasRepeatedDigits(cnpj)
  ) {
    return false
  }

  const calculateDigit = (
    base: string,
    weights: number[],
  ) => {
    const sum =
      base
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

    const remainder =
      sum % 11

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

function normalizeBirthDate(
  value: unknown,
) {
  const text =
    cleanText(value)

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      text,
    )
  ) {
    return null
  }

  const date =
    new Date(
      `${text}T00:00:00.000Z`,
    )

  if (
    Number.isNaN(
      date.getTime(),
    ) ||
    date
      .toISOString()
      .slice(0, 10) !== text
  ) {
    return null
  }

  const today =
    new Date()
      .toISOString()
      .slice(0, 10)

  if (
    text < '1900-01-01' ||
    text > today
  ) {
    return null
  }

  return text
}

export function normalizeLeadEnrichmentFieldValue(
  field: LeadEnrichmentUpdateField,
  value: unknown,
): string | null {
  if (field === 'email') {
    const email =
      cleanText(value)
        .toLowerCase()

    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email,
      )
    ) {
      return null
    }

    return email
  }

  if (field === 'cpf') {
    const cpf =
      onlyDigits(value)

    return isValidCpf(cpf)
      ? cpf
      : null
  }

  if (field === 'cnpj') {
    const cnpj =
      onlyDigits(value)

    return isValidCnpj(cnpj)
      ? cnpj
      : null
  }

  if (field === 'birth_date') {
    return normalizeBirthDate(
      value,
    )
  }

  if (field === 'profession') {
    const profession =
      cleanText(value)

    if (
      !profession ||
      profession.length > 160
    ) {
      return null
    }

    return profession
  }

  if (field === 'cep') {
    const cep =
      onlyDigits(value)

    return cep.length === 8
      ? cep
      : null
  }

  if (field === 'phone_mobile') {
    const phone =
      onlyDigits(value)

    return (
      phone.length >= 10 &&
      phone.length <= 13
    )
      ? phone
      : null
  }

  return null
}

function normalizeEvidenceMessageIds(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return null
  }

  const ids =
    Array.from(
      new Set(
        value
          .filter(
            (item) =>
              typeof item ===
              'string',
          )
          .map((item) =>
            item.trim(),
          )
          .filter(
            (item) =>
              item.length > 0 &&
              item.length <= 240,
          ),
      ),
    )

  if (
    ids.length === 0 ||
    ids.length > 40
  ) {
    return null
  }

  return ids
}

export function normalizeLeadEnrichmentUpdateInput(
  input: unknown,
): NormalizeResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      code: 'invalid_payload',
      error:
        'Payload de enriquecimento inválido.',
    }
  }

  if (
    input.confirmed_by_human !== true
  ) {
    return {
      ok: false,
      code:
        'human_confirmation_required',
      error:
        'A atualização cadastral exige confirmação humana explícita.',
    }
  }

  const leadId =
    typeof input.lead_id ===
    'string'
      ? input.lead_id
          .trim()
          .toLowerCase()
      : ''

  const cycleId =
    typeof input.cycle_id ===
    'string'
      ? input.cycle_id
          .trim()
          .toLowerCase()
      : ''

  if (
    !UUID_PATTERN.test(leadId) ||
    !UUID_PATTERN.test(cycleId)
  ) {
    return {
      ok: false,
      code: 'invalid_scope',
      error:
        'Lead ou ciclo inválido.',
    }
  }

  const fieldRaw =
    typeof input.field ===
    'string'
      ? input.field.trim()
      : ''

  if (!FIELD_SET.has(fieldRaw)) {
    return {
      ok: false,
      code: 'unsupported_field',
      error:
        'Campo não suportado pelo enriquecimento automático.',
    }
  }

  const field =
    fieldRaw as
      LeadEnrichmentUpdateField

  const normalizedValue =
    normalizeLeadEnrichmentFieldValue(
      field,
      input.value,
    )

  if (!normalizedValue) {
    return {
      ok: false,
      code: 'invalid_value',
      error:
        'Valor cadastral inválido.',
    }
  }

  let expectedCurrentValue:
    string | null = null

  if (
    input.expected_current_value !==
      null &&
    input.expected_current_value !==
      undefined &&
    String(
      input.expected_current_value,
    ).trim()
  ) {
    expectedCurrentValue =
      normalizeLeadEnrichmentFieldValue(
        field,
        input.expected_current_value,
      )

    if (!expectedCurrentValue) {
      return {
        ok: false,
        code:
          'invalid_expected_value',
        error:
          'Valor atual esperado é inválido.',
      }
    }
  }

  const evidenceMessageIds =
    normalizeEvidenceMessageIds(
      input.evidence_message_ids,
    )

  if (!evidenceMessageIds) {
    return {
      ok: false,
      code: 'invalid_evidence',
      error:
        'A atualização precisa de evidência válida da conversa.',
    }
  }

  return {
    ok: true,
    value: {
      leadId,
      cycleId,
      field,
      value:
        normalizedValue,
      expectedCurrentValue,
      evidenceMessageIds,
      confirmedByHuman: true,
    },
  }
}

export function areLeadEnrichmentValuesEqual(
  field: LeadEnrichmentUpdateField,
  first: unknown,
  second: unknown,
) {
  const firstNormalized =
    first === null ||
    first === undefined ||
    String(first).trim() === ''
      ? null
      : normalizeLeadEnrichmentFieldValue(
          field,
          first,
        )

  const secondNormalized =
    second === null ||
    second === undefined ||
    String(second).trim() === ''
      ? null
      : normalizeLeadEnrichmentFieldValue(
          field,
          second,
        )

  return (
    firstNormalized ===
    secondNormalized
  )
}
