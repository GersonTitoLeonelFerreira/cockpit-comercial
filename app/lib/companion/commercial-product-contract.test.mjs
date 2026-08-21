import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_PRODUCT_CONTRACT_VERSION,
  validateCommercialProductDefinition,
} from './commercial-product-contract.ts'

function buildProduct() {
  return {
    contract_version:
      COMMERCIAL_PRODUCT_CONTRACT_VERSION,

    product_kind:
      'simple',

    name:
      'Plano Open',

    category:
      'Plano de academia',

    commercial_description:
      'Plano recorrente para acesso à estrutura e serviços configurados da academia.',

    indicated_audiences: [
      'Adultos que buscam atividade física recorrente.',
    ],

    needs_addressed: [
      'Ter acesso recorrente a uma estrutura de treinamento.',
    ],

    benefits: [
      'Permite utilizar a estrutura prevista no plano.',
    ],

    verified_differentiators: [
      'Benefícios específicos configurados para o Plano Open.',
    ],

    limitations: [
      'Não inclui serviços que estejam fora das condições oficiais do plano.',
    ],

    recommend_when: [
      'A necessidade do cliente corresponde aos serviços incluídos no plano.',
    ],

    avoid_when: [
      'O cliente precisa de um serviço que o plano explicitamente não cobre.',
    ],

    pricing: {
      model:
        'recurring',

      amount:
        199.9,

      currency:
        'BRL',

      amount_qualifier:
        'exact',

      recurrence:
        'monthly',

      installment_count:
        null,

      installment_amount_basis:
        null,

      note:
        'Valor mensal do exemplo de contrato.',
    },

    contract_conditions: [
      'Condições contratuais precisam ser confirmadas pela configuração oficial.',
    ],

    payment_conditions: [
      'Pagamento conforme condição oficialmente configurada.',
    ],

    allowed_claims: [
      'O plano concede os benefícios explicitamente configurados.',
    ],

    forbidden_claims: [
      'O plano garante resultado físico.',
    ],
  }
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

test(
  'contrato representa produto simples com aderência limites e preço semântico',
  () => {
    const product =
      buildProduct()

    const result =
      validateCommercialProductDefinition(
        product,
      )

    assert.equal(
      result.valid,
      true,
    )

    assert.deepEqual(
      result.issues,
      [],
    )

    assert.equal(
      product.product_kind,
      'simple',
    )

    assert.equal(
      product.pricing.model,
      'recurring',
    )

    assert.equal(
      product.pricing.recurrence,
      'monthly',
    )

    assert.ok(
      product.recommend_when.length >
        0,
    )

    assert.ok(
      product.avoid_when.length >
        0,
    )
  },
)

test(
  'produto simples exige público necessidade benefício e condição de recomendação',
  () => {
    const product =
      buildProduct()

    product.indicated_audiences = []
    product.needs_addressed = []
    product.benefits = []
    product.recommend_when = []

    const result =
      validateCommercialProductDefinition(
        product,
      )

    assert.equal(
      result.valid,
      false,
    )

    const paths =
      result.issues.map(
        issue => issue.path,
      )

    assert.ok(
      paths.includes(
        'indicated_audiences',
      ),
    )

    assert.ok(
      paths.includes(
        'needs_addressed',
      ),
    )

    assert.ok(
      paths.includes(
        'benefits',
      ),
    )

    assert.ok(
      paths.includes(
        'recommend_when',
      ),
    )
  },
)

test(
  'preço recorrente exige periodicidade explícita',
  () => {
    const product =
      buildProduct()

    product.pricing.recurrence =
      null

    const result =
      validateCommercialProductDefinition(
        product,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.path ===
          'pricing.recurrence',
      ),
    )
  },
)

test(
  'preço desconhecido não pode carregar número ambíguo do catálogo',
  () => {
    const product =
      buildProduct()

    product.pricing = {
      model:
        'unknown',

      amount:
        199.9,

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
    }

    const result =
      validateCommercialProductDefinition(
        product,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.path ===
          'pricing.amount',
      ),
    )
  },
)

test(
  'preço sob consulta não pode fingir valor conhecido',
  () => {
    const product =
      buildProduct()

    product.pricing = {
      model:
        'quote_required',

      amount:
        500,

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
        'Necessita proposta.',
    }

    const result =
      validateCommercialProductDefinition(
        product,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.path ===
          'pricing.amount',
      ),
    )
  },
)

test(
  'parcelamento exige quantidade e significado do valor',
  () => {
    const product =
      buildProduct()

    product.pricing = {
      model:
        'installment',

      amount:
        1200,

      currency:
        'BRL',

      amount_qualifier:
        'exact',

      recurrence:
        null,

      installment_count:
        null,

      installment_amount_basis:
        null,

      note:
        null,
    }

    const result =
      validateCommercialProductDefinition(
        product,
      )

    assert.equal(
      result.valid,
      false,
    )

    const paths =
      result.issues.map(
        issue => issue.path,
      )

    assert.ok(
      paths.includes(
        'pricing.installment_count',
      ),
    )

    assert.ok(
      paths.includes(
        'pricing.installment_amount_basis',
      ),
    )
  },
)

test(
  'mesma afirmação não pode ser permitida e proibida',
  () => {
    const product =
      buildProduct()

    product.forbidden_claims = [
      product.allowed_claims[0],
    ]

    const result =
      validateCommercialProductDefinition(
        product,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.code ===
          'CONFLICTING_RULE' &&
          issue.path.includes(
            'allowed_claims',
          ),
      ),
    )
  },
)

test(
  'mesma condição não pode recomendar e contraindicar produto',
  () => {
    const product =
      buildProduct()

    product.avoid_when = [
      product.recommend_when[0],
    ]

    const result =
      validateCommercialProductDefinition(
        product,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.code ===
          'CONFLICTING_RULE' &&
          issue.path.includes(
            'recommend_when',
          ),
      ),
    )
  },
)

test(
  'listas semânticas rejeitam duplicidade textual',
  () => {
    const product =
      buildProduct()

    product.benefits = [
      'Acesso à estrutura.',
      ' acesso à estrutura. ',
    ]

    const result =
      validateCommercialProductDefinition(
        product,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.code ===
          'DUPLICATE_ITEM' &&
          issue.path.startsWith(
            'benefits',
          ),
      ),
    )
  },
)

test(
  'A1.2 não aceita produto complexo antes da fase própria',
  () => {
    const product =
      clone(
        buildProduct(),
      )

    product.product_kind =
      'complex'

    const result =
      validateCommercialProductDefinition(
        product,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.path ===
          'product_kind',
      ),
    )
  },
)
