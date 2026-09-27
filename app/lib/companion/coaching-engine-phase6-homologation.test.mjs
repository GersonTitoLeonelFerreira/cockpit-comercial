import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

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
  buildSellerExecutionTrace,
} from './seller-execution-trace.ts'

import {
  buildSellerSequenceMethodAssessment,
} from './seller-sequence-method-assessment.ts'

const matrix =
  JSON.parse(
    readFileSync(
      new URL(
        '../../../docs/companion-v2/corpus/coaching-engine-phase6-homologation.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )

function evidence(
  summary,
  ids = ['m1'],
) {
  return {
    summary,
    evidence_message_ids:
      ids,
    memory_ids: [],
  }
}

function buildState({
  partyKinds = [],
} = {}) {
  return {
    contract_version:
      'phase-5.1-commercial-state-v1',
    cycle_id:
      'cycle-homologation',
    version: 1,
    commercial_role: 'buyer',
    current_moment: {
      summary:
        'Momento atual.',
      evidence_message_ids:
        ['m1'],
    },
    current_priority: {
      summary:
        'Prioridade atual.',
      evidence_message_ids:
        ['m1'],
    },
    last_analyzed_message_ids:
      ['m1'],
    last_evidence_message_ids:
      ['m1'],
    facts:
      partyKinds.map(
        (kind, index) => ({
          id:
            `state-fact-${index + 1}`,
          kind,
          value: null,
          summary: kind,
          confidence: 'high',
          evidence_message_ids:
            ['m1'],
          memory_status:
            'active',
          created_in_state_version: 1,
          updated_in_state_version: 1,
          closed_in_state_version: null,
        }),
      ),
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at:
      '2026-09-27T18:00:00-03:00',
    updated_at:
      '2026-09-27T18:10:00-03:00',
  }
}

function buildInput({
  turns,
  facts = [],
  tone =
    'Natural, claro e objetivo.',
  prohibited = [],
} = {}) {
  return {
    input_version:
      'phase-5-input-v1',
    diagnostic_contract_version:
      'phase-4-diagnostic-v3',
    company_id:
      'company-homologation',
    cycle_id:
      'cycle-homologation',
    conversation_key:
      'conversation-homologation',
    current_crm_status:
      'respondeu',
    reference_time:
      '2026-09-27T18:20:00-03:00',
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
      messages:
        turns.map(
          (turn, index) => ({
            id:
              `m${index + 1}`,
            message_key:
              `message-${index + 1}`,
            version: 1,
            sequence:
              index + 1,
            direction:
              turn.direction,
            author_kind:
              turn.author_kind ??
              (
                turn.direction ===
                  'incoming'
                  ? 'customer'
                  : 'human_agent'
              ),
            occurred_at:
              `2026-09-27T18:${String(index).padStart(2, '0')}:00-03:00`,
            observed_at:
              `2026-09-27T18:${String(index).padStart(2, '0')}:01-03:00`,
            content_type:
              'text',
            text_content:
              turn.text,
            audio_transcription:
              null,
          }),
        ),
      excluded_messages: [],
    },
    commercial_context: {
      configured: true,
      config_version_id:
        'config-homologation',
      config_version_number: 1,
      config_contract_version:
        'phase-2-v1',
      business_description:
        'Empresa genérica configurável.',
      target_audience:
        'Público definido pela empresa.',
      value_proposition:
        'Proposta definida pela empresa.',
      communication_tone:
        tone,
      required_behaviors: [],
      prohibited_behaviors:
        prohibited,
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
      facts:
        facts.map(
          (
            fact,
            index,
          ) => ({
            contract_version:
              'commercial-fact-v1',
            definition: null,
            validity_status:
              'current',
            category:
              fact.category ??
              'availability',
            fact_key:
              fact.fact_key ??
              `fact_${index + 1}`,
            fact_value:
              fact.fact_value,
            source_note:
              'Fato oficial de homologação.',
          }),
        ),
      objection_guides: [],
    },
  }
}

function buildReading({
  relevance = 'commercial',
  role = 'buyer',
  decision = 'respond',
  currentState =
    'Conversa comercial em andamento.',
  lastRequest =
    'Cliente demonstrou interesse.',
  objections = [],
  missingDiscovery = [],
  commitments = [],
  strengths = [],
  improvements = [],
  interventionNeeded = true,
  bestReason =
    'Executar o próximo passo coerente com o contexto atual.',
} = {}) {
  return {
    contract_version:
      'commercial-reading-v1',
    analysis_status:
      'complete',
    analysis_limitations: [],
    commercial_role:
      role,
    commercial_relevance:
      relevance,
    conversation_summary: {
      initial_context: null,
      evolution: null,
      important_events: [],
      current_state:
        evidence(
          currentState,
        ),
      last_customer_request_or_decision:
        lastRequest
          ? evidence(
              lastRequest,
            )
          : null,
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
        objections.map(
          item =>
            evidence(item),
        ),
      uncertainties: [],
      discussed_products: [],
      primary_product_interest:
        null,
      competitors: [],
      commitments,
      missing_discovery:
        missingDiscovery.map(
          topic => ({
            topic,
            ...evidence(
              `Falta descobrir: ${topic}.`,
            ),
          }),
        ),
      resolved_information: [],
      superseded_information: [],
      communication: {
        events: [],
        patterns: [],
      },
    },
    commercial_evolution: [],
    method: {
      configured: false,
      name: null,
      stages: [],
      current_stage: null,
      adherence: {
        status:
          'not_configured',
        summary:
          'Método não configurado para esta fixture.',
        deviation_stage_order:
          null,
        what_happened: null,
        missing_information: [],
        why_it_matters: null,
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance:
        null,
    },
    seller_strengths:
      strengths,
    improvement_points:
      improvements,
    risks: {
      customer_objections:
        objections.map(
          item => ({
            kind: 'other',
            severity:
              'medium',
            summary:
              item,
            evidence_message_ids:
              ['m1'],
            memory_ids: [],
          }),
        ),
      service_risks: [],
    },
    best_approach: {
      decision,
      reason:
        bestReason,
      channel:
        decision ===
          'wait'
          ? 'wait'
          : decision ===
              'no_intervention'
            ? 'none'
            : 'text',
      evidence_message_ids:
        ['m1'],
      memory_ids: [],
    },
    communication: {
      intervention_needed:
        interventionNeeded,
      recommended_question:
        null,
      recommended_message:
        null,
    },
    operations: {
      crm: {
        should_change_crm_stage:
          false,
        recommended_status:
          null,
        rationale: null,
        requires_human_confirmation:
          true,
      },
      agenda: {
        should_change_agenda:
          false,
        expected_next_action_at:
          null,
        rationale: null,
        requires_human_confirmation:
          true,
      },
    },
    evidence_message_ids:
      ['m1'],
    memory_ids: [],
  }
}

function runPipeline({
  input,
  reading,
  state = buildState(),
  sellerIntent =
    'Quero avançar de acordo com o contexto atual.',
}) {
  const reasoning =
    buildCommercialReasoning({
      reading,
      cycle_state:
        state,
      diagnostic_input:
        input,
    })

  const coaching =
    buildCommercialCoachingDiagnosis({
      reading,
      reasoning,
      diagnostic_input:
        input,
    })

  const strategy =
    buildCommercialMessageStrategy({
      reasoning,
      coaching,
      diagnostic_input:
        input,
      seller_intent:
        sellerIntent,
    })

  const trace =
    buildSellerExecutionTrace({
      diagnostic_input:
        input,
    })

  const sequence =
    buildSellerSequenceMethodAssessment({
      reading,
      diagnostic_input:
        input,
      trace,
    })

  return {
    reasoning,
    coaching,
    strategy,
    trace,
    sequence,
  }
}

function selected(
  result,
  id,
) {
  return result.reasoning
    .selected_techniques
    .some(
      item =>
        item.intelligence_id ===
        id,
    )
}

test(
  'matriz de homologação cobre múltiplos setores e não deixa academia virar arquitetura',
  () => {
    assert.equal(
      matrix.version,
      'coaching-engine-phase6-homologation-v1',
    )

    assert.ok(
      matrix.cases.length >= 9,
    )

    const industries =
      new Set(
        matrix.cases.map(
          item =>
            item.industry,
        ),
      )

    assert.ok(
      industries.size >= 6,
    )

    const gymCases =
      matrix.cases.filter(
        item =>
          /academia|gym/i.test(
            item.industry,
          ),
      )

    assert.equal(
      gymCases.length,
      0,
    )
  },
)

test(
  'H01 software B2B: quebra de sequência chega até strategy e transplant test',
  () => {
    const result =
      runPipeline({
        input:
          buildInput({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero agendar uma demonstração do sistema.',
              },
              {
                direction:
                  'outgoing',
                text:
                  'Quando você quer fazer a demonstração?',
              },
              {
                direction:
                  'outgoing',
                text:
                  'Vou te mandar nossos pacotes para você conhecer.',
              },
            ],
          }),
        reading:
          buildReading({
            decision:
              'set_commitment',
            currentState:
              'Cliente quer avançar para uma demonstração do sistema.',
            lastRequest:
              'Cliente pediu uma demonstração.',
            bestReason:
              'Retomar o compromisso de demonstração antes de mudar de assunto.',
          }),
      })

    assert.equal(
      result.coaching
        .sequence_break
        .happened,
      true,
    )

    assert.equal(
      result.strategy
        .context_reference
        .required_in_draft,
      true,
    )

    const critic =
      evaluateCommercialMessageDraft({
        message:
          'Oi! Passando para saber se posso te ajudar em alguma coisa.',
        strategy:
          result.strategy,
      })

    assert.equal(
      critic.passed,
      false,
    )

    assert.ok(
      critic.violations
        .includes(
          'generic_message',
        ),
    )
  },
)

test(
  'H02 serviço de campo: escolha guiada só entra com opções oficiais reais',
  () => {
    const result =
      runPipeline({
        input:
          buildInput({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero agendar uma visita técnica.',
              },
            ],
            facts: [
              {
                fact_key:
                  'technical_visit_slots',
                fact_value:
                  'Visita técnica disponível terça às 14h ou quinta às 10h.',
              },
            ],
          }),
        reading:
          buildReading({
            decision:
              'propose_visit',
            currentState:
              'Cliente quer agendar uma visita técnica.',
            lastRequest:
              'Cliente pediu visita técnica.',
            bestReason:
              'Oferecer alternativas reais de agenda.',
          }),
      })

    assert.equal(
      selected(
        result,
        'technique.guided_choice',
      ),
      true,
    )

    assert.equal(
      result.strategy
        .facts_required_but_missing
        .includes(
          'multiple_valid_options',
        ),
      false,
    )
  },
)

