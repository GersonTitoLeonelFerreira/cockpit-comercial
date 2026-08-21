import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_FACT_CONTRACT_VERSION,
  COMMERCIAL_FACT_SCOPE_TYPES,
  COMMERCIAL_FACT_SOURCE_TYPES,
  COMMERCIAL_FACT_VALIDITY_MODES,
  validateCommercialFactDefinition,
} from './commercial-fact-contract.ts'

function buildFact(
  overrides = {},
) {
  return {
    contract_version:
      'commercial-fact-v2',

    fact_kind:
      'official',

    category:
      'empresa',

    fact_key:
      'horario_atendimento',

    fact_value:
      'O atendimento comercial funciona de segunda a sexta-feira, das 8h às 18h.',

    scope: {
      type:
        'company',

      product_id:
        null,

      variant_key:
        null,

      reference_key:
        null,
    },

    conditions: [],

    limitations: [
      'O horário informado não inclui feriados.',
    ],

    validity: {
      mode:
        'ongoing',

      valid_from:
        '2026-08-01T00:00:00.000Z',

      valid_until:
        null,
    },

    source: {
      type:
        'internal_policy',

      reference:
        'Política oficial de atendimento comercial.',

      verified_at:
        '2026-08-18T12:00:00.000Z',
    },

    ...overrides,
  }
}

test(
  'contrato representa fato oficial verificável com escopo vigência e procedência',
  () => {
    const fact =
      buildFact()

    const result =
      validateCommercialFactDefinition(
        fact,
      )

    assert.equal(
      COMMERCIAL_FACT_CONTRACT_VERSION,
      'commercial-fact-v2',
    )

    assert.equal(
      result.valid,
      true,
    )

    assert.deepEqual(
      result.issues,
      [],
    )
  },
)

test(
  'contrato possui os escopos fontes e modos de vigência esperados',
  () => {
    assert.deepEqual(
      COMMERCIAL_FACT_SCOPE_TYPES,
      [
        'company',
        'product',
        'product_variant',
        'commercial_policy',
        'operation',
        'service',
        'integration',
        'security',
        'other',
      ],
    )

    assert.deepEqual(
      COMMERCIAL_FACT_SOURCE_TYPES,
      [
        'internal_policy',
        'contract',
        'product_documentation',
        'system_record',
        'manual_verification',
        'regulatory_document',
        'other',
      ],
    )

    assert.deepEqual(
      COMMERCIAL_FACT_VALIDITY_MODES,
      [
        'ongoing',
        'bounded',
      ],
    )
  },
)

test(
  'fato pode ser limitado a uma variante específica sem virar definição de produto',
  () => {
    const fact =
      buildFact({
        category:
          'implantacao',

        fact_key:
          'prazo_instalacao_variante_x',

        fact_value:
          'A instalação da variante X possui prazo operacional de até cinco dias úteis.',

        scope: {
          type:
            'product_variant',

          product_id:
            'product-123',

          variant_key:
            'variant-x',

          reference_key:
            null,
        },

        conditions: [
          'O endereço precisa estar dentro da área atendida.',
        ],

        validity: {
          mode:
            'bounded',

          valid_from:
            '2026-08-01T00:00:00.000Z',

          valid_until:
            '2026-12-31T23:59:59.000Z',
        },
      })

    const result =
      validateCommercialFactDefinition(
        fact,
      )

    assert.equal(
      result.valid,
      true,
      JSON.stringify(
        result.issues,
      ),
    )
  },
)

test(
  'escopo de empresa não aceita referência de produto variante ou política',
  () => {
    const result =
      validateCommercialFactDefinition(
        buildFact({
          scope: {
            type:
              'company',

            product_id:
              'product-123',

            variant_key:
              null,

            reference_key:
              null,
          },
        }),
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.code ===
          'SCOPE_CONFLICT',
      ),
      true,
    )
  },
)

