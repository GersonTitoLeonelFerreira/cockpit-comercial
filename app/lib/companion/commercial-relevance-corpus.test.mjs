import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COMMERCIAL_RELEVANCES,
} from './commercial-relevance.ts'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  normalizeStatefulCopilotOutput,
} from './stateful-copilot-normalizer.ts'

const CORPUS = [
  {
    id:
      'fully-personal',
    coverage:
      'conversa 100% pessoal',
    conversation:
      'Falamos sobre o almoço, a rotina de casa e o descanso do fim do dia.',
    relevance:
      'non_commercial',
  },
  {
    id:
      'personal-isolated-price-word',
    coverage:
      'pessoal + palavra de preço isolada',
    conversation:
      'O preço do almoço aumentou; depois te conto como ficou a receita.',
    relevance:
      'non_commercial',
  },
  {
    id:
      'job-resume',
    coverage:
      'emprego/currículo',
    conversation:
      'Vi uma vaga interessante e mais tarde envio meu currículo para revisão.',
    relevance:
      'non_commercial',
  },
  {
    id:
      'commercial-to-personal',
    coverage:
      'comercial → pessoal',
    conversation:
      'A proposta ficou no histórico; nesta sessão falamos apenas da rotina de casa.',
    relevance:
      'non_commercial',
  },
  {
    id:
      'personal-to-commercial',
    coverage:
      'pessoal → comercial',
    conversation:
      'Depois do assunto pessoal, o contato perguntou: sobre o plano que você me passou ontem, consigo fechar hoje?',
    relevance:
      'commercial',
  },
  {
    id:
      'personal-commitment',
    coverage:
      'compromisso pessoal',
    conversation:
      'Mais tarde mando a foto e depois preparo o jantar.',
    relevance:
      'non_commercial',
  },
  {
    id:
      'commercial-commitment',
    coverage:
      'compromisso comercial',
    conversation:
      'Combinado: amanhã envio os dados para concluir a contratação do plano.',
    relevance:
      'commercial',
  },
  {
    id:
      'personal-schedule',
    coverage:
      'agendamento pessoal',
    conversation:
      'Amanhã às 18h encontro você para devolver o livro.',
    relevance:
      'non_commercial',
  },
  {
    id:
      'commercial-schedule',
    coverage:
      'agendamento comercial',
    conversation:
      'A demonstração da solução ficou confirmada para amanhã às 16h.',
    relevance:
      'commercial',
  },
  {
    id:
      'multiple-ambiguous-subjects',
    coverage:
      'múltiplos assuntos',
    conversation:
      'Falamos de viagem, de trabalho e citamos uma proposta antiga sem esclarecer se ela voltou à pauta.',
    relevance:
      'uncertain',
  },
  {
    id:
      'old-commercial-current-personal',
    coverage:
      'histórico comercial antigo + momento atual pessoal',
    conversation:
      'O histórico possui negociação, mas hoje a conversa foi somente sobre a organização da mudança de casa.',
    relevance:
      'non_commercial',
  },
  {
    id:
      'personal-values-dates-times',
    coverage:
      'valores/datas/horários pessoais sem venda',
    conversation:
      'A reserva pessoal custou R$ 180 e ficou marcada para 24/08 às 19h.',
    relevance:
      'non_commercial',
  },
]

const NORMALIZATION_CONTEXT = {
  available_message_ids: [
    'm-current',
  ],
  customer_message_ids: [
    'm-current',
  ],
  available_products: [],
  previous_communication_observations: [],
  available_memory_ids: [
    'memory-commercial-history',
  ],
  active_memory_ids: [
    'memory-commercial-history',
  ],
  negotiation_evidence_detected:
    true,
  expected_previous_state_version:
    4,
  current_crm_status:
    'negociacao',
  prohibited_statuses: [
    'ganho',
    'perdido',
  ],
  reference_time:
    '2026-08-21T19:00:00-03:00',
}

function buildAttemptedOutput(
  caseItem,
) {
  return {
    contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,
    previous_state_version:
      4,
    analyzed_message_ids: [
      'm-current',
    ],
    commercial_role:
      'buyer',
    commercial_relevance:
      caseItem.relevance,
    interpretation: {
      what_changed: {
        summary:
          caseItem.conversation,
        evidence_message_ids: [
          'm-current',
        ],
      },
      what_remains_valid: [
        {
          summary:
            'A negociação comercial histórica permanece válida.',
          evidence_message_ids: [],
          memory_ids: [
            'memory-commercial-history',
          ],
        },
      ],
      current_moment: {
        summary:
          caseItem.conversation,
        evidence_message_ids: [
          'm-current',
        ],
        memory_ids: [],
      },
      customer_need: {
        summary:
          'Necessidade comercial indevidamente inferida.',
        evidence_message_ids: [
          'm-current',
        ],
        memory_ids: [],
      },
      uncertainties: [],
    },
    state_patch: {
      facts_to_add: [
        {
          kind:
            'attempted_fact',
          value:
            caseItem.conversation,
          confidence:
            'high',
          summary:
            'Fato comercial tentado pelo modelo.',
          evidence_message_ids: [
            'm-current',
          ],
        },
      ],
      fact_ids_to_supersede: [],
      needs_to_add: [],
      need_ids_to_resolve: [],
      need_ids_to_supersede: [],
      open_loops_to_add: [],
      open_loop_ids_to_resolve: [],
      open_loop_ids_to_supersede: [],
      objections_to_add: [
        {
          kind:
            'attempted_objection',
          confidence:
            'medium',
          summary:
            'Objeção comercial tentada pelo modelo.',
          evidence_message_ids: [
            'm-current',
          ],
        },
      ],
      objection_ids_to_resolve: [],
      objection_ids_to_supersede: [],
      commitments_to_upsert: [
        {
          commitment_id:
            null,
          kind:
            'attempted_commitment',
          status:
            'confirmed',
          scheduled_at:
            '2026-08-22T19:00:00-03:00',
          proposed_at:
            null,
          summary:
            'Compromisso comercial tentado pelo modelo.',
          evidence_message_ids: [
            'm-current',
          ],
        },
      ],
      signals_to_add: [
        {
          kind:
            'attempted_signal',
          confidence:
            'medium',
          summary:
            'Sinal comercial tentado pelo modelo.',
          evidence_message_ids: [
            'm-current',
          ],
        },
      ],
      signal_ids_to_resolve: [],
      uncertainties_to_add: [],
      uncertainty_ids_to_resolve: [],
      uncertainty_ids_to_supersede: [],
    },
    strategy: {
      method_application:
        'Aplicação comercial tentada pelo modelo.',
      rationale:
        'O modelo tentou tratar qualquer compromisso como comercial.',
      next_move:
        'Criar follow-up comercial.',
      recommended_question:
        'Podemos avançar com a compra?',
      suggested_message:
        'Posso confirmar nossa próxima etapa comercial?',
      evidence_message_ids: [
        'm-current',
      ],
      memory_ids: [],
    },
    operational_suggestions: {
      crm: {
        should_change_crm_stage:
          true,
        recommended_status:
          'respondeu',
        rationale:
          'O contato respondeu.',
        requires_human_confirmation:
          true,
      },
      agenda: {
        should_change_agenda:
          true,
        expected_next_action_at:
          '2026-08-22T22:00:00.000Z',
        rationale:
          'Existe data ou horário.',
        requires_human_confirmation:
          true,
      },
    },
    evidence_message_ids: [
      'm-current',
    ],
    memory_ids: [
      'memory-commercial-history',
    ],
  }
}

