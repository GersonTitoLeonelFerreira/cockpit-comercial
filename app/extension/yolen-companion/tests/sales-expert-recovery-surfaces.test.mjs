import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import {
  buildIdentityFor,
  parseBuildIdentitySource,
  renderBuildIdentitySource,
} from '../scripts/build-package.mjs'

const require = createRequire(import.meta.url)

const base = require(
  '../src/companion-seller-information-view.js',
)

const view = require(
  '../src/companion-reasoning-view.js',
).enhanceSellerInformationView(base)

function neutralViewModel(overrides = {}) {
  return {
    available: true,
    unavailable_reason: null,
    neutral: true,
    neutral_headline:
      'O contexto do cliente ainda é incerto.',
    neutral_description:
      'A leitura abaixo avalia apenas a execução observável do vendedor.',
    opportunity: null,
    current_moment: { is_active_session: null },
    risks: [],
    objections_open: [],
    commitments: [],
    seller_conduct: {
      method: {
        configured: false,
        name: null,
        stages: [],
        current_stage: null,
        adherence: null,
        recovery_guidance: null,
      },
      stage_divergence: false,
    },
    strengths: [],
    improvements: [],
    continuity: {
      cycle_conversation_count: 0,
      cross_conversation_signals: [],
    },
    history: [],
    provenance: {},
    ...overrides,
  }
}

function coaching(overrides = {}) {
  return {
    status: 'ready',
    scope: 'full',
    client_context_confidence: 'high',
    seller_execution_confidence: 'high',
    current_commercial_goal:
      'Reativar a conversa descobrindo o estado atual do interesse.',
    client_intent_now: {
      kind: 'scheduling',
      label:
        'Agendamento ou compromisso de agenda — demonstrada há 28 dias; interesse atual ainda não reconfirmado',
      confidence: 'high',
      evidence_message_id: 'm3',
      freshness: 'stale',
      demonstrated_at: '2026-09-01T14:33:40Z',
      is_current: false,
    },
    seller_last_valid_move: null,
    seller_strength: {
      summary:
        'O vendedor identificou que a conversa precisava avançar para um compromisso de agenda.',
      why_it_matters:
        'Transformar interesse em próximo passo reduz ambiguidade.',
      evidence_message_ids: ['m8'],
      memory_ids: [],
    },
    seller_mistake: {
      summary:
        'A condução saiu do objetivo comercial que o cliente havia demonstrado (agendar o próximo passo) e passou para apresentação de preço antes de concluir esse próximo passo.',
      why_it_matters:
        'Mudar de objetivo sem fato novo aumenta fricção.',
      impact: null,
      how_to_improve:
        'Na retomada, primeiro reconfirmar se o interesse do cliente continua.',
      evidence_message_ids: ['m9', 'm10', 'm11'],
      memory_ids: [],
    },
    additional_findings: [],
    sequence_break: {
      happened: true,
      what_changed:
        'A condução mudou para apresentação de preço antes de concluir o objetivo anterior do cliente.',
      why_it_hurts:
        'A quebra de sequência aumenta fricção.',
      evidence_message_ids: ['m9'],
    },
    method_state: {
      configured: false,
      current_stage_name: null,
      recommended_stage_name: null,
      recommended_stage_reason: null,
      adherence: 'not_configured',
      deviation_detected: true,
      recovery_objective: null,
      recovery_move: null,
      historical_open_loops: true,
    },
    chosen_technique: {
      id: 'technique.state_change_reactivation',
      title: 'Reativação por mudança de estado',
      why_now:
        'A conversa perdeu continuidade.',
      risks: [],
    },
    next_action:
      'Reativar a conversa relembrando o que o cliente estava avaliando.',
    do_not_do: [],
    temporal: {
      evaluated_at: '2026-09-29T15:00:00.000Z',
      momentum_state: 'dormant',
      momentum_label:
        'Oportunidade sem continuidade',
      waiting_on: 'customer',
      intent_freshness: 'stale',
      intent_label:
        'Intenção antiga — precisa ser reconfirmada antes de ser tratada como atual',
      reactivation_mode: 'reactivate',
      requalify_before_continuing: true,
      facts: [
        'Última mensagem do cliente há 19 dias.',
        'Última mensagem do vendedor há 4 dias — 2 tentativas seguidas sem resposta do cliente.',
      ],
    },
    synthesis: {
      diagnosis:
        'A condução saiu do objetivo comercial que o cliente havia demonstrado. Hoje: oportunidade sem continuidade — o interesse atual precisa ser reconfirmado antes de retomar o passo antigo.',
      main_improvement:
        'Na retomada, primeiro reconfirmar se o interesse do cliente continua.',
      next_learning:
        'Antes de enviar oferta ou nova cobrança, retome o que o cliente queria.',
    },
    coherence: {
      adjustments: [],
    },
    evidence_message_ids: [],
    memory_ids: [],
    ...overrides,
  }
}

