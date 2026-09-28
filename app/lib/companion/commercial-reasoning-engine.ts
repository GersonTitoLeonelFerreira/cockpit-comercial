import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import type {
  CommercialReading,
  CommercialReadingEvidenceItem,
} from './commercial-reading-contract'

import type {
  StatefulCommercialState,
} from './stateful-commercial-state'

import {
  buildCommercialIntelligenceLibrary,
  rankCommercialIntelligence,
} from './commercial-intelligence-library'

import {
  COMMERCIAL_REASONING_CONTRACT_VERSION,
  type CommercialReasoning,
  type CommercialReasoningTechnique,
  type CommercialReasoningKnowledgeReference,
} from './commercial-reasoning-contract'

import type {
  RankedCommercialIntelligenceEntry,
} from './commercial-intelligence-contract'

import {
  buildSellerExecutionTrace,
} from './seller-execution-trace'

import {
  buildSellerSequenceMethodAssessment,
} from './seller-sequence-method-assessment'

import {
  buildCommercialTechniqueContext,
  selectApplicableCommercialTechniques,
} from './commercial-techniques-engine'

const MAX_TECHNIQUES = 3
const MAX_KNOWLEDGE_REFERENCES = 5
const MAX_DO_NOT_DO = 5
const MAX_COMPARISONS = 5

function unique(
  values: string[],
): string[] {
  return Array.from(
    new Set(
      values
        .map(value => value.trim())
        .filter(Boolean),
    ),
  )
}

function normalizeSearchText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function evidenceText(
  items: readonly CommercialReadingEvidenceItem[],
): string {
  return items
    .map(item => item.summary)
    .join(' ')
}

function containsAny(
  value: string,
  terms: readonly string[],
): boolean {
  const normalized =
    normalizeSearchText(value)

  return terms.some(
    term =>
      normalized.includes(
        normalizeSearchText(term),
      ),
  )
}

function collectProductIds(
  reading: CommercialReading,
): string[] {
  return unique(
    reading.customer.discussed_products
      .map(
        product =>
          product.canonical_product_id,
      )
      .filter(
        (value): value is string =>
          typeof value === 'string' &&
          Boolean(value.trim()),
      ),
  )
}

function hasActiveKind(
  state: StatefulCommercialState,
  prefix: string,
): boolean {
  return [
    ...state.facts,
    ...state.needs,
    ...state.open_loops,
    ...state.objections,
    ...state.commitments,
    ...state.signals,
    ...state.uncertainties,
  ].some(
    item =>
      item.memory_status === 'active' &&
      item.kind.startsWith(prefix),
  )
}

function hasCanonicalThirdPartyOpportunity(
  state: StatefulCommercialState,
): boolean {
  return (
    hasActiveKind(
      state,
      'commercial_party.current_contact.intermediary',
    ) &&
    hasActiveKind(
      state,
      'commercial_party.related.prospect',
    )
  )
}

function hasSemanticMatch(
  ranked: RankedCommercialIntelligenceEntry,
): boolean {
  return (
    ranked.matched_signals.length > 0 ||
    ranked.matched_situations.length > 0 ||
    ranked.matched_objectives.length > 0
  )
}

function filterReasoningCandidates(
  ranked: RankedCommercialIntelligenceEntry[],
): RankedCommercialIntelligenceEntry[] {
  return ranked.filter((item) => {
    if (
      item.entry.kind !==
        'company_knowledge'
    ) {
      return true
    }

    // Conhecimento de empresa/produto não pode entrar só porque pertence
    // ao mesmo company_id ou product_id. Precisa existir compatibilidade
    // semântica com o momento atual; caso contrário, uma política de
    // pagamento poderia contaminar, por exemplo, uma conversa sobre cirurgia.
    return hasSemanticMatch(item)
  })
}

