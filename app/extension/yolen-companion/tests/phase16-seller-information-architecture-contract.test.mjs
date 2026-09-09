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

  const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''
  const isValidTimestamp = (value) => isNonEmptyString(value) && !Number.isNaN(new Date(value).getTime())

  // Regra adicional (contrato, seção 4.3 / seção 12 item 15): todo card de
  // intervenção precisa de `expiresAt` (timestamp válido) ou
  // `resolveCondition` (string não vazia) — sem isso ele é um card
  // permanente por omissão, proibido pelo contrato. Achado do Codex (6ª
  // revisão): a checagem original usava truthiness — `expiresAt: true` ou
  // `resolveCondition: '   '` passavam como se fossem ciclo de vida real.
  const hasCardWithoutLifecycle = (cards || []).some(
    (card) => !card || (!isValidTimestamp(card.expiresAt) && !isNonEmptyString(card.resolveCondition)),
  )
  if (hasCardWithoutLifecycle) {
    violations.push('intervention_card_without_lifecycle')
  }

  // Regra adicional (contrato, seção 4.3: todo InterventionCard tem
  // `evidence_refs`; seção 12 item 5: toda afirmação precisa de evidência
  // referenciável). Achado do Codex (6ª revisão): `source` identifica só a
  // categoria da origem (ex.: `'agenda'`), não o evento persistido que
  // comprova a frase do card — sem `evidenceRefs`, o gate aprovava cards
  // não auditáveis.
  const hasCardWithoutEvidence = (cards || []).some(
    (card) => !card || !Array.isArray(card.evidenceRefs) || card.evidenceRefs.length === 0 ||
      !card.evidenceRefs.every(isNonEmptyString),
  )
  if (hasCardWithoutEvidence) {
    violations.push('intervention_card_missing_evidence')
  }

  // Regra adicional (contrato, seção 4.3): todo card precisa de `source`
  // (origem/identidade), e precisa explicar POR QUE apareceu/importa
  // (`reason`) e O QUE fazer (`recommendedAction`) — como texto de fato, não
  // qualquer valor truthy. Achado do Codex (4ª revisão): a checagem
  // original só validava ciclo de vida e prioridade. Achado do Codex (5ª
  // revisão): a checagem de `reason`/`recommendedAction` usava truthiness
  // (`!card.reason`), então um valor truthy não textual (`true`, `1`,
  // `{}`) passava como se fosse uma explicação real; `source` nunca era
  // validado, então um card podia perder sua origem sem quebrar o gate.
  const hasIncompleteCard = (cards || []).some(
    (card) =>
      !card ||
      !isNonEmptyString(card.source) ||
      !isNonEmptyString(card.reason) ||
      !isNonEmptyString(card.recommendedAction),
  )
  if (hasIncompleteCard) {
    violations.push('intervention_card_missing_explanation')
  }

  // Regra adicional (contrato, seção 4.3): o InterventionCard normativo
  // também tem `created_at`, `related_lead` e `related_cycle` — sem eles,
  // a fixture não protege o escopo necessário ao isolamento A→B (cenário
  // 8) nem representa a idade real do card. Achado do Codex (7ª revisão).
  const hasCardWithoutIdentity = (cards || []).some(
    (card) =>
      !card ||
      !isValidTimestamp(card.createdAt) ||
      !isNonEmptyString(card.relatedLead) ||
      !isNonEmptyString(card.relatedCycle),
  )
  if (hasCardWithoutIdentity) {
    violations.push('intervention_card_missing_identity')
  }

  // Regra adicional (contrato, seção 4.4): AGORA só aceita as prioridades
  // que de fato ocupam AGORA — CRÍTICA, ALTA, MÉDIA. BAIXA nunca ocupa
  // AGORA (permanece em ANÁLISE/CLIENTE), e qualquer valor ausente ou fora
  // da taxonomia (`undefined`, `'LOW'`, `'urgent'`, etc.) não pode ser
  // ordenado corretamente e também não satisfaz o contrato. Achado do
  // Codex (3ª revisão): a checagem original só rejeitava o literal `'low'`.
  const ALLOWED_AGORA_CARD_PRIORITIES = new Set(['critical', 'high', 'medium'])
  const hasInvalidPriorityCard = (cards || []).some(
    (card) => !ALLOWED_AGORA_CARD_PRIORITIES.has(card?.priority),
  )
  if (hasInvalidPriorityCard) {
    violations.push('agora_card_with_invalid_priority')
  }

  // Regra adicional (contrato, seção 4.3 + seção 12 item 4): `relatedLead`/
  // `relatedCycle` precisam ser exatamente o lead/ciclo ATUAL do cenário
  // (`scenario.leadId`/`scenario.cycleId`), não qualquer string não vazia.
  // Achado do Codex (8ª revisão): a checagem anterior só exigia que fossem
  // strings — um card carregando a identidade de OUTRO lead/ciclo (ex.: o
  // lead que o vendedor acabou de sair, no cenário de isolamento) ainda
  // passava, destruindo exatamente o isolamento que o card deveria provar.
  const hasCardWithWrongLead = (cards || []).some(
    (card) => card && isNonEmptyString(card.relatedLead) && card.relatedLead !== scenario.leadId,
  )
  if (hasCardWithWrongLead) {
    violations.push('intervention_card_lead_mismatch')
  }

  const hasCardWithWrongCycle = (cards || []).some(
    (card) => card && isNonEmptyString(card.relatedCycle) && card.relatedCycle !== scenario.cycleId,
  )
  if (hasCardWithWrongCycle) {
    violations.push('intervention_card_cycle_mismatch')
  }

  // Regra adicional: um cenário só pode ter cards de intervenção se ele
  // mesmo declarar a identidade (`leadId`/`cycleId`) contra a qual esses
  // cards são verificados — identidade ausente/inválida não é permissão
  // implícita, é falha (ex.: o cenário de grupo, que nunca tem `leadId`,
  // não pode ganhar cards individuais só porque a comparação acima nunca
  // bateria com `null`).
  if (cards.length > 0 && (!isNonEmptyString(scenario.leadId) || !isNonEmptyString(scenario.cycleId))) {
    violations.push('scenario_missing_identity_for_cards')
  }

  // Regra 4 — MENSAGEM contendo fatos próprios não fornecidos pelas
  // camadas anteriores.
  if (scenario.mensagem.ownFactsIntroduced !== false) {
    violations.push('mensagem_introduces_own_facts')
  }

  // Regra de base — campos core do cenário (session, opportunity,
  // operationalSignal) precisam existir, E seus discriminadores booleanos
  // precisam estar presentes com o tipo certo, para que as regras
  // semânticas 5 e 6 tenham premissa válida. Achado do Codex (3ª revisão):
  // como essas regras liam os campos com optional chaining, apagar
  // `session`/`opportunity` (cenário 2) ou `operationalSignal`/`session`
  // (cenários 3/6) fazia a condição inteira avaliar para `false` e a regra
  // nunca disparar. Achado do Codex (4ª revisão): exigir só a presença dos
  // objetos-contêiner não bastava — apagar apenas `session.commercial`,
  // `opportunity.active` ou `operationalSignal.present` (mantendo o objeto
  // pai) também fazia as condições de 5/6 avaliarem `undefined === false`/
  // `undefined === true` como falso, sem violação. Os discriminadores
  // precisam ser validados individualmente, não só o contêiner. Achado do
  // Codex (5ª revisão): `session.isGroup` também é um discriminador core
  // (usado pela regra 11 via `scenario.id`) e ficou de fora desta lista —
  // apagar só esse booleano do cenário 9 não quebrava nada.
  const hasCoreScenarioFields =
    scenario.session && typeof scenario.session === 'object' &&
    typeof scenario.session.commercial === 'boolean' &&
    typeof scenario.session.isGroup === 'boolean' &&
    scenario.opportunity && typeof scenario.opportunity === 'object' &&
    typeof scenario.opportunity.active === 'boolean' &&
    typeof scenario.opportunity.preserved === 'boolean' &&
    scenario.operationalSignal && typeof scenario.operationalSignal === 'object' &&
    typeof scenario.operationalSignal.present === 'boolean'

  if (!hasCoreScenarioFields) {
    violations.push('missing_core_scenario_fields')
  }

  // Regra 5 — sessão não comercial apagando a leitura da oportunidade.
  if (
    hasCoreScenarioFields &&
    scenario.session.commercial === false &&
    scenario.opportunity.active === true &&
    (scenario.analise.opportunityReadingPresent !== true || scenario.opportunity.preserved !== true)
  ) {
    violations.push('non_commercial_session_erases_opportunity')
  }

  // Regra 6 — sinal operacional transformando sessão pessoal em comercial.
  if (
    hasCoreScenarioFields &&
    scenario.operationalSignal.present === true &&
    scenario.session.commercial === false &&
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

  // Regra 9 — memória sem indicação de temporalidade/origem, e sem
  // evidência referenciável (contrato, seção 9: modelo mínimo de fato;
  // seção 12 item 5: evidência obrigatória). Achado do Codex (6ª/7ª
  // revisão): a checagem original usava truthiness (`!item.origin`), então
  // `origin: true`/`'   '` e `observedAt: {}` passavam como proveniência
  // válida; `origin: 'current_conversation'` sozinho também não é
  // evidência referenciável — falta um ponteiro para a mensagem/registro
  // real (`evidenceRefs`).
  const memoryItems = Array.isArray(scenario.cliente.memoryItems)
    ? scenario.cliente.memoryItems
    : []
  const hasUnprovenancedMemory = memoryItems.some(
    (item) =>
      !item ||
      !isNonEmptyString(item.origin) ||
      !isValidTimestamp(item.observedAt) ||
      !Array.isArray(item.evidenceRefs) ||
      item.evidenceRefs.length === 0 ||
      !item.evidenceRefs.every(isNonEmptyString),
  )
  if (hasUnprovenancedMemory) {
    violations.push('memory_without_provenance')
  }

  // Regra adicional (contrato, seção 9/11 item 8): todo item de memória
  // precisa declarar `scope` — `'person'` (sobrevive entre ciclos) ou
  // `'cycle'` (pertence só à oportunidade atual, não é promovido
  // silenciosamente a fato eterno sobre a pessoa). Achado do Codex (8ª
  // revisão): sem essa checagem, um fato como "pretende decidir sexta"
  // (válido só neste ciclo) e um fato como "prefere confirmação por
  // escrito" (válido sobre a pessoa) ficavam indistinguíveis na fixture.
  const ALLOWED_MEMORY_SCOPES = new Set(['person', 'cycle'])
  const hasMemoryWithInvalidScope = memoryItems.some(
    (item) => !item || !ALLOWED_MEMORY_SCOPES.has(item.scope),
  )
  if (hasMemoryWithInvalidScope) {
    violations.push('memory_item_invalid_scope')
  }

  // Regra 10 — isolamento A→B permitindo cross-lead state. Gatilho pelo
  // `id` canônico do cenário, não por um campo de dentro do próprio
  // cenário (`isolation`, `isolationRequired`, `session.isGroup`) — qualquer
  // um desses pode ser apagado junto com o bloco que deveriam proteger.
  // `id` é o único discriminador que a suíte já protege separadamente (ver
  // teste "existem exatamente os 10 cenários canônicos"), então ele não
  // pode desaparecer sem quebrar aquele outro teste primeiro. Achado do
  // Codex (2ª revisão): a versão anterior, gatilhada por
  // `scenario.isolationRequired`, ainda dependia de um campo removível.
  // Achado do Codex (8ª revisão): confiar só em `isolation.crossLeadLeak`
  // era fail-open — alguém podia injetar dado real de A em AGORA/CLIENTE/
  // ANÁLISE e manter o marcador em `false`. A regra agora audita o
  // conteúdo real: o Lead B (canonicamente) ainda não tem decisão, card,
  // memória ou leitura de oportunidade herdada de nenhum outro ciclo.
  if (scenario.id === 'scenario-8-lead-isolation-a-to-b') {
    const hasCrossLeadLeak =
      !scenario.isolation ||
      scenario.isolation.crossLeadLeak !== false ||
      scenario.agora.primaryDecision !== null ||
      !Array.isArray(scenario.agora.interventionCards) ||
      scenario.agora.interventionCards.length > 0 ||
      !Array.isArray(scenario.cliente.memoryItems) ||
      scenario.cliente.memoryItems.length > 0 ||
      (Array.isArray(scenario.analise.basedOn) &&
        scenario.analise.basedOn.some(
          (source) => source === 'opportunity_history' || source === 'persisted_state',
        ))

    if (hasCrossLeadLeak) {
      violations.push('cross_lead_state_leak')
    }
  }

  // Regra 11 — grupo recebendo contexto individual. Mesmo princípio: gatilho
  // pelo `id` canônico, não por `session.isGroup` (apagar `session` inteiro
  // do cenário também apagaria esse sinal, e a regra 1 não valida a
  // presença de `session` — só de agora/analise/cliente/mensagem). Achado
  // do Codex (7ª revisão): checar só o marcador `group.individualContextRendered`
  // não bastava — alguém podia preencher `cliente.memoryItems`, ligar
  // `cliente.customerMemoryPresent`, ou marcar `analise.opportunityReadingPresent`
  // com o marcador ainda em `false`, e nada disso quebrava o gate. Achado
  // do Codex (8ª revisão): a regra ainda não auditava AGORA — uma
  // `primaryDecision` ou um `interventionCard` individual (ex.: "responder
  // o Lead A agora") podia aparecer no cenário de grupo sem quebrar o
  // gate. A regra agora valida o estado neutro das quatro perspectivas,
  // não só o marcador.
  if (scenario.id === 'scenario-9-group-conversation') {
    const hasIndividualLeak =
      !scenario.group ||
      scenario.group.individualContextRendered !== false ||
      scenario.agora.primaryDecision !== null ||
      !Array.isArray(scenario.agora.interventionCards) ||
      scenario.agora.interventionCards.length > 0 ||
      scenario.cliente.customerMemoryPresent !== false ||
      !Array.isArray(scenario.cliente.memoryItems) ||
      scenario.cliente.memoryItems.length > 0 ||
      scenario.analise.opportunityReadingPresent !== false ||
      scenario.mensagem.decisionStateConsumed !== false

    if (hasIndividualLeak) {
      violations.push('group_receives_individual_context')
    }
  }

  // Validação estrutural adicional (não numerada na seção 36, mas exigida
  // pelo contrato — seção 8.3): a saída de MENSAGEM precisa ser um dos
  // dois valores válidos.
  if (!VALID_MESSAGE_OUTPUTS.has(scenario.mensagem.output)) {
    violations.push('invalid_mensagem_output')
  }

  return violations
}