test(
  'ANÁLISE abre com o diagnóstico sintetizado e o momento da oportunidade (tempo visível para o vendedor)',
  () => {
    const html =
      view.renderAnalysisViewModel({
        ...neutralViewModel({
          neutral: false,
          neutral_headline: null,
          neutral_description: null,
        }),
        coaching_diagnosis:
          coaching(),
      })

    assert.match(
      html,
      /Diagnóstico da condução[\s\S]*Momento da oportunidade[\s\S]*Principal acerto[\s\S]*Principal ajuste/,
    )
    assert.match(
      html,
      /Última mensagem do cliente há 19 dias/,
    )
    assert.match(
      html,
      /interesse atual precisa ser reconfirmado/,
    )
    assert.match(
      html,
      /Intenção demonstrada \(histórico\)/,
    )
    assert.match(
      html,
      /Reativação por mudança de estado/,
    )
    assert.match(
      html,
      /Relembre de forma concreta o que o cliente estava avaliando/,
    )
  },
)

test(
  'contexto do cliente incerto não apaga a leitura da execução do vendedor',
  () => {
    const html =
      view.renderAnalysisViewModel({
        ...neutralViewModel(),
        coaching_diagnosis:
          coaching({
            status: 'limited',
            scope: 'seller_execution_only',
            chosen_technique: null,
            next_action: null,
          }),
      })

    assert.match(
      html,
      /O contexto do cliente ainda é incerto/,
    )
    assert.match(
      html,
      /Leitura da condução/,
    )
    assert.match(
      html,
      /Principal ajuste/,
    )
  },
)

test(
  'conversa realmente neutra continua sem coaching',
  () => {
    const html =
      view.renderAnalysisViewModel({
        ...neutralViewModel({
          neutral_headline:
            'Conversa sem evidência comercial relevante.',
          neutral_description:
            'Nenhuma leitura de venda desta conversa é necessária.',
        }),
        coaching_diagnosis:
          coaching({
            status: 'silent',
            scope: 'full',
          }),
      })

    assert.match(
      html,
      /Conversa sem evidência comercial relevante/,
    )
    assert.doesNotMatch(
      html,
      /Leitura da condução/,
    )
  },
)

test(
  'lacuna antiga do método aparece como histórico depois do intervalo, não como falta atual',
  () => {
    const html =
      view.renderAnalysisViewModel({
        ...neutralViewModel({
          neutral: false,
          neutral_headline: null,
          neutral_description: null,
          seller_conduct: {
            method: {
              configured: true,
              name: 'Método consultivo',
              stages: [
                {
                  step_order: 1,
                  stage_key: 'agenda',
                  name: 'Agendamento',
                  status: 'partial',
                  explanation: 'Dia e horário não definidos.',
                  evidence_message_ids: [],
                  memory_ids: [],
                },
              ],
              current_stage: {
                step_order: 1,
                stage_key: 'agenda',
                name: 'Agendamento',
              },
              adherence: {
                status: 'off_method',
                summary: 'Saiu do método.',
                deviation_stage_order: 1,
                what_happened: 'Oferta antes de agendar.',
                missing_information: [
                  'Dia e horário da aula experimental',
                ],
                why_it_matters: null,
                evidence_message_ids: [],
                memory_ids: [],
              },
              recovery_guidance: {
                objective: 'Retomar o agendamento.',
                recommended_move: 'Perguntar dia e horário.',
                optional_question: null,
                missing_information: [],
                evidence_message_ids: [],
                memory_ids: [],
              },
            },
            stage_divergence: false,
          },
        }),
        coaching_diagnosis:
          coaching(),
      })

    assert.match(
      html,
      /O que ficou em aberto na última tentativa/,
    )
    assert.match(
      html,
      /Reconfirmar se o interesse do cliente continua depois do intervalo/,
    )
    assert.doesNotMatch(
      html,
      /Próximo movimento[\s\S]{0,200}Perguntar dia e horário/,
    )
  },
)