function buildSituationSignals({
  reading,
  state,
}: {
  reading: CommercialReading
  state: StatefulCommercialState
}): {
  situations: string[]
  signals: string[]
  objectives: string[]
} {
  const situations: string[] = []
  const signals: string[] = []
  const objectives: string[] = [
    reading.best_approach.reason,
  ]

  const objectionText =
    [
      evidenceText(
        reading.customer.objections,
      ),
      reading.risks.customer_objections
        .map(risk => risk.summary)
        .join(' '),
    ].join(' ')

  if (reading.customer.objections.length > 0) {
    situations.push(
      'objection_handling',
    )
    signals.push('objection_open')
  }

  if (
    containsAny(
      objectionText,
      [
        'cartão',
        'cartao',
        'pix',
        'pagamento',
        'limite',
        'boleto',
        'parcela',
      ],
    )
  ) {
    situations.push(
      'payment_objection',
    )
    signals.push(
      'claim_requires_company_knowledge',
    )
  }

  if (
    containsAny(
      objectionText,
      [
        'preço',
        'preco',
        'caro',
        'valor',
        'desconto',
      ],
    )
  ) {
    situations.push(
      'price_objection',
    )
  }

  if (
    reading.customer.missing_discovery.length > 0
  ) {
    situations.push('discovery_gap')

    for (
      const gap of
      reading.customer.missing_discovery
    ) {
      signals.push(
        `missing_${gap.topic}`,
      )
    }
  }

  if (
    reading.customer.problems.length > 0 &&
    reading.customer.impacts.length === 0
  ) {
    situations.push(
      'impact_gap',
    )
    signals.push(
      'problem_without_impact',
      'missing_impact',
    )
  }

  if (
    reading.customer.primary_product_interest &&
    reading.customer.decision_criteria.length === 0
  ) {
    situations.push(
      'decision_criteria_gap',
    )
    signals.push(
      'missing_decision_criterion',
    )
  }

  if (
    reading.customer.decision_criteria.length > 0
  ) {
    signals.push(
      'decision_criteria_known',
    )
  }

  if (
    reading.customer.needs.length > 0 ||
    reading.customer.objectives.length > 0
  ) {
    signals.push(
      'need_known',
    )
  }

  if (
    reading.customer.primary_product_interest
  ) {
    signals.push(
      'product_interest',
    )
  }

  if (
    reading.customer.competitors.length > 0
  ) {
    situations.push(
      'comparison_context',
    )
    signals.push(
      'customer_comparing_options',
    )
  }

  if (
    reading.customer.uncertainties.length > 0
  ) {
    situations.push(
      'uncertainty_handling',
    )
    signals.push(
      'uncertainty_open',
    )
  }

  if (
    reading.method.configured &&
    reading.method.adherence.status !==
      'on_method'
  ) {
    situations.push(
      'method_alignment',
    )
    signals.push('method_configured')
  }

  if (
    hasActiveKind(
      state,
      'commercial_party.related.prospect',
    ) ||
    hasActiveKind(
      state,
      'commercial_party.current_contact.intermediary',
    )
  ) {
    situations.push(
      'third_party_referral',
      'intermediary_contact',
    )
    signals.push(
      'third_party_prospect',
      'intermediary_detected',
    )
  }

  const latestDirection =
    reading.conversation_summary
      .last_customer_request_or_decision
      ? 'customer'
      : null

  const commitmentText =
    reading.customer.commitments
      .filter(
        item =>
          item.status === 'proposed' ||
          item.status === 'confirmed' ||
          item.status === 'reschedule_requested',
      )
      .map(item => item.summary)
      .join(' ')

  if (
    commitmentText &&
    containsAny(
      commitmentText,
      [
        'vou ',
        'te aviso',
        'confirmo',
        'verificar',
        'resolver',
        'amanhã',
        'amanha',
      ],
    )
  ) {
    situations.push(
      'customer_commitment_pending',
      'waiting_for_customer',
    )
    signals.push(
      'waiting_on_customer',
      'customer_future_action',
    )
  }

  if (
    reading.best_approach.decision === 'wait' ||
    reading.best_approach.decision === 'give_space'
  ) {
    situations.push(
      'waiting_for_customer',
    )
    signals.push(
      'waiting_on_customer',
    )
  }

  if (
    latestDirection === 'customer' &&
    reading.communication.intervention_needed
  ) {
    signals.push(
      'seller_response_needed',
    )
  }

  if (
    reading.customer.primary_product_interest
  ) {
    situations.push(
      'product_fit',
    )
    signals.push(
      'claim_requires_company_knowledge',
    )
  }

  if (
    reading.best_approach.decision ===
      'present_solution' ||
    reading.best_approach.decision ===
      'demonstrate_value' ||
    reading.best_approach.decision ===
      'compare'
  ) {
    situations.push(
      'value_explanation',
    )
  }

  if (
    reading.best_approach.decision === 'close' ||
    reading.best_approach.decision ===
      'ask_for_decision' ||
    reading.best_approach.decision ===
      'negotiate'
  ) {
    situations.push(
      'close_execution',
      'next_step_choice',
    )
  }

  return {
    situations:
      unique(situations),
    signals:
      unique(signals),
    objectives:
      unique(objectives),
  }
}

