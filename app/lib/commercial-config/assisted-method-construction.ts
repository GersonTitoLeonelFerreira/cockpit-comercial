import {
  COMMERCIAL_METHOD_CONTRACT_VERSION,
  validateCommercialMethodDefinition,
} from '@/app/lib/companion/commercial-method-contract'
import type {
  CommercialMethodDefinition,
  CommercialMethodStageDefinition,
  CommercialMethodValidationResult,
} from '@/app/lib/companion/commercial-method-contract'
import type {
  CommercialBuilderSalesEventDetail,
  CommercialMethodBuilderData,
} from '@/app/types/commercial-method-builder'
import {
  COMMERCIAL_METHOD_CONSTRUCTION_VERSION,
} from '@/app/types/commercial-method-construction'
import type {
  CommercialMethodConstructionDraft,
  CommercialMethodConstructionDimensionDraft,
  CommercialMethodConstructionQualityItem,
  CommercialMethodConstructionStageDraft,
  CommercialMethodStageAssistiveSuggestions,
} from '@/app/types/commercial-method-construction'

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function cleanList(values: string[]): string[] {
  return Array.from(
    new Set(values.map(cleanText).filter(Boolean)),
  )
}

function normalize(value: string): string {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function slugifyCommercialMethodKey(value: string): string {
  const normalized = normalize(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized || 'etapa'
}

function stableId(prefix: string, seed: string): string {
  const safe = slugifyCommercialMethodKey(seed).slice(0, 36)
  return `${prefix}-${safe}-${Math.random().toString(36).slice(2, 8)}`
}

function createSuggestedStage({
  name,
  basis,
  requirement = 'required',
}: {
  name: string
  basis: string[]
  requirement?: CommercialMethodConstructionStageDraft['requirement']
}): CommercialMethodConstructionStageDraft {
  const key = slugifyCommercialMethodKey(name)

  return {
    id: stableId('stage', key),
    source: 'yolen_suggestion',
    suggestion_basis: cleanList(basis),
    key,
    name,
    objective: '',
    requirement,
    completion_criteria: [],
    partial_completion_criteria: [],
    skip_conditions: [],
    recommended_questions: [],
    common_mistakes: [],
    deepen_when: [],
    sufficient_when: [],
    advance_when: [],
    wait_when: [],
    stop_asking_when: [],
    dimensions: [],
  }
}

export function createManualConstructionStage(
  name = 'Nova etapa',
): CommercialMethodConstructionStageDraft {
  const key = slugifyCommercialMethodKey(name)

  return {
    id: stableId('stage', key),
    source: 'manager',
    suggestion_basis: [],
    key,
    name,
    objective: '',
    requirement: 'required',
    completion_criteria: [],
    partial_completion_criteria: [],
    skip_conditions: [],
    recommended_questions: [],
    common_mistakes: [],
    deepen_when: [],
    sufficient_when: [],
    advance_when: [],
    wait_when: [],
    stop_asking_when: [],
    dimensions: [],
  }
}

function presentationEvents(data: CommercialMethodBuilderData): string[] {
  const values = cleanList([
    ...data.company_profile.complexity.sales_events,
    ...data.current_sales_process.presentation.touchpoints,
  ])

  return values.filter((value) => {
    const item = normalize(value)
    return !item.includes('diagnostico')
  })
}

function canonicalPresentationName(value: string): string {
  const item = normalize(value)

  if (item.includes('tour')) return 'Tour'
  if (item.includes('demonstr')) return 'Demonstração'
  if (item.includes('teste')) return 'Teste'
  if (item.includes('proposta')) return 'Proposta'
  if (item.includes('orcamento')) return 'Orçamento'
  if (item.includes('reuniao')) return 'Reunião'
  if (item.includes('apresent')) return 'Apresentação'

  return cleanText(value)
}

function hasEvent(events: string[], expected: string): boolean {
  return events.some((event) => normalize(event).includes(expected))
}

// Atividade não é etapa por padrão (ONDA 8 / FRENTE B). Uma empresa que
// marcou tour/demo/teste/orçamento como parte do processo não deve ganhar
// uma etapa obrigatória para cada uma quando o diagnóstico já indica que
// aquele momento não é uma mudança comercial relevante e recorrente.
function eventFrequency(
  data: CommercialMethodBuilderData,
  canonicalEventName: string,
): CommercialBuilderSalesEventDetail['frequency'] | null {
  const detail = data.current_sales_process.sales_events_detail ?? []
  const target = normalize(canonicalEventName)

  const match = detail.find(
    (item) => normalize(canonicalPresentationName(item.event)) === target,
  )

  return match?.frequency || null
}

export function buildMethodConstructionSynthesis(
  data: CommercialMethodBuilderData,
): string[] {
  const profile = data.company_profile
  const process = data.current_sales_process
  const rules = data.commercial_rules

  const buyer = {
    person: 'principalmente pessoas físicas',
    company: 'principalmente empresas',
    both: 'pessoas físicas e empresas',
    '': 'um perfil de comprador ainda não descrito',
  }[profile.customer.buyer_type]

  const timing = {
    first_contact: 'normalmente pode terminar no primeiro atendimento',
    days: 'normalmente leva alguns dias',
    weeks: 'normalmente leva algumas semanas',
    months: 'normalmente leva meses',
    varies: 'tem duração variável conforme a oportunidade',
    '': 'ainda não tem duração típica informada',
  }[profile.complexity.typical_timing]

  const events = presentationEvents(data)
  const eventSummary = events.length > 0
    ? `No processo atual aparecem momentos como ${events.join(', ')}.`
    : 'Você não informou uma apresentação, proposta, tour ou demonstração obrigatória.'

  const discovery = process.lead_entry.seller_discovery_needed === true ||
    process.discovery.asks_before_presenting === true
    ? 'O vendedor normalmente precisa compreender algo antes de apresentar a solução.'
    : 'O diagnóstico não indica uma descoberta obrigatória antes da apresentação.'

  const rulesSummary = [
    rules.contracts.uses_contract === true ? 'há contrato' : null,
    rules.discounts.policy ? 'há regra definida para descontos' : null,
    rules.pricing.seller_can_negotiate === true ? 'o vendedor pode negociar condições' : null,
  ].filter(Boolean)

  return [
    `Sua venda atende ${buyer} e ${timing}.`,
    discovery,
    eventSummary,
    rulesSummary.length > 0
      ? `A Base Comercial registra que ${rulesSummary.join(', ')}, mas essas regras não serão transformadas automaticamente em etapas.`
      : 'As regras da Base Comercial permanecerão separadas das etapas do método.',
  ]
}

export function suggestInitialMethodConstruction(
  data: CommercialMethodBuilderData,
): CommercialMethodConstructionDraft {
  const profile = data.company_profile
  const process = data.current_sales_process
  const events = presentationEvents(data)
  const stages: CommercialMethodConstructionStageDraft[] = []

  const needsDiscovery =
    process.lead_entry.seller_discovery_needed === true ||
    process.discovery.asks_before_presenting === true ||
    process.discovery.needs_to_discover.length > 0 ||
    process.discovery.indispensable_information.length > 0

  const complexSale =
    ['weeks', 'months', 'varies'].includes(profile.complexity.typical_timing) ||
    profile.complexity.multiple_decision_makers === true ||
    process.commercial.has_negotiation === true

  if (needsDiscovery) {
    stages.push(
      createSuggestedStage({
        name: 'Descoberta',
        basis: [
          'Você informou que o vendedor precisa compreender a necessidade antes de avançar.',
          ...process.discovery.needs_to_discover.slice(0, 2).map(
            (item) => `No processo atual é importante descobrir: ${item}.`,
          ),
        ],
      }),
    )
  }

  const canonicalEvents = cleanList(events.map(canonicalPresentationName))
  const hasTour = hasEvent(canonicalEvents, 'tour')

  if (complexSale) {
    const meaningfulEvents = canonicalEvents.filter(
      (event) => eventFrequency(data, event) !== 'optional',
    )
    const optionalEvents = canonicalEvents.filter(
      (event) => eventFrequency(data, event) === 'optional',
    )

    for (const event of meaningfulEvents) {
      stages.push(
        createSuggestedStage({
          name: event,
          basis: [`Você informou que ${event} faz parte do processo atual.`],
        }),
      )
    }

    if (optionalEvents.length > 0) {
      stages.push(
        createSuggestedStage({
          name: 'Apresentação',
          basis: [
            `Você informou que ${optionalEvents.join(', ')} pode acontecer, mas não em toda venda. A Yolen agrupou isso em uma única etapa opcional em vez de criar uma etapa obrigatória para cada atividade.`,
          ],
          requirement: 'conditional',
        }),
      )
    }
  } else if (hasTour) {
    stages.push(
      createSuggestedStage({
        name: 'Tour',
        basis: ['Você informou que existe Tour no processo comercial atual.'],
      }),
    )

    const remaining = canonicalEvents.filter((event) => normalize(event) !== 'tour')
    if (remaining.length > 1) {
      stages.push(
        createSuggestedStage({
          name: 'Apresentação',
          basis: [`Você informou outros momentos de apresentação: ${remaining.join(', ')}.`],
        }),
      )
    } else if (remaining.length === 1) {
      stages.push(
        createSuggestedStage({
          name: remaining[0],
          basis: [`Você informou que ${remaining[0]} faz parte do processo atual.`],
        }),
      )
    }
  } else if (canonicalEvents.length === 1) {
    stages.push(
      createSuggestedStage({
        name: canonicalEvents[0],
        basis: [`Você informou que ${canonicalEvents[0]} faz parte do processo atual.`],
      }),
    )
  } else if (canonicalEvents.length > 1) {
    stages.push(
      createSuggestedStage({
        name: 'Apresentação',
        basis: [`Você informou estes momentos de apresentação: ${canonicalEvents.join(', ')}.`],
      }),
    )
  }

  if (stages.length === 0) {
    stages.push(
      createSuggestedStage({
        name: 'Atendimento',
        basis: ['O diagnóstico descreve uma venda curta sem etapa intermediária obrigatória claramente informada.'],
      }),
    )
  }

  stages.push(
    createSuggestedStage({
      name: 'Conclusão da venda',
      basis: process.closing.completion_actions.length > 0
        ? [`Você informou que a venda é concluída por: ${process.closing.completion_actions.join(', ')}.`]
        : ['O processo atual possui um momento de conclusão comercial.'],
    }),
  )

  if (process.follow_up.happens === true) {
    stages.push(
      createSuggestedStage({
        name: 'Follow-up',
        requirement: 'conditional',
        basis: [
          'Você informou que algumas vendas exigem retorno depois do atendimento.',
          ...process.follow_up.reasons.slice(0, 2).map(
            (item) => `Um motivo informado para retorno é: ${item}.`,
          ),
        ],
      }),
    )
  }

  const uniqueStages = stages.filter((stage, index, all) =>
    all.findIndex((candidate) => normalize(candidate.name) === normalize(stage.name)) === index,
  )

  return {
    construction_version: COMMERCIAL_METHOD_CONSTRUCTION_VERSION,
    construction_step: 'structure',
    method_name: '',
    method_description: '',
    principles: [],
    active_stage_id: uniqueStages[0]?.id ?? null,
    stages: uniqueStages,
  }
}

export function moveConstructionStage(
  draft: CommercialMethodConstructionDraft,
  stageId: string,
  direction: -1 | 1,
): CommercialMethodConstructionDraft {
  const index = draft.stages.findIndex((stage) => stage.id === stageId)
  const nextIndex = index + direction

  if (index < 0 || nextIndex < 0 || nextIndex >= draft.stages.length) {
    return draft
  }

  const stages = [...draft.stages]
  const [stage] = stages.splice(index, 1)
  stages.splice(nextIndex, 0, stage)

  return { ...draft, stages }
}

export function removeConstructionStage(
  draft: CommercialMethodConstructionDraft,
  stageId: string,
): CommercialMethodConstructionDraft {
  const stages = draft.stages.filter((stage) => stage.id !== stageId)
  const activeStageId = draft.active_stage_id === stageId
    ? stages[0]?.id ?? null
    : draft.active_stage_id

  return { ...draft, stages, active_stage_id: activeStageId }
}

export function appendConstructionStage(
  draft: CommercialMethodConstructionDraft,
  name = 'Nova etapa',
): CommercialMethodConstructionDraft {
  const stage = createManualConstructionStage(name)
  return {
    ...draft,
    stages: [...draft.stages, stage],
    active_stage_id: stage.id,
  }
}

const GENERIC_VALUES = new Set([
  'vender',
  'entender',
  'entender o cliente',
  'cliente interessado',
  'quando estiver pronto',
  'quando estiver pronto para avançar',
  'avançar',
  'fechar',
  'fechar a venda',
  'concluir',
  'fazer follow up',
  'fazer follow-up',
])

export function getGenericCommercialMethodGuidance(
  value: string,
): string | null {
  const text = normalize(value)
  if (!text) return null

  const wordCount = text.split(' ').filter(Boolean).length
  const vague = GENERIC_VALUES.has(text) ||
    (wordCount <= 2 && /^(vender|entender|avancar|fechar|concluir)/.test(text))

  if (!vague) return null

  return 'Isso pode ficar mais específico. Descreva uma evidência observável: o que o vendedor precisa compreender, confirmar ou combinar antes de seguir.'
}

function stageLooksLike(stage: CommercialMethodConstructionStageDraft, terms: string[]): boolean {
  const searchable = normalize(`${stage.name} ${stage.key}`)
  return terms.some((term) => searchable.includes(term))
}

export function buildStageAssistiveSuggestions(
  stage: CommercialMethodConstructionStageDraft,
  data: CommercialMethodBuilderData,
): CommercialMethodStageAssistiveSuggestions {
  const process = data.current_sales_process
  const contextNotes: string[] = []
  const completionCriteria: string[] = []
  const recommendedQuestions: string[] = []
  const commonMistakes: string[] = []

  if (stageLooksLike(stage, ['descoberta', 'diagnost', 'acolher', 'entender'])) {
    for (const item of cleanList([
      ...process.discovery.indispensable_information,
      ...process.discovery.needs_to_discover,
    ]).slice(0, 5)) {
      completionCriteria.push(`Há evidência suficiente sobre: ${item}.`)
      recommendedQuestions.push(`Como você descreveria ${item.toLowerCase()}?`)
    }

    if (process.commercial.price_timing) {
      contextNotes.push(`Você informou que o preço costuma ser apresentado assim: “${cleanText(process.commercial.price_timing)}”. Use isso para decidir se antecipar preço aqui seria um erro ou não.`)
    }
  }

  if (stageLooksLike(stage, ['tour']) && presentationEvents(data).some((item) => normalize(item).includes('tour'))) {
    contextNotes.push('O Tour foi informado no diagnóstico como parte real do processo. Defina o que precisa ser alcançado nele; a Yolen não assume essa semântica por você.')
  }

  if (stageLooksLike(stage, ['conclusao', 'fechamento', 'obter', 'contratacao'])) {
    for (const action of process.closing.completion_actions.slice(0, 5)) {
      completionCriteria.push(`Confirmar que ocorreu: ${action}.`)
    }
  }

  if (stageLooksLike(stage, ['follow'])) {
    for (const reason of process.follow_up.reasons.slice(0, 4)) {
      contextNotes.push(`Motivo de retorno informado no diagnóstico: ${reason}.`)
    }
  }

  if (
    process.discovery.asks_before_presenting === true &&
    stageLooksLike(stage, ['descoberta', 'diagnost', 'acolher'])
  ) {
    commonMistakes.push('Apresentar a solução antes de concluir o entendimento que a própria operação declarou necessário.')
  }

  return {
    context_notes: cleanList(contextNotes),
    completion_criteria: cleanList(completionCriteria),
    recommended_questions: cleanList(recommendedQuestions),
    common_mistakes: cleanList(commonMistakes),
  }
}

function createDimensionKey(
  dimension: CommercialMethodConstructionDimensionDraft,
  index: number,
): string {
  return slugifyCommercialMethodKey(dimension.key || dimension.name || `dimensao_${index + 1}`)
}

function normalizeStageForContract(
  stage: CommercialMethodConstructionStageDraft,
  order: number,
): CommercialMethodStageDefinition {
  return {
    key: slugifyCommercialMethodKey(stage.key || stage.name),
    display_order: order,
    name: cleanText(stage.name),
    objective: cleanText(stage.objective),
    requirement: stage.requirement,
    completion_criteria: cleanList(stage.completion_criteria),
    partial_completion_criteria: cleanList(stage.partial_completion_criteria),
    skip_conditions: stage.requirement === 'required'
      ? []
      : cleanList(stage.skip_conditions),
    recommended_questions: cleanList(stage.recommended_questions),
    common_mistakes: cleanList(stage.common_mistakes),
    deepen_when: cleanList(stage.deepen_when),
    sufficient_when: cleanList(stage.sufficient_when),
    advance_when: cleanList(stage.advance_when),
    wait_when: cleanList(stage.wait_when),
    stop_asking_when: cleanList(stage.stop_asking_when),
    dimensions: stage.dimensions.map((dimension, index) => ({
      key: createDimensionKey(dimension, index),
      name: cleanText(dimension.name),
      objective: cleanText(dimension.objective),
      evidence_criteria: cleanList(dimension.evidence_criteria),
    })),
  }
}

export function buildCommercialMethodDefinitionFromConstruction(
  draft: CommercialMethodConstructionDraft,
): {
  definition: CommercialMethodDefinition
  validation: CommercialMethodValidationResult
} {
  const definition: CommercialMethodDefinition = {
    contract_version: COMMERCIAL_METHOD_CONTRACT_VERSION,
    name: cleanText(draft.method_name),
    description: cleanText(draft.method_description),
    principles: cleanList(draft.principles),
    stages: draft.stages.map((stage, index) =>
      normalizeStageForContract(stage, index + 1),
    ),
  }

  return {
    definition,
    validation: validateCommercialMethodDefinition(definition),
  }
}

function allStageText(stage: CommercialMethodConstructionStageDraft): string {
  return [
    stage.name,
    stage.objective,
    ...stage.completion_criteria,
    ...stage.partial_completion_criteria,
    ...stage.recommended_questions,
    ...stage.common_mistakes,
    ...stage.deepen_when,
    ...stage.sufficient_when,
    ...stage.advance_when,
    ...stage.wait_when,
    ...stage.stop_asking_when,
  ].join(' ')
}

export function auditCommercialMethodConstruction(
  draft: CommercialMethodConstructionDraft,
  data: CommercialMethodBuilderData,
): CommercialMethodConstructionQualityItem[] {
  const items: CommercialMethodConstructionQualityItem[] = []

  const allObjectives = draft.stages.length > 0 && draft.stages.every((stage) => cleanText(stage.objective))
  items.push({
    level: allObjectives ? 'pass' : 'warning',
    message: allObjectives
      ? 'Todas as etapas possuem objetivo.'
      : 'Há etapa sem objetivo claro.',
  })

  const allCompletion = draft.stages.length > 0 && draft.stages.every((stage) => cleanList(stage.completion_criteria).length > 0)
  items.push({
    level: allCompletion ? 'pass' : 'warning',
    message: allCompletion
      ? 'Todas as etapas possuem evidência de conclusão.'
      : 'Há etapa sem critério de conclusão.',
  })

  const allAdvance = draft.stages.length > 0 && draft.stages.every((stage) => cleanList(stage.advance_when).length > 0)
  items.push({
    level: allAdvance ? 'pass' : 'warning',
    message: allAdvance
      ? 'Todas as etapas explicam quando avançar.'
      : 'Há etapa que ainda não explica quando faz sentido avançar.',
  })

  const interrogationGuard = draft.stages.length > 0 && draft.stages.every((stage) =>
    cleanList(stage.sufficient_when).length > 0 && cleanList(stage.stop_asking_when).length > 0,
  )
  items.push({
    level: interrogationGuard ? 'pass' : 'warning',
    message: interrogationGuard
      ? 'Todas as etapas orientam quando a informação já é suficiente e quando parar de perguntar.'
      : 'Há etapa sem proteção contra investigação excessiva.',
  })

  const hasDeepening = draft.stages.some((stage) => cleanList(stage.deepen_when).length > 0)
  items.push({
    level: hasDeepening ? 'pass' : 'warning',
    message: hasDeepening
      ? 'Existe orientação explícita para quando aprofundar.'
      : 'Nenhuma etapa explica quando aprofundar antes de avançar.',
  })

  for (const stage of draft.stages) {
    const genericObjective = getGenericCommercialMethodGuidance(stage.objective)
    if (genericObjective) {
      items.push({
        level: 'warning',
        stage_id: stage.id,
        message: `A etapa “${stage.name || 'Sem nome'}” possui objetivo genérico demais: “${stage.objective}”.`,
      })
    }

    for (const criterion of [...stage.completion_criteria, ...stage.advance_when]) {
      if (getGenericCommercialMethodGuidance(criterion)) {
        items.push({
          level: 'warning',
          stage_id: stage.id,
          message: `A etapa “${stage.name || 'Sem nome'}” contém orientação pouco observável: “${criterion}”.`,
        })
        break
      }
    }
  }

  const objectiveOwners = new Map<string, string>()
  for (const stage of draft.stages) {
    const objective = normalize(stage.objective)
    if (!objective) continue
    const previous = objectiveOwners.get(objective)
    if (previous) {
      items.push({
        level: 'warning',
        stage_id: stage.id,
        message: `As etapas “${previous}” e “${stage.name}” possuem objetivos praticamente iguais. Revise se são realmente etapas diferentes.`,
      })
    } else {
      objectiveOwners.set(objective, stage.name)
    }
  }

  if (cleanText(data.current_sales_process.commercial.price_timing)) {
    const methodText = normalize(draft.stages.map(allStageText).join(' '))
    const mentionsPriceTiming = /(preco|valor|condicao comercial)/.test(methodText)
    if (!mentionsPriceTiming) {
      items.push({
        level: 'warning',
        message: 'O diagnóstico informa quando o preço costuma ser apresentado, mas nenhuma etapa ainda registra essa orientação. Isso pode ser intencional; confirme antes da revisão final.',
      })
    }
  }

  return items
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isDimension(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.key === 'string' &&
    typeof value.name === 'string' &&
    typeof value.objective === 'string' &&
    isStringArray(value.evidence_criteria)
}

function isStage(value: unknown): boolean {
  if (!isRecord(value)) return false

  const stringArrays = [
    'suggestion_basis',
    'completion_criteria',
    'partial_completion_criteria',
    'skip_conditions',
    'recommended_questions',
    'common_mistakes',
    'deepen_when',
    'sufficient_when',
    'advance_when',
    'wait_when',
    'stop_asking_when',
  ] as const

  return (
    typeof value.id === 'string' &&
    (value.source === 'yolen_suggestion' || value.source === 'manager') &&
    typeof value.key === 'string' &&
    typeof value.name === 'string' &&
    typeof value.objective === 'string' &&
    ['required', 'conditional', 'optional'].includes(String(value.requirement)) &&
    stringArrays.every((key) => isStringArray(value[key])) &&
    Array.isArray(value.dimensions) &&
    value.dimensions.every(isDimension)
  )
}

export function parseCommercialMethodConstructionDraft(
  value: unknown,
): CommercialMethodConstructionDraft | null {
  if (!isRecord(value)) return null

  if (
    value.construction_version !== COMMERCIAL_METHOD_CONSTRUCTION_VERSION ||
    !['structure', 'stages', 'principles', 'review'].includes(String(value.construction_step)) ||
    typeof value.method_name !== 'string' ||
    typeof value.method_description !== 'string' ||
    !isStringArray(value.principles) ||
    !(value.active_stage_id === null || typeof value.active_stage_id === 'string') ||
    !Array.isArray(value.stages) ||
    !value.stages.every(isStage)
  ) {
    return null
  }

  return value as unknown as CommercialMethodConstructionDraft
}
