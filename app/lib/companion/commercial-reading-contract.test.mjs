import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_READING_CHANNELS,
  COMMERCIAL_READING_CONTRACT_VERSION,
  COMMERCIAL_READING_DECISIONS,
  COMMERCIAL_READING_METHOD_STATUSES,
  CommercialReadingContractError,
  normalizeCommercialReading,
} from './commercial-reading-contract.ts'

const context = {
  available_message_ids: [
    'm1',
    'm2',
    'm3',
    'm4',
    'm5',
  ],

  available_memory_ids: [
    'mem-need',
    'mem-objection',
  ],

  current_crm_status:
    'respondeu',

  reference_time:
    '2026-08-20T16:00:00-03:00',
}

function evidence(
  summary,
  messageIds = ['m1'],
  memoryIds = [],
) {
  return {
    summary,

    evidence_message_ids:
      messageIds,

    memory_ids:
      memoryIds,
  }
}

function buildValidReading() {
  return {
    contract_version:
      COMMERCIAL_READING_CONTRACT_VERSION,

    analysis_status:
      'complete',

    analysis_limitations: [],

    commercial_role:
      'buyer',

    commercial_relevance:
      'commercial',

    conversation_summary: {
      initial_context:
        evidence(
          'O cliente iniciou buscando uma solução para organizar o processo comercial.',
          [],
          ['mem-need'],
        ),

      evolution:
        evidence(
          'A conversa avançou da descoberta para avaliação da solução.',
          ['m1', 'm2'],
        ),

      important_events: [
        evidence(
          'O cliente informou o principal problema operacional.',
          ['m1'],
        ),
      ],

      current_state:
        evidence(
          'O cliente está avaliando a solução e possui uma dúvida comercial aberta.',
          ['m4'],
        ),

      last_customer_request_or_decision:
        evidence(
          'O cliente pediu esclarecimento sobre a condição comercial.',
          ['m4'],
        ),
    },

    customer: {
      needs: [
        evidence(
          'Reduzir perda de follow-up.',
          [],
          ['mem-need'],
        ),
      ],

      interests: [
        evidence(
          'Automatizar acompanhamento comercial.',
          ['m1'],
        ),
      ],

      decision_criteria: [
        evidence(
          'A implantação precisa caber na rotina da equipe.',
          ['m2'],
        ),
      ],

      preferences: [],

      open_questions: [
        evidence(
          'A condição comercial ainda precisa ser esclarecida.',
          ['m4'],
        ),
      ],

      objections: [
        evidence(
          'Existe resistência relacionada ao investimento.',
          [],
          ['mem-objection'],
        ),
      ],

      uncertainties: [],
    },

    commercial_evolution: [
      {
        key:
          'customer_replied',

        label:
          'Cliente respondeu',

        status:
          'completed',

        explanation:
          'Há resposta explícita do cliente.',

        evidence_message_ids: [
          'm1',
        ],

        memory_ids: [],
      },
      {
        key:
          'decision_pending',

        label:
          'Decisão pendente',

        status:
          'pending',

        explanation:
          'Ainda não existe decisão comprovada.',

        evidence_message_ids: [],

        memory_ids: [],
      },
    ],

    method: {
      configured:
        true,

      name:
        'Método ATO',

      stages: [
        {
          step_order:
            1,

          stage_key:
            'acolher',

          name:
            'Acolher',

          status:
            'completed',

          explanation:
            'O contexto inicial foi compreendido.',

          evidence_message_ids: [
            'm1',
          ],

          memory_ids: [],
        },
        {
          step_order:
            2,

          stage_key:
            'tour',

          name:
            'Tour',

          status:
            'partial',

          explanation:
            'A necessidade foi identificada, mas ainda existe critério aberto.',

          evidence_message_ids: [
            'm2',
          ],

          memory_ids: [],
        },
        {
          step_order:
            3,

          stage_key:
            'obter',

          name:
            'Obter',

          status:
            'not_started',

          explanation:
            'Não existe evidência de etapa de decisão.',

          evidence_message_ids: [],

          memory_ids: [],
        },
      ],

      current_stage: {
        step_order:
          2,

        stage_key:
          'tour',

        name:
          'Tour',
      },

      adherence: {
        status:
          'on_method',

        summary:
          'A conversa permanece dentro do método e está aprofundando a descoberta.',

        deviation_stage_order:
          null,

        what_happened:
          null,

        missing_information: [],

        why_it_matters:
          null,

        evidence_message_ids: [
          'm1',
          'm2',
        ],

        memory_ids: [],
      },

      recovery_guidance:
        null,
    },

    seller_strengths: [
      {
        kind:
          'answered_question',

        summary:
          'O vendedor respondeu diretamente à dúvida inicial do cliente.',

        why_it_matters:
          'A resposta removeu uma dúvida antes de qualquer novo avanço.',

        evidence_message_ids: [
          'm3',
        ],

        memory_ids: [],
      },
    ],

    improvement_points: [
      {
        kind:
          'pressure',

        summary:
          'O vendedor retomou avanço antes de concluir uma dúvida aberta.',

        why_it_matters:
          'Perguntas abertas precisam ser resolvidas antes de pedir nova decisão.',

        impact:
          'Pode aumentar resistência e reduzir confiança.',

        how_to_improve:
          'Responder à dúvida aberta e confirmar se o cliente compreendeu antes de avançar.',

        evidence_message_ids: [
          'm3',
        ],

        memory_ids: [],
      },
    ],

    risks: {
      customer_objections: [
        {
          kind:
            'price',

          severity:
            'medium',

          summary:
            'A objeção de investimento permanece ativa.',

          evidence_message_ids: [],

          memory_ids: [
            'mem-objection',
          ],
        },
      ],

      service_risks: [
        {
          kind:
            'pressure',

          severity:
            'medium',

          summary:
            'Existe risco de pressão comercial prematura.',

          evidence_message_ids: [
            'm3',
          ],

          memory_ids: [],
        },
      ],
    },

    best_approach: {
      decision:
        'respond',

      reason:
        'A dúvida aberta do cliente deve ser respondida antes de qualquer novo avanço.',

      channel:
        'text',

      evidence_message_ids: [
        'm4',
      ],

      memory_ids: [],
    },

    communication: {
      intervention_needed:
        true,

      recommended_question:
        null,

      recommended_message:
        'Claro. Vou esclarecer essa condição para você.',
    },

    operations: {
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
      'm1',
      'm2',
      'm3',
      'm4',
    ],

    memory_ids: [
      'mem-need',
      'mem-objection',
    ],
  }
}