function summarizeRankingReason(
  ranked: RankedCommercialIntelligenceEntry,
): string {
  if (
    ranked.ranking_reasons.length > 0
  ) {
    return ranked.ranking_reasons
      .join(' ')
  }

  return 'Compatível com o contexto comercial atual.'
}

function humanTechniqueReason(
  id: string,
): string {
  switch (id) {
    case 'technique.contextual_reengagement':
      return 'O cliente já demonstrou intenção e a conversa perdeu continuidade; a melhor retomada preserva esse objetivo sem repetir a pergunta anterior.'

    case 'technique.guided_choice':
      return 'Há poucas alternativas reais disponíveis e uma escolha simples reduz esforço sem inventar opções.'

    case 'technique.objection_diagnosis':
      return 'Existe uma objeção, mas responder antes de entender a causa aumenta o risco de atacar o problema errado.'

    case 'technique.objection_isolation':
      return 'A objeção já está identificada; agora é importante confirmar se ela é realmente a principal trava antes de negociar ou conceder.'

    case 'technique.discovery_before_prescription':
      return 'Ainda falta uma informação que pode mudar a recomendação, por isso apresentar solução agora seria prematuro.'

    case 'technique.decision_criteria_clarification':
      return 'O cliente demonstra interesse, mas ainda não está claro quais critérios vão determinar a escolha.'

    case 'technique.impact_exploration':
      return 'O problema está visível, mas seu impacto ainda não foi conectado à decisão; entender essa consequência aumenta relevância sem criar pressão artificial.'

    case 'technique.value_linkage':
      return 'Já existe contexto suficiente para ligar uma capacidade real da solução ao que o cliente disse que valoriza.'

    case 'technique.evidence_based_reassurance':
      return 'A incerteza pode ser tratada com evidência oficial pertinente, sem prometer além do que a empresa realmente oferece.'

    case 'technique.stakeholder_mapping':
      return 'A decisão envolve mais de uma pessoa e o próximo passo precisa respeitar quem influencia, decide ou usa a solução.'

    case 'technique.third_party_handoff':
      return 'Quem conversa agora não é necessariamente quem compra ou usa; manter os papéis corretos evita conduzir a pessoa errada.'

    case 'technique.commitment_ladder':
      return 'O cliente já demonstrou intenção; pedir apenas o próximo compromisso proporcional ao estágio mantém ritmo sem forçar fechamento prematuro.'

    case 'technique.explicit_close_execution':
      return 'O cliente já sinalizou intenção explícita de avançar; reiniciar descoberta agora criaria atrito desnecessário.'

    case 'technique.comparison_by_criteria':
      return 'A comparação só ajuda quando usa os critérios que o próprio cliente considera importantes e fatos oficiais sobre as alternativas.'

    case 'technique.commitment_wait':
      return 'A próxima resposta está com o cliente; repetir a mesma ação sem fato novo adicionaria pressão, não informação.'

    case 'principle.company_rules_before_claim':
      return 'A orientação depende de condição, política ou capacidade específica; a resposta precisa permanecer dentro do conhecimento oficial da empresa.'

    default:
      return 'A técnica é compatível com o momento comercial atual e com os sinais observados na conversa.'
  }
}

