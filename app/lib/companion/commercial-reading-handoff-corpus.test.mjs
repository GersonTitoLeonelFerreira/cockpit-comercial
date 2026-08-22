import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_READING_CONTRACT_VERSION,
  normalizeCommercialReading,
} from './commercial-reading-contract.ts'

const context = {
  available_message_ids: [
    'm1',
    'm2',
    'm3',
    'm4',
    'm5',
    'm6',
    'm7',
    'm8',
  ],

  available_memory_ids: [
    'mem-need',
    'mem-objection',
    'mem-commitment',
  ],

  current_crm_status:
    'respondeu',

  reference_time:
    '2026-08-20T17:00:00-03:00',
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

function buildBaseReading({
  commercialRole = 'buyer',
  commercialRelevance = 'commercial',
  decision = 'respond',
  channel = 'text',
  interventionNeeded = true,
  recommendedQuestion = null,
  recommendedMessage =
    'Posso te responder esse ponto agora.',
  analysisStatus = 'complete',
  analysisLimitations = [],
  methodConfigured = true,
  crmShouldChange = false,
  crmStatus = null,
  crmRationale = null,
  agendaShouldChange = false,
  agendaDate = null,
  agendaRationale = null,
} = {}) {
  return {
    contract_version:
      COMMERCIAL_READING_CONTRACT_VERSION,

    analysis_status:
      analysisStatus,

    analysis_limitations:
      analysisLimitations,

    commercial_role:
      commercialRole,

    commercial_relevance:
      commercialRelevance,

    conversation_summary: {
      initial_context:
        evidence(
          'A conversa começou com uma necessidade comercial identificável.',
          ['m1'],
        ),

      evolution:
        evidence(
          'A conversa evoluiu com novas informações do cliente.',
          ['m2'],
        ),

      important_events: [
        evidence(
          'O cliente trouxe informação relevante para a decisão.',
          ['m2'],
        ),
      ],

      current_state:
        evidence(
          'A conversa permanece aberta e exige uma decisão comercial contextual.',
          ['m4'],
        ),

      last_customer_request_or_decision:
        evidence(
          'A última manifestação do cliente precisa orientar o próximo movimento.',
          ['m4'],
        ),
    },

    customer: {
      objectives: [],
      problems: [],
      impacts: [],

      needs: [
        evidence(
          'Existe uma necessidade comercial ativa.',
          [],
          ['mem-need'],
        ),
      ],

      interests: [],

      decision_criteria: [],

      preferences: [],

      open_questions: [],

      objections: [],

      uncertainties: [],

      discussed_products: [],
      primary_product_interest: null,
      competitors: [],
      commitments: [],
      missing_discovery: [],
      resolved_information: [],
      superseded_information: [],

      communication: {
        events: [],
        patterns: [],
      },
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
          'Existe resposta comprovada do cliente.',

        evidence_message_ids: [
          'm2',
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
          'Ainda não existe decisão final comprovada.',

        evidence_message_ids: [],

        memory_ids: [],
      },
    ],

    method:
      methodConfigured
        ? {
            configured:
              true,

            name:
              'Método Comercial Configurado',

            stages: [
              {
                step_order:
                  1,

                stage_key:
                  'discovery',

                name:
                  'Descoberta',

                status:
                  'completed',

                explanation:
                  'A necessidade principal possui evidência suficiente.',

                evidence_message_ids: [
                  'm2',
                ],

                memory_ids: [],
              },

              {
                step_order:
                  2,

                stage_key:
                  'decision',

                name:
                  'Decisão',

                status:
                  'not_started',

                explanation:
                  'Ainda não existe decisão final comprovada.',

                evidence_message_ids: [],

                memory_ids: [],
              },
            ],

            current_stage: {
              step_order:
                2,

              stage_key:
                'decision',

              name:
                'Decisão',
            },

            adherence: {
              status:
                'on_method',

              summary:
                'A conversa permanece dentro do método e aguarda a etapa de decisão.',

              deviation_stage_order:
                null,

              what_happened:
                null,

              missing_information: [],

              why_it_matters:
                null,

              evidence_message_ids: [
                'm2',
              ],

              memory_ids: [],
            },

            recovery_guidance:
              null,
          }
        : {
            configured:
              false,

            name:
              null,

            stages: [],

            current_stage:
              null,

            adherence: {
              status:
                'not_configured',

              summary:
                'Método comercial não configurado.',

              deviation_stage_order:
                null,

              what_happened:
                null,

              missing_information: [],

              why_it_matters:
                null,

              evidence_message_ids: [],

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
          'O vendedor respondeu diretamente a uma pergunta anterior do cliente.',

        why_it_matters:
          'A resposta removeu uma dúvida concreta antes de avançar.',

        evidence_message_ids: [
          'm3',
        ],

        memory_ids: [],
      },
    ],

    improvement_points: [],

    risks: {
      customer_objections: [],

      service_risks: [],
    },

    best_approach: {
      decision,

      reason:
        'A decisão escolhida corresponde ao momento comercial comprovado.',

      channel,

      evidence_message_ids: [
        'm4',
      ],

      memory_ids: [],
    },

    communication: {
      intervention_needed:
        interventionNeeded,

      recommended_question:
        interventionNeeded
          ? recommendedQuestion
          : null,

      recommended_message:
        interventionNeeded
          ? recommendedMessage
          : null,
    },

    operations: {
      crm: {
        should_change_crm_stage:
          crmShouldChange,

        recommended_status:
          crmShouldChange
            ? crmStatus
            : null,

        rationale:
          crmShouldChange
            ? crmRationale
            : null,

        requires_human_confirmation:
          true,
      },

      agenda: {
        should_change_agenda:
          agendaShouldChange,

        expected_next_action_at:
          agendaShouldChange
            ? agendaDate
            : null,

        rationale:
          agendaShouldChange
            ? agendaRationale
            : null,

        requires_human_confirmation:
          true,
      },
    },

    evidence_message_ids: [
      ...context.available_message_ids,
    ],

    memory_ids: [
      ...context.available_memory_ids,
    ],
  }
}

const scenarios = [
  {
    id:
      'saas-pergunta-aberta',

    segment:
      'software-saas',

    expectedDecision:
      'respond',

    build() {
      const reading =
        buildBaseReading({
          decision:
            'respond',

          channel:
            'text',

          recommendedMessage:
            'Sim. Vou te explicar como essa funcionalidade opera.',
        })

      reading.customer.open_questions = [
        evidence(
          'O cliente perguntou como funciona uma funcionalidade da solução.',
          ['m4'],
        ),
      ]

      return reading
    },
  },

  {
    id:
      'consultoria-descoberta-incompleta',

    segment:
      'consultoria-b2b',

    expectedDecision:
      'deepen_discovery',

    build() {
      const reading =
        buildBaseReading({
          decision:
            'deepen_discovery',

          channel:
            'text',

          recommendedQuestion:
            'Qual impacto esse problema gera hoje na operação?',

          recommendedMessage:
            'Para eu entender melhor: qual impacto esse problema gera hoje na operação?',
        })

      reading.customer.uncertainties = [
        evidence(
          'O impacto operacional ainda não está comprovado.',
          ['m4'],
        ),
      ]

      return reading
    },
  },

  {
    id:
      'ecommerce-resistencia-preco',

    segment:
      'ecommerce',

    expectedDecision:
      'handle_objection',

    build() {
      const reading =
        buildBaseReading({
          decision:
            'handle_objection',

          channel:
            'text',

          recommendedQuestion:
            'Quando você diz que ficou caro, o que está pesando mais nessa comparação?',

          recommendedMessage:
            'Entendi. Quando você diz que ficou caro, o que está pesando mais nessa comparação?',
        })

      reading.customer.objections = [
        evidence(
          'O preço foi apresentado pelo cliente como bloqueio real.',
          ['m4'],
        ),
      ]

      reading.risks.customer_objections = [
        {
          kind:
            'price',

          severity:
            'medium',

          summary:
            'A resistência de preço permanece ativa.',

          evidence_message_ids: [
            'm4',
          ],

          memory_ids: [],
        },
      ]

      return reading
    },
  },

  {
    id:
      'industria-comparacao-tecnica',

    segment:
      'automacao-industrial',

    expectedDecision:
      'compare',

    build() {
      const reading =
        buildBaseReading({
          decision:
            'compare',

          channel:
            'document',

          recommendedMessage:
            'Vou comparar somente os critérios técnicos que conseguimos comprovar.',
        })

      reading.customer.decision_criteria = [
        evidence(
          'Compatibilidade técnica é um critério explícito da decisão.',
          ['m4'],
        ),
      ]

      return reading
    },
  },

  {
    id:
      'educacao-cliente-pediu-espaco',

    segment:
      'educacao-corporativa',

    expectedDecision:
      'give_space',

    expectedSilent:
      true,

    build() {
      return buildBaseReading({
        decision:
          'give_space',

        channel:
          'wait',

        interventionNeeded:
          false,
      })
    },
  },

  {
    id:
      'imobiliario-cliente-disse-que-retorna',

    segment:
      'imobiliario',

    expectedDecision:
      'wait',

    expectedSilent:
      true,

    build() {
      const reading =
        buildBaseReading({
          decision:
            'wait',

          channel:
            'wait',

          interventionNeeded:
            false,
        })

      reading.conversation_summary
        .last_customer_request_or_decision =
        evidence(
          'O cliente informou que retornará, mas não definiu data ou horário concreto.',
          ['m4'],
        )

      return reading
    },
  },

  {
    id:
      'servicos-momento-sem-ajuda-util',

    segment:
      'servicos-profissionais',

    expectedDecision:
      'no_intervention',

    expectedSilent:
      true,

    build() {
      return buildBaseReading({
        decision:
          'no_intervention',

        channel:
          'none',

        interventionNeeded:
          false,
      })
    },
  },

  {
    id:
      'fornecedor-nao-e-comprador',

    segment:
      'fornecedor-b2b',

    expectedDecision:
      'no_intervention',

    expectedSilent:
      true,

    expectedRole:
      'provider',

    build() {
      return buildBaseReading({
        commercialRole:
          'provider',

        decision:
          'no_intervention',

        channel:
          'none',

        interventionNeeded:
          false,

        methodConfigured:
          false,
      })
    },
  },

  {
    id:
      'contexto-insuficiente',

    segment:
      'atendimento-multissetorial',

    expectedDecision:
      'insufficient_information',

    expectedSilent:
      true,

    expectedAnalysisStatus:
      'limited',

    build() {
      return buildBaseReading({
        decision:
          'insufficient_information',

        channel:
          'none',

        interventionNeeded:
          false,

        analysisStatus:
          'limited',

        analysisLimitations: [
          'conversation_context_insufficient',
        ],
      })
    },
  },

  {
    id:
      'saude-agendamento-confirmado',

    segment:
      'servicos-de-saude',

    expectedDecision:
      'set_commitment',

    expectedAgendaChange:
      true,

    build() {
      const reading =
        buildBaseReading({
          decision:
            'set_commitment',

          channel:
            'text',

          recommendedMessage:
            'Perfeito. O próximo contato ficou confirmado para amanhã às 10h.',

          agendaShouldChange:
            true,

          agendaDate:
            '2026-08-21T10:00:00-03:00',

          agendaRationale:
            'Existe compromisso futuro com data e horário confirmados bilateralmente.',
        })

      reading.conversation_summary
        .last_customer_request_or_decision =
        evidence(
          'As duas partes confirmaram o contato para amanhã às 10h.',
          ['m4', 'm5'],
        )

      return reading
    },
  },

  {
    id:
      'logistica-recusa-definitiva',

    segment:
      'logistica',

    expectedDecision:
      'close',

    expectedSilent:
      true,

    build() {
      const reading =
        buildBaseReading({
          decision:
            'close',

          channel:
            'none',

          interventionNeeded:
            false,
        })

      reading.conversation_summary
        .last_customer_request_or_decision =
        evidence(
          'O cliente recusou explicitamente a continuidade da avaliação.',
          ['m4'],
        )

      return reading
    },
  },

  {
    id:
      'b2b-excecao-comercial',

    segment:
      'vendas-b2b',

    expectedDecision:
      'escalate',

    build() {
      const reading =
        buildBaseReading({
          decision:
            'escalate',

          channel:
            'text',

          recommendedMessage:
            'Vou validar essa condição internamente antes de te confirmar qualquer exceção.',
        })

      reading.risks.service_risks = [
        {
          kind:
            'promise_risk',

          severity:
            'high',

          summary:
            'Confirmar a exceção sem autorização criaria uma promessa comercial não comprovada.',

          evidence_message_ids: [
            'm3',
          ],

          memory_ids: [],
        },
      ]

      return reading
    },
  },
]

for (const scenario of scenarios) {
  test(
    `handoff B3 — ${scenario.id}`,
    () => {
      const normalized =
        normalizeCommercialReading(
          scenario.build(),
          context,
        )

      assert.equal(
        normalized
          .best_approach
          .decision,
        scenario.expectedDecision,
      )

      assert.equal(
        normalized.commercial_role,
        scenario.expectedRole ??
          'buyer',
      )

      assert.equal(
        normalized.analysis_status,
        scenario.expectedAnalysisStatus ??
          'complete',
      )

      if (
        scenario.expectedSilent ===
        true
      ) {
        assert.equal(
          normalized
            .communication
            .intervention_needed,
          false,
        )

        assert.equal(
          normalized
            .communication
            .recommended_question,
          null,
        )

        assert.equal(
          normalized
            .communication
            .recommended_message,
          null,
        )
      }

      assert.equal(
        normalized
          .operations
          .agenda
          .should_change_agenda,
        scenario.expectedAgendaChange ??
          false,
      )

      assert.equal(
        normalized
          .operations
          .crm
          .requires_human_confirmation,
        true,
      )

      assert.equal(
        normalized
          .operations
          .agenda
          .requires_human_confirmation,
        true,
      )
    },
  )
}

test(
  'handoff B3 entrega todos os blocos sem exigir interpretação paralela da interface',
  () => {
    const reading =
      normalizeCommercialReading(
        scenarios[0].build(),
        context,
      )

    const requiredBlocks = [
      'conversation_summary',
      'customer',
      'commercial_evolution',
      'method',
      'seller_strengths',
      'improvement_points',
      'risks',
      'best_approach',
      'communication',
      'operations',
    ]

    for (
      const block of
      requiredBlocks
    ) {
      assert.equal(
        Object.hasOwn(
          reading,
          block,
        ),
        true,
        `Bloco ausente: ${block}`,
      )
    }
  },
)

test(
  'handoff B3 mantém riscos do cliente separados de riscos do atendimento',
  () => {
    const reading =
      normalizeCommercialReading(
        scenarios[2].build(),
        context,
      )

    assert.equal(
      reading
        .risks
        .customer_objections
        .length,
      1,
    )

    assert.equal(
      reading
        .risks
        .service_risks
        .length,
      0,
    )

    const escalationReading =
      normalizeCommercialReading(
        scenarios[11].build(),
        context,
      )

    assert.equal(
      escalationReading
        .risks
        .customer_objections
        .length,
      0,
    )

    assert.equal(
      escalationReading
        .risks
        .service_risks
        .length,
      1,
    )
  },
)

test(
  'handoff B3 preserva ausência de método sem inventar etapas',
  () => {
    const reading =
      normalizeCommercialReading(
        scenarios[7].build(),
        context,
      )

    assert.equal(
      reading.method.configured,
      false,
    )

    assert.equal(
      reading.method.name,
      null,
    )

    assert.deepEqual(
      reading.method.stages,
      [],
    )
  },
)

test(
  'handoff B3 não transforma WAIT em Agenda sem compromisso concreto',
  () => {
    const reading =
      normalizeCommercialReading(
        scenarios[5].build(),
        context,
      )

    assert.equal(
      reading
        .best_approach
        .decision,
      'wait',
    )

    assert.equal(
      reading
        .operations
        .agenda
        .should_change_agenda,
      false,
    )

    assert.equal(
      reading
        .operations
        .agenda
        .expected_next_action_at,
      null,
    )
  },
)

test(
  'handoff B3 representa Agenda apenas quando o compromisso futuro está confirmado',
  () => {
    const reading =
      normalizeCommercialReading(
        scenarios[9].build(),
        context,
      )

    assert.equal(
      reading
        .operations
        .agenda
        .should_change_agenda,
      true,
    )

    assert.equal(
      reading
        .operations
        .agenda
        .expected_next_action_at,
      '2026-08-21T10:00:00-03:00',
    )

    assert.equal(
      reading
        .operations
        .agenda
        .requires_human_confirmation,
      true,
    )
  },
)

test(
  'corpus A4 é multissetorial e não depende de um nicho específico',
  () => {
    const segments =
      new Set(
        scenarios.map(
          scenario =>
            scenario.segment,
        ),
      )

    assert.equal(
      scenarios.length,
      12,
    )

    assert.equal(
      segments.size,
      12,
    )

    assert.ok(
      segments.has(
        'software-saas',
      ),
    )

    assert.ok(
      segments.has(
        'consultoria-b2b',
      ),
    )

    assert.ok(
      segments.has(
        'automacao-industrial',
      ),
    )

    assert.ok(
      segments.has(
        'logistica',
      ),
    )
  },
)

function assertNoUndefined(
  value,
  path = 'reading',
) {
  if (Array.isArray(value)) {
    value.forEach(
      (item, index) =>
        assertNoUndefined(
          item,
          `${path}[${index}]`,
        ),
    )

    return
  }

  if (
    value === null ||
    typeof value !== 'object'
  ) {
    assert.notEqual(
      value,
      undefined,
      `${path} não pode ser undefined`,
    )

    return
  }

  for (
    const [key, child] of
    Object.entries(value)
  ) {
    assert.notEqual(
      child,
      undefined,
      `${path}.${key} não pode ser undefined`,
    )

    assertNoUndefined(
      child,
      `${path}.${key}`,
    )
  }
}

test(
  'handoff serializável não contém campos undefined',
  () => {
    for (const scenario of scenarios) {
      const reading =
        normalizeCommercialReading(
          scenario.build(),
          context,
        )

      assertNoUndefined(
        reading,
      )

      const serialized =
        JSON.stringify(
          reading,
        )

      const reparsed =
        JSON.parse(
          serialized,
        )

      assert.equal(
        reparsed.contract_version,
        'commercial-reading-v1',
      )
    }
  },
)
