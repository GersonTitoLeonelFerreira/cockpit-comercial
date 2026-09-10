import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)

const view = require(
  '../src/companion-seller-information-view.js',
)

// FASE 16.7 (recalibração seller-facing de CLIENTE) — renderClientCommercialArea
// (o dump completo de commercial_reading.customer.*, sem distinção
// person/cycle) foi substituída por renderCustomerViewModel, que consome
// o CustomerViewModel já pronto (app/lib/server/customer-view-model.ts)
// ou o fallback local equivalente (buildCustomerViewModelFromReading,
// mesma classificação person/cycle, usado só enquanto o view model
// canônico ainda não voltou do servidor). Estes testes usam o fallback
// diretamente — já é a função de produção real, não um helper de teste
// duplicado — para exercitar exatamente a mesma classificação que roda
// em produção.

function evidence(summary, overrides = {}) {
  return {
    summary,
    evidence_message_ids: ['message-1'],
    memory_ids: ['memory-1'],
    ...overrides,
  }
}

function customer(overrides = {}) {
  return {
    objectives: [],
    problems: [],
    impacts: [],
    needs: [],
    interests: [],
    decision_criteria: [],
    preferences: [],
    open_questions: [],
    objections: [],
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
    ...overrides,
  }
}

function reading(customerValue, overrides = {}) {
  return {
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    customer: customerValue,
    ...overrides,
  }
}

function renderReading(customerValue, overrides = {}) {
  const vm = view.buildCustomerViewModelFromReading(reading(customerValue, overrides))
  return view.renderCustomerViewModel(vm)
}

test('preferências e padrões de comunicação aparecem em "como prefere interagir", nunca como fato permanente', () => {
  const html = renderReading(customer({
    preferences: [evidence('Prefere comparação por escrito.')],
    communication: {
      patterns: [evidence('Pediu números em diferentes momentos.', {
        observation_type: 'pattern',
        behavior: 'requests_data_or_numbers',
      })],
      events: [],
    },
  }))

  assert.match(html, /Como prefere interagir/)
  assert.match(html, /data-yolen-customer-section="preferences"/)
  assert.match(html, /Prefere comparação por escrito/)
  assert.match(html, /Busca dados ou números/)
  assert.match(html, /Observado nesta conversa/)
  assert.doesNotMatch(html, /padrão permanente confirmado/)
})

test('objetivos, necessidades, interesses, problemas, impactos e critérios ficam no contexto secundário da oportunidade, nunca em preferências', () => {
  const html = renderReading(customer({
    objectives: [evidence('Aumentar a conversão.')],
    needs: [evidence('Organizar o acompanhamento.')],
    interests: [evidence('Automação de follow-up.'), evidence('Visibilidade gerencial.')],
    problems: [evidence('Leads ficam sem follow-up.')],
    impacts: [evidence('Oportunidades são perdidas.')],
    decision_criteria: [evidence('Implantação simples.')],
  }))

  assert.match(html, /data-yolen-customer-section="opportunity-context"/)
  assert.match(html, /Contexto desta oportunidade/)
  assert.match(html, /não é uma característica permanente confirmada/)
  assert.match(html, /data-yolen-client-field="objectives"/)
  assert.match(html, /data-yolen-client-field="needs"/)
  assert.match(html, /data-yolen-client-field="interests"/)
  assert.match(html, /data-yolen-client-field="problems"/)
  assert.match(html, /data-yolen-client-field="impacts"/)
  assert.match(html, /data-yolen-client-field="decision_criteria"/)
  assert.match(html, /Automação de follow-up/)
  assert.match(html, /Visibilidade gerencial/)

  // Nunca aparecem na seção primária de preferências.
  const preferencesSection = html.match(/data-yolen-customer-section="preferences"[\s\S]*?<\/section>/)
  assert.equal(preferencesSection, null)
})