function selectTechniques(
  ranked:
    RankedCommercialIntelligenceEntry[],
): CommercialReasoningTechnique[] {
  return ranked
    .filter(
      item =>
        item.entry.kind === 'technique' ||
        item.entry.kind === 'principle',
    )
    .slice(0, MAX_TECHNIQUES)
    .map(
      item => ({
        intelligence_id:
          item.entry.id,
        title:
          item.entry.title,
        kind:
          item.entry.kind,
        scope:
          item.entry.scope,
        why_applicable:
          humanTechniqueReason(
            item.entry.id,
          ),
        risks: [
          ...item.entry.risks,
        ],
      }),
    )
}

function selectKnowledge(
  ranked:
    RankedCommercialIntelligenceEntry[],
): CommercialReasoningKnowledgeReference[] {
  return ranked
    .filter(
      item =>
        item.entry.kind ===
          'company_knowledge',
    )
    .slice(
      0,
      MAX_KNOWLEDGE_REFERENCES,
    )
    .map(
      item => ({
        intelligence_id:
          item.entry.id,
        title:
          item.entry.title,
        scope:
          item.entry.scope,
        source_type:
          item.entry.provenance
            .source_type,
        source_id:
          item.entry.provenance
            .source_id,
        product_id:
          item.entry.provenance
            .product_id,
        why_relevant:
          summarizeRankingReason(item),
        grounded_content:
          item.entry.description,
      }),
    )
}

function buildDoNotDo(
  ranked:
    RankedCommercialIntelligenceEntry[],
  reading:
    CommercialReading,
): string[] {
  const restrictions: string[] = []

  for (
    const item of ranked
  ) {
    if (
      item.entry.kind === 'anti_pattern'
    ) {
      restrictions.push(
        item.entry.title,
      )
    }

    // when_not_to_use descreve condições de aplicabilidade da biblioteca,
    // não um fato atual da conversa. Só restrições comprovadas pelo
    // Technique Engine/Sequence Assessment podem virar "Evite agora".
  }

  for (
    const improvement of
    reading.improvement_points
  ) {
    restrictions.push(
      improvement.how_to_improve,
    )
  }

  return unique(restrictions)
    .slice(0, MAX_DO_NOT_DO)
}

function buildComparison(
  ranked:
    RankedCommercialIntelligenceEntry[],
): CommercialReasoning['comparison'] {
  const similarities =
    unique(
      ranked.flatMap(
        item => [
          ...item.matched_signals.map(
            signal =>
              `Sinal atual compatível: ${signal}.`,
          ),
          ...item.matched_situations.map(
            situation =>
              `Situação atual compatível: ${situation}.`,
          ),
        ],
      ),
    )
      .slice(0, MAX_COMPARISONS)

  const differences =
    unique(
      ranked.flatMap(
        item =>
          item.entry.when_not_to_use
            .slice(0, 1)
            .map(
              restriction =>
                `Limite que ainda precisa ser respeitado em ${item.entry.title}: ${restriction}`,
            ),
      ),
    )
      .slice(0, MAX_COMPARISONS)

  return {
    similarities,
    differences,
  }
}

