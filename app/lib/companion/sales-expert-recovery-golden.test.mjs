import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildSellerExecutionTrace,
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
