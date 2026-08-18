import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cloneCommercialConfigVersion,
  saveCommercialConfigDraft,
} from './commercial-config.ts'

const COMPANY_ID =
  '10000000-0000-4000-8000-000000000001'

const CONFIG_ID =
  '20000000-0000-4000-8000-000000000001'

const PRODUCT_ID =
  '30000000-0000-4000-8000-000000000001'

function buildMethodDefinition() {
  return {
    contract_version:
      'commercial-method-v2',

    name:
      'Método ATO',

    description:
      'Acolher, realizar o Tour necessário e Obter o desfecho comercial adequado.',

    principles: [
      'Perguntar somente quando a resposta puder alterar a decisão.',
      'Esperar é uma decisão comercial válida.',
    ],

    stages: [
      {
        key:
          'acolher',

        display_order:
          1,

        name:
          'Acolher',

        objective:
          'Compreender a intenção imediata.',

        requirement:
          'required',

        completion_criteria: [
          'A intenção imediata foi compreendida.',
        ],

        partial_completion_criteria: [],

        skip_conditions: [],

        recommended_questions: [],

        common_mistakes: [],

        deepen_when: [],

        sufficient_when: [
          'Existe informação suficiente para decidir o que é útil agora.',
        ],

        advance_when: [],

        wait_when: [
          'O cliente assumiu compromisso de retorno.',
        ],

        stop_asking_when: [
          'Novas perguntas não alterariam a decisão.',
        ],

        dimensions: [],
      },
    ],
  }
}

function buildProductDefinition() {
  return {
    contract_version:
      'commercial-product-v2',

    product_kind:
      'simple',

    name:
      'Plano Open',

    category:
      'Plano',

    commercial_description:
      'Plano recorrente com condições comerciais oficialmente configuradas.',

    indicated_audiences: [
      'Clientes para os quais os benefícios do plano são adequados.',
    ],

    needs_addressed: [
      'Acesso recorrente aos serviços incluídos.',
    ],

    benefits: [
      'Acesso aos benefícios oficialmente configurados.',
    ],

    verified_differentiators: [
      'Condições oficialmente confirmadas.',
    ],

    limitations: [
      'Não inclui serviços fora da configuração oficial.',
    ],

    recommend_when: [
      'A necessidade do cliente corresponde ao que o plano entrega.',
    ],

    avoid_when: [
      'O cliente depende de serviço que o plano não cobre.',
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

    contract_conditions: [
      'Condições contratuais oficialmente configuradas.',
    ],

    payment_conditions: [
      'Pagamento conforme configuração oficial.',
    ],

    allowed_claims: [
      'O plano inclui os benefícios oficialmente configurados.',
    ],

    forbidden_claims: [
      'O plano garante resultado físico.',
    ],
  }
}

function buildDraft() {
  const productDefinition =
    buildProductDefinition()

  return {
    config_version_id:
      CONFIG_ID,

    business_description:
      'Empresa com operação comercial estruturada.',

    target_audience:
      'Empresas com equipes comerciais.',

    value_proposition:
      'Apoiar decisões e execução comercial.',

    commercial_method_name:
      'Método ATO',

    commercial_method_description:
      'Acolher, Tour e Obter sem roteiro mecânico.',

    commercial_method_definition:
      buildMethodDefinition(),

    communication_tone:
      'Direto, consultivo e respeitoso.',

    required_behaviors: [
      'Responder ao que o cliente realmente precisa.',
    ],

    prohibited_behaviors: [
      'Inventar informações.',
    ],

    method_steps: [],

    product_profiles: [
      {
        product_id:
          PRODUCT_ID,

        commercial_product_contract_version:
          'commercial-product-v2',

        commercial_product_definition:
          productDefinition,

        indicated_audiences:
          productDefinition.indicated_audiences,

        needs_addressed:
          productDefinition.needs_addressed,

        benefits:
          productDefinition.benefits,

        verified_differentiators:
          productDefinition.verified_differentiators,

        limitations:
          productDefinition.limitations,

        contract_conditions:
          productDefinition.contract_conditions,

        payment_conditions:
          productDefinition.payment_conditions,

        allowed_claims:
          productDefinition.allowed_claims,

        forbidden_claims:
          productDefinition.forbidden_claims,
      },
    ],

    facts: [],

    objection_guides: [],
  }
}

function createRpcClient() {
  const calls = []

  return {
    calls,

    client: {
      async rpc(name, args) {
        calls.push({
          name,
          args,
        })

        return {
          data: [
            {
              company_id:
                COMPANY_ID,

              config_version_id:
                CONFIG_ID,

              version_number:
                2,

              status:
                'draft',
            },
          ],

          error:
            null,
        }
      },
    },
  }
}

test(
  'salvamento administrativo usa RPC V3 e preserva método e produto V2',
  async () => {
    const {
      client,
      calls,
    } = createRpcClient()

    await saveCommercialConfigDraft(
      client,
      COMPANY_ID,
      buildDraft(),
    )

    assert.equal(
      calls.length,
      1,
    )

    assert.equal(
      calls[0].name,
      'rpc_save_company_commercial_config_draft_v3',
    )

    assert.equal(
      calls[0].args
        .p_payload
        .commercial_method_definition
        .contract_version,
      'commercial-method-v2',
    )

    assert.equal(
      calls[0].args
        .p_payload
        .commercial_method_definition
        .stages[0]
        .wait_when[0],
      'O cliente assumiu compromisso de retorno.',
    )

    assert.equal(
      calls[0].args
        .p_payload
        .product_profiles[0]
        .commercial_product_definition
        .contract_version,
      'commercial-product-v2',
    )

    assert.equal(
      calls[0].args
        .p_payload
        .product_profiles[0]
        .commercial_product_definition
        .pricing
        .model,
      'recurring',
    )

    assert.equal(
      calls[0].args
        .p_payload
        .product_profiles[0]
        .commercial_product_definition
        .pricing
        .recurrence,
      'monthly',
    )
  },
)

test(
  'clonagem administrativa usa RPC V3 para preservar método e produto V2',
  async () => {
    const {
      client,
      calls,
    } = createRpcClient()

    await cloneCommercialConfigVersion(
      client,
      COMPANY_ID,
      CONFIG_ID,
    )

    assert.equal(
      calls.length,
      1,
    )

    assert.equal(
      calls[0].name,
      'rpc_clone_company_commercial_config_v3',
    )

    assert.deepEqual(
      calls[0].args,
      {
        p_company_id:
          COMPANY_ID,

        p_source_config_version_id:
          CONFIG_ID,
      },
    )
  },
)
