// R8 — Firewall de proveniência factual.
//
// Princípio: SAÍDA DERIVADA NÃO É EVIDÊNCIA PRIMÁRIA. Resumo, Commercial
// Reading, memória, reasoning e a própria mensagem gerada podem interpretar,
// mas nunca promover a si mesmos a fato. Um fato específico só chega a uma
// superfície (AGORA, ANÁLISE, CLIENTE, MENSAGEM) com fonte que tenha
// AUTORIDADE para aquele tipo de afirmação.
//
// Caso real que originou a rodada (Lorena): a mensagem 2559 ("Quando eu e
// meu marido podemos fazer uma aula experimental?") foi capturada uma única
// vez por outro dispositivo e não existe na conversa que o vendedor vê hoje
// (a captura atual viu mensagens anteriores e posteriores, não ela). O
// Commercial Reading v2 a citou; a mensagem sugerida herdou "marido".

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CLAIM_SOURCE_AUTHORITY,
  FACT_SOURCE_AUTHORITY,
  buildFactEvidenceRegistry,
  classifyLedgerObservation,
  companyItemsFromCommercialContext,
  companyItemsFromKnowledgeReferences,
  emptyFactProvenanceReport,
  excludedPrimaryMessageIds,
  gateCommercialReadingProvenance,
  gateCommercialStateProvenance,
  gateCycleMemoryProvenance,
  groundClaims,
  groundDerivedItem,
  stripUnsupportedClaims,
  unsupportedClaims,
} from './commercial-fact-grounding.ts'

import {
  composeSellerMessage,
} from './lead-seller-message.ts'

import {
  buildSellerFacingReasoningProjection,
} from '../server/seller-facing-reasoning-projection.ts'

import {
  buildCustomerViewModel,
} from '../server/customer-view-model.ts'

import {
  gateDeepSellerResult,
} from '../server/companion-analysis-job-reader.ts'

const COMPANY = '40fb91ee-0000-4000-8000-000000000001'
const OTHER_COMPANY = '7a1c0de0-0000-4000-8000-000000000002'

// ---------------------------------------------------------------------------
// Fixture: ledger da Lorena com a integridade de observação real
// ---------------------------------------------------------------------------

// Dispositivo A capturou só 2559/2560 (uma vez, 12/09). O dispositivo B
// (29/09) re-observou a conversa inteira que o vendedor vê — mensagens de
// 01/09 antes e depois de 2559, e as de 10/09 e 25/09 — mas não 2559/2560.
const LORENA_LEDGER = [
  { id: '2509', direction: 'incoming', occurred_at: '2026-09-01T14:33:00Z', text: 'Bom dia', device: 'B', observed: '2026-09-29T21:47:25Z' },
  { id: '2510', direction: 'incoming', occurred_at: '2026-09-01T14:33:20Z', text: 'Tudo bem?', device: 'B', observed: '2026-09-29T21:47:25Z' },
  { id: '2511', direction: 'incoming', occurred_at: '2026-09-01T14:33:40Z', text: 'Podemos fazer a aula experimental hoje?', device: 'B', observed: '2026-09-29T21:47:25Z' },
  { id: '2513', direction: 'outgoing', occurred_at: '2026-09-01T17:29:00Z', text: 'Olá', device: 'B', observed: '2026-09-29T21:47:25Z' },
  { id: '2559', direction: 'incoming', occurred_at: '2026-09-01T18:15:00Z', text: 'Quando eu e meu marido podemos fazer uma aula experimental?', device: 'A', observed: '2026-09-12T02:37:56Z' },
  { id: '2560', direction: 'incoming', occurred_at: '2026-09-01T18:15:10Z', text: 'Mayara', device: 'A', observed: '2026-09-12T02:37:56Z' },
  { id: '2401', direction: 'outgoing', occurred_at: '2026-09-10T15:00:00Z', text: 'Oi, Lorena! Tivemos um problema com nosso WhatsApp e só consegui ver agora. Você já fez a aula experimental?', device: 'B', observed: '2026-09-29T21:47:25Z' },
  { id: '2402', direction: 'incoming', occurred_at: '2026-09-10T15:20:00Z', text: 'Não fiz ainda.', device: 'B', observed: '2026-09-29T21:47:25Z' },
  { id: '2410', direction: 'outgoing', occurred_at: '2026-09-10T15:25:30Z', text: 'Qual dia e horário fica melhor para você?', device: 'B', observed: '2026-09-29T21:47:25Z' },
  { id: '3290', direction: 'outgoing', occurred_at: '2026-09-25T13:00:00Z', text: 'PROMOÇÃO DE SETEMBRO! Plano mensal R$ 129,90. Faça sua matrícula e aproveite!', device: 'B', observed: '2026-09-29T21:47:25Z' },
]

