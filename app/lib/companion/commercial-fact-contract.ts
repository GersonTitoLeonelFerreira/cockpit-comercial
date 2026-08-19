// ============================================================================
// Yolen — Inteligência Comercial
// Contrato semântico de fatos oficiais
//
// IA interpreta. Banco comprova.
//
// Um fato oficial representa uma afirmação comercial verificável,
// com escopo, condições, vigência e procedência explícitos.
// ============================================================================

export const COMMERCIAL_FACT_CONTRACT_VERSION =
  'commercial-fact-v2' as const

export const COMMERCIAL_FACT_SCOPE_TYPES = [
  'company',
  'product',
  'product_variant',
  'commercial_policy',
  'operation',
  'service',
  'integration',
  'security',
  'other',
] as const

export const COMMERCIAL_FACT_SOURCE_TYPES = [
  'internal_policy',
  'contract',
  'product_documentation',
  'system_record',
  'manual_verification',
  'regulatory_document',
  'other',
] as const

export const COMMERCIAL_FACT_VALIDITY_MODES = [
  'ongoing',
  'bounded',
] as const

export type CommercialFactScopeType =
  (typeof COMMERCIAL_FACT_SCOPE_TYPES)[number]

export type CommercialFactSourceType =
  (typeof COMMERCIAL_FACT_SOURCE_TYPES)[number]

export type CommercialFactValidityMode =
  (typeof COMMERCIAL_FACT_VALIDITY_MODES)[number]

export type CommercialFactScope = {
  type:
    CommercialFactScopeType

  product_id:
    string | null

  variant_key:
    string | null

  reference_key:
    string | null
}

export type CommercialFactValidity = {
  mode:
    CommercialFactValidityMode

  valid_from:
    string | null

  valid_until:
    string | null
}

export type CommercialFactSource = {
  type:
    CommercialFactSourceType

  reference:
    string

  verified_at:
    string
}

export type CommercialFactDefinition = {
  contract_version:
    typeof COMMERCIAL_FACT_CONTRACT_VERSION

  fact_kind:
    'official'

  category:
    string

  fact_key:
    string

  fact_value:
    string

  scope:
    CommercialFactScope

  conditions:
    string[]

  limitations:
    string[]

  validity:
    CommercialFactValidity

  source:
    CommercialFactSource
}

export type CommercialFactValidationIssue = {
  path: string

  code:
    | 'INVALID_VALUE'
    | 'DUPLICATE_ITEM'
    | 'SCOPE_CONFLICT'
    | 'INVALID_CHRONOLOGY'

  message: string
}

export type CommercialFactValidationResult = {
  valid: boolean

  issues:
    CommercialFactValidationIssue[]
}

type JsonRecord =
  Record<string, unknown>

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function addIssue(
  issues:
    CommercialFactValidationIssue[],
  path: string,
  code:
    CommercialFactValidationIssue['code'],
  message: string,
) {
  issues.push({
    path,
    code,
    message,
  })
}

function hasText(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    Boolean(value.trim())
  )
}

function validateText(
  value: unknown,
  path: string,
  issues:
    CommercialFactValidationIssue[],
  maxLength: number,
): string | null {
  if (!hasText(value)) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      `${path} precisa possuir texto.`,
    )

    return null
  }

  const normalized =
    value.trim()

  if (
    normalized.length >
    maxLength
  ) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      `${path} excede o tamanho máximo permitido.`,
    )
  }

  return normalized
}

function validateNullableText(
  value: unknown,
  path: string,
  issues:
    CommercialFactValidationIssue[],
  maxLength: number,
): string | null {
  if (value === null) {
    return null
  }

  return validateText(
    value,
    path,
    issues,
    maxLength,
  )
}

function comparableText(
  value: string,
): string {
  return value
    .trim()
    .toLocaleLowerCase(
      'pt-BR',
    )
}

function validateTextArray(
  value: unknown,
  path: string,
  issues:
    CommercialFactValidationIssue[],
): string[] {
  if (!Array.isArray(value)) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      `${path} precisa ser uma lista.`,
    )

    return []
  }

  const normalized:
    string[] = []

  const seen =
    new Set<string>()

  value.forEach(
    (item, index) => {
      const itemPath =
        `${path}[${index}]`

      const text =
        validateText(
          item,
          itemPath,
          issues,
          2000,
        )

      if (text === null) {
        return
      }

      const comparable =
        comparableText(
          text,
        )

      if (seen.has(comparable)) {
        addIssue(
          issues,
          itemPath,
          'DUPLICATE_ITEM',
          `${path} não pode repetir o mesmo item.`,
        )

        return
      }

      seen.add(comparable)

      normalized.push(text)
    },
  )

  return normalized
}

function validDate(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    Boolean(value.trim()) &&
    Number.isFinite(
      Date.parse(value),
    )
  )
}

