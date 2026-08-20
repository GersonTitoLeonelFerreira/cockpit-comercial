// ============================================================================
// Yolen — Inteligência Comercial
// Contrato semântico de produto complexo
//
// Variantes possuem identidade, aplicabilidade, compatibilidade,
// especificações, disponibilidade temporal e preço próprio.
// ============================================================================

import {
  COMMERCIAL_PRODUCT_CONTRACT_VERSION,
  type CommercialProductPricing,
  type CommercialProductValidationIssue,
  validateCommercialProductDefinition,
  validateCommercialProductPricing,
} from './commercial-product-contract'

export const COMMERCIAL_COMPLEX_PRODUCT_CONTRACT_VERSION =
  'commercial-product-v3' as const

export const COMMERCIAL_COMPLEX_PRODUCT_STOCK_STATUSES = [
  'available',
  'limited',
  'out_of_stock',
  'backorder',
  'discontinued',
  'not_tracked',
  'unknown',
] as const

export type CommercialComplexProductStockStatus =
  (typeof COMMERCIAL_COMPLEX_PRODUCT_STOCK_STATUSES)[number]

export type CommercialProductSpecification = {
  key: string
  label: string
  value: string
  unit: string | null
}

export type CommercialProductCompatibility = {
  compatible_with: string[]
  incompatible_with: string[]
  notes: string[]
}

export type CommercialProductStock = {
  status:
    CommercialComplexProductStockStatus

  quantity:
    number | null

  checked_at:
    string | null

  valid_until:
    string | null

  note:
    string | null
}

export type CommercialProductVariantDefinition = {
  key: string
  name: string

  sku: string | null
  model: string | null
  version: string | null

  commercial_description:
    string

  compatibility:
    CommercialProductCompatibility

  applications:
    string[]

  specifications:
    CommercialProductSpecification[]

  limitations:
    string[]

  recommend_when:
    string[]

  avoid_when:
    string[]

  pricing:
    CommercialProductPricing

  stock:
    CommercialProductStock

  allowed_claims:
    string[]

  forbidden_claims:
    string[]
}

export type CommercialComplexProductDefinition = {
  contract_version:
    typeof COMMERCIAL_COMPLEX_PRODUCT_CONTRACT_VERSION

  product_kind:
    'complex'

  name: string
  category: string

  commercial_description:
    string

  indicated_audiences:
    string[]

  needs_addressed:
    string[]

  benefits:
    string[]

  verified_differentiators:
    string[]

  limitations:
    string[]

  recommend_when:
    string[]

  avoid_when:
    string[]

  contract_conditions:
    string[]

  payment_conditions:
    string[]

  allowed_claims:
    string[]

  forbidden_claims:
    string[]

  variants:
    CommercialProductVariantDefinition[]
}

export type CommercialComplexProductValidationResult = {
  valid: boolean

  issues:
    CommercialProductValidationIssue[]
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

function hasText(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    Boolean(value.trim())
  )
}

function comparableText(
  value: string,
): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
}

function addIssue(
  issues:
    CommercialProductValidationIssue[],
  path: string,
  code:
    CommercialProductValidationIssue['code'],
  message: string,
) {
  issues.push({
    path,
    code,
    message,
  })
}

function validateNullableText(
  value: unknown,
  path: string,
  issues:
    CommercialProductValidationIssue[],
): string | null {
  if (value === null) {
    return null
  }

  if (!hasText(value)) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      `${path} precisa possuir texto válido ou ser null.`,
    )

    return null
  }

  return value.trim()
}

function validateTextArray(
  value: unknown,
  path: string,
  issues:
    CommercialProductValidationIssue[],
  required = false,
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

  if (
    required &&
    value.length === 0
  ) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      `${path} precisa possuir ao menos um item.`,
    )
  }

  const result: string[] = []
  const identities =
    new Set<string>()

  value.forEach(
    (item, index) => {
      if (!hasText(item)) {
        addIssue(
          issues,
          `${path}[${index}]`,
          'INVALID_VALUE',
          'O item precisa possuir texto válido.',
        )

        return
      }

      const normalized =
        item.trim()

      const identity =
        comparableText(
          normalized,
        )

      if (
        identities.has(
          identity,
        )
      ) {
        addIssue(
          issues,
          `${path}[${index}]`,
          'DUPLICATE_ITEM',
          `${path} não pode possuir itens duplicados.`,
        )

        return
      }

      identities.add(
        identity,
      )

      result.push(
        normalized,
      )
    },
  )

  return result
}

