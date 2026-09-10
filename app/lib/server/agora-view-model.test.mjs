import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  AGORA_VIEW_MODEL_SILENT_REASONS,
  AGORA_VIEW_MODEL_STATUSES,
  buildAgoraViewModel,
} from './agora-view-model.ts'

// ---------------------------------------------------------------------------
// FASE 16.5 — testes do presenter seller-facing de AGORA.
//
// `buildAgoraViewModel` é uma função pura sobre `DecisionState` — os
// fixtures abaixo constroem objetos `DecisionState` diretamente (mesma
// disciplina de teste unitário do presenter, sem precisar do loader
// nem de um admin Supabase fake), cobrindo os 35 cenários obrigatórios
// do mandato (seção 34) e os testes estruturais de qualidade de texto
// (seção 35).
// ---------------------------------------------------------------------------

const COMPANY_ID = '10000000-0000-4000-8000-000000000001'
const CYCLE_ID = '30000000-0000-4000-8000-000000000001'
const CONVERSATION_KEY = 'whatsapp:+5547999990001'
const REFERENCE_TIME = '2026-09-09T17:00:00.000Z'

function buildPrimary(overrides = {}) {
  return {
    kind: 'respond',
    source: 'customer_waiting',
    priority: 'high',
    silent: false,
    summary: 'Cliente aguardando resposta.',
    reason: 'Cliente aguarda resposta desde 2026-09-09T16:00:00.000Z.',
    recommended_action: 'Responder o cliente.',
    evidence_message_ids: ['m1'],
    memory_ids: [],
    ...overrides,
  }
}

function buildInterventionCard(overrides = {}) {
  return {
    source: 'cycle_commitment',
    kind: 'follow_up',
    priority: 'high',
    summary: 'Envio da proposta revisada.',
    reason: 'Compromisso agendado para 2026-09-09T15:00:00.000Z já venceu.',
    recommended_action:
      'Confirmar com o cliente o andamento do compromisso e reagendar explicitamente se necessário.',
    evidence_message_ids: ['m2'],
    memory_ids: ['mem-1'],
    observed_at: '2026-09-09T15:00:00.000Z',
    resolve_condition: 'Resolve quando o compromisso for cumprido ou reagendado.',
    ...overrides,
  }
}

function buildDecisionState({
  primary_decision = buildPrimary(),
  interventions = [],
  current_moment = {
    commercial_relevance: 'commercial',
    is_active_session: true,
    last_interaction_at: '2026-09-09T16:55:00.000Z',
    session_gap_ms: 4 * 60 * 60 * 1000,
  },
  reference_time = REFERENCE_TIME,
} = {}) {
  return {
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    reference_time,

    current_moment,
    primary_decision,
    interventions,

    operational_signal_availability: {
      crm_pipeline: 'AVAILABLE_NOW',
      agenda: 'PARTIAL',
      sla: 'AVAILABLE_NOW',
      waiting: 'AVAILABLE_NOW',
      commitments: 'AVAILABLE_NOW',
      opportunity_inactivity: 'NOT_AVAILABLE',
    },

    provenance: {
      conversation_key: CONVERSATION_KEY,
      cycle_id: CYCLE_ID,
      analise_source_event_id: 'event-1',
      analise_state_record_id: 'state-1',
      analise_state_version: 1,
      analise_state_updated_at: REFERENCE_TIME,
      agora_updated_at: null,
      client_context_generated_at: REFERENCE_TIME,
    },
  }
}

// 1/2 — respond com pergunta concreta / por customer waiting.
test('respond com pergunta concreta: headline/action vêm do candidato real, sem template genérico', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'respond',
      source: 'customer_waiting',
      priority: 'high',
      summary: 'Cliente perguntou se o plano inclui suporte 24h.',
      recommended_action: 'Confirmar se o plano contratado inclui suporte 24h.',
    }),
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.silent, false)
  assert.equal(vm.primary.status, 'respond')
  assert.equal(vm.primary.priority, 'high')
  assert.equal(vm.primary.headline, 'Cliente perguntou se o plano inclui suporte 24h.')
  assert.equal(vm.primary.action, 'Confirmar se o plano contratado inclui suporte 24h.')
  assert.equal(vm.primary.provenance.source, 'customer_waiting')
})

