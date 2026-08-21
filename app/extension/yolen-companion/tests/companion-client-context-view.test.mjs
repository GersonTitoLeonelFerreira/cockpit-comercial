import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(
  import.meta.url,
)

const view = require(
  '../src/companion-client-context-view.js',
)

function buildContext(
  overrides = {},
) {
  return {
    contract_version:
      'companion-client-context-v1',

    generated_at:
      '2026-08-22T12:00:00.000Z',

    identity: {
      company_id:
        'company-1',

      cycle_id:
        'cycle-1',

      conversation_key:
        'whatsapp:+5547999990001',

      current_status:
        'negociacao',
    },

    relationship: {
      first_known_interaction_at:
        '2026-08-05T08:00:00.000Z',

      relationship_age_ms:
        17 *
        24 *
        60 *
        60 *
        1000,

      latest_customer_message_at:
        '2026-08-22T09:42:00.000Z',

      latest_seller_message_at:
        '2026-08-22T10:08:00.000Z',

      last_interaction_at:
        '2026-08-22T10:08:00.000Z',

      known_interaction_count:
        23,
    },

    waiting: {
      state:
        'seller_waiting_for_customer',

      waiting_since:
        '2026-08-22T10:08:00.000Z',

      waiting_duration_ms:
        112 *
        60 *
        1000,
    },

    timeline: [],

    sla: {
      configured:
        false,

      applicable:
        true,

      stage:
        'negociacao',

      stage_label:
        'NEGOCIAÇÃO',

      target_minutes:
        null,

      warning_minutes:
        null,

      danger_minutes:
        null,

      elapsed_minutes:
        60,

      risk:
        null,
    },

    ...overrides,
  }
}

// Cenário P: loading/error/empty.
test(
  'estado loading renderiza uma mensagem de carregamento',
  () => {
    const html =
      view.renderClientContextSection(
        {
          status:
            'loading',
        },
      )

    assert.match(
      html,
      /Carregando relacionamento/,
    )
  },
)

test(
  'estado error renderiza a mensagem de erro sem quebrar HTML',
  () => {
    const html =
      view.renderClientContextSection(
        {
          status:
            'error',

          error:
            '<script>alert(1)</script>',
        },
      )

    assert.match(
      html,
      /yolen-client-relationship--error/,
    )

    assert.doesNotMatch(
      html,
      /<script>/,
    )
  },
)

test(
  'estado ready sem primeiro contato conhecido renderiza o estado vazio',
  () => {
    const html =
      view.renderClientContextSection(
        {
          status:
            'ready',

          data:
            buildContext({
              relationship: {
                first_known_interaction_at:
                  null,

                relationship_age_ms:
                  null,

                latest_customer_message_at:
                  null,

                latest_seller_message_at:
                  null,

                last_interaction_at:
                  null,

                known_interaction_count:
                  0,
              },
            }),
        },
      )

    assert.match(
      html,
      /Ainda não há histórico suficiente/,
    )
  },
)

test(
  'status desconhecido cai com segurança no estado vazio, nunca quebra',
  () => {
    const html =
      view.renderClientContextSection(
        undefined,
      )

    assert.match(
      html,
      /yolen-client-relationship--empty/,
    )
  },
)

// Cenário O: frontend renderiza estados de espera.
test(
  'estado customer_waiting_for_seller aparece com o rótulo correto',
  () => {
    const html =
      view.renderRelationshipCard(
        buildContext({
          waiting: {
            state:
              'customer_waiting_for_seller',

            waiting_since:
              '2026-08-22T09:42:00.000Z',

            waiting_duration_ms:
              138 *
              60 *
              1000,
          },
        }),
      )

    assert.match(
      html,
      /data-yolen-waiting-state="customer_waiting_for_seller"/,
    )

    assert.match(
      html,
      /Cliente aguardando você/,
    )

    assert.match(
      html,
      /há 2h18/,
    )
  },
)

test(
  'estado seller_waiting_for_customer aparece com o rótulo correto',
  () => {
    const html =
      view.renderRelationshipCard(
        buildContext(),
      )

    assert.match(
      html,
      /data-yolen-waiting-state="seller_waiting_for_customer"/,
    )

    assert.match(
      html,
      /Aguardando resposta do cliente/,
    )
  },
)