test(
  'H03 consultoria: pouca fala do cliente não reduz diagnóstico da execução do vendedor',
  () => {
    const result =
      runPipeline({
        input:
          buildInput({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Tenho interesse.',
              },
              {
                direction:
                  'outgoing',
                text:
                  'Temos consultoria mensal, pacote estratégico e outras opções; vou te explicar todas.',
              },
            ],
          }),
        reading:
          buildReading({
            decision:
              'deepen_discovery',
            currentState:
              'Cliente demonstrou interesse, mas ainda há pouco contexto sobre a necessidade.',
            lastRequest:
              'Cliente disse que tem interesse.',
            missingDiscovery:
              ['need'],
            bestReason:
              'Descobrir a necessidade antes de recomendar a consultoria.',
          }),
      })

    assert.equal(
      result.coaching
        .client_context_confidence,
      'low',
    )

    assert.equal(
      result.coaching
        .seller_execution_confidence,
      'high',
    )

    assert.match(
      result.coaching
        .seller_mistake
        .summary,
      /antes|prematur/i,
    )
  },
)

test(
  'H04 licença B2B: intenção de fechamento prevalece sobre descoberta tardia',
  () => {
    const result =
      runPipeline({
        input:
          buildInput({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero contratar a licença anual. Como faço para assinar?',
              },
              {
                direction:
                  'outgoing',
                text:
                  'Antes disso, qual é o principal desafio que vocês querem resolver hoje?',
              },
            ],
          }),
        reading:
          buildReading({
            decision:
              'close',
            currentState:
              'Cliente quer contratar a licença anual.',
            lastRequest:
              'Cliente perguntou como assinar a licença anual.',
            bestReason:
              'Avançar a contratação usando somente informações oficiais disponíveis.',
          }),
      })

    assert.equal(
      result.coaching
        .client_intent_now.kind,
      'close',
    )

    assert.match(
      result.coaching
        .seller_mistake
        .summary,
      /depois de o cliente já demonstrar intenção explícita de avançar/i,
    )

    const serialized =
      JSON.stringify(
        result.strategy,
      )

    assert.doesNotMatch(
      serialized,
      /academia|experimental|matr[ií]cula/i,
    )
  },
)

