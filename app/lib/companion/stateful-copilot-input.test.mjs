import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
} from './diagnostic-contract.ts'

import {
  COMPANION_DIAGNOSTIC_INPUT_VERSION,
} from './diagnostic-input.ts'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
} from './stateful-commercial-state.ts'

import {
  StatefulCommercialStateContractError,
} from './stateful-commercial-state-normalizer.ts'

import {
  STATEFUL_COPILOT_INPUT_VERSION,
  StatefulCopilotInputError,
  buildStatefulCopilotInput,
} from './stateful-copilot-input.ts'

const knownMessageIds = [
  'm1',
  'm2',
  'm3',
]

function buildDiagnosticInput() {
  return {
    input_version:
      COMPANION_DIAGNOSTIC_INPUT_VERSION,

    diagnostic_contract_version:
      COMPANION_DIAGNOSTIC_CONTRACT_VERSION,

    company_id:
      'company-1',

    cycle_id:
      'cycle-1',

    conversation_key:
      'conversation-1',

    current_crm_status:
      'negociacao',

    reference_time:
      '2026-08-05T22:30:00-03:00',

    analysis_precondition: {
      status:
        'ready',

      limitations: [],
    },

    conversation: {
      active_message_ids: [
        'm2',
        'm3',
      ],

      excluded_message_ids: [
        'm1',
      ],

      messages: [
        {
          id:
            'm2',

          message_key:
            'message-2',

          version:
            1,

          sequence:
            1,

          direction:
            'outgoing',

          occurred_at:
            '2026-08-05T22:10:00-03:00',

          observed_at:
            '2026-08-05T22:10:01-03:00',

          content_type:
            'text',

          text_content:
            'A demonstração está confirmada para amanhã.',

          audio_transcription:
            null,
        },
        {
          id:
            'm3',

          message_key:
            'message-3',

          version:
            1,

          sequence:
            2,

          direction:
            'incoming',

          occurred_at:
            '2026-08-05T22:15:00-03:00',

          observed_at:
            '2026-08-05T22:15:01-03:00',

          content_type:
            'text',

          text_content:
            'Certo. E quanto custa?',

          audio_transcription:
            null,
        },
      ],

      excluded_messages: [
        {
          id:
            'm1',

          message_key:
            'message-1',

          version:
            2,

          reason:
            'deleted',
        },
      ],
    },

    commercial_context: {
      configured:
        false,

      config_version_id:
        null,

      config_version_number:
        null,

      config_contract_version:
        null,

      business_description:
        null,

      target_audience:
        null,

      value_proposition:
        null,

      communication_tone:
        null,

      required_behaviors: [],
      prohibited_behaviors: [],

      sales_method: {
        configured:
          false,

        name:
          null,

        description:
          null,

        steps: [],
      },

      products: [],
      facts: [],
      objection_guides: [],
    },
  }
}

function buildPreviousState() {
  return {
    contract_version:
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,

    cycle_id:
      'cycle-1',

    version:
      2,

    commercial_role:
      'buyer',

    current_moment: {
      summary:
        'A oportunidade possuía um compromisso comercial em andamento.',

      evidence_message_ids: [
        'm1',
      ],
    },

    current_priority: {
      summary:
        'Preservar o contexto histórico antes de interpretar a fotografia nova.',

      evidence_message_ids: [
        'm1',
      ],
    },

    last_analyzed_message_ids: [
      'm1',
    ],

    last_evidence_message_ids: [
      'm1',
    ],

    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],

    created_at:
      '2026-08-05T21:00:00-03:00',

    updated_at:
      '2026-08-05T22:00:00-03:00',
  }
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

function expectInputError(
  callback,
  expectedCode,
) {
  assert.throws(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          StatefulCopilotInputError,
      )

      assert.equal(
        error.code,
        expectedCode,
      )

      return true
    },
  )
}

