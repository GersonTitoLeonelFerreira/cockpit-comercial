// Validação determinística do contrato normativo da FASE 16.1
// (companion-seller-product-contract.md, seção 2 e seguintes).
//
// Este teste NÃO testa produção. Ele testa se os cenários canônicos em
// tests/fixtures/phase16-seller-information-architecture-scenarios.mjs
// continuam respeitando a fronteira definitiva entre AGORA, ANÁLISE,
// CLIENTE e MENSAGEM. Cada regra abaixo corresponde a uma das 12 violações
// listadas na missão da FASE 16.1 (seção 36).
//
// Para provar que o teste não é tautológico, cada regra estrutural é
// verificada de duas formas: (1) todo cenário canônico real deve passar
// sem violações, e (2) uma cópia deliberadamente quebrada de um cenário
// real deve disparar exatamente a violação correspondente. Se um
// desenvolvedor futuro editar a fixture para reintroduzir a confusão que
// motivou esta fase (ex.: deixar MENSAGEM inventar um fato, ou deixar um
// sinal operacional converter uma sessão pessoal em comercial), este teste
// quebra.

import assert from 'node:assert/strict'
import test from 'node:test'

import { PHASE16_SCENARIOS } from './fixtures/phase16-seller-information-architecture-scenarios.mjs'

const VALID_MESSAGE_OUTPUTS = new Set(['message', 'silence'])

function clone(scenario) {
  return JSON.parse(JSON.stringify(scenario))
}

/**
 * Verifica um cenário contra as 12 regras da FASE 16.1 (seção 36 da
 * missão) que podem ser avaliadas cenário a cenário. Retorna a lista de
 * códigos de violação encontrados (vazia quando o cenário está conforme).
 * Regras 10 e 11 só se aplicam quando o cenário declara os blocos
 * `isolation`/`group` correspondentes. Regra 12 é verificada no nível do
 * conjunto inteiro de cenários, não por cenário (ver teste dedicado).
 */
function validateScenario(scenario) {
  const violations = []

  // Regra 1 — cenário sem as quatro perspectivas definidas.
  for (const area of ['agora', 'analise', 'cliente', 'mensagem']) {
    if (!scenario[area] || typeof scenario[area] !== 'object') {
      violations.push('missing_four_perspectives')
    }
  }

  if (violations.includes('missing_four_perspectives')) {
    // Sem as quatro áreas não há como avaliar as regras seguintes com
    // segurança.
    return violations
  }

  // Regra 2 — AGORA com mais de uma decisão principal.
  const primaryDecision = scenario.agora.primaryDecision
  if (Array.isArray(primaryDecision) || (primaryDecision !== null && typeof primaryDecision !== 'string')) {
    violations.push('agora_multiple_primary_decisions')
  }

  // Regra 3 — AGORA com mais de dois cards de intervenção.
  const cards = Array.isArray(scenario.agora.interventionCards)
    ? scenario.agora.interventionCards
    : null
  if (!cards || cards.length > 2) {
    violations.push('agora_too_many_intervention_cards')
  }

  // Regra 4 — MENSAGEM contendo fatos próprios não fornecidos pelas
  // camadas anteriores.
  if (scenario.mensagem.ownFactsIntroduced !== false) {
    violations.push('mensagem_introduces_own_facts')
  }

  // Regra 5 — sessão não comercial apagando a leitura da oportunidade.
  if (
    scenario.session?.commercial === false &&
    scenario.opportunity?.active === true &&
    (scenario.analise.opportunityReadingPresent !== true || scenario.opportunity.preserved !== true)
  ) {
    violations.push('non_commercial_session_erases_opportunity')
  }

  // Regra 6 — sinal operacional transformando sessão pessoal em comercial.
  if (
    scenario.operationalSignal?.present === true &&
    scenario.session?.commercial === false &&
    scenario.agora.treatsSessionAsCommercial !== false
  ) {
    violations.push('operational_signal_flips_session_commercial')
  }

  // Regra 7 — CLIENTE contendo avaliação do vendedor.
  if (scenario.cliente.containsSellerEvaluation !== false) {
    violations.push('cliente_contains_seller_evaluation')
  }

  // Regra 8 — ANÁLISE reduzida apenas ao último burst.
  const basedOnOnlyCurrentConversation =
    Array.isArray(scenario.analise.basedOn) &&
    scenario.analise.basedOn.length === 1 &&
    scenario.analise.basedOn[0] === 'current_conversation'
  if (
    scenario.analise.reducedToLastBurst !== false ||
    (scenario.opportunity?.active === true && basedOnOnlyCurrentConversation)
  ) {
    violations.push('analise_reduced_to_last_burst')
  }

  // Regra 9 — memória sem indicação de temporalidade/origem.
  const memoryItems = Array.isArray(scenario.cliente.memoryItems)
    ? scenario.cliente.memoryItems
    : []
  const hasUnprovenancedMemory = memoryItems.some(
    (item) => !item || !item.origin || !item.observedAt,
  )
  if (hasUnprovenancedMemory) {
    violations.push('memory_without_provenance')
  }

  // Regra 10 — isolamento A→B permitindo cross-lead state.
  if (scenario.isolation && scenario.isolation.crossLeadLeak !== false) {
    violations.push('cross_lead_state_leak')
  }

  // Regra 11 — grupo recebendo contexto individual.
  if (
    scenario.session?.isGroup === true &&
    scenario.group &&
    scenario.group.individualContextRendered !== false
  ) {
    violations.push('group_receives_individual_context')
  }

  // Validação estrutural adicional (não numerada na seção 36, mas exigida
  // pelo contrato — seção 8.3): a saída de MENSAGEM precisa ser um dos
  // dois valores válidos.
  if (!VALID_MESSAGE_OUTPUTS.has(scenario.mensagem.output)) {
    violations.push('invalid_mensagem_output')
  }

  return violations
}