test('todo cenário canônico da FASE 16.1 passa em todas as regras estruturais por cenário', () => {
  for (const scenario of PHASE16_SCENARIOS) {
    const violations = validateScenario(scenario)
    assert.deepEqual(
      violations,
      [],
      `cenário "${scenario.id}" violou: ${violations.join(', ')}`,
    )
  }
})

test('regra 1 (mutante): apagar analise do cenário 2 já quebra o gate — sem necessidade de checagem duplicada na regra 5', () => {
  const broken = clone(PHASE16_SCENARIOS[1]) // cenário 2
  delete broken.analise

  assert.ok(validateScenario(broken).includes('missing_four_perspectives'))
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
    { source: 'sla', priority: 'high', reason: 'x', recommendedAction: 'y', expiresAt: null, resolveCondition: 'x' },
    { source: 'crm', priority: 'medium', reason: 'x', recommendedAction: 'y', expiresAt: null, resolveCondition: 'x' },
  )

  assert.ok(validateScenario(broken).includes('agora_too_many_intervention_cards'))
})

test('regra adicional (mutante): card de intervenção sem ciclo de vida é detectado', () => {
  const broken = clone(PHASE16_SCENARIOS[2]) // cenário 3: card de agenda
  delete broken.agora.interventionCards[0].expiresAt
  delete broken.agora.interventionCards[0].resolveCondition

  assert.ok(validateScenario(broken).includes('intervention_card_without_lifecycle'))
})