function expectStateError(
  callback,
  expectedCode,
) {
  assert.throws(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          StatefulCommercialStateContractError,
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
  'monta entrada inicial com versão alvo um',
  () => {
    const diagnosticInput =
      buildDiagnosticInput()

    const input =
      buildStatefulCopilotInput({
        diagnostic_input:
          diagnosticInput,

        previous_state:
          null,

        known_message_ids:
          knownMessageIds,
      })

    assert.equal(
      input.input_version,
      STATEFUL_COPILOT_INPUT_VERSION,
    )

    assert.equal(
      input.state_context.mode,
      'initial',
    )

    assert.equal(
      input
        .state_context
        .previous_state_version,
      null,
    )

    assert.equal(
      input
        .state_context
        .target_state_version,
      1,
    )

    assert.equal(
      input
        .state_context
        .previous_state,
      null,
    )
  },
)

test(
  'monta continuação usando o estado anterior validado',
  () => {
    const input =
      buildStatefulCopilotInput({
        diagnostic_input:
          buildDiagnosticInput(),

        previous_state:
          buildPreviousState(),

        known_message_ids:
          knownMessageIds,
      })

    assert.equal(
      input.state_context.mode,
      'continuation',
    )

    assert.equal(
      input
        .state_context
        .previous_state_version,
      2,
    )

    assert.equal(
      input
        .state_context
        .target_state_version,
      3,
    )

    assert.equal(
      input
        .state_context
        .previous_state
        .version,
      2,
    )
  },
)

test(
  'não modifica a fotografia nem o estado recebidos',
  () => {
    const diagnosticInput =
      buildDiagnosticInput()

    const previousState =
      buildPreviousState()

    const originalDiagnosticInput =
      clone(diagnosticInput)

    const originalPreviousState =
      clone(previousState)

    buildStatefulCopilotInput({
      diagnostic_input:
        diagnosticInput,

      previous_state:
        previousState,

      known_message_ids:
        knownMessageIds,
    })

    assert.deepEqual(
      diagnosticInput,
      originalDiagnosticInput,
    )

    assert.deepEqual(
      previousState,
      originalPreviousState,
    )
  },
)

test(
  'rejeita versão incompatível da entrada do diagnóstico',
  () => {
    const diagnosticInput =
      buildDiagnosticInput()

    diagnosticInput.input_version =
      'phase-5-input-invalida'

    expectInputError(
      () =>
        buildStatefulCopilotInput({
          diagnostic_input:
            diagnosticInput,

          previous_state:
            null,

          known_message_ids:
            knownMessageIds,
        }),
      'DIAGNOSTIC_INPUT_VERSION_MISMATCH',
    )
  },
)

test(
  'rejeita divergência entre IDs ativos e mensagens da fotografia',
  () => {
    const diagnosticInput =
      buildDiagnosticInput()

    diagnosticInput
      .conversation
      .active_message_ids = [
        'm2',
      ]

    expectInputError(
      () =>
        buildStatefulCopilotInput({
          diagnostic_input:
            diagnosticInput,

          previous_state:
            null,

          known_message_ids:
            knownMessageIds,
        }),
      'ACTIVE_MESSAGE_SNAPSHOT_MISMATCH',
    )
  },
)

test(
  'rejeita divergência entre IDs excluídos e mensagens excluídas',
  () => {
    const diagnosticInput =
      buildDiagnosticInput()

    diagnosticInput
      .conversation
      .excluded_message_ids = []

    expectInputError(
      () =>
        buildStatefulCopilotInput({
          diagnostic_input:
            diagnosticInput,

          previous_state:
            null,

          known_message_ids:
            knownMessageIds,
        }),
      'EXCLUDED_MESSAGE_SNAPSHOT_MISMATCH',
    )
  },
)

test(
  'mensagem não pode estar ativa e excluída simultaneamente',
  () => {
    const diagnosticInput =
      buildDiagnosticInput()

    diagnosticInput
      .conversation
      .excluded_message_ids = [
        'm1',
        'm2',
      ]

    diagnosticInput
      .conversation
      .excluded_messages
      .push({
        id:
          'm2',

        message_key:
          'message-2',

        version:
          2,

        reason:
          'deleted',
      })

    expectInputError(
      () =>
        buildStatefulCopilotInput({
          diagnostic_input:
            diagnosticInput,

          previous_state:
            null,

          known_message_ids:
            knownMessageIds,
        }),
      'MESSAGE_ACTIVE_AND_EXCLUDED',
    )
  },
)

test(
  'rejeita mensagem ativa desconhecida pelo ledger',
  () => {
    expectInputError(
      () =>
        buildStatefulCopilotInput({
          diagnostic_input:
            buildDiagnosticInput(),

          previous_state:
            null,

          known_message_ids: [
            'm1',
            'm2',
          ],
        }),
      'ACTIVE_MESSAGE_NOT_KNOWN',
    )
  },
)

test(
  'rejeita mensagem excluída desconhecida pelo ledger',
  () => {
    expectInputError(
      () =>
        buildStatefulCopilotInput({
          diagnostic_input:
            buildDiagnosticInput(),

          previous_state:
            null,

          known_message_ids: [
            'm2',
            'm3',
          ],
        }),
      'EXCLUDED_MESSAGE_NOT_KNOWN',
    )
  },
)

test(
  'rejeita estado anterior pertencente a outro ciclo',
  () => {
    const previousState =
      buildPreviousState()

    previousState.cycle_id =
      'cycle-2'

    expectStateError(
      () =>
        buildStatefulCopilotInput({
          diagnostic_input:
            buildDiagnosticInput(),

          previous_state:
            previousState,

          known_message_ids:
            knownMessageIds,
        }),
      'STATE_CYCLE_MISMATCH',
    )
  },
)

test(
  'rejeita fotografia anterior à atualização do estado',
  () => {
    const diagnosticInput =
      buildDiagnosticInput()

    diagnosticInput.reference_time =
      '2026-08-05T21:59:00-03:00'

    expectInputError(
      () =>
        buildStatefulCopilotInput({
          diagnostic_input:
            diagnosticInput,

          previous_state:
            buildPreviousState(),

          known_message_ids:
            knownMessageIds,
        }),
      'REFERENCE_TIME_BEFORE_STATE',
    )
  },
)

test(
  'rejeita identificadores conhecidos duplicados',
  () => {
    expectInputError(
      () =>
        buildStatefulCopilotInput({
          diagnostic_input:
            buildDiagnosticInput(),

          previous_state:
            null,

          known_message_ids: [
            'm1',
            'm2',
            'm2',
            'm3',
          ],
        }),
      'DUPLICATE_VALUE',
    )
  },
)

test(
  'aceita continuação bloqueada sem mensagens atualmente ativas',
  () => {
    const diagnosticInput =
      buildDiagnosticInput()

    diagnosticInput
      .analysis_precondition
      .status =
        'blocked'

    diagnosticInput
      .analysis_precondition
      .limitations = [
        'Não existem mensagens ativas utilizáveis.',
      ]

    diagnosticInput
      .conversation
      .active_message_ids = []

    diagnosticInput
      .conversation
      .messages = []

    const input =
      buildStatefulCopilotInput({
        diagnostic_input:
          diagnosticInput,

        previous_state:
          buildPreviousState(),

        known_message_ids:
          knownMessageIds,
      })

    assert.equal(
      input.state_context.mode,
      'continuation',
    )

    assert.equal(
      input
        .state_context
        .previous_state_version,
      2,
    )

    assert.deepEqual(
      input
        .diagnostic_input
        .conversation
        .active_message_ids,
      [],
    )
  },
)

test(
  'rejeita IDs duplicados nas mensagens canônicas',
  () => {
    const diagnosticInput =
      buildDiagnosticInput()

    diagnosticInput
      .conversation
      .messages[1]
      .id =
        'm2'

    expectInputError(
      () =>
        buildStatefulCopilotInput({
          diagnostic_input:
            diagnosticInput,

          previous_state:
            null,

          known_message_ids:
            knownMessageIds,
        }),
      'DUPLICATE_MESSAGE_ID',
    )
  },
)
