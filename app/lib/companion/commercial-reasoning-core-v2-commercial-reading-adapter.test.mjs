import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialReasoningCoreV2CommercialReading,
} from './commercial-reasoning-core-v2-commercial-reading-adapter.ts'

function buildPreviousState() {
  return {
    contract_version:
      'phase-5.1-commercial-state-v1',

    cycle_id:
      'cycle-a',

    version:
      1,

    commercial_role:
      'buyer',

    current_moment: {
      summary:
        'Estado anterior.',
      evidence_message_ids:
        [],
    },

    current_priority: {
      summary:
        'Prioridade anterior.',
      evidence_message_ids:
        [],
    },

    last_analyzed_message_ids:
      [],

    last_evidence_message_ids:
      [],

    facts: [
      {
        id:
          'memory-preference',

        kind:
          'client.preference',

        value:
          'Prefere atendimento pela manhã.',

        summary:
          'Prefere atendimento pela manhã.',

        confidence:
          'high',

        evidence_message_ids:
          [],

        memory_status:
          'active',

        created_in_state_version:
          1,

        updated_in_state_version:
          1,

        closed_in_state_version:
          null,
      },
    ],

    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],

    created_at:
      '2026-09-13T16:00:00-03:00',

    updated_at:
      '2026-09-13T16:00:00-03:00',
  }
}

function buildInput({
  previousState = null,
  methodConfigured = false,
} = {}) {
  return {
    diagnostic_input: {
      cycle_id:
        'cycle-a',

      reference_time:
        '2026-09-13T18:00:00-03:00',

      current_crm_status:
        'negociacao',

      conversation: {
        active_message_ids: [
          'm1',
          'm2',
        ],

        messages: [
          {
            id:
              'm1',

            direction:
              'outgoing',
          },
          {
            id:
              'm2',

            direction:
              'incoming',
          },
        ],
      },

      commercial_context: {
        products:
          [],

        sales_method:
          methodConfigured
            ? {
                configured:
                  true,

                contract_version:
                  'commercial-method-v2',

                name:
                  'Método Yolen',

                description:
                  'Método comercial configurado.',

                principles:
                  [],

                definition:
                  null,

                steps: [
                  {
                    step_order:
                      1,

                    name:
                      'Descoberta',

                    objective:
                      'Entender a necessidade.',

                    completion_criteria: [
                      'Necessidade compreendida.',
                    ],

                    recommended_questions:
                      [],

                    is_required:
                      true,
                  },
                ],
              }
            : {
                configured:
                  false,

                contract_version:
                  null,

                name:
                  null,

                description:
                  null,

                principles:
                  [],

                definition:
                  null,

                steps:
                  [],
              },
      },
    },

    state_context: {
      previous_state:
        previousState,
    },
  }
}

function buildOutput({
  role = 'buyer',
  relevance = 'commercial',
  action = 'schedule',
  interventionNeeded = true,
  methodConfigured = false,
  methodStage = null,
  methodAdherence =
    methodConfigured
      ? 'on_method'
      : 'not_configured',
  methodEvidence = [],
  strengths = [],
  improvementPoints = [],
} = {}) {
  return {
    contract_version:
      'commercial-reasoning-core-v2',

    status:
      'ready',

    commercial_role:
      role,

    commercial_relevance:
      relevance,

    situation: {
      summary:
        'O cliente definiu o próximo passo.',

      customer_intent:
        role === 'buyer'
          ? 'Avançar na contratação.'
          : null,

      commercial_stage:
        'decisao',

      confidence:
        'high',

      evidence_message_ids: [
        'm2',
      ],
    },

    responsibility: {
      waiting_on:
        role === 'buyer'
          ? 'seller'
          : 'none',

      summary:
        'O próximo passo está definido.',

      evidence_message_ids: [
        'm2',
      ],
    },

    decision: {
      action,

      objective:
        'Executar o próximo passo sem reiniciar descoberta.',

      reason:
        'A intenção atual está clara.',

      evidence_message_ids: [
        'm2',
      ],
    },

    coaching: {
      strengths,

      improvement_points:
        improvementPoints,
    },

    method: {
      configured:
        methodConfigured,

      name:
        methodConfigured
          ? 'Método Yolen'
          : null,

      current_stage:
        methodStage,

      adherence:
        methodAdherence,

      deviation:
        null,

      recovery_move:
        null,

      evidence_message_ids:
        methodEvidence,
    },

    technique: {
      name:
        null,

      why_applicable:
        null,

      do_not_do:
        [],
    },

    communication: {
      intervention_needed:
        interventionNeeded,

      recommended_question:
        null,

      suggested_message:
        'Vou avançar com o próximo passo e te atualizo.',
    },

    factuality: {
      facts_used: [
        {
          summary:
            'O cliente declarou intenção de avançar.',

          evidence_message_ids: [
            'm2',
          ],
        },
      ],

      unknowns:
        [],
    },

    evidence_message_ids: [
      'm1',
      'm2',
    ],
  }
}

test(
  'adapter produz Commercial Reading canônica para buyer commercial',
  () => {
    const result =
      buildCommercialReasoningCoreV2CommercialReading({
        input:
          buildInput(),

        output:
          buildOutput(),
      })

    assert.equal(
      result
        .reading
        .contract_version,
      'commercial-reading-v1',
    )

    assert.equal(
      result
        .reading
        .commercial_role,
      'buyer',
    )

    assert.equal(
      result
        .reading
        .commercial_relevance,
      'commercial',
    )

    assert.equal(
      result
        .reading
        .best_approach
        .decision,
      'set_commitment',
    )

    assert.equal(
      result
        .reading
        .communication
        .intervention_needed,
      true,
    )

    assert.equal(
      result
        .reading
        .communication
        .recommended_message,
      'Vou avançar com o próximo passo e te atualizo.',
    )

    assert.equal(
      result
        .reading
        .operations
        .crm
        .should_change_crm_stage,
      false,
    )

    assert.equal(
      result
        .report
        .writes_new_customer_memory,
      false,
    )
  },
)

