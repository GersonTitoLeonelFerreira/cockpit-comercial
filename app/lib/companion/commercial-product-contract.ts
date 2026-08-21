// ============================================================================
// Yolen — Inteligência Comercial
// Contrato semântico de produto simples
//
// O contrato descreve o que o produto é, para quem serve, quando faz sentido
// recomendá-lo, quais limites precisam ser respeitados e como interpretar preço.
//
// Variantes, SKU, compatibilidade, especificações e estoque pertencem à A1.3.
// ============================================================================

export const COMMERCIAL_PRODUCT_CONTRACT_VERSION =
  'commercial-product-v2' as const

export const COMMERCIAL_PRODUCT_KINDS = [
  'simple',
] as const

export const COMMERCIAL_PRODUCT_PRICING_MODELS = [
  'one_time',
  'recurring',
  'installment',
  'quote_required',
  'free',
  'unknown',
] as const

export const COMMERCIAL_PRODUCT_AMOUNT_QUALIFIERS = [
  'exact',
  'starting_at',
] as const

export const COMMERCIAL_PRODUCT_RECURRENCES = [
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
] as const

export const COMMERCIAL_PRODUCT_INSTALLMENT_AMOUNT_BASES = [
  'total',
  'per_installment',
] as const

export type CommercialProductKind =
  (typeof COMMERCIAL_PRODUCT_KINDS)[number]

export type CommercialProductPricingModel =
  (typeof COMMERCIAL_PRODUCT_PRICING_MODELS)[number]

export type CommercialProductAmountQualifier =
  (typeof COMMERCIAL_PRODUCT_AMOUNT_QUALIFIERS)[number]

export type CommercialProductRecurrence =
  (typeof COMMERCIAL_PRODUCT_RECURRENCES)[number]

export type CommercialProductInstallmentAmountBasis =
  (typeof COMMERCIAL_PRODUCT_INSTALLMENT_AMOUNT_BASES)[number]

export type CommercialProductPricing = {
  /**
   * Nunca inferir o significado comercial do valor apenas por existir
   * um número no catálogo legado.
   */
  model:
    CommercialProductPricingModel

  /**
   * Valor comercial conhecido.
   *
   * Deve permanecer null quando model for:
   * quote_required, free ou unknown.
   */
  amount: number | null

  currency: 'BRL'

  /**
   * exact = valor definido.
   * starting_at = valor mínimo / "a partir de".
   */
  amount_qualifier:
    CommercialProductAmountQualifier | null

  /**
   * Usado exclusivamente para preço recorrente.
   */
  recurrence:
    CommercialProductRecurrence | null

  /**
   * Usado exclusivamente no modelo parcelado.
   */
  installment_count: number | null

  /**
   * Explica se amount representa o total ou cada parcela.
   */
  installment_amount_basis:
    CommercialProductInstallmentAmountBasis | null

  /**
   * Informação complementar segura sobre o preço.
   */
  note: string | null
}

export type CommercialSimpleProductDefinition = {
  contract_version:
    typeof COMMERCIAL_PRODUCT_CONTRACT_VERSION

  product_kind: 'simple'

  name: string
  category: string

  /**
   * Explica comercialmente o que é o produto.
   */
  commercial_description: string

  /**
   * Para quem normalmente faz sentido.
   */
  indicated_audiences: string[]

  /**
   * Problemas ou necessidades que o produto realmente atende.
   */
  needs_addressed: string[]

  /**
   * Resultados ou ganhos que podem ser associados ao produto.
   */
  benefits: string[]

  /**
   * Diferenças comprovadas em relação às alternativas.
   */
  verified_differentiators: string[]

  /**
   * O que o produto não faz, não cobre ou não resolve.
   */
  limitations: string[]

  /**
   * Evidências ou condições que tornam a recomendação adequada.
   */
  recommend_when: string[]

  /**
   * Evidências ou condições que tornam a recomendação inadequada.
   */
  avoid_when: string[]

  pricing: CommercialProductPricing

  contract_conditions: string[]
  payment_conditions: string[]

  /**
   * Afirmações comercialmente autorizadas.
   */
  allowed_claims: string[]

  /**
   * Promessas ou afirmações explicitamente proibidas.
   */
  forbidden_claims: string[]
}

export type CommercialProductValidationIssue = {
  path: string

  code:
    | 'INVALID_VALUE'
    | 'DUPLICATE_ITEM'
    | 'CONFLICTING_RULE'
    | 'INVALID_PRICING'

  message: string
}

