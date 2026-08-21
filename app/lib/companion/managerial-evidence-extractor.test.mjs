import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ManagerialEvidenceExtractorError,
  extractManagerialEvidence,
} from './managerial-evidence-extractor.ts'

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

function buildReading({
  status = 'complete',
  limitations = [],
} = {}) {
  return {
    contract_version:
      'commercial-reading-v1',

    analysis_status:
      status,

    analysis_limitations:
      limitations,

    seller_strengths: [
      {
        kind:
          'good_discovery',

        summary:
          'O vendedor investigou a necessidade antes de recomendar.',

        evidence_message_ids: [
          'm-1',
        ],

        memory_ids: [],
      },
    ],

    improvement_points: [
      {
        kind:
          'insufficient_discovery',

        summary:
          'A descoberta ainda ficou incompleta.',

        impact:
          'A recomendação pode ocorrer sem critérios suficientes.',

        evidence_message_ids: [
          'm-2',
        ],

        memory_ids: [],
      },
      {
        kind:
          'method_misapplication',

        summary:
          'Uma etapa do método foi aplicada fora do contexto.',

        impact:
          'A condução pode perder aderência ao método definido.',

        evidence_message_ids: [
          'm-3',
        ],

        memory_ids: [],
      },
    ],

    risks: {
      customer_objections: [
        {
          kind:
            'price_resistance',

          severity:
            'medium',

          summary:
            'O cliente demonstrou resistência ao preço.',

          evidence_message_ids: [
            'm-4',
          ],

          memory_ids: [],
        },
      ],

      service_risks: [
        {
          kind:
            'promise_without_confirmation',

          severity:
            'high',

          summary:
            'Existe risco de promessa sem confirmação oficial.',

          evidence_message_ids: [
            'm-5',
          ],

          memory_ids: [],
        },
      ],
    },
  }
}

function buildAnalysisEvent({
  id = 'analysis-1',
  sellerUserId = 'seller-1',
  reading = buildReading(),
  generatedAt =
    '2026-08-20T15:00:00-03:00',
} = {}) {
  return {
    id,

    company_id:
      'company-1',

    cycle_id:
      'cycle-1',

    seller_user_id:
      sellerUserId,

    generated_at:
      generatedAt,

    normalized_output: {
      communication: {
        commercial_reading:
          reading,
      },
    },
  }
}

function emptyInput() {
  return {
    expected_company_id:
      'company-1',

    commercial_reading_events: [],

    action_events: [],

    cycle_events: [],

    cycle_snapshots: [],
  }
}