function objectiveForTechnique(
  technique:
    CommercialReasoningTechnique | undefined,
): string | null {
  switch (
    technique?.intelligence_id
  ) {
    case 'technique.contextual_reengagement':
      return 'Retomar a intenção que o cliente já demonstrou com uma mensagem de continuidade; não repetir a pergunta que ficou sem resposta e buscar um microcompromisso simples para reabrir a conversa.'

    case 'technique.decision_criteria_clarification':
      return 'Descobrir quais critérios realmente determinam a escolha antes de comparar ou recomendar alternativas.'

    case 'technique.impact_exploration':
      return 'Entender o impacto concreto do problema antes de conectar a solução ao valor.'

    case 'technique.value_linkage':
      return 'Conectar uma capacidade oficial da solução a uma necessidade, objetivo ou critério já comprovado do cliente.'

    case 'technique.objection_isolation':
      return 'Confirmar se a objeção atual é realmente a principal trava antes de negociar, conceder ou responder em profundidade.'

    case 'technique.evidence_based_reassurance':
      return 'Responder à incerteza com a evidência oficial mais pertinente, sem inventar promessa ou garantia.'

    case 'technique.stakeholder_mapping':
      return 'Mapear quem influencia, decide ou usa a solução e alinhar o próximo passo com o processo real de decisão.'

    case 'technique.commitment_ladder':
      return 'Converter a intenção atual no menor próximo compromisso útil que realmente move a negociação.'

    case 'technique.explicit_close_execution':
      return 'Executar o próximo passo operacional do fechamento sem reiniciar descoberta que já foi superada.'

    case 'technique.comparison_by_criteria':
      return 'Comparar alternativas pelos critérios declarados pelo cliente e pelos fatos oficiais disponíveis.'

    case 'technique.guided_choice':
      return 'Apresentar somente opções reais já disponíveis e pedir uma escolha simples entre elas.'

    case 'technique.objection_diagnosis':
      return 'Investigar a causa real da objeção antes de oferecer argumento, condição ou alternativa.'

    case 'technique.third_party_handoff':
      return 'Conduzir o próximo passo com o interlocutor sem atribuir a ele fatos ou decisões do prospect relacionado.'

    case 'technique.discovery_before_prescription':
      return 'Fazer a pergunta de descoberta que realmente muda a recomendação antes de apresentar solução ou condição.'

    case 'technique.commitment_wait':
      return 'Aguardar a resposta do cliente; não repetir a ação já executada sem fato novo.'

    default:
      return null
  }
}

function inferObjectiveNow({
  reading,
  sequenceMethodAssessment,
  selectedTechniques,
}: {
  reading: CommercialReading
  sequenceMethodAssessment:
    ReturnType<
      typeof buildSellerSequenceMethodAssessment
    >
  selectedTechniques:
    CommercialReasoningTechnique[]
}): string {
  const techniqueObjective =
    objectiveForTechnique(
      selectedTechniques[0],
    )

  if (techniqueObjective) {
    return techniqueObjective
  }

  if (
    sequenceMethodAssessment
      .sequence.waiting_for_customer &&
    !sequenceMethodAssessment
      .sequence.customer_fact_after_action
  ) {
    return 'Aguardar a resposta do cliente e preservar o compromisso já solicitado, sem repetir a mesma ação.'
  }

  if (
    sequenceMethodAssessment
      .method.recovery_move
  ) {
    return sequenceMethodAssessment
      .method.recovery_move
  }

  if (
    sequenceMethodAssessment
      .method.recovery_objective
  ) {
    return sequenceMethodAssessment
      .method.recovery_objective
  }

  return reading.best_approach.reason
}

function decisionForTechnique(
  technique:
    CommercialReasoningTechnique | undefined,
): CommercialReading[
  'best_approach'
]['decision'] | null {
  switch (
    technique?.intelligence_id
  ) {
    case 'technique.contextual_reengagement':
      return 'follow_up'

    case 'technique.guided_choice':
    case 'technique.commitment_ladder':
      return 'set_commitment'

    case 'technique.objection_diagnosis':
    case 'technique.objection_isolation':
      return 'handle_objection'

    case 'technique.discovery_before_prescription':
    case 'technique.decision_criteria_clarification':
    case 'technique.impact_exploration':
    case 'technique.stakeholder_mapping':
      return 'deepen_discovery'

    case 'technique.value_linkage':
    case 'technique.evidence_based_reassurance':
      return 'demonstrate_value'

    case 'technique.comparison_by_criteria':
      return 'compare'

    case 'technique.explicit_close_execution':
      return 'close'

    case 'technique.commitment_wait':
      return 'wait'

    case 'technique.third_party_handoff':
      return 'set_commitment'

    default:
      return null
  }
}

