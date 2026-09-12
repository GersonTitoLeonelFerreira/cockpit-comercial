import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)

const base = require(
  '../src/companion-seller-information-view.js',
)

// O wrapper lê a API global criada pelo presenter base e publica a versão
// enriquecida. O require abaixo precisa acontecer depois do base.
globalThis.YolenCompanionSellerInformationView = base

const view = require(
  '../src/companion-reasoning-view.js',
)

function reasoning(overrides = {}) {
  return {
    status: 'ready',
    decision: 'handle_objection',
    what_is_happening:
      'Cliente quer avançar, mas existe uma objeção de pagamento.',
    why_now:
      'A objeção apareceu depois da intenção explícita de fechar.',
    next_best_action:
      'Diagnosticar o bloqueio antes de oferecer alternativa.',
    technique: {
      id: 'technique.objection_diagnosis',
      title: 'Diagnóstico de objeção',
      why_applicable:
        'Há intenção de compra e uma trava de pagamento específica.',
      risks: [],
    },
    do_not_do: [
      'Não inventar condição de pagamento.',
    ],
    company_knowledge: [
      {
        title: 'Condição de pagamento publicada',
        source_type: 'product_profile',
        why_relevant:
          'A objeção depende da política real do produto.',
      },
    ],
    customer_roles: [],
    message: {
      ready_to_send:
        'Entendi. O que está te impedindo de concluir pelo cartão hoje?',
      editable: true,
    },
    limitations: [],
    ...overrides,
  }
}

test(
  'AGORA mantém decisão principal e acrescenta técnica contextual sem criar nova prioridade',
  () => {
    const html =
      view.renderAgoraViewModelSnapshot({
        silent: false,
        silent_reason: null,
        primary: {
          status: 'handle_objection',
          priority: 'high',
          headline: 'Objeção em aberto.',
          action: 'Entenda o bloqueio antes de avançar.',
          provenance: {
            decision_kind: 'handle_objection',
            source: 'commercial_risk',
            evidence_message_ids: ['m1'],
            memory_ids: [],
          },
        },
        secondary: [],
        reference_time:
          '2026-09-11T09:00:00-03:00',
        reasoning: reasoning(),
      })

    assert.match(
      html,
      /Entenda o bloqueio antes de avançar/,
    )
    assert.match(
      html,
      /Diagnóstico de objeção/,
    )
    assert.match(
      html,
      /Por que agora/,
    )
    assert.match(
      html,
      /Não inventar condição de pagamento/,
    )
  },
)

// FASE 16.9 — UX validada em Firefox, obrigatória: "Próximo movimento"
// tem prioridade visual em AGORA (não fica mais escondido), "Por que
// agora" vem abaixo, e técnica/cuidados ficam recolhidos atrás de "Ver
// técnica e cuidados" — nunca mais "Técnica aplicável" dominando a tela.
test(
  'FASE 16.9 — AGORA prioriza "Próximo movimento", com técnica/cuidados recolhidos',
  () => {
    const html =
      view.renderAgoraViewModelSnapshot({
        silent: false,
        silent_reason: null,
        primary: {
          status: 'handle_objection',
          priority: 'high',
          headline: 'Objeção em aberto.',
          action: 'Entenda o bloqueio antes de avançar.',
          provenance: {
            decision_kind: 'handle_objection',
            source: 'commercial_risk',
            evidence_message_ids: ['m1'],
            memory_ids: [],
          },
        },
        secondary: [],
        reference_time:
          '2026-09-11T09:00:00-03:00',
        reasoning: reasoning(),
      })

    const nextActionLabelIndex = html.indexOf('Próximo movimento')
    const nextActionCopyIndex = html.indexOf('Diagnosticar o bloqueio antes de oferecer alternativa')
    const whyNowIndex = html.indexOf('Por que agora')
    const detailsIndex = html.indexOf('<details class="yolen-seller-secondary-details" data-yolen-preserve-details="reasoning-technique">')
    const summaryIndex = html.indexOf('Ver técnica e cuidados')
    const techniqueIndex = html.indexOf('Diagnóstico de objeção')
    const doNotDoIndex = html.indexOf('Não inventar condição de pagamento')

    assert.ok(nextActionLabelIndex >= 0, 'Próximo movimento deveria aparecer em AGORA')
    assert.ok(nextActionCopyIndex >= 0, 'texto do próximo movimento deveria aparecer em AGORA')
    assert.ok(
      nextActionLabelIndex < whyNowIndex,
      'Próximo movimento deveria vir antes de Por que agora (prioridade visual)',
    )
    assert.ok(whyNowIndex < detailsIndex, 'Por que agora deveria vir antes do bloco recolhido')
    assert.ok(detailsIndex < summaryIndex && summaryIndex < techniqueIndex)
    assert.ok(techniqueIndex < doNotDoIndex)

    assert.doesNotMatch(html, /Commercial Brain/)
  },
)