const LORENA_COMPANY_CONTEXT = {
  config_version_id: 'cfg-1',
  business_description: 'Academia de musculação e aulas coletivas.',
  value_proposition: null,
  products: [
    {
      product_id: 'plano-mensal',
      name: 'Plano mensal',
      category: 'plano',
      base_price: 149.9,
      active: true,
      benefits: ['Aula experimental gratuita'],
      forbidden_claims: ['Garantia de resultado em 30 dias'],
    },
  ],
  facts: [],
}

function lorenaObservation() {
  return classifyLedgerObservation(
    LORENA_LEDGER.map((row) => ({
      id: row.id,
      occurred_at: row.occurred_at,
      last_observed_at: row.observed,
      last_device_key: row.device,
    })),
  )
}

function lorenaRegistry({ sellerInstruction = null, extraMessages = [], extraCompanyItems = [] } = {}) {
  const observation = lorenaObservation()

  return buildFactEvidenceRegistry({
    company_id: COMPANY,
    messages: [
      ...LORENA_LEDGER.map((row) => ({
        id: row.id,
        company_id: COMPANY,
        direction: row.direction,
        content_type: 'text',
        text: row.text,
        occurred_at: row.occurred_at,
        observation: observation.get(row.id),
      })),
      ...extraMessages,
    ],
    company_items: [
      ...companyItemsFromCommercialContext({
        company_id: COMPANY,
        commercial_context: LORENA_COMPANY_CONTEXT,
      }),
      ...extraCompanyItems,
    ],
    seller_instruction: sellerInstruction,
  })
}

function statuses(text, registry, perspective = 'customer_facing') {
  return groundClaims(text, registry, { perspective }).map(
    (claim) => `${claim.kind}:${claim.value}:${claim.status}`,
  )
}

function evidence(summary, ids = [], memory = []) {
  return { summary, evidence_message_ids: ids, memory_ids: memory }
}

