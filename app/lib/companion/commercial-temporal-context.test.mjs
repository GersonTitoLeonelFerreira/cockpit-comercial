import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSellerExecutionTrace,
} from './seller-execution-trace.ts'

import {
  buildCommercialTemporalContext,
  formatCommercialDuration,
  temporalRequiresNewMove,
} from './commercial-temporal-context.ts'

function input(
  turns,
  referenceTime,
) {
  return {
    company_id: 'company-temporal',
    cycle_id: 'cycle-temporal',
    conversation_key:
      'conversation-temporal',
    reference_time:
      referenceTime,
    analysis_precondition: {
      status: 'ready',
      limitations: [],
    },
    conversation: {
      active_message_ids:
        turns.map(
          (_, index) =>
            `m${index + 1}`,
        ),
      excluded_message_ids: [],
      excluded_messages: [],
      messages:
        turns.map(
          ([author, at, text], index) => ({
            id: `m${index + 1}`,
            message_key:
              `key-${index + 1}`,
            version: 1,
            sequence: index + 1,
            direction:
              author === 'customer'
                ? 'incoming'
                : 'outgoing',
            author_kind:
              author === 'customer'
                ? 'customer'
                : author === 'bot'
                  ? 'automation'
                  : 'human_agent',
            occurred_at: at,
            observed_at: at,
            content_type: 'text',
            text_content: text,
            audio_transcription: null,
          }),
        ),
    },
    commercial_context: {
      facts: [],
      products: [],
      sales_method: {
        configured: false,
        steps: [],
      },
      prohibited_behaviors: [],
    },
  }
}

function temporal(
  turns,
  evaluatedAt,
  operational = null,
) {
  const diagnosticInput =
    input(
      turns,
      evaluatedAt,
    )

  return buildCommercialTemporalContext({
    diagnostic_input:
      diagnosticInput,
    trace:
      buildSellerExecutionTrace({
        diagnostic_input:
          diagnosticInput,
      }),
    evaluated_at:
      evaluatedAt,
    operational,
  })
}

test(
  'adiamento explícito do cliente estende o horizonte: silêncio dentro do combinado é espera, não abandono',
  () => {
    const result =
      temporal(
        [
          ['customer', '2026-09-01T12:00:00Z', 'Quero entender os planos para a equipe.'],
          ['seller', '2026-09-01T12:10:00Z', 'Claro! Segue a proposta.'],
          ['customer', '2026-09-01T13:00:00Z', 'Vou analisar com o time e te aviso semana que vem.'],
        ],
        '2026-09-06T12:00:00Z',
      )

    // O cliente falou por último, mas pediu prazo: dentro do combinado
    // ninguém deve movimento imediato (não é "cliente aguardando").
    assert.equal(
      result.momentum.waiting_on,
      'none',
    )
    assert.equal(
      result.progression.responsible,
      'agreed_pause',
    )
    assert.equal(
      result.reactivation.mode,
      'wait',
    )
    assert.equal(
      result.progression.agreed_pause
        .seller_owes_contact,
      false,
      '"te aviso" deixa o próximo movimento combinado com o cliente',
    )

    const justRequested =
      temporal(
        [
          ['customer', '2026-09-01T12:00:00Z', 'Quero entender os planos para a equipe.'],
          ['seller', '2026-09-01T12:10:00Z', 'Claro! Segue a proposta.'],
          ['customer', '2026-09-01T13:00:00Z', 'Vou analisar com o time e te aviso semana que vem.'],
        ],
        '2026-09-01T13:20:00Z',
      )

    assert.equal(
      justRequested.momentum.waiting_on,
      'seller',
      'logo depois do pedido de prazo, cabe ao vendedor confirmar o combinado',
    )
    assert.equal(
      justRequested.reactivation.mode,
      'respond_now',
    )

    const afterSellerAck =
      temporal(
        [
          ['customer', '2026-09-01T12:00:00Z', 'Quero entender os planos para a equipe.'],
          ['seller', '2026-09-01T12:10:00Z', 'Claro! Segue a proposta.'],
          ['customer', '2026-09-01T13:00:00Z', 'Vou analisar com o time e te aviso semana que vem.'],
          ['seller', '2026-09-01T13:05:00Z', 'Combinado, fico no aguardo.'],
        ],
        '2026-09-08T12:00:00Z',
      )

    assert.equal(
      afterSellerAck.momentum.state,
      'awaiting_customer',
    )
    assert.ok(
      afterSellerAck.momentum.reason_codes
        .includes(
          'customer_deferral_in_progress',
        ),
    )
    assert.equal(
      afterSellerAck.reactivation.mode,
      'wait',
    )
    assert.equal(
      afterSellerAck.cadence.basis,
      'deferral',
    )
  },
)