export type CommercialProductValidationResult = {
  valid: boolean
  issues: CommercialProductValidationIssue[]
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
  issues: CommercialProductValidationIssue[],
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

function validateTextArray({
  value,
  path,
  required = false,
  issues,
}: {
  value: unknown
  path: string
  required?: boolean
  issues: CommercialProductValidationIssue[]
}): string[] {
  if (!Array.isArray(value)) {
    addIssue(
      issues,
      path,
      'INVALID_VALUE',
      `${path} precisa ser uma lista de textos.`,
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

  const normalizedItems: string[] = []
  const identities =
    new Set<string>()

  value.forEach((item, index) => {
    if (!hasText(item)) {
      addIssue(
        issues,
        `${path}[${index}]`,
        'INVALID_VALUE',
        `${path}[${index}] precisa possuir texto válido.`,
      )

      return
    }

    const normalized =
      item.trim()

    const identity =
      comparableText(normalized)

    if (identities.has(identity)) {
      addIssue(
        issues,
        `${path}[${index}]`,
        'DUPLICATE_ITEM',
        `${path} não pode possuir itens duplicados.`,
      )

      return
    }

    identities.add(identity)
    normalizedItems.push(normalized)
  })

  return normalizedItems
}

function validateNoOverlap({
  left,
  right,
  leftPath,
  rightPath,
  message,
  issues,
}: {
  left: string[]
  right: string[]
  leftPath: string
  rightPath: string
  message: string
  issues: CommercialProductValidationIssue[]
}) {
  const rightItems =
    new Set(
      right.map(
        comparableText,
      ),
    )

  left.forEach((item) => {
    if (
      rightItems.has(
        comparableText(item),
      )
    ) {
      addIssue(
        issues,
        `${leftPath}::${rightPath}`,
        'CONFLICTING_RULE',
        message,
      )
    }
  })
}

export function validateCommercialProductPricing(
  value: unknown,
  issues: CommercialProductValidationIssue[],
) {
  const path = 'pricing'

  if (!isRecord(value)) {
    addIssue(
      issues,
      path,
      'INVALID_PRICING',
      'pricing precisa ser um objeto.',
    )

    return
  }

  const model =
    value.model

  if (
    typeof model !== 'string' ||
    !COMMERCIAL_PRODUCT_PRICING_MODELS.includes(
      model as CommercialProductPricingModel,
    )
  ) {
    addIssue(
      issues,
      `${path}.model`,
      'INVALID_PRICING',
      'O modelo comercial de preço é inválido.',
    )

    return
  }

  if (value.currency !== 'BRL') {
    addIssue(
      issues,
      `${path}.currency`,
      'INVALID_PRICING',
      'A moeda do contrato de produto precisa ser BRL.',
    )
  }

  if (
    value.note !== null &&
    value.note !== undefined &&
    !hasText(value.note)
  ) {
    addIssue(
      issues,
      `${path}.note`,
      'INVALID_PRICING',
      'A observação de preço precisa possuir texto válido ou ser null.',
    )
  }

  const requireNull = (
    field:
      | 'amount'
      | 'amount_qualifier'
      | 'recurrence'
      | 'installment_count'
      | 'installment_amount_basis',
  ) => {
    if (value[field] !== null) {
      addIssue(
        issues,
        `${path}.${field}`,
        'INVALID_PRICING',
        `${path}.${field} precisa ser null para o modelo ${model}.`,
      )
    }
  }

  const validateAmount = () => {
    if (
      typeof value.amount !== 'number' ||
      !Number.isFinite(value.amount) ||
      value.amount <= 0
    ) {
      addIssue(
        issues,
        `${path}.amount`,
        'INVALID_PRICING',
        'O valor precisa ser um número positivo.',
      )
    }

    if (
      typeof value.amount_qualifier !==
        'string' ||
      !COMMERCIAL_PRODUCT_AMOUNT_QUALIFIERS
        .includes(
          value.amount_qualifier as
            CommercialProductAmountQualifier,
        )
    ) {
      addIssue(
        issues,
        `${path}.amount_qualifier`,
        'INVALID_PRICING',
        'Informe se o valor é exato ou "a partir de".',
      )
    }
  }

  if (
    model === 'unknown' ||
    model === 'quote_required' ||
    model === 'free'
  ) {
    requireNull('amount')
    requireNull('amount_qualifier')
    requireNull('recurrence')
    requireNull('installment_count')
    requireNull(
      'installment_amount_basis',
    )

    return
  }

  validateAmount()

  if (model === 'one_time') {
    requireNull('recurrence')
    requireNull('installment_count')
    requireNull(
      'installment_amount_basis',
    )

    return
  }

  if (model === 'recurring') {
    if (
      typeof value.recurrence !==
        'string' ||
      !COMMERCIAL_PRODUCT_RECURRENCES
        .includes(
          value.recurrence as
            CommercialProductRecurrence,
        )
    ) {
      addIssue(
        issues,
        `${path}.recurrence`,
        'INVALID_PRICING',
        'Preço recorrente precisa declarar a periodicidade.',
      )
    }

    requireNull('installment_count')
    requireNull(
      'installment_amount_basis',
    )

    return
  }

  if (model === 'installment') {
    requireNull('recurrence')

    if (
      !Number.isSafeInteger(
        value.installment_count,
      ) ||
      Number(value.installment_count) < 2
    ) {
      addIssue(
        issues,
        `${path}.installment_count`,
        'INVALID_PRICING',
        'Preço parcelado precisa declarar pelo menos duas parcelas.',
      )
    }

    if (
      typeof value
        .installment_amount_basis !==
        'string' ||
      !COMMERCIAL_PRODUCT_INSTALLMENT_AMOUNT_BASES
        .includes(
          value
            .installment_amount_basis as
              CommercialProductInstallmentAmountBasis,
        )
    ) {
      addIssue(
        issues,
        `${path}.installment_amount_basis`,
        'INVALID_PRICING',
        'Informe se o valor representa o total ou cada parcela.',
      )
    }
  }
}

export function validateCommercialProductDefinition(
  value: unknown,
): CommercialProductValidationResult {
  const issues:
    CommercialProductValidationIssue[] = []

  if (!isRecord(value)) {
    addIssue(
      issues,
      '$',
      'INVALID_VALUE',
      'A definição do produto precisa ser um objeto.',
    )

    return {
      valid: false,
      issues,
    }
  }

  if (
    value.contract_version !==
    COMMERCIAL_PRODUCT_CONTRACT_VERSION
  ) {
    addIssue(
      issues,
      'contract_version',
      'INVALID_VALUE',
      'A versão do contrato comercial do produto é incompatível.',
    )
  }

  if (value.product_kind !== 'simple') {
    addIssue(
      issues,
      'product_kind',
      'INVALID_VALUE',
      'A1.2 aceita exclusivamente produtos simples.',
    )
  }

  if (!hasText(value.name)) {
    addIssue(
      issues,
      'name',
      'INVALID_VALUE',
      'O produto precisa possuir um nome.',
    )
  }

  if (!hasText(value.category)) {
    addIssue(
      issues,
      'category',
      'INVALID_VALUE',
      'O produto precisa possuir uma categoria.',
    )
  }

  if (
    !hasText(
      value.commercial_description,
    )
  ) {
    addIssue(
      issues,
      'commercial_description',
      'INVALID_VALUE',
      'O produto precisa explicar comercialmente o que ele é.',
    )
  }

  const indicatedAudiences =
    validateTextArray({
      value:
        value.indicated_audiences,
      path:
        'indicated_audiences',
      required: true,
      issues,
    })

  const needsAddressed =
    validateTextArray({
      value:
        value.needs_addressed,
      path:
        'needs_addressed',
      required: true,
      issues,
    })

  const benefits =
    validateTextArray({
      value:
        value.benefits,
      path:
        'benefits',
      required: true,
      issues,
    })

  validateTextArray({
    value:
      value.verified_differentiators,
    path:
      'verified_differentiators',
    issues,
  })

  validateTextArray({
    value:
      value.limitations,
    path:
      'limitations',
    issues,
  })

  const recommendWhen =
    validateTextArray({
      value:
        value.recommend_when,
      path:
        'recommend_when',
      required: true,
      issues,
    })

  const avoidWhen =
    validateTextArray({
      value:
        value.avoid_when,
      path:
        'avoid_when',
      issues,
    })

  validateCommercialProductPricing(
    value.pricing,
    issues,
  )

  validateTextArray({
    value:
      value.contract_conditions,
    path:
      'contract_conditions',
    issues,
  })

  validateTextArray({
    value:
      value.payment_conditions,
    path:
      'payment_conditions',
    issues,
  })

  const allowedClaims =
    validateTextArray({
      value:
        value.allowed_claims,
      path:
        'allowed_claims',
      issues,
    })

  const forbiddenClaims =
    validateTextArray({
      value:
        value.forbidden_claims,
      path:
        'forbidden_claims',
      issues,
    })

  validateNoOverlap({
    left:
      recommendWhen,
    right:
      avoidWhen,
    leftPath:
      'recommend_when',
    rightPath:
      'avoid_when',
    message:
      'A mesma condição não pode recomendar e contraindicar o produto.',
    issues,
  })

  validateNoOverlap({
    left:
      allowedClaims,
    right:
      forbiddenClaims,
    leftPath:
      'allowed_claims',
    rightPath:
      'forbidden_claims',
    message:
      'A mesma afirmação não pode ser simultaneamente permitida e proibida.',
    issues,
  })

  // Mantemos essas variáveis explicitamente validadas porque fazem parte
  // dos requisitos mínimos de inteligência de um produto simples.
  void indicatedAudiences
  void needsAddressed
  void benefits

  return {
    valid:
      issues.length === 0,
    issues,
  }
}