function buildCurrentSituation({
  reading,
  sequenceMethodAssessment,
  selectedTechniques,
}: {
  reading: CommercialReading
  sequenceMethodAssessment:
    ReturnType<
      typeof buildSellerSequenceMethodAssessment
    >
  selectedTechniques:
    CommercialReasoningTechnique[]
}): string {
  const techniqueId =
    selectedTechniques[0]
      ?.intelligence_id

  if (
    techniqueId ===
      'technique.contextual_reengagement'
  ) {
    return 'O cliente já demonstrou um objetivo comercial, o vendedor tentou avançá-lo e a conversa perdeu continuidade antes de concluir esse compromisso.'
  }

  if (
    sequenceMethodAssessment
      .sequence.break_detected
  ) {
    return 'A conversa saiu do objetivo ativo do cliente antes de concluir o próximo passo que já estava em andamento.'
  }

  if (
    sequenceMethodAssessment
      .sequence.waiting_for_customer &&
    !sequenceMethodAssessment
      .sequence.customer_fact_after_action
  ) {
    return 'O vendedor já executou o próximo movimento e a resposta necessária ainda depende do cliente.'
  }

  return reading
    .conversation_summary
    .current_state
    .summary
}

function buildDecisionReason({
  reading,
  sequenceMethodAssessment,
  selectedTechniques,
}: {
  reading: CommercialReading
  sequenceMethodAssessment:
    ReturnType<
      typeof buildSellerSequenceMethodAssessment
    >
  selectedTechniques:
    CommercialReasoningTechnique[]
}): string {
  const technique =
    selectedTechniques[0]

  if (technique) {
    return technique.why_applicable
  }

  if (
    sequenceMethodAssessment
      .sequence.break_detected
  ) {
    return 'A conversa saiu do objetivo que o cliente já havia demonstrado; o próximo movimento precisa recuperar continuidade antes de introduzir outra etapa.'
  }

  if (
    sequenceMethodAssessment
      .sequence.waiting_for_customer &&
    !sequenceMethodAssessment
      .sequence.customer_fact_after_action
  ) {
    return 'O vendedor já executou a ação necessária e ainda não surgiu fato novo do cliente; repetir a mesma solicitação agora adicionaria pressão sem melhorar a decisão.'
  }

  return reading.best_approach.reason
}