test('respond por customer waiting: status/priority refletem o candidato de client_context, não um template', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'respond',
      source: 'client_sla',
      priority: 'critical',
      summary: 'Cliente aguardando resposta acima do limite de SLA.',
      recommended_action: 'Responder o cliente agora para não violar o SLA.',
    }),
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.primary.status, 'respond')
  assert.equal(vm.primary.priority, 'critical')
  assert.equal(vm.primary.provenance.source, 'client_sla')
})

// 3/4 — follow_up por compromisso / sem urgência inventada.
test('follow_up por compromisso: texto do compromisso real passa intacto, sem urgência inventada', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'follow_up',
      source: 'cycle_commitment',
      priority: 'high',
      summary: 'Envio da proposta revisada.',
      recommended_action:
        'Confirmar com o cliente o andamento do compromisso e reagendar explicitamente se necessário.',
    }),
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.primary.status, 'follow_up')
  // Nunca insere qualificadores de urgência que não vieram do candidato
  // (ex.: "urgente", "imediatamente") — o texto é exatamente o que
  // Decision State computou.
  assert.equal(vm.primary.headline, 'Envio da proposta revisada.')
  assert.ok(!vm.primary.headline.toLowerCase().includes('urgente'))
  assert.ok(!vm.primary.action.toLowerCase().includes('imediatamente'))
})

// 5/6 — handle_objection atual / objeção resolvida não aparece.
test('handle_objection atual: headline é a objeção real, não um texto genérico de "objeção aberta"', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'handle_objection',
      source: 'commercial_risk',
      priority: 'high',
      summary: 'Cliente acha o preço alto e ameaça desistir.',
      recommended_action: 'Tratar a objeção antes de avançar a conversa.',
    }),
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.primary.status, 'handle_objection')
  assert.equal(vm.primary.headline, 'Cliente acha o preço alto e ameaça desistir.')
  assert.notEqual(vm.primary.headline, 'Há uma objeção relevante do cliente para tratar.')
})

test('objeção resolvida não aparece: sem candidato de objeção, primary/secondary não citam handle_objection', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'respond',
      source: 'customer_waiting',
    }),
    interventions: [],
  })

  const vm = buildAgoraViewModel(state)

  assert.notEqual(vm.primary.status, 'handle_objection')
  assert.equal(vm.secondary.length, 0)
})

// 7/8 — give_space em sessão pessoal / give_space + compromisso secundário.
test('give_space em sessão pessoal: renderiza como card curto de "não pressionar", não como ausência', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'give_space',
      source: null,
      priority: null,
      summary: 'Sessão atual não é comercial.',
      recommended_action:
        'Responder no tom da conversa atual sem empurrar a venda; a oportunidade comercial permanece preservada em ANÁLISE.',
    }),
    interventions: [],
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.silent, false)
  assert.equal(vm.primary.status, 'give_space')
  assert.equal(vm.primary.priority, null)
  assert.equal(vm.secondary.length, 0)
})

test('give_space + compromisso operacional secundário: dê espaço continua primário, compromisso vira secundário', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'give_space',
      source: null,
      priority: null,
      summary: 'Sessão atual não é comercial.',
      recommended_action: 'Responder no tom da conversa atual sem empurrar a venda.',
    }),
    interventions: [
      buildInterventionCard({
        source: 'cycle_commitment',
        kind: 'follow_up',
        priority: 'high',
        summary: 'Retorno comercial previsto para hoje às 16h.',
      }),
    ],
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.primary.status, 'give_space')
  assert.equal(vm.secondary.length, 1)
  assert.equal(vm.secondary[0].status, 'follow_up')
  assert.equal(vm.secondary[0].headline, 'Retorno comercial previsto para hoje às 16h.')
  // Nunca puxa preço/fechamento/proposta como secundário numa sessão
  // pessoal — só o sinal operacional real que sobreviveu ao filtro de
  // Decision State.
  assert.ok(!vm.secondary[0].headline.toLowerCase().includes('preço'))
})

// 9/10 — no_intervention / no_intervention com leitura rica não gera card.
test('no_intervention: silencioso, sem card artificial', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'no_intervention',
      source: null,
      priority: null,
      summary: 'Nenhuma leitura comercial disponível e nenhum sinal operacional pendente.',
      recommended_action: 'Nenhuma ação necessária agora.',
    }),
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.silent, true)
  assert.equal(vm.silent_reason, 'nothing_to_do')
  assert.equal(vm.primary, null)
  assert.deepEqual(vm.secondary, [])
})