function validateNoOverlap(
  left: string[],
  right: string[],
  path: string,
  issues:
    CommercialProductValidationIssue[],
  message: string,
) {
  const rightSet =
    new Set(
      right.map(
        comparableText,
      ),
    )

  for (const item of left) {
    if (
      rightSet.has(
        comparableText(item),
      )
    ) {
      addIssue(
        issues,
        path,
        'CONFLICTING_RULE',
        message,
      )
    }
  }
}

function validateSpecifications(
  value: unknown,
  path: string,
  issues:
    CommercialProductValidationIssue[],
): number {
  if (!Array.isArray(value)) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      `${path} precisa ser uma lista.`,
    )

    return 0
  }

  const keys =
    new Set<string>()

  value.forEach(
    (item, index) => {
      const itemPath =
        `${path}[${index}]`

      if (!isRecord(item)) {
        addIssue(
          issues,
          itemPath,
          'INVALID_VALUE',
          'A especificação precisa ser um objeto.',
        )

        return
      }

      if (!hasText(item.key)) {
        addIssue(
          issues,
          `${itemPath}.key`,
          'INVALID_VALUE',
          'A especificação precisa possuir key.',
        )
      } else {
        const key =
          comparableText(
            item.key,
          )

        if (keys.has(key)) {
          addIssue(
            issues,
            `${itemPath}.key`,
            'DUPLICATE_ITEM',
            'A variante não pode repetir a mesma especificação.',
          )
        }

        keys.add(key)
      }

      if (!hasText(item.label)) {
        addIssue(
          issues,
          `${itemPath}.label`,
          'INVALID_VALUE',
          'A especificação precisa possuir label.',
        )
      }

      if (!hasText(item.value)) {
        addIssue(
          issues,
          `${itemPath}.value`,
          'INVALID_VALUE',
          'A especificação precisa possuir value.',
        )
      }

      validateNullableText(
        item.unit,
        `${itemPath}.unit`,
        issues,
      )
    },
  )

  return value.length
}

function validateCompatibility(
  value: unknown,
  path: string,
  issues:
    CommercialProductValidationIssue[],
) {
  if (!isRecord(value)) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      `${path} precisa ser um objeto.`,
    )

    return {
      compatible:
        [] as string[],
      incompatible:
        [] as string[],
    }
  }

  const compatible =
    validateTextArray(
      value.compatible_with,
      `${path}.compatible_with`,
      issues,
    )

  const incompatible =
    validateTextArray(
      value.incompatible_with,
      `${path}.incompatible_with`,
      issues,
    )

  validateTextArray(
    value.notes,
    `${path}.notes`,
    issues,
  )

  validateNoOverlap(
    compatible,
    incompatible,
    path,
    issues,
    'O mesmo item não pode ser compatível e incompatível com a variante.',
  )

  return {
    compatible,
    incompatible,
  }
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

function validateStock(
  value: unknown,
  path: string,
  issues:
    CommercialProductValidationIssue[],
) {
  if (!isRecord(value)) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      `${path} precisa ser um objeto.`,
    )

    return
  }

  const status =
    value.status

  if (
    typeof status !== 'string' ||
    !COMMERCIAL_COMPLEX_PRODUCT_STOCK_STATUSES
      .includes(
        status as
          CommercialComplexProductStockStatus,
      )
  ) {
    addIssue(
      issues,
      `${path}.status`,
      'INVALID_VALUE',
      'O status de estoque é inválido.',
    )

    return
  }

  validateNullableText(
    value.note,
    `${path}.note`,
    issues,
  )

  const quantity =
    value.quantity

  if (
    quantity !== null &&
    (
      !Number.isSafeInteger(
        quantity,
      ) ||
      Number(quantity) < 0
    )
  ) {
    addIssue(
      issues,
      `${path}.quantity`,
      'INVALID_VALUE',
      'A quantidade precisa ser um inteiro não negativo ou null.',
    )
  }

  if (
    status === 'unknown' ||
    status === 'not_tracked'
  ) {
    for (
      const field of [
        'quantity',
        'checked_at',
        'valid_until',
      ] as const
    ) {
      if (
        value[field] !== null
      ) {
        addIssue(
          issues,
          `${path}.${field}`,
          'INVALID_VALUE',
          `${path}.${field} precisa ser null quando o estoque é ${status}.`,
        )
      }
    }

    return
  }

  if (!validDate(
    value.checked_at,
  )) {
    addIssue(
      issues,
      `${path}.checked_at`,
      'INVALID_VALUE',
      'Disponibilidade conhecida precisa informar quando o estoque foi verificado.',
    )
  }

  const transientStatuses =
    new Set([
      'available',
      'limited',
      'out_of_stock',
      'backorder',
    ])

  if (
    transientStatuses.has(
      status,
    )
  ) {
    if (!validDate(
      value.valid_until,
    )) {
      addIssue(
        issues,
        `${path}.valid_until`,
        'INVALID_VALUE',
        'Disponibilidade temporária precisa declarar até quando a informação é válida.',
      )
    } else if (
      validDate(
        value.checked_at,
      ) &&
      Date.parse(
        value.valid_until,
      ) <=
        Date.parse(
          value.checked_at,
        )
    ) {
      addIssue(
        issues,
        `${path}.valid_until`,
        'INVALID_VALUE',
        'valid_until precisa ser posterior a checked_at.',
      )
    }
  }

  if (
    status ===
      'discontinued' &&
    value.valid_until !== null
  ) {
    addIssue(
      issues,
      `${path}.valid_until`,
      'INVALID_VALUE',
      'Produto descontinuado não precisa de validade temporária.',
    )
  }

  if (
    (
      status ===
        'out_of_stock' ||
      status ===
        'discontinued'
    ) &&
    typeof quantity ===
      'number' &&
    quantity !== 0
  ) {
    addIssue(
      issues,
      `${path}.quantity`,
      'INVALID_VALUE',
      `Quantidade de estoque precisa ser zero para status ${status}.`,
    )
  }

  if (
    (
      status ===
        'available' ||
      status ===
        'limited'
    ) &&
    typeof quantity ===
      'number' &&
    quantity === 0
  ) {
    addIssue(
      issues,
      `${path}.quantity`,
      'INVALID_VALUE',
      `Quantidade zero contradiz status ${status}.`,
    )
  }
}

