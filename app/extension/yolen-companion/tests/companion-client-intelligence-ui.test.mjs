import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)

const view = require(
  '../src/companion-seller-information-view.js',
)

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

test('separa objetivo, problema, impacto e necessidade nos grupos corretos', () => {
  const html = view.renderClientCommercialArea(reading(customer({
    objectives: [evidence('Aumentar a conversão.')],
    problems: [evidence('Leads ficam sem follow-up.')],
    impacts: [evidence('Oportunidades são perdidas.')],
    needs: [evidence('Organizar o acompanhamento.')],
  })))

  assert.match(html, /data-yolen-client-field="objectives"/)
  assert.match(html, /data-yolen-client-field="problems"/)
  assert.match(html, /data-yolen-client-field="impacts"/)
  assert.match(html, /data-yolen-client-field="needs"/)
  assert.match(html, /O que ele quer/)
  assert.match(html, /Contexto e problema/)
  assert.ok(html.indexOf('Leads ficam') < html.indexOf('Oportunidades são'))
})

test('preserva múltiplos interesses, critérios e preferências comerciais', () => {
  const html = view.renderClientCommercialArea(reading(customer({
    interests: [
      evidence('Automação de follow-up.'),
      evidence('Visibilidade gerencial.'),
    ],
    decision_criteria: [evidence('Implantação simples.')],
    preferences: [evidence('Prefere comparação por escrito.')],
  })))

  assert.match(html, /Automação de follow-up/)
  assert.match(html, /Visibilidade gerencial/)
  assert.match(html, /Critérios de decisão/)
  assert.match(html, /Preferências comerciais/)
  assert.match(html, /data-yolen-client-intelligence-group="decision"/)
})

test('produto canônico aparece como identificado e pode ser o principal', () => {
  const product = evidence('Demonstrou interesse na Yolen.', {
    canonical_product_id: 'product-yolen',
    name: 'Yolen',
    interest_level: 'primary',
  })
  const html = view.renderClientCommercialArea(reading(customer({
    discussed_products: [product],
    primary_product_interest: product,
  })))

  assert.match(html, /data-yolen-client-product-source="catalog"/)
  assert.match(html, /data-yolen-client-product-interest="primary"/)
  assert.match(html, /Produto identificado · Maior interesse/)
  assert.match(html, /Produto principal/)
  assert.match(html, />Yolen</)
})

test('produto apenas mencionado não é apresentado como produto oficial', () => {
  const html = view.renderClientCommercialArea(reading(customer({
    discussed_products: [evidence('Mencionou o serviço Atlas.', {
      canonical_product_id: null,
      name: 'Serviço Atlas',
      interest_level: 'discussed',
    })],
  })))

  assert.match(html, /data-yolen-client-product-source="observed"/)
  assert.match(html, /Menção observada · Produto discutido/)
  assert.doesNotMatch(html, /Produto identificado/)
})

test('distingue concorrente nominal de alternativa sem nome', () => {
  const html = view.renderClientCommercialArea(reading(customer({
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
  })))

  assert.match(html, /data-yolen-client-competitor-type="named"/)
  assert.match(html, /Concorrente identificado/)
  assert.match(html, /RD Station/)
  assert.match(html, /data-yolen-client-competitor-type="unnamed_alternative"/)
  assert.match(html, /Alternativa sem nome/)
  assert.match(html, /Outra solução em avaliação/)
})

test('comunicação mostra somente os comportamentos observáveis do contrato', () => {
  const html = view.renderClientCommercialArea(reading(customer({
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
  })))

  assert.match(html, /Comunicação observada/)
  assert.match(html, /Busca dados ou números/)
  assert.match(html, /Perguntas diretas/)
  assert.doesNotMatch(html, /personalidade|psicológico/i)
})

test('missing discovery explicita somente os tópicos ativos do contrato', () => {
  const html = view.renderClientCommercialArea(reading(customer({
    missing_discovery: [
      evidence('O impacto ainda não foi comprovado.', {
        topic: 'impact',
        memory_ids: ['missing-impact'],
      }),
      evidence('O decisor ainda não foi confirmado.', {
        topic: 'decision_maker',
        memory_ids: ['missing-decision-maker'],
      }),
    ],
  })))

  assert.match(html, /Ainda precisamos descobrir/)
  assert.match(html, /data-yolen-client-missing-topic="impact"/)
  assert.match(html, /data-yolen-client-missing-topic="decision_maker"/)
  assert.match(html, /Impacto/)
  assert.match(html, /Decisor/)
  assert.match(html, /2 pontos ainda precisam ser confirmados/)
})

test('missing já resolvido sai da lista ativa e permanece no histórico', () => {
  const html = view.renderClientCommercialArea(reading(customer({
    missing_discovery: [evidence('O orçamento precisava ser confirmado.', {
      topic: 'budget',
      memory_ids: ['missing-budget'],
    })],
    resolved_information: [evidence('Informação resolvida: orçamento confirmado em R$ 5 mil.', {
      category: 'missing_discovery',
      memory_ids: ['missing-budget'],
    })],
  })))

  assert.doesNotMatch(html, /data-yolen-client-missing-topic="budget"/)
  assert.doesNotMatch(html, /Ainda precisamos descobrir/)
  assert.match(html, /data-yolen-client-history-state="resolved"/)
  assert.match(html, /orçamento confirmado em R\$ 5 mil/)
})