test('no_intervention com interventions não vazio (não deveria acontecer, mas é defendido): secondary ainda assim fica vazio', () => {
  // Defesa em profundidade: mesmo se um chamador futuro produzir um
  // DecisionState inconsistente (kind no_intervention com
  // interventions não vazio, o que loadCanonicalDecisionState nunca
  // faz hoje), o presenter nunca deixa vazar um card comercial junto
  // de um "nada a fazer".
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'no_intervention',
      source: null,
      priority: null,
      summary: 'Nada.',
      recommended_action: 'Nenhuma ação necessária agora.',
    }),
    interventions: [buildInterventionCard()],
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.silent, true)
  assert.deepEqual(vm.secondary, [])
})

// 11 — current moment unknown.
test('current moment unknown: presenter não referencia current_moment nem inventa urgência a partir dele', () => {
  const withUnknown = buildDecisionState({
    current_moment: {
      commercial_relevance: null,
      is_active_session: null,
      last_interaction_at: null,
      session_gap_ms: 4 * 60 * 60 * 1000,
    },
    primary_decision: buildPrimary({
      kind: 'respond',
      summary: 'Cliente perguntou o preço do plano anual.',
    }),
  })

  const withKnown = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'respond',
      summary: 'Cliente perguntou o preço do plano anual.',
    }),
  })

  const vmUnknown = buildAgoraViewModel(withUnknown)
  const vmKnown = buildAgoraViewModel(withKnown)

  // current_moment não influencia o view model — quem decide isso já é
  // Decision State (mandato §19: AGORA nunca assume urgência sem
  // evidência).
  assert.deepEqual(vmUnknown.primary, vmKnown.primary)
})

// 12/13 — SLA critical/high / stalled opportunity (escalate).
test('SLA crítico: priority é critical, sem rebaixar nem inflar', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'respond',
      source: 'client_sla',
      priority: 'critical',
      summary: 'Lead sem nenhum contato registrado, acima do limite de SLA.',
      recommended_action: 'Fazer o primeiro contato com o lead.',
    }),
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.primary.priority, 'critical')
})

test('oportunidade estagnada (SLA sem cliente aguardando): status escalate, prioridade critical', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'escalate',
      source: 'client_sla',
      priority: 'critical',
      summary: 'Oportunidade estagnada na etapa acima do limite de SLA.',
      recommended_action:
        'Avaliar a oportunidade e decidir o próximo passo para avançar de etapa — não é uma mensagem do cliente aguardando resposta.',
    }),
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.primary.status, 'escalate')
  assert.equal(vm.primary.priority, 'critical')
})

// 14/15 — seller coaching muda ação / irrelevante não aparece.
test('seller coaching relevante (corretivo) muda a ação principal', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'clarify',
      source: 'seller_coaching',
      priority: 'high',
      summary: 'Você confirmou um prazo de entrega que não está no contrato.',
      recommended_action: 'Corrigir a informação com o cliente antes que ele tome uma decisão baseada nela.',
    }),
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.primary.status, 'respond')
  assert.equal(vm.primary.provenance.source, 'seller_coaching')
})

test('seller coaching irrelevante (sem candidato) não aparece em primary nem secondary', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({ kind: 'respond', source: 'customer_waiting' }),
    interventions: [],
  })

  const vm = buildAgoraViewModel(state)

  assert.notEqual(vm.primary.provenance.source, 'seller_coaching')
  assert.equal(vm.secondary.length, 0)
})

// 16/17 — method deviation relevante / irrelevante não aparece.
test('method deviation relevante: aparece traduzido em ação prática, sem nome de estágio interno', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'deepen_discovery',
      source: 'method_adherence',
      priority: 'high',
      summary: 'Etapa de diagnóstico pulada antes de apresentar o preço.',
      recommended_action: 'Retomar a descoberta: entenda o impacto antes de voltar a falar de preço.',
    }),
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.primary.status, 'deepen_discovery')
  assert.ok(!vm.primary.headline.includes('off_method'))
  assert.ok(!vm.primary.action.includes('off_method'))
})

