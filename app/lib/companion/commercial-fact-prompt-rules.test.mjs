import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialFactPromptRules,
  COMMERCIAL_FACT_PROMPT_RULES_VERSION,
} from './commercial-fact-prompt-rules.ts'

function buildFactV2(
  validityStatus = 'current',
) {
  return {
    contract_version:
      'commercial-fact-v2',

    definition: {
      contract_version:
        'commercial-fact-v2',

      fact_kind:
        'official',

      category:
        'commercial_policy',

      fact_key:
        'discount_policy',

      fact_value:
        'Descontos exigem aprovação comercial.',

      scope: {
        type:
          'commercial_policy',

        product_id:
          null,

        variant_key:
          null,

        reference_key:
          'discount_policy',
      },

      conditions: [
        'Existe negociação comercial ativa.',
      ],

      limitations: [
        'Não autoriza desconto automático.',
      ],

      validity: {
        mode:
          'bounded',

        valid_from:
          '2026-08-01T00:00:00.000Z',

        valid_until:
          '2026-08-31T23:59:59.000Z',
      },

      source: {
        type:
          'internal_policy',

        reference:
          'Política comercial de agosto de 2026.',

        verified_at:
          '2026-08-04T12:00:00.000Z',
      },
    },

    validity_status:
      validityStatus,

    category:
      'commercial_policy',

    fact_key:
      'discount_policy',

    fact_value:
      'Descontos exigem aprovação comercial.',

    source_note:
      'Política comercial publicada.',
  }
}

test(
  'ausência de fatos não autoriza invenção nem conclusão inversa',
  () => {
    const rules =
      buildCommercialFactPromptRules(
        [],
      )

    assert.equal(
      COMMERCIAL_FACT_PROMPT_RULES_VERSION,
      'commercial-fact-prompt-rules-v1',
    )

    assert.match(
      rules,
      /Não invente fato oficial, condição, escopo, vigência, procedência ou exceção ausente/,
    )

    assert.match(
      rules,
      /A ausência de um fato oficial não prova o contrário/,
    )
  },
)

test(
  'fato legado preserva conteúdo explícito sem inventar semântica V2',
  () => {
    const rules =
      buildCommercialFactPromptRules([
        {
          contract_version:
            'commercial-fact-v1',

          definition:
            null,

          validity_status:
            'legacy',

          category:
            'operação',

          fact_key:
            'horario',

          fact_value:
            'Atendimento em horário comercial.',

          source_note:
            'Configuração oficial.',
        },
      ])

    assert.match(
      rules,
      /commercial-fact-v1 é um fato legado/,
    )

    assert.match(
      rules,
      /Não presuma que um fato V1 temporalmente sensível continue atual/,
    )

    assert.match(
      rules,
      /não é evidência de mensagem/,
    )
  },
)

test(
  'fato V2 respeita escopo condições limitações procedência e produto',
  () => {
    const rules =
      buildCommercialFactPromptRules([
        buildFactV2(),
      ])

    assert.match(
      rules,
      /fact\.definition é a fonte semântica vinculante/,
    )

    assert.match(
      rules,
      /definition\.scope\.type=product aplica o fato somente ao product_id indicado/,
    )

    assert.match(
      rules,
      /definition\.scope\.type=product_variant aplica o fato somente à combinação exata/,
    )

    assert.match(
      rules,
      /definition\.conditions limita quando o fato pode ser aplicado/,
    )

    assert.match(
      rules,
      /definition\.limitations contém qualificadores e restrições vinculantes/,
    )

    assert.match(
      rules,
      /definition\.source\.verified_at informa quando a fonte foi verificada/,
    )

    assert.match(
      rules,
      /Não transforme fatos oficiais em um segundo catálogo de produtos/,
    )
  },
)

test(
  'vigência impede fato futuro ou vencido de sustentar afirmação atual',
  () => {
    const rules =
      buildCommercialFactPromptRules([
        buildFactV2(
          'not_yet_valid',
        ),

        buildFactV2(
          'expired',
        ),
      ])

    assert.match(
      rules,
      /validity_status=current significa que a vigência temporal permite considerar o fato atual/,
    )

    assert.match(
      rules,
      /validity_status=not_yet_valid não pode sustentar uma afirmação sobre o estado atual/,
    )

    assert.match(
      rules,
      /validity_status=expired não pode sustentar uma afirmação sobre o estado atual/,
    )

    assert.match(
      rules,
      /Nunca use um fato not_yet_valid ou expired para completar silenciosamente informação atual ausente/,
    )
  },
)