function validatePricing(
  value: unknown,
  path: string,
  issues:
    CommercialProductValidationIssue[],
) {
  const pricingIssues:
    CommercialProductValidationIssue[] = []

  validateCommercialProductPricing(
    value,
    pricingIssues,
  )

  for (
    const issue of
    pricingIssues
  ) {
    addIssue(
      issues,
      `${path}.${issue.path}`,
      issue.code,
      issue.message,
    )
  }
}

function validateVariant(
  value: unknown,
  index: number,
  issues:
    CommercialProductValidationIssue[],
): {
  key: string | null
  sku: string | null
} {
  const path =
    `variants[${index}]`

  if (!isRecord(value)) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      'A variante precisa ser um objeto.',
    )

    return {
      key: null,
      sku: null,
    }
  }

  let key:
    string | null = null

  if (!hasText(value.key)) {
    addIssue(
      issues,
      `${path}.key`,
      'INVALID_VALUE',
      'A variante precisa possuir uma chave estável.',
    )
  } else {
    key =
      value.key.trim()
  }

  if (!hasText(value.name)) {
    addIssue(
      issues,
      `${path}.name`,
      'INVALID_VALUE',
      'A variante precisa possuir nome.',
    )
  }

  if (
    !hasText(
      value.commercial_description,
    )
  ) {
    addIssue(
      issues,
      `${path}.commercial_description`,
      'INVALID_VALUE',
      'A variante precisa possuir descrição comercial.',
    )
  }

  const sku =
    validateNullableText(
      value.sku,
      `${path}.sku`,
      issues,
    )

  const model =
    validateNullableText(
      value.model,
      `${path}.model`,
      issues,
    )

  const version =
    validateNullableText(
      value.version,
      `${path}.version`,
      issues,
    )

  const applications =
    validateTextArray(
      value.applications,
      `${path}.applications`,
      issues,
    )

  const specificationCount =
    validateSpecifications(
      value.specifications,
      `${path}.specifications`,
      issues,
    )

  const compatibility =
    validateCompatibility(
      value.compatibility,
      `${path}.compatibility`,
      issues,
    )

  const limitations =
    validateTextArray(
      value.limitations,
      `${path}.limitations`,
      issues,
    )

  const recommendWhen =
    validateTextArray(
      value.recommend_when,
      `${path}.recommend_when`,
      issues,
      true,
    )

  const avoidWhen =
    validateTextArray(
      value.avoid_when,
      `${path}.avoid_when`,
      issues,
    )

  const allowedClaims =
    validateTextArray(
      value.allowed_claims,
      `${path}.allowed_claims`,
      issues,
    )

  const forbiddenClaims =
    validateTextArray(
      value.forbidden_claims,
      `${path}.forbidden_claims`,
      issues,
    )

  validateNoOverlap(
    recommendWhen,
    avoidWhen,
    `${path}.recommend_when::avoid_when`,
    issues,
    'A mesma condição não pode recomendar e contraindicar a variante.',
  )

  validateNoOverlap(
    allowedClaims,
    forbiddenClaims,
    `${path}.allowed_claims::forbidden_claims`,
    issues,
    'A mesma afirmação não pode ser permitida e proibida na variante.',
  )

  validatePricing(
    value.pricing,
    `${path}`,
    issues,
  )

  validateStock(
    value.stock,
    `${path}.stock`,
    issues,
  )

  const hasVariantIdentity =
    Boolean(
      sku ||
      model ||
      version ||
      applications.length > 0 ||
      specificationCount > 0 ||
      compatibility
        .compatible
        .length > 0 ||
      compatibility
        .incompatible
        .length > 0,
    )

  if (!hasVariantIdentity) {
    addIssue(
      issues,
      `${path}.selection`,
      'INVALID_VALUE',
      'Produto complexo precisa declarar ao menos uma característica que diferencie a variante.',
    )
  }

  void limitations

  return {
    key,
    sku,
  }
}

