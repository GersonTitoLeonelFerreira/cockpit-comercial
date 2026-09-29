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

import {
  buildCommercialTemporalContext,
  formatCommercialDuration,
  type CommercialTemporalContext,
  type CommercialTemporalOperationalContext,
} from './commercial-temporal-context'

import type {
  SellerExecutionCustomerIntentKind,
} from './seller-execution-trace'

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
    signals.push(
      'explicit_close_intent',
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

    case 'technique.state_change_reactivation':
      return 'A conversa perdeu continuidade e o interesse atual do cliente é desconhecido; antes de retomar o passo antigo é preciso recuperar o contexto e descobrir o que mudou.'

    case 'technique.permission_based_reengagement':
      return 'Já houve tentativa sem resposta; pedir permissão para retomar reduz pressão e facilita uma resposta honesta do cliente.'

    case 'technique.pattern_interrupt_reengagement':
      return 'O mesmo tipo de mensagem já ficou sem resposta; repetir o formato tende a ser ignorado de novo, então a retomada precisa ser curta e diferente.'

    case 'technique.delayed_response_recovery':
      return 'O cliente ficou esperando uma resposta do vendedor; a prioridade é responder ao pedido reconhecendo a demora, sem fingir que nenhum tempo passou.'

    case 'technique.respectful_closure':
      return 'O cliente declarou que encerrou ou resolveu por outro caminho; insistir agora seria pressão e prejudicaria a relação.'

    case 'principle.company_rules_before_claim':
      return 'A orientação depende de condição, política ou capacidade específica; a resposta precisa permanecer dentro do conhecimento oficial da empresa.'

    default:
      return 'A técnica é compatível com o momento comercial atual e com os sinais observados na conversa.'
  }
}

function selectTechniques(
  ranked:
    RankedCommercialIntelligenceEntry[],
  limit: number = MAX_TECHNIQUES,
): CommercialReasoningTechnique[] {
  return ranked
    .filter(
      item =>
        item.entry.kind === 'technique' ||
        item.entry.kind === 'principle',
    )
    .slice(0, limit)
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
    // não um fato atual da conversa. Da mesma forma, how_to_improve é
    // coaching positivo, não uma proibição. "Evite agora" recebe apenas
    // restrições comprovadas pelo Technique Engine/Sequence Assessment
    // e anti-padrões realmente compatíveis com o contexto atual.
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

    case 'technique.state_change_reactivation':
      return 'Reativar a conversa relembrando de forma concreta o que o cliente estava avaliando e perguntar, com uma única pergunta de baixo esforço, como está esse interesse hoje — sem pedir data ou decisão e sem reenviar oferta.'

    case 'technique.permission_based_reengagement':
      return 'Retomar com permissão: reconhecer que o próximo passo ficou em aberto e perguntar de forma simples se ainda faz sentido continuar, deixando uma saída fácil para o cliente.'

    case 'technique.pattern_interrupt_reengagement':
      return 'Mudar o formato da abordagem: mensagem curta, diferente das tentativas sem resposta e ancorada no que o próprio cliente trouxe, com uma única pergunta fácil de responder — sem repetir oferta ou cobrança.'

    case 'technique.delayed_response_recovery':
      return 'Responder agora ao pedido que ficou esperando, reconhecendo a demora em uma frase e, se o momento indicado pelo cliente já passou, confirmar o que ainda faz sentido.'

    case 'technique.respectful_closure':
      return 'Respeitar a decisão do cliente: agradecer, não insistir na oferta e, no máximo, deixar a porta aberta.'

    default:
      return null
  }
}

function intentPhrase(
  kind:
    SellerExecutionCustomerIntentKind,
): string {
  switch (kind) {
    case 'scheduling':
      return 'interesse em agendar o próximo passo'
    case 'close':
      return 'intenção de fechar'
    case 'pricing':
      return 'interesse em valores'
    case 'product_interest':
      return 'interesse na solução'
    case 'payment_objection':
      return 'uma dúvida sobre pagamento'
    case 'objection':
      return 'uma objeção'
    case 'third_party_interest':
      return 'interesse em nome de outra pessoa'
    case 'general_interest':
      return 'interesse inicial'
    default:
      return 'interesse comercial'
  }
}