test(
  'mensagem de automação não conta como follow-up humano do vendedor',
  () => {
    const result =
      temporal(
        [
          ['customer', '2026-09-10T12:00:00Z', 'Quero agendar uma visita.'],
          ['seller', '2026-09-10T12:05:00Z', 'Qual dia você pode vir?'],
          ['bot', '2026-09-12T12:00:00Z', 'Lembrete automático: responda para continuar.'],
          ['bot', '2026-09-14T12:00:00Z', 'Lembrete automático: responda para continuar.'],
        ],
        '2026-09-15T12:00:00Z',
      )

    assert.equal(
      result.reactivation
        .outbound_unanswered_turns,
      1,
    )
    assert.equal(
      result.facts
        .seller_messages_since_last_customer_reply,
      1,
    )
  },
)

test(
  'atividade mais nova que o snapshot analisado impede afirmar dormência',
  () => {
    const turns = [
      ['customer', '2026-09-01T12:00:00Z', 'Quero agendar uma demonstração.'],
      ['seller', '2026-09-01T12:05:00Z', 'Qual dia fica melhor?'],
    ]

    const stale =
      temporal(
        turns,
        '2026-09-20T12:00:00Z',
      )

    assert.equal(
      stale.momentum.state,
      'dormant',
    )

    const withNewerActivity =
      temporal(
        turns,
        '2026-09-20T12:00:00Z',
        {
          relationship: {
            first_known_interaction_at:
              '2026-09-01T12:00:00Z',
            relationship_age_ms: null,
            latest_customer_message_at:
              '2026-09-20T11:30:00Z',
            latest_seller_message_at:
              '2026-09-01T12:05:00Z',
            last_interaction_at:
              '2026-09-20T11:30:00Z',
            known_interaction_count: 3,
          },
        },
      )

    assert.equal(
      withNewerActivity.snapshot
        .newer_activity_outside_snapshot,
      true,
    )
    assert.equal(
      withNewerActivity.momentum.confidence,
      'low',
    )
    assert.notEqual(
      withNewerActivity.momentum.state,
      'dormant',
    )
    assert.equal(
      temporalRequiresNewMove(
        withNewerActivity,
      ),
      false,
    )
  },
)

test(
  'ritmo observado do cliente ajusta a janela esperada (sem limiar universal)',
  () => {
    const fastCustomer =
      temporal(
        [
          ['seller', '2026-09-01T12:00:00Z', 'Posso te mostrar a solução?'],
          ['customer', '2026-09-01T12:05:00Z', 'Pode sim.'],
          ['seller', '2026-09-01T12:10:00Z', 'Qual o principal desafio hoje?'],
          ['customer', '2026-09-01T12:15:00Z', 'Organizar a agenda da equipe.'],
          ['seller', '2026-09-01T12:20:00Z', 'Faz sentido uma demonstração amanhã?'],
        ],
        '2026-09-02T12:00:00Z',
      )

    assert.equal(
      fastCustomer.cadence.basis,
      'observed',
    )
    assert.equal(
      fastCustomer.cadence
        .expected_customer_reply_window_ms,
      12 * 60 * 60 * 1000,
      'ritmo de minutos usa o piso da janela esperada',
    )
    assert.equal(
      fastCustomer.momentum.state,
      'cooling',
      'para quem responde em minutos, 24h sem resposta já é esfriamento',
    )
  },
)

