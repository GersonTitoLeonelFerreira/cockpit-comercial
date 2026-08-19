import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialProductPromptRules,
  COMMERCIAL_PRODUCT_PROMPT_RULES_VERSION,
} from './commercial-product-prompt-rules.ts'

test(
  'produto ausente proíbe invenção e recomendação forçada',
  () => {
    const rules =
      buildCommercialProductPromptRules(
        [],
      )

    assert.equal(
      COMMERCIAL_PRODUCT_PROMPT_RULES_VERSION,
      'commercial-product-prompt-rules-v2',
    )

    assert.match(
      rules,
      /Não invente produto, preço, condição, benefício/,
    )

    assert.match(
      rules,
      /não conclua aderência comercial positiva/,
    )
  },
)

test(
  'produto legado não transforma base_price em mensalidade ou outra semântica inventada',
  () => {
    const rules =
      buildCommercialProductPromptRules([
        {
          product_id:
            'product-legacy',

          contract_version:
            'commercial-product-v1',

          definition:
            null,

          name:
            'Plano legado',

          category:
            'Plano',

          base_price:
            199.9,

          active:
            true,

          indicated_audiences: [],
          needs_addressed: [],
          benefits: [],
          verified_differentiators: [],

          limitations: [
            'Disponibilidade limitada.',
          ],

          contract_conditions: [],
          payment_conditions: [],

          allowed_claims: [
            'Suporte incluído.',
          ],

          forbidden_claims: [
            'Resultado garantido.',
          ],
        },
      ])

    assert.match(
      rules,
      /base_price é um valor legado sem semântica comercial suficiente/,
    )

    assert.match(
      rules,
      /Nunca deduza apenas de base_price que o valor seja mensal, anual, total, parcela, pagamento único ou valor a partir de/,
    )

    assert.match(
      rules,
      /limitations são restrições vinculantes/,
    )

    assert.match(
      rules,
      /forbidden_claims é uma proibição rígida/,
    )
  },
)

test(
  'produto V2 usa aderência preço semântico limitações e claims sem forçar recomendação',
  () => {
    const rules =
      buildCommercialProductPromptRules([
        {
          product_id:
            'product-v2',

          contract_version:
            'commercial-product-v2',

          definition: {
            contract_version:
              'commercial-product-v2',

            product_kind:
              'simple',

            name:
              'Plano Open',

            category:
              'Plano',

            commercial_description:
              'Plano recorrente.',

            indicated_audiences: [
              'Adultos',
            ],

            needs_addressed: [
              'Condicionamento',
            ],

            benefits: [
              'Estrutura',
            ],

            verified_differentiators: [],

            limitations: [
              'Disponibilidade depende da unidade.',
            ],

            recommend_when: [
              'A necessidade corresponde ao plano.',
            ],

            avoid_when: [
              'O cliente precisa de algo não coberto.',
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
                null,
            },

            contract_conditions: [],
            payment_conditions: [],

            allowed_claims: [
              'Estrutura disponível.',
            ],

            forbidden_claims: [
              'Resultado garantido.',
            ],
          },

          name:
            'Plano Open',

          category:
            'Plano',

          base_price:
            null,

          active:
            true,

          indicated_audiences: [
            'Adultos',
          ],

          needs_addressed: [
            'Condicionamento',
          ],

          benefits: [
            'Estrutura',
          ],

          verified_differentiators: [],

          limitations: [
            'Disponibilidade depende da unidade.',
          ],

          contract_conditions: [],
          payment_conditions: [],

          allowed_claims: [
            'Estrutura disponível.',
          ],

          forbidden_claims: [
            'Resultado garantido.',
          ],
        },
      ])

    assert.match(
      rules,
      /recommend_when/,
    )

    assert.match(
      rules,
      /avoid_when/,
    )

    assert.match(
      rules,
      /definition\.pricing é a única fonte semântica de preço/,
    )

    assert.match(
      rules,
      /pricing\.model=recurring/,
    )

    assert.match(
      rules,
      /pricing\.model=quote_required/,
    )

    assert.match(
      rules,
      /pricing\.model=free/,
    )

    assert.match(
      rules,
      /pricing\.model=unknown/,
    )

    assert.match(
      rules,
      /ignore base_price como fonte de significado comercial/,
    )

    assert.match(
      rules,
      /Não force avanço, pergunta, mensagem, CRM ou Agenda/,
    )
  },
)

test(
  'produto V3 seleciona variante somente por evidência compatibilidade preço e estoque válidos',
  () => {
    const rules =
      buildCommercialProductPromptRules([
        {
          product_id:
            'product-v3',

          contract_version:
            'commercial-product-v3',

          definition: {
            contract_version:
              'commercial-product-v3',

            product_kind:
              'complex',

            variants: [],
          },

          name:
            'Equipamento Profissional',

          category:
            'Equipamento',

          base_price:
            null,

          active:
            true,

          indicated_audiences: [],
          needs_addressed: [],
          benefits: [],
          verified_differentiators: [],
          limitations: [],
          contract_conditions: [],
          payment_conditions: [],
          allowed_claims: [],
          forbidden_claims: [],
        },
      ])

    assert.match(
      rules,
      /definition\.variants representa as variantes oficiais selecionáveis/,
    )

    assert.match(
      rules,
      /Nunca selecione uma variante apenas porque ela aparece primeiro/,
    )

    assert.match(
      rules,
      /variant\.compatibility\.incompatible_with é conflito real/,
    )

    assert.match(
      rules,
      /variant\.specifications contém fatos técnicos configurados/,
    )

    assert.match(
      rules,
      /variant\.pricing é a fonte semântica de preço daquela variante/,
    )

    assert.match(
      rules,
      /Uma variante disponível não se torna adequada apenas por estar em estoque/,
    )

    assert.match(
      rules,
      /product_stock_information_stale/,
    )

    assert.match(
      rules,
      /não escolha arbitrariamente/,
    )

    assert.match(
      rules,
      /nenhuma variante configurada atende/,
    )
  },
)
