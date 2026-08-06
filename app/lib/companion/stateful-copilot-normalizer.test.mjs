import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  StatefulCopilotContractError,
  normalizeStatefulCopilotOutput,
} from './stateful-copilot-normalizer.ts'

const normalizationContext = {
  available_message_ids: [
    'm7',
    'm8',
  ],

  available_memory_ids: [
    'commitment-demo-1',
  ],

  expected_previous_state_version:
    3,

  current_crm_status:
    'negociacao',

  prohibited_statuses: [
    'ganho',
    'perdido',
  ],

  reference_time:
    '2026-08-05T21:00:00-03:00',
}

function buildValidOutput() {
  return {
    contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    previous_state_version:
      3,

    analyzed_message_ids: [
      'm7',
      'm8',
    ],

    commercial_role:
      'buyer',

    interpretation: {
      what_changed: {
        summary:
          'A cliente perguntou o preço e informou orçamento máximo de R$ 300 por mês.',

        evidence_message_ids: [
          'm8',
        ],
      },

      what_remains_valid: [
        {
          summary:
            'A demonstração permanece confirmada para o horário combinado.',

          evidence_message_ids: [],

          memory_ids: [
            'commitment-demo-1',
          ],
        },
      ],

      current_moment: {
        summary:
          'A cliente mantém a demonstração e quer compreender o investimento antes do encontro.',

        evidence_message_ids: [
          'm8',
        ],

        memory_ids: [
          'commitment-demo-1',
        ],
      },

      customer_need: {
        summary:
          'Entender se a solução e o investimento são adequados à operação e ao orçamento.',

        evidence_message_ids: [
          'm8',
        ],

        memory_ids: [],
      },

      uncertainties: [
        {
          summary:
            'O orçamento declarado ainda não comprova uma objeção definitiva.',

          evidence_message_ids: [
            'm8',
          ],

          memory_ids: [],
        },
      ],
    },

    state_patch: {
      facts_to_add: [
        {
          kind:
            'declared_budget',

          value:
            'R$ 300 por mês',

          summary:
            'A cliente informou orçamento máximo mensal de R$ 300.',

          confidence:
            'high',

          evidence_message_ids: [
            'm8',
          ],
        },
      ],

      fact_ids_to_supersede: [],

      needs_to_add: [],
      need_ids_to_resolve: [],

      open_loops_to_add: [
        {
          kind:
            'price_information',

          summary:
            'A pergunta sobre o preço ainda precisa ser conduzida.',

          evidence_message_ids: [
            'm8',
          ],
        },
      ],

      open_loop_ids_to_resolve: [],

      objections_to_add: [],
      objection_ids_to_resolve: [],

      commitments_to_upsert: [],

      signals_to_add: [
        {
          kind:
            'possible_price_sensitivity',

          summary:
            'O orçamento declarado pode influenciar a decisão.',

          confidence:
            'medium',

          evidence_message_ids: [
            'm8',
          ],
        },
      ],

      signal_ids_to_resolve: [],

      uncertainties_to_add: [
        {
          kind:
            'budget_not_definitive_objection',

          summary:
            'Ainda não está comprovado que o limite informado inviabiliza a contratação.',

          confidence:
            'medium',

          evidence_message_ids: [
            'm8',
          ],
        },
      ],

      uncertainty_ids_to_resolve: [],
    },

    strategy: {
      method_application:
        'Acolher a preocupação financeira, contextualizar o investimento e preservar a demonstração.',

      rationale:
        'A cliente adicionou uma condição financeira, mas manteve o compromisso e o interesse.',

      next_move:
        'Responder de forma consultiva sobre o investimento e reforçar por que a demonstração continua relevante.',

      recommended_question:
        null,

      suggested_message:
        'Entendi, Larissa. Vou considerar esse limite e, na demonstração, te mostrar de forma objetiva qual formato atende melhor à operação de vocês e qual é o investimento correspondente.',

      evidence_message_ids: [
        'm8',
      ],

      memory_ids: [
        'commitment-demo-1',
      ],
    },

    operational_suggestions: {
      crm: {
        should_change_crm_stage:
          false,

        recommended_status:
          null,

        rationale:
          null,

        requires_human_confirmation:
          true,
      },

      agenda: {
        should_change_agenda:
          false,

        expected_next_action_at:
          null,

        rationale:
          null,

        requires_human_confirmation:
          true,
      },
    },

    evidence_message_ids: [
      'm8',
    ],

    memory_ids: [
      'commitment-demo-1',
    ],
  }
}

function clone(
  value,
) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

function expectContractError(
  callback,
  expectedCode,
) {
  assert.throws(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          StatefulCopilotContractError,
      )

      assert.equal(
        error.code,
        expectedCode,
      )

      return true
    },
  )
}

test(
  'normaliza uma interpretação contextual com verdades simultâneas',
  () => {
    const normalized =
      normalizeStatefulCopilotOutput(
        buildValidOutput(),
        normalizationContext,
      )

    assert.equal(
      normalized.commercial_role,
      'buyer',
    )

    assert.equal(
      normalized.previous_state_version,
      3,
    )

    assert.equal(
      normalized
        .interpretation
        .what_remains_valid
        .length,
      1,
    )

    assert.deepEqual(
      normalized
        .interpretation
        .what_remains_valid[0]
        .evidence_message_ids,
      [],
    )

    assert.deepEqual(
      normalized
        .interpretation
        .what_remains_valid[0]
        .memory_ids,
      [
        'commitment-demo-1',
      ],
    )

    assert.equal(
      normalized
        .state_patch
        .open_loops_to_add[0]
        .kind,
      'price_information',
    )

    assert.equal(
      normalized
        .operational_suggestions
        .agenda
        .should_change_agenda,
      false,
    )
  },
)