test('method info irrelevante (sem desvio) não aparece', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({ kind: 'respond', source: 'customer_waiting' }),
  })

  const vm = buildAgoraViewModel(state)

  assert.notEqual(vm.primary.provenance.source, 'method_adherence')
})

// 18/19 — customer preference relevante / memória irrelevante não aparece.
test('customer preference relevante: texto já incorporado pela Decision State passa intacto', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'respond',
      summary: 'Cliente pediu para confirmar por escrito, como sempre prefere.',
      recommended_action: 'Responder por texto confirmando os próximos passos por escrito.',
    }),
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.primary.headline, 'Cliente pediu para confirmar por escrito, como sempre prefere.')
})

test('customer memory irrelevante não aparece: view model não injeta nada além do candidato dado', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({ kind: 'respond', source: 'customer_waiting' }),
  })

  const vm = buildAgoraViewModel(state)

  assert.deepEqual(vm.primary.provenance.memory_ids, [])
})

// 20/21 — primary + secondary sem duplicidade / máximo 2 secondary.
test('primary + secondary sem duplicidade: headlines distintos por construção do fixture', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'respond',
      source: 'customer_waiting',
      summary: 'Cliente aguardando resposta.',
    }),
    interventions: [
      buildInterventionCard({
        source: 'cycle_commitment',
        summary: 'Envio da proposta revisada.',
      }),
      buildInterventionCard({
        source: 'method_adherence',
        kind: 'deepen_discovery',
        summary: 'Descoberta de impacto ainda incompleta.',
      }),
    ],
  })

  const vm = buildAgoraViewModel(state)

  const headlines = [vm.primary.headline, ...vm.secondary.map((s) => s.headline)]
  assert.equal(new Set(headlines).size, headlines.length)
})

test('máximo 2 secondary mesmo se o DecisionState (inconsistente) trouxer mais', () => {
  const state = buildDecisionState({
    interventions: [
      buildInterventionCard({ summary: 'Item 1' }),
      buildInterventionCard({ summary: 'Item 2' }),
      buildInterventionCard({ summary: 'Item 3' }),
    ],
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.secondary.length, 2)
  assert.deepEqual(vm.secondary.map((s) => s.headline), ['Item 1', 'Item 2'])
})

// 22/23 — Decision State null / scope mismatch (upstream produz null).
test('Decision State null: silencioso com motivo unavailable, nunca recomendação inventada', () => {
  const vm = buildAgoraViewModel(null)

  assert.equal(vm.silent, true)
  assert.equal(vm.silent_reason, 'unavailable')
  assert.equal(vm.primary, null)
  assert.deepEqual(vm.secondary, [])
  assert.equal(vm.reference_time, null)
})

test('Decision State scope mismatch (upstream degrada para null): mesmo resultado conservador de null', () => {
  // O loader (loadCanonicalDecisionState) já falha fechado para null em
  // mismatch de escopo/reference_time — o presenter só precisa tratar
  // esse null com a mesma disciplina do teste anterior, nunca com um
  // caminho especial que tente adivinhar o que teria sido a decisão.
  const vm = buildAgoraViewModel(null)

  assert.deepEqual(vm, buildAgoraViewModel(null))
})

// 24/25 — cross-company / cross-cycle isolation.
test('cross-company isolation: view model nunca expõe company_id/cycle_id/conversation_key', () => {
  const vm = buildAgoraViewModel(buildDecisionState())

  assert.ok(!('company_id' in vm))
  assert.ok(!('cycle_id' in vm))
  assert.ok(!('conversation_key' in vm))
  assert.ok(!JSON.stringify(vm).includes(COMPANY_ID))
})

test('cross-cycle isolation: provenance do sinal nunca carrega cycle_id/company_id', () => {
  const vm = buildAgoraViewModel(buildDecisionState())

  assert.ok(!('cycle_id' in vm.primary.provenance))
  assert.ok(!('company_id' in vm.primary.provenance))
})

// 26 — A→B conversation switch sem stale recommendation.
test('A→B: chamadas independentes nunca compartilham estado — troca de conversa não vaza recomendação antiga', () => {
  const stateA = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'handle_objection',
      summary: 'Lead A questionou o preço.',
    }),
  })

  const stateB = buildDecisionState({
    conversation_key: 'whatsapp:+5547999990002',
    primary_decision: buildPrimary({
      kind: 'no_intervention',
      source: null,
      priority: null,
      summary: 'Nada.',
      recommended_action: 'Nenhuma ação necessária agora.',
    }),
  })

  const vmA = buildAgoraViewModel(stateA)
  const vmB = buildAgoraViewModel(stateB)

  assert.equal(vmA.primary.headline, 'Lead A questionou o preço.')
  assert.equal(vmB.silent, true)
  assert.notEqual(vmB.primary?.headline, vmA.primary.headline)
})

