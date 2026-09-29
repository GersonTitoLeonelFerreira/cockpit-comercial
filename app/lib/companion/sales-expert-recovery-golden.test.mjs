import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  assessCustomerOpportunityStance,
  buildSellerExecutionTrace,
  classifySellerActionText,
} from './seller-execution-trace.ts'

import {
  buildCommercialTemporalContext,
} from './commercial-temporal-context.ts'

import {
  buildCommercialReasoning,
} from './commercial-reasoning-engine.ts'

import {
  buildCommercialCoachingDiagnosis,
} from './commercial-coaching-engine.ts'

import {
  buildCommercialMessageStrategy,
  evaluateCommercialMessageDraft,
} from './commercial-message-strategy.ts'

import {
  composeSellerMessage,
} from './lead-seller-message.ts'

import {
  selectStatefulDiagnosticMessages,
} from './stateful-copilot-real-context-loader.ts'

import {
  applySellerExecutionCoachingToNeutralView,
  buildAnalysisViewModel,
} from '../server/analysis-view-model.ts'

// ============================================================================
// Golden conversations — recuperação do especialista comercial.
//
// Cada caso atravessa a cadeia canônica inteira:
// entrada → temporal context → diagnostic input → Commercial Reading →
// Seller Execution Trace → Sequence/Method → Reasoning → Coaching →
// AnalysisViewModel → Message Strategy → critic/mensagem final.
//
// Os fixtures antigos tinham todas as mensagens no mesmo minuto e ofertas
// em UMA bolha; por isso o tempo nunca era testado e o elogio contraditório
// da Lorena (oferta em várias bolhas) passava verde. Aqui os horários são
// realistas e as ofertas vêm em rajadas.
// ============================================================================