test(
  'AGORA mostra o momento da oportunidade quando o tempo mudou a decisão',
  () => {
    const html =
      view.renderAgoraViewModelSnapshot({
        silent: false,
        silent_reason: null,
        primary: {
          status: 'follow_up',
          priority: 'high',
          headline:
            'O cliente demonstrou interesse há 28 dias e não respondeu desde então.',
          action:
            'Reativar relembrando o que o cliente queria.',
          provenance: {
            decision_kind: 'follow_up',
            source: 'commercial_reasoning',
            evidence_message_ids: ['m1'],
            memory_ids: [],
          },
        },
        secondary: [],
        reference_time:
          '2026-09-29T12:00:00-03:00',
        reasoning: {
          status: 'ready',
          decision: 'follow_up',
          what_is_happening:
            'A conversa perdeu continuidade.',
          why_now:
            'O interesse atual é desconhecido.',
          next_best_action:
            'Reativar relembrando o que o cliente queria.',
          technique: {
            id: 'technique.state_change_reactivation',
            title: 'Reativação por mudança de estado',
            why_applicable: 'x',
            risks: [],
          },
          do_not_do: [],
          company_knowledge: [],
          customer_roles: [],
          message: {
            ready_to_send: null,
            editable: true,
          },
          momentum: {
            state: 'dormant',
            label:
              'Oportunidade sem continuidade',
            requalify_before_continuing: true,
            facts: [
              'Última mensagem do cliente há 19 dias.',
            ],
          },
          limitations: [],
        },
      })

    assert.match(
      html,
      /data-yolen-agora-momentum="dormant"/,
    )
    // Primeiro nível: situação, ação e UM "por quê" que acrescenta
    // informação; o rótulo do momento e os fatos ficam nos detalhes.
    assert.match(
      html,
      /Por que essa ação<\/div>\s*<div class="yolen-seller-detail-copy">O interesse atual é desconhecido\.<\/div>/,
    )
    assert.match(
      html,
      /<summary>Ver técnica<\/summary>[\s\S]*Oportunidade sem continuidade[\s\S]*Última mensagem do cliente há 19 dias/,
    )
  },
)

function withoutDetails(html) {
  return html.replace(/<details[\s\S]*?<\/details>/g, ' ')
}