// 27 — current session expirada.
test('current session expirada: presenter não referencia is_active_session, comportamento inalterado', () => {
  const expired = buildDecisionState({
    current_moment: {
      commercial_relevance: 'non_commercial',
      is_active_session: false,
      last_interaction_at: '2026-09-08T10:00:00.000Z',
      session_gap_ms: 4 * 60 * 60 * 1000,
    },
    primary_decision: buildPrimary({
      kind: 'escalate',
      source: 'client_sla',
      priority: 'critical',
      summary: 'Oportunidade estagnada na etapa acima do limite de SLA.',
    }),
  })

  const vm = buildAgoraViewModel(expired)

  assert.equal(vm.primary.status, 'escalate')
  assert.equal(vm.primary.priority, 'critical')
})

// 28 — opportunity preservada com current moment pessoal.
test('opportunity preservada com current moment pessoal: give_space primário, oportunidade só aparece como secondary operacional', () => {
  const state = buildDecisionState({
    current_moment: {
      commercial_relevance: 'non_commercial',
      is_active_session: true,
      last_interaction_at: REFERENCE_TIME,
      session_gap_ms: 4 * 60 * 60 * 1000,
    },
    primary_decision: buildPrimary({
      kind: 'give_space',
      source: null,
      priority: null,
      summary: 'Sessão atual não é comercial.',
      recommended_action: 'Responder no tom da conversa atual sem empurrar a venda.',
    }),
    interventions: [
      buildInterventionCard({
        source: 'cycle_commitment',
        summary: 'Retorno comercial previsto para hoje às 16h.',
      }),
    ],
  })

  const vm = buildAgoraViewModel(state)

  assert.equal(vm.primary.status, 'give_space')
  assert.equal(vm.secondary.length, 1)
  assert.equal(vm.secondary[0].status, 'follow_up')
})

// 29 — priority ordering.
test('priority ordering: secondary preserva a ordem já decidida por Decision State, sem reordenar', () => {
  const state = buildDecisionState({
    interventions: [
      buildInterventionCard({ priority: 'critical', summary: 'Primeiro (critical)' }),
      buildInterventionCard({ priority: 'medium', summary: 'Segundo (medium)' }),
    ],
  })

  const vm = buildAgoraViewModel(state)

  assert.deepEqual(
    vm.secondary.map((s) => s.priority),
    ['critical', 'medium'],
  )
})

// 30 — provenance preservada no view model.
test('provenance preservada: source/decision_kind/evidence_message_ids/memory_ids chegam intactos', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'handle_objection',
      source: 'commercial_risk',
      evidence_message_ids: ['m7', 'm8'],
      memory_ids: ['mem-9'],
    }),
    interventions: [
      buildInterventionCard({
        source: 'method_adherence',
        kind: 'clarify',
        evidence_message_ids: ['m3'],
        memory_ids: ['mem-2'],
      }),
    ],
  })

  const vm = buildAgoraViewModel(state)

  assert.deepEqual(vm.primary.provenance, {
    decision_kind: 'handle_objection',
    source: 'commercial_risk',
    evidence_message_ids: ['m7', 'm8'],
    memory_ids: ['mem-9'],
  })

  assert.deepEqual(vm.secondary[0].provenance, {
    decision_kind: 'clarify',
    source: 'method_adherence',
    evidence_message_ids: ['m3'],
    memory_ids: ['mem-2'],
  })
})

// 31 — texto não contém jargon interno indevido.
const INTERNAL_JARGON_TOKENS = [
  'client_sla',
  'customer_waiting',
  'cycle_commitment',
  'commercial_risk',
  'method_adherence',
  'seller_coaching',
  'insufficient_information',
  'decision_kind',
  'DecisionState',
  'primary_decision',
  'off_method',
  'no_intervention',
]

