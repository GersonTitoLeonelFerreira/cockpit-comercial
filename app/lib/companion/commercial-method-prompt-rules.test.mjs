import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialMethodPromptRules,
  COMMERCIAL_METHOD_PROMPT_RULES_VERSION,
} from './commercial-method-prompt-rules.ts'

test(
  'método ausente proíbe invenção de etapas',
  () => {
    const rules =
      buildCommercialMethodPromptRules({
        configured: false,
        contract_version: null,
        name: null,
        description: null,
        principles: [],
        definition: null,
        steps: [],
      })

    assert.equal(
      COMMERCIAL_METHOD_PROMPT_RULES_VERSION,
      'commercial-method-prompt-rules-v1',
    )

    assert.match(
      rules,
      /Não invente etapas/,
    )
  },
)

test(
  'método legado continua estratégico sem virar checklist',
  () => {
    const rules =
      buildCommercialMethodPromptRules({
        configured: true,

        contract_version:
          'commercial-method-v1',

        name:
          'Venda consultiva',

        description:
          'Compreender antes de recomendar.',

        principles: [],
        definition: null,

        steps: [
          {
            step_order: 1,
            name: 'Descoberta',
            objective:
              'Compreender a necessidade.',
            completion_criteria: [
              'Necessidade compreendida.',
            ],
            recommended_questions: [
              'Qual é sua prioridade?',
            ],
            is_required: true,
          },
        ],
      })

    assert.match(
      rules,
      /nunca como roteiro mecânico/,
    )

    assert.match(
      rules,
      /Perguntas recomendadas são possibilidades/,
    )

    assert.match(
      rules,
      /Evite interrogatório/,
    )
  },
)

test(
  'método V2 ensina suficiência espera e encerramento da investigação',
  () => {
    const definition = {
      contract_version:
        'commercial-method-v2',

      name:
        'Método ATO',

      description:
        'Acolher, Tour e Obter.',

      principles: [
        'Perguntar somente quando a resposta puder alterar a decisão.',
        'Esperar é uma decisão comercial válida.',
      ],

      stages: [
        {
          key: 'tour',
          display_order: 1,
          name: 'Tour',

          objective:
            'Compreender o necessário.',

          requirement:
            'required',

          completion_criteria: [
            'Necessidade compreendida.',
          ],

          partial_completion_criteria: [],

          skip_conditions: [],

          recommended_questions: [],

          common_mistakes: [],

          deepen_when: [
            'Falta informação material.',
          ],

          sufficient_when: [
            'Já existe informação suficiente.',
          ],

          advance_when: [
            'Faz sentido avançar.',
          ],

          wait_when: [
            'O cliente informou que retornará.',
          ],

          stop_asking_when: [
            'Novas perguntas não alterariam a decisão.',
          ],

          dimensions: [
            {
              key: 'necessidade',
              name: 'Necessidade',

              objective:
                'Compreender o resultado buscado.',

              evidence_criteria: [
                'Necessidade identificada.',
              ],
            },
          ],
        },
      ],
    }

    const rules =
      buildCommercialMethodPromptRules({
        configured: true,

        contract_version:
          'commercial-method-v2',

        name:
          definition.name,

        description:
          definition.description,

        principles:
          definition.principles,

        definition,

        steps: [],
      })

    assert.match(
      rules,
      /sufficient_when/,
    )

    assert.match(
      rules,
      /stop_asking_when/,
    )

    assert.match(
      rules,
      /wait_when/,
    )

    assert.match(
      rules,
      /esperar ou dar espaço é uma decisão comercial válida/,
    )

    assert.match(
      rules,
      /dimensions são lentes internas/,
    )

    assert.match(
      rules,
      /Não invente pergunta, mensagem, compromisso, Agenda ou mudança de CRM/,
    )
  },
)
