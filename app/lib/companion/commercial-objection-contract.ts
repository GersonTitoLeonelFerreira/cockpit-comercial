// ============================================================================
// Yolen — Inteligência Comercial
// Contrato semântico de objeções comerciais
//
// Objeção não é sinônimo de pergunta, dúvida, condição, adiamento ou recusa.
// A IA precisa identificar resistência comercial sustentada por evidência antes
// de tratá-la como objeção.
// ============================================================================

export const COMMERCIAL_OBJECTION_CONTRACT_VERSION =
  'commercial-objection-v2' as const

export const COMMERCIAL_OBJECTION_CATEGORIES = [
  'price',
  'budget',
  'payment',
  'timing',
  'authority',
  'trust',
  'competition',
  'fit',
  'implementation',
  'risk',
  'contract',
  'availability',
  'other',
] as const

export const COMMERCIAL_OBJECTION_SCOPE_TYPES = [
  'company',
  'product',
  'product_variant',
] as const

export const COMMERCIAL_OBJECTION_NEIGHBORING_STATES = [
  'question',
  'information_request',
  'condition',
  'postponement',
  'rejection',
  'uncertainty',
] as const

export type CommercialObjectionCategory =
  (typeof COMMERCIAL_OBJECTION_CATEGORIES)[number]

export type CommercialObjectionScopeType =
  (typeof COMMERCIAL_OBJECTION_SCOPE_TYPES)[number]

export type CommercialObjectionNeighboringState =
  (typeof COMMERCIAL_OBJECTION_NEIGHBORING_STATES)[number]

export type CommercialObjectionScope = {
  type:
    CommercialObjectionScopeType

  product_id:
    string | null

  variant_key:
    string | null
}

export type CommercialObjectionDefinition = {
  contract_version:
    typeof COMMERCIAL_OBJECTION_CONTRACT_VERSION

  objection_kind:
    'commercial_objection'

  objection_key:
    string

  objection:
    string

  category:
    CommercialObjectionCategory

  description:
    string

  scope:
    CommercialObjectionScope

  signals:
    string[]

  objection_when:
    string[]

  not_objection_when:
    string[]

  distinguish_from:
    CommercialObjectionNeighboringState[]

  discovery_questions:
    string[]

  recommended_approach:
    string

  response_limits:
    string[]

  resolution_criteria:
    string[]

  wait_when:
    string[]

  give_space_when:
    string[]

  stop_when:
    string[]
}

export type CommercialObjectionValidationIssue = {
  path: string

  code:
    | 'INVALID_VALUE'
    | 'DUPLICATE_ITEM'
    | 'SCOPE_CONFLICT'
    | 'CONTRADICTORY_RULE'

  message: string
}

export type CommercialObjectionValidationResult = {
  valid: boolean

  issues:
    CommercialObjectionValidationIssue[]
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
    CommercialObjectionValidationIssue[],
  path: string,
  code:
    CommercialObjectionValidationIssue['code'],
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

function normalizeComparableText(
  value: string,
): string {
  return value
    .trim()
    .toLocaleLowerCase(
      'pt-BR',
    )
}

function validateText(
  value: unknown,
  path: string,
  issues:
    CommercialObjectionValidationIssue[],
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

function validateSemanticKey(
  value: unknown,
  path: string,
  issues:
    CommercialObjectionValidationIssue[],
): string | null {
  const normalized =
    validateText(
      value,
      path,
      issues,
      160,
    )

  if (normalized === null) {
    return null
  }

  if (
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/
      .test(
        normalized,
      )
  ) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      `${path} precisa ser uma chave semântica estável em minúsculas.`,
    )
  }

  return normalized
}

function validateTextArray(
  value: unknown,
  path: string,
  issues:
    CommercialObjectionValidationIssue[],
  {
    minItems = 0,
    maxLength = 2000,
  }: {
    minItems?: number
    maxLength?: number
  } = {},
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
    (
      item,
      index,
    ) => {
      const itemPath =
        `${path}[${index}]`

      const text =
        validateText(
          item,
          itemPath,
          issues,
          maxLength,
        )

      if (text === null) {
        return
      }

      const comparable =
        normalizeComparableText(
          text,
        )

      if (
        seen.has(
          comparable,
        )
      ) {
        addIssue(
          issues,
          itemPath,
          'DUPLICATE_ITEM',
          `${path} não pode repetir o mesmo item.`,
        )

        return
      }

      seen.add(
        comparable,
      )

      normalized.push(
        text,
      )
    },
  )

  if (
    normalized.length <
    minItems
  ) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      `${path} precisa possuir pelo menos ${minItems} item(ns).`,
    )
  }

  return normalized
}

function validateNeighboringStates(
  value: unknown,
  issues:
    CommercialObjectionValidationIssue[],
): CommercialObjectionNeighboringState[] {
  const path =
    'distinguish_from'

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
    CommercialObjectionNeighboringState[] =
      []

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const item =
      value[index]

    if (
      typeof item !== 'string' ||
      !COMMERCIAL_OBJECTION_NEIGHBORING_STATES
        .includes(
          item as
            CommercialObjectionNeighboringState,
        )
    ) {
      addIssue(
        issues,
        `${path}[${index}]`,
        'INVALID_VALUE',
        'O estado comercial vizinho informado é inválido.',
      )

      continue
    }

    const typedItem =
      item as
        CommercialObjectionNeighboringState

    if (
      normalized.includes(
        typedItem,
      )
    ) {
      addIssue(
        issues,
        `${path}[${index}]`,
        'DUPLICATE_ITEM',
        `${path} não pode repetir o mesmo estado.`,
      )

      continue
    }

    normalized.push(
      typedItem,
    )
  }

  if (
    normalized.length === 0
  ) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      'Toda objeção precisa declarar pelo menos um estado com o qual não deve ser confundida.',
    )
  }

  return normalized
}

