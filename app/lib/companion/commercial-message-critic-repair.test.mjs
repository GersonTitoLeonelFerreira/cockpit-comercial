import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluateCommercialMessageDraft,
  repairCommercialMessageDraft,
} from './commercial-message-strategy.ts'

import {
  classifySellerActionText,
} from './seller-execution-trace.ts'

function strategy(overrides = {}) {
  return {
    contract_version:
      'commercial-message-strategy-v1',
    objective:
      'Reativar a conversa.',
    relationship_bridge: null,
    context_reference: null,
    technique_id:
      'technique.state_change_reactivation',
    technique_title:
      'Reativação por mudança de estado',
    desired_microcommitment:
      'Obter uma resposta curta sobre o estado atual do interesse.',
    facts_allowed: [],
    facts_required_but_missing: [],
    prohibited_moves: [],
    blocked_action_types: [
      'scheduling_open_question',
      'scheduling_guided_choice',
      'close_request',
      'price_presentation',
      'product_presentation',
    ],
    required_action_type:
      'reengagement',
    tone: null,
    max_length: 420,
    temporal_frame: {
      evaluated_at:
        '2026-09-29T15:00:00.000Z',
      momentum: 'dormant',
      reactivation_mode:
        'reactivate',
      requalify_before_continuing: true,
      elapsed_since_last_customer_message:
        '19 dias',
      elapsed_since_customer_intent:
        '28 dias',
      customer_waiting_for_seller_for: null,
      intent_time_window_expired: true,
      unanswered_seller_attempts: 2,
      enthusiasm_evidenced: false,
      guidance: [],
    },
    reactivation_tactics: [],
    evidence_message_ids: [],
    memory_ids: [],
    ...overrides,
  }
}

test(
  'perguntas de mudança de estado contam como retomada (não só "ainda faz sentido")',
  () => {
    for (const message of [
      'Oi! Quando falamos você estava avaliando a demonstração. Como ficou isso desde então?',
      'Oi! Você chegou a resolver a questão do treinamento nesse período?',
      'Oi! Da última vez você queria conhecer o espaço. Ainda está pensando nisso?',
    ]) {
      assert.equal(
        classifySellerActionText(message),
        'reengagement',
        message,
      )

      assert.deepEqual(
        evaluateCommercialMessageDraft({
          message,
          strategy: strategy(),
        }).violations,
        [],
        message,
      )
    }
  },
)

test(
  '"para avançarmos" dentro da pergunta do microcompromisso não é fechamento genérico',
  () => {
    const result =
      evaluateCommercialMessageDraft({
        message:
          'Qual o melhor dia para avançarmos com a demonstração?',
        strategy: strategy({
          technique_id: null,
          required_action_type: null,
          blocked_action_types: [],
          temporal_frame: null,
        }),
      })

    assert.equal(
      result.violations.includes(
        'generic_filler',
      ),
      false,
    )
  },
)

test(
  'frase isolada de disponibilidade continua reprovada pelo critic',
  () => {
    const result =
      evaluateCommercialMessageDraft({
        message:
          'Oi! Como ficou sua avaliação desde então? Fico à disposição!',
        strategy: strategy(),
      })

    assert.ok(
      result.violations.includes(
        'generic_filler',
      ),
    )
  },
)

test(
  'reparo determinístico remove só o filler e preserva valores e links',
  () => {
    const repaired =
      repairCommercialMessageDraft(
        'Oi! O plano custa R$ 1.299 e o detalhe está em https://exemplo.com/plano. Como ficou sua avaliação desde então? Qualquer dúvida, estou à disposição.',
      )

    assert.deepEqual(
      repaired.repairs,
      ['removed_generic_filler'],
    )
    assert.equal(
      repaired.message,
      'Oi! O plano custa R$ 1.299 e o detalhe está em https://exemplo.com/plano. Como ficou sua avaliação desde então?',
    )
  },
)

test(
  'reparo remove "tudo bem?" quando ele compete com a pergunta comercial',
  () => {
    const repaired =
      repairCommercialMessageDraft(
        'Oi, Lorena, tudo bem? Como ficou sua ideia de fazer a aula experimental?',
      )

    assert.ok(
      repaired.repairs.includes(
        'removed_phatic_question',
      ),
    )
    assert.equal(
      (repaired.message.match(/\?/g) ?? []).length,
      1,
    )
    assert.match(
      repaired.message,
      /^Oi, Lorena!/,
    )
  },
)

test(
  'intenção antiga não confirmada: pedir data/escolha/preço é reprovado',
  () => {
    for (const message of [
      'Oi! Qual dia e horário fica melhor para a sua visita?',
      'Oi! Prefere terça às 10h ou quarta às 15h?',
      'Oi! O plano anual custa R$ 899. Vamos fechar?',
    ]) {
      const result =
        evaluateCommercialMessageDraft({
          message,
          strategy: strategy(),
        })

      assert.ok(
        result.violations.includes(
          'assumes_current_intent',
        ),
        `${message} → ${result.violations.join(', ')}`,
      )
    }
  },
)

test(
  'persuasão sem invenção: entusiasmo só quando o cliente demonstrou',
  () => {
    const message =
      'Oi! Você estava super animada com a demonstração. Como ficou isso desde então?'

    assert.ok(
      evaluateCommercialMessageDraft({
        message,
        strategy: strategy(),
      }).violations.includes(
        'fabricated_enthusiasm',
      ),
    )

    const evidenced =
      strategy()

    evidenced.temporal_frame = {
      ...evidenced.temporal_frame,
      enthusiasm_evidenced: true,
    }

    assert.equal(
      evaluateCommercialMessageDraft({
        message,
        strategy: evidenced,
      }).violations.includes(
        'fabricated_enthusiasm',
      ),
      false,
    )
  },
)

test(
  'escassez/urgência sem fato oficial é pressão; com fato oficial é permitida',
  () => {
    const message =
      'Oi! Como ficou sua avaliação? Temos últimas vagas nesta turma.'

    assert.ok(
      evaluateCommercialMessageDraft({
        message,
        strategy: strategy(),
      }).violations.includes(
        'pressure_risk',
      ),
    )

    assert.equal(
      evaluateCommercialMessageDraft({
        message,
        strategy: strategy({
          facts_allowed: [
            'Turma de outubro: últimas vagas disponíveis (fato oficial vigente).',
          ],
        }),
      }).violations.includes(
        'pressure_risk',
      ),
      false,
    )
  },
)