function silenceSentence(
  temporal: CommercialTemporalContext,
): string {
  const silence =
    temporal.facts
      .silence_since_last_customer_message_ms

  const streak =
    temporal.reactivation
      .outbound_unanswered_turns

  const streakText =
    streak >= 2
      ? `, com ${streak} tentativas do vendedor sem resposta desde então`
      : streak === 1
        ? ', e a última tentativa do vendedor ficou sem resposta'
        : ''

  return silence !== null
    ? `A última resposta do cliente foi há ${formatCommercialDuration(silence)}${streakText}.`
    : 'O cliente ainda não respondeu às tentativas do vendedor.'
}

function temporalSituation(
  temporal:
    CommercialTemporalContext | null,
): string | null {
  if (!temporal) {
    return null
  }

  const intent =
    temporal.intent

  const intentAge =
    temporal.facts
      .age_of_last_customer_intent_ms

  // Quando a intenção foi a última fala do cliente, uma única frase cobre
  // intenção e silêncio (evita "há 18 dias... há 18 dias").
  const intentIsLastCustomerWord =
    Boolean(
      intent &&
      temporal.facts
        .last_customer_message_at &&
      Date.parse(
        intent.demonstrated_at,
      ) ===
        Date.parse(
          temporal.facts
            .last_customer_message_at,
        ),
    )

  const streak =
    temporal.reactivation
      .outbound_unanswered_turns

  const intentSentence =
    intent &&
    intentAge !== null
      ? intentIsLastCustomerWord
        ? `O cliente demonstrou ${intentPhrase(intent.kind)} há ${formatCommercialDuration(intentAge)} e não respondeu desde então${streak >= 2 ? ` (${streak} tentativas do vendedor sem resposta)` : ''}.`
        : `O cliente demonstrou ${intentPhrase(intent.kind)} há ${formatCommercialDuration(intentAge)}.`
      : null

  const silence =
    intentIsLastCustomerWord
      ? null
      : silenceSentence(temporal)

  switch (
    temporal.reactivation.mode
  ) {
    case 'reactivate':
      return [
        intentSentence,
        silence,
        temporal.reactivation
          .requalify_before_continuing
          ? 'A conversa perdeu continuidade e o interesse atual não está confirmado: a intenção antiga não pode ser tratada como atual, mas a oportunidade também não está perdida.'
          : 'A conversa perdeu continuidade e precisa ser reativada antes de seguir o fluxo.',
      ]
        .filter(Boolean)
        .join(' ')

    case 'light_follow_up': {
      const pause =
        temporal.progression
          .agreed_pause

      if (
        pause &&
        temporal.reactivation
          .reason_codes.includes(
            'agreed_recontact_due',
          )
      ) {
        return [
          `O cliente pediu para ser chamado ${pause.horizon_label} e o momento combinado chegou.`,
          temporal.reactivation
            .requalify_before_continuing
            ? 'Passou tempo suficiente para o interesse precisar ser reconfirmado: a retomada lembra o combinado e pergunta como está o assunto hoje.'
            : 'A retomada cumpre o combinado: lembra o que ficou em aberto e reabre o assunto sem pressão.',
        ].join(' ')
      }

      const requalifyText =
        temporal.reactivation
          .requalify_before_continuing
          ? temporal.intent?.time_window_expired
            ? ' O momento indicado pelo cliente já passou; vale reconfirmar o interesse antes de retomar o passo pendente.'
            : ' O interesse atual não está confirmado; descobrir o que mudou vem antes do passo pendente.'
          : ''

      switch (
        temporal.progression.stage
      ) {
        case 'early_loss':
          return `${silenceSentence(temporal)} O silêncio acabou de passar do ritmo normal de resposta; um lembrete leve e contextual basta — ainda não é caso de reativação.${requalifyText}`

        case 'prolonged_silence':
          return `${silenceSentence(temporal)} O silêncio já é prolongado; antes de cobrar o passo pendente, vale checar de forma leve se o assunto continua de pé.${requalifyText}`

        case 'strong_gap':
          return `${silenceSentence(temporal)} A lacuna de continuidade já é forte: a retomada precisa descobrir o estado atual do interesse, não repetir o passo antigo.${requalifyText}`

        default:
          return `${silenceSentence(temporal)} A conversa está esfriando; a retomada precisa reabrir o objetivo sem repetir a mesma cobrança.${requalifyText}`
      }
    }

    case 'respond_now': {
      if (
        !temporal.reactivation
          .requalify_before_continuing ||
        !intent
      ) {
        return null
      }

      return `O cliente voltou a falar agora, mas a última manifestação dele sobre ${intentPhrase(intent.kind)} foi há ${formatCommercialDuration(intent.related_age_ms)} e a mensagem nova não a reconfirma. Responder já, sem tratar a intenção antiga como atual.`
    }

    case 'recover_delay': {
      const wait =
        temporal.seller_timing
          .pending_customer_wait_ms

      return [
        wait !== null
          ? `O cliente está esperando resposta do vendedor há ${formatCommercialDuration(wait)}.`
          : 'O cliente está esperando resposta do vendedor.',
        intent?.time_window_expired
          ? 'O momento que ele havia indicado já passou.'
          : null,
      ]
        .filter(Boolean)
        .join(' ')
    }

    case 'respect_closure':
      return 'O cliente declarou que encerrou ou resolveu por outro caminho; não há próximo passo comercial a forçar.'

    default:
      return null
  }
}

