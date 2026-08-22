import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  StatefulCopilotContractError,
  normalizeStatefulCopilotOutput,
} from './stateful-copilot-normalizer.ts'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
} from './stateful-commercial-state.ts'

import {
  buildCommercialReadingCustomerFromState,
} from './client-commercial-intelligence-contract.ts'

import {
  preservePreviousCommercialStateWhenClosed,
} from './stateful-copilot-engine.ts'

const products = [
  {
    product_id: 'product-yolen',
    name: 'Yolen',
  },
]

function memory({
  id,
  kind,
  summary,
  status = 'active',
  value,
  confidence = 'high',
  evidence = ['m1'],
  ...extra
}) {
  return {
    id,
    kind,
    summary,
    evidence_message_ids: evidence,
    memory_status: status,
    created_in_state_version: 1,
    updated_in_state_version:
      status === 'active' ? 1 : 2,
    closed_in_state_version:
      status === 'active' ? null : 2,
    ...(value === undefined ? {} : { value }),
    ...(confidence === null ? {} : { confidence }),
    ...extra,
  }
}

function emptyState(overrides = {}) {
  return {
    contract_version:
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
    cycle_id: 'cycle-1',
    version: 2,
    commercial_role: 'buyer',
    current_moment: {
      summary: 'Conversa comercial em andamento.',
      evidence_message_ids: ['m1'],
    },
    current_priority: {
      summary: 'Compreender o próximo passo.',
      evidence_message_ids: ['m1'],
    },
    last_analyzed_message_ids: ['m1'],
    last_evidence_message_ids: ['m1'],
    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at: '2026-08-20T12:00:00-03:00',
    updated_at: '2026-08-21T12:00:00-03:00',
    ...overrides,
  }
}

function read(state) {
  return buildCommercialReadingCustomerFromState({
    state,
    products,
  })
}

function emptyPatch() {
  return {
    facts_to_add: [],
    fact_ids_to_supersede: [],
    needs_to_add: [],
    need_ids_to_resolve: [],
    open_loops_to_add: [],
    open_loop_ids_to_resolve: [],
    objections_to_add: [],
    objection_ids_to_resolve: [],
    objection_ids_to_supersede: [],
    commitments_to_upsert: [],
    signals_to_add: [],
    signal_ids_to_resolve: [],
    uncertainties_to_add: [],
    uncertainty_ids_to_resolve: [],
  }
}