const CORPUS =
  JSON.parse(
    readFileSync(
      new URL(
        '../../../docs/companion-v2/corpus/sales-expert-recovery-golden.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )

function caseById(id) {
  const item =
    CORPUS.cases.find(
      entry => entry.id === id,
    )

  assert.ok(item, `caso ${id} ausente`)

  return item
}

function evidence(
  summary,
  ids = ['m1'],
) {
  return {
    summary,
    evidence_message_ids: ids,
    memory_ids: [],
  }
}

function buildInput(
  turns,
  referenceTime,
) {
  return {
    input_version:
      'phase-5-input-v1',
    diagnostic_contract_version:
      'phase-4-diagnostic-v3',
    company_id:
      'company-golden',
    cycle_id:
      'cycle-golden',
    conversation_key:
      'conversation-golden',
    current_crm_status:
      'respondeu',
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
          ([direction, at, text], index) => ({
            id: `m${index + 1}`,
            message_key:
              `message-${index + 1}`,
            version: 1,
            sequence: index + 1,
            direction:
              direction === 'in'
                ? 'incoming'
                : 'outgoing',
            author_kind:
              direction === 'in'
                ? 'customer'
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
      configured: true,
      config_version_id:
        'config-golden',
      config_version_number: 1,
      config_contract_version:
        'phase-2-v1',
      business_description:
        'Empresa genérica.',
      target_audience: null,
      value_proposition: null,
      communication_tone: null,
      required_behaviors: [],
      prohibited_behaviors: [],
      sales_method: {
        configured: false,
        contract_version: null,
        name: null,
        description: null,
        principles: [],
        definition: null,
        steps: [],
      },
      products: [],
      facts: [],
      objection_guides: [],
    },
  }
}

function buildReading(
  spec = {},
) {
  const relevance =
    spec.relevance ?? 'commercial'

  const neutral =
    relevance !== 'commercial'

  const hasMethodGap =
    Array.isArray(
      spec.method_missing_information,
    ) &&
    spec.method_missing_information
      .length > 0

  return {
    contract_version:
      'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role:
      spec.role ?? 'buyer',
    commercial_relevance:
      relevance,
    conversation_summary: {
      initial_context: null,
      evolution: null,
      important_events: [],
      current_state:
        evidence(
          neutral
            ? 'Momento atual sem relevância comercial confirmada.'
            : 'Conversa comercial em andamento.',
        ),
      last_customer_request_or_decision:
        neutral
          ? null
          : evidence(
              'Cliente demonstrou intenção comercial.',
            ),
    },
    customer: {
      objectives: [],
      problems: [],
      impacts: [],
      needs: [],
      interests: [],
      decision_criteria: [],
      preferences: [],
      open_questions: [],
      objections:
        (spec.objections ?? [])
          .map(
            summary =>
              evidence(summary),
          ),
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
    commercial_evolution: [],
    method: {
      configured: hasMethodGap,
      name:
        hasMethodGap
          ? 'Método consultivo'
          : null,
      stages: [],
      current_stage: null,
      adherence: {
        status:
          hasMethodGap
            ? 'off_method'
            : 'not_configured',
        summary: '',
        deviation_stage_order: null,
        what_happened: null,
        missing_information:
          spec.method_missing_information ??
          [],
        why_it_matters: null,
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
    seller_strengths:
      neutral
        ? []
        : (spec.strengths ?? []).map(
            item => ({
              kind: item.kind,
              summary: item.summary,
              why_it_matters:
                item.why_it_matters,
              evidence_message_ids:
                item.evidence,
              memory_ids: [],
            }),
          ),
    improvement_points: [],
    risks: {
      customer_objections: [],
      service_risks: [],
    },
    best_approach: {
      decision:
        spec.best_approach ??
        'respond',
      reason:
        'Leitura persistida da última análise.',
      channel: 'text',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
    communication: {
      intervention_needed:
        !neutral,
      recommended_question: null,
      recommended_message: null,
    },
    operations: {
      crm: {
        should_change_crm_stage: false,
        recommended_status: null,
        rationale: null,
        requires_human_confirmation: true,
      },
      agenda: {
        should_change_agenda: false,
        expected_next_action_at: null,
        rationale: null,
        requires_human_confirmation: true,
      },
    },
    evidence_message_ids: ['m1'],
    memory_ids: [],
  }
}

function buildState({
  partyKinds = [],
  commercialMemory = false,
} = {}) {
  return {
    contract_version:
      'phase-5.1-commercial-state-v1',
    cycle_id: 'cycle-golden',
    version: 1,
    commercial_role: 'buyer',
    current_moment:
      evidence('Momento atual.'),
    current_priority:
      evidence('Prioridade atual.'),
    last_analyzed_message_ids: ['m1'],
    last_evidence_message_ids: ['m1'],
    facts:
      partyKinds.map(
        (kind, index) => ({
          id: `fact-${index + 1}`,
          kind,
          summary: kind,
          value: null,
          confidence: 'high',
          evidence_message_ids: ['m1'],
          memory_status: 'active',
          created_in_state_version: 1,
          updated_in_state_version: 1,
          closed_in_state_version: null,
        }),
      ),
    needs:
      commercialMemory
        ? [
            {
              id: 'need-1',
              kind: 'need.product',
              summary: 'Necessidade comercial ativa.',
              confidence: 'high',
              evidence_message_ids: ['m1'],
              memory_status: 'active',
              created_in_state_version: 1,
              updated_in_state_version: 1,
              closed_in_state_version: null,
            },
          ]
        : [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at:
      '2026-09-01T00:00:00Z',
    updated_at:
      '2026-09-01T00:00:00Z',
  }
}

function runCase(item) {
  const input =
    buildInput(
      item.turns,
      item.evaluated_at,
    )

  const reading =
    buildReading(item.reading)

  const state =
    buildState({
      partyKinds:
        item.state_party_kinds ?? [],
    })

  const reasoning =
    buildCommercialReasoning({
      reading,
      cycle_state: state,
      diagnostic_input: input,
      evaluated_at:
        item.evaluated_at,
    })

  const coaching =
    buildCommercialCoachingDiagnosis({
      reading,
      reasoning,
      diagnostic_input: input,
      evaluated_at:
        item.evaluated_at,
      cycle_state: state,
    })

  const strategy =
    buildCommercialMessageStrategy({
      reasoning,
      coaching,
      diagnostic_input: input,
    })

  const analysis =
    applySellerExecutionCoachingToNeutralView(
      buildAnalysisViewModel({
        current_reading: {
          reading,
          state_record_id: 'state-1',
          state_version: 1,
          state_updated_at:
            item.evaluated_at,
        },
        cycle_memory: null,
        method_coaching: null,
        decision_state: null,
        reference_time:
          item.evaluated_at,
      }),
      coaching,
    )

  return {
    input,
    reading,
    reasoning,
    coaching,
    strategy,
    analysis,
    temporal:
      reasoning.temporal_context,
  }
}

function techniqueIds(reasoning) {
  return reasoning.selected_techniques
    .map(
      technique =>
        technique.intelligence_id,
    )
}

for (const item of CORPUS.cases) {
  test(
    `golden ${item.id} (${item.industry}): ${item.scenario}`,
    () => {
      const {
        reasoning,
        coaching,
        strategy,
        analysis,
        temporal,
      } = runCase(item)

      const expect =
        item.expect

      const ids =
        techniqueIds(reasoning)

      if (expect.momentum) {
        assert.equal(
          temporal.momentum.state,
          expect.momentum,
          'momentum',
        )
      }

      if (expect.waiting_on) {
        assert.equal(
          temporal.momentum.waiting_on,
          expect.waiting_on,
          'waiting_on',
        )
      }

      if (expect.reactivation_mode) {
        assert.equal(
          temporal.reactivation.mode,
          expect.reactivation_mode,
          'reactivation mode',
        )
      }

      for (const mode of expect.reactivation_mode_not ?? []) {
        assert.notEqual(
          temporal.reactivation.mode,
          mode,
        )
      }

      if (
        typeof expect.requalify ===
          'boolean'
      ) {
        assert.equal(
          temporal.reactivation
            .requalify_before_continuing,
          expect.requalify,
          'requalify',
        )
      }

      if (expect.decision) {
        assert.equal(
          reasoning.decision,
          expect.decision,
          'decision',
        )
      }

      for (const decision of expect.decision_not ?? []) {
        assert.notEqual(
          reasoning.decision,
          decision,
          `decision não pode ser ${decision}`,
        )
      }

      if (expect.technique_first) {
        assert.equal(
          ids[0],
          expect.technique_first,
          `técnica principal (${ids.join(', ')})`,
        )
      }

      for (const technique of expect.technique_in ?? []) {
        assert.ok(
          ids.includes(technique),
          `técnica ${technique} esperada em ${ids.join(', ')}`,
        )
      }

      for (const technique of expect.technique_not ?? []) {
        assert.equal(
          ids[0] === technique,
          false,
          `técnica principal não pode ser ${technique}`,
        )
      }

      if (
        typeof expect.sequence_break ===
          'boolean'
      ) {
        assert.equal(
          coaching.sequence_break.happened,
          expect.sequence_break,
        )
      }

      if (expect.strength_must_not_match) {
        assert.doesNotMatch(
          coaching.seller_strength?.summary ?? '',
          new RegExp(
            expect.strength_must_not_match,
            'i',
          ),
          'principal acerto contraditório',
        )
      }

      if (expect.strength_must_match) {
        assert.match(
          coaching.seller_strength?.summary ?? '',
          new RegExp(
            expect.strength_must_match,
            'i',
          ),
        )
      }

      if (expect.mistake_must_match) {
        assert.match(
          coaching.seller_mistake?.summary ?? '',
          new RegExp(
            expect.mistake_must_match,
            'i',
          ),
        )
      }

      const findingKinds =
        coaching.additional_findings
          .map(
            finding =>
              finding.kind,
          )

      for (const kind of expect.findings_include ?? []) {
        assert.ok(
          findingKinds.includes(kind),
          `aprendizado ${kind} esperado em ${findingKinds.join(', ')}`,
        )
      }

      for (const kind of expect.findings_exclude ?? []) {
        assert.equal(
          findingKinds.includes(kind),
          false,
          `aprendizado ${kind} não esperado`,
        )
      }

      if (expect.findings_or_mistake_include) {
        const mistakeText =
          coaching.seller_mistake?.summary ?? ''

        assert.ok(
          findingKinds.includes(
            expect.findings_or_mistake_include,
          ) ||
            /repetida sem resposta|mesma ação comercial/i.test(
              mistakeText,
            ),
        )
      }

      if (
        typeof expect.intent_is_current ===
          'boolean'
      ) {
        assert.equal(
          coaching.client_intent_now?.is_current,
          expect.intent_is_current,
          'intenção atual vs histórica',
        )
      }

      if (expect.coaching_scope) {
        assert.equal(
          coaching.scope,
          expect.coaching_scope,
        )
      }

      if (expect.coaching_status) {
        assert.equal(
          coaching.status,
          expect.coaching_status,
        )
      }

      if (expect.do_not_do_match) {
        assert.ok(
          reasoning.do_not_do.some(
            item =>
              new RegExp(
                expect.do_not_do_match,
                'i',
              ).test(item),
          ),
          reasoning.do_not_do.join(' / '),
        )
      }

      if (expect.analysis_neutral_headline_match) {
        assert.equal(
          analysis.neutral,
          true,
        )
        assert.match(
          analysis.neutral_headline ?? '',
          new RegExp(
            expect.analysis_neutral_headline_match,
            'i',
          ),
        )
      }

      if (expect.strategy_required_action) {
        assert.equal(
          strategy.required_action_type,
          expect.strategy_required_action,
        )
      }

      for (const action of expect.strategy_blocks ?? []) {
        assert.ok(
          strategy.blocked_action_types.includes(action),
          `estratégia deveria bloquear ${action}: ${strategy.blocked_action_types.join(', ')}`,
        )
      }

      if (expect.strategy_anchor) {
        assert.ok(
          strategy.context_reference
            ?.anchors
            .includes(
              expect.strategy_anchor,
            ),
          JSON.stringify(
            strategy.context_reference,
          ),
        )
        assert.equal(
          strategy.context_reference
            .required_in_draft,
          true,
        )
      }

      if (expect.strategy_waiting_for) {
        assert.equal(
          strategy.temporal_frame
            ?.customer_waiting_for_seller_for,
          expect.strategy_waiting_for,
        )
      }

      for (const [message, violation] of expect.bad_messages ?? []) {
        const result =
          evaluateCommercialMessageDraft({
            message,
            strategy,
          })

        assert.ok(
          result.violations.includes(violation),
          `"${message}" deveria violar ${violation}: ${result.violations.join(', ')}`,
        )
      }

      for (const message of expect.good_messages ?? []) {
        const result =
          evaluateCommercialMessageDraft({
            message,
            strategy,
          })

        assert.deepEqual(
          result.violations,
          [],
          `"${message}" deveria passar`,
        )
      }
    },
  )
}

test(
  'Lorena live: mesmo elogio da tela real não convive com a quebra causada pela oferta em várias bolhas',
  () => {
    const { coaching } =
      runCase(caseById('A'))

    // Tela real: "Principal acerto: O vendedor respondeu o interesse do
    // cliente enviando oferta promocional detalhada com links para
    // matrícula" + "Principal ajuste: A condução saiu do objetivo...".
    assert.doesNotMatch(
      coaching.seller_strength?.summary ?? '',
      /oferta promocional detalhada/i,
    )
    assert.match(
      coaching.seller_mistake?.summary ?? '',
      /saiu do objetivo comercial/i,
    )

    const mistakeIds =
      new Set(
        coaching.seller_mistake
          .evidence_message_ids,
      )

    assert.equal(
      (
        coaching.seller_strength
          ?.evidence_message_ids ?? []
      ).some(
        id =>
          mistakeIds.has(id),
      ),
      false,
      'elogio e crítica não podem citar a mesma ação',
    )

    // A quebra cobre a oferta INTEIRA (três bolhas), não só a última.
    for (const id of ['m9', 'm10', 'm11']) {
      assert.ok(
        coaching.sequence_break
          .evidence_message_ids
          .includes(id),
        id,
      )
    }
  },
)

test(
  'Lorena: tempo chega ao cérebro — leitura temporal, histórico vs atual e método histórico',
  () => {
    const {
      coaching,
      reasoning,
      temporal,
    } = runCase(caseById('A'))

    assert.equal(
      temporal.intent.freshness,
      'stale',
    )
    assert.equal(
      temporal.intent.time_window_expired,
      true,
    )
    assert.equal(
      temporal.seller_timing
        .high_intent_request
        .first_response_addressed,
      false,
    )
    assert.equal(
      temporal.seller_timing
        .high_intent_request
        .assessment,
      'very_delayed',
    )
    assert.equal(
      temporal.reactivation
        .outbound_unanswered_turns,
      2,
    )

    assert.match(
      reasoning.current_situation,
      /interesse atual não está confirmado/i,
    )
    assert.doesNotMatch(
      reasoning.objective_now,
      /dia e hor[aá]rio/i,
    )
    assert.match(
      reasoning.objective_now,
      /como está esse interesse hoje/i,
    )

    assert.equal(
      coaching.method_state
        .historical_open_loops,
      true,
    )
    assert.equal(
      coaching.temporal
        .momentum_state,
      'dormant',
    )
    assert.ok(
      coaching.temporal.facts.some(
        fact =>
          /Última mensagem do cliente há 19 dias/.test(fact),
      ),
      coaching.temporal.facts.join(' | '),
    )
    assert.match(
      coaching.synthesis.diagnosis ?? '',
      /reconfirmado/i,
    )
    assert.match(
      coaching.client_intent_now.label,
      /não reconfirmado/i,
    )
  },
)

test(
  'TEMPO É EVIDÊNCIA: mesma transcrição com 30 minutos, 2 dias e 18 dias gera decisões diferentes',
  () => {
    const trio =
      CORPUS.temporal_trio

    const results =
      trio.versions.map(
        version =>
          runCase({
            turns: trio.turns,
            evaluated_at:
              version.evaluated_at,
            reading: {
              best_approach:
                'set_commitment',
            },
          }),
      )

    const [recent, twoDays, eighteenDays] =
      results

    assert.equal(
      recent.reasoning.decision,
      'wait',
    )
    assert.equal(
      techniqueIds(recent.reasoning)[0],
      'technique.commitment_wait',
    )

    assert.equal(
      twoDays.temporal.momentum.state,
      'cooling',
    )
    assert.equal(
      twoDays.reasoning.decision,
      'follow_up',
    )
    assert.equal(
      techniqueIds(twoDays.reasoning)[0],
      'technique.contextual_reengagement',
    )

    assert.equal(
      eighteenDays.temporal.momentum.state,
      'dormant',
    )
    assert.equal(
      eighteenDays.temporal.reactivation
        .requalify_before_continuing,
      true,
    )
    assert.equal(
      techniqueIds(eighteenDays.reasoning)[0],
      'technique.state_change_reactivation',
    )

    const signatures =
      results.map(
        result =>
          `${result.reasoning.decision}|${techniqueIds(result.reasoning)[0]}|${result.reasoning.objective_now}`,
      )

    assert.equal(
      new Set(signatures).size,
      3,
      'as três versões temporais precisam produzir decisões diferentes',
    )
  },
)

test(
  'momentum: os cinco casos canônicos de continuidade não produzem o mesmo próximo movimento',
  () => {
    // CASO A: cliente respondeu ontem e o vendedor ainda deve continuar.
    const customerRepliedYesterday =
      runCase({
        turns: [
          ['out', '2026-09-20T14:00:00Z', 'Posso te mostrar como funciona a assinatura?'],
          ['in', '2026-09-20T16:00:00Z', 'Pode sim, quanto custa o plano mensal?'],
        ],
        evaluated_at:
          '2026-09-21T12:00:00Z',
        reading: {
          best_approach: 'respond',
        },
      })

    // CASO B: vendedor perguntou ontem e o cliente ainda não respondeu.
    const sellerAskedYesterday =
      runCase(caseById('D'))

    // CASO C: cliente respondeu há 18 dias e houve vários outbound.
    const dormantWithOutbound =
      runCase(caseById('A'))

    // CASO D: cliente pediu algo e o vendedor desapareceu 9 dias.
    const sellerDisappeared =
      runCase({
        turns: [
          ['out', '2026-09-10T11:00:00Z', 'Oi! Em que posso ajudar?'],
          ['in', '2026-09-10T11:30:00Z', 'Quero agendar uma avaliação para esta semana.'],
        ],
        evaluated_at:
          '2026-09-19T12:00:00Z',
        reading: {
          best_approach: 'set_commitment',
        },
      })

    // CASO E: cliente disse que resolveu/comprou em outro lugar.
    const closedByCustomer =
      runCase(caseById('P'))

    const cases = [
      customerRepliedYesterday,
      sellerAskedYesterday,
      dormantWithOutbound,
      sellerDisappeared,
      closedByCustomer,
    ]

    const moves =
      cases.map(
        result =>
          `${result.temporal.reactivation.mode}|${result.reasoning.decision}|${techniqueIds(result.reasoning)[0] ?? 'none'}|${result.reasoning.objective_now}`,
      )

    assert.equal(
      new Set(moves).size,
      5,
      moves.join('\n'),
    )

    assert.equal(
      customerRepliedYesterday.temporal
        .momentum.waiting_on,
      'seller',
    )
    assert.equal(
      sellerDisappeared.temporal
        .momentum.state,
      'dormant',
    )
    assert.equal(
      sellerDisappeared.temporal
        .reactivation.mode,
      'recover_delay',
    )
    assert.equal(
      closedByCustomer.temporal
        .reactivation.mode,
      'respect_closure',
    )
  },
)

test(
  'janela multiday do Commercial Reading preserva o pedido comercial que originou a oportunidade',
  () => {
    const ledger = []

    const push = (
      id,
      direction,
      at,
      text,
    ) =>
      ledger.push({
        id,
        company_id: 'company-golden',
        cycle_id: 'cycle-golden',
        conversation_key:
          'conversation-golden',
        message_key: `key-${id}`,
        version: 1,
        direction,
        author_kind:
          direction === 'incoming'
            ? 'customer'
            : 'human_agent',
        occurred_at: at,
        observed_at: at,
        content_type: 'text',
        text_content: text,
        audio_transcription: null,
        is_deleted: false,
        deletion_reason: null,
      })

    push('1', 'incoming', '2026-09-01T12:00:00.000Z', 'Quero contratar o plano anual. Como faço o pagamento?')
    push('2', 'outgoing', '2026-09-01T12:05:00.000Z', 'Segue o link de pagamento.')

    for (let index = 0; index < 8; index += 1) {
      push(
        String(10 + index),
        index % 2 === 0
          ? 'incoming'
          : 'outgoing',
        `2026-09-05T12:${String(10 + index).padStart(2, '0')}:00.000Z`,
        index % 2 === 0
          ? 'Tudo certo por aí?'
          : 'Tudo sim, obrigado!',
      )
    }

    push('30', 'incoming', '2026-09-12T12:00:00.000Z', 'Bom dia!')

    const selected =
      selectStatefulDiagnosticMessages(
        ledger,
      ).map(
        message =>
          message.id,
      )

    assert.ok(
      selected.includes('1'),
      `pedido comercial original precisa estar na janela: ${selected.join(',')}`,
    )
    assert.ok(
      selected.includes('2'),
      'resposta imediata do vendedor ao pedido acompanha a âncora',
    )
    assert.ok(
      selected.includes('30'),
    )
  },
)

test(
  'MENSAGEM live: estratégia válida chega a copy válida mesmo quando o redator insiste em "fico à disposição"',
  async () => {
    const {
      reasoning,
      strategy,
    } = runCase(caseById('A'))

    const outputs = [
      {
        message:
          'Oi, Lorena! Qual dia e horário fica melhor para você fazer a aula experimental?',
      },
      {
        message:
          'Oi, Lorena! Da última vez que falamos você queria fazer uma aula experimental. Como ficou isso por aí desde então? Fico à disposição!',
      },
    ]

    const calls = []

    const provider = async request => {
      calls.push(request)

      if (
        request.prompt_version
          .includes('review')
      ) {
        const candidate =
          JSON.parse(
            request.user_prompt,
          ).candidate_message

        return {
          content:
            JSON.stringify({
              message: candidate,
              changed: false,
              issue_code: 'none',
            }),
          provider: 'test',
        }
      }

      const output =
        outputs.shift()

      if (!output) {
        throw new Error('sem saída')
      }

      return {
        content:
          JSON.stringify(output),
        provider: 'test',
      }
    }

    const result =
      await composeSellerMessage({
        workingSummary:
          'Lorena pediu para fazer uma aula experimental; a pergunta de dia e horário ficou sem resposta e depois foi enviada uma oferta de planos.',
        currentInteraction: [
          {
            direction: 'outgoing',
            occurred_at:
              '2026-09-25T13:00:00Z',
            text:
              'PROMOÇÃO DE SETEMBRO! Plano mensal R$ 129,90. Faça sua matrícula e aproveite!',
          },
        ],
        sellerIntent:
          'Quero responder ao ponto principal desta conversa.',
        recipientName:
          'Lorena Galvão',
        method: {
          name: 'Método',
          description: null,
          stages: [],
          business_context: null,
          seller_rules: [],
        },
        reasoning,
        messageStrategy:
          strategy,
        provider,
      })

    assert.equal(
      result.status,
      'ready',
      result.error ?? '',
    )
    assert.equal(
      result.message,
      'Oi, Lorena! Da última vez que falamos você queria fazer uma aula experimental. Como ficou isso por aí desde então?',
    )

    const firstPrompt =
      calls[0].system_prompt

    assert.match(
      firstPrompt,
      /requalify_before_continuing/,
    )
    assert.match(
      firstPrompt,
      /intenção antiga do cliente NÃO está confirmada/,
    )

    const secondPrompt =
      calls[1].system_prompt

    assert.match(
      secondPrompt,
      /tratou a intenção antiga do cliente como confirmada/,
      'a correção carrega o motivo concreto da falha anterior',
    )
  },
)

test(
  'temporal context é determinístico e usa o instante avaliado, não o relógio do processo',
  () => {
    const item =
      caseById('E')

    const input =
      buildInput(
        item.turns,
        item.evaluated_at,
      )

    const trace =
      buildSellerExecutionTrace({
        diagnostic_input: input,
      })

    const first =
      buildCommercialTemporalContext({
        diagnostic_input: input,
        trace,
        evaluated_at:
          item.evaluated_at,
      })

    const second =
      buildCommercialTemporalContext({
        diagnostic_input: input,
        trace,
        evaluated_at:
          item.evaluated_at,
      })

    assert.deepEqual(first, second)
    assert.equal(
      first.evaluated_at,
      new Date(item.evaluated_at).toISOString(),
    )
  },
)

// ============================================================================
// Rodada de fechamento (PR #356): rejeição vs mudança dentro da
// oportunidade, saudação vs conteúdo, frescor de intenção por engajamento
// relacionado, momentum progressivo e pausa combinada.
// ============================================================================

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const REENGAGEMENT_TECHNIQUES = [
  'technique.contextual_reengagement',
  'technique.permission_based_reengagement',
  'technique.state_change_reactivation',
  'technique.pattern_interrupt_reengagement',
]

const OPERATIONAL_TECHNIQUES = [
  'technique.guided_choice',
  'technique.explicit_close_execution',
  'technique.commitment_ladder',
  'technique.discovery_before_prescription',
  'technique.value_linkage',
  'technique.comparison_by_criteria',
]

const OPERATIONAL_DECISIONS = [
  'close',
  'set_commitment',
  'compare',
  'demonstrate_value',
  'deepen_discovery',
]

function shift(iso, ms) {
  return new Date(
    Date.parse(iso) + ms,
  ).toISOString()
}

function stanceTurns(item) {
  const start =
    '2026-09-23T13:00:00.000Z'

  return {
    turns: [
      ['in', start, item.opener],
      ['out', shift(start, 5 * MINUTE), item.offer],
      ['in', shift(start, 20 * MINUTE), item.text],
    ],
    evaluated_at:
      shift(start, 30 * MINUTE),
  }
}

// Coleta todos os resultados da rodada para a auditoria transversal.
const ROUND_TWO_RESULTS = []

function run(item) {
  const result =
    runCase(item)

  ROUND_TWO_RESULTS.push({
    label:
      item.label ??
      item.evaluated_at,
    ...result,
  })

  return result
}

test(
  'P1 rejeição da oportunidade vs mudança dentro da oportunidade (golden multissetorial)',
  () => {
    for (const item of CORPUS.opportunity_stance.cases) {
      const scenario =
        stanceTurns(item)

      const {
        temporal,
        reasoning,
        coaching,
        input,
      } =
        run({
          ...scenario,
          label: `stance ${item.id}`,
        })

      const stance =
        assessCustomerOpportunityStance(
          item.text,
        ).stance

      const trace =
        buildSellerExecutionTrace({
          diagnostic_input: input,
        })

      const lastSignal =
        trace.customer_signals.at(-1)

      const label =
        `${item.id} (${item.industry}): "${item.text}"`

      if (item.expect.closed) {
        assert.equal(
          stance,
          'rejects_opportunity',
          label,
        )
        assert.equal(
          lastSignal?.kind,
          'disengaged',
          label,
        )
        assert.equal(
          temporal.momentum.state,
          'closed',
          label,
        )
        assert.equal(
          temporal.reactivation.mode,
          'respect_closure',
          label,
        )
        assert.equal(
          techniqueIds(reasoning)[0],
          'technique.respectful_closure',
          label,
        )
        assert.equal(
          reasoning.decision,
          'give_space',
          label,
        )
        continue
      }

      assert.equal(
        stance,
        'changes_within_opportunity',
        label,
      )
      assert.equal(
        lastSignal?.kind,
        item.expect.intent_kind,
        label,
      )
      assert.notEqual(
        temporal.momentum.state,
        'closed',
        label,
      )
      assert.equal(
        temporal.reactivation.mode,
        'respond_now',
        `${label}: o cliente escolheu/avançou e espera o vendedor`,
      )
      assert.equal(
        techniqueIds(reasoning).includes(
          'technique.respectful_closure',
        ),
        false,
        label,
      )
      assert.notEqual(
        reasoning.decision,
        'give_space',
        label,
      )
      assert.notEqual(
        coaching.client_intent_now?.kind,
        'disengaged',
        label,
      )
    }
  },
)

test(
  'P2 saudação pura é rapport; saudação com oferta/disponibilidade/proposta/agenda é resposta com conteúdo',
  () => {
    for (const text of CORPUS.greeting_vs_content.pure_greetings) {
      assert.equal(
        classifySellerActionText(text),
        'rapport_opening',
        text,
      )
    }

    for (const text of CORPUS.greeting_vs_content.greeting_with_content) {
      assert.notEqual(
        classifySellerActionText(text),
        'rapport_opening',
        text,
      )
    }

    // Na cadeia: saudação pura em resposta a um pedido é pedido ignorado;
    // saudação com disponibilidade responde ao pedido.
    const start =
      '2026-09-24T12:00:00.000Z'

    const signalsFor = reply => {
      const input =
        buildInput(
          [
            ['in', start, 'Quero agendar uma avaliação.'],
            ['out', shift(start, 5 * MINUTE), reply],
          ],
          shift(start, 10 * MINUTE),
        )

      return buildSellerExecutionTrace({
        diagnostic_input: input,
      }).turns.flatMap(
        turn =>
          turn.negative_signals,
      )
    }

    assert.ok(
      signalsFor('Oi, Maria').includes(
        'request_not_addressed',
      ),
    )
    assert.equal(
      signalsFor('Oi, temos horários amanhã às 10h ou às 15h.').includes(
        'request_not_addressed',
      ),
      false,
    )
    assert.equal(
      signalsFor('Oi, posso agendar amanhã às 10h?').includes(
        'request_not_addressed',
      ),
      false,
    )
  },
)

test(
  'P1 RECÊNCIA DA CONVERSA != RECÊNCIA DA INTENÇÃO: "Bom dia" no dia 6 não rejuvenesce "Quero contratar" do dia 1',
  () => {
    const fixture =
      CORPUS.intent_refresh

    const demonstratedAt =
      fixture.base_turns[0][1]

    for (const text of fixture.irrelevant) {
      const {
        temporal,
        reasoning,
        coaching,
        strategy,
      } =
        run({
          label: `refresh irrelevant ${text}`,
          turns: [
            ...fixture.base_turns,
            ['in', fixture.day6_at, text],
          ],
          evaluated_at:
            fixture.evaluated_at,
          reading: {
            best_approach:
              'close',
          },
        })

      assert.equal(
        temporal.intent.kind,
        'close',
        text,
      )
      assert.equal(
        Date.parse(
          temporal.intent
            .last_engagement_at,
        ),
        Date.parse(demonstratedAt),
        `${text}: mensagem fática não renova a intenção`,
      )
      assert.equal(
        temporal.intent.refreshed_by,
        'new_statement',
        text,
      )
      assert.equal(
        temporal.intent.freshness,
        'stale',
        text,
      )
      assert.equal(
        temporal.intent
          .needs_reconfirmation,
        true,
        text,
      )
      assert.ok(
        temporal.intent.vitality < 0.5,
        `${text}: vitalidade ${temporal.intent.vitality}`,
      )

      // O cliente falou agora: responder já — mas reconfirmando.
      assert.equal(
        temporal.reactivation.mode,
        'respond_now',
        text,
      )
      assert.equal(
        temporal.reactivation
          .requalify_before_continuing,
        true,
        text,
      )
      assert.equal(
        techniqueIds(reasoning)[0],
        'technique.state_change_reactivation',
        text,
      )
      assert.equal(
        reasoning.decision,
        'respond',
        text,
      )
      assert.equal(
        coaching.client_intent_now
          ?.is_current,
        false,
        text,
      )
      assert.ok(
        strategy.blocked_action_types.includes(
          'close_request',
        ),
        text,
      )
      assert.ok(
        temporal.narrative.facts.some(
          fact =>
            /não o reconfirmaram/.test(fact),
        ),
        text,
      )
    }

    for (const text of fixture.reconfirming) {
      const {
        temporal,
        reasoning,
        coaching,
      } =
        run({
          label: `refresh reconfirming ${text}`,
          turns: [
            ...fixture.base_turns,
            ['in', fixture.day6_at, text],
          ],
          evaluated_at:
            fixture.evaluated_at,
          reading: {
            best_approach:
              'close',
          },
        })

      assert.equal(
        Date.parse(
          temporal.intent
            .last_engagement_at,
        ),
        Date.parse(fixture.day6_at),
        `${text}: reconfirmação legítima renova a intenção`,
      )
      assert.equal(
        temporal.intent.kind,
        'close',
        `${text}: a reconfirmação renova a intenção forte, não a rebaixa`,
      )
      assert.equal(
        temporal.intent.freshness,
        'current',
        text,
      )
      assert.equal(
        temporal.intent
          .needs_reconfirmation,
        false,
        text,
      )
      assert.equal(
        temporal.reactivation
          .requalify_before_continuing,
        false,
        text,
      )
      assert.notEqual(
        techniqueIds(reasoning)[0],
        'technique.state_change_reactivation',
        text,
      )
      assert.equal(
        coaching.client_intent_now
          ?.is_current,
        true,
        text,
      )
    }

    // Resposta com conteúdo à ação do vendedor que deu sequência à
    // intenção também renova (mesmo sem repetir a intenção).
    const answered =
      run({
        label: 'refresh answer',
        turns: [
          ['in', '2026-09-01T13:00:00Z', 'Quero contratar.'],
          ['out', '2026-09-01T13:05:00Z', 'Perfeito! Prefere o plano mensal ou o anual?'],
          ['in', '2026-09-04T12:00:00Z', 'O anual.'],
        ],
        evaluated_at:
          '2026-09-04T12:10:00Z',
        reading: {
          best_approach:
            'close',
        },
      })

    assert.equal(
      Date.parse(
        answered.temporal.intent
          .last_engagement_at,
      ),
      Date.parse(
        '2026-09-04T12:00:00Z',
      ),
    )
    assert.equal(
      answered.temporal.intent
        .needs_reconfirmation,
      false,
    )
  },
)

test(
  'MOMENTUM PROGRESSIVO: mesma conversa em 9 instantes — tempo quantitativo, piora gradual, técnica acompanha a intensidade',
  () => {
    const fixture =
      CORPUS.progression

    const sellerAt =
      Date.parse(
        fixture.turns[1][1],
      )

    const intentAt =
      Date.parse(
        fixture.turns[0][1],
      )

    const points =
      fixture.points.map(
        point => ({
          label: point.label,
          ...run({
            label: `progression ${point.label}`,
            turns: fixture.turns,
            evaluated_at:
              point.evaluated_at,
            reading: {
              best_approach:
                'set_commitment',
            },
          }),
        }),
      )

    // 1. O tempo quantitativo é preservado (não vira só um balde).
    for (const [index, point] of points.entries()) {
      const evaluatedAt =
        Date.parse(
          fixture.points[index]
            .evaluated_at,
        )

      const progression =
        point.temporal.progression

      assert.equal(
        progression.silence_ms,
        evaluatedAt - sellerAt,
        point.label,
      )
      assert.equal(
        progression.intent_related_age_ms,
        evaluatedAt - intentAt,
        point.label,
      )
      assert.equal(
        progression.expected_window_ms,
        36 * HOUR,
        point.label,
      )
      assert.ok(
        Math.abs(
          progression.elapsed_ratio -
            (evaluatedAt - sellerAt) /
              (36 * HOUR),
        ) < 0.01,
        point.label,
      )
    }

    // 2/3. Sem fato novo, a severidade sobe e a vitalidade da intenção
    // cai a cada ponto — inclusive dentro do mesmo estágio (5d vs 7d).
    for (
      let index = 1;
      index < points.length;
      index += 1
    ) {
      const previous =
        points[index - 1].temporal.progression

      const current =
        points[index].temporal.progression

      assert.ok(
        current.severity >
          previous.severity,
        `${points[index].label}: severidade ${current.severity} deveria superar ${previous.severity}`,
      )
      assert.ok(
        current.intent_vitality <
          previous.intent_vitality,
        `${points[index].label}: vitalidade ${current.intent_vitality} deveria cair abaixo de ${previous.intent_vitality}`,
      )
    }

    const stages =
      points.map(
        point =>
          point.temporal.progression.stage,
      )

    assert.deepEqual(
      stages,
      [
        'within_rhythm',
        'within_rhythm',
        'within_rhythm',
        'early_loss',
        'prolonged_silence',
        'strong_gap',
        'strong_gap',
        'long_dormancy',
        'long_dormancy',
      ],
    )

    assert.deepEqual(
      points.map(
        point =>
          point.temporal.intent.freshness,
      ),
      [
        'current',
        'current',
        'current',
        'aging',
        'aging',
        'stale',
        'stale',
        'stale',
        'stale',
      ],
    )

    // 4. Nenhum salto único de "normal" para "reativação": entre a última
    // espera e a primeira reativação há movimentos intermediários.
    const modes =
      points.map(
        point =>
          point.temporal.reactivation.mode,
      )

    assert.deepEqual(
      modes,
      [
        // 30 min: troca ainda ativa (o vendedor acabou de agir).
        'none',
        'wait',
        'wait',
        'light_follow_up',
        'light_follow_up',
        'light_follow_up',
        'light_follow_up',
        'reactivate',
        'reactivate',
      ],
    )

    const lastWait =
      modes.lastIndexOf('wait')

    const firstReactivate =
      modes.indexOf('reactivate')

    assert.ok(
      firstReactivate - lastWait >= 3,
    )

    // 5. A técnica acompanha a intensidade da lacuna.
    const firstTechniques =
      points.map(
        point =>
          techniqueIds(point.reasoning)[0],
      )

    assert.deepEqual(
      firstTechniques,
      [
        'technique.commitment_wait',
        'technique.commitment_wait',
        'technique.commitment_wait',
        'technique.contextual_reengagement',
        'technique.permission_based_reengagement',
        'technique.state_change_reactivation',
        'technique.state_change_reactivation',
        'technique.state_change_reactivation',
        'technique.state_change_reactivation',
      ],
    )

    const techniqueChanges =
      firstTechniques.filter(
        (id, index) =>
          index > 0 &&
          id !==
            firstTechniques[index - 1],
      ).length

    assert.ok(
      techniqueChanges >= 3,
    )

    // Reconfirmação só entra quando a intenção perdeu força suficiente.
    assert.deepEqual(
      points.map(
        point =>
          point.temporal.reactivation
            .requalify_before_continuing,
      ),
      [
        false,
        false,
        false,
        false,
        false,
        true,
        true,
        true,
        true,
      ],
    )

    // A mensagem recebe a intensidade, não só o balde.
    for (const point of points.slice(3)) {
      assert.equal(
        point.strategy.temporal_frame
          .momentum_stage,
        point.temporal.progression.stage,
      )
      assert.equal(
        point.strategy.temporal_frame
          .gap_severity,
        point.temporal.progression.severity,
      )
    }

    assert.notEqual(
      points[3].reasoning.objective_now,
      points[4].reasoning.objective_now,
    )
    assert.notEqual(
      points[4].reasoning.objective_now,
      points[5].reasoning.objective_now,
    )
    assert.notEqual(
      points[3].reasoning.current_situation,
      points[4].reasoning.current_situation,
    )
  },
)

test(
  'MOMENTUM PROGRESSIVO: com ritmo observado de 1 dia, 2 dias e 6 dias de silêncio são leituras diferentes',
  () => {
    const fixture =
      CORPUS.progression
        .observed_rhythm

    const [twoDays, sixDays] =
      [
        fixture.two_days,
        fixture.six_days,
      ].map(
        evaluatedAt =>
          run({
            label: `observed ${evaluatedAt}`,
            turns: fixture.turns,
            evaluated_at:
              evaluatedAt,
            reading: {
              best_approach:
                'set_commitment',
            },
          }),
      )

    for (const result of [twoDays, sixDays]) {
      assert.equal(
        result.temporal.cadence.basis,
        'observed',
      )
      assert.equal(
        result.temporal.progression
          .expected_window_ms,
        DAY,
      )
    }

    assert.equal(
      twoDays.temporal.progression
        .elapsed_ratio,
      2,
    )
    assert.equal(
      sixDays.temporal.progression
        .elapsed_ratio,
      6,
    )
    assert.ok(
      sixDays.temporal.progression.severity >
        twoDays.temporal.progression.severity + 0.3,
    )
    assert.notEqual(
      twoDays.temporal.progression.stage,
      sixDays.temporal.progression.stage,
    )
    assert.notEqual(
      twoDays.temporal.reactivation.mode,
      sixDays.temporal.reactivation.mode,
    )
    assert.notEqual(
      techniqueIds(twoDays.reasoning)[0],
      techniqueIds(sixDays.reasoning)[0],
    )
    assert.ok(
      sixDays.temporal.narrative.facts.some(
        fact =>
          /cerca de 6 vezes o ritmo de resposta deste cliente/.test(
            fact,
          ),
      ),
      sixDays.temporal.narrative.facts.join(' | '),
    )
  },
)

test(
  'PAUSA COMBINADA: "me chama semana que vem" muda a curva — 2 a 4 dias dentro do combinado não são silêncio',
  () => {
    const fixture =
      CORPUS.agreed_pause

    for (const evaluatedAt of fixture.inside_points) {
      const deferred =
        run({
          label: `pause inside ${evaluatedAt}`,
          turns: fixture.deferred_turns,
          evaluated_at:
            evaluatedAt,
          reading: {
            best_approach:
              'set_commitment',
          },
        })

      const undeferred =
        run({
          label: `no pause ${evaluatedAt}`,
          turns: fixture.undeferred_turns,
          evaluated_at:
            evaluatedAt,
          reading: {
            best_approach:
              'set_commitment',
          },
        })

      const pause =
        deferred.temporal.progression

      assert.equal(
        pause.responsible,
        'agreed_pause',
        evaluatedAt,
      )
      assert.equal(
        pause.agreed_pause.status,
        'in_progress',
      )
      assert.equal(
        pause.agreed_pause
          .seller_owes_contact,
        true,
      )
      assert.equal(
        pause.stage,
        'within_rhythm',
        evaluatedAt,
      )
      assert.equal(
        deferred.temporal.reactivation.mode,
        'wait',
        evaluatedAt,
      )
      assert.equal(
        deferred.reasoning.decision,
        'wait',
        evaluatedAt,
      )
      assert.equal(
        REENGAGEMENT_TECHNIQUES.includes(
          techniqueIds(deferred.reasoning)[0],
        ),
        false,
        evaluatedAt,
      )

      // Mesmo intervalo sem combinado: já é perda de continuidade.
      assert.equal(
        undeferred.temporal.progression
          .responsible,
        'customer',
      )
      assert.notEqual(
        undeferred.temporal.progression.stage,
        'within_rhythm',
        evaluatedAt,
      )
      assert.equal(
        undeferred.temporal.reactivation.mode,
        'light_follow_up',
        evaluatedAt,
      )
      assert.ok(
        undeferred.temporal.progression.severity >
          pause.severity,
      )
      assert.ok(
        undeferred.temporal.intent.vitality <
          deferred.temporal.intent.vitality,
        `${evaluatedAt}: a intenção envelhece mais devagar dentro do combinado`,
      )
    }

    // Segunda-feira: chegou o momento combinado — é a vez do vendedor.
    const due =
      run({
        label: 'pause due',
        turns: fixture.deferred_turns,
        evaluated_at:
          fixture.due_at,
        reading: {
          best_approach:
            'set_commitment',
        },
      })

    assert.equal(
      due.temporal.progression
        .agreed_pause.status,
      'due',
    )
    assert.equal(
      due.temporal.progression.responsible,
      'seller',
    )
    assert.equal(
      due.temporal.reactivation.mode,
      'light_follow_up',
    )
    assert.ok(
      due.temporal.reactivation.reason_codes.includes(
        'agreed_recontact_due',
      ),
    )
    assert.equal(
      techniqueIds(due.reasoning)[0],
      'technique.contextual_reengagement',
    )
    assert.equal(
      due.reasoning.decision,
      'follow_up',
    )
    assert.ok(
      due.temporal.narrative.facts.some(
        fact =>
          /chegou o momento combinado/.test(fact),
      ),
    )

    // Muito depois do combinado, sem contato: a curva volta a piorar.
    const longAfter =
      run({
        label: 'pause long after',
        turns: fixture.deferred_turns,
        evaluated_at:
          fixture.long_after,
        reading: {
          best_approach:
            'set_commitment',
        },
      })

    assert.equal(
      longAfter.temporal.progression
        .agreed_pause.status,
      'overdue',
    )
    assert.ok(
      longAfter.temporal.progression.severity >
        due.temporal.progression.severity,
    )
    assert.equal(
      longAfter.temporal.reactivation
        .requalify_before_continuing,
      true,
    )
  },
)

test(
  'URGÊNCIA DO CLIENTE: "quero contratar hoje" torna 3 horas de espera um atraso; pedido sem urgência não',
  () => {
    const fixture =
      CORPUS.time_sensitive_request

    const urgent =
      run({
        label: 'urgent',
        turns: fixture.urgent_turns,
        evaluated_at:
          fixture.evaluated_at,
      })

    const standard =
      run({
        label: 'standard',
        turns: fixture.standard_turns,
        evaluated_at:
          fixture.evaluated_at,
      })

    const owed =
      urgent.temporal.progression
        .owed_response

    assert.equal(
      owed.basis,
      'time_sensitive_intent',
    )
    assert.equal(
      owed.overdue_ratio,
      3,
    )
    assert.ok(owed.severity > 0)
    assert.equal(
      urgent.temporal.progression
        .expected_window_basis,
      'time_sensitive_intent',
    )
    assert.equal(
      urgent.temporal.reactivation.mode,
      'recover_delay',
    )
    assert.equal(
      techniqueIds(urgent.reasoning)[0],
      'technique.delayed_response_recovery',
    )
    assert.equal(
      urgent.reasoning.decision,
      'respond',
    )

    assert.equal(
      standard.temporal.progression
        .owed_response.basis,
      'standard',
    )
    assert.equal(
      standard.temporal.reactivation.mode,
      'respond_now',
    )
  },
)

test(
  'AUDITORIA TRANSVERSAL de invariantes sobre todos os goldens da rodada',
  () => {
    const all = [
      ...ROUND_TWO_RESULTS,
      ...CORPUS.cases.map(
        item => ({
          label: `case ${item.id}`,
          ...runCase(item),
        }),
      ),
    ]

    assert.ok(all.length >= 40)

    for (const result of all) {
      const {
        label,
        temporal,
        reasoning,
        coaching,
        strategy,
      } = result

      // Espera nunca produz mensagem nem convive com cliente aguardando.
      if (reasoning.decision === 'wait') {
        assert.notEqual(
          temporal.momentum.waiting_on,
          'seller',
          `${label}: espera com cliente aguardando o vendedor`,
        )
        assert.ok(
          ['wait', 'none'].includes(
            temporal.reactivation.mode,
          ),
          `${label}: espera com modo ${temporal.reactivation.mode}`,
        )
        assert.equal(
          strategy.desired_microcommitment,
          null,
          `${label}: espera não pede microcompromisso`,
        )
      }

      // Intenção que precisa ser reconfirmada nunca vira passo operacional
      // nem aparece como atual.
      if (
        temporal.reactivation
          .requalify_before_continuing
      ) {
        assert.equal(
          OPERATIONAL_TECHNIQUES.includes(
            techniqueIds(reasoning)[0],
          ),
          false,
          `${label}: técnica operacional com intenção não reconfirmada`,
        )
        assert.equal(
          OPERATIONAL_DECISIONS.includes(
            reasoning.decision,
          ),
          false,
          `${label}: decisão ${reasoning.decision} com intenção não reconfirmada`,
        )
      }

      if (
        temporal.intent
          ?.needs_reconfirmation &&
        coaching.client_intent_now
      ) {
        assert.equal(
          coaching.client_intent_now
            .is_current,
          false,
          `${label}: intenção antiga apresentada como atual`,
        )
      }

      // Encerramento explícito sempre é respeitado.
      if (temporal.momentum.state === 'closed') {
        assert.equal(
          temporal.reactivation.mode,
          'respect_closure',
          label,
        )
      }

      // A mesma ação nunca é elogio e erro ao mesmo tempo.
      if (
        coaching.seller_strength &&
        coaching.seller_mistake
      ) {
        const mistakeIds =
          new Set(
            coaching.seller_mistake
              .evidence_message_ids,
          )

        assert.equal(
          coaching.seller_strength
            .evidence_message_ids.some(
              id =>
                mistakeIds.has(id),
            ),
          false,
          `${label}: mesma mensagem como acerto e erro`,
        )
      }

      // Reativação considera o tempo: todo movimento temporal carrega a
      // intensidade quantitativa.
      if (
        ['light_follow_up', 'reactivate'].includes(
          temporal.reactivation.mode,
        )
      ) {
        assert.ok(
          temporal.progression.severity > 0,
          label,
        )
        assert.equal(
          typeof temporal.progression
            .elapsed_ratio,
          'number',
          label,
        )
      }

      // A estratégia de mensagem continua gerando copy quando há algo a
      // enviar.
      if (
        !['wait', 'give_space', 'no_intervention'].includes(
          reasoning.decision,
        ) &&
        reasoning.status !== 'silent'
      ) {
        assert.ok(
          strategy.objective,
          `${label}: decisão ${reasoning.decision} sem objetivo de mensagem`,
        )
      }
    }
  },
)

// ============================================================================
// Revisão final (PR #356): opt-out, pareamento de âncora, adiamentos com
// horizonte explícito e janela "esta semana" no calendário.
// ============================================================================

test(
  'OPT-OUT: "não quero mais receber mensagens" proíbe qualquer nova mensagem; encerramento comum ainda permite agradecer',
  async () => {
    const start =
      '2026-09-24T13:00:00.000Z'

    const turnsFor = text => [
      ['in', start, 'Quero saber sobre o curso de inglês.'],
      ['out', shift(start, 5 * MINUTE), 'Temos turmas à noite e aos sábados. Qual horário te atende?'],
      ['in', shift(start, 20 * MINUTE), text],
    ]

    for (const text of [
      'Pode me tirar da lista, por favor.',
      'Não quero mais receber mensagens.',
      'Para de me mandar mensagem.',
      'Stop',
    ]) {
      const {
        temporal,
        reasoning,
        coaching,
        strategy,
      } =
        runCase({
          turns: turnsFor(text),
          evaluated_at:
            shift(start, 30 * MINUTE),
        })

      assert.equal(temporal.momentum.state, 'closed', text)
      assert.equal(temporal.reactivation.mode, 'respect_closure', text)
      assert.equal(temporal.reactivation.contact_allowed, false, text)
      assert.ok(
        temporal.reactivation.reason_codes.includes(
          'customer_requested_no_contact',
        ),
        text,
      )
      assert.match(reasoning.objective_now, /Não enviar nenhuma mensagem/, text)
      assert.ok(
        reasoning.do_not_do.some(
          item =>
            /nem agradecimento/.test(item),
        ),
        text,
      )
      assert.equal(coaching.temporal.contact_allowed, false, text)
      assert.equal(strategy.outbound_allowed, false, text)
      assert.equal(strategy.objective, null, text)
      assert.equal(strategy.desired_microcommitment, null, text)
      assert.equal(strategy.required_action_type, null, text)

      let providerCalls = 0

      const generation =
        await composeSellerMessage({
          workingSummary:
            'Cliente perguntou sobre o curso e depois pediu para não receber mais contato.',
          sellerIntent:
            'Quero agradecer e deixar a porta aberta.',
          method: {
            name: 'Método',
            description: null,
            stages: [],
            business_context: null,
            seller_rules: [],
          },
          reasoning,
          messageStrategy:
            strategy,
          provider:
            async () => {
              providerCalls += 1
              throw new Error('não deveria gerar')
            },
        })

      assert.equal(generation.status, 'no_message', text)
      assert.equal(generation.message, null, text)
      assert.equal(providerCalls, 0, `${text}: nenhuma chamada ao redator`)
    }

    // Encerramento comum (resolveu por outro caminho) não é opt-out.
    const ordinary =
      runCase({
        turns: turnsFor(
          'Obrigada, mas já fechei com outra escola.',
        ),
        evaluated_at:
          shift(start, 30 * MINUTE),
      })

    assert.equal(ordinary.temporal.momentum.state, 'closed')
    assert.equal(ordinary.temporal.reactivation.contact_allowed, true)
    assert.equal(ordinary.strategy.outbound_allowed, true)
    assert.ok(ordinary.strategy.objective)
  },
)

test(
  'ÂNCORA da janela multi-dia só é pareada com a resposta ao MESMO turno do cliente',
  () => {
    const ledgerWith = interveningTexts => {
      const ledger = []

      const push = (
        id,
        direction,
        at,
        text,
      ) =>
        ledger.push({
          id,
          company_id: 'company-golden',
          cycle_id: 'cycle-golden',
          conversation_key:
            'conversation-golden',
          message_key: `key-${id}`,
          version: 1,
          direction,
          author_kind:
            direction === 'incoming'
              ? 'customer'
              : 'human_agent',
          occurred_at: at,
          observed_at: at,
          content_type: 'text',
          text_content: text,
          audio_transcription: null,
          is_deleted: false,
          deletion_reason: null,
        })

      push('1', 'incoming', '2026-09-01T12:00:00.000Z', 'Quero contratar o plano anual.')

      interveningTexts.forEach(
        (text, index) =>
          push(
            `i${index}`,
            'incoming',
            `2026-09-01T12:0${index + 1}:00.000Z`,
            text,
          ),
      )

      push('2', 'outgoing', '2026-09-01T12:09:00.000Z', 'Anotado, obrigado!')

      for (let index = 0; index < 8; index += 1) {
        push(
          String(10 + index),
          index % 2 === 0
            ? 'incoming'
            : 'outgoing',
          `2026-09-05T12:${String(10 + index).padStart(2, '0')}:00.000Z`,
          index % 2 === 0
            ? 'Tudo certo por aí?'
            : 'Tudo sim, obrigado!',
        )
      }

      push('30', 'incoming', '2026-09-12T12:00:00.000Z', 'Bom dia!')

      return selectStatefulDiagnosticMessages(
        ledger,
      ).map(
        message =>
          message.id,
      )
    }

    // Uma fala intermediária do cliente: o trecho entra COMPLETO.
    const withOne =
      ledgerWith(['Rua Central, 10'])

    assert.ok(withOne.includes('1'))
    assert.ok(withOne.includes('2'))
    assert.ok(
      withOne.includes('i0'),
      `a fala intermediária precisa acompanhar a resposta: ${withOne.join(',')}`,
    )

    // Trecho longo demais entre a âncora e a resposta: âncora sozinha,
    // nunca pareada com uma resposta a outra fala.
    const withMany =
      ledgerWith([
        'Rua Central, 10',
        'Apartamento 42',
        'CEP 01000-000',
      ])

    assert.ok(withMany.includes('1'))
    assert.equal(
      withMany.includes('2'),
      false,
      `resposta a outra fala não pode virar resposta à âncora: ${withMany.join(',')}`,
    )
  },
)

test(
  'ADIAMENTO COM HORIZONTE EXPLÍCITO: "me chama amanhã / daqui a 10 dias / ano que vem" viram prazo combinado',
  () => {
    const start =
      '2026-09-16T13:00:00.000Z'

    const cases = [
      {
        text: 'Me chama daqui a 10 dias.',
        resume_at: shift(start, 10 * DAY + 20 * MINUTE),
        inside: shift(start, 5 * DAY),
      },
      {
        text: 'Me chama amanhã.',
        // Dia seguinte às 9h em São Paulo.
        resume_at: '2026-09-17T12:00:00.000Z',
        inside: '2026-09-16T20:00:00.000Z',
      },
      {
        text: 'Me chama ano que vem.',
        resume_at: '2027-01-05T12:00:00.000Z',
        inside: '2026-11-20T13:00:00.000Z',
      },
    ]

    for (const item of cases) {
      const turns = [
        ['in', start, 'Quero conhecer os planos para a minha equipe.'],
        ['out', shift(start, 5 * MINUTE), 'Claro! Quer que eu te explique as diferenças?'],
        ['in', shift(start, 20 * MINUTE), item.text],
        ['out', shift(start, 25 * MINUTE), 'Combinado!'],
      ]

      const {
        temporal,
        reasoning,
        input,
      } =
        runCase({
          turns,
          evaluated_at:
            item.inside,
          reading: {
            best_approach:
              'set_commitment',
          },
        })

      const lastSignal =
        buildSellerExecutionTrace({
          diagnostic_input: input,
        }).customer_signals.at(-1)

      assert.equal(lastSignal.kind, 'deferral', item.text)
      assert.equal(
        temporal.progression.agreed_pause
          ?.resume_at,
        item.resume_at,
        item.text,
      )
      assert.equal(
        temporal.progression.agreed_pause
          .seller_owes_contact,
        true,
        item.text,
      )
      assert.equal(temporal.reactivation.mode, 'wait', item.text)
      assert.equal(reasoning.decision, 'wait', item.text)
    }
  },
)

test(
  'JANELA "ESTA SEMANA" termina no calendário, não em sete dias corridos',
  () => {
    // Sexta-feira, 25/09/2026, 9h em São Paulo.
    const friday =
      '2026-09-25T12:00:00.000Z'

    const expiredAt = (text, evaluatedAt) =>
      runCase({
        turns: [
          ['in', friday, text],
          ['out', shift(friday, 5 * MINUTE), 'Consegue sim! Prefere manhã ou tarde?'],
        ],
        evaluated_at:
          evaluatedAt,
      }).temporal.intent
        .time_window_expired

    // "Esta semana" dita na sexta: vale até o fim do domingo.
    assert.equal(
      expiredAt('Quero ir esta semana, consigo?', '2026-09-27T20:00:00.000Z'),
      false,
    )
    assert.equal(
      expiredAt('Quero ir esta semana, consigo?', '2026-09-28T04:00:00.000Z'),
      true,
      'na segunda seguinte a janela "esta semana" já passou',
    )

    // "Segunda" dita na sexta: a próxima segunda, até o fim dela.
    assert.equal(
      expiredAt('Consigo ir segunda?', '2026-09-28T20:00:00.000Z'),
      false,
    )
    assert.equal(
      expiredAt('Consigo ir segunda?', '2026-09-29T04:00:00.000Z'),
      true,
    )
  },
)

test(
  'OPT-OUT exige alvo de contato: "pode tirar uma dúvida?" é pedido ativo, "pode me tirar da lista" é opt-out',
  () => {
    const start =
      '2026-09-24T13:00:00.000Z'

    const run = text =>
      runCase({
        turns: [
          ['in', start, 'Quero saber sobre o plano anual.'],
          ['out', shift(start, 5 * MINUTE), 'Claro! O anual tem acompanhamento mensal incluído.'],
          ['in', shift(start, 20 * MINUTE), text],
        ],
        evaluated_at:
          shift(start, 30 * MINUTE),
      })

    for (const text of [
      'Pode tirar uma dúvida?',
      'Pode me tirar uma dúvida sobre o plano?',
      'Me tira uma dúvida sobre o número da conta?',
    ]) {
      const {
        temporal,
        strategy,
      } = run(text)

      assert.notEqual(temporal.momentum.state, 'closed', text)
      assert.equal(temporal.reactivation.contact_allowed, true, text)
      assert.equal(temporal.reactivation.mode, 'respond_now', text)
      assert.equal(strategy.outbound_allowed, true, text)
    }

    for (const text of [
      'Pode me tirar da lista.',
      'Me tira desse grupo.',
      'Pode tirar meu número.',
      'Pode me tirar.',
    ]) {
      const {
        temporal,
        strategy,
      } = run(text)

      assert.equal(temporal.reactivation.contact_allowed, false, text)
      assert.equal(strategy.outbound_allowed, false, text)
    }
  },
)

test(
  'ADIAMENTO: todo horizonte aceito vira data real (semanas, meses, dia da semana, depois de amanhã, mais tarde)',
  () => {
    // Quarta-feira, 16/09/2026, 10h20 em São Paulo.
    const requestedAt =
      '2026-09-16T13:20:00.000Z'

    const cases = [
      ['Me chama em dois meses.', '2026-11-16T12:00:00.000Z'],
      ['Me chama em 2 semanas.', '2026-09-30T13:20:00.000Z'],
      ['Me chama em uma semana.', '2026-09-23T13:20:00.000Z'],
      ['Me chama sexta.', '2026-09-18T12:00:00.000Z'],
      ['Me chama na sexta da semana que vem.', '2026-09-25T12:00:00.000Z'],
      // Dia da semana dito no próprio dia = o da semana seguinte.
      ['Me chama quarta.', '2026-09-23T12:00:00.000Z'],
      ['Me chama depois de amanhã.', '2026-09-18T12:00:00.000Z'],
      ['Me chama mais tarde.', '2026-09-16T16:20:00.000Z'],
      ['Me chama no início do mês.', '2026-10-01T12:00:00.000Z'],
    ]

    for (const [text, resumeAt] of cases) {
      const { temporal } =
        runCase({
          turns: [
            ['in', '2026-09-16T13:00:00.000Z', 'Quero conhecer os planos.'],
            ['out', '2026-09-16T13:05:00.000Z', 'Claro! Quer que eu te explique?'],
            ['in', requestedAt, text],
            ['out', '2026-09-16T13:25:00.000Z', 'Combinado!'],
          ],
          evaluated_at:
            '2026-09-16T13:30:00.000Z',
        })

      assert.equal(
        temporal.progression.agreed_pause
          ?.resume_at,
        resumeAt,
        text,
      )
    }
  },
)

test(
  'JANELA: "próxima sexta" dita numa sexta é a sexta seguinte, não o próprio dia',
  () => {
    // Sexta-feira, 25/09/2026, 9h em São Paulo.
    const friday =
      '2026-09-25T12:00:00.000Z'

    const expiredAt = evaluatedAt =>
      runCase({
        turns: [
          ['in', friday, 'Consigo agendar para a próxima sexta?'],
          ['out', shift(friday, 5 * MINUTE), 'Consegue sim! Prefere manhã ou tarde?'],
        ],
        evaluated_at:
          evaluatedAt,
      }).temporal.intent
        .time_window_expired

    assert.equal(expiredAt('2026-09-26T12:00:00.000Z'), false)
    assert.equal(expiredAt('2026-10-02T20:00:00.000Z'), false)
    assert.equal(expiredAt('2026-10-03T04:00:00.000Z'), true)
  },
)

test(
  'HORIZONTE SEM ADIAMENTO: perguntas de compra com "mês/semana que vem" não viram pausa combinada',
  () => {
    const start =
      '2026-09-24T13:00:00.000Z'

    const lastSignal = text => {
      const { input, temporal } =
        runCase({
          turns: [
            ['in', start, 'Quero saber sobre o plano anual.'],
            ['out', shift(start, 5 * MINUTE), 'Claro! O anual sai por R$ 899.'],
            ['in', shift(start, 20 * MINUTE), text],
          ],
          evaluated_at:
            shift(start, 30 * MINUTE),
        })

      return {
        kind:
          buildSellerExecutionTrace({
            diagnostic_input: input,
          }).customer_signals.at(-1)
            ?.kind,
        temporal,
      }
    }

    for (const [text, kind] of [
      ['O preço muda no mês que vem?', 'pricing'],
      ['Tem vaga na próxima semana?', 'scheduling'],
    ]) {
      const result =
        lastSignal(text)

      assert.equal(result.kind, kind, text)
      assert.equal(result.temporal.progression.agreed_pause, null, text)
      assert.equal(result.temporal.reactivation.mode, 'respond_now', text)
    }

    for (const text of [
      'Deixa pra semana que vem.',
      'Agora não, só mês que vem.',
      'Fica pra próxima semana.',
      'Mais pra frente eu vejo isso.',
    ]) {
      assert.equal(lastSignal(text).kind, 'deferral', text)
    }
  },
)

test(
  'RECONFIRMAÇÃO COM HORIZONTE PRÓPRIO: "quero contratar amanhã" + dois dias depois "ainda tenho interesse, quero ir hoje" é intenção de hoje',
  () => {
    const { temporal } =
      runCase({
        turns: [
          ['in', '2026-09-21T13:00:00.000Z', 'Quero contratar amanhã.'],
          ['out', '2026-09-21T13:05:00.000Z', 'Perfeito! Te mando a proposta.'],
          ['in', '2026-09-23T13:00:00.000Z', 'Ainda tenho interesse, quero ir hoje.'],
        ],
        evaluated_at:
          '2026-09-23T13:10:00.000Z',
      })

    assert.equal(temporal.intent.kind, 'close', 'tipo e confiança da intenção forte')
    assert.equal(temporal.intent.confidence, 'high')
    assert.equal(temporal.intent.time_reference, 'same_day', 'horizonte da reconfirmação')
    assert.equal(
      Date.parse(temporal.intent.demonstrated_at),
      Date.parse('2026-09-23T13:00:00.000Z'),
    )
    assert.equal(temporal.intent.time_window_expired, false)
    assert.equal(temporal.intent.needs_reconfirmation, false)
    assert.equal(temporal.reactivation.requalify_before_continuing, false)
  },
)

test(
  'ADIAMENTO EM MESES não transborda o mês: "em um mês" dito em 31/01 é o último dia de fevereiro',
  () => {
    const resumeFor = (requestedAt, text) =>
      runCase({
        turns: [
          ['in', shift(requestedAt, -20 * MINUTE), 'Quero conhecer os planos.'],
          ['out', shift(requestedAt, -15 * MINUTE), 'Claro! Quer que eu te explique?'],
          ['in', requestedAt, text],
          ['out', shift(requestedAt, 5 * MINUTE), 'Combinado!'],
        ],
        evaluated_at:
          shift(requestedAt, 10 * MINUTE),
      }).temporal.progression
        .agreed_pause
        ?.resume_at

    // 31/01/2027 10h em São Paulo → 28/02/2027 9h.
    assert.equal(
      resumeFor('2027-01-31T13:00:00.000Z', 'Me chama em um mês.'),
      '2027-02-28T12:00:00.000Z',
    )
    // 31/10/2026 → 30/11/2026.
    assert.equal(
      resumeFor('2026-10-31T13:00:00.000Z', 'Me chama em um mês.'),
      '2026-11-30T12:00:00.000Z',
    )
    // 30/11/2026 + 3 meses → 28/02/2027 (virada de ano).
    assert.equal(
      resumeFor('2026-11-30T13:00:00.000Z', 'Me chama em três meses.'),
      '2027-02-28T12:00:00.000Z',
    )
  },
)