test('objeção atual fica em CLIENTE e melhoria do vendedor não é duplicada', () => {
  const richReading = reading(customer({
    objections: [evidence('O investimento está acima do esperado.')],
  }), {
    improvement_points: [evidence('Você apresentou o preço cedo demais.')],
  })
  const html = view.renderClientCommercialArea(richReading)

  assert.match(html, /Objeções atuais do cliente/)
  assert.match(html, /investimento está acima/)
  assert.doesNotMatch(html, /apresentou o preço cedo demais/)
})

test('renderiza compromissos comerciais com seu status real', () => {
  const html = view.renderClientCommercialArea(reading(customer({
    commitments: [evidence('Demonstração confirmada.', {
      status: 'confirmed',
      scheduled_at: '2026-08-22T15:00:00-03:00',
      proposed_at: '2026-08-21T12:00:00-03:00',
    })],
  })))

  assert.match(html, /Compromissos comerciais/)
  assert.match(html, /data-yolen-client-commitment-status="confirmed"/)
  assert.match(html, /Confirmado/)
  assert.match(html, /Demonstração confirmada/)
})

test('informações resolvidas e substituídas ficam em detalhe histórico', () => {
  const html = view.renderClientCommercialArea(reading(customer({
    resolved_information: [evidence('Informação resolvida: objeção de preço superada.', {
      category: 'objection',
    })],
    superseded_information: [evidence('Informação anterior substituída: preço era o critério principal.', {
      category: 'decision_criterion',
    })],
  })))

  assert.match(html, /Informações resolvidas e atualizadas/)
  assert.match(html, /data-yolen-client-history-state="resolved"/)
  assert.match(html, /data-yolen-client-history-state="superseded"/)
})

test('grupos vazios não aparecem e ausência de dado não vira afirmação', () => {
  assert.equal(
    view.renderClientCommercialArea(reading(customer())),
    '',
  )

  const html = view.renderClientCommercialArea(reading(customer({
    problems: [evidence('O processo atual é manual.')],
  })))

  assert.match(html, /data-yolen-client-intelligence-group="context"/)
  assert.doesNotMatch(html, /data-yolen-client-intelligence-group="wants"/)
  assert.doesNotMatch(html, /não há problemas|sem problema/i)
})

test('V1 pobre continua seguro com somente os campos antigos existentes', () => {
  const html = view.renderClientCommercialArea(reading({
    needs: [evidence('Organizar os retornos.')],
    interests: [],
    decision_criteria: [],
    preferences: [],
    open_questions: [],
    objections: [],
    uncertainties: [],
  }))

  assert.match(html, /Organizar os retornos/)
  assert.doesNotMatch(html, /undefined|null/)
  assert.doesNotMatch(html, /Produto identificado|Ainda precisamos descobrir/)
})

test('sessão non-commercial preserva fatos comerciais históricos em CLIENTE', () => {
  const html = view.renderClientCommercialArea(reading(customer({
    objectives: [evidence('Aumentar a conversão.')],
  }), {
    commercial_relevance: 'non_commercial',
  }))

  assert.match(html, /Aumentar a conversão/)
  assert.match(html, /data-yolen-client-intelligence-group="wants"/)
})

test('resumo fica no primeiro nível e os grupos usam detalhe nativo sob demanda', () => {
  const html = view.renderClientCommercialArea(reading(customer({
    objectives: [evidence('Aumentar a conversão.')],
    problems: [evidence('Follow-ups são esquecidos.')],
    missing_discovery: [evidence('O prazo ainda não foi confirmado.', {
      topic: 'timeline',
    })],
  })))

  assert.match(html, /data-yolen-client-summary/)
  assert.match(html, /<details[\s\S]*data-yolen-client-intelligence-group="wants"/)
  assert.match(html, /<summary>/)
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:=|\s|>)/)
})

test('pendência (compromisso ainda em aberto) aparece no resumo do primeiro nível', () => {
  const html = view.renderClientCommercialArea(reading(customer({
    objectives: [evidence('Regularizar o pagamento em atraso.')],
    commitments: [evidence('Cliente vai enviar o comprovante de pagamento.', {
      status: 'proposed',
    })],
  })))

  const summaryMatch = html.match(
    /<div class="yolen-client-intelligence-summary"[\s\S]*?<\/div>\s*<div class="yolen-client-intelligence-groups">/,
  )

  assert.ok(summaryMatch, 'deveria existir um bloco de resumo no primeiro nível')
  assert.match(summaryMatch[0], /Pendência/)
  assert.match(summaryMatch[0], /Cliente vai enviar o comprovante de pagamento\./)
})

test('compromisso já concluído ou cancelado não aparece como pendência no resumo', () => {
  const html = view.renderClientCommercialArea(reading(customer({
    commitments: [evidence('Visita já realizada.', {
      status: 'completed',
    })],
  })))

  const summaryMatch = html.match(
    /<div class="yolen-client-intelligence-summary"[\s\S]*?<\/div>\s*<div class="yolen-client-intelligence-groups">/,
  )

  if (summaryMatch) {
    assert.doesNotMatch(summaryMatch[0], /Pendência/)
  }
})