test('produto canônico aparece como identificado e pode ser o principal, dentro do contexto da oportunidade', () => {
  const product = evidence('Demonstrou interesse na Yolen.', {
    canonical_product_id: 'product-yolen',
    name: 'Yolen',
    interest_level: 'primary',
  })
  const html = renderReading(customer({
    discussed_products: [product],
    primary_product_interest: product,
  }))

  assert.match(html, /data-yolen-customer-section="opportunity-context"/)
  assert.match(html, /data-yolen-client-product-source="catalog"/)
  assert.match(html, /data-yolen-client-product-interest="primary"/)
  assert.match(html, /Produto identificado · Maior interesse/)
  assert.match(html, />Yolen</)
})

test('produto apenas mencionado não é apresentado como produto oficial', () => {
  const html = renderReading(customer({
    discussed_products: [evidence('Mencionou o serviço Atlas.', {
      canonical_product_id: null,
      name: 'Serviço Atlas',
      interest_level: 'discussed',
    })],
  }))

  assert.match(html, /data-yolen-client-product-source="observed"/)
  assert.match(html, /Menção observada · Produto discutido/)
  assert.doesNotMatch(html, /Produto identificado/)
})

test('distingue concorrente nominal de alternativa sem nome', () => {
  const html = renderReading(customer({
    competitors: [
      evidence('Está comparando com a RD Station.', {
        name: 'RD Station',
        mention_type: 'named',
      }),
      evidence('Também avalia outra solução.', {
        name: null,
        mention_type: 'unnamed_alternative',
      }),
    ],
  }))

  assert.match(html, /data-yolen-client-competitor-type="named"/)
  assert.match(html, /Concorrente identificado/)
  assert.match(html, /RD Station/)
  assert.match(html, /data-yolen-client-competitor-type="unnamed_alternative"/)
  assert.match(html, /Alternativa sem nome/)
  assert.match(html, /Outra solução em avaliação/)
})

test('comunicação mostra somente os comportamentos observáveis do contrato, sem rótulo psicológico', () => {
  const html = renderReading(customer({
    communication: {
      patterns: [evidence('Pediu números em diferentes momentos.', {
        observation_type: 'pattern',
        behavior: 'requests_data_or_numbers',
      })],
      events: [evidence('Fez uma pergunta direta nesta mensagem.', {
        observation_type: 'event',
        behavior: 'direct_questions',
      })],
    },
  }))

  assert.match(html, /Busca dados ou números/)
  // communication.events fica no contexto secundário, distinto de
  // communication.patterns (que fica em preferências).
  assert.match(html, /Perguntas diretas/)
  assert.doesNotMatch(html, /personalidade|psicológico/i)
})

test('lacuna de descoberta ativa aparece como principal quando é a única', () => {
  const html = renderReading(customer({
    missing_discovery: [
      evidence('O impacto ainda não foi comprovado.', {
        topic: 'impact',
        memory_ids: ['missing-impact'],
      }),
    ],
  }))

  assert.match(html, /O que falta descobrir/)
  assert.match(html, /data-yolen-customer-gap="principal"/)
  assert.match(html, /data-yolen-customer-gap-topic="impact"/)
  assert.match(html, /Impacto/)
  assert.match(html, /O impacto ainda não foi comprovado/)
})

test('múltiplas lacunas: 1 principal + secundárias, nunca mais que 3 no total', () => {
  const html = renderReading(customer({
    missing_discovery: [
      evidence('Lacuna 1.', { topic: 'budget' }),
      evidence('Lacuna 2.', { topic: 'timeline' }),
      evidence('Lacuna 3.', { topic: 'decision_maker' }),
      evidence('Lacuna 4.', { topic: 'priority' }),
    ],
  }))

  assert.match(html, /data-yolen-customer-gap="principal"/)
  assert.match(html, /data-yolen-customer-gap="secondary"/)
  assert.match(html, /Lacuna 1/)
  assert.match(html, /Lacuna 2/)
  assert.match(html, /Lacuna 3/)
  assert.doesNotMatch(html, /Lacuna 4/)
})