function expectError(
  callback,
  code,
) {
  assert.throws(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          CommercialReadingContractError,
      )

      assert.equal(
        error.code,
        code,
      )

      return true
    },
  )
}

test(
  'contrato representa os dez blocos da leitura comercial completa',
  () => {
    const reading =
      normalizeCommercialReading(
        buildValidReading(),
        context,
      )

    assert.equal(
      reading.contract_version,
      'commercial-reading-v1',
    )

    assert.ok(
      reading.conversation_summary,
    )

    assert.ok(
      reading.customer,
    )

    assert.ok(
      reading.commercial_evolution,
    )

    assert.ok(
      reading.method,
    )

    assert.ok(
      reading.seller_strengths,
    )

    assert.ok(
      reading.improvement_points,
    )

    assert.ok(
      reading.risks,
    )

    assert.ok(
      reading.best_approach,
    )

    assert.ok(
      reading.communication,
    )

    assert.ok(
      reading.operations,
    )
  },
)

test(
  'taxonomia de decisão inclui espera espaço silêncio e escalonamento',
  () => {
    for (
      const decision of [
        'wait',
        'give_space',
        'no_intervention',
        'escalate',
      ]
    ) {
      assert.ok(
        COMMERCIAL_READING_DECISIONS
          .includes(decision),
      )
    }

    assert.ok(
      COMMERCIAL_READING_CHANNELS
        .includes('wait'),
    )

    assert.ok(
      COMMERCIAL_READING_CHANNELS
        .includes('none'),
    )
  },
)

test(
  'método possui estados explícitos sem obrigar avanço',
  () => {
    for (
      const status of [
        'completed',
        'active',
        'partial',
        'not_started',
        'skipped',
      ]
    ) {
      assert.ok(
        COMMERCIAL_READING_METHOD_STATUSES
          .includes(status),
      )
    }

    const reading =
      normalizeCommercialReading(
        buildValidReading(),
        context,
      )

    assert.equal(
      reading.method
        .stages[2]
        .status,
      'not_started',
    )
  },
)

test(
  'acerto do vendedor exige ação concreta e evidência da conversa',
  () => {
    for (
      const genericPraise of [
        'Bom atendimento.',
        'Boa comunicação.',
        'Excelente condução.',
      ]
    ) {
      const reading =
        buildValidReading()

      reading
        .seller_strengths[0]
        .summary =
          genericPraise

      expectError(
        () =>
          normalizeCommercialReading(
            reading,
            context,
          ),
        'GENERIC_SELLER_PRAISE',
      )
    }

    const withoutEvidence =
      buildValidReading()

    withoutEvidence
      .seller_strengths[0]
      .evidence_message_ids = []

    expectError(
      () =>
        normalizeCommercialReading(
          withoutEvidence,
          context,
        ),
      'DIRECT_EVIDENCE_REQUIRED',
    )

    expectError(
      () =>
        normalizeCommercialReading(
          buildValidReading(),
          {
            ...context,
            seller_message_ids: [
              'm5',
            ],
          },
        ),
      'SELLER_EVIDENCE_REQUIRED',
    )
  },
)

test(
  'ponto de melhoria exige problema comprovado em mensagem',
  () => {
    const reading =
      buildValidReading()

    reading
      .improvement_points[0]
      .evidence_message_ids = []

    expectError(
      () =>
        normalizeCommercialReading(
          reading,
          context,
        ),
      'DIRECT_EVIDENCE_REQUIRED',
    )
  },
)