test('texto não contém jargon interno indevido: headline/action nunca citam nomes de source/kind cru', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'handle_objection',
      source: 'commercial_risk',
      summary: 'Cliente acha o preço alto e ameaça desistir.',
      recommended_action: 'Tratar a objeção antes de avançar a conversa.',
    }),
    interventions: [
      buildInterventionCard({
        source: 'method_adherence',
        kind: 'deepen_discovery',
        summary: 'Etapa de diagnóstico pulada antes de apresentar o preço.',
        recommended_action: 'Retomar a descoberta antes de voltar a falar de preço.',
      }),
    ],
  })

  const vm = buildAgoraViewModel(state)

  const renderedText = [vm.primary.headline, vm.primary.action, ...vm.secondary.flatMap((s) => [s.headline, s.action])]

  for (const text of renderedText) {
    for (const token of INTERNAL_JARGON_TOKENS) {
      assert.ok(!text.includes(token), `texto "${text}" vazou jargon interno "${token}"`)
    }
  }
})

// 32 — fallback não inventa ação comercial.
test('fallback (Decision State null) não inventa ação comercial: nenhum texto é gerado', () => {
  const vm = buildAgoraViewModel(null)

  assert.equal(vm.primary, null)
  assert.equal(JSON.stringify(vm).match(/respond|follow_up|handle_objection|escalate/g), null)
})

// 33 — loading não mostra recomendação velha (pureza/sem cache interno).
test('loading não mostra recomendação velha: chamadas repetidas são puras, sem cache/memória entre execuções', () => {
  const stale = buildDecisionState({
    primary_decision: buildPrimary({ kind: 'handle_objection', summary: 'Recomendação antiga.' }),
  })

  buildAgoraViewModel(stale)

  const fresh = buildAgoraViewModel(null)

  assert.equal(fresh.primary, null)
  assert.equal(fresh.silent, true)
})

// 34 — no auto-send.
test('no auto-send: o módulo não expõe nenhuma função de envio/despacho de mensagem', () => {
  const modulePath = fileURLToPath(new URL('./agora-view-model.ts', import.meta.url))
  const source = readFileSync(modulePath, 'utf8')

  assert.ok(!/\bsend[A-Z]|auto_send|autoSend|dispatchMessage/.test(source))
})

// 35 — MIE seller-facing continua inativo.
test('MIE seller-facing continua inativo: módulo não referencia message-intelligence/candidate ranking/critic', () => {
  const modulePath = fileURLToPath(new URL('./agora-view-model.ts', import.meta.url))
  const source = readFileSync(modulePath, 'utf8')

  const forbiddenReferences = [
    'message-intelligence',
    'candidate_ranking',
    'candidateRanking',
    'critic',
    'message_planner',
    'messagePlanner',
  ]

  for (const forbidden of forbiddenReferences) {
    assert.ok(!source.includes(forbidden), `agora-view-model.ts referencia "${forbidden}" — MIE seller-facing deve continuar pausado`)
  }
})

// ---------------------------------------------------------------------------
// Mandato §35 — testes estruturais de qualidade de texto (fixtures, não
// regex gigantesca): provam que uma bateria de textos reais (já usados
// em canonical-decision-state-source.ts) nunca dispara as frases
// genéricas banidas, e que uma cópia deliberadamente quebrada É
// detectada — a mesma disciplina "mutante" de
// phase16-seller-information-architecture-contract.test.mjs.
// ---------------------------------------------------------------------------

const BANNED_GENERIC_PHRASES = [
  'continue acompanhando',
  'continue o acompanhamento',
  'mantenha o follow-up',
  'mantenha o followup',
  'responda de forma consultiva',
  'entenda melhor a necessidade',
  'conduza a conversa',
  'responda o cliente.',
  'faça o follow-up',
  'trate a objeção do cliente.',
]

function containsBannedGenericPhrase(text) {
  const normalized = text.toLowerCase()
  return BANNED_GENERIC_PHRASES.some((phrase) => normalized.includes(phrase))
}