test('todo cenário canônico da FASE 16.1 passa nas 11 regras estruturais por cenário', () => {
  for (const scenario of PHASE16_SCENARIOS) {
    const violations = validateScenario(scenario)
    assert.deepEqual(
      violations,
      [],
      `cenário "${scenario.id}" violou: ${violations.join(', ')}`,
    )
  }
})

test('existem exatamente os 10 cenários canônicos esperados, sem duplicação de id', () => {
  const expectedIds = [
    'scenario-1-active-sale-price-objection',
    'scenario-2-personal-conversation-active-opportunity',
    'scenario-3-personal-conversation-upcoming-commercial-agenda',
    'scenario-4-priority-inbound-without-new-message',
    'scenario-5-seller-off-method',
    'scenario-6-support-administrative-active-opportunity',
    'scenario-7-contradicted-old-memory',
    'scenario-8-lead-isolation-a-to-b',
    'scenario-9-group-conversation',
    'scenario-10-nothing-to-do',
  ]

  assert.deepEqual(PHASE16_SCENARIOS.map((scenario) => scenario.id), expectedIds)
  assert.equal(new Set(expectedIds).size, expectedIds.length)
})

test('regra 2 (mutante): AGORA com mais de uma decisão principal é detectado', () => {
  const broken = clone(PHASE16_SCENARIOS[0])
  broken.agora.primaryDecision = ['Decisão A', 'Decisão B']

  assert.ok(validateScenario(broken).includes('agora_multiple_primary_decisions'))
})

test('regra 3 (mutante): AGORA com mais de dois cards de intervenção é detectado', () => {
  const broken = clone(PHASE16_SCENARIOS[2])
  broken.agora.interventionCards.push(
    { source: 'sla', priority: 'high', reason: 'x', recommendedAction: 'y' },
    { source: 'crm', priority: 'medium', reason: 'x', recommendedAction: 'y' },
  )

  assert.ok(validateScenario(broken).includes('agora_too_many_intervention_cards'))
})

test('regra 4 (mutante): MENSAGEM introduzindo fato próprio é detectado', () => {
  const broken = clone(PHASE16_SCENARIOS[0])
  broken.mensagem.ownFactsIntroduced = true

  assert.ok(validateScenario(broken).includes('mensagem_introduces_own_facts'))
})

test('regra 5 (mutante): sessão não comercial apagando a oportunidade é detectado', () => {
  const broken = clone(PHASE16_SCENARIOS[1]) // cenário 2: pessoal + oportunidade ativa
  broken.analise.opportunityReadingPresent = false
  broken.opportunity.preserved = false

  assert.ok(validateScenario(broken).includes('non_commercial_session_erases_opportunity'))
})

test('regra 6 (mutante): sinal operacional convertendo sessão pessoal em comercial é detectado', () => {
  const broken = clone(PHASE16_SCENARIOS[2]) // cenário 3: pessoal + agenda comercial
  broken.agora.treatsSessionAsCommercial = true

  assert.ok(validateScenario(broken).includes('operational_signal_flips_session_commercial'))
})

test('regra 7 (mutante): CLIENTE contendo avaliação do vendedor é detectado', () => {
  const broken = clone(PHASE16_SCENARIOS[4]) // cenário 5: vendedor fora do método
  broken.cliente.containsSellerEvaluation = true

  assert.ok(validateScenario(broken).includes('cliente_contains_seller_evaluation'))
})

