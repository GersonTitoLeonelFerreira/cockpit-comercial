import type {
  CommercialMethodValidationIssue,
} from '@/app/lib/companion/commercial-method-contract'
import {
  buildStageAssistiveSuggestions,
} from '@/app/lib/commercial-config/assisted-method-construction'
import type {
  CommercialBuilderSalesEventDetail,
  CommercialMethodBuilderData,
} from '@/app/types/commercial-method-builder'
import type {
  CommercialBuyerDecisionDraft,
  CommercialBuyerDecisionProfile,
  CommercialBuyerDecisionVisibility,
} from '@/app/types/commercial-method-buyer-decision'
import {
  CURRENT_METHOD_SYNTHESIS_VERSION,
} from '@/app/types/commercial-method-construction'
import {
  METHOD_PRINCIPLE_APPROVAL_MAPPING,
  METHOD_PRINCIPLE_BUYER_EVIDENCE,
  METHOD_PRINCIPLE_CUSTOMIZATION_EVIDENCE,
  METHOD_PRINCIPLE_DECISION_CRITERIA,
  METHOD_PRINCIPLE_DECISION_VS_FORMALIZATION,
  METHOD_PRINCIPLE_FORMAL_PROCESS,
  METHOD_PRINCIPLE_PRESENTATION_EVIDENCE,
  METHOD_PRINCIPLE_PROPORTIONAL_DEPTH,
  METHOD_PRINCIPLE_REAL_URGENCY,
  sanitizeMethodPrinciples,
} from '@/app/lib/commercial-config/method-principles'
import type {
  CommercialMethodConstructionDraft,
  CommercialMethodConstructionQualityItem,
  CommercialMethodConstructionStageDraft,
  CommercialMethodStageAssistiveSuggestions,
} from '@/app/types/commercial-method-construction'

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function cleanList(values: string[]): string[] {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)))
}