function validateScope(
  value: unknown,
  issues:
    CommercialObjectionValidationIssue[],
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
    !COMMERCIAL_OBJECTION_SCOPE_TYPES
      .includes(
        type as
          CommercialObjectionScopeType,
      )
  ) {
    addIssue(
      issues,
      `${path}.type`,
      'INVALID_VALUE',
      'O tipo de escopo da objeção é inválido.',
    )

    return
  }

  const productId =
    value.product_id

  const variantKey =
    value.variant_key

  const normalizedProductId =
    productId === null
      ? null
      : validateText(
          productId,
          `${path}.product_id`,
          issues,
          200,
        )

  const normalizedVariantKey =
    variantKey === null
      ? null
      : validateText(
          variantKey,
          `${path}.variant_key`,
          issues,
          200,
        )

  if (
    type ===
    'company'
  ) {
    if (
      normalizedProductId !== null ||
      normalizedVariantKey !== null
    ) {
      addIssue(
        issues,
        path,
        'SCOPE_CONFLICT',
        'Objeção de empresa não pode apontar para produto ou variante específica.',
      )
    }

    return
  }

  if (
    type ===
    'product'
  ) {
    if (
      normalizedProductId === null ||
      normalizedVariantKey !== null
    ) {
      addIssue(
        issues,
        path,
        'SCOPE_CONFLICT',
        'Objeção de produto exige product_id e não pode declarar variant_key.',
      )
    }

    return
  }

  if (
    normalizedProductId === null ||
    normalizedVariantKey === null
  ) {
    addIssue(
      issues,
      path,
      'SCOPE_CONFLICT',
      'Objeção de variante exige product_id e variant_key.',
    )
  }
}

function validateContradictoryRules(
  objectionWhen: string[],
  notObjectionWhen: string[],
  issues:
    CommercialObjectionValidationIssue[],
) {
  const positives =
    new Set(
      objectionWhen.map(
        normalizeComparableText,
      ),
    )

  notObjectionWhen
    .forEach(
      (
        rule,
        index,
      ) => {
        if (
          positives.has(
            normalizeComparableText(
              rule,
            ),
          )
        ) {
          addIssue(
            issues,
            `not_objection_when[${index}]`,
            'CONTRADICTORY_RULE',
            'A mesma regra não pode simultaneamente caracterizar e descaracterizar uma objeção.',
          )
        }
      },
    )
}

export function validateCommercialObjectionDefinition(
  value: unknown,
): CommercialObjectionValidationResult {
  const issues:
    CommercialObjectionValidationIssue[] =
      []

  if (!isRecord(value)) {
    addIssue(
      issues,
      'objection',
      'INVALID_VALUE',
      'A definição da objeção comercial precisa ser um objeto.',
    )

    return {
      valid: false,
      issues,
    }
  }

  if (
    value.contract_version !==
    COMMERCIAL_OBJECTION_CONTRACT_VERSION
  ) {
    addIssue(
      issues,
      'contract_version',
      'INVALID_VALUE',
      `contract_version precisa ser ${COMMERCIAL_OBJECTION_CONTRACT_VERSION}.`,
    )
  }

  if (
    value.objection_kind !==
    'commercial_objection'
  ) {
    addIssue(
      issues,
      'objection_kind',
      'INVALID_VALUE',
      'O contrato aceita somente objection_kind=commercial_objection.',
    )
  }

  validateSemanticKey(
    value.objection_key,
    'objection_key',
    issues,
  )

  validateText(
    value.objection,
    'objection',
    issues,
    500,
  )

  const category =
    value.category

  if (
    typeof category !== 'string' ||
    !COMMERCIAL_OBJECTION_CATEGORIES
      .includes(
        category as
          CommercialObjectionCategory,
      )
  ) {
    addIssue(
      issues,
      'category',
      'INVALID_VALUE',
      'A categoria da objeção é inválida.',
    )
  }

  validateText(
    value.description,
    'description',
    issues,
    2000,
  )

  validateScope(
    value.scope,
    issues,
  )

  validateTextArray(
    value.signals,
    'signals',
    issues,
    {
      minItems: 1,
    },
  )

  const objectionWhen =
    validateTextArray(
      value.objection_when,
      'objection_when',
      issues,
      {
        minItems: 1,
      },
    )

  const notObjectionWhen =
    validateTextArray(
      value.not_objection_when,
      'not_objection_when',
      issues,
      {
        minItems: 1,
      },
    )

  validateNeighboringStates(
    value.distinguish_from,
    issues,
  )

  validateTextArray(
    value.discovery_questions,
    'discovery_questions',
    issues,
  )

  validateText(
    value.recommended_approach,
    'recommended_approach',
    issues,
    4000,
  )

  validateTextArray(
    value.response_limits,
    'response_limits',
    issues,
    {
      minItems: 1,
    },
  )

  validateTextArray(
    value.resolution_criteria,
    'resolution_criteria',
    issues,
    {
      minItems: 1,
    },
  )

  validateTextArray(
    value.wait_when,
    'wait_when',
    issues,
  )

  validateTextArray(
    value.give_space_when,
    'give_space_when',
    issues,
  )

  validateTextArray(
    value.stop_when,
    'stop_when',
    issues,
  )

  validateContradictoryRules(
    objectionWhen,
    notObjectionWhen,
    issues,
  )

  return {
    valid:
      issues.length === 0,

    issues,
  }
}