test('missing já resolvido sai da lacuna ativa (mesma regra do presenter server-side)', () => {
  const html = renderReading(customer({
    missing_discovery: [evidence('O orçamento precisava ser confirmado.', {
      topic: 'budget',
      memory_ids: ['missing-budget'],
    })],
    resolved_information: [evidence('Informação resolvida: orçamento confirmado em R$ 5 mil.', {
      category: 'missing_discovery',
      memory_ids: ['missing-budget'],
    })],
  }))

  assert.doesNotMatch(html, /data-yolen-customer-gap-topic="budget"/)
  assert.doesNotMatch(html, /O que falta descobrir/)
})

test('sem missing_discovery, lacuna cai para open_questions/uncertainties como fallback', () => {
  const html = renderReading(customer({
    open_questions: [evidence('Qual é o prazo de decisão?')],
    uncertainties: [evidence('Não sabemos se ele é o decisor final.')],
  }))

  assert.match(html, /O que falta descobrir/)
  assert.match(html, /Qual é o prazo de decisão/)
  assert.match(html, /Não sabemos se ele é o decisor final/)
})

// Mandato §17 — objeção atual NÃO pertence ao CLIENTE (é território de
// ANÁLISE, via risks.customer_objections desde a FASE 16.6).
test('objeção atual nunca aparece em CLIENTE', () => {
  const html = renderReading(customer({
    objections: [evidence('O investimento está acima do esperado.')],
  }))

  assert.doesNotMatch(html, /investimento está acima/)
  assert.doesNotMatch(html, /Objeções atuais/i)
})

// Mandato §18 — compromissos são estado de oportunidade, não pertencem
// ao CLIENTE (já cobertos por ANÁLISE via Cycle Memory desde a FASE
// 16.6) — e duplicariam o mesmo dado (mandato §6).
test('compromissos comerciais nunca aparecem em CLIENTE', () => {
  const html = renderReading(customer({
    commitments: [evidence('Demonstração confirmada.', {
      status: 'confirmed',
      scheduled_at: '2026-08-22T15:00:00-03:00',
      proposed_at: '2026-08-21T12:00:00-03:00',
    })],
  }))

  assert.doesNotMatch(html, /Demonstração confirmada/)
  assert.doesNotMatch(html, /Compromissos comerciais/i)
})

test('grupos vazios não aparecem e ausência de dado não vira afirmação', () => {
  // Mandato §36 — sem nenhum dado, o empty state ajuda (nunca parece
  // erro) em vez de simplesmente desaparecer da tela.
  assert.match(
    renderReading(customer()),
    /data-yolen-customer-empty/,
  )

  const html = renderReading(customer({
    problems: [evidence('O processo atual é manual.')],
  }))

  assert.match(html, /data-yolen-client-field="problems"/)
  assert.doesNotMatch(html, /data-yolen-client-field="objectives"/)
  assert.doesNotMatch(html, /não há problemas|sem problema/i)
})

test('V1 pobre continua seguro com somente os campos antigos existentes', () => {
  const html = renderReading({
    needs: [evidence('Organizar os retornos.')],
    interests: [],
    decision_criteria: [],
    preferences: [],
    open_questions: [],
    objections: [],
    uncertainties: [],
    missing_discovery: [],
    resolved_information: [],
    superseded_information: [],
    discussed_products: [],
    primary_product_interest: null,
    competitors: [],
    objectives: [],
    problems: [],
    impacts: [],
    communication: { events: [], patterns: [] },
  })

  assert.match(html, /Organizar os retornos/)
  assert.doesNotMatch(html, /undefined|null/)
})

// Mandato §19 — regra não-negociável: sessão non-commercial nunca apaga
// memória pessoal já conhecida.
test('sessão non-commercial preserva fatos históricos em CLIENTE', () => {
  const html = renderReading(customer({
    objectives: [evidence('Aumentar a conversão.')],
  }), {
    commercial_relevance: 'non_commercial',
  })

  assert.match(html, /Aumentar a conversão/)
  assert.match(html, /data-yolen-customer-section="opportunity-context"/)
})

test('contexto da oportunidade fica em <details> recolhido, nunca aberto por padrão', () => {
  const html = renderReading(customer({
    objectives: [evidence('Aumentar a conversão.')],
  }))

  assert.match(html, /<details class="yolen-seller-secondary-details" data-yolen-customer-section="opportunity-context"/)
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:=|\s|>)/)
})