test('regra adicional (mutante): ciclo de vida com valor truthy inválido é detectado (achado do Codex, 6ª revisão)', () => {
  // A checagem anterior usava truthiness — `expiresAt: true` ou
  // `resolveCondition: '   '` passavam como se fossem ciclo de vida real.
  const truthyExpiresAt = clone(PHASE16_SCENARIOS[3]) // cenário 4: sem expiresAt, só resolveCondition
  truthyExpiresAt.agora.interventionCards[0].resolveCondition = null
  truthyExpiresAt.agora.interventionCards[0].expiresAt = true
  assert.ok(validateScenario(truthyExpiresAt).includes('intervention_card_without_lifecycle'))

  const invalidTimestamp = clone(PHASE16_SCENARIOS[3])
  invalidTimestamp.agora.interventionCards[0].resolveCondition = null
  invalidTimestamp.agora.interventionCards[0].expiresAt = 'not-a-date'
  assert.ok(validateScenario(invalidTimestamp).includes('intervention_card_without_lifecycle'))

  const blankResolveCondition = clone(PHASE16_SCENARIOS[3])
  blankResolveCondition.agora.interventionCards[0].resolveCondition = '   '
  assert.ok(validateScenario(blankResolveCondition).includes('intervention_card_without_lifecycle'))
})