function makeReading(overrides = {}) {
  const base = {
    contract_version: 'commercial-reading-v2',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    conversation_summary: {
      initial_context: evidence('Cliente iniciou a conversa pedindo uma aula experimental.', ['2511']),
      evolution: null,
      important_events: [],
      current_state: evidence('A pergunta de dia e horário e a oferta de planos ficaram sem resposta.', ['2410', '3290']),
      last_customer_request_or_decision: evidence('Cliente pediu para fazer a aula experimental.', ['2511']),
    },
    customer: {
      objectives: [],
      problems: [],
      impacts: [],
      needs: [],
      interests: [evidence('Interesse em fazer a aula experimental.', ['2511'])],
      decision_criteria: [],
      preferences: [],
      open_questions: [],
      objections: [],
      uncertainties: [],
      discussed_products: [],
      primary_product_interest: null,
      competitors: [],
      commitments: [],
      missing_discovery: [{ ...evidence('Falta saber se o interesse na aula continua.', ['2402']), topic: 'timeline' }],
      resolved_information: [],
      superseded_information: [],
      communication: { events: [], patterns: [] },
    },
    commercial_evolution: [],
    method: {
      configured: false,
      name: null,
      stages: [],
      current_stage: null,
      adherence: {
        status: 'not_configured',
        summary: 'Sem método configurado.',
        deviation_stage_order: null,
        what_happened: null,
        missing_information: null,
        why_it_matters: null,
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
    seller_strengths: [],
    improvement_points: [],
    risks: { customer_objections: [], service_risks: [] },
    best_approach: { decision: 'follow_up', reason: 'Retomar o interesse antes de propor agenda.', channel: 'whatsapp', evidence_message_ids: [], memory_ids: [] },
    communication: { intervention_needed: true, recommended_question: null, recommended_message: null },
    operations: {
      crm: { should_change_crm_stage: false, recommended_status: null, rationale: null, requires_human_confirmation: true },
      agenda: { should_change_agenda: false, expected_next_action_at: null, rationale: null, requires_human_confirmation: true },
    },
    evidence_message_ids: [],
    memory_ids: [],
  }

  return {
    ...base,
    ...overrides,
    conversation_summary: { ...base.conversation_summary, ...(overrides.conversation_summary ?? {}) },
    customer: { ...base.customer, ...(overrides.customer ?? {}) },
    risks: { ...base.risks, ...(overrides.risks ?? {}) },
    communication: { ...base.communication, ...(overrides.communication ?? {}) },
  }
}

function makeState(overrides = {}) {
  const item = (id, summary, ids, extra = {}) => ({
    id,
    kind: 'fact',
    summary,
    evidence_message_ids: ids,
    memory_status: 'active',
    created_in_state_version: 1,
    updated_in_state_version: 1,
    closed_in_state_version: null,
    confidence: 'medium',
    ...extra,
  })

  return {
    contract_version: 'phase-5.1-commercial-state-v1',
    cycle_id: 'cycle-1',
    version: 3,
    commercial_role: 'buyer',
    current_moment: { summary: 'Retomada depois de silêncio.', evidence_message_ids: [] },
    current_priority: { summary: 'Reconfirmar o interesse.', evidence_message_ids: [] },
    last_analyzed_message_ids: [],
    last_evidence_message_ids: [],
    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-26T22:07:00Z',
    ...overrides,
    _item: item,
  }
}

function stateItem(id, summary, ids, extra = {}) {
  return makeState()._item(id, summary, ids, extra)
}

const json = (value) => JSON.stringify(value)

// ---------------------------------------------------------------------------
// Integridade do ledger
// ---------------------------------------------------------------------------

test('LEDGER: 2559 emoldurada por uma visão posterior sem ela → ausente da conversa atual', () => {
  const observation = lorenaObservation()

  assert.equal(observation.get('2559'), 'absent_from_later_view')
  assert.equal(observation.get('2560'), 'absent_from_later_view')

  for (const id of ['2509', '2510', '2511', '2513', '2401', '2402', '2410', '3290']) {
    assert.equal(observation.get(id), 'confirmed', id)
  }

  const registry = lorenaRegistry()
  assert.deepEqual(
    registry.excluded.map((entry) => `${entry.source_id}:${entry.reason}`).sort(),
    ['2559:absent_from_later_view', '2560:absent_from_later_view'],
  )
  assert.deepEqual([...excludedPrimaryMessageIds(registry)].sort(), ['2559', '2560'])
})

test('LEDGER: sem moldura (visão posterior só de mensagens mais novas, rolagem/virtualização) nada é concluído', () => {
  const observation = classifyLedgerObservation([
    { id: 'old', occurred_at: '2026-09-01T10:00:00Z', last_observed_at: '2026-09-02T10:00:00Z', last_device_key: 'A' },
    { id: 'new-1', occurred_at: '2026-09-20T10:00:00Z', last_observed_at: '2026-09-29T10:00:00Z', last_device_key: 'B' },
    { id: 'new-2', occurred_at: '2026-09-21T10:00:00Z', last_observed_at: '2026-09-29T10:00:05Z', last_device_key: 'B' },
    { id: 'no-data', occurred_at: '2026-09-01T11:00:00Z', last_observed_at: null },
  ])

  assert.equal(observation.get('old'), 'confirmed')
  assert.equal(observation.get('no-data'), 'unknown')

  // Vizinhos imediatos re-observados em instantes diferentes (rolagem
  // rápida pode ter pulado M): nada é concluído.
  const scrolled = classifyLedgerObservation([
    { id: 'p', occurred_at: '2026-09-01T10:00:00Z', last_observed_at: '2026-09-29T10:00:00Z', last_device_key: 'B' },
    { id: 'm', occurred_at: '2026-09-01T11:00:00Z', last_observed_at: '2026-09-02T10:00:00Z', last_device_key: 'A' },
    { id: 'n', occurred_at: '2026-09-01T12:00:00Z', last_observed_at: '2026-09-29T10:05:00Z', last_device_key: 'B' },
  ])
  assert.equal(scrolled.get('m'), 'confirmed')

  // Mesmo instante, mas o vizinho mais próximo não foi re-observado: a
  // moldura precisa ser a dos vizinhos imediatos re-observados.
  const snapshot = classifyLedgerObservation([
    { id: 'p', occurred_at: '2026-09-01T10:00:00Z', last_observed_at: '2026-09-29T10:00:00Z', last_device_key: 'B' },
    { id: 'm', occurred_at: '2026-09-01T11:00:00Z', last_observed_at: '2026-09-02T10:00:00Z', last_device_key: 'A' },
    { id: 'n', occurred_at: '2026-09-01T12:00:00Z', last_observed_at: '2026-09-29T10:00:01Z', last_device_key: 'B' },
  ])
  assert.equal(snapshot.get('m'), 'absent_from_later_view')
})

// ---------------------------------------------------------------------------
// Contaminação A–E: saída derivada nunca vira fato
// ---------------------------------------------------------------------------

test('CONTAMINAÇÃO A (Commercial Reading): item que só cita a mensagem ausente sai; o reparo tira só o trecho sem suporte', () => {
  const registry = lorenaRegistry()
  const reading = makeReading({
    conversation_summary: {
      last_customer_request_or_decision: evidence('Cliente solicitou aula experimental para ele e seu marido sem definir data.', ['2559']),
    },
    customer: {
      interests: [evidence('O cliente manifestou interesse em fazer aula experimental para ele e seu marido.', ['2511', '2559'])],
    },
    communication: {
      recommended_message: 'Oi, Lorena! Quer agendar a aula experimental para você e seu marido?',
    },
  })

  const { reading: gated, report } = gateCommercialReadingProvenance(reading, registry)

  assert.doesNotMatch(json(gated), /marido/i)
  assert.equal(gated.conversation_summary.last_customer_request_or_decision, null)
  assert.equal(gated.customer.interests.length, 1)
  assert.match(gated.customer.interests[0].summary, /aula experimental para ele\b/)
  assert.equal(gated.customer.interests[0].grounding_status, 'verified')
  assert.ok(report.removed.some((entry) => entry.path === 'conversation_summary.last_customer_request_or_decision'))
  assert.ok(report.repaired.some((entry) => /marido/.test(entry.before) && !/marido/.test(entry.after)))
})

test('CONTAMINAÇÃO B (memória): memória não lava fato — item de memória sem base sai e a leitura que só cita ele também', () => {
  const registry = lorenaRegistry()
  const state = makeState({
    facts: [
      stateItem('mem-marido', 'Cliente vai treinar com o marido.', ['2559']),
      stateItem('mem-aula', 'Cliente pediu aula experimental.', ['2511']),
    ],
  })

  const gatedState = gateCommercialStateProvenance(state, registry)

  assert.deepEqual(gatedState.state.facts.map((item) => item.id), ['mem-aula'])
  assert.ok(gatedState.memory.removed.has('mem-marido'))

  const reading = makeReading({
    customer: {
      objectives: [
        evidence('Treinar acompanhada.', [], ['mem-marido']),
        evidence('Conhecer a academia pela aula experimental.', [], ['mem-aula']),
      ],
    },
  })

  const { reading: gated } = gateCommercialReadingProvenance(reading, registry, gatedState.memory)

  assert.deepEqual(gated.customer.objectives.map((item) => item.summary), ['Conhecer a academia pela aula experimental.'])
  assert.equal(gated.customer.objectives[0].grounding_status, 'verified')
})

test('CONTAMINAÇÃO C (resumo de trabalho): "marido" no resumo derivado não entra na MENSAGEM', async () => {
  const registry = lorenaRegistry()
  const drafts = [
    'Oi, Lorena! Da última vez você comentou que gostaria de fazer uma aula experimental com seu marido. Como está esse interesse para vocês agora?',
  ]
  const provider = async (request) => {
    if (request.prompt_version.includes('review')) {
      const candidate = JSON.parse(request.user_prompt).candidate_message
      return { content: JSON.stringify({ message: candidate, changed: false, issue_code: 'none' }), provider: 'test' }
    }

    return { content: JSON.stringify({ message: drafts[0] }), provider: 'test' }
  }

  const result = await composeSellerMessage({
    workingSummary: 'Lorena quer fazer uma aula experimental com o marido.',
    currentInteraction: LORENA_LEDGER.filter((row) => !['2559', '2560'].includes(row.id)).map((row) => ({
      direction: row.direction,
      occurred_at: row.occurred_at,
      text: row.text,
      message_id: row.id,
    })),
    sellerIntent: 'Quero retomar a conversa.',
    recipientName: 'Lorena',
    method: { name: 'Método', description: null, stages: [], business_context: null, seller_rules: [] },
    reasoning: null,
    messageStrategy: null,
    factRegistry: registry,
    provider,
  })

  assert.equal(result.status, 'ready', json(result))
  assert.doesNotMatch(result.message, /marido|vocês|voces|casal/i)
  assert.match(result.message, /aula experimental/)
  assert.equal(
    (result.diagnostics?.fact_trace ?? []).filter((entry) => !['verified', 'verified_current', 'historical'].includes(entry.status)).length,
    0,
  )
  // O trace de HML mostra o que saiu e por quê.
  assert.ok(
    (result.diagnostics?.blocked_claims ?? []).some(
      (entry) => entry.kind === 'relationship' && entry.value === 'conjuge' && entry.status === 'unsupported',
    ),
  )
})

test('CONTAMINAÇÃO D (reasoning/AGORA): inferência passa, fato sem fonte não chega ao vendedor', () => {
  const registry = lorenaRegistry()
  const projection = buildSellerFacingReasoningProjection({
    reasoning: {
      status: 'ready',
      decision: 'reactivate',
      decision_reason: 'O interesse existiu, mas a conversa perdeu continuidade.',
      current_situation: 'Lorena quer treinar com o marido. O interesse atual ainda não foi reconfirmado.',
      objective_now: 'Reconfirmar o interesse antes de propor horário.',
      do_not_do: [],
      selected_techniques: [],
      company_knowledge_used: [],
      limitations: [],
      temporal_context: null,
    },
    reading: {
      reading: makeReading({
        communication: {
          intervention_needed: true,
          recommended_message: 'Oi, Lorena! Você e seu marido ainda pensam em fazer a aula experimental?',
        },
      }),
    },
    state: null,
    fact_registry: registry,
  })

  assert.doesNotMatch(json(projection), /marido/i)
  assert.equal(projection.what_is_happening, 'O interesse atual ainda não foi reconfirmado.')
  assert.equal(projection.why_now, 'O interesse existiu, mas a conversa perdeu continuidade.')
})

test('CONTAMINAÇÃO E (fala do próprio vendedor/Yolen): mensagem da empresa não prova fato sobre o cliente', () => {
  const registry = lorenaRegistry({
    extraMessages: [
      { id: 'yolen-1', company_id: COMPANY, direction: 'outgoing', content_type: 'text', text: 'Oi, Lorena! Você e seu marido podem vir amanhã?' },
    ],
  })

  assert.deepEqual(statuses('Você e seu marido podem vir amanhã?', registry), ['relationship:conjuge:unsupported'])

  // Item da leitura sobre o cliente que só cita fala do vendedor: fora.
  const grounding = groundDerivedItem(
    { texts: ['Cliente pretende vir amanhã.'], evidence_message_ids: ['yolen-1'] },
    'customer_fact',
    registry,
  )
  assert.equal(grounding.status, 'unsupported')
  assert.equal(grounding.reason, 'customer_fact_cited_only_seller_messages')
})

// ---------------------------------------------------------------------------
// Autoridade por tipo de afirmação A–E
// ---------------------------------------------------------------------------

test('AUTORIDADE A (relação pessoal): só o cliente declara; "minha irmã" sustenta "sua irmã", nunca "seu marido"', () => {
  const registry = lorenaRegistry({
    extraMessages: [
      { id: 'c-irma', company_id: COMPANY, direction: 'incoming', content_type: 'text', text: 'Minha irmã Mariana também quer fazer a aula.' },
      { id: 's-filho', company_id: COMPANY, direction: 'outgoing', content_type: 'text', text: 'Seu filho também pode participar.' },
    ],
  })

  assert.deepEqual(statuses('Sua irmã pode vir junto na aula.', registry), ['relationship:irmao:verified'])
  assert.deepEqual(statuses('Seu marido pode vir junto na aula.', registry), ['relationship:conjuge:unsupported'])
  assert.deepEqual(statuses('Seu filho pode vir junto na aula.', registry), ['relationship:filho:unsupported'])
})

test('AUTORIDADE B (preço): atual só da configuração vigente; valor antigo só com enquadramento histórico', () => {
  const registry = lorenaRegistry()

  assert.deepEqual(statuses('O plano mensal custa R$ 149,90.', registry), ['price:149.9:verified_current'])
  assert.deepEqual(statuses('O plano mensal custa R$ 129,90.', registry), ['price:129.9:conflicting'])
  assert.deepEqual(statuses('Naquela conversa foi informado R$ 129,90.', registry), ['price:129.9:historical'])
  assert.deepEqual(statuses('O plano custa R$ 99,90.', registry), ['price:99.9:unsupported'])
  // Seller-facing narra o que aconteceu: o valor da promoção enviada é histórico.
  assert.deepEqual(statuses('Você enviou a promoção de R$ 129,90.', registry, 'seller_facing').filter((s) => s.startsWith('price')), ['price:129.9:historical'])
})

test('AUTORIDADE C (benefício/promoção/proibido): só o que a empresa confirma; forbidden_claims nunca passam', () => {
  const registry = lorenaRegistry()

  assert.deepEqual(statuses('A aula experimental é gratuita.', registry), ['benefit:gratuito:verified_current'])
  assert.deepEqual(statuses('Temos estacionamento gratuito.', registry).filter((s) => s.startsWith('benefit')), ['benefit:gratuito:unsupported'])
  assert.ok(
    groundClaims('Oferecemos garantia de resultado em 30 dias.', registry)
      .some((claim) => claim.status === 'unsupported' && claim.reason === 'forbidden_by_company'),
  )
  assert.deepEqual(statuses('Só hoje: últimas vagas!', registry).filter((s) => s.startsWith('urgency')).map((s) => s.split(':').pop()), ['unsupported'])
})

test('AUTORIDADE D (objeção/preferência): só a fala do cliente; pergunta não vira afirmação', () => {
  const registry = lorenaRegistry({
    extraMessages: [
      { id: 's-preco', company_id: COMPANY, direction: 'outgoing', content_type: 'text', text: 'Foi o preço que pesou?' },
    ],
  })

  assert.deepEqual(statuses('Entendo que você achou caro.', registry), ['objection:preco:unsupported'])
  assert.deepEqual(statuses('Você prefere de manhã, certo.', registry), ['preference:manha:unsupported'])
  assert.deepEqual(statuses('Você prefere manhã ou tarde?', registry), [])

  const withCustomer = lorenaRegistry({
    extraMessages: [
      { id: 'c-caro', company_id: COMPANY, direction: 'incoming', content_type: 'text', text: 'Achei caro, não cabe no meu orçamento agora.' },
    ],
  })
  assert.deepEqual(statuses('Entendo que você achou caro.', withCustomer), ['objection:preco:verified'])

  // Risco de objeção na leitura que só cita o vendedor: removido.
  const { reading: gated } = gateCommercialReadingProvenance(
    makeReading({ risks: { customer_objections: [evidence('Cliente acha o plano caro.', ['s-preco'])] } }),
    registry,
  )
  assert.deepEqual(gated.risks.customer_objections, [])
})

test('AUTORIDADE E (foto/avatar): nunca é fonte factual; inferência visual sai da leitura', () => {
  assert.equal(FACT_SOURCE_AUTHORITY.profile_avatar, 'none')

  for (const [kind, authority] of Object.entries(CLAIM_SOURCE_AUTHORITY)) {
    assert.ok(!authority.current.includes('profile_avatar'), kind)
    assert.ok(!authority.historical.includes('profile_avatar'), kind)
  }

  const { reading: gated, report } = gateCommercialReadingProvenance(
    makeReading({ customer: { impacts: [evidence('Pela foto do perfil, parece que treina com a esposa.', [])] } }),
    lorenaRegistry(),
  )

  assert.deepEqual(gated.customer.impacts, [])
  assert.ok(report.removed.some((entry) => entry.path === 'customer.impacts[0]'))
})

// ---------------------------------------------------------------------------
// Empresa, memória e mensagem
// ---------------------------------------------------------------------------

test('MULTIEMPRESA: conhecimento e conversa de outra empresa nunca sustentam fato', () => {
  const registry = lorenaRegistry({
    extraMessages: [
      { id: 'foreign-1', company_id: OTHER_COMPANY, direction: 'incoming', content_type: 'text', text: 'Meu marido quer treinar também.' },
    ],
    extraCompanyItems: [
      ...companyItemsFromCommercialContext({
        company_id: OTHER_COMPANY,
        commercial_context: { products: [{ product_id: 'x', name: 'Plano X', category: null, base_price: 99, active: true, benefits: ['Estacionamento gratuito'] }], facts: [] },
      }),
      ...companyItemsFromKnowledgeReferences({
        company_id: OTHER_COMPANY,
        references: [{ source_type: 'commercial_fact', source_id: 'promo-b', grounded_content: 'Desconto de 30% na matrícula' }],
      }),
    ],
  })

  assert.ok(registry.excluded.some((entry) => entry.source_id === 'foreign-1' && entry.reason === 'foreign_company'))
  assert.ok(registry.excluded.some((entry) => entry.source_id === 'x' && entry.reason === 'foreign_company'))
  assert.deepEqual(statuses('Seu marido pode vir junto.', registry), ['relationship:conjuge:unsupported'])
  assert.deepEqual(statuses('O plano custa R$ 99,00.', registry), ['price:99:unsupported'])
  assert.ok(statuses('Temos estacionamento gratuito.', registry).includes('benefit:gratuito:unsupported'))
  assert.ok(statuses('Temos 30% de desconto na matrícula.', registry).includes('percentage:30%:unsupported'))
})

test('CONHECIMENTO VIGENTE: fato expirado ou produto inativo não sustenta afirmação atual', () => {
  const items = companyItemsFromCommercialContext({
    company_id: COMPANY,
    commercial_context: {
      products: [{ product_id: 'old', name: 'Plano antigo', category: null, base_price: 79.9, active: false, benefits: [] }],
      facts: [
        { fact_key: 'promo_setembro', fact_value: 'Desconto de 20% na matrícula', validity_status: 'expired' },
        { fact_key: 'promo_outubro', fact_value: 'Desconto de 10% na matrícula', validity_status: 'current' },
      ],
    },
  })
  const registry = buildFactEvidenceRegistry({ company_id: COMPANY, company_items: items })

  assert.deepEqual(statuses('O plano custa R$ 79,90.', registry), ['price:79.9:unsupported'])
  assert.ok(statuses('Temos 20% de desconto na matrícula.', registry).includes('percentage:20%:unsupported'))
  assert.ok(statuses('Temos 10% de desconto na matrícula.', registry).includes('percentage:10%:verified_current'))
})

test('MEMÓRIA: item com fato específico que a própria evidência não sustenta sai da cadeia ativa', () => {
  const registry = lorenaRegistry()
  const { state, report } = gateCommercialStateProvenance(
    makeState({
      needs: [stateItem('need-1', 'Quer treinar com o marido no fim de semana.', ['2511'])],
      signals: [stateItem('sig-1', 'Respondeu que ainda não fez a aula.', ['2402'])],
    }),
    registry,
    emptyFactProvenanceReport(registry),
  )

  assert.doesNotMatch(json(state.needs), /marido/i)
  assert.deepEqual(state.signals.map((item) => item.id), ['sig-1'])
  assert.ok(report.removed.length + report.repaired.length >= 1)
})

test('MENSAGEM: instrução do vendedor não cria fato — valor/desconto sem fonte fica fora e o vendedor recebe o aviso; a mensagem continua sendo entregue', async () => {
  const registry = lorenaRegistry({ sellerInstruction: 'Ofereça 20% de desconto na matrícula por R$ 79,90.' })
  const drafts = [
    'Oi, Lorena! Consigo 20% de desconto na matrícula, fica R$ 79,90. Como está seu interesse na aula experimental?',
  ]
  const provider = async (request) => {
    if (request.prompt_version.includes('review')) {
      const candidate = JSON.parse(request.user_prompt).candidate_message
      return { content: JSON.stringify({ message: candidate, changed: false, issue_code: 'none' }), provider: 'test' }
    }

    return { content: JSON.stringify({ message: drafts[0] }), provider: 'test' }
  }

  const result = await composeSellerMessage({
    workingSummary: 'Lorena pediu para fazer uma aula experimental e não retomou a conversa.',
    currentInteraction: [
      { direction: 'incoming', occurred_at: '2026-09-01T14:33:40Z', text: 'Podemos fazer a aula experimental hoje?', message_id: '2511' },
    ],
    sellerIntent: 'Ofereça 20% de desconto na matrícula por R$ 79,90.',
    recipientName: 'Lorena',
    method: { name: 'Método', description: null, stages: [], business_context: null, seller_rules: [] },
    reasoning: null,
    messageStrategy: null,
    factRegistry: registry,
    provider,
  })

  assert.equal(result.status, 'ready', json(result))
  assert.doesNotMatch(result.message, /20\s*%|79,90|desconto/i)
  assert.ok(result.advisories?.some((advisory) => /R\$ 79,90/.test(advisory)))
  assert.ok(result.advisories?.some((advisory) => /20%/.test(advisory)))
})

test('REPARO: remove só a afirmação sem suporte e preserva o resto da frase', () => {
  const registry = lorenaRegistry()
  const repaired = stripUnsupportedClaims(
    'Oi, Lorena! Você comentou que queria fazer a aula com seu marido. Como está esse interesse para vocês agora?',
    registry,
  )

  assert.equal(repaired, 'Oi, Lorena! Você comentou que queria fazer a aula. Como está esse interesse agora?')
  assert.deepEqual(unsupportedClaims(groundClaims(repaired, registry)), [])
})

// ---------------------------------------------------------------------------
// Golden Lorena: da leitura persistida contaminada às superfícies
// ---------------------------------------------------------------------------

test('GOLDEN LORENA: leitura v2 contaminada → CLIENTE separa sabemos/inferimos sem "marido"; AGORA sem sugestão contaminada', () => {
  const registry = lorenaRegistry()
  const state = makeState({
    facts: [stateItem('mem-marido', 'Cliente quer treinar com o marido.', ['2559'])],
    signals: [stateItem('sig-1', 'Respondeu que ainda não fez a aula.', ['2402'])],
  })
  const reading = makeReading({
    conversation_summary: {
      last_customer_request_or_decision: evidence('Cliente solicitou aula experimental para ele e seu marido sem definir data.', ['2559']),
    },
    customer: {
      interests: [
        evidence('O cliente manifestou interesse em aula experimental para ele e seu marido.', ['2511', '2559']),
      ],
      objectives: [evidence('Busca uma rotina de exercícios com acompanhamento.', ['2511'])],
      preferences: [evidence('Prefere treinar acompanhada.', [], ['mem-marido'])],
      communication: { events: [], patterns: [evidence('Responde de forma breve.', ['2402'])] },
    },
    communication: {
      intervention_needed: true,
      recommended_message: 'Oi, Lorena! Tudo bem? Quer agendar a aula experimental para você e seu marido?',
    },
  })

  const gatedState = gateCommercialStateProvenance(state, registry)
  const { reading: gated } = gateCommercialReadingProvenance(reading, registry, gatedState.memory)

  const customer = buildCustomerViewModel({
    reading: gated,
    generated_at: '2026-09-29T15:00:00Z',
    state_record_id: 'state-1',
    state_version: 6,
    state_updated_at: '2026-09-26T22:07:00Z',
  })

  assert.doesNotMatch(json(customer), /marido/i)
  assert.ok(customer.knowledge, 'leitura com proveniência expõe sabemos/inferimos')
  assert.ok(customer.knowledge.known.some((item) => /aula experimental/.test(item.summary)))
  assert.ok(customer.knowledge.inferred.some((item) => /rotina de exercícios|forma breve/.test(item.summary)))
  assert.ok(!customer.knowledge.known.some((item) => /rotina de exercícios/.test(item.summary)), 'interpretação nunca aparece como fato')

  const projection = buildSellerFacingReasoningProjection({
    reasoning: {
      status: 'ready',
      decision: 'reactivate',
      decision_reason: 'Interesse histórico real, oportunidade sem continuidade.',
      current_situation: 'Interesse histórico em aula experimental; interesse atual não confirmado.',
      objective_now: 'Reconfirmar o interesse antes de voltar a dia e horário.',
      do_not_do: [],
      selected_techniques: [],
      company_knowledge_used: [],
      limitations: [],
      temporal_context: null,
    },
    reading: { reading: gated },
    state: gatedState.state,
    fact_registry: registry,
  })

  assert.doesNotMatch(json(projection), /marido/i)
  // Temporal/momentum/reativação preservados: a decisão comercial não muda.
  assert.equal(projection.decision, 'reactivate')
  assert.equal(projection.next_best_action, 'Reconfirmar o interesse antes de voltar a dia e horário.')
})

test('MEMÓRIA DO CICLO (ANÁLISE/AGORA): itens desta conversa passam pelo gate; os de outra conversa são julgados pela evidência dela', () => {
  const registry = lorenaRegistry()
  const cycleItem = (memory_id, summary, ids, conversation_key) => ({
    memory_id,
    origin_id: memory_id,
    kind: 'commitment',
    summary,
    evidence_message_ids: ids,
    memory_status: 'active',
    created_in_state_version: 1,
    updated_in_state_version: 1,
    closed_in_state_version: null,
    confidence: 'medium',
    provenance: { conversation_key, state_record_id: 's', state_version: 1 },
  })
  const memory = {
    company_id: COMPANY,
    cycle_id: 'cycle-1',
    reference_time: '2026-09-29T15:00:00Z',
    conversation_keys: ['phone:5544', 'instagram:lorena'],
    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [
      cycleItem('c-1', 'Cliente vai trazer o marido na aula experimental.', ['2559'], 'phone:5544'),
      cycleItem('c-2', 'Cliente pediu aula experimental.', ['2511'], 'phone:5544'),
      cycleItem('c-3', 'Cliente confirmou visita no sábado.', ['ig-9'], 'instagram:lorena'),
    ],
    signals: [],
    uncertainties: [],
  }

  const { memory: gated, report } = gateCycleMemoryProvenance(memory, registry, 'phone:5544')

  assert.deepEqual(gated.commitments.map((item) => item.memory_id), ['c-2', 'c-3'])
  assert.ok(report.removed.some((entry) => entry.path === 'cycle_memory.commitments[0]'))
})

test('RESULTADO PROFUNDO (fallback local da extensão): leitura e mensagem sugerida saem do servidor já com o gate', () => {
  const result = gateDeepSellerResult(
    {
      contract_version: 'companion-deep-seller-result-v1',
      engine_source: 'stateful',
      commercial_relevance: 'commercial',
      commercial_role: 'buyer',
      summary: 'Lorena quer treinar com o marido. A conversa perdeu continuidade.',
      commercial_reading: makeReading({
        conversation_summary: {
          last_customer_request_or_decision: evidence('Cliente solicitou aula experimental para ele e seu marido.', ['2559']),
        },
      }),
      recommended_next_approach: 'Reconfirmar o interesse antes de propor horário.',
      recommended_question: 'Você e seu marido ainda pensam em fazer a aula?',
      suggested_message: 'Oi, Lorena! Tudo bem? Quer agendar a aula experimental para você e seu marido?',
    },
    lorenaRegistry(),
  )

  assert.doesNotMatch(json(result), /marido/i)
  assert.equal(result.summary, 'A conversa perdeu continuidade.')
  assert.equal(result.commercial_reading.conversation_summary.last_customer_request_or_decision, null)
  assert.match(result.suggested_message, /aula experimental/)
})