function detailsOf(html) {
  return (html.match(/<details[\s\S]*?<\/details>/g) || []).join(' ')
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

test(
  'AGORA sem redundância: 1 situação, 1 ação, 1 "por quê"; o fato que virou "por quê" sai da situação e o resto fica em detalhes',
  () => {
    const headline =
      'O cliente demonstrou interesse em agendar há 28 dias. A última resposta do cliente foi há 19 dias, com 2 tentativas do vendedor sem resposta desde então. O interesse atual não está confirmado.'
    const action =
      'Reativar a conversa perguntando como está esse interesse hoje.'

    const html =
      view.renderAgoraViewModelSnapshot({
        silent: false,
        silent_reason: null,
        primary: {
          status: 'follow_up',
          priority: 'high',
          headline,
          action,
          provenance: {},
        },
        secondary: [],
        reference_time: null,
        reasoning: {
          status: 'ready',
          decision: 'follow_up',
          what_is_happening: headline,
          // O motor embute a situação inteira no why_now.
          why_now: `${headline} Antes de retomar o passo antigo é preciso descobrir o que mudou.`,
          next_best_action: action,
          technique: {
            id: 'technique.state_change_reactivation',
            title: 'Reativação por mudança de estado',
            why_applicable: 'x',
            risks: [],
          },
          do_not_do: ['Não voltar direto para dia e horário.'],
          company_knowledge: [],
          customer_roles: [],
          message: { ready_to_send: null, editable: true },
          momentum: {
            state: 'dormant',
            label: 'Oportunidade sem continuidade',
            requalify_before_continuing: true,
            facts: [
              'Primeiro contato há 28 dias.',
              'Última mensagem do cliente há 19 dias.',
              'Última mensagem do vendedor há 4 dias — 2 tentativas seguidas sem resposta do cliente.',
            ],
          },
          limitations: [],
        },
      })

    const open = withoutDetails(html)

    assert.equal(count(html, 'data-yolen-now-attention-variant="primary"'), 1)
    assert.equal(count(open, action), 1, 'a próxima ação aparece aberta uma vez')
    assert.equal(count(open, 'Por que essa ação'), 1)
    assert.match(
      open,
      /Por que essa ação<\/div>\s*<div class="yolen-seller-detail-copy">A última resposta do cliente foi há 19 dias, com 2 tentativas do vendedor sem resposta desde então\.<\/div>/,
    )
    assert.equal(count(open, 'A última resposta do cliente foi há 19 dias'), 1, 'o fato não fica também na situação')
    assert.match(open, /O cliente demonstrou interesse em agendar há 28 dias\. O interesse atual não está confirmado\./)
    assert.equal(open.includes('Antes de retomar o passo antigo'), false, 'raciocínio restante não disputa o primeiro nível')
    assert.equal(open.includes('Reativação por mudança de estado'), false, 'técnica só em detalhes')
    assert.equal(open.includes('Oportunidade sem continuidade'), false, 'rótulo do momento só em detalhes')

    const details = detailsOf(html)

    assert.match(details, /<summary>Ver técnica e cuidados<\/summary>/)
    assert.match(details, /Oportunidade sem continuidade/)
    assert.match(details, /Primeiro contato há 28 dias/)
    assert.match(details, /Antes de retomar o passo antigo é preciso descobrir o que mudou/)
    assert.match(details, /Reativação por mudança de estado/)
    assert.match(details, /Não voltar direto para dia e horário/)
  },
)

test(
  'ANÁLISE sem redundância: diagnóstico condensado, momento subordinado, técnica expandível e evidência preservada',
  () => {
    const nextAction =
      'Relembre de forma concreta o que o cliente estava avaliando e pergunte como está isso hoje, antes de retomar o passo antigo.'
    const diagnosis = coaching({
      next_action: nextAction,
      current_commercial_goal: nextAction,
      additional_findings: [
        {
          kind: 'question_quality',
          title: 'Qualidade da pergunta',
          summary:
            'A intenção de avançar para o agendamento foi correta, mas a pergunta deixou a decisão ampla demais para o cliente.',
          why_it_matters: 'Pergunta totalmente aberta aumenta o esforço de resposta.',
          impact: null,
          how_to_improve: 'Estreitar a decisão com poucas alternativas reais.',
          evidence_message_ids: ['m8'],
          memory_ids: [],
        },
      ],
    })

    const html =
      view.renderAnalysisViewModel({
        ...neutralViewModel({
          neutral: false,
          neutral_headline: null,
          neutral_description: null,
        }),
        coaching_diagnosis: diagnosis,
      })

    const open = withoutDetails(html)
    const details = detailsOf(html)

    // Diagnóstico: a sentença que o principal ajuste já explica sai do
    // primeiro nível; o texto completo continua em "Ver raciocínio".
    assert.match(open, /Diagnóstico da condução<\/div>\s*<div class="yolen-seller-insight-title">Hoje: oportunidade sem continuidade/)
    assert.equal(count(open, 'A condução saiu do objetivo comercial que o cliente havia demonstrado'), 1)
    assert.match(details, /Diagnóstico completo[\s\S]*A condução saiu do objetivo comercial que o cliente havia demonstrado\. Hoje:/)

    // Momento subordinado: o rótulo que o diagnóstico já disse vai para os
    // detalhes; os fatos (informação nova) continuam abertos.
    assert.equal(open.includes('Oportunidade sem continuidade — interesse atual precisa ser reconfirmado.'), false)
    assert.match(open, /Momento da oportunidade[\s\S]*Última mensagem do cliente há 19 dias/)
    assert.match(details, /Momento da oportunidade<\/div>\s*<div class="yolen-seller-detail-copy">Oportunidade sem continuidade/)

    // Técnica: a explicação que só repete a ação fica atrás de "Como aplicar".
    assert.match(open, /Técnica recomendada[\s\S]*Reativação por mudança de estado[\s\S]*Como aplicar agora/)
    assert.equal(count(open, nextAction), 1, 'a ação aparece aberta uma vez')
    assert.equal(open.includes('Em termos simples'), false)
    assert.match(details, /<summary>Como aplicar<\/summary>[\s\S]*Em termos simples/)
    assert.equal(details.includes('Objetivo comercial agora'), false, 'objetivo idêntico à ação não se repete nem nos detalhes')

    // Rótulo semântico: o acerto que um aprendizado ressalva é parcial.
    assert.doesNotMatch(html, /Principal acerto/)
    assert.match(html, /data-yolen-coaching-strength="partial"/)
    assert.match(open, /Acerto parcial[\s\S]*Ressalva[\s\S]*Qualidade da pergunta/)

    // Evidência continua auditável.
    assert.match(html, /Evidência: 3 mensagens da conversa/)
  },
)

test(
  'identidade de build é determinística e legível de volta a partir do arquivo gerado',
  () => {
    const git = {
      commit:
        '0123456789abcdef0123456789abcdef01234567',
      commit_short: '01234567',
      dirty: false,
    }

    const first =
      buildIdentityFor({
        version: '1.5.0',
        environment: 'prod',
        targetName: 'firefox',
        git,
        fingerprint: 'abc123',
      })

    const second =
      buildIdentityFor({
        version: '1.5.0',
        environment: 'prod',
        targetName: 'firefox',
        git,
        fingerprint: 'abc123',
      })

    assert.deepEqual(first, second)
    assert.equal(
      first.environment,
      'firefox-prod',
    )

    const changedCode =
      buildIdentityFor({
        version: '1.5.0',
        environment: 'prod',
        targetName: 'firefox',
        git,
        fingerprint: 'def456',
      })

    assert.notEqual(
      changedCode.build_id,
      first.build_id,
      'código diferente precisa gerar build id diferente',
    )

    assert.deepEqual(
      parseBuildIdentitySource(
        renderBuildIdentitySource(first),
      ),
      first,
    )
  },
)

test(
  'revisão do coaching na MENSAGEM ignora durações que só "envelhecem" e reage à mudança de momentum',
  async () => {
    const { readFileSync } =
      await import('node:fs')

    const source =
      readFileSync(
        new URL(
          '../src/companion-message-controller.js',
          import.meta.url,
        ),
        'utf8',
      )

    const start =
      source.indexOf(
        'function stableCoachingSignaturePayload(',
      )
    const end =
      source.indexOf(
        'function getGuidance(',
        start,
      )

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    const stableCoachingSignaturePayload =
      new Function(
        `${source.slice(start, end)}; return stableCoachingSignaturePayload`,
      )()

    const today =
      coaching()

    const tomorrow =
      coaching({
        client_intent_now: {
          ...today.client_intent_now,
          label:
            'Agendamento ou compromisso de agenda — demonstrada há 29 dias; interesse atual ainda não reconfirmado',
        },
        temporal: {
          ...today.temporal,
          evaluated_at:
            '2026-09-30T15:00:00.000Z',
          facts: [
            'Última mensagem do cliente há 20 dias.',
          ],
        },
      })

    assert.equal(
      JSON.stringify(
        stableCoachingSignaturePayload(today),
      ),
      JSON.stringify(
        stableCoachingSignaturePayload(tomorrow),
      ),
    )

    const customerReplied =
      coaching({
        temporal: {
          ...today.temporal,
          momentum_state:
            'awaiting_seller',
          reactivation_mode:
            'respond_now',
          requalify_before_continuing:
            false,
        },
      })

    assert.notEqual(
      JSON.stringify(
        stableCoachingSignaturePayload(today),
      ),
      JSON.stringify(
        stableCoachingSignaturePayload(
          customerReplied,
        ),
      ),
    )
  },
)