test(
  'estado no_pending_response aparece com o rótulo correto',
  () => {
    const html =
      view.renderRelationshipCard(
        buildContext({
          waiting: {
            state:
              'no_pending_response',

            waiting_since:
              null,

            waiting_duration_ms:
              null,
          },
        }),
      )

    assert.match(
      html,
      /Sem pendência de resposta/,
    )
  },
)

test(
  'estado unknown aparece com o rótulo correto',
  () => {
    const html =
      view.renderRelationshipCard(
        buildContext({
          waiting: {
            state:
              'unknown',

            waiting_since:
              null,

            waiting_duration_ms:
              null,
          },
        }),
      )

    assert.match(
      html,
      /Ainda sem dados suficientes/,
    )
  },
)

test(
  'card renderiza primeiro contato, tempo de relacionamento e contagem de interações',
  () => {
    const html =
      view.renderRelationshipCard(
        buildContext(),
      )

    assert.match(
      html,
      /Primeiro contato/,
    )

    assert.match(
      html,
      /05\/08\/2026/,
    )

    assert.match(
      html,
      /Em conversa há/,
    )

    assert.match(
      html,
      /há 17 dias/,
    )

    assert.match(
      html,
      /Interações conhecidas/,
    )

    assert.match(
      html,
      />23</,
    )
  },
)

test(
  'SLA só aparece quando configurado e aplicável',
  () => {
    const withoutSla =
      view.renderRelationshipCard(
        buildContext(),
      )

    assert.doesNotMatch(
      withoutSla,
      /data-yolen-sla-risk/,
    )

    const withSla =
      view.renderRelationshipCard(
        buildContext({
          sla: {
            configured:
              true,

            applicable:
              true,

            stage:
              'negociacao',

            stage_label:
              'NEGOCIAÇÃO',

            target_minutes:
              60,

            warning_minutes:
              120,

            danger_minutes:
              240,

            elapsed_minutes:
              260,

            risk:
              'high',
          },
        }),
      )

    assert.match(
      withSla,
      /data-yolen-sla-risk="high"/,
    )

    assert.match(
      withSla,
      /Risco alto/,
    )
  },
)

test(
  'timeline vazia não renderiza a seção de histórico',
  () => {
    const html =
      view.renderRelationshipCard(
        buildContext({
          timeline:
            [],
        }),
      )

    assert.doesNotMatch(
      html,
      /yolen-client-timeline/,
    )
  },
)

test(
  'timeline com eventos renderiza lista com data e rótulo, escapando HTML',
  () => {
    const html =
      view.renderRelationshipCard(
        buildContext({
          timeline: [
            {
              kind:
                'stage_changed',

              occurred_at:
                '2026-08-10T08:00:00.000Z',

              label:
                'Etapa alterada',

              detail:
                '<b>NOVO</b> → CONTATO',
            },
          ],
        }),
      )

    assert.match(
      html,
      /yolen-client-timeline/,
    )

    assert.match(
      html,
      /10\/08\/2026/,
    )

    assert.match(
      html,
      /Etapa alterada/,
    )

    assert.doesNotMatch(
      html,
      /<b>NOVO<\/b>/,
    )
  },
)

test(
  'formatRelativeDuration cobre minutos, horas e dias',
  () => {
    assert.equal(
      view.formatRelativeDuration(
        30_000,
      ),
      'agora mesmo',
    )

    assert.equal(
      view.formatRelativeDuration(
        5 *
          60 *
          1000,
      ),
      'há 5min',
    )

    assert.equal(
      view.formatRelativeDuration(
        90 *
          60 *
          1000,
      ),
      'há 1h30',
    )

    assert.equal(
      view.formatRelativeDuration(
        3 *
          24 *
          60 *
          60 *
          1000,
      ),
      'há 3 dias',
    )

    assert.equal(
      view.formatRelativeDuration(
        -1,
      ),
      null,
    )

    assert.equal(
      view.formatRelativeDuration(
        null,
      ),
      null,
    )
  },
)