test(
  'produto exige product_id e variante exige product_id mais variant_key',
  () => {
    const invalidProduct =
      validateCommercialFactDefinition(
        buildFact({
          scope: {
            type:
              'product',

            product_id:
              null,

            variant_key:
              null,

            reference_key:
              null,
          },
        }),
      )

    assert.equal(
      invalidProduct.valid,
      false,
    )

    const invalidVariant =
      validateCommercialFactDefinition(
        buildFact({
          scope: {
            type:
              'product_variant',

            product_id:
              'product-123',

            variant_key:
              null,

            reference_key:
              null,
          },
        }),
      )

    assert.equal(
      invalidVariant.valid,
      false,
    )
  },
)

test(
  'política operação serviço integração segurança e other exigem referência específica',
  () => {
    const result =
      validateCommercialFactDefinition(
        buildFact({
          scope: {
            type:
              'commercial_policy',

            product_id:
              null,

            variant_key:
              null,

            reference_key:
              null,
          },
        }),
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.code ===
          'SCOPE_CONFLICT',
      ),
      true,
    )
  },
)

test(
  'vigência bounded exige validade final e cronologia coerente',
  () => {
    const missingEnd =
      validateCommercialFactDefinition(
        buildFact({
          validity: {
            mode:
              'bounded',

            valid_from:
              '2026-08-10T00:00:00.000Z',

            valid_until:
              null,
          },
        }),
      )

    assert.equal(
      missingEnd.valid,
      false,
    )

    const inverted =
      validateCommercialFactDefinition(
        buildFact({
          validity: {
            mode:
              'bounded',

            valid_from:
              '2026-08-20T00:00:00.000Z',

            valid_until:
              '2026-08-19T00:00:00.000Z',
          },
        }),
      )

    assert.equal(
      inverted.valid,
      false,
    )

    assert.equal(
      inverted.issues.some(
        issue =>
          issue.code ===
          'INVALID_CHRONOLOGY',
      ),
      true,
    )
  },
)

test(
  'fato ongoing não aceita data final escondida',
  () => {
    const result =
      validateCommercialFactDefinition(
        buildFact({
          validity: {
            mode:
              'ongoing',

            valid_from:
              null,

            valid_until:
              '2026-12-31T23:59:59.000Z',
          },
        }),
      )

    assert.equal(
      result.valid,
      false,
    )
  },
)

test(
  'todo fato oficial exige procedência verificável e instante de verificação válido',
  () => {
    const noReference =
      validateCommercialFactDefinition(
        buildFact({
          source: {
            type:
              'manual_verification',

            reference:
              '',

            verified_at:
              '2026-08-18T12:00:00.000Z',
          },
        }),
      )

    assert.equal(
      noReference.valid,
      false,
    )

    const invalidVerification =
      validateCommercialFactDefinition(
        buildFact({
          source: {
            type:
              'system_record',

            reference:
              'Registro oficial do sistema.',

            verified_at:
              'data-invalida',
          },
        }),
      )

    assert.equal(
      invalidVerification.valid,
      false,
    )
  },
)

test(
  'condições e limitações rejeitam duplicidade textual',
  () => {
    const result =
      validateCommercialFactDefinition(
        buildFact({
          conditions: [
            'Cliente elegível.',
            ' cliente elegível. ',
          ],
        }),
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.code ===
          'DUPLICATE_ITEM',
      ),
      true,
    )
  },
)

test(
  'contrato rejeita versão e natureza de fato incompatíveis',
  () => {
    const wrongVersion =
      validateCommercialFactDefinition(
        buildFact({
          contract_version:
            'commercial-fact-v1',
        }),
      )

    assert.equal(
      wrongVersion.valid,
      false,
    )

    const wrongKind =
      validateCommercialFactDefinition(
        buildFact({
          fact_kind:
            'opinion',
        }),
      )

    assert.equal(
      wrongKind.valid,
      false,
    )
  },
)