function normalize(value: string): string {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function slugify(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'etapa'
}

function stableId(prefix: string, seed: string): string {
  return `${prefix}-${slugify(seed).slice(0, 36)}-${Math.random().toString(36).slice(2, 8)}`
}

function canonicalEventName(value: string): string {
  const item = normalize(value)

  if (item.includes('demonstr')) return 'Demonstração'
  if (item.includes('tour')) return 'Tour'
  if (item.includes('teste')) return 'Teste'
  if (item.includes('diagnost')) return 'Diagnóstico'
  if (item.includes('reuniao')) return 'Reunião'
  if (item.includes('proposta')) return 'Proposta'
  if (item.includes('orcamento')) return 'Orçamento'
  if (item.includes('apresent')) return 'Apresentação'

  return cleanText(value)
}

export function buyerDecisionEvents(data: CommercialMethodBuilderData): string[] {
  return cleanList([
    ...data.company_profile.complexity.sales_events,
    ...data.current_sales_process.presentation.touchpoints,
  ].map(canonicalEventName))
}

function isBusinessSale(data: CommercialMethodBuilderData): boolean {
  const buyer = data.company_profile.customer.buyer_type
  return buyer === 'company' || buyer === 'both'
}

function isLongCycle(data: CommercialMethodBuilderData): boolean {
  return ['weeks', 'months', 'varies'].includes(
    data.company_profile.complexity.typical_timing,
  )
}

function needsConsultativeDiscovery(data: CommercialMethodBuilderData): boolean {
  const process = data.current_sales_process
  return (
    process.lead_entry.seller_discovery_needed === true ||
    process.discovery.asks_before_presenting === true ||
    process.discovery.needs_to_discover.length > 0 ||
    process.discovery.indispensable_information.length > 0
  )
}

export function getBuyerDecisionVisibility(
  data: CommercialMethodBuilderData,
): CommercialBuyerDecisionVisibility {
  const business = isBusinessSale(data)
  const longCycle = isLongCycle(data)
  const multiplePeople = data.company_profile.complexity.multiple_decision_makers === true
  const events = buyerDecisionEvents(data)
  const consultative = needsConsultativeDiscovery(data)
  const usesContract = data.commercial_rules.contracts.uses_contract === true
  const variablePricing = ['variable', 'mixed'].includes(data.commercial_rules.pricing.model)

  return {
    show_approval_and_blockers: business || multiplePeople,
    show_decision_criteria: business || longCycle || consultative,
    show_formal_process: business && (longCycle || multiplePeople || usesContract),
    show_investment_justification:
      business && (longCycle || multiplePeople || variablePricing),
    show_real_urgency:
      business || longCycle || data.current_sales_process.follow_up.happens === true,
    show_event_purpose: events.length > 0,
    show_customization: true,
    show_operation_intensity: true,
    show_decision_vs_formalization: true,
  }
}

export function createBuyerDecisionDraft(
  data: CommercialMethodBuilderData,
): CommercialBuyerDecisionDraft {
  return {
    confirmed: false,
    approval_or_blocker: '',
    participant_roles: [],
    other_participant_roles: [],
    decision_criteria: [],
    other_decision_criteria: [],
    formal_process: '',
    formal_process_steps: [],
    other_formal_process_steps: [],
    investment_justification: '',
    investment_justification_notes: '',
    real_urgency: '',
    urgency_drivers: [],
    other_urgency_drivers: [],
    event_success_criteria: buyerDecisionEvents(data).map((event) => ({
      event,
      criteria: [],
    })),
    // O diagnóstico (capítulos 1-3) já pode ter perguntado exatamente isso
    // (mesma escala de resposta). Reaproveita em vez de perguntar de novo —
    // ONDA 8 / HOTFIX, seção 16 (redundância de perguntas).
    solution_customization: data.company_profile.offer.customization_depth || '',
    operation_intensity: data.company_profile.buyer_behavior?.workload_pattern || '',
    buyer_commitment_signals: [],
    // formalization_steps NÃO é pré-preenchido a partir do diagnóstico:
    // isso mudaria qual texto vence na síntese da etapa Formalização (ver
    // synthesizeStageFields/applyFormalizationStageSynthesis) e alteraria
    // comportamento hoje coberto por teste. Auditado (ONDA 8 / HOTFIX,
    // seção 16) — mantido como pergunta própria de propósito.
    formalization_steps: [],
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCommercialBuyerDecisionDraft(
  value: unknown,
): value is CommercialBuyerDecisionDraft {
  if (!isRecord(value)) return false

  const answers = new Set(['', 'no', 'sometimes', 'yes'])
  const customizations = new Set([
    '',
    'standard',
    'some_adjustments',
    'highly_customized',
  ])
  const intensities = new Set([
    '',
    'high_volume_short',
    'balanced',
    'few_complex',
  ])

  return (
    typeof value.confirmed === 'boolean' &&
    answers.has(String(value.approval_or_blocker)) &&
    isStringArray(value.participant_roles) &&
    isStringArray(value.other_participant_roles) &&
    isStringArray(value.decision_criteria) &&
    isStringArray(value.other_decision_criteria) &&
    answers.has(String(value.formal_process)) &&
    isStringArray(value.formal_process_steps) &&
    isStringArray(value.other_formal_process_steps) &&
    answers.has(String(value.investment_justification)) &&
    typeof value.investment_justification_notes === 'string' &&
    answers.has(String(value.real_urgency)) &&
    isStringArray(value.urgency_drivers) &&
    isStringArray(value.other_urgency_drivers) &&
    Array.isArray(value.event_success_criteria) &&
    value.event_success_criteria.every((item) =>
      isRecord(item) &&
      typeof item.event === 'string' &&
      isStringArray(item.criteria),
    ) &&
    customizations.has(String(value.solution_customization)) &&
    intensities.has(String(value.operation_intensity)) &&
    isStringArray(value.buyer_commitment_signals) &&
    isStringArray(value.formalization_steps)
  )
}

export function validateBuyerDecisionDraft(
  data: CommercialMethodBuilderData,
  decision: CommercialBuyerDecisionDraft,
): string[] {
  const visibility = getBuyerDecisionVisibility(data)
  const issues: string[] = []

  if (visibility.show_approval_and_blockers && !decision.approval_or_blocker) {
    issues.push('Informe se outra pessoa pode aprovar ou impedir a contratação.')
  }

  if (
    visibility.show_approval_and_blockers &&
    ['yes', 'sometimes'].includes(decision.approval_or_blocker) &&
    cleanList([...decision.participant_roles, ...decision.other_participant_roles]).length === 0
  ) {
    issues.push('Informe quem normalmente participa da aprovação ou pode bloquear.')
  }

  if (
    visibility.show_decision_criteria &&
    cleanList([...decision.decision_criteria, ...decision.other_decision_criteria]).length === 0
  ) {
    issues.push('Informe pelo menos um fator que costuma pesar na escolha do cliente.')
  }

  if (visibility.show_formal_process && !decision.formal_process) {
    issues.push('Informe se existe área ou processo interno antes da contratação.')
  }

  if (
    visibility.show_formal_process &&
    ['yes', 'sometimes'].includes(decision.formal_process) &&
    cleanList([
      ...decision.formal_process_steps,
      ...decision.other_formal_process_steps,
    ]).length === 0
  ) {
    issues.push('Informe ao menos uma área ou processo interno que costuma participar.')
  }

  if (visibility.show_investment_justification && !decision.investment_justification) {
    issues.push('Informe se o investimento precisa ser justificado internamente.')
  }

  if (visibility.show_real_urgency && !decision.real_urgency) {
    issues.push('Informe se costuma existir uma data, evento ou consequência real para decidir.')
  }

  if (
    visibility.show_real_urgency &&
    ['yes', 'sometimes'].includes(decision.real_urgency) &&
    cleanList([...decision.urgency_drivers, ...decision.other_urgency_drivers]).length === 0
  ) {
    issues.push('Informe o que normalmente cria essa urgência real.')
  }

  if (visibility.show_event_purpose) {
    for (const item of decision.event_success_criteria) {
      if (cleanList(item.criteria).length === 0) {
        issues.push(`Explique o que precisa acontecer em “${item.event}” para a venda poder avançar.`)
      }
    }
  }

  if (!decision.solution_customization) {
    issues.push('Informe quanto a solução costuma mudar conforme cada cliente.')
  }

  if (!decision.operation_intensity) {
    issues.push('Informe se a equipe trabalha com muitas vendas curtas ou poucas oportunidades mais acompanhadas.')
  }

  if (cleanList(decision.buyer_commitment_signals).length === 0) {
    issues.push('Informe qual fato mostra que o cliente realmente decidiu comprar.')
  }

  return issues
}

export function getBuyerDecisionProfile(
  data: CommercialMethodBuilderData,
  decision: CommercialBuyerDecisionDraft,
): CommercialBuyerDecisionProfile {
  const business = isBusinessSale(data)
  const longCycle = isLongCycle(data)
  const events = buyerDecisionEvents(data)
  let score = 0

  if (business) score += 1
  if (longCycle) score += 2
  if (data.company_profile.complexity.multiple_decision_makers === true) score += 2

  if (decision.approval_or_blocker === 'yes') score += 2
  if (decision.approval_or_blocker === 'sometimes') score += 1

  const participants = cleanList([
    ...decision.participant_roles,
    ...decision.other_participant_roles,
  ])
  if (participants.length >= 2) score += 2
  else if (participants.length === 1) score += 1

  if (decision.formal_process === 'yes') score += 2
  if (decision.formal_process === 'sometimes') score += 1
  if (decision.investment_justification === 'yes') score += 1
  if (decision.investment_justification === 'sometimes') score += 0.5
  if (decision.real_urgency === 'yes') score += 0.5

  if (decision.solution_customization === 'highly_customized') score += 2
  if (decision.solution_customization === 'some_adjustments') score += 1

  if (decision.operation_intensity === 'few_complex') score += 2
  if (decision.operation_intensity === 'balanced') score += 1
  if (decision.operation_intensity === 'high_volume_short') score -= 2

  if (events.length >= 2) score += 1

  let depth: CommercialBuyerDecisionProfile['depth'] =
    score >= 7 ? 'deep' : score >= 3 ? 'moderate' : 'light'

  if (business && depth === 'light') depth = 'moderate'

  const discoveryDepth: CommercialBuyerDecisionProfile['discovery_depth'] =
    depth === 'deep' ||
    decision.solution_customization === 'highly_customized' ||
    decision.investment_justification === 'yes'
      ? 'deep'
      : depth === 'moderate' || needsConsultativeDiscovery(data)
        ? 'moderate'
        : 'light'

  const decisionProcess =
    decision.approval_or_blocker === 'yes' ||
    decision.formal_process === 'yes' ||
    depth === 'deep'
      ? 'required'
      : business || decision.approval_or_blocker === 'sometimes'
        ? 'recommended'
        : 'not_required'

  const criteria = cleanList([
    ...decision.decision_criteria,
    ...decision.other_decision_criteria,
  ])

  return {
    depth,
    discovery_depth: discoveryDepth,
    decision_process: decisionProcess,
    decision_criteria:
      depth === 'deep' && criteria.length > 0
        ? 'required'
        : criteria.length > 0 || depth === 'moderate'
          ? 'recommended'
          : 'not_required',
    approval_mapping:
      decision.approval_or_blocker === 'yes'
        ? 'required'
        : decision.approval_or_blocker === 'sometimes'
          ? 'recommended'
          : 'not_required',
    formal_buying_process:
      decision.formal_process === 'yes'
        ? 'required'
        : decision.formal_process === 'sometimes'
          ? 'recommended'
          : 'not_required',
    critical_event:
      decision.real_urgency === 'yes'
        ? 'required'
        : decision.real_urgency === 'sometimes'
          ? 'recommended'
          : 'not_required',
    presentation_evidence:
      events.length === 0
        ? 'not_required'
        : depth === 'deep'
          ? 'required'
          : 'recommended',
  }
}

export function deriveBuyerDecisionPrinciples(
  data: CommercialMethodBuilderData,
  decision: CommercialBuyerDecisionDraft,
): string[] {
  const profile = getBuyerDecisionProfile(data, decision)
  const principles = [
    METHOD_PRINCIPLE_PROPORTIONAL_DEPTH,
    METHOD_PRINCIPLE_BUYER_EVIDENCE,
    METHOD_PRINCIPLE_DECISION_VS_FORMALIZATION,
  ]

  if (
    cleanList([
      ...decision.decision_criteria,
      ...decision.other_decision_criteria,
    ]).length > 0
  ) {
    principles.push(METHOD_PRINCIPLE_DECISION_CRITERIA)
  }

  if (profile.approval_mapping !== 'not_required') {
    principles.push(METHOD_PRINCIPLE_APPROVAL_MAPPING)
  }

  if (profile.formal_buying_process !== 'not_required') {
    principles.push(METHOD_PRINCIPLE_FORMAL_PROCESS)
  }

  if (profile.critical_event !== 'not_required') {
    principles.push(METHOD_PRINCIPLE_REAL_URGENCY)
  }

  if (profile.presentation_evidence !== 'not_required') {
    principles.push(METHOD_PRINCIPLE_PRESENTATION_EVIDENCE)
  }

  if (decision.solution_customization === 'highly_customized') {
    principles.push(METHOD_PRINCIPLE_CUSTOMIZATION_EVIDENCE)
  }

  return sanitizeMethodPrinciples(cleanList(principles))
}

function createSuggestedStage(
  name: string,
  basis: string[],
  requirement: CommercialMethodConstructionStageDraft['requirement'] = 'required',
): CommercialMethodConstructionStageDraft {
  return {
    id: stableId('stage', name),
    source: 'yolen_suggestion',
    suggestion_basis: cleanList(basis),
    key: slugify(name),
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

function stageLooksLike(
  stage: CommercialMethodConstructionStageDraft,
  terms: string[],
): boolean {
  const searchable = normalize(`${stage.name} ${stage.key}`)
  return terms.some((term) => searchable.includes(normalize(term)))
}

function insertBefore(
  stages: CommercialMethodConstructionStageDraft[],
  stage: CommercialMethodConstructionStageDraft,
  matcher: (candidate: CommercialMethodConstructionStageDraft) => boolean,
): CommercialMethodConstructionStageDraft[] {
  const index = stages.findIndex(matcher)
  if (index < 0) return [...stages, stage]
  return [...stages.slice(0, index), stage, ...stages.slice(index)]
}

function insertAfter(
  stages: CommercialMethodConstructionStageDraft[],
  stage: CommercialMethodConstructionStageDraft,
  matcher: (candidate: CommercialMethodConstructionStageDraft) => boolean,
): CommercialMethodConstructionStageDraft[] {
  const index = stages.findIndex(matcher)
  if (index < 0) return [...stages, stage]
  return [...stages.slice(0, index + 1), stage, ...stages.slice(index + 1)]
}

export function applyBuyerDecisionArchitecture(
  draft: CommercialMethodConstructionDraft,
  data: CommercialMethodBuilderData,
  input: CommercialBuyerDecisionDraft,
): CommercialMethodConstructionDraft {
  const decision: CommercialBuyerDecisionDraft = {
    ...input,
    confirmed: true,
    participant_roles: cleanList(input.participant_roles),
    other_participant_roles: cleanList(input.other_participant_roles),
    decision_criteria: cleanList(input.decision_criteria),
    other_decision_criteria: cleanList(input.other_decision_criteria),
    formal_process_steps: cleanList(input.formal_process_steps),
    other_formal_process_steps: cleanList(input.other_formal_process_steps),
    urgency_drivers: cleanList(input.urgency_drivers),
    other_urgency_drivers: cleanList(input.other_urgency_drivers),
    event_success_criteria: input.event_success_criteria.map((item) => ({
      event: cleanText(item.event),
      criteria: cleanList(item.criteria),
    })),
    buyer_commitment_signals: cleanList(input.buyer_commitment_signals),
    formalization_steps: cleanList(input.formalization_steps),
  }
  const profile = getBuyerDecisionProfile(data, decision)

  let stages = draft.stages.filter((stage) =>
    !(
      stage.source === 'yolen_suggestion' &&
      stageLooksLike(stage, ['alinhamento da decisão', 'formalização'])
    ),
  )

  const oldConclusion = stages.findIndex((stage) =>
    stage.source === 'yolen_suggestion' &&
    stageLooksLike(stage, ['conclusão da venda', 'fechamento']),
  )

  if (oldConclusion >= 0) {
    const previous = stages[oldConclusion]
    stages[oldConclusion] = {
      // Um valor já preenchido (pelo gestor ou por uma síntese anterior)
      // nunca é apagado só porque a etapa foi renomeada.
      ...previous,
      name: 'Decisão de compra',
      key: 'decisao_de_compra',
      suggestion_basis: [
        'A Yolen separa o compromisso real do cliente das ações posteriores de formalização.',
        ...decision.buyer_commitment_signals.map(
          (item) => `Você informou como sinal de decisão: ${item}.`,
        ),
      ],
    }
  }

  let decisionStage = stages.find((stage) =>
    stageLooksLike(stage, ['decisão de compra', 'compromisso de compra']),
  )

  if (!decisionStage) {
    decisionStage = createSuggestedStage(
      'Decisão de compra',
      [
        'A estrutura precisa de uma evidência do comprador que mostre decisão real, sem confundir isso com pagamento, cadastro ou envio de proposta.',
        ...decision.buyer_commitment_signals.map(
          (item) => `Você informou como sinal de decisão: ${item}.`,
        ),
      ],
    )
    stages = insertBefore(
      stages,
      decisionStage,
      (stage) => stageLooksLike(stage, ['follow']),
    )
  }

  const hasDiscovery = stages.some((stage) =>
    stageLooksLike(stage, ['descoberta', 'diagnóstico', 'entender', 'acolher']),
  )

  if (profile.discovery_depth === 'deep' && !hasDiscovery) {
    stages = [
      createSuggestedStage(
        'Descoberta',
        [
          'A arquitetura da decisão indica que a solução, aprovação ou justificativa interna exige compreensão mais profunda antes de avançar.',
        ],
      ),
      ...stages,
    ]
  }

  if (
    profile.decision_process === 'required' ||
    profile.approval_mapping !== 'not_required'
  ) {
    const alignmentRequirement =
      decision.approval_or_blocker === 'yes' ? 'required' : 'conditional'
    const alignment = createSuggestedStage(
      'Alinhamento da decisão',
      [
        'Esta etapa consolida critérios, pessoas e aprovações relevantes sem transformar cada área do cliente em uma etapa separada.',
        ...cleanList([
          ...decision.participant_roles,
          ...decision.other_participant_roles,
        ]).map((item) => `Participação informada: ${item}.`),
      ],
      alignmentRequirement,
    )
    stages = insertBefore(
      stages,
      alignment,
      (stage) =>
        stageLooksLike(stage, [
          'demonstração',
          'tour',
          'teste',
          'proposta',
          'apresentação',
          'decisão de compra',
        ]),
    )
  }

  const formalizationDiagnosis = data.current_sales_process.formalization
  const hasFormalizationWork =
    profile.formal_buying_process !== 'not_required' ||
    (formalizationDiagnosis?.steps.length ?? 0) > 0 ||
    formalizationDiagnosis?.operational_approval_after_decision === true

  if (hasFormalizationWork) {
    const requirement =
      decision.formal_process === 'yes' ||
      formalizationDiagnosis?.operational_approval_after_decision === true
        ? 'required'
        : 'conditional'

    const formalization = createSuggestedStage(
      'Formalização',
      [
        'Você informou que, depois da decisão comercial, ainda existem aprovações, áreas ou procedimentos internos relevantes.',
        ...cleanList([
          ...decision.formal_process_steps,
          ...decision.other_formal_process_steps,
          ...decision.formalization_steps,
          ...(formalizationDiagnosis?.steps ?? []),
        ]).map((item) => `Item informado para formalização: ${item}.`),
      ],
      requirement,
    )
    stages = insertAfter(
      stages,
      formalization,
      (stage) => stageLooksLike(stage, ['decisão de compra']),
    )
  }

  const uniqueStages = stages.filter((stage, index, all) =>
    all.findIndex((candidate) => normalize(candidate.name) === normalize(stage.name)) === index,
  )

  const synthesizedStages = uniqueStages.map((stage) =>
    synthesizeStageFields(stage, data, decision),
  )

  return {
    ...draft,
    synthesis_version: CURRENT_METHOD_SYNTHESIS_VERSION,
    buyer_decision: decision,
    principles: deriveBuyerDecisionPrinciples(data, decision),
    stages: synthesizedStages,
    active_stage_id: synthesizedStages[0]?.id ?? null,
    construction_step: 'structure',
  }
}

// ============================================================================
// Pré-construção determinística (ONDA 8 / FRENTE B)
//
// A Yolen já sabe, a partir do diagnóstico e da arquitetura de decisão
// confirmada, a maior parte do que perguntaria de novo em E01-E15. Esta
// camada escreve essas respostas diretamente nos campos da etapa — nunca
// como texto genérico, sempre rastreável a uma resposta real — para que o
// gestor comece pela revisão em vez de responder tudo de novo. Nenhum campo
// já preenchido pelo gestor é sobrescrito.
// ============================================================================

function findSalesEventDetail(
  data: CommercialMethodBuilderData,
  canonicalStageName: string,
): CommercialBuilderSalesEventDetail | null {
  const detail = data.current_sales_process.sales_events_detail ?? []
  const target = normalize(canonicalStageName)

  return (
    detail.find((item) => normalize(canonicalEventName(item.event)) === target) ??
    null
  )
}

function requirementFromEventFrequency(
  detail: CommercialBuilderSalesEventDetail | null,
): CommercialMethodConstructionStageDraft['requirement'] | null {
  if (!detail) return null
  if (detail.frequency === 'always') return 'required'
  if (detail.frequency === 'sometimes' || detail.frequency === 'optional') return 'conditional'
  return null
}

function applyEventFrequencySynthesis(
  stage: CommercialMethodConstructionStageDraft,
  data: CommercialMethodBuilderData,
): CommercialMethodConstructionStageDraft {
  const detail = findSalesEventDetail(data, stage.name)
  if (!detail) return stage

  const inferredRequirement = requirementFromEventFrequency(detail)
  const next: CommercialMethodConstructionStageDraft = {
    ...stage,
    requirement:
      stage.source === 'yolen_suggestion' && inferredRequirement
        ? inferredRequirement
        : stage.requirement,
  }

  if (!cleanText(next.objective) && cleanText(detail.success_definition)) {
    next.objective = cleanText(detail.success_definition)
  }

  if (
    next.completion_criteria.length === 0 &&
    cleanText(detail.success_definition)
  ) {
    next.completion_criteria = [
      `Está confirmado que: ${cleanText(detail.success_definition)}.`,
    ]
  }

  if (
    next.requirement !== 'required' &&
    next.skip_conditions.length === 0
  ) {
    next.skip_conditions = [
      `Você informou que “${stage.name}” não acontece em toda venda (frequência: ${
        detail.frequency === 'optional' ? 'opcional' : 'às vezes'
      }).`,
    ]
  }

  if (next.sufficient_when.length === 0 && cleanText(detail.success_definition)) {
    next.sufficient_when = [
      `Já é possível confirmar que: ${cleanText(detail.success_definition)}.`,
    ]
  }

  if (next.advance_when.length === 0 && cleanText(detail.success_definition)) {
    next.advance_when = [
      `O resultado esperado desta etapa foi validado: ${cleanText(detail.success_definition)}.`,
    ]
  }

  if (next.stop_asking_when.length === 0 && cleanText(detail.success_definition)) {
    next.stop_asking_when = [
      'Novas perguntas não mudariam se esse resultado já foi alcançado.',
    ]
  }

  return next
}

function applyDecisionStageSynthesis(
  stage: CommercialMethodConstructionStageDraft,
  decision: CommercialBuyerDecisionDraft,
): CommercialMethodConstructionStageDraft {
  const signals = cleanList(decision.buyer_commitment_signals)
  if (signals.length === 0) return stage

  const next = { ...stage }

  if (!cleanText(next.objective)) {
    next.objective =
      'Confirmar que o cliente decidiu comprar, com evidência real do comprador, sem depender apenas de atividade do vendedor.'
  }

  if (next.completion_criteria.length === 0) {
    next.completion_criteria = signals.map(
      (signal) => `O cliente confirmou: ${signal}.`,
    )
  }

  if (next.advance_when.length === 0) {
    next.advance_when = signals.map(
      (signal) => `O cliente confirmou: ${signal}.`,
    )
  }

  if (next.sufficient_when.length === 0) {
    next.sufficient_when = [
      'A evidência de decisão já apareceu de forma explícita e não depende de mais perguntas.',
    ]
  }

  if (next.stop_asking_when.length === 0) {
    next.stop_asking_when = [
      'Novas perguntas não mudariam se o cliente decidiu ou não.',
    ]
  }

  return next
}

function applyFormalizationStageSynthesis(
  stage: CommercialMethodConstructionStageDraft,
  data: CommercialMethodBuilderData,
  decision: CommercialBuyerDecisionDraft,
): CommercialMethodConstructionStageDraft {
  const formalization = data.current_sales_process.formalization
  const steps = cleanList([
    ...decision.formal_process_steps,
    ...decision.other_formal_process_steps,
    ...decision.formalization_steps,
    ...(formalization?.steps ?? []),
  ])

  const next = { ...stage }

  if (!cleanText(next.objective)) {
    next.objective =
      steps.length > 0
        ? `Acompanhar as ações que faltam depois da decisão para concluir a contratação: ${steps.join(', ')}.`
        : 'Acompanhar as ações necessárias para transformar a decisão em contratação concluída, sem tratar a decisão como o fim da venda.'
  }

  if (
    next.completion_criteria.length === 0 &&
    cleanText(formalization?.sale_completed_when ?? '')
  ) {
    next.completion_criteria = [
      `A venda está concluída quando: ${cleanText(formalization!.sale_completed_when)}.`,
    ]
  }

  if (next.requirement !== 'required' && next.skip_conditions.length === 0) {
    next.skip_conditions = [
      'Não existe aprovação, área ou procedimento interno relevante depois da decisão.',
    ]
  }

  if (next.sufficient_when.length === 0) {
    next.sufficient_when = [
      'Está claro o que ainda falta para concluir a contratação depois da decisão.',
    ]
  }

  if (next.advance_when.length === 0) {
    if (cleanText(formalization?.sale_completed_when ?? '')) {
      next.advance_when = [
        `A formalização pode avançar quando: ${cleanText(formalization!.sale_completed_when)}.`,
      ]
    } else if (steps.length > 0) {
      next.advance_when = [
        `Os requisitos necessários de formalização foram concluídos: ${steps.join(', ')}.`,
      ]
    } else {
      next.advance_when = [
        'As ações necessárias de formalização foram concluídas e a contratação está efetivamente finalizada.',
      ]
    }
  }

  if (next.stop_asking_when.length === 0) {
    next.stop_asking_when = [
      'Novas perguntas não mudam quais etapas de formalização ainda faltam.',
    ]
  }

  return next
}

function applyAlignmentStageSynthesis(
  stage: CommercialMethodConstructionStageDraft,
  decision: CommercialBuyerDecisionDraft,
): CommercialMethodConstructionStageDraft {
  const participants = cleanList([
    ...decision.participant_roles,
    ...decision.other_participant_roles,
  ])
  const criteria = cleanList([
    ...decision.decision_criteria,
    ...decision.other_decision_criteria,
  ])

  const next = { ...stage }

  if (!cleanText(next.objective)) {
    next.objective =
      participants.length > 0
        ? `Confirmar critérios de decisão e alinhar com quem participa, aprova ou pode bloquear: ${participants.join(', ')}.`
        : 'Confirmar critérios de decisão e alinhar com quem participa, aprova ou pode bloquear a contratação.'
  }

  if (next.completion_criteria.length === 0) {
    const criteriaCriteria = criteria.map(
      (criterion) => `O cliente confirmou que “${criterion}” pesa na escolha.`,
    )
    const participantCriteria =
      participants.length > 0
        ? [`Está confirmado quem participa, aprova ou pode bloquear: ${participants.join(', ')}.`]
        : []
    next.completion_criteria = cleanList([...participantCriteria, ...criteriaCriteria])
  }

  if (next.requirement !== 'required' && next.skip_conditions.length === 0) {
    next.skip_conditions = [
      'A compra não depende de aprovação de outra pessoa além do contato principal.',
    ]
  }

  if (next.sufficient_when.length === 0) {
    next.sufficient_when = [
      'Já está claro quem participa, aprova ou pode bloquear, e o que pesa na escolha.',
    ]
  }

  if (next.stop_asking_when.length === 0) {
    next.stop_asking_when = [
      'Novas perguntas não mudariam quem aprova ou o que pesa na decisão.',
    ]
  }

  return next
}

function applyFollowUpStageSynthesis(
  stage: CommercialMethodConstructionStageDraft,
  data: CommercialMethodBuilderData,
  decision: CommercialBuyerDecisionDraft,
): CommercialMethodConstructionStageDraft {
  const next = { ...stage }
  const reasons = cleanList(data.current_sales_process.follow_up.reasons)

  if (!cleanText(next.objective)) {
    next.objective =
      'Retomar o contato quando o motivo do adiamento deixar de existir, sem tratar a decisão pendente como perdida.'
  }

  if (next.skip_conditions.length === 0) {
    const signals = cleanList(decision.buyer_commitment_signals)
    next.skip_conditions = cleanList([
      'O cliente já confirmou a decisão de compra nesta interação.',
      'A oportunidade foi encerrada (perdida, cancelada ou descartada).',
      ...signals.map(
        (signal) => `O cliente já demonstrou: ${signal}.`,
      ),
    ])
  }

  if (next.completion_criteria.length === 0) {
    next.completion_criteria =
      reasons.length > 0
        ? reasons.map(
            (reason) => `O cliente retomou o contato depois de: ${reason}.`,
          )
        : ['O cliente retomou o contato e voltou a interagir com o vendedor.']
  }

  if (next.wait_when.length === 0 && reasons.length > 0) {
    next.wait_when = reasons.map(
      (reason) => `O cliente pediu tempo por: ${reason}.`,
    )
  }

  if (next.advance_when.length === 0 && reasons.length > 0) {
    next.advance_when = reasons.map(
      (reason) => `O motivo do adiamento (${reason}) deixou de existir e o cliente está pronto para retomar.`,
    )
  }

  if (next.sufficient_when.length === 0) {
    next.sufficient_when = [
      'Já está claro por que o cliente ainda não decidiu e o que se espera que mude isso.',
    ]
  }

  if (next.stop_asking_when.length === 0) {
    next.stop_asking_when = [
      'Perguntar de novo antes do prazo ou motivo combinado não mudaria a resposta.',
    ]
  }

  return next
}

function applyPresentationStageSynthesis(
  stage: CommercialMethodConstructionStageDraft,
  data: CommercialMethodBuilderData,
): CommercialMethodConstructionStageDraft {
  const process = data.current_sales_process
  const depth = process.presentation_depth
  const clearBefore = cleanList(depth?.must_be_clear_before ?? [])
  const clearToCustomer = cleanList(depth?.must_be_clear_to_customer ?? [])
  const presentedTooEarly = cleanList(depth?.presented_too_early ?? [])
  const overExplained = cleanList(depth?.over_explained ?? [])
  const next = { ...stage }

  if (!cleanText(next.objective)) {
    next.objective =
      clearToCustomer.length > 0
        ? `Garantir que o cliente compreenda ${clearToCustomer.join(', ')} e por que a solução apresentada faz sentido para a situação dele.`
        : 'Apresentar a solução de forma suficiente para o cliente entender o que está sendo recomendado, por que faz sentido e quais condições precisa avaliar antes de decidir.'
  }

  if (next.completion_criteria.length === 0) {
    next.completion_criteria =
      clearToCustomer.length > 0
        ? clearToCustomer.map(
            (item) => `O cliente confirmou que entendeu: ${item}.`,
          )
        : ['O cliente confirmou que entendeu a solução apresentada e por que ela faz sentido para o que procura.']
  }

  if (next.deepen_when.length === 0 && clearToCustomer.length > 0) {
    next.deepen_when = clearToCustomer.map(
      (item) => `Ainda não está claro para o cliente: ${item}.`,
    )
  }

  if (next.wait_when.length === 0 && clearBefore.length > 0) {
    next.wait_when = clearBefore.map(
      (item) => `Ainda falta esclarecer antes de avançar na apresentação: ${item}.`,
    )
  }

  if (next.sufficient_when.length === 0) {
    next.sufficient_when = [
      'O cliente já entendeu o que foi recomendado, por que faz sentido para ele e as condições relevantes para avaliar a decisão.',
    ]
  }

  if (next.advance_when.length === 0) {
    next.advance_when = [
      'O cliente demonstra que compreendeu a solução apresentada e não existe dúvida relevante sobre a proposta que impeça seguir para a decisão.',
    ]
  }

  if (next.stop_asking_when.length === 0) {
    next.stop_asking_when = [
      'Novas explicações ou perguntas não mudariam a compreensão do cliente nem a avaliação da proposta.',
    ]
  }

  if (next.recommended_questions.length === 0) {
    next.recommended_questions = [
      'Essa opção faz sentido para o que você procura?',
      'Ficou alguma dúvida importante sobre o que está sendo recomendado?',
    ]
  }

  if (next.common_mistakes.length === 0) {
    next.common_mistakes = cleanList([
      ...presentedTooEarly.map(
        (item) => `Apresentar cedo demais: ${item}`,
      ),
      ...overExplained.map(
        (item) => `Explicar além do necessário: ${item}`,
      ),
    ])
  }

  return next
}

function applyDiscoveryStageSynthesis(
  stage: CommercialMethodConstructionStageDraft,
  data: CommercialMethodBuilderData,
): CommercialMethodConstructionStageDraft {
  const process = data.current_sales_process
  const needs = cleanList([
    ...process.discovery.needs_to_discover,
    ...process.discovery.indispensable_information,
  ])

  if (needs.length === 0) return stage

  const next = { ...stage }

  if (!cleanText(next.objective)) {
    next.objective = `Entender ${needs.join(', ')} antes de recomendar ou avançar.`
  }

  if (next.deepen_when.length === 0) {
    next.deepen_when = needs.map(
      (item) => `Ainda falta compreender: ${item}.`,
    )
  }

  if (next.sufficient_when.length === 0) {
    next.sufficient_when = [
      'O que já foi confirmado é suficiente para recomendar com segurança, mesmo sem esgotar todos os detalhes possíveis.',
    ]
  }

  if (next.advance_when.length === 0) {
    next.advance_when = [
      'Já existe informação suficiente e confiável para recomendar a solução adequada sem depender de novas perguntas que mudariam a recomendação.',
    ]
  }

  if (next.stop_asking_when.length === 0) {
    next.stop_asking_when = [
      'Novas perguntas não mudariam a recomendação.',
    ]
  }

  return next
}

function synthesizeStageFields(
  stage: CommercialMethodConstructionStageDraft,
  data: CommercialMethodBuilderData,
  decision: CommercialBuyerDecisionDraft,
): CommercialMethodConstructionStageDraft {
  const baseAssist = buildStageAssistiveSuggestions(stage, data)
  const decisionAssist = buildBuyerDecisionStageAssist(stage, data, decision)
  const merged = mergeStageAssistiveSuggestions(baseAssist, decisionAssist)

  let next: CommercialMethodConstructionStageDraft = { ...stage }

  if (!next.purpose && merged.context_notes.length > 0) {
    next.purpose = merged.context_notes.join(' ')
  }

  if (next.completion_criteria.length === 0 && merged.completion_criteria.length > 0) {
    next.completion_criteria = merged.completion_criteria
  }

  if (next.recommended_questions.length === 0 && merged.recommended_questions.length > 0) {
    next.recommended_questions = merged.recommended_questions
  }

  if (next.common_mistakes.length === 0 && merged.common_mistakes.length > 0) {
    next.common_mistakes = merged.common_mistakes
  }

  next = applyEventFrequencySynthesis(next, data)

  if (stageLooksLike(next, ['decisão de compra', 'compromisso de compra'])) {
    next = applyDecisionStageSynthesis(next, decision)
  }

  if (stageLooksLike(next, ['formalização'])) {
    next = applyFormalizationStageSynthesis(next, data, decision)
  }

  if (stageLooksLike(next, ['alinhamento da decisão'])) {
    next = applyAlignmentStageSynthesis(next, decision)
  }

  if (stageLooksLike(next, ['follow'])) {
    next = applyFollowUpStageSynthesis(next, data, decision)
  }

  if (stageLooksLike(next, ['apresentação', 'proposta', 'orçamento'])) {
    next = applyPresentationStageSynthesis(next, data)
  }

  if (stageLooksLike(next, ['descoberta', 'diagnóstico', 'entender', 'acolher'])) {
    next = applyDiscoveryStageSynthesis(next, data)
  }

  return next
}

function emptyAssist(): CommercialMethodStageAssistiveSuggestions {
  return {
    context_notes: [],
    completion_criteria: [],
    recommended_questions: [],
    common_mistakes: [],
  }
}

export function buildBuyerDecisionStageAssist(
  stage: CommercialMethodConstructionStageDraft,
  data: CommercialMethodBuilderData,
  decision: CommercialBuyerDecisionDraft | undefined,
): CommercialMethodStageAssistiveSuggestions {
  if (!decision?.confirmed) return emptyAssist()

  const profile = getBuyerDecisionProfile(data, decision)
  const result = emptyAssist()

  if (stageLooksLike(stage, ['descoberta', 'diagnóstico', 'entender', 'acolher'])) {
    result.context_notes.push(
      profile.discovery_depth === 'deep'
        ? 'A arquitetura desta venda pede descoberta mais profunda, mas apenas sobre informações que realmente mudam recomendação, decisão ou justificativa.'
        : profile.discovery_depth === 'moderate'
          ? 'A descoberta deve esclarecer o suficiente para recomendar e avançar sem transformar a conversa em interrogatório.'
          : 'A venda indica descoberta leve: confirme somente o que muda a recomendação ou evita indicar a solução errada.',
    )

    if (decision.investment_justification === 'yes') {
      result.recommended_questions.push(
        'O que precisa ficar claro internamente para esse investimento fazer sentido?',
      )
    }
  }

  const event = decision.event_success_criteria.find((item) =>
    stageLooksLike(stage, [item.event]),
  )
  if (event) {
    result.context_notes.push(
      `Você definiu o que “${event.event}” precisa provar. Realizar essa atividade, por si só, não conclui a etapa.`,
    )
    result.completion_criteria.push(
      ...event.criteria.map(
        (criterion) => `Há evidência do comprador de que: ${criterion}.`,
      ),
    )
    result.common_mistakes.push(
      `Considerar “${event.event} realizado” como avanço sem validar o resultado esperado com o comprador.`,
    )
  }

  if (stageLooksLike(stage, ['alinhamento da decisão'])) {
    const participants = cleanList([
      ...decision.participant_roles,
      ...decision.other_participant_roles,
    ])
    const criteria = cleanList([
      ...decision.decision_criteria,
      ...decision.other_decision_criteria,
    ])

    if (participants.length > 0) {
      result.completion_criteria.push(
        `Está confirmado quem participa, aprova ou pode bloquear: ${participants.join(', ')}.`,
      )
    }
    result.completion_criteria.push(
      ...criteria.map(
        (criterion) => `O cliente confirmou que “${criterion}” pesa na escolha.`,
      ),
    )
    result.common_mistakes.push(
      'Tratar apenas o contato atual como responsável por toda a decisão sem confirmar como a compra é aprovada.',
    )
  }

  if (stageLooksLike(stage, ['decisão de compra', 'compromisso de compra'])) {
    result.completion_criteria.push(
      ...decision.buyer_commitment_signals.map(
        (signal) => `O cliente confirmou: ${signal}.`,
      ),
    )
    result.common_mistakes.push(
      'Considerar proposta enviada, demonstração realizada, ligação feita ou mensagem enviada como prova de que o cliente decidiu comprar.',
    )
  }

  if (stageLooksLike(stage, ['formalização'])) {
    const formalization = cleanList([
      ...decision.formal_process_steps,
      ...decision.other_formal_process_steps,
      ...decision.formalization_steps,
    ])
    result.context_notes.push(
      'Esta etapa acontece depois da decisão comercial. Ela não deve ser usada para fingir que o cliente já decidiu antes de existir evidência de compromisso.',
    )
    result.completion_criteria.push(
      ...formalization.map((item) => `Foi concluído o requisito de formalização: ${item}.`),
    )
  }

  if (
    decision.real_urgency === 'yes' &&
    cleanList([...decision.urgency_drivers, ...decision.other_urgency_drivers]).length > 0
  ) {
    result.context_notes.push(
      `Existe urgência informada na operação: ${cleanList([
        ...decision.urgency_drivers,
        ...decision.other_urgency_drivers,
      ]).join(', ')}. A Yolen não deve criar uma data ou consequência que o cliente não confirmou.`,
    )
  }

  return {
    context_notes: cleanList(result.context_notes),
    completion_criteria: cleanList(result.completion_criteria),
    recommended_questions: cleanList(result.recommended_questions),
    common_mistakes: cleanList(result.common_mistakes),
  }
}

export function mergeStageAssistiveSuggestions(
  primary: CommercialMethodStageAssistiveSuggestions,
  secondary: CommercialMethodStageAssistiveSuggestions,
): CommercialMethodStageAssistiveSuggestions {
  return {
    context_notes: cleanList([...primary.context_notes, ...secondary.context_notes]),
    completion_criteria: cleanList([
      ...primary.completion_criteria,
      ...secondary.completion_criteria,
    ]),
    recommended_questions: cleanList([
      ...primary.recommended_questions,
      ...secondary.recommended_questions,
    ]),
    common_mistakes: cleanList([
      ...primary.common_mistakes,
      ...secondary.common_mistakes,
    ]),
  }
}

const SELLER_ACTIVITY_PATTERNS = [
  /^enviei\b/,
  /^enviamos\b/,
  /^proposta (foi )?enviada\b/,
  /^orcamento (foi )?enviado\b/,
  /^fiz (a )?(demo|demonstracao|tour|ligacao)\b/,
  /^realizei (a )?(demo|demonstracao|tour|ligacao)\b/,
  /^(demo|demonstracao|tour) (foi )?(realizada|realizado|feito|feita)\b/,
  /^liguei\b/,
  /^mandei (mensagem|whatsapp)\b/,
  /^contato (foi )?(feito|realizado)\b/,
  /^apresentei\b/,
]

const BUYER_EVIDENCE_PATTERN =
  /\b(cliente|comprador|decisor|responsavel)\b.*\b(confirm|valid|aceit|concord|aprov|agend|reconhec)/

export function getSellerActivityOnlyGuidance(value: string): string | null {
  const text = normalize(value)
  if (!text) return null
  if (BUYER_EVIDENCE_PATTERN.test(text)) return null

  if (SELLER_ACTIVITY_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'Atividade do vendedor não prova avanço. Registre o que o comprador confirmou, validou, aceitou ou combinou como consequência dessa atividade.'
  }

  return null
}

export function auditBuyerDecisionConstruction(
  draft: CommercialMethodConstructionDraft,
  data: CommercialMethodBuilderData,
): CommercialMethodConstructionQualityItem[] {
  const items: CommercialMethodConstructionQualityItem[] = []
  const decision = draft.buyer_decision

  if (!decision?.confirmed) {
    items.push({
      level: 'warning',
      message: 'A arquitetura da decisão do comprador ainda não foi confirmada.',
    })
    return items
  }

  const profile = getBuyerDecisionProfile(data, decision)
  const depthLabel = {
    light: 'leve',
    moderate: 'moderada',
    deep: 'profunda',
  }[profile.depth]

  items.push({
    level: 'pass',
    message: `A profundidade sugerida foi calibrada como ${depthLabel} a partir da forma como o cliente decide e da intensidade da operação.`,
  })

  items.push({
    level: 'pass',
    message: 'Decisão de compra e formalização estão registradas como conceitos distintos no diagnóstico da Fase 2.',
  })

  let activityIssue = false
  for (const stage of draft.stages) {
    const values = [...stage.completion_criteria, ...stage.advance_when]
    const invalid = values.find((value) => getSellerActivityOnlyGuidance(value))
    if (invalid) {
      activityIssue = true
      items.push({
        level: 'warning',
        stage_id: stage.id,
        message: `A etapa “${stage.name}” usa atividade do vendedor como evidência de avanço: “${invalid}”.`,
      })
    }
  }

  if (!activityIssue) {
    items.push({
      level: 'pass',
      message: 'Nenhum critério de conclusão ou avanço depende somente de atividade do vendedor.',
    })
  }

  if (
    profile.formal_buying_process === 'required' &&
    !draft.stages.some((stage) => stageLooksLike(stage, ['formalização']))
  ) {
    items.push({
      level: 'warning',
      message: 'O cliente possui processo formal confirmado, mas a estrutura atual não explica como acompanhar a formalização.',
    })
  }

  return items
}

export function getBuyerDecisionBlockingIssues(
  draft: CommercialMethodConstructionDraft,
  data: CommercialMethodBuilderData,
): CommercialMethodValidationIssue[] {
  const issues: CommercialMethodValidationIssue[] = []
  const decision = draft.buyer_decision

  if (!decision || !isCommercialBuyerDecisionDraft(decision) || !decision.confirmed) {
    issues.push({
      path: 'buyer_decision',
      code: 'INVALID_VALUE',
      message: 'Confirme primeiro como seus clientes decidem antes de preparar o método para revisão final.',
    })
    return issues
  }

  for (const message of validateBuyerDecisionDraft(data, decision)) {
    issues.push({
      path: 'buyer_decision',
      code: 'INVALID_VALUE',
      message,
    })
  }

  draft.stages.forEach((stage, stageIndex) => {
    ;(['completion_criteria', 'advance_when'] as const).forEach((key) => {
      stage[key].forEach((value, itemIndex) => {
        const guidance = getSellerActivityOnlyGuidance(value)
        if (guidance) {
          issues.push({
            path: `stages[${stageIndex}].${key}[${itemIndex}]`,
            code: 'INVALID_VALUE',
            message: guidance,
          })
        }
      })
    })
  })

  return issues
}
