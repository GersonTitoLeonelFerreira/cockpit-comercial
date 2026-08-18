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

function buildDraft() {
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

    product_profiles: [],

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
  'salvamento administrativo usa RPC V2 e envia a definição rica do método',
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
      'rpc_save_company_commercial_config_draft_v2',
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
  },
)

test(
  'clonagem administrativa usa RPC V2 para preservar o subcontrato do método',
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
      'rpc_clone_company_commercial_config_v2',
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