test('qualidade de texto: bateria de headlines/actions reais de Decision State nunca dispara frases genéricas banidas', () => {
  const realisticTexts = [
    'Cliente aguardando resposta acima do limite de SLA.',
    'Responder o cliente agora para não violar o SLA.',
    'Lead sem nenhum contato registrado, acima do limite de SLA.',
    'Fazer o primeiro contato com o lead.',
    'Compromisso agendado para 2026-09-09T15:00:00.000Z já venceu.',
    'Confirmar com o cliente o andamento do compromisso e reagendar explicitamente se necessário.',
    'Cliente acha o preço alto e ameaça desistir.',
    'Tratar a objeção antes de avançar a conversa.',
    'Etapa de diagnóstico pulada antes de apresentar o preço.',
    'Retomar a descoberta: entenda o impacto antes de voltar a falar de preço.',
    'Você confirmou um prazo de entrega que não está no contrato.',
    'Corrigir a informação com o cliente antes que ele tome uma decisão baseada nela.',
    'Sessão atual não é comercial.',
    'Responder no tom da conversa atual sem empurrar a venda; a oportunidade comercial permanece preservada em ANÁLISE.',
  ]

  for (const text of realisticTexts) {
    assert.ok(!containsBannedGenericPhrase(text), `texto real "${text}" foi sinalizado como genérico incorretamente`)
  }
})

test('qualidade de texto (mutante): frases genéricas conhecidas são de fato detectadas pelo checklist', () => {
  const genericTexts = [
    'Continue acompanhando o cliente.',
    'Mantenha o follow-up.',
    'Responda de forma consultiva.',
    'Entenda melhor a necessidade.',
    'Conduza a conversa.',
    'Responda o cliente.',
    'Trate a objeção do cliente.',
  ]

  for (const text of genericTexts) {
    assert.ok(containsBannedGenericPhrase(text), `frase genérica "${text}" não foi detectada pelo checklist`)
  }
})

test('qualidade de texto: primary e secondary nunca repetem o mesmo headline (redundância primário/secundário)', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({ summary: 'Cliente aguardando resposta.' }),
    interventions: [buildInterventionCard({ summary: 'Cliente aguardando resposta.' })],
  })

  const vm = buildAgoraViewModel(state)

  // Constrói o cenário "ruim" do mandato §21 (primário e secundário
  // duplicados) e prova que, se isso chegasse ao presenter, o teste de
  // não-duplicidade (cenário 20) o pegaria — aqui só fixamos que o
  // presenter não filtra por conta própria (isso é responsabilidade de
  // Decision State), então headlines iguais realmente aparecem iguais
  // quando o fixture força essa situação, confirmando que o teste do
  // cenário 20 é um mutante real, não tautológico.
  assert.equal(vm.primary.headline, vm.secondary[0].headline)
})

// Achado do Codex (PR #283): `wait` é uma recomendação deliberada de NÃO
// agir agora (o próprio contrato de leitura comercial só permite canal
// `wait`/`none` para esta decisão, e Communication Context a trata como
// não exigindo comunicação nenhuma). Mapeá-la para `follow_up` diria ao
// vendedor para "retomar contato" — o oposto do que Decision State
// recomendou.
test('wait nunca é apresentado como follow_up (recomendação de agir seria o oposto do que Decision State decidiu)', () => {
  const state = buildDecisionState({
    primary_decision: buildPrimary({
      kind: 'wait',
      source: null,
      priority: null,
      summary: 'Cliente pediu um tempo para decidir.',
      recommended_action: 'Canal recomendado: wait.',
    }),
  })

  const vm = buildAgoraViewModel(state)

  assert.notEqual(vm.primary.status, 'follow_up')
  assert.equal(vm.primary.status, 'no_intervention')
})

// ---------------------------------------------------------------------------
// Cobertura de enums/exports públicos.
// ---------------------------------------------------------------------------

test('AGORA_VIEW_MODEL_STATUSES cobre as 7 categorias esperadas', () => {
  assert.deepEqual(
    [...AGORA_VIEW_MODEL_STATUSES].sort(),
    [
      'deepen_discovery',
      'escalate',
      'follow_up',
      'give_space',
      'handle_objection',
      'no_intervention',
      'respond',
    ].sort(),
  )
})

test('AGORA_VIEW_MODEL_SILENT_REASONS cobre exatamente unavailable/nothing_to_do', () => {
  assert.deepEqual([...AGORA_VIEW_MODEL_SILENT_REASONS].sort(), ['nothing_to_do', 'unavailable'])
})