test('regra 8 (mutante): ANÁLISE reduzida ao último burst é detectado', () => {
  const broken = clone(PHASE16_SCENARIOS[0])
  broken.analise.reducedToLastBurst = true

  assert.ok(validateScenario(broken).includes('analise_reduced_to_last_burst'))

  const brokenBasedOn = clone(PHASE16_SCENARIOS[0])
  brokenBasedOn.analise.basedOn = ['current_conversation']

  assert.ok(validateScenario(brokenBasedOn).includes('analise_reduced_to_last_burst'))
})

test('regra 9 (mutante): memória sem origem/temporalidade é detectado', () => {
  const broken = clone(PHASE16_SCENARIOS[6]) // cenário 7: memória contradita
  broken.cliente.memoryItems[0].origin = undefined

  assert.ok(validateScenario(broken).includes('memory_without_provenance'))
})

test('regra 10 (mutante): cross-lead leak no cenário de isolamento é detectado', () => {
  const isolationScenario = PHASE16_SCENARIOS.find((scenario) => scenario.id === 'scenario-8-lead-isolation-a-to-b')
  assert.ok(isolationScenario, 'cenário de isolamento precisa existir na fixture')

  const broken = clone(isolationScenario)
  broken.isolation.crossLeadLeak = true

  assert.ok(validateScenario(broken).includes('cross_lead_state_leak'))
})

test('regra 11 (mutante): grupo recebendo contexto individual é detectado', () => {
  const groupScenario = PHASE16_SCENARIOS.find((scenario) => scenario.id === 'scenario-9-group-conversation')
  assert.ok(groupScenario, 'cenário de grupo precisa existir na fixture')

  const broken = clone(groupScenario)
  broken.group.individualContextRendered = true

  assert.ok(validateScenario(broken).includes('group_receives_individual_context'))
})

test('regra 12: ausência de silêncio como resultado válido é impossível — o conjunto de cenários sempre representa silêncio', () => {
  const silentScenarios = PHASE16_SCENARIOS.filter(
    (scenario) =>
      scenario.mensagem.output === 'silence' &&
      scenario.agora.primaryDecision === null &&
      scenario.agora.interventionCards.length === 0,
  )

  assert.ok(
    silentScenarios.length > 0,
    'pelo menos um cenário canônico precisa representar silêncio completo (AGORA e MENSAGEM) como resultado válido',
  )

  const nothingToDo = PHASE16_SCENARIOS.find((scenario) => scenario.id === 'scenario-10-nothing-to-do')
  assert.ok(nothingToDo, 'o cenário "nada para fazer" precisa existir')
  assert.equal(nothingToDo.mensagem.output, 'silence')
  assert.equal(nothingToDo.agora.primaryDecision, null)
  assert.equal(nothingToDo.agora.interventionCards.length, 0)
})

test('regra 12 (mutante): remover todo cenário de silêncio completo quebra o gate', () => {
  const withoutSilence = PHASE16_SCENARIOS.map((scenario) => {
    if (scenario.mensagem.output !== 'silence') {
      return scenario
    }

    const forced = clone(scenario)
    forced.mensagem.output = 'message'
    return forced
  })

  const silentScenarios = withoutSilence.filter(
    (scenario) =>
      scenario.mensagem.output === 'silence' &&
      scenario.agora.primaryDecision === null &&
      scenario.agora.interventionCards.length === 0,
  )

  assert.equal(silentScenarios.length, 0)
})

test('cenário 2 é obrigatório e preserva ANÁLISE/CLIENTE apesar de AGORA neutro', () => {
  const scenario = PHASE16_SCENARIOS.find(
    (item) => item.id === 'scenario-2-personal-conversation-active-opportunity',
  )

  assert.ok(scenario)
  assert.equal(scenario.session.commercial, false)
  assert.equal(scenario.agora.primaryDecision, null)
  assert.equal(scenario.agora.interventionCards.length, 0)
  assert.equal(scenario.analise.opportunityReadingPresent, true)
  assert.equal(scenario.opportunity.preserved, true)
  assert.equal(scenario.cliente.customerMemoryPresent, true)
  assert.equal(scenario.mensagem.output, 'silence')
})

test('cenário 3 mostra card operacional em AGORA sem converter a sessão em comercial', () => {
  const scenario = PHASE16_SCENARIOS.find(
    (item) => item.id === 'scenario-3-personal-conversation-upcoming-commercial-agenda',
  )

  assert.ok(scenario)
  assert.equal(scenario.session.commercial, false)
  assert.equal(scenario.agora.treatsSessionAsCommercial, false)
  assert.equal(scenario.agora.interventionCards.length, 1)
  assert.equal(scenario.agora.interventionCards[0].source, 'agenda')
})