test(
  'adapter preserva memória CLIENTE existente sem inventar state patch',
  () => {
    const result =
      buildCommercialReasoningCoreV2CommercialReading({
        input:
          buildInput({
            previousState:
              buildPreviousState(),
          }),

        output:
          buildOutput(),
      })

    assert.equal(
      result
        .report
        .customer_memory_mode,
      'previous_state_preserved',
    )

    assert.equal(
      result
        .report
        .writes_new_customer_memory,
      false,
    )

    assert.equal(
      result
        .reading
        .customer
        .preferences
        .length,
      1,
    )

    assert.equal(
      result
        .reading
        .customer
        .preferences[0]
        .summary,
      'Prefere atendimento pela manhã.',
    )

    assert.deepEqual(
      result
        .reading
        .customer
        .preferences[0]
        .memory_ids,
      [
        'memory-preference',
      ],
    )
  },
)

test(
  'adapter preserva coaching suportado e remove elogio sem evidência do vendedor',
  () => {
    const result =
      buildCommercialReasoningCoreV2CommercialReading({
        input:
          buildInput(),

        output:
          buildOutput({
            strengths: [
              {
                kind:
                  'good_discovery',

                summary:
                  'O vendedor fez uma pergunta objetiva.',

                why_it_matters:
                  'A pergunta reduziu ambiguidade.',

                evidence_message_ids: [
                  'm1',
                ],
              },
              {
                kind:
                  'answered_question',

                summary:
                  'Elogio sem evidência outgoing.',

                why_it_matters:
                  'Não deve sobreviver.',

                evidence_message_ids: [
                  'm2',
                ],
              },
            ],

            improvementPoints: [
              {
                kind:
                  'loss_of_context',

                summary:
                  'Houve perda de continuidade.',

                why_it_matters:
                  'Aumenta fricção.',

                impact:
                  'Pode atrasar a decisão.',

                how_to_improve:
                  'Retomar do ponto já resolvido.',

                evidence_message_ids: [
                  'm2',
                ],
              },
            ],
          }),
      })

    assert.equal(
      result
        .reading
        .seller_strengths
        .length,
      1,
    )

    assert.equal(
      result
        .reading
        .seller_strengths[0]
        .kind,
      'good_discovery',
    )

    assert.equal(
      result
        .reading
        .improvement_points
        .length,
      1,
    )

    assert.equal(
      result
        .reading
        .improvement_points[0]
        .kind,
      'other',
    )

    assert.equal(
      result
        .report
        .dropped_seller_strengths,
      1,
    )
  },
)

test(
  'adapter projeta etapa canônica do método quando há correspondência e evidência',
  () => {
    const result =
      buildCommercialReasoningCoreV2CommercialReading({
        input:
          buildInput({
            methodConfigured:
              true,
          }),

        output:
          buildOutput({
            methodConfigured:
              true,

            methodStage:
              'Descoberta',

            methodAdherence:
              'on_method',

            methodEvidence: [
              'm1',
            ],
          }),
      })

    assert.equal(
      result
        .report
        .method_projection,
      'mapped',
    )

    assert.equal(
      result
        .reading
        .method
        .configured,
      true,
    )

    assert.equal(
      result
        .reading
        .method
        .current_stage
        .step_order,
      1,
    )

    assert.equal(
      result
        .reading
        .method
        .current_stage
        .name,
      'Descoberta',
    )

    assert.equal(
      result
        .reading
        .method
        .stages[0]
        .status,
      'active',
    )

    assert.equal(
      result
        .reading
        .method
        .adherence
        .status,
      'on_method',
    )
  },
)

test(
  'adapter degrada método para insufficient evidence quando etapa não é canônica',
  () => {
    const result =
      buildCommercialReasoningCoreV2CommercialReading({
        input:
          buildInput({
            methodConfigured:
              true,
          }),

        output:
          buildOutput({
            methodConfigured:
              true,

            methodStage:
              'Etapa inexistente',

            methodAdherence:
              'on_method',

            methodEvidence: [
              'm1',
            ],
          }),
      })

    assert.equal(
      result
        .report
        .method_projection,
      'insufficient_evidence',
    )

    assert.equal(
      result
        .reading
        .method
        .adherence
        .status,
      'insufficient_evidence',
    )

    assert.equal(
      result
        .reading
        .method
        .current_stage,
      null,
    )
  },
)

test(
  'provider commercial é neutralizado pela Commercial Reading canônica',
  () => {
    const result =
      buildCommercialReasoningCoreV2CommercialReading({
        input:
          buildInput(),

        output:
          buildOutput({
            role:
              'provider',

            relevance:
              'commercial',

            action:
              'present_solution',

            interventionNeeded:
              true,
          }),
      })

    assert.equal(
      result
        .reading
        .commercial_role,
      'provider',
    )

    assert.equal(
      result
        .reading
        .commercial_relevance,
      'commercial',
    )

    assert.equal(
      result
        .reading
        .best_approach
        .decision,
      'no_intervention',
    )

    assert.equal(
      result
        .reading
        .communication
        .intervention_needed,
      false,
    )

    assert.equal(
      result
        .reading
        .communication
        .recommended_message,
      null,
    )
  },
)