function expectError(
  callback,
  code,
) {
  assert.throws(
    callback,
    error => {
      assert.ok(
        error instanceof
          ManagerialEvidenceExtractorError,
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
  'extrai evidência semântica A4 sem nova interpretação',
  () => {
    const result =
      extractManagerialEvidence({
        ...emptyInput(),

        commercial_reading_events: [
          buildAnalysisEvent(),
        ],
      })

    assert.equal(
      result.coverage
        .commercial_reading_events_compatible,
      1,
    )

    assert.equal(
      result.semantic_evidence.length,
      5,
    )

    const improvement =
      result.semantic_evidence.find(
        item =>
          item.kind ===
          'insufficient_discovery',
      )

    assert.equal(
      improvement?.category,
      'seller_behavior',
    )

    assert.equal(
      improvement?.summary,
      'A descoberta ainda ficou incompleta.',
    )

    const method =
      result.semantic_evidence.find(
        item =>
          item.kind ===
          'method_misapplication',
      )

    assert.equal(
      method?.category,
      'method_execution',
    )

    const objection =
      result.semantic_evidence.find(
        item =>
          item.kind ===
          'recurring_objection',
      )

    assert.equal(
      objection?.category,
      'customer_pattern',
    )

    assert.equal(
      objection?.risk_severity,
      'medium',
    )

    const strength =
      result.semantic_evidence.find(
        item =>
          item.kind ===
          'seller_strength_pattern',
      )

    assert.equal(
      strength?.category,
      'positive_pattern',
    )
  },
)

test(
  'leitura limitada preserva limitações em cada evidência extraída',
  () => {
    const result =
      extractManagerialEvidence({
        ...emptyInput(),

        commercial_reading_events: [
          buildAnalysisEvent({
            reading:
              buildReading({
                status:
                  'limited',

                limitations: [
                  'audio_without_transcription',
                ],
              }),
          }),
        ],
      })

    assert.ok(
      result.semantic_evidence.every(
        item =>
          item.analysis_status ===
            'limited' &&
          item.analysis_limitations
            .includes(
              'audio_without_transcription',
            ),
      ),
    )
  },
)

test(
  'evento legado sem commercial_reading é excluído sem inventar evidência',
  () => {
    const event =
      buildAnalysisEvent()

    event.normalized_output = {
      communication: {
        contract_version:
          'phase-5.2-communication-v1',
      },
    }

    const result =
      extractManagerialEvidence({
        ...emptyInput(),

        commercial_reading_events: [
          event,
        ],
      })

    assert.equal(
      result.semantic_evidence.length,
      0,
    )

    assert.equal(
      result.coverage
        .commercial_reading_events_excluded,
      1,
    )

    assert.equal(
      result
        .excluded_analysis_events[0]
        .reason,
      'commercial_reading_missing',
    )

    assert.deepEqual(
      result.analysis_event_ids,
      [],
    )
  },
)

test(
  'contrato A4 incompatível é excluído sem ser tratado como cobertura válida',
  () => {
    const reading =
      buildReading()

    reading.contract_version =
      'commercial-reading-v0'

    const result =
      extractManagerialEvidence({
        ...emptyInput(),

        commercial_reading_events: [
          buildAnalysisEvent({
            reading,
          }),
        ],
      })

    assert.equal(
      result.coverage
        .commercial_reading_events_compatible,
      0,
    )

    assert.equal(
      result
        .excluded_analysis_events[0]
        .reason,
      'commercial_reading_incompatible',
    )
  },
)

test(
  'ausência de snapshot histórico do vendedor não atribui falha ao dono atual',
  () => {
    const result =
      extractManagerialEvidence({
        ...emptyInput(),

        commercial_reading_events: [
          buildAnalysisEvent({
            sellerUserId:
              null,
          }),
        ],

        cycle_snapshots: [
          {
            id:
              'cycle-1',

            company_id:
              'company-1',

            owner_user_id:
              'seller-current',

            status:
              'negociacao',

            next_action:
              null,

            next_action_date:
              null,

            updated_at:
              '2026-08-20T16:00:00-03:00',
          },
        ],
      })

    const sellerEvidence =
      result.semantic_evidence.filter(
        item =>
          item.category ===
            'seller_behavior' ||
          item.category ===
            'method_execution' ||
          item.category ===
            'positive_pattern',
      )

    assert.equal(
      sellerEvidence.length,
      0,
    )

    const objection =
      result.semantic_evidence.find(
        item =>
          item.category ===
          'customer_pattern',
      )

    assert.ok(
      objection,
    )

    assert.equal(
      objection.seller_user_id,
      null,
    )

    assert.equal(
      result.source_limitations[0]
        .reason,
      'seller_attribution_missing',
    )

    assert.deepEqual(
      result
        .commercial_reading_seller_user_ids,
      [],
    )
  },
)

test(
  'reanálises do mesmo ciclo continuam separadas para deduplicação posterior',
  () => {
    const result =
      extractManagerialEvidence({
        ...emptyInput(),

        commercial_reading_events: [
          buildAnalysisEvent({
            id:
              'analysis-1',

            generatedAt:
              '2026-08-20T15:00:00-03:00',
          }),

          buildAnalysisEvent({
            id:
              'analysis-2',

            generatedAt:
              '2026-08-20T16:00:00-03:00',
          }),
        ],
      })

    const discoveryItems =
      result.semantic_evidence.filter(
        item =>
          item.kind ===
          'insufficient_discovery',
      )

    assert.equal(
      discoveryItems.length,
      2,
    )

    assert.deepEqual(
      discoveryItems.map(
        item =>
          item.analysis_event_id,
      ),
      [
        'analysis-1',
        'analysis-2',
      ],
    )

    assert.deepEqual(
      result
        .commercial_reading_cycle_ids,
      [
        'cycle-1',
      ],
    )
  },
)

test(
  'telemetria permanece fato e mapeia apenas ações gerenciais conhecidas',
  () => {
    const result =
      extractManagerialEvidence({
        ...emptyInput(),

        action_events: [
          {
            id:
              'action-1',

            company_id:
              'company-1',

            cycle_id:
              'cycle-1',

            seller_user_id:
              'seller-1',

            action_type:
              'suggestion_shown',

            occurred_at:
              '2026-08-20T15:00:00-03:00',
          },
          {
            id:
              'action-2',

            company_id:
              'company-1',

            cycle_id:
              'cycle-1',

            seller_user_id:
              'seller-1',

            action_type:
              'suggestion_ignored',

            occurred_at:
              '2026-08-20T15:01:00-03:00',
          },
          {
            id:
              'action-3',

            company_id:
              'company-1',

            cycle_id:
              'cycle-1',

            seller_user_id:
              'seller-1',

            action_type:
              'suggestion_sent',

            occurred_at:
              '2026-08-20T15:02:00-03:00',
          },
        ],
      })

    assert.equal(
      result.action_facts[0]
        .mapped_kind,
      null,
    )

    assert.equal(
      result.action_facts[1]
        .mapped_kind,
      'suggestion_ignored',
    )

    assert.equal(
      result.action_facts[2]
        .mapped_kind,
      'suggestion_adoption',
    )
  },
)

test(
  'rejeições de CRM e Agenda continuam telemetria factual',
  () => {
    const result =
      extractManagerialEvidence({
        ...emptyInput(),

        action_events: [
          {
            id:
              'action-crm',

            company_id:
              'company-1',

            cycle_id:
              'cycle-1',

            seller_user_id:
              'seller-1',

            action_type:
              'crm_rejected',

            occurred_at:
              '2026-08-20T15:00:00-03:00',
          },
          {
            id:
              'action-agenda',

            company_id:
              'company-1',

            cycle_id:
              'cycle-1',

            seller_user_id:
              'seller-1',

            action_type:
              'agenda_rejected',

            occurred_at:
              '2026-08-20T15:01:00-03:00',
          },
        ],
      })

    assert.deepEqual(
      result.action_facts.map(
        item =>
          item.mapped_kind,
      ),
      [
        'crm_rejection',
        'agenda_rejection',
      ],
    )
  },
)

test(
  'cycle_event preserva somente fatos operacionais e não transforma ator em vendedor',
  () => {
    const result =
      extractManagerialEvidence({
        ...emptyInput(),

        cycle_events: [
          {
            id:
              'cycle-event-1',

            company_id:
              'company-1',

            cycle_id:
              'cycle-1',

            created_by:
              'actor-1',

            event_type:
              'stage_changed',

            occurred_at:
              '2026-08-20T15:00:00-03:00',

            metadata: {
              payload: {
                from_status:
                  'respondeu',

                to_status:
                  'negociacao',

                next_action:
                  'Retornar amanhã',

                conversation_text:
                  'conteúdo que não deve ser propagado',
              },
            },
          },
        ],
      })

    assert.equal(
      result.cycle_facts[0]
        .actor_user_id,
      'actor-1',
    )

    assert.equal(
      result.cycle_facts[0]
        .from_status,
      'respondeu',
    )

    assert.equal(
      result.cycle_facts[0]
        .to_status,
      'negociacao',
    )

    assert.equal(
      result.cycle_facts[0]
        .next_action,
      'Retornar amanhã',
    )

    assert.equal(
      Object.prototype.hasOwnProperty.call(
        result.cycle_facts[0],
        'seller_user_id',
      ),
      false,
    )

    assert.equal(
      JSON.stringify(
        result.cycle_facts[0],
      ).includes(
        'conteúdo que não deve ser propagado',
      ),
      false,
    )
  },
)

test(
  'sales_cycle é explicitamente snapshot atual e não atribuição histórica',
  () => {
    const result =
      extractManagerialEvidence({
        ...emptyInput(),

        cycle_snapshots: [
          {
            id:
              'cycle-1',

            company_id:
              'company-1',

            owner_user_id:
              'seller-current',

            status:
              'negociacao',

            next_action:
              'Retornar',

            next_action_date:
              '2026-08-21T14:00:00-03:00',

            updated_at:
              '2026-08-20T15:00:00-03:00',
          },
        ],
      })

    assert.equal(
      result.cycle_snapshots[0]
        .current_owner_user_id,
      'seller-current',
    )

    assert.equal(
      Object.prototype.hasOwnProperty.call(
        result.cycle_snapshots[0],
        'seller_user_id',
      ),
      false,
    )
  },
)

test(
  'fonte de outra empresa falha fechado',
  () => {
    const event =
      buildAnalysisEvent()

    event.company_id =
      'company-2'

    expectError(
      () =>
        extractManagerialEvidence({
          ...emptyInput(),

          commercial_reading_events: [
            event,
          ],
        }),
      'COMPANY_MISMATCH',
    )
  },
)

test(
  'extrator não modifica os registros de origem',
  () => {
    const input = {
      ...emptyInput(),

      commercial_reading_events: [
        buildAnalysisEvent(),
      ],

      action_events: [
        {
          id:
            'action-1',

          company_id:
            'company-1',

          cycle_id:
            'cycle-1',

          seller_user_id:
            'seller-1',

          action_type:
            'suggestion_sent',

          occurred_at:
            '2026-08-20T16:00:00-03:00',
        },
      ],
    }

    const before =
      clone(input)

    extractManagerialEvidence(
      input,
    )

    assert.deepEqual(
      input,
      before,
    )
  },
)


test(
  'eventos A4 excluídos preservam o vendedor histórico conhecido',
  () => {
    const legacy =
      buildAnalysisEvent({
        id:
          'analysis-legacy',

        sellerUserId:
          'seller-legacy',
      })

    legacy.normalized_output = {
      communication: {
        contract_version:
          'phase-5.2-communication-v1',
      },
    }

    const incompatibleReading =
      buildReading()

    incompatibleReading.contract_version =
      'commercial-reading-v0'

    const result =
      extractManagerialEvidence({
        ...emptyInput(),

        commercial_reading_events: [
          legacy,

          buildAnalysisEvent({
            id:
              'analysis-incompatible',

            sellerUserId:
              'seller-incompatible',

            reading:
              incompatibleReading,
          }),
        ],
      })

    assert.deepEqual(
      result
        .excluded_analysis_events
        .map(
          item => ({
            id:
              item.analysis_event_id,

            seller:
              item.seller_user_id,

            reason:
              item.reason,
          }),
        ),
      [
        {
          id:
            'analysis-incompatible',

          seller:
            'seller-incompatible',

          reason:
            'commercial_reading_incompatible',
        },
        {
          id:
            'analysis-legacy',

          seller:
            'seller-legacy',

          reason:
            'commercial_reading_missing',
        },
      ],
    )
  },
)
