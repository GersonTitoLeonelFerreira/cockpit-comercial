import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCompanionClientTimeline,
} from './companion-client-timeline.ts'

// Cenário J: timeline ordenada (mais recente primeiro).
test(
  'timeline é ordenada do evento mais recente para o mais antigo',
  () => {
    const timeline =
      buildCompanionClientTimeline({
        first_known_interaction_at:
          '2026-08-01T08:00:00.000Z',

        cycle_events: [
          {
            event_type:
              'next_action_set',

            occurred_at:
              '2026-08-10T08:00:00.000Z',
          },
        ],

        action_events: [
          {
            action_type:
              'suggestion_shown',

            occurred_at:
              '2026-08-15T08:00:00.000Z',
          },
        ],
      })

    const timestamps =
      timeline.map(
        (event) =>
          event.occurred_at,
      )

    assert.deepEqual(
      timestamps,
      [
        '2026-08-15T08:00:00.000Z',
        '2026-08-10T08:00:00.000Z',
        '2026-08-01T08:00:00.000Z',
      ],
    )
  },
)

// Cenário K: eventos técnicos irrelevantes não poluem a timeline.
test(
  'tipos de evento fora da lista permitida são descartados silenciosamente',
  () => {
    const timeline =
      buildCompanionClientTimeline({
        first_known_interaction_at:
          null,

        cycle_events: [
          {
            event_type:
              'owner_reassigned',

            occurred_at:
              '2026-08-10T08:00:00.000Z',
          },

          {
            event_type:
              'group_changed',

            occurred_at:
              '2026-08-11T08:00:00.000Z',
          },

          {
            event_type:
              'next_action_set',

            occurred_at:
              '2026-08-12T08:00:00.000Z',
          },
        ],

        action_events: [
          {
            action_type:
              'unknown_future_event_type',

            occurred_at:
              '2026-08-13T08:00:00.000Z',
          },
        ],
      })

    assert.equal(
      timeline.length,
      1,
    )

    assert.equal(
      timeline[0].kind,
      'next_action_set',
    )
  },
)

test(
  'timeline respeita o limite máximo de itens',
  () => {
    const cycleEvents =
      Array.from(
        {
          length: 50,
        },
        (
          _value,
          index,
        ) => ({
          event_type:
            'next_action_set',

          occurred_at:
            new Date(
              Date.UTC(
                2026,
                0,
                index + 1,
              ),
            ).toISOString(),
        }),
      )

    const timeline =
      buildCompanionClientTimeline({
        first_known_interaction_at:
          null,

        cycle_events:
          cycleEvents,

        action_events:
          [],

        limit:
          5,
      })

    assert.equal(
      timeline.length,
      5,
    )
  },
)

// Cenário L: telemetria de sugestão traduzida corretamente.
test(
  'todos os tipos de telemetria de ação são traduzidos para rótulos em português',
  () => {
    const actionTypes = [
      'suggestion_shown',
      'suggestion_copied',
      'suggestion_inserted',
      'suggestion_ignored',
      'suggestion_edited',
      'suggestion_sent',
      'crm_accepted',
      'crm_rejected',
      'agenda_accepted',
      'agenda_rejected',
    ]

    const timeline =
      buildCompanionClientTimeline({
        first_known_interaction_at:
          null,

        cycle_events:
          [],

        action_events:
          actionTypes.map(
            (
              actionType,
              index,
            ) => ({
              action_type:
                actionType,

              occurred_at:
                new Date(
                  Date.UTC(
                    2026,
                    0,
                    index + 1,
                  ),
                ).toISOString(),
            }),
          ),

        limit:
          actionTypes.length,
      })

    assert.equal(
      timeline.length,
      actionTypes.length,
    )

    for (
      const event of timeline
    ) {
      assert.equal(
        typeof event.label,
        'string',
      )

      assert.ok(
        event.label.length >
          0,
      )

      // O rótulo nunca deve ser o identificador técnico cru.
      assert.notEqual(
        event.label,
        event.kind,
      )
    }
  },
)

test(
  'stage_changed para ganho/perdido vira um evento de fechamento, não uma etapa genérica',
  () => {
    const timeline =
      buildCompanionClientTimeline({
        first_known_interaction_at:
          null,

        cycle_events: [
          {
            event_type:
              'stage_changed',

            occurred_at:
              '2026-08-20T08:00:00.000Z',

            from_status:
              'negociacao',

            to_status:
              'ganho',
          },
        ],

        action_events:
          [],
      })

    assert.equal(
      timeline.length,
      1,
    )

    assert.equal(
      timeline[0].kind,
      'closed_won',
    )

    assert.equal(
      timeline[0].label,
      'Oportunidade ganha',
    )
  },
)

test(
  'stage_changed comum inclui rótulo legível de origem e destino',
  () => {
    const timeline =
      buildCompanionClientTimeline({
        first_known_interaction_at:
          null,

        cycle_events: [
          {
            event_type:
              'stage_changed',

            occurred_at:
              '2026-08-20T08:00:00.000Z',

            from_status:
              'novo',

            to_status:
              'contato',
          },
        ],

        action_events:
          [],
      })

    assert.equal(
      timeline[0].kind,
      'stage_changed',
    )

    assert.equal(
      timeline[0].detail,
      'NOVO → CONTATO',
    )
  },
)

// Fase 12A: "Registrar conversa" precisa aparecer na timeline canônica já
// usada pelo Companion, e não como um silo separado.
test(
  'conversation_registered aparece na timeline com rótulo de registro no histórico',
  () => {
    const timeline =
      buildCompanionClientTimeline({
        first_known_interaction_at:
          null,

        cycle_events: [
          {
            event_type:
              'conversation_registered',

            occurred_at:
              '2026-08-22T08:00:00.000Z',
          },
        ],

        action_events:
          [],
      })

    assert.equal(
      timeline[0].kind,
      'conversation_registered',
    )

    assert.equal(
      timeline[0].label,
      'Conversa registrada no histórico',
    )
  },
)