test('regra adicional (mutante): card de intervenção sem evidenceRefs é detectado (achado do Codex, 6ª revisão)', () => {
  // `source: 'agenda'` identifica só a categoria da origem, não o evento
  // persistido que comprova a frase do card — sem evidenceRefs o gate
  // aprovava cards não auditáveis (contrato, seção 4.3 e seção 12 item 5).
  const missingEvidence = clone(PHASE16_SCENARIOS[2]) // cenário 3: card de agenda
  delete missingEvidence.agora.interventionCards[0].evidenceRefs
  assert.ok(validateScenario(missingEvidence).includes('intervention_card_missing_evidence'))

  const emptyEvidence = clone(PHASE16_SCENARIOS[2])
  emptyEvidence.agora.interventionCards[0].evidenceRefs = []
  assert.ok(validateScenario(emptyEvidence).includes('intervention_card_missing_evidence'))

  const blankEvidenceEntry = clone(PHASE16_SCENARIOS[2])
  blankEvidenceEntry.agora.interventionCards[0].evidenceRefs = ['   ']
  assert.ok(validateScenario(blankEvidenceEntry).includes('intervention_card_missing_evidence'))
})

test('regra adicional (mutante): card de intervenção sem reason/recommendedAction é detectado (achado do Codex, 4ª revisão)', () => {
  const brokenReason = clone(PHASE16_SCENARIOS[2]) // cenário 3: card de agenda
  delete brokenReason.agora.interventionCards[0].reason
  assert.ok(validateScenario(brokenReason).includes('intervention_card_missing_explanation'))

  const brokenAction = clone(PHASE16_SCENARIOS[2])
  delete brokenAction.agora.interventionCards[0].recommendedAction
  assert.ok(validateScenario(brokenAction).includes('intervention_card_missing_explanation'))
})

test('regra adicional (mutante): card com campos truthy não textuais ou sem source é detectado (achado do Codex, 5ª revisão)', () => {
  // A checagem anterior usava truthiness (`!card.reason`) — um valor
  // truthy não textual (`true`, `1`, `{}`) passava como se fosse uma
  // explicação real. `source` nunca era validado.
  const nonStringReason = clone(PHASE16_SCENARIOS[2])
  nonStringReason.agora.interventionCards[0].reason = true
  assert.ok(validateScenario(nonStringReason).includes('intervention_card_missing_explanation'))

  const nonStringAction = clone(PHASE16_SCENARIOS[2])
  nonStringAction.agora.interventionCards[0].recommendedAction = 1
  assert.ok(validateScenario(nonStringAction).includes('intervention_card_missing_explanation'))

  const emptyStringReason = clone(PHASE16_SCENARIOS[2])
  emptyStringReason.agora.interventionCards[0].reason = '   '
  assert.ok(validateScenario(emptyStringReason).includes('intervention_card_missing_explanation'))

  const missingSource = clone(PHASE16_SCENARIOS[2])
  delete missingSource.agora.interventionCards[0].source
  assert.ok(validateScenario(missingSource).includes('intervention_card_missing_explanation'))
})

test('regra adicional (mutante): card sem identidade (createdAt/relatedLead/relatedCycle) é detectado (achado do Codex, 7ª revisão)', () => {
  const missingCreatedAt = clone(PHASE16_SCENARIOS[2]) // cenário 3: card de agenda
  delete missingCreatedAt.agora.interventionCards[0].createdAt
  assert.ok(validateScenario(missingCreatedAt).includes('intervention_card_missing_identity'))

  const invalidCreatedAt = clone(PHASE16_SCENARIOS[2])
  invalidCreatedAt.agora.interventionCards[0].createdAt = 'not-a-date'
  assert.ok(validateScenario(invalidCreatedAt).includes('intervention_card_missing_identity'))

  const missingRelatedLead = clone(PHASE16_SCENARIOS[2])
  delete missingRelatedLead.agora.interventionCards[0].relatedLead
  assert.ok(validateScenario(missingRelatedLead).includes('intervention_card_missing_identity'))

  const missingRelatedCycle = clone(PHASE16_SCENARIOS[2])
  delete missingRelatedCycle.agora.interventionCards[0].relatedCycle
  assert.ok(validateScenario(missingRelatedCycle).includes('intervention_card_missing_identity'))
})