function validateScope(
  value: unknown,
  issues:
    CommercialFactValidationIssue[],
) {
  const path =
    'scope'

  if (!isRecord(value)) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      'scope precisa ser um objeto.',
    )

    return
  }

  const type =
    value.type

  if (
    typeof type !== 'string' ||
    !COMMERCIAL_FACT_SCOPE_TYPES
      .includes(
        type as
          CommercialFactScopeType,
      )
  ) {
    addIssue(
      issues,
      `${path}.type`,
      'INVALID_VALUE',
      'O tipo de escopo do fato é inválido.',
    )

    return
  }

  const productId =
    validateNullableText(
      value.product_id,
      `${path}.product_id`,
      issues,
      200,
    )

  const variantKey =
    validateNullableText(
      value.variant_key,
      `${path}.variant_key`,
      issues,
      200,
    )

  const referenceKey =
    validateNullableText(
      value.reference_key,
      `${path}.reference_key`,
      issues,
      300,
    )

  if (type === 'company') {
    if (
      productId !== null ||
      variantKey !== null ||
      referenceKey !== null
    ) {
      addIssue(
        issues,
        path,
        'SCOPE_CONFLICT',
        'Fato de empresa não pode apontar para produto, variante ou referência específica.',
      )
    }

    return
  }

  if (type === 'product') {
    if (
      productId === null ||
      variantKey !== null ||
      referenceKey !== null
    ) {
      addIssue(
        issues,
        path,
        'SCOPE_CONFLICT',
        'Fato de produto exige product_id e não pode declarar variant_key ou reference_key.',
      )
    }

    return
  }

  if (
    type ===
    'product_variant'
  ) {
    if (
      productId === null ||
      variantKey === null ||
      referenceKey !== null
    ) {
      addIssue(
        issues,
        path,
        'SCOPE_CONFLICT',
        'Fato de variante exige product_id e variant_key e não utiliza reference_key.',
      )
    }

    return
  }

  if (
    productId !== null ||
    variantKey !== null ||
    referenceKey === null
  ) {
    addIssue(
      issues,
      path,
      'SCOPE_CONFLICT',
      `Fato com escopo ${type} exige reference_key e não pode apontar para produto ou variante.`,
    )
  }
}

function validateValidity(
  value: unknown,
  issues:
    CommercialFactValidationIssue[],
) {
  const path =
    'validity'

  if (!isRecord(value)) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      'validity precisa ser um objeto.',
    )

    return
  }

  const mode =
    value.mode

  if (
    typeof mode !== 'string' ||
    !COMMERCIAL_FACT_VALIDITY_MODES
      .includes(
        mode as
          CommercialFactValidityMode,
      )
  ) {
    addIssue(
      issues,
      `${path}.mode`,
      'INVALID_VALUE',
      'O modo de vigência do fato é inválido.',
    )

    return
  }

  const validFrom =
    value.valid_from

  const validUntil =
    value.valid_until

  if (
    validFrom !== null &&
    !validDate(validFrom)
  ) {
    addIssue(
      issues,
      `${path}.valid_from`,
      'INVALID_VALUE',
      'valid_from precisa ser uma data válida ou null.',
    )
  }

  if (
    mode === 'ongoing'
  ) {
    if (validUntil !== null) {
      addIssue(
        issues,
        `${path}.valid_until`,
        'INVALID_VALUE',
        'Fato ongoing não pode possuir valid_until.',
      )
    }

    return
  }

  if (!validDate(validUntil)) {
    addIssue(
      issues,
      `${path}.valid_until`,
      'INVALID_VALUE',
      'Fato bounded precisa possuir valid_until válido.',
    )

    return
  }

  if (
    validDate(validFrom) &&
    Date.parse(validUntil) <=
      Date.parse(validFrom)
  ) {
    addIssue(
      issues,
      path,
      'INVALID_CHRONOLOGY',
      'valid_until precisa ser posterior a valid_from.',
    )
  }
}

function validateSource(
  value: unknown,
  issues:
    CommercialFactValidationIssue[],
) {
  const path =
    'source'

  if (!isRecord(value)) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      'source precisa ser um objeto.',
    )

    return
  }

  const type =
    value.type

  if (
    typeof type !== 'string' ||
    !COMMERCIAL_FACT_SOURCE_TYPES
      .includes(
        type as
          CommercialFactSourceType,
      )
  ) {
    addIssue(
      issues,
      `${path}.type`,
      'INVALID_VALUE',
      'O tipo de procedência do fato é inválido.',
    )
  }

  validateText(
    value.reference,
    `${path}.reference`,
    issues,
    1000,
  )

  if (
    !validDate(
      value.verified_at,
    )
  ) {
    addIssue(
      issues,
      `${path}.verified_at`,
      'INVALID_VALUE',
      'Todo fato oficial precisa declarar quando sua fonte foi verificada.',
    )
  }
}

export function validateCommercialFactDefinition(
  value: unknown,
): CommercialFactValidationResult {
  const issues:
    CommercialFactValidationIssue[] = []

  if (!isRecord(value)) {
    addIssue(
      issues,
      'fact',
      'INVALID_VALUE',
      'A definição do fato oficial precisa ser um objeto.',
    )

    return {
      valid: false,
      issues,
    }
  }

  if (
    value.contract_version !==
    COMMERCIAL_FACT_CONTRACT_VERSION
  ) {
    addIssue(
      issues,
      'contract_version',
      'INVALID_VALUE',
      `contract_version precisa ser ${COMMERCIAL_FACT_CONTRACT_VERSION}.`,
    )
  }

  if (
    value.fact_kind !==
    'official'
  ) {
    addIssue(
      issues,
      'fact_kind',
      'INVALID_VALUE',
      'Fatos deste contrato precisam possuir fact_kind=official.',
    )
  }

  validateText(
    value.category,
    'category',
    issues,
    80,
  )

  validateText(
    value.fact_key,
    'fact_key',
    issues,
    160,
  )

  validateText(
    value.fact_value,
    'fact_value',
    issues,
    4000,
  )

  validateScope(
    value.scope,
    issues,
  )

  validateTextArray(
    value.conditions,
    'conditions',
    issues,
  )

  validateTextArray(
    value.limitations,
    'limitations',
    issues,
  )

  validateValidity(
    value.validity,
    issues,
  )

  validateSource(
    value.source,
    issues,
  )

  return {
    valid:
      issues.length === 0,

    issues,
  }
}