function statePatchHasValues(
  statePatch,
) {
  return Object.values(
    statePatch,
  ).some(
    values =>
      values.length > 0,
  )
}

test('corpus P1-04 cobre os doze cenários sem depender de palavra isolada', () => {
  assert.equal(
    CORPUS.length,
    12,
  )

  assert.deepEqual(
    new Set(
      CORPUS.map(
        caseItem =>
          caseItem.coverage,
      ),
    ).size,
    12,
  )

  assert.deepEqual(
    new Set(
      CORPUS.map(
        caseItem =>
          caseItem.relevance,
      ),
    ),
    new Set(
      COMMERCIAL_RELEVANCES,
    ),
  )
})

test('buyer + non_commercial é válido e neutraliza qualquer tentativa de CRM, Agenda, memória ou mensagem', () => {
  const caseItem =
    CORPUS.find(
      item =>
        item.id ===
          'job-resume',
    )

  const normalized =
    normalizeStatefulCopilotOutput(
      buildAttemptedOutput(
        caseItem,
      ),
      NORMALIZATION_CONTEXT,
    )

  assert.equal(
    normalized.commercial_role,
    'buyer',
  )
  assert.equal(
    normalized.commercial_relevance,
    'non_commercial',
  )
  assert.equal(
    statePatchHasValues(
      normalized.state_patch,
    ),
    false,
  )
  assert.deepEqual(
    normalized
      .operational_suggestions
      .crm,
    {
      should_change_crm_stage:
        false,
      recommended_status:
        null,
      rationale:
        null,
      requires_human_confirmation:
        true,
    },
  )
  assert.deepEqual(
    normalized
      .operational_suggestions
      .agenda,
    {
      should_change_agenda:
        false,
      expected_next_action_at:
        null,
      rationale:
        null,
      requires_human_confirmation:
        true,
    },
  )
  assert.equal(
    normalized
      .strategy
      .recommended_question,
    null,
  )
  assert.equal(
    normalized
      .strategy
      .suggested_message,
    null,
  )
  assert.equal(
    normalized
      .interpretation
      .current_moment
      .summary,
    'Conversa sem evidência comercial relevante para este ciclo.',
  )
})

test('todo cenário não comercial ou incerto opera em fail-closed', () => {
  for (
    const caseItem of
    CORPUS.filter(
      item =>
        item.relevance !==
          'commercial',
    )
  ) {
    const normalized =
      normalizeStatefulCopilotOutput(
        buildAttemptedOutput(
          caseItem,
        ),
        NORMALIZATION_CONTEXT,
      )

    assert.equal(
      statePatchHasValues(
        normalized.state_patch,
      ),
      false,
      caseItem.id,
    )
    assert.equal(
      normalized
        .operational_suggestions
        .crm
        .should_change_crm_stage,
      false,
      caseItem.id,
    )
    assert.equal(
      normalized
        .operational_suggestions
        .agenda
        .should_change_agenda,
      false,
      caseItem.id,
    )
    assert.equal(
      normalized
        .strategy
        .suggested_message,
      null,
      caseItem.id,
    )
  }
})

test('uma mensagem realmente comercial reativa normalmente a inteligência depois do assunto pessoal', () => {
  const caseItem =
    CORPUS.find(
      item =>
        item.id ===
          'personal-to-commercial',
    )

  const normalized =
    normalizeStatefulCopilotOutput(
      buildAttemptedOutput(
        caseItem,
      ),
      NORMALIZATION_CONTEXT,
    )

  assert.equal(
    normalized.commercial_relevance,
    'commercial',
  )
  assert.equal(
    statePatchHasValues(
      normalized.state_patch,
    ),
    true,
  )
  assert.equal(
    normalized
      .operational_suggestions
      .crm
      .should_change_crm_stage,
    true,
  )
  assert.equal(
    normalized
      .strategy
      .suggested_message,
    'Posso confirmar nossa próxima etapa comercial?',
  )
})
