import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LEAD_ENRICHMENT_UPDATE_FIELDS,
  areLeadEnrichmentValuesEqual,
  normalizeLeadEnrichmentFieldValue,
  normalizeLeadEnrichmentUpdateInput,
} from './lead-enrichment-update-contract.ts'

const LEAD_ID =
  '11111111-1111-4111-8111-111111111111'

const CYCLE_ID =
  '22222222-2222-4222-8222-222222222222'

function payload(
  overrides = {},
) {
  return {
    lead_id: LEAD_ID,
    cycle_id: CYCLE_ID,
    field: 'email',
    value: 'novo@example.com',
    expected_current_value:
      'antigo@example.com',
    evidence_message_ids: [
      'message-1',
    ],
    confirmed_by_human: true,
    ...overrides,
  }
}

test('B2 confirmação aceita somente campos mapeáveis com segurança', () => {
  assert.deepEqual(
    LEAD_ENRICHMENT_UPDATE_FIELDS,
    [
      'email',
      'cpf',
      'cnpj',
      'birth_date',
      'profession',
      'cep',
      'phone_mobile',
    ],
  )

  const result =
    normalizeLeadEnrichmentUpdateInput(
      payload({
        field: 'address_raw',
        value:
          'Rua Exemplo, 100',
      }),
    )

  assert.equal(result.ok, false)
  assert.equal(
    result.code,
    'unsupported_field',
  )
})

test('B2 confirmação normaliza e-mail e exige evidência', () => {
  const result =
    normalizeLeadEnrichmentUpdateInput(
      payload({
        value:
          ' NOVO@EXAMPLE.COM ',
        evidence_message_ids: [
          'msg-1',
          'msg-1',
          'msg-2',
        ],
      }),
    )

  assert.equal(result.ok, true)

  if (!result.ok) {
    return
  }

  assert.equal(
    result.value.value,
    'novo@example.com',
  )

  assert.deepEqual(
    result.value
      .evidenceMessageIds,
    [
      'msg-1',
      'msg-2',
    ],
  )
})

test('B2 confirmação rejeita atualização sem evidência', () => {
  const result =
    normalizeLeadEnrichmentUpdateInput(
      payload({
        evidence_message_ids: [],
      }),
    )

  assert.equal(result.ok, false)
  assert.equal(
    result.code,
    'invalid_evidence',
  )
})

test('B2 confirmação valida CPF, CNPJ, nascimento, CEP e telefone', () => {
  assert.equal(
    normalizeLeadEnrichmentFieldValue(
      'cpf',
      '529.982.247-25',
    ),
    '52998224725',
  )

  assert.equal(
    normalizeLeadEnrichmentFieldValue(
      'cnpj',
      '04.252.011/0001-10',
    ),
    '04252011000110',
  )

  assert.equal(
    normalizeLeadEnrichmentFieldValue(
      'birth_date',
      '1990-05-20',
    ),
    '1990-05-20',
  )

  assert.equal(
    normalizeLeadEnrichmentFieldValue(
      'cep',
      '89220-000',
    ),
    '89220000',
  )

  assert.equal(
    normalizeLeadEnrichmentFieldValue(
      'phone_mobile',
      '(47) 98888-7777',
    ),
    '47988887777',
  )
})

test('B2 confirmação detecta valor atual desatualizado após normalização', () => {
  assert.equal(
    areLeadEnrichmentValuesEqual(
      'email',
      'CLIENTE@EXAMPLE.COM',
      'cliente@example.com',
    ),
    true,
  )

  assert.equal(
    areLeadEnrichmentValuesEqual(
      'email',
      'outro@example.com',
      'cliente@example.com',
    ),
    false,
  )
})


test('B2 confirmação rejeita escrita sem clique humano', () => {
  const result =
    normalizeLeadEnrichmentUpdateInput(
      payload({
        confirmed_by_human: false,
      }),
    )

  assert.equal(result.ok, false)

  assert.equal(
    result.code,
    'human_confirmation_required',
  )
})