test('regra adicional (mutante): card de intervenção com prioridade BAIXA em AGORA é detectado', () => {
  const broken = clone(PHASE16_SCENARIOS[2]) // cenário 3: card de agenda
  broken.agora.interventionCards[0].priority = 'low'

  assert.ok(validateScenario(broken).includes('agora_card_with_invalid_priority'))
})

test('regra adicional (mutante): card de intervenção com prioridade ausente ou fora da taxonomia é detectado', () => {
  // Achado do Codex (3ª revisão): a checagem original só rejeitava o
  // literal 'low' — priority ausente ou um valor fora da taxonomia
  // ('LOW', 'urgent', etc.) passava sem violação.
  const missingPriority = clone(PHASE16_SCENARIOS[2])
  delete missingPriority.agora.interventionCards[0].priority
  assert.ok(validateScenario(missingPriority).includes('agora_card_with_invalid_priority'))

  const unknownPriority = clone(PHASE16_SCENARIOS[2])
  unknownPriority.agora.interventionCards[0].priority = 'urgent'
  assert.ok(validateScenario(unknownPriority).includes('agora_card_with_invalid_priority'))
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

test('regra 5 (mutante): apagar session ou opportunity do cenário 2 é detectado (achado do Codex, 3ª revisão)', () => {
  // A checagem original usava optional chaining (`scenario.session?.commercial`),
  // então apagar `session` ou `opportunity` inteiro fazia a condição da
  // regra 5 avaliar para `false` e nunca disparar — a premissa que a regra
  // deveria proteger desaparecia sem violação alguma.
  const brokenSession = clone(PHASE16_SCENARIOS[1])
  delete brokenSession.session
  assert.ok(validateScenario(brokenSession).includes('missing_core_scenario_fields'))

  const brokenOpportunity = clone(PHASE16_SCENARIOS[1])
  delete brokenOpportunity.opportunity
  assert.ok(validateScenario(brokenOpportunity).includes('missing_core_scenario_fields'))
})

test('regra 6 (mutante): sinal operacional convertendo sessão pessoal em comercial é detectado', () => {
  const broken = clone(PHASE16_SCENARIOS[2]) // cenário 3: pessoal + agenda comercial
  broken.agora.treatsSessionAsCommercial = true

  assert.ok(validateScenario(broken).includes('operational_signal_flips_session_commercial'))
})

test('regra 6 (mutante): apagar operationalSignal ou session dos cenários 3/6 é detectado (achado do Codex, 3ª revisão)', () => {
  const brokenSignal = clone(PHASE16_SCENARIOS[2]) // cenário 3
  delete brokenSignal.operationalSignal
  assert.ok(validateScenario(brokenSignal).includes('missing_core_scenario_fields'))

  const brokenSession = clone(PHASE16_SCENARIOS[5]) // cenário 6
  delete brokenSession.session
  assert.ok(validateScenario(brokenSession).includes('missing_core_scenario_fields'))
})

test('regra 6 (mutante): as duas combinações restantes (session no cenário 3, operationalSignal no cenário 6) também são detectadas', () => {
  // Cobertura explícita das combinações D e F pedidas na auditoria do
  // Controle Mestre sobre a 3ª rodada — complementa o teste acima, que já
  // cobre `operationalSignal` (cenário 3) e `session` (cenário 6).
  const brokenSessionScenario3 = clone(PHASE16_SCENARIOS[2]) // cenário 3
  delete brokenSessionScenario3.session
  assert.ok(validateScenario(brokenSessionScenario3).includes('missing_core_scenario_fields'))

  const brokenSignalScenario6 = clone(PHASE16_SCENARIOS[5]) // cenário 6
  delete brokenSignalScenario6.operationalSignal
  assert.ok(validateScenario(brokenSignalScenario6).includes('missing_core_scenario_fields'))
})

test('regra 5/6 (mutante): apagar só o discriminador booleano (mantendo o objeto pai) é detectado (achado do Codex, 4ª revisão)', () => {
  // A checagem anterior só exigia que session/opportunity/operationalSignal
  // fossem objetos — apagar apenas o booleano interno (`session.commercial`,
  // `opportunity.active`/`preserved`, `operationalSignal.present`) mantinha
  // o objeto-contêiner intacto e ainda fazia as condições de 5/6 avaliarem
  // como falsas sem violação.
  const brokenCommercial = clone(PHASE16_SCENARIOS[1]) // cenário 2
  delete brokenCommercial.session.commercial
  assert.ok(validateScenario(brokenCommercial).includes('missing_core_scenario_fields'))

  const brokenActive = clone(PHASE16_SCENARIOS[1]) // cenário 2
  delete brokenActive.opportunity.active
  assert.ok(validateScenario(brokenActive).includes('missing_core_scenario_fields'))

  const brokenPreserved = clone(PHASE16_SCENARIOS[1]) // cenário 2
  delete brokenPreserved.opportunity.preserved
  assert.ok(validateScenario(brokenPreserved).includes('missing_core_scenario_fields'))

  const brokenPresentScenario3 = clone(PHASE16_SCENARIOS[2]) // cenário 3
  delete brokenPresentScenario3.operationalSignal.present
  assert.ok(validateScenario(brokenPresentScenario3).includes('missing_core_scenario_fields'))

  const brokenPresentScenario6 = clone(PHASE16_SCENARIOS[5]) // cenário 6
  delete brokenPresentScenario6.operationalSignal.present
  assert.ok(validateScenario(brokenPresentScenario6).includes('missing_core_scenario_fields'))
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

test('regra 9 (mutante): proveniência com valores truthy não utilizáveis é detectada (achado do Codex, 7ª revisão)', () => {
  // A checagem anterior usava truthiness — `origin: true`, `origin: '   '`
  // ou `observedAt: {}` passavam como proveniência válida.
  const truthyOrigin = clone(PHASE16_SCENARIOS[6])
  truthyOrigin.cliente.memoryItems[0].origin = true
  assert.ok(validateScenario(truthyOrigin).includes('memory_without_provenance'))

  const blankOrigin = clone(PHASE16_SCENARIOS[6])
  blankOrigin.cliente.memoryItems[0].origin = '   '
  assert.ok(validateScenario(blankOrigin).includes('memory_without_provenance'))

  const truthyObservedAt = clone(PHASE16_SCENARIOS[6])
  truthyObservedAt.cliente.memoryItems[0].observedAt = {}
  assert.ok(validateScenario(truthyObservedAt).includes('memory_without_provenance'))

  const invalidObservedAt = clone(PHASE16_SCENARIOS[6])
  invalidObservedAt.cliente.memoryItems[0].observedAt = 'not-a-date'
  assert.ok(validateScenario(invalidObservedAt).includes('memory_without_provenance'))
})

test('regra 9 (mutante): memória sem evidenceRefs é detectada (achado do Codex, 7ª revisão)', () => {
  // `origin: 'current_conversation'` sozinho não é evidência referenciável
  // — falta um ponteiro para a mensagem/registro real (contrato, seção 9 e
  // seção 12 item 5).
  const missingEvidence = clone(PHASE16_SCENARIOS[0]) // cenário 1
  delete missingEvidence.cliente.memoryItems[0].evidenceRefs
  assert.ok(validateScenario(missingEvidence).includes('memory_without_provenance'))

  const emptyEvidence = clone(PHASE16_SCENARIOS[0])
  emptyEvidence.cliente.memoryItems[0].evidenceRefs = []
  assert.ok(validateScenario(emptyEvidence).includes('memory_without_provenance'))
})

test('regra 10 (mutante): cross-lead leak no cenário de isolamento é detectado', () => {
  const isolationScenario = PHASE16_SCENARIOS.find((scenario) => scenario.id === 'scenario-8-lead-isolation-a-to-b')
  assert.ok(isolationScenario, 'cenário de isolamento precisa existir na fixture')

  const broken = clone(isolationScenario)
  broken.isolation.crossLeadLeak = true

  assert.ok(validateScenario(broken).includes('cross_lead_state_leak'))
})

test('regra 10 (mutante): apagar o bloco isolation inteiro do cenário de isolamento é detectado', () => {
  // O gatilho é `scenario.id` (protegido pelo teste "existem exatamente os
  // 10 cenários canônicos"), não um campo de dentro do próprio cenário —
  // por isso apagar `isolation` sozinho ainda quebra o gate.
  const isolationScenario = PHASE16_SCENARIOS.find((scenario) => scenario.id === 'scenario-8-lead-isolation-a-to-b')
  assert.ok(isolationScenario, 'cenário de isolamento precisa existir na fixture')

  const broken = clone(isolationScenario)
  delete broken.isolation

  assert.ok(validateScenario(broken).includes('cross_lead_state_leak'))
})

test('regra 11 (mutante): grupo recebendo contexto individual é detectado', () => {
  const groupScenario = PHASE16_SCENARIOS.find((scenario) => scenario.id === 'scenario-9-group-conversation')
  assert.ok(groupScenario, 'cenário de grupo precisa existir na fixture')

  const broken = clone(groupScenario)
  broken.group.individualContextRendered = true

  assert.ok(validateScenario(broken).includes('group_receives_individual_context'))
})

test('regra 11 (mutante): apagar o bloco group inteiro do cenário de grupo é detectado', () => {
  // O gatilho é `scenario.id` (protegido pelo teste "existem exatamente os
  // 10 cenários canônicos"), não um campo de dentro do próprio cenário —
  // por isso apagar `group` sozinho ainda quebra o gate.
  const groupScenario = PHASE16_SCENARIOS.find((scenario) => scenario.id === 'scenario-9-group-conversation')
  assert.ok(groupScenario, 'cenário de grupo precisa existir na fixture')

  const broken = clone(groupScenario)
  delete broken.group

  assert.ok(validateScenario(broken).includes('group_receives_individual_context'))
})

test('regra 11 (mutante): apagar session inteiro do cenário de grupo ainda é detectado (achado do Codex, 2ª revisão)', () => {
  // O Codex apontou que a versão anterior gatilhava pela regra 11 por
  // `scenario.session?.isGroup === true` — apagar `session` inteiro do
  // cenário 9 (junto com `group`) faria essa leitura virar `undefined` e a
  // regra nunca disparar. Gatilhando por `scenario.id` em vez disso, esta
  // combinação continua sendo pega.
  const groupScenario = PHASE16_SCENARIOS.find((scenario) => scenario.id === 'scenario-9-group-conversation')
  assert.ok(groupScenario, 'cenário de grupo precisa existir na fixture')

  const broken = clone(groupScenario)
  delete broken.session
  delete broken.group

  assert.ok(validateScenario(broken).includes('group_receives_individual_context'))
})

test('regra 5/6/11 (mutante): apagar só session.isGroup do cenário 9 é detectado (achado do Codex, 5ª revisão)', () => {
  // `session.isGroup` é o discriminador que classifica a conversa como
  // grupo; apagá-lo sozinho (mantendo `session` e `group` intactos) não
  // era coberto pela checagem de campos core, que validava commercial/
  // active/preserved/present mas não isGroup.
  const groupScenario = PHASE16_SCENARIOS.find((scenario) => scenario.id === 'scenario-9-group-conversation')
  assert.ok(groupScenario, 'cenário de grupo precisa existir na fixture')

  const broken = clone(groupScenario)
  delete broken.session.isGroup

  assert.ok(validateScenario(broken).includes('missing_core_scenario_fields'))
})

test('regra 11 (mutante): vazamento de contexto individual no cenário de grupo é detectado mesmo com o marcador em false (achado do Codex, 7ª revisão)', () => {
  // A checagem anterior só olhava `group.individualContextRendered` —
  // preencher cliente.memoryItems, ligar cliente.customerMemoryPresent, ou
  // marcar analise.opportunityReadingPresent/mensagem.decisionStateConsumed
  // não disparava violação enquanto esse marcador continuasse `false`.
  const groupScenario = PHASE16_SCENARIOS.find((scenario) => scenario.id === 'scenario-9-group-conversation')
  assert.ok(groupScenario, 'cenário de grupo precisa existir na fixture')

  const leakedMemory = clone(groupScenario)
  leakedMemory.cliente.memoryItems = [
    { fact: 'Fato de um participante individual.', origin: 'current_conversation', observedAt: '2026-08-22T09:00:00-03:00', evidenceRefs: ['message-x'], status: 'active' },
  ]
  assert.ok(validateScenario(leakedMemory).includes('group_receives_individual_context'))

  const leakedCustomerMemoryFlag = clone(groupScenario)
  leakedCustomerMemoryFlag.cliente.customerMemoryPresent = true
  assert.ok(validateScenario(leakedCustomerMemoryFlag).includes('group_receives_individual_context'))

  const leakedOpportunityReading = clone(groupScenario)
  leakedOpportunityReading.analise.opportunityReadingPresent = true
  assert.ok(validateScenario(leakedOpportunityReading).includes('group_receives_individual_context'))

  const leakedDecisionState = clone(groupScenario)
  leakedDecisionState.mensagem.decisionStateConsumed = true
  assert.ok(validateScenario(leakedDecisionState).includes('group_receives_individual_context'))
})

test('regra 11 (mutante): AGORA vazando decisão ou card individual no cenário de grupo é detectado (achado do Codex, 8ª revisão)', () => {
  const groupScenario = PHASE16_SCENARIOS.find((scenario) => scenario.id === 'scenario-9-group-conversation')
  assert.ok(groupScenario, 'cenário de grupo precisa existir na fixture')

  const leakedPrimaryDecision = clone(groupScenario)
  leakedPrimaryDecision.agora.primaryDecision = 'Responder o Lead A agora.'
  assert.ok(validateScenario(leakedPrimaryDecision).includes('group_receives_individual_context'))

  const leakedCard = clone(groupScenario)
  leakedCard.agora.interventionCards = [
    {
      source: 'agenda',
      priority: 'high',
      reason: 'Retorno do participante A',
      recommendedAction: 'Responder participante A',
      expiresAt: null,
      resolveCondition: 'respondido',
      evidenceRefs: ['message-a'],
      createdAt: '2026-08-22T09:00:00-03:00',
      relatedLead: 'lead-a',
      relatedCycle: 'cycle-a',
    },
  ]
  const cardViolations = validateScenario(leakedCard)
  assert.ok(cardViolations.includes('group_receives_individual_context'))
  // Defesa em profundidade: mesmo sem a checagem específica do cenário 9,
  // a regra genérica de identidade de card (seção seguinte) já rejeitaria
  // este card, porque o cenário de grupo não tem `leadId`/`cycleId`.
  assert.ok(cardViolations.includes('scenario_missing_identity_for_cards'))
})

test('regra adicional (mutante): card com relatedLead/relatedCycle de outro lead é detectado (achado do Codex, 8ª revisão)', () => {
  // `relatedLead`/`relatedCycle` serem strings não vazias não bastava — um
  // card carregando a identidade de outro lead/ciclo ainda passava.
  const wrongLead = clone(PHASE16_SCENARIOS[2]) // cenário 3: card de agenda
  wrongLead.agora.interventionCards[0].relatedLead = 'lead-errado'
  assert.ok(validateScenario(wrongLead).includes('intervention_card_lead_mismatch'))

  const wrongCycle = clone(PHASE16_SCENARIOS[2])
  wrongCycle.agora.interventionCards[0].relatedCycle = 'cycle-errado'
  assert.ok(validateScenario(wrongCycle).includes('intervention_card_cycle_mismatch'))
})

test('regra adicional (mutante): cenário com card mas sem leadId/cycleId próprios é detectado (achado do Codex, 8ª revisão)', () => {
  // Um cenário sem identidade própria não tem contra o que comparar os
  // cards que carrega — identidade ausente é falha, não permissão
  // implícita.
  const missingLeadId = clone(PHASE16_SCENARIOS[2]) // cenário 3: card de agenda
  delete missingLeadId.leadId
  assert.ok(validateScenario(missingLeadId).includes('scenario_missing_identity_for_cards'))

  const missingCycleId = clone(PHASE16_SCENARIOS[2])
  delete missingCycleId.cycleId
  assert.ok(validateScenario(missingCycleId).includes('scenario_missing_identity_for_cards'))
})

test('regra 10 (mutante): isolamento A→B com AGORA/CLIENTE/ANÁLISE herdados de A é detectado pelo conteúdo real, não só pelo marcador (achado do Codex, 8ª revisão)', () => {
  const isolationScenario = PHASE16_SCENARIOS.find((scenario) => scenario.id === 'scenario-8-lead-isolation-a-to-b')
  assert.ok(isolationScenario, 'cenário de isolamento precisa existir na fixture')

  const leakedPrimaryDecision = clone(isolationScenario)
  leakedPrimaryDecision.isolation.crossLeadLeak = false
  leakedPrimaryDecision.agora.primaryDecision = 'Retomar proposta do Lead A.'
  assert.ok(validateScenario(leakedPrimaryDecision).includes('cross_lead_state_leak'))

  const leakedMemory = clone(isolationScenario)
  leakedMemory.isolation.crossLeadLeak = false
  leakedMemory.cliente.memoryItems = [
    {
      fact: 'Fato herdado do Lead A.',
      origin: 'opportunity_history',
      observedAt: '2026-08-10T09:00:00-03:00',
      status: 'active',
      scope: 'person',
      evidenceRefs: ['memory-lead-a'],
    },
  ]
  assert.ok(validateScenario(leakedMemory).includes('cross_lead_state_leak'))

  const leakedCard = clone(isolationScenario)
  leakedCard.isolation.crossLeadLeak = false
  leakedCard.agora.interventionCards = [
    {
      source: 'off_method',
      priority: 'high',
      reason: 'Herdado do Lead A.',
      recommendedAction: 'Retomar descoberta do Lead A.',
      expiresAt: null,
      resolveCondition: 'x',
      evidenceRefs: ['message-a'],
      createdAt: '2026-08-10T09:00:00-03:00',
      relatedLead: 'lead-a',
      relatedCycle: 'cycle-a',
    },
  ]
  const cardViolations = validateScenario(leakedCard)
  assert.ok(cardViolations.includes('cross_lead_state_leak'))
  assert.ok(cardViolations.includes('intervention_card_lead_mismatch'))
  assert.ok(cardViolations.includes('intervention_card_cycle_mismatch'))

  const leakedOpportunityHistory = clone(isolationScenario)
  leakedOpportunityHistory.isolation.crossLeadLeak = false
  leakedOpportunityHistory.analise.basedOn = ['current_conversation', 'opportunity_history']
  assert.ok(validateScenario(leakedOpportunityHistory).includes('cross_lead_state_leak'))

  const leakedPersistedState = clone(isolationScenario)
  leakedPersistedState.isolation.crossLeadLeak = false
  leakedPersistedState.analise.basedOn = ['current_conversation', 'persisted_state']
  assert.ok(validateScenario(leakedPersistedState).includes('cross_lead_state_leak'))
})

test('regra 9 (mutante): memoryItem sem scope válido é detectado (achado do Codex, 8ª revisão)', () => {
  const missingScope = clone(PHASE16_SCENARIOS[6]) // cenário 7: memória contradita
  delete missingScope.cliente.memoryItems[0].scope
  assert.ok(validateScenario(missingScope).includes('memory_item_invalid_scope'))

  const blankScope = clone(PHASE16_SCENARIOS[6])
  blankScope.cliente.memoryItems[0].scope = '   '
  assert.ok(validateScenario(blankScope).includes('memory_item_invalid_scope'))

  const invalidScope = clone(PHASE16_SCENARIOS[6])
  invalidScope.cliente.memoryItems[0].scope = 'invalid-scope'
  assert.ok(validateScenario(invalidScope).includes('memory_item_invalid_scope'))
})

test('cenário 7: fato de timing da negociação é cycle-scoped, não promovido a fato eterno sobre a pessoa', () => {
  const scenario = PHASE16_SCENARIOS.find((item) => item.id === 'scenario-7-contradicted-old-memory')
  assert.ok(scenario)

  for (const item of scenario.cliente.memoryItems) {
    assert.equal(item.scope, 'cycle', `fato "${item.fact}" deveria ser cycle-scoped`)
  }
})

test('cenário 2: preferência de comunicação da pessoa é person-scoped, sobrevive entre ciclos', () => {
  const scenario = PHASE16_SCENARIOS.find(
    (item) => item.id === 'scenario-2-personal-conversation-active-opportunity',
  )
  assert.ok(scenario)
  assert.equal(scenario.cliente.memoryItems[0].scope, 'person')
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