test(
  'H05 objeção: probe correto gera elogio específico e não repete o diagnóstico enquanto aguarda resposta',
  () => {
    const result =
      runPipeline({
        input:
          buildInput({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Estou sem limite no cartão.',
              },
              {
                direction:
                  'outgoing',
                text:
                  'Entendi. O bloqueio é limite disponível ou você está sem o cartão agora?',
              },
            ],
          }),
        reading:
          buildReading({
            decision:
              'handle_objection',
            currentState:
              'Cliente trouxe uma objeção de pagamento.',
            lastRequest:
              'Cliente informou que está sem limite no cartão.',
            objections: [
              'Cliente está sem limite no cartão.',
            ],
            bestReason:
              'Diagnosticar a causa da objeção antes de oferecer alternativa.',
          }),
      })

    assert.equal(
      selected(
        result,
        'technique.objection_diagnosis',
      ),
      false,
    )

    assert.ok(
      result.reasoning.limitations
        .some(
          item =>
            item.includes(
              'do_not_repeat_objection_probe',
            ),
        ),
    )

    assert.match(
      result.coaching
        .seller_strength.summary,
      /investigou a causa|diagnostic/i,
    )

    assert.equal(
      result.coaching
        .seller_mistake,
      null,
    )
  },
)

test(
  'H06 espera disciplinada: não repete escolha guiada já executada',
  () => {
    const repeated =
      'Tenho terça às 14h ou quinta às 10h. Qual funciona melhor?'

    const result =
      runPipeline({
        input:
          buildInput({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero agendar uma reunião.',
              },
              {
                direction:
                  'outgoing',
                text:
                  repeated,
              },
            ],
            facts: [
              {
                fact_key:
                  'meeting_slots',
                fact_value:
                  'Reunião disponível terça às 14h ou quinta às 10h.',
              },
            ],
          }),
        reading:
          buildReading({
            decision:
              'wait',
            currentState:
              'O vendedor já ofereceu opções reais e aguarda a escolha do cliente.',
            lastRequest:
              'Cliente quer agendar uma reunião.',
            bestReason:
              'Aguardar a escolha do cliente sem repetir a pergunta.',
          }),
      })

    assert.equal(
      selected(
        result,
        'technique.commitment_wait',
      ),
      true,
    )

    assert.equal(
      selected(
        result,
        'technique.guided_choice',
      ),
      false,
    )

    const critic =
      evaluateCommercialMessageDraft({
        message:
          repeated,
        strategy:
          result.strategy,
        recent_outgoing_messages: [
          repeated,
        ],
      })

    assert.equal(
      critic.passed,
      false,
    )

    assert.ok(
      critic.violations
        .includes(
          'repeats_recent_seller_action',
        ),
    )
  },
)