test(
  'riscos do cliente e riscos do atendimento permanecem separados',
  () => {
    const reading =
      normalizeCommercialReading(
        buildValidReading(),
        context,
      )

    assert.equal(
      reading.risks
        .customer_objections[0]
        .kind,
      'price',
    )

    assert.equal(
      reading.risks
        .service_risks[0]
        .kind,
      'pressure',
    )
  },
)

test(
  'WAIT e NO_INTERVENTION são decisões de primeira classe',
  () => {
    const waitReading =
      buildValidReading()

    waitReading.best_approach = {
      decision:
        'wait',

      reason:
        'O cliente informou que retornará após decidir internamente.',

      channel:
        'wait',

      evidence_message_ids: [
        'm4',
      ],

      memory_ids: [],
    }

    waitReading.communication = {
      intervention_needed:
        false,

      recommended_question:
        null,

      recommended_message:
        null,
    }

    const normalizedWait =
      normalizeCommercialReading(
        waitReading,
        context,
      )

    assert.equal(
      normalizedWait
        .best_approach
        .decision,
      'wait',
    )

    const silentReading =
      buildValidReading()

    silentReading.best_approach = {
      decision:
        'no_intervention',

      reason:
        'Nenhuma intervenção acrescenta valor neste momento.',

      channel:
        'none',

      evidence_message_ids: [
        'm4',
      ],

      memory_ids: [],
    }

    silentReading.communication = {
      intervention_needed:
        false,

      recommended_question:
        null,

      recommended_message:
        null,
    }

    const normalizedSilent =
      normalizeCommercialReading(
        silentReading,
        context,
      )

    assert.equal(
      normalizedSilent
        .communication
        .recommended_message,
      null,
    )
  },
)

test(
  'NO_INTERVENTION não aceita mensagem escondida',
  () => {
    const reading =
      buildValidReading()

    reading.best_approach = {
      decision:
        'no_intervention',

      reason:
        'A melhor decisão é não intervir.',

      channel:
        'none',

      evidence_message_ids: [
        'm4',
      ],

      memory_ids: [],
    }

    reading.communication = {
      intervention_needed:
        false,

      recommended_question:
        null,

      recommended_message:
        'Mensagem indevida.',
    }

    expectError(
      () =>
        normalizeCommercialReading(
          reading,
          context,
        ),
      'SILENT_COMMUNICATION_REQUIRED',
    )
  },
)

test(
  'CRM e Agenda sempre exigem confirmação humana',
  () => {
    const crmReading =
      buildValidReading()

    crmReading
      .operations
      .crm
      .requires_human_confirmation =
        false

    expectError(
      () =>
        normalizeCommercialReading(
          crmReading,
          context,
        ),
      'HUMAN_CONFIRMATION_REQUIRED',
    )

    const agendaReading =
      buildValidReading()

    agendaReading
      .operations
      .agenda
      .requires_human_confirmation =
        false

    expectError(
      () =>
        normalizeCommercialReading(
          agendaReading,
          context,
        ),
      'HUMAN_CONFIRMATION_REQUIRED',
    )
  },
)

test(
  'Agenda só aceita consequência futura concreta',
  () => {
    const reading =
      buildValidReading()

    reading.operations.agenda = {
      should_change_agenda:
        true,

      expected_next_action_at:
        '2026-08-20T15:00:00-03:00',

      rationale:
        'Compromisso confirmado.',

      requires_human_confirmation:
        true,
    }

    expectError(
      () =>
        normalizeCommercialReading(
          reading,
          context,
        ),
      'AGENDA_DATE_NOT_FUTURE',
    )
  },
)

test(
  'leitura limitada precisa declarar a limitação sem inventar completude',
  () => {
    const reading =
      buildValidReading()

    reading.analysis_status =
      'limited'

    reading.analysis_limitations = [
      'conversation_context_insufficient',
    ]

    const normalized =
      normalizeCommercialReading(
        reading,
        context,
      )

    assert.deepEqual(
      normalized.analysis_limitations,
      [
        'conversation_context_insufficient',
      ],
    )

    reading.analysis_limitations = []

    expectError(
      () =>
        normalizeCommercialReading(
          reading,
          context,
        ),
      'LIMITED_WITHOUT_LIMITATION',
    )
  },
)

test(
  'toda evidência e memória usada precisa estar declarada globalmente',
  () => {
    const evidenceReading =
      buildValidReading()

    evidenceReading
      .evidence_message_ids =
        evidenceReading
          .evidence_message_ids
          .filter(
            id => id !== 'm4',
          )

    expectError(
      () =>
        normalizeCommercialReading(
          evidenceReading,
          context,
        ),
      'MISSING_GLOBAL_EVIDENCE',
    )

    const memoryReading =
      buildValidReading()

    memoryReading.memory_ids = [
      'mem-need',
    ]

    expectError(
      () =>
        normalizeCommercialReading(
          memoryReading,
          context,
        ),
      'MISSING_GLOBAL_MEMORY',
    )
  },
)