function temporalDecisionReason({
  temporal,
  technique,
}: {
  temporal:
    CommercialTemporalContext | null
  technique:
    CommercialReasoningTechnique | undefined
}): string | null {
  if (
    !temporal ||
    !technique
  ) {
    return null
  }

  const temporalIds = [
    'technique.state_change_reactivation',
    'technique.permission_based_reengagement',
    'technique.pattern_interrupt_reengagement',
    'technique.delayed_response_recovery',
    'technique.respectful_closure',
  ]

  if (
    !temporalIds.includes(
      technique.intelligence_id,
    ) &&
    !(
      technique.intelligence_id ===
        'technique.contextual_reengagement' &&
      temporal.reactivation.mode ===
        'light_follow_up'
    )
  ) {
    return null
  }

  const situation =
    temporalSituation(temporal)

  return situation
    ? `${situation} ${technique.why_applicable}`
    : technique.why_applicable
}

function inferObjectiveNow({
  reading,
  sequenceMethodAssessment,
  selectedTechniques,
  temporal = null,
}: {
  reading: CommercialReading
  sequenceMethodAssessment:
    ReturnType<
      typeof buildSellerSequenceMethodAssessment
    >
  selectedTechniques:
    CommercialReasoningTechnique[]
  temporal?:
    CommercialTemporalContext | null
}): string {
  // Atraso longo do vendedor que também tornou a intenção incerta: não
  // basta responder ao pedido antigo — é preciso reconfirmar se ele ainda
  // vale antes de retomar o compromisso original.
  if (
    selectedTechniques[0]
      ?.intelligence_id ===
      'technique.delayed_response_recovery' &&
    temporal?.reactivation
      .requalify_before_continuing
  ) {
    return 'Responder agora ao pedido que ficou sem resposta, reconhecendo a demora em uma frase, e reconfirmar se ele ainda faz sentido antes de retomar o compromisso original — sem presumir a data ou o momento antigo.'
  }

  if (
    selectedTechniques[0]
      ?.intelligence_id ===
      'technique.state_change_reactivation' &&
    temporal?.reactivation.mode ===
      'respond_now'
  ) {
    return 'Responder agora ao que o cliente trouxe e, na mesma mensagem, perguntar de forma simples como está o interesse que ele havia demonstrado — sem presumir que o passo antigo continua de pé e sem pedir data, escolha ou fechamento.'
  }

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

const OFFER_LIKE_ACTIONS = new Set([
  'product_presentation',
  'price_presentation',
  'stage_jump_unrelated_offer',
  'pressure_or_false_urgency',
])

function prioritizeSelectedTechniques({
  techniques,
  situations,
  signals,
  techniqueContext,
  temporal = null,
}: {
  techniques:
    CommercialReasoningTechnique[]
  situations: string[]
  signals: string[]
  techniqueContext:
    ReturnType<
      typeof buildCommercialTechniqueContext
    >
  temporal?:
    CommercialTemporalContext | null
}): CommercialReasoningTechnique[] {
  const byId =
    new Map(
      techniques.map(
        technique => [
          technique.intelligence_id,
          technique,
        ],
      ),
    )

  const priority: string[] = []

  const push =
    (id: string) => {
      if (
        byId.has(id) &&
        !priority.includes(id)
      ) {
        priority.push(id)
      }
    }

  // TEMPO PRIMEIRO: quando o intervalo mudou o significado da venda
  // (encerramento, cliente esperando o vendedor, conversa esfriando ou
  // dormente), o próximo movimento é decidido por isso — não por uma
  // continuação cega do diálogo antigo.
  const temporalMode =
    temporal?.reactivation.mode ??
    'none'

  if (
    temporal &&
    temporalMode ===
      'respect_closure'
  ) {
    push(
      'technique.respectful_closure',
    )
  } else if (
    temporal &&
    temporalMode ===
      'recover_delay'
  ) {
    push(
      'technique.delayed_response_recovery',
    )

    if (
      temporal.reactivation
        .requalify_before_continuing
    ) {
      push(
        'technique.state_change_reactivation',
      )
    }
  } else if (
    temporal &&
    temporalMode === 'wait'
  ) {
    // O tempo sustenta espera (dentro do ritmo, vendedor acabou de agir ou
    // prazo combinado com o cliente): nenhuma mensagem nova agora.
    push(
      'technique.commitment_wait',
    )
  } else if (
    temporal &&
    temporalMode ===
      'respond_now' &&
    temporal.reactivation
      .requalify_before_continuing
  ) {
    // O cliente voltou a falar, mas sem reconfirmar a intenção antiga:
    // responder e descobrir o estado atual antes do passo antigo.
    push(
      'technique.state_change_reactivation',
    )
  } else if (
    temporal &&
    (
      temporalMode ===
        'reactivate' ||
      temporalMode ===
        'light_follow_up'
    )
  ) {
    const unanswered =
      temporal.reactivation
        .outbound_unanswered_turns

    const pushedOffer =
      temporal.reactivation
        .last_unanswered_action_types
        .some(
          action =>
            OFFER_LIKE_ACTIONS.has(
              action,
            ),
        )

    const requalify =
      temporal.reactivation
        .requalify_before_continuing

    const stage =
      temporal.progression.stage

    // ESCADA PROGRESSIVA: a técnica acompanha a intensidade da lacuna,
    // não um único limiar "normal → reativação".
    //   perda inicial      → retomada contextual leve
    //   silêncio prolongado → checagem com permissão
    //   lacuna forte        → mudança de estado (reconfirmar o interesse)
    //   sem continuidade    → mudança de estado / quebra de padrão
    // Várias ofertas sem resposta antes da dormência: mudar o formato
    // primeiro (a quebra de padrão já pergunta, com baixo esforço, como
    // está o interesse).
    if (
      temporal.reactivation
        .reason_codes.includes(
          'agreed_recontact_due',
        ) &&
      !requalify
    ) {
      push(
        'technique.contextual_reengagement',
      )
    }

    if (
      unanswered >= 2 &&
      pushedOffer &&
      stage !== 'long_dormancy'
    ) {
      push(
        'technique.pattern_interrupt_reengagement',
      )
    }

    switch (stage) {
      case 'early_loss':
        if (requalify) {
          push(
            'technique.state_change_reactivation',
          )
        }
        push(
          'technique.contextual_reengagement',
        )
        break

      case 'prolonged_silence':
        if (requalify) {
          push(
            'technique.state_change_reactivation',
          )
        }
        push(
          'technique.permission_based_reengagement',
        )
        break

      case 'strong_gap':
        push(
          'technique.state_change_reactivation',
        )
        push(
          'technique.permission_based_reengagement',
        )
        break

      case 'long_dormancy':
        push(
          'technique.state_change_reactivation',
        )

        if (
          unanswered >= 2 &&
          pushedOffer
        ) {
          push(
            'technique.pattern_interrupt_reengagement',
          )
        }
        break

      default:
        if (requalify) {
          push(
            'technique.state_change_reactivation',
          )
        }
        break
    }

    if (
      unanswered >= 2
    ) {
      push(
        'technique.permission_based_reengagement',
      )
    }

    push(
      'technique.contextual_reengagement',
    )
    push(
      'technique.state_change_reactivation',
    )
    push(
      'technique.permission_based_reengagement',
    )
  }

  if (
    signals.includes(
      'explicit_close_intent',
    )
  ) {
    push(
      'technique.explicit_close_execution',
    )
  }

  if (
    techniqueContext.customer
      .has_open_objection
  ) {
    if (
      techniqueContext.sequence
        .last_action_type ===
          'objection_probe' &&
      techniqueContext.sequence
        .customer_fact_after_action
    ) {
      push(
        'technique.objection_isolation',
      )
    }

    push(
      'technique.objection_diagnosis',
    )
    push(
      'technique.objection_isolation',
    )
  }

  if (
    situations.includes(
      'third_party_referral',
    ) ||
    situations.includes(
      'intermediary_contact',
    )
  ) {
    push(
      'technique.third_party_handoff',
    )
    push(
      'technique.stakeholder_mapping',
    )
  }

  if (
    signals.includes(
      'sequence_break',
    ) ||
    situations.includes(
      'duplicate_followup',
    )
  ) {
    push(
      'technique.contextual_reengagement',
    )
  }

  if (
    techniqueContext.sequence
      .waiting_for_customer &&
    !techniqueContext.sequence
      .customer_fact_after_action
  ) {
    push(
      'technique.commitment_wait',
    )
  }

  if (
    situations.includes(
      'scheduling_choice',
    ) &&
    techniqueContext
      .grounded_options
      .has_multiple_valid_options
  ) {
    push(
      'technique.guided_choice',
    )
  }

  if (
    situations.includes(
      'comparison_context',
    ) &&
    signals.includes(
      'decision_criteria_known',
    )
  ) {
    push(
      'technique.comparison_by_criteria',
    )
  }

  if (
    signals.includes(
      'missing_impact',
    )
  ) {
    push(
      'technique.impact_exploration',
    )
  }

  if (
    signals.includes(
      'missing_decision_criterion',
    )
  ) {
    push(
      'technique.decision_criteria_clarification',
    )
  }

  if (
    situations.includes(
      'discovery_gap',
    )
  ) {
    push(
      'technique.discovery_before_prescription',
    )
  }

  if (
    signals.includes(
      'uncertainty_open',
    )
  ) {
    push(
      'technique.evidence_based_reassurance',
    )
  }

  if (
    signals.includes(
      'need_known',
    ) ||
    signals.includes(
      'decision_criteria_known',
    )
  ) {
    push(
      'technique.value_linkage',
    )
  }

  if (
    signals.includes(
      'customer_intent_hot',
    )
  ) {
    push(
      'technique.commitment_ladder',
    )
  }

  for (
    const technique of techniques
  ) {
    push(
      technique.intelligence_id,
    )
  }

  return priority
    .map(
      id =>
        byId.get(id),
    )
    .filter(
      (
        technique,
      ): technique is
        CommercialReasoningTechnique =>
        Boolean(technique),
    )
}

// O tempo restringe a decisão final mesmo quando nenhuma técnica temporal
// foi selecionada: cliente esperando o vendedor pede resposta (não
// "follow-up"), e intenção que precisa ser reconfirmada nunca vira passo
// operacional herdado da leitura antiga.
const OPERATIONAL_DECISIONS: ReadonlySet<
  CommercialReading[
    'best_approach'
  ]['decision']
> = new Set([
  'close',
  'set_commitment',
  'compare',
  'demonstrate_value',
  'deepen_discovery',
])

function temporalDecisionGuard({
  decision,
  temporal,
}: {
  decision:
    CommercialReading[
      'best_approach'
    ]['decision']
  temporal:
    CommercialTemporalContext | null
}): CommercialReading[
  'best_approach'
]['decision'] {
  if (!temporal) {
    return decision
  }

  const mode =
    temporal.reactivation.mode

  const sellerOwesReply =
    mode === 'respond_now' ||
    mode === 'recover_delay'

  if (
    temporal.reactivation
      .requalify_before_continuing &&
    OPERATIONAL_DECISIONS.has(
      decision,
    )
  ) {
    return sellerOwesReply
      ? 'respond'
      : 'follow_up'
  }

  // Espera sustentada pelo tempo nunca vira mensagem nova.
  if (
    mode === 'wait' &&
    decision !== 'give_space'
  ) {
    return 'wait'
  }

  if (
    sellerOwesReply &&
    (
      decision === 'follow_up' ||
      decision === 'wait' ||
      decision === 'give_space'
    )
  ) {
    return 'respond'
  }

  return decision
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

    case 'technique.state_change_reactivation':
    case 'technique.permission_based_reengagement':
    case 'technique.pattern_interrupt_reengagement':
      return 'follow_up'

    case 'technique.delayed_response_recovery':
      return 'respond'

    case 'technique.respectful_closure':
      return 'give_space'

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
  temporal = null,
}: {
  reading: CommercialReading
  sequenceMethodAssessment:
    ReturnType<
      typeof buildSellerSequenceMethodAssessment
    >
  selectedTechniques:
    CommercialReasoningTechnique[]
  temporal?:
    CommercialTemporalContext | null
}): string {
  const techniqueId =
    selectedTechniques[0]
      ?.intelligence_id

  const timeDrivenSituation =
    temporal &&
    [
      'technique.state_change_reactivation',
      'technique.permission_based_reengagement',
      'technique.pattern_interrupt_reengagement',
      'technique.delayed_response_recovery',
      'technique.respectful_closure',
    ].includes(
      techniqueId ?? '',
    )
      ? temporalSituation(
          temporal,
        )
      : techniqueId ===
            'technique.contextual_reengagement' &&
          temporal?.reactivation.mode ===
            'light_follow_up'
        ? temporalSituation(
            temporal,
          )
        : null

  if (timeDrivenSituation) {
    return timeDrivenSituation
  }

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
  temporal = null,
}: {
  reading: CommercialReading
  sequenceMethodAssessment:
    ReturnType<
      typeof buildSellerSequenceMethodAssessment
    >
  selectedTechniques:
    CommercialReasoningTechnique[]
  temporal?:
    CommercialTemporalContext | null
}): string {
  const technique =
    selectedTechniques[0]

  const timeDriven =
    temporalDecisionReason({
      temporal,
      technique,
    })

  if (timeDriven) {
    return timeDriven
  }

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
  evaluated_at = null,
  operational_context = null,
}: {
  reading: CommercialReading
  cycle_state: StatefulCommercialState
  diagnostic_input: CompanionDiagnosticInput
  // Instante em que o vendedor está olhando a venda. O snapshot comercial
  // pode ter sido calculado antes; o silêncio desde então é evidência.
  evaluated_at?: string | null
  operational_context?:
    CommercialTemporalOperationalContext | null
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

  const temporalContext =
    buildCommercialTemporalContext({
      diagnostic_input,
      trace:
        sellerExecutionTrace,
      evaluated_at,
      operational:
        operational_context,
    })

  const sequenceMethodAssessment =
    buildSellerSequenceMethodAssessment({
      reading,
      diagnostic_input,
      trace:
        sellerExecutionTrace,
      temporal:
        temporalContext,
    })

  // Sinais da leitura persistida que descrevem um momento que o tempo já
  // superou não podem continuar puxando a decisão: uma intenção antiga não
  // é "intenção quente" nem "fechamento explícito" até ser reconfirmada.
  const readingSignals =
    temporalContext.reactivation
      .requalify_before_continuing ||
    temporalContext.reactivation
      .mode === 'respect_closure'
      ? situation.signals.filter(
          signal =>
            signal !==
              'explicit_close_intent' &&
            signal !==
              'customer_intent_hot' &&
            signal !==
              'waiting_on_customer',
        )
      : situation.signals

  const techniqueContext =
    buildCommercialTechniqueContext({
      reading,
      diagnostic_input,
      trace:
        sellerExecutionTrace,
      sequence_method:
        sequenceMethodAssessment,
      reading_signals:
        readingSignals,
      reading_situations:
        situation.situations,
      temporal:
        temporalContext,
    })

  const staleIntent =
    temporalContext.reactivation
      .requalify_before_continuing

  const combinedSituation = {
    situations:
      unique([
        ...situation.situations,
        ...sequenceMethodAssessment
          .situations,
        ...temporalContext
          .situations,
      ]),
    signals:
      unique([
        ...readingSignals,
        ...sequenceMethodAssessment
          .signals
          .filter(
            signal =>
              !staleIntent ||
              signal !==
                'customer_intent_hot',
          ),
        ...techniqueContext
          .supplemental_signals,
        ...temporalContext
          .signals,
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

  // Prioriza sobre TODAS as técnicas aplicáveis e só depois corta: uma
  // técnica exigida pelo momento (ex.: reativação) não pode ser descartada
  // por ranking de palavras antes da prioridade comercial ser aplicada.
  const selectedTechniques =
    prioritizeSelectedTechniques({
      techniques:
        selectTechniques(
          techniqueSelection
            .selected_ranked,
          Number.POSITIVE_INFINITY,
        ),
      situations:
        combinedSituation.situations,
      signals:
        combinedSituation.signals,
      techniqueContext,
      temporal:
        temporalContext,
    }).slice(
      0,
      MAX_TECHNIQUES,
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

  const rawDecision =
    status === 'silent'
      ? 'no_intervention'
      : decisionForTechnique(
          selectedTechniques[0],
        ) ??
        reading.best_approach.decision

  const decision =
    status === 'silent'
      ? rawDecision
      : temporalDecisionGuard({
          decision:
            rawDecision,
          temporal:
            temporalContext,
        })

  const decisionReason =
    status === 'silent'
      ? 'A sessão atual não autoriza intervenção comercial.'
      : buildDecisionReason({
          reading,
          sequenceMethodAssessment,
          selectedTechniques,
          temporal:
            temporalContext,
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
        temporal:
          status === 'silent'
            ? null
            : temporalContext,
      }),

    objective_now:
      status === 'silent'
        ? 'Preservar o contexto sem forçar avanço comercial.'
        : inferObjectiveNow({
            reading,
            sequenceMethodAssessment,
            selectedTechniques,
            temporal:
              temporalContext,
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

    temporal_context:
      temporalContext,
  }
}