test(
  'H07 terceiro: reasoning mantém interlocutor e prospect como papéis distintos',
  () => {
    const result =
      runPipeline({
        input:
          buildInput({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Minha irmã quer contratar a consultoria. Como faço para ela falar com vocês?',
              },
            ],
          }),
        reading:
          buildReading({
            role:
              'intermediary',
            decision:
              'set_commitment',
            currentState:
              'Interlocutor atual fala em nome de uma prospect relacionada.',
            lastRequest:
              'Interlocutor quer encaminhar a irmã interessada.',
            bestReason:
              'Organizar a passagem para a prospect real sem misturar identidades.',
          }),
        state:
          buildState({
            partyKinds: [
              'commercial_party.current_contact.intermediary',
              'commercial_party.related.prospect',
            ],
          }),
      })

    assert.equal(
      result.reasoning.status,
      'ready',
    )

    assert.equal(
      selected(
        result,
        'technique.third_party_handoff',
      ),
      true,
    )

    assert.equal(
      result.coaching
        .client_intent_now.kind,
      'third_party_interest',
    )
  },
)

test(
  'H08 sessão não comercial fica silenciosa até o Message Strategy',
  () => {
    const result =
      runPipeline({
        input:
          buildInput({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Valeu pela ajuda de ontem.',
              },
            ],
          }),
        reading:
          buildReading({
            relevance:
              'non_commercial',
            decision:
              'no_intervention',
            currentState:
              'Sessão atual sem relevância comercial.',
            lastRequest:
              'Cliente agradeceu.',
            interventionNeeded:
              false,
            bestReason:
              'Não forçar ação comercial.',
          }),
        sellerIntent:
          'Quero responder de forma natural ao agradecimento.',
      })

    assert.equal(
      result.reasoning.status,
      'silent',
    )

    assert.equal(
      result.coaching.status,
      'silent',
    )

    assert.equal(
      result.strategy.objective,
      null,
    )
  },
)