function normalizePatch({
  patch,
  relevance = 'commercial',
  messageIds = ['m1'],
  customerMessageIds = messageIds,
} = {}) {
  const lastMessageId =
    messageIds.at(-1)

  return normalizeStatefulCopilotOutput(
    {
      contract_version:
        STATEFUL_COPILOT_CONTRACT_VERSION,
      previous_state_version: null,
      analyzed_message_ids: messageIds,
      commercial_role: 'buyer',
      commercial_relevance: relevance,
      interpretation: {
        what_changed: {
          summary: 'O cliente trouxe informação nova.',
          evidence_message_ids: [lastMessageId],
        },
        what_remains_valid: [],
        current_moment: {
          summary: 'A conversa atual foi interpretada.',
          evidence_message_ids: [lastMessageId],
          memory_ids: [],
        },
        customer_need: null,
        uncertainties: [],
      },
      state_patch: patch ?? emptyPatch(),
      strategy: {
        method_application: 'Usar a informação comprovada.',
        rationale: 'Há evidência atual.',
        next_move: 'Continuar com base no contexto.',
        recommended_question: null,
        suggested_message: null,
        evidence_message_ids: [lastMessageId],
        memory_ids: [],
      },
      operational_suggestions: {
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
      evidence_message_ids: messageIds,
      memory_ids: [],
    },
    {
      available_message_ids: messageIds,
      customer_message_ids: customerMessageIds,
      available_products: products,
      previous_communication_observations: [],
      available_memory_ids: [],
      active_memory_ids: [],
      negotiation_evidence_detected: false,
      expected_previous_state_version: null,
      current_crm_status: 'respondeu',
      prohibited_statuses: ['ganho', 'perdido'],
      reference_time: '2026-08-21T12:00:00-03:00',
    },
  )
}

const scenarios = [
  {
    name: '1. objetivo explícito',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'objective-1',
          kind: 'client.objective',
          summary: 'Aumentar a conversão.',
          value: null,
        })],
      }))
      assert.equal(customer.objectives[0].summary, 'Aumentar a conversão.')
      assert.deepEqual(customer.needs, [])
    },
  },
  {
    name: '2. problema explícito',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'problem-1',
          kind: 'client.problem',
          summary: 'Os leads ficam sem follow-up.',
          value: null,
        })],
      }))
      assert.equal(customer.problems.length, 1)
      assert.deepEqual(customer.impacts, [])
    },
  },
  {
    name: '3. impacto explícito',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'impact-1',
          kind: 'client.impact',
          summary: 'Oportunidades são perdidas.',
          value: null,
        })],
      }))
      assert.equal(customer.impacts[0].summary, 'Oportunidades são perdidas.')
    },
  },
  {
    name: '4. problema sem impacto conhecido',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'problem-only',
          kind: 'client.problem',
          summary: 'O acompanhamento é manual.',
          value: null,
        })],
      }))
      assert.equal(customer.problems.length, 1)
      assert.equal(customer.impacts.length, 0)
    },
  },
  {
    name: '5. necessidade distinta do problema',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'problem-2',
          kind: 'client.problem',
          summary: 'Os retornos são esquecidos.',
          value: null,
        })],
        needs: [memory({
          id: 'need-1',
          kind: 'workflow',
          summary: 'Ter rotina estruturada de acompanhamento.',
          value: undefined,
        })],
      }))
      assert.equal(customer.problems[0].summary, 'Os retornos são esquecidos.')
      assert.equal(customer.needs[0].summary, 'Ter rotina estruturada de acompanhamento.')
    },
  },
  {
    name: '6. múltiplas necessidades',
    run() {
      const customer = read(emptyState({
        needs: [
          memory({ id: 'need-1', kind: 'workflow', summary: 'Organizar retornos.' }),
          memory({ id: 'need-2', kind: 'visibility', summary: 'Dar visibilidade ao gestor.' }),
        ],
      }))
      assert.equal(customer.needs.length, 2)
    },
  },
  {
    name: '7. critério de decisão',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'criterion-1',
          kind: 'client.decision_criterion',
          summary: 'A implantação precisa ser simples.',
          value: null,
        })],
      }))
      assert.equal(customer.decision_criteria.length, 1)
    },
  },
  {
    name: '8. preferência comercial',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'preference-1',
          kind: 'client.preference',
          summary: 'Prefere receber comparação por escrito.',
          value: null,
        })],
      }))
      assert.equal(customer.preferences.length, 1)
    },
  },
  {
    name: '9. produto oficial mencionado',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'product-1',
          kind: 'client.product.catalog.interested',
          summary: 'Demonstrou interesse na Yolen.',
          value: 'product-yolen',
        })],
      }))
      assert.equal(customer.discussed_products[0].canonical_product_id, 'product-yolen')
      assert.equal(customer.discussed_products[0].name, 'Yolen')
    },
  },
  {
    name: '10. produto desconhecido',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'product-observed',
          kind: 'client.product.observed.discussed',
          summary: 'Mencionou o serviço Atlas.',
          value: 'Serviço Atlas',
        })],
      }))
      assert.equal(customer.discussed_products[0].canonical_product_id, null)
      assert.equal(customer.discussed_products[0].name, 'Serviço Atlas')
    },
  },
  {
    name: '11. concorrente nominal',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'competitor-1',
          kind: 'client.competitor.named',
          summary: 'Está comparando com a Empresa X.',
          value: 'Empresa X',
        })],
      }))
      assert.deepEqual(customer.competitors.map(item => item.name), ['Empresa X'])
    },
  },
  {
    name: '12. outra empresa sem nome',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'competitor-unknown',
          kind: 'client.competitor.unnamed',
          summary: 'Está avaliando outra empresa.',
          value: null,
        })],
      }))
      assert.equal(customer.competitors[0].name, null)
      assert.equal(customer.competitors[0].mention_type, 'unnamed_alternative')
    },
  },
  {
    name: '13. comunicação curta isolada permanece evento',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'short-event',
          kind: 'client.communication.event',
          summary: 'Respondeu de forma curta nesta mensagem.',
          value: 'short_responses',
        })],
      }))
      assert.equal(customer.communication.events.length, 1)
      assert.equal(customer.communication.patterns.length, 0)
    },
  },
  {
    name: '14. padrão consistente de comunicação curta',
    run() {
      const patch = emptyPatch()
      patch.facts_to_add.push({
        kind: 'client.communication.pattern',
        value: 'short_responses',
        confidence: 'high',
        summary: 'Responde de forma curta de modo recorrente.',
        evidence_message_ids: ['m1', 'm2'],
      })
      assert.doesNotThrow(() => normalizePatch({
        patch,
        messageIds: ['m1', 'm2'],
      }))

      const customer = read(emptyState({
        facts: [
          memory({
            id: 'short-event-old',
            kind: 'client.communication.event',
            summary: 'Respondeu de forma curta anteriormente.',
            value: 'short_responses',
            status: 'superseded',
          }),
          memory({
            id: 'short-pattern-current',
            kind: 'client.communication.pattern',
            summary: 'Responde de forma curta de modo recorrente.',
            value: 'short_responses',
            evidence: ['m2'],
          }),
        ],
      }))

      assert.deepEqual(
        customer.communication.patterns[0].memory_ids,
        ['short-pattern-current', 'short-event-old'],
      )
    },
  },
  {
    name: '15. pedido de dados ou números recorrente',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'numbers-pattern',
          kind: 'client.communication.pattern',
          summary: 'Pediu dados ou números em ocasiões distintas.',
          value: 'requests_data_or_numbers',
          evidence: ['m1', 'm2'],
        })],
      }))
      assert.equal(customer.communication.patterns[0].behavior, 'requests_data_or_numbers')
    },
  },
  {
    name: '16. reação negativa à pressão é comportamento observado',
    run() {
      const customer = read(emptyState({
        facts: [memory({
          id: 'pressure-event',
          kind: 'client.communication.event',
          summary: 'Rejeitou explicitamente a pressão por decisão.',
          value: 'negative_reaction_to_pressure',
        })],
      }))
      assert.equal(customer.communication.events[0].behavior, 'negative_reaction_to_pressure')
    },
  },
  {
    name: '17. objeção aberta',
    run() {
      const customer = read(emptyState({
        objections: [memory({
          id: 'objection-open',
          kind: 'price',
          summary: 'O investimento está acima do esperado.',
        })],
      }))
      assert.equal(customer.objections.length, 1)
      assert.equal(customer.resolved_information.length, 0)
    },
  },
  {
    name: '18. objeção resolvida',
    run() {
      const customer = read(emptyState({
        objections: [memory({
          id: 'objection-resolved',
          kind: 'price',
          summary: 'O preço deixou de ser obstáculo.',
          status: 'resolved',
        })],
      }))
      assert.equal(customer.objections.length, 0)
      assert.equal(customer.resolved_information[0].category, 'objection')
    },
  },
  {
    name: '19. missing discovery explícito',
    run() {
      const customer = read(emptyState({
        uncertainties: [memory({
          id: 'missing-impact',
          kind: 'client.missing_discovery.impact',
          summary: 'O impacto ainda não foi comprovado.',
        })],
      }))
      assert.equal(customer.missing_discovery[0].topic, 'impact')
    },
  },
  {
    name: '20. missing discovery depois resolvido',
    run() {
      const customer = read(emptyState({
        uncertainties: [memory({
          id: 'missing-budget',
          kind: 'client.missing_discovery.budget',
          summary: 'O orçamento precisava ser confirmado.',
          status: 'resolved',
        })],
      }))
      assert.equal(customer.missing_discovery.length, 0)
      assert.equal(customer.resolved_information[0].category, 'missing_discovery')
    },
  },
  {
    name: '21. compromisso comercial',
    run() {
      const customer = read(emptyState({
        commitments: [memory({
          id: 'commitment-demo',
          kind: 'commercial_demo',
          summary: 'Demonstração confirmada.',
          confidence: null,
          commitment_status: 'confirmed',
          scheduled_at: '2026-08-22T15:00:00-03:00',
          proposed_at: '2026-08-21T12:00:00-03:00',
        })],
      }))
      assert.equal(customer.commitments[0].status, 'confirmed')
    },
  },
  {
    name: '22. compromisso pessoal é neutralizado em sessão não comercial',
    run() {
      const patch = emptyPatch()
      patch.commitments_to_upsert.push({
        commitment_id: null,
        kind: 'send_personal_document',
        status: 'proposed',
        scheduled_at: null,
        proposed_at: '2026-08-21T13:00:00-03:00',
        summary: 'Vai enviar um documento pessoal depois.',
        evidence_message_ids: ['m1'],
      })
      const output = normalizePatch({
        patch,
        relevance: 'non_commercial',
      })
      assert.deepEqual(output.state_patch.commitments_to_upsert, [])
      assert.equal(output.operational_suggestions.agenda.should_change_agenda, false)
    },
  },
  {
    name: '23. informação antiga substituída por nova',
    run() {
      const customer = read(emptyState({
        facts: [
          memory({
            id: 'criterion-old',
            kind: 'client.decision_criterion',
            summary: 'Preço era o critério principal.',
            value: null,
            status: 'superseded',
          }),
          memory({
            id: 'criterion-current',
            kind: 'client.decision_criterion',
            summary: 'Implantação é o critério atual.',
            value: null,
          }),
        ],
      }))
      assert.equal(customer.decision_criteria[0].summary, 'Implantação é o critério atual.')
      assert.equal(customer.superseded_information[0].category, 'decision_criterion')
    },
  },
  {
    name: '24. múltiplos interesses',
    run() {
      const customer = read(emptyState({
        facts: [
          memory({ id: 'interest-1', kind: 'client.interest', summary: 'Automação de follow-up.', value: null }),
          memory({ id: 'interest-2', kind: 'client.interest', summary: 'Visibilidade gerencial.', value: null }),
        ],
      }))
      assert.equal(customer.interests.length, 2)
    },
  },
  {
    name: '25. cliente muda prioridade',
    run() {
      const customer = read(emptyState({
        facts: [
          memory({ id: 'primary-old', kind: 'client.product.catalog.primary', summary: 'Yolen era o foco.', value: 'product-yolen', status: 'superseded' }),
          memory({ id: 'priority-new', kind: 'client.preference', summary: 'Agora prioriza implantação assistida.', value: null }),
        ],
      }))
      assert.equal(customer.primary_product_interest, null)
      assert.equal(customer.preferences[0].summary, 'Agora prioriza implantação assistida.')
      assert.equal(customer.superseded_information[0].category, 'product')
    },
  },
  {
    name: '26. conversa non-commercial não extrai fatos',
    run() {
      const patch = emptyPatch()
      patch.facts_to_add.push({
        kind: 'client.objective',
        value: null,
        confidence: 'medium',
        summary: 'Suposto objetivo criado em conversa pessoal.',
        evidence_message_ids: ['m1'],
      })
      const output = normalizePatch({
        patch,
        relevance: 'non_commercial',
      })
      assert.deepEqual(output.state_patch, emptyPatch())
      assert.equal(output.strategy.recommended_question, null)
    },
  },
  {
    name: '27. buyer histórico com sessão pessoal preserva memória comercial',
    run() {
      const previous = emptyState({
        facts: [memory({
          id: 'objective-history',
          kind: 'client.objective',
          summary: 'Aumentar conversão.',
          value: null,
        })],
      })
      const output = normalizePatch({
        relevance: 'non_commercial',
      })
      const candidate = emptyState({
        version: 3,
        facts: [],
        updated_at: '2026-08-22T12:00:00-03:00',
      })
      const preserved = preservePreviousCommercialStateWhenClosed({
        candidateState: candidate,
        previousState: previous,
        output,
      })
      assert.deepEqual(preserved.facts, previous.facts)
      assert.equal(preserved.version, 3)
    },
  },
  {
    name: '28. sessão pessoal pode voltar a ser comercial',
    run() {
      const patch = emptyPatch()
      patch.facts_to_add.push({
        kind: 'client.objective',
        value: null,
        confidence: 'high',
        summary: 'Fechar o plano hoje.',
        evidence_message_ids: ['m1'],
      })
      const output = normalizePatch({
        patch,
        relevance: 'commercial',
      })
      assert.equal(output.state_patch.facts_to_add.length, 1)
      assert.equal(output.commercial_relevance, 'commercial')
    },
  },
]