test(
  'SLA só é citado quando configurado pela empresa (passthrough, nunca inventado)',
  () => {
    const turns = [
      ['customer', '2026-09-01T12:00:00Z', 'Quero uma proposta.'],
      ['seller', '2026-09-01T12:05:00Z', 'Envio hoje.'],
    ]

    const withoutSla =
      temporal(
        turns,
        '2026-09-02T12:00:00Z',
        {
          sla: {
            configured: false,
            applicable: true,
            stage: 'respondeu',
            stage_label: 'Respondeu',
            target_minutes: null,
            warning_minutes: null,
            danger_minutes: null,
            elapsed_minutes: 1440,
            risk: null,
          },
        },
      )

    assert.equal(
      withoutSla.signals.includes(
        'stage_sla_risk_high',
      ),
      false,
    )
    assert.equal(
      withoutSla.narrative.facts.some(
        fact =>
          /limite/.test(fact),
      ),
      false,
    )

    const withSla =
      temporal(
        turns,
        '2026-09-02T12:00:00Z',
        {
          sla: {
            configured: true,
            applicable: true,
            stage: 'respondeu',
            stage_label: 'Respondeu',
            target_minutes: 60,
            warning_minutes: 240,
            danger_minutes: 720,
            elapsed_minutes: 1440,
            risk: 'high',
          },
        },
      )

    assert.ok(
      withSla.signals.includes(
        'stage_sla_risk_high',
      ),
    )
  },
)

test(
  'duração seller-facing é legível',
  () => {
    assert.equal(
      formatCommercialDuration(30 * 60 * 1000),
      '30 minutos',
    )
    assert.equal(
      formatCommercialDuration(3 * 60 * 60 * 1000),
      '3 horas',
    )
    assert.equal(
      formatCommercialDuration(18 * 24 * 60 * 60 * 1000),
      '18 dias',
    )
  },
)

test(
  'pausa combinada usa o calendário comercial: "semana que vem" dita numa quarta começa na segunda seguinte',
  () => {
    const turns = [
      ['customer', '2026-09-16T13:00:00Z', 'Quero conhecer os planos para a minha equipe.'],
      ['seller', '2026-09-16T13:05:00Z', 'Claro! Quer que eu te explique as diferenças?'],
      ['customer', '2026-09-16T13:20:00Z', 'Agora estou sem tempo, me chama semana que vem.'],
      ['seller', '2026-09-16T13:25:00Z', 'Combinado! Te chamo na segunda.'],
    ]

    const sunday =
      temporal(
        turns,
        '2026-09-20T22:00:00Z',
      )

    // Segunda 21/09 às 9h em São Paulo (UTC-3).
    assert.equal(
      sunday.progression.agreed_pause
        .resume_at,
      '2026-09-21T12:00:00.000Z',
    )
    assert.equal(
      sunday.progression.agreed_pause
        .status,
      'in_progress',
    )
    assert.equal(
      sunday.reactivation.mode,
      'wait',
    )

    const monday =
      temporal(
        turns,
        '2026-09-21T12:30:00Z',
      )

    assert.equal(
      monday.progression.agreed_pause
        .status,
      'due',
    )
    assert.equal(
      monday.progression.responsible,
      'seller',
    )
    assert.equal(
      monday.momentum.waiting_on,
      'seller',
    )
    assert.equal(
      monday.seller_timing
        .pending_customer_wait_ms,
      null,
      'o cliente não está "esperando resposta": é o contato combinado',
    )
  },
)

test(
  'frescor por engajamento relacionado: assunto relacionado renova, conversa fática não',
  () => {
    const base = [
      ['customer', '2026-09-01T13:00:00Z', 'Quero agendar uma visita ao apartamento da Rua das Flores.'],
      ['seller', '2026-09-01T13:05:00Z', 'Claro! Posso te mostrar o apartamento na quinta?'],
    ]

    const related =
      temporal(
        [
          ...base,
          ['customer', '2026-09-05T12:00:00Z', 'O apartamento ainda está disponível?'],
        ],
        '2026-09-05T12:10:00Z',
      )

    assert.equal(
      related.intent.last_engagement_at,
      '2026-09-05T12:00:00.000Z',
    )
    assert.equal(
      related.intent.needs_reconfirmation,
      false,
    )

    const phatic =
      temporal(
        [
          ...base,
          ['customer', '2026-09-05T12:00:00Z', 'Boa tarde! Tudo bem?'],
        ],
        '2026-09-05T12:10:00Z',
      )

    assert.equal(
      phatic.intent.last_engagement_at,
      '2026-09-01T13:00:00.000Z',
    )
    assert.ok(
      phatic.intent.vitality <
        related.intent.vitality,
    )

    const unrelated =
      temporal(
        [
          ...base,
          ['customer', '2026-09-05T12:00:00Z', 'Você pode me mandar o boleto do condomínio de agosto?'],
        ],
        '2026-09-05T12:10:00Z',
      )

    assert.equal(
      unrelated.intent.last_engagement_at,
      '2026-09-01T13:00:00.000Z',
      'pedido de outro assunto não reconfirma a visita',
    )
  },
)