test(
  'H09 fato novo depois da escolha guiada remove wait congelado',
  () => {
    const result =
      runPipeline({
        input:
          buildInput({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero agendar uma visita.',
              },
              {
                direction:
                  'outgoing',
                text:
                  'Tenho terça às 14h ou quinta às 10h. Qual funciona melhor?',
              },
              {
                direction:
                  'incoming',
                text:
                  'Nenhum desses horários funciona para mim.',
              },
            ],
            facts: [
              {
                fact_key:
                  'visit_slots',
                fact_value:
                  'Visita disponível terça às 14h ou quinta às 10h.',
              },
            ],
          }),
        reading:
          buildReading({
            decision:
              'set_commitment',
            currentState:
              'Cliente mantém interesse, mas rejeitou as opções apresentadas.',
            lastRequest:
              'Cliente informou que nenhum dos horários funciona.',
            bestReason:
              'Reabrir o microcompromisso sem repetir as opções rejeitadas.',
          }),
      })

    assert.equal(
      result.sequence.sequence
        .customer_fact_after_action,
      true,
    )

    assert.equal(
      selected(
        result,
        'technique.commitment_wait',
      ),
      false,
    )

    assert.equal(
      result.coaching
        .seller_mistake,
      null,
    )
  },
)


test(
  'gate do MVP força encerramento somente do harness E3 com timers recorrentes',
  () => {
    const packageJson =
      JSON.parse(
        readFileSync(
          new URL(
            '../../../package.json',
            import.meta.url,
          ),
          'utf8',
        ),
      )

    const gate =
      packageJson.scripts[
        'gate:coaching-engine-mvp'
      ]

    assert.match(
      gate,
      /node --test --test-force-exit app\/extension\/yolen-companion\/tests\/e3-dom\/cross-channel-parity\.test\.mjs/,
    )

    assert.match(
      gate,
      /&& next typegen && tsc --noEmit$/,
    )
  },
)