test('corpus obrigatório contém os 28 cenários de inteligência comercial do cliente', () => {
  assert.equal(scenarios.length, 28)
})

for (const scenario of scenarios) {
  test(scenario.name, scenario.run)
}

test('guardrail rejeita padrão baseado em um único evento', () => {
  const patch = emptyPatch()
  patch.facts_to_add.push({
    kind: 'client.communication.pattern',
    value: 'short_responses',
    confidence: 'medium',
    summary: 'Prefere mensagens curtas.',
    evidence_message_ids: ['m1'],
  })

  assert.throws(
    () => normalizePatch({ patch }),
    error => {
      assert.ok(error instanceof StatefulCopilotContractError)
      assert.equal(error.code, 'COMMUNICATION_PATTERN_EVIDENCE_REQUIRED')
      return true
    },
  )
})

test('guardrail rejeita psicologia inventada', () => {
  const patch = emptyPatch()
  patch.facts_to_add.push({
    kind: 'client.communication.event',
    value: 'direct_questions',
    confidence: 'low',
    summary: 'O cliente é ansioso e dominante.',
    evidence_message_ids: ['m1'],
  })

  assert.throws(
    () => normalizePatch({ patch }),
    error => {
      assert.ok(error instanceof StatefulCopilotContractError)
      assert.equal(error.code, 'PSYCHOLOGICAL_PROFILE_NOT_ALLOWED')
      return true
    },
  )
})