test(
  'FASE 16.9 — ANÁLISE não duplica o bloco de coaching/reasoning (Commercial Brain) já mostrado em AGORA',
  () => {
    const html =
      view.renderAnalysisViewModel({
        available: true,
        unavailable_reason: null,
        neutral: false,
        neutral_headline: null,
        neutral_description: null,
        opportunity: null,
        current_moment: { is_active_session: true },
        risks: [],
        objections_open: [],
        commitments: [],
        seller_conduct: { method: null, stage_divergence: false },
        strengths: [],
        improvements: [],
        continuity: { cycle_conversation_count: 0, cross_conversation_signals: [] },
        history: [],
        provenance: {},
        reasoning: reasoning(),
      })

    assert.doesNotMatch(html, /Commercial Brain/)
    assert.doesNotMatch(html, /Como conduzir agora/)
    assert.doesNotMatch(html, /Ver técnica e cuidados/)
    assert.doesNotMatch(html, /Diagnóstico de objeção/)
  },
)

test(
  'CLIENTE mostra interlocutor e prospect como papéis diferentes',
  () => {
    const html =
      view.renderCustomerViewModel({
        available: true,
        unavailable_reason: null,
        preferences: [],
        communication_patterns: [],
        knowledge_gaps: [],
        opportunity_context: {
          objectives: [],
          needs: [],
          interests: [],
          problems: [],
          impacts: [],
          decision_criteria: [],
          discussed_products: [],
          primary_product_interest: null,
          competitors: [],
          communication_events: [],
        },
        provenance: {
          reference_time: null,
          state_record_id: null,
          state_version: null,
          state_updated_at: null,
        },
        roles: [
          {
            scope: 'current_contact',
            role: 'intermediary',
            label: 'Intermediário',
            evidence_message_ids: ['m1'],
          },
          {
            scope: 'related',
            role: 'prospect',
            label: 'Irmã',
            evidence_message_ids: ['m1'],
          },
        ],
        reasoning: reasoning(),
      })

    assert.match(html, /Quem é quem nesta venda/)
    assert.match(html, /Interlocutor \/ intermediário/)
    assert.match(html, /Irmã/)
    assert.match(html, /Pessoa relacionada à oportunidade/)
  },
)

test(
  'reasoning silencioso não cria técnica artificial em AGORA',
  () => {
    const html =
      view.renderAgoraViewModelSnapshot({
        silent: false,
        silent_reason: null,
        primary: {
          status: 'give_space',
          priority: null,
          headline: 'Conversa pessoal.',
          action: 'Não force a venda.',
          provenance: {
            decision_kind: 'give_space',
            source: null,
            evidence_message_ids: ['m1'],
            memory_ids: [],
          },
        },
        secondary: [],
        reference_time:
          '2026-09-11T09:00:00-03:00',
        reasoning:
          reasoning({
            status: 'silent',
          }),
      })

    assert.match(html, /Não force a venda/)
    assert.doesNotMatch(html, /Commercial Brain/)
    assert.doesNotMatch(html, /Diagnóstico de objeção/)
  },
)

test(
  'preview de MENSAGEM usa somente mensagem pronta e mantém aviso de edição sem auto-send',
  () => {
    const html =
      view.renderReasoningMessagePreview(
        reasoning(),
      )

    assert.match(
      html,
      /Entendi\. O que está te impedindo/,
    )
    assert.match(
      html,
      /Edite no WhatsApp antes de enviar/,
    )
    assert.match(
      html,
      /não envia automaticamente/,
    )
  },
)
