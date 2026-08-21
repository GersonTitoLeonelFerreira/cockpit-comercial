import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_COMPLEX_PRODUCT_CONTRACT_VERSION,
  validateCommercialComplexProductDefinition,
} from './commercial-product-complex-contract.ts'

function buildVariant(
  overrides = {},
) {
  return {
    key:
      'pro',

    name:
      'Modelo Pro',

    sku:
      'EQ-PRO-001',

    model:
      'XP-900',

    version:
      '2026',

    commercial_description:
      'Versão profissional do equipamento.',

    compatibility: {
      compatible_with: [
        'Rede elétrica 220V',
      ],

      incompatible_with: [
        'Rede elétrica 110V',
      ],

      notes: [
        'Verificar infraestrutura antes da instalação.',
      ],
    },

    applications: [
      'Academias de médio e grande porte.',
    ],

    specifications: [
      {
        key:
          'motor',

        label:
          'Motor',

        value:
          '5',

        unit:
          'HP',
      },

      {
        key:
          'velocidade',

        label:
          'Velocidade máxima',

        value:
          '22',

        unit:
          'km/h',
      },
    ],

    limitations: [
      'Exige instalação em 220V.',
    ],

    recommend_when: [
      'A operação precisa de equipamento profissional para alto volume de uso.',
    ],

    avoid_when: [
      'O local possui somente rede elétrica 110V.',
    ],

    pricing: {
      model:
        'one_time',

      amount:
        18990,

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
        'Preço da variante Pro.',
    },

    stock: {
      status:
        'available',

      quantity:
        4,

      checked_at:
        '2026-08-18T12:00:00.000Z',

      valid_until:
        '2026-08-19T12:00:00.000Z',

      note:
        'Estoque confirmado para esta janela.',
    },

    allowed_claims: [
      'Possui motor de 5 HP.',
    ],

    forbidden_claims: [
      'Nunca necessita manutenção.',
    ],

    ...overrides,
  }
}

function buildDefinition(
  overrides = {},
) {
  return {
    contract_version:
      'commercial-product-v3',

    product_kind:
      'complex',

    name:
      'Esteira Profissional',

    category:
      'Equipamento fitness',

    commercial_description:
      'Linha de esteiras profissionais com variantes técnicas.',

    indicated_audiences: [
      'Academias e centros de treinamento.',
    ],

    needs_addressed: [
      'Equipar operação de treinamento cardiovascular.',
    ],

    benefits: [
      'Permite selecionar a variante conforme a operação.',
    ],

    verified_differentiators: [
      'Variantes com especificações comerciais verificadas.',
    ],

    limitations: [
      'A escolha depende da infraestrutura e da aplicação.',
    ],

    recommend_when: [
      'A empresa precisa de equipamento profissional.',
    ],

    avoid_when: [
      'A necessidade não corresponde a equipamento de uso profissional.',
    ],

    contract_conditions: [
      'Instalação conforme escopo contratado.',
    ],

    payment_conditions: [
      'Conforme condição comercial da variante.',
    ],

    allowed_claims: [
      'Existem variantes com especificações distintas.',
    ],

    forbidden_claims: [
      'Qualquer variante atende qualquer infraestrutura.',
    ],

    variants: [
      buildVariant(),

      buildVariant({
        key:
          'standard',

        name:
          'Modelo Standard',

        sku:
          'EQ-STD-001',

        model:
          'XP-700',

        version:
          '2026',

        specifications: [
          {
            key:
              'motor',

            label:
              'Motor',

            value:
              '3',

            unit:
              'HP',
          },
        ],

        pricing: {
          model:
            'installment',

          amount:
            1290,

          currency:
            'BRL',

          amount_qualifier:
            'starting_at',

          recurrence:
            null,

          installment_count:
            12,

          installment_amount_basis:
            'per_installment',

          note:
            'Valor inicial por parcela.',
        },

        stock: {
          status:
            'limited',

          quantity:
            2,

          checked_at:
            '2026-08-18T12:00:00.000Z',

          valid_until:
            '2026-08-18T20:00:00.000Z',

          note:
            'Estoque limitado.',
        },
      }),
    ],

    ...overrides,
  }
}

function validate(
  definition,
) {
  return (
    validateCommercialComplexProductDefinition(
      definition,
    )
  )
}

test(
  'contrato representa produto complexo com variantes preço estoque e seleção técnica',
  () => {
    const result =
      validate(
        buildDefinition(),
      )

    assert.equal(
      COMMERCIAL_COMPLEX_PRODUCT_CONTRACT_VERSION,
      'commercial-product-v3',
    )

    assert.equal(
      result.valid,
      true,
      JSON.stringify(
        result.issues,
      ),
    )

    assert.deepEqual(
      result.issues,
      [],
    )
  },
)

test(
  'variantes precisam possuir chave e SKU únicos',
  () => {
    const definition =
      buildDefinition()

    definition.variants[1].key =
      definition.variants[0].key

    definition.variants[1].sku =
      definition.variants[0].sku

    const result =
      validate(
        definition,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.path ===
          'variants[1].key',
      ),
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.path ===
          'variants[1].sku',
      ),
    )
  },
)

test(
  'compatibilidade não pode afirmar simultaneamente compatível e incompatível',
  () => {
    const definition =
      buildDefinition()

    definition
      .variants[0]
      .compatibility
      .incompatible_with
      .push(
        'Rede elétrica 220V',
      )

    const result =
      validate(
        definition,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.code ===
          'CONFLICTING_RULE',
      ),
    )
  },
)

test(
  'estoque temporário precisa declarar verificação e validade futura',
  () => {
    const definition =
      buildDefinition()

    definition
      .variants[0]
      .stock
      .valid_until =
        '2026-08-18T11:00:00.000Z'

    const result =
      validate(
        definition,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.path ===
          'variants[0].stock.valid_until',
      ),
    )
  },
)

test(
  'estoque desconhecido não pode carregar quantidade escondida',
  () => {
    const definition =
      buildDefinition()

    definition.variants[0].stock = {
      status:
        'unknown',

      quantity:
        10,

      checked_at:
        null,

      valid_until:
        null,

      note:
        null,
    }

    const result =
      validate(
        definition,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.path ===
          'variants[0].stock.quantity',
      ),
    )
  },
)

test(
  'preço inválido da variante é rejeitado pelo mesmo contrato semântico da A1.2',
  () => {
    const definition =
      buildDefinition()

    definition.variants[0].pricing = {
      model:
        'recurring',

      amount:
        500,

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
      validate(
        definition,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.path ===
          'variants[0].pricing.recurrence',
      ),
    )
  },
)

test(
  'produto complexo precisa possuir ao menos uma variante',
  () => {
    const result =
      validate(
        buildDefinition({
          variants: [],
        }),
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.path ===
          'variants',
      ),
    )
  },
)

test(
  'variante complexa precisa possuir característica real de seleção',
  () => {
    const definition =
      buildDefinition({
        variants: [
          buildVariant({
            sku:
              null,

            model:
              null,

            version:
              null,

            applications:
              [],

            specifications:
              [],

            compatibility: {
              compatible_with:
                [],

              incompatible_with:
                [],

              notes:
                [],
            },
          }),
        ],
      })

    const result =
      validate(
        definition,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.ok(
      result.issues.some(
        issue =>
          issue.path ===
          'variants[0].selection',
      ),
    )
  },
)