test('guardrail rejeita a mesma afirmação como problema impacto e necessidade', () => {
  const patch = emptyPatch()
  patch.facts_to_add.push({
    kind: 'client.problem',
    value: null,
    confidence: 'high',
    summary: 'Perde oportunidades.',
    evidence_message_ids: ['m1'],
  })
  patch.needs_to_add.push({
    kind: 'commercial_need',
    confidence: 'high',
    summary: 'Perde oportunidades.',
    evidence_message_ids: ['m1'],
  })

  assert.throws(
    () => normalizePatch({ patch }),
    error => {
      assert.ok(error instanceof StatefulCopilotContractError)
      assert.equal(error.code, 'CLIENT_CONCEPT_DUPLICATION')
      return true
    },
  )
})

test('objeção substituída deixa de ser atual sem apagar o histórico', () => {
  const customer = read(emptyState({
    objections: [
      memory({
        id: 'objection-old',
        kind: 'price',
        summary: 'O preço era o obstáculo anterior.',
        status: 'superseded',
      }),
      memory({
        id: 'objection-current',
        kind: 'implementation',
        summary: 'A implantação é a objeção atual.',
      }),
    ],
  }))

  assert.deepEqual(
    customer.objections.map(item => item.memory_ids[0]),
    ['objection-current'],
  )
  assert.equal(
    customer.superseded_information[0].category,
    'objection',
  )
})