function validateCommonSemanticFields(
  value: JsonRecord,
  issues:
    CommercialProductValidationIssue[],
) {
  const commonValidation =
    validateCommercialProductDefinition({
      contract_version:
        COMMERCIAL_PRODUCT_CONTRACT_VERSION,

      product_kind:
        'simple',

      name:
        value.name,

      category:
        value.category,

      commercial_description:
        value.commercial_description,

      indicated_audiences:
        value.indicated_audiences,

      needs_addressed:
        value.needs_addressed,

      benefits:
        value.benefits,

      verified_differentiators:
        value.verified_differentiators,

      limitations:
        value.limitations,

      recommend_when:
        value.recommend_when,

      avoid_when:
        value.avoid_when,

      pricing: {
        model:
          'unknown',

        amount:
          null,

        currency:
          'BRL',

        amount_qualifier:
          null,

        recurrence:
          null,

        installment_count:
          null,

        installment_amount_basis:
          null,

        note:
          null,
      },

      contract_conditions:
        value.contract_conditions,

      payment_conditions:
        value.payment_conditions,

      allowed_claims:
        value.allowed_claims,

      forbidden_claims:
        value.forbidden_claims,
    })

  issues.push(
    ...commonValidation
      .issues,
  )
}

export function validateCommercialComplexProductDefinition(
  value: unknown,
): CommercialComplexProductValidationResult {
  const issues:
    CommercialProductValidationIssue[] = []

  if (!isRecord(value)) {
    addIssue(
      issues,
      '$',
      'INVALID_VALUE',
      'A definição do produto complexo precisa ser um objeto.',
    )

    return {
      valid: false,
      issues,
    }
  }

  if (
    value.contract_version !==
    COMMERCIAL_COMPLEX_PRODUCT_CONTRACT_VERSION
  ) {
    addIssue(
      issues,
      'contract_version',
      'INVALID_VALUE',
      'A versão do contrato de produto complexo é incompatível.',
    )
  }

  if (
    value.product_kind !==
    'complex'
  ) {
    addIssue(
      issues,
      'product_kind',
      'INVALID_VALUE',
      'A1.3 aceita product_kind=complex.',
    )
  }

  validateCommonSemanticFields(
    value,
    issues,
  )

  if (!Array.isArray(
    value.variants,
  )) {
    addIssue(
      issues,
      'variants',
      'INVALID_VALUE',
      'Produto complexo precisa possuir uma lista de variantes.',
    )

    return {
      valid:
        false,
      issues,
    }
  }

  if (
    value.variants.length === 0
  ) {
    addIssue(
      issues,
      'variants',
      'INVALID_VALUE',
      'Produto complexo precisa possuir ao menos uma variante.',
    )
  }

  const keys =
    new Set<string>()

  const skus =
    new Set<string>()

  value.variants.forEach(
    (variant, index) => {
      const identity =
        validateVariant(
          variant,
          index,
          issues,
        )

      if (identity.key) {
        const normalizedKey =
          comparableText(
            identity.key,
          )

        if (
          keys.has(
            normalizedKey,
          )
        ) {
          addIssue(
            issues,
            `variants[${index}].key`,
            'DUPLICATE_ITEM',
            'As variantes precisam possuir chaves únicas.',
          )
        }

        keys.add(
          normalizedKey,
        )
      }

      if (identity.sku) {
        const normalizedSku =
          comparableText(
            identity.sku,
          )

        if (
          skus.has(
            normalizedSku,
          )
        ) {
          addIssue(
            issues,
            `variants[${index}].sku`,
            'DUPLICATE_ITEM',
            'O SKU precisa ser único dentro do produto.',
          )
        }

        skus.add(
          normalizedSku,
        )
      }
    },
  )

  return {
    valid:
      issues.length === 0,

    issues,
  }
}