test(
  'rejeita diagnóstico produzido para estado comercial antigo',
  () => {
    const candidate =
      buildValidOutput()

    candidate.previous_state_version =
      2

    expectContractError(
      () =>
        normalizeStatefulCopilotOutput(
          candidate,
          normalizationContext,
        ),
      'STALE_STATE_VERSION',
    )
  },
)

test(
  'rejeita evidência que não pertence às mensagens analisadas',
  () => {
    const candidate =
      buildValidOutput()

    candidate
      .interpretation
      .what_changed
      .evidence_message_ids = [
        'm9',
      ]

    expectContractError(
      () =>
        normalizeStatefulCopilotOutput(
          candidate,
          normalizationContext,
        ),
      'UNKNOWN_EVIDENCE',
    )
  },
)

test(
  'exige confirmação humana para sugestões operacionais',
  () => {
    const candidate =
      buildValidOutput()

    candidate
      .operational_suggestions
      .crm
      .requires_human_confirmation =
        false

    expectContractError(
      () =>
        normalizeStatefulCopilotOutput(
          candidate,
          normalizationContext,
        ),
      'HUMAN_CONFIRMATION_REQUIRED',
    )
  },
)

test(
  'fornecedor não pode receber avanço operacional comercial',
  () => {
    const candidate =
      buildValidOutput()

    candidate.commercial_role =
      'provider'

    candidate
      .operational_suggestions
      .crm = {
        should_change_crm_stage:
          true,

        recommended_status:
          'respondeu',

        rationale:
          'Avançar a oportunidade.',

        requires_human_confirmation:
          true,
      }

    expectContractError(
      () =>
        normalizeStatefulCopilotOutput(
          candidate,
          normalizationContext,
        ),
      'NON_BUYER_OPERATIONAL_CHANGE',
    )
  },
)

test(
  'fornecedor não pode receber pergunta ou mensagem persuasiva de venda',
  () => {
    const candidate =
      buildValidOutput()

    candidate.commercial_role =
      'provider'

    expectContractError(
      () =>
        normalizeStatefulCopilotOutput(
          candidate,
          normalizationContext,
        ),
      'NON_BUYER_SALES_GUIDANCE',
    )
  },
)

test(
  'rejeita sugestão de Agenda no passado',
  () => {
    const candidate =
      buildValidOutput()

    candidate
      .operational_suggestions
      .agenda = {
        should_change_agenda:
          true,

        expected_next_action_at:
          '2026-08-05T20:00:00-03:00',

        rationale:
          'Agendar a próxima ação.',

        requires_human_confirmation:
          true,
      }

    expectContractError(
      () =>
        normalizeStatefulCopilotOutput(
          candidate,
          normalizationContext,
        ),
      'AGENDA_DATE_NOT_FUTURE',
    )
  },
)

test(
  'rejeita horário de referência inválido',
  () => {
    const invalidContext = {
      ...normalizationContext,

      reference_time:
        'horario-invalido',
    }

    expectContractError(
      () =>
        normalizeStatefulCopilotOutput(
          buildValidOutput(),
          invalidContext,
        ),
      'INVALID_REFERENCE_TIME',
    )
  },
)

test(
  'rejeita referência a memória inexistente',
  () => {
    const candidate =
      buildValidOutput()

    candidate
      .interpretation
      .what_remains_valid[0]
      .memory_ids = [
        'memory-inexistente',
      ]

    expectContractError(
      () =>
        normalizeStatefulCopilotOutput(
          candidate,
          normalizationContext,
        ),
      'UNKNOWN_MEMORY_REFERENCE',
    )
  },
)

test(
  'conclusão contextual exige evidência atual ou memória anterior',
  () => {
    const candidate =
      buildValidOutput()

    candidate
      .interpretation
      .what_remains_valid[0]
      .evidence_message_ids = []

    candidate
      .interpretation
      .what_remains_valid[0]
      .memory_ids = []

    expectContractError(
      () =>
        normalizeStatefulCopilotOutput(
          candidate,
          normalizationContext,
        ),
      'EMPTY_CONTEXTUAL_GROUNDING',
    )
  },
)

test(
  'toda memória utilizada precisa aparecer no conjunto global',
  () => {
    const candidate =
      buildValidOutput()

    candidate.memory_ids = []

    expectContractError(
      () =>
        normalizeStatefulCopilotOutput(
          candidate,
          normalizationContext,
        ),
      'MISSING_GLOBAL_MEMORY_REFERENCE',
    )
  },
)

test(
  'toda evidência utilizada precisa aparecer no conjunto global',
  () => {
    const candidate =
      buildValidOutput()

    candidate.evidence_message_ids = [
      'm7',
    ]

    expectContractError(
      () =>
        normalizeStatefulCopilotOutput(
          candidate,
          normalizationContext,
        ),
      'MISSING_GLOBAL_EVIDENCE',
    )
  },
)