export function buildCommercialReasoning({
  reading,
  cycle_state,
  diagnostic_input,
}: {
  reading: CommercialReading
  cycle_state: StatefulCommercialState
  diagnostic_input: CompanionDiagnosticInput
}): CommercialReasoning {
  const thirdPartyOpportunity =
    hasCanonicalThirdPartyOpportunity(
      cycle_state,
    )

  const roleAllowsReasoning =
    reading.commercial_role === 'buyer' ||
    thirdPartyOpportunity

  const status =
    !roleAllowsReasoning ||
    reading.commercial_relevance !==
      'commercial'
      ? 'silent'
      : reading.analysis_status ===
          'limited'
        ? 'limited'
        : 'ready'

  const situation =
    buildSituationSignals({
      reading,
      state:
        cycle_state,
    })

  const sellerExecutionTrace =
    buildSellerExecutionTrace({
      diagnostic_input,
    })

  const sequenceMethodAssessment =
    buildSellerSequenceMethodAssessment({
      reading,
      diagnostic_input,
      trace:
        sellerExecutionTrace,
    })

  const techniqueContext =
    buildCommercialTechniqueContext({
      reading,
      diagnostic_input,
      trace:
        sellerExecutionTrace,
      sequence_method:
        sequenceMethodAssessment,
    })

  const combinedSituation = {
    situations:
      unique([
        ...situation.situations,
        ...sequenceMethodAssessment
          .situations,
      ]),
    signals:
      unique([
        ...situation.signals,
        ...sequenceMethodAssessment
          .signals,
        ...techniqueContext
          .supplemental_signals,
      ]),
    objectives:
      unique([
        ...situation.objectives,
        ...(
          sequenceMethodAssessment
            .method.recovery_objective
            ? [
                sequenceMethodAssessment
                  .method
                  .recovery_objective,
              ]
            : []
        ),
      ]),
  }

  const productIds =
    collectProductIds(reading)

  const library =
    buildCommercialIntelligenceLibrary(
      diagnostic_input,
    )

  const ranked =
    status === 'silent'
      ? []
      : filterReasoningCandidates(
          rankCommercialIntelligence({
            entries:
              library,
            query: {
              company_id:
                diagnostic_input.company_id,
              product_ids:
                productIds,
              situations:
                combinedSituation
                  .situations,
              signals:
                combinedSituation
                  .signals,
              objectives:
                combinedSituation
                  .objectives,
              limit: 12,
            },
          }),
        )

  const techniqueSelection =
    selectApplicableCommercialTechniques({
      ranked,
      context:
        techniqueContext,
    })

  const selectedTechniques =
    selectTechniques(
      techniqueSelection
        .selected_ranked,
    )

  const companyKnowledge =
    selectKnowledge(ranked)

  const limitations =
    unique([
      ...reading.analysis_limitations,
      ...(
        status !== 'silent'
          ? techniqueSelection
              .limitations
          : []
      ),
      ...(
        status !== 'silent' &&
        selectedTechniques.length === 0
          ? [
              'no_applicable_commercial_technique_found',
            ]
          : []
      ),
      ...(
        status !== 'silent' &&
        combinedSituation.signals.includes(
          'claim_requires_company_knowledge',
        ) &&
        companyKnowledge.length === 0
          ? [
              'required_company_knowledge_not_found',
            ]
          : []
      ),
    ])

  const decision =
    status === 'silent'
      ? 'no_intervention'
      : decisionForTechnique(
          selectedTechniques[0],
        ) ??
        reading.best_approach.decision

  const decisionReason =
    status === 'silent'
      ? 'A sessão atual não autoriza intervenção comercial.'
      : buildDecisionReason({
          reading,
          sequenceMethodAssessment,
          selectedTechniques,
        })

  return {
    contract_version:
      COMMERCIAL_REASONING_CONTRACT_VERSION,

    status,

    decision,
    decision_reason:
      decisionReason,

    current_situation:
      buildCurrentSituation({
        reading,
        sequenceMethodAssessment,
        selectedTechniques,
      }),

    objective_now:
      status === 'silent'
        ? 'Preservar o contexto sem forçar avanço comercial.'
        : inferObjectiveNow({
            reading,
            sequenceMethodAssessment,
            selectedTechniques,
          }),

    do_not_do:
      status === 'silent'
        ? [
            'Não forçar ação comercial enquanto a relevância da sessão não estiver confirmada.',
          ]
        : unique([
            ...techniqueSelection
              .restrictions,
            ...sequenceMethodAssessment
              .restrictions,
            ...buildDoNotDo(
              ranked,
              reading,
            ),
          ]).slice(
            0,
            MAX_DO_NOT_DO,
          ),

    selected_techniques:
      selectedTechniques,

    company_knowledge_used:
      companyKnowledge,

    seller_assessment: {
      strengths: [
        ...reading.seller_strengths,
      ],
      improvement_points: [
        ...reading.improvement_points,
      ],
    },

    comparison:
      buildComparison(ranked),

    evidence_message_ids: [
      ...reading.evidence_message_ids,
    ],

    memory_ids: [
      ...reading.memory_ids,
    ],

    limitations,
  }
}
