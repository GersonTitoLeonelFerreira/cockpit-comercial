import {
  COMMERCIAL_NATURALNESS_CRITIC_CONTRACT_VERSION,
  CRITIC_DIMENSION_WEIGHTS,
  CRITIC_THRESHOLDS,
  type CandidateCriticStatusV1,
  type CandidateCritiqueV1,
  type CriticDimensionScoresV1,
  type CriticDimensionV1,
  type CriticInputV1,
  type CriticIssueCodeV1,
  type CriticIssueSeverityV1,
  type CriticIssueV1,
  type CriticResultV1,
} from './critic-contracts'

import type {
  MessageCandidateV1,
} from './message-candidate'

import type {
  MessagePlanContentRequirementV1,
  MessagePlanFactRequirementV1,
  MessagePlanV1,
} from './message-plan'

import {
  inferSellerRequestedMoveV1,
} from './commercial-strategy'

const ARTIFICIAL_PATTERNS = [
  /\bentendo perfeitamente (?:sua|a sua) colocacao\b/u,
  /\bcompreendo (?:seu|o seu) ponto e gostaria de esclarecer\b/u,
  /\bconforme mencionado anteriormente\b/u,
  /\bfico a disposicao para quaisquer esclarecimentos\b/u,
  /\bsera um prazer auxilia lo\b/u,
] as const

const BOILERPLATE_PATTERNS = [
  /\bespero que esteja bem\b/u,
  /\bagredeco o contato\b/u,
  /\bagradeco (?:o|seu) contato\b/u,
  /\bfico a disposicao\b/u,
  /\bquaisquer esclarecimentos\b/u,
  /\bqualquer duvida\b/u,
  /\bsera um prazer\b/u,
  /\bconforme mencionado anteriormente\b/u,
] as const

const GENERIC_PATTERNS = [
  /\btemos uma solucao\b/u,
  /\bpode fazer sentido para voce\b/u,
  /\bpodemos conversar melhor\b/u,
  /\bpodemos falar melhor\b/u,
  /\bquer saber mais\b/u,
  /\bo que voce acha\b/u,
  /\bcomo posso ajudar\b/u,
  /\bse fizer sentido podemos conversar\b/u,
  /\bo que voce precisa confirmar agora\b/u,
  /\bo que voce precisa confirmar neste momento\b/u,
] as const

const CORPORATE_PATTERNS = [
  /\bsinergia\b/u,
  /\bsolucao robusta\b/u,
  /\bsolucao customizada\b/u,
  /\bmaximizar resultados\b/u,
  /\botimizar sua jornada\b/u,
  /\balavancar resultados\b/u,
  /\becossistema\b/u,
  /\bproposta de valor\b/u,
] as const

const FORMAL_MARKERS = [
  /\bprezado\b/u,
  /\bprezada\b/u,
  /\bcompreendo\b/u,
  /\bgostaria\b/u,
  /\bpermaneço\b/u,
  /\bpermanco\b/u,
  /\bquaisquer\b/u,
  /\besclarecimentos\b/u,
] as const

const INFORMAL_MARKERS = [
  /\bvc\b/u,
  /\bta\b/u,
  /\bbeleza\b/u,
  /\btranquilo\b/u,
  /\btranquila\b/u,
  /\bpra\b/u,
  /\bvaleu\b/u,
] as const

const QUESTION_GENERIC_PATTERNS = [
  /\bo que voce acha\b/u,
  /\bfaz sentido\b/u,
  /\bquer saber mais\b/u,
  /\bpodemos conversar\b/u,
  /\bpodemos falar melhor\b/u,
  /\bquer conversar melhor\b/u,
  /\bo que voce precisa confirmar agora\b/u,
  /\bo que voce precisa confirmar neste momento\b/u,
] as const

const STOPWORDS = new Set([
  'para', 'com', 'que', 'isso', 'essa', 'esse', 'uma', 'mais', 'voce',
  'como', 'seu', 'sua', 'pelo', 'pela', 'por', 'dos', 'das', 'nos', 'nas',
  'sem', 'tem', 'esta', 'estao', 'pode', 'podemos', 'agora', 'ainda',
])

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9?!\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function plainNormalize(value: string): string {
  return normalize(value)
    .replace(/[?!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function words(value: string): string[] {
  return plainNormalize(value)
    .split(/\s+/u)
    .filter(Boolean)
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function matchesAny(
  value: string,
  patterns: readonly RegExp[],
): boolean {
  const normalized = plainNormalize(value)
  return patterns.some(pattern => pattern.test(normalized))
}

function matchCount(
  value: string,
  patterns: readonly RegExp[],
): number {
  const normalized = plainNormalize(value)
  return patterns.reduce(
    (count, pattern) => count + (pattern.test(normalized) ? 1 : 0),
    0,
  )
}

function issue(
  code: CriticIssueCodeV1,
  dimension: CriticDimensionV1,
  detail: string,
  severity: CriticIssueSeverityV1 = 'moderate',
): CriticIssueV1 {
  return {
    code,
    dimension,
    severity,
    detail,
  }
}

function uniqueIssues(
  issues: readonly CriticIssueV1[],
): CriticIssueV1[] {
  const byKey = new Map<string, CriticIssueV1>()

  for (const item of issues) {
    const key = [
      item.code,
      item.dimension,
      item.severity,
      item.detail,
    ].join('|')

    if (!byKey.has(key)) {
      byKey.set(key, item)
    }
  }

  return [...byKey.values()].sort(
    (left, right) =>
      left.dimension.localeCompare(right.dimension) ||
      left.code.localeCompare(right.code) ||
      left.detail.localeCompare(right.detail),
  )
}

function valueStrings(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()]
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return [String(value)]
  }

  if (Array.isArray(value)) {
    return value.flatMap(valueStrings)
  }

  if (
    value !== null &&
    typeof value === 'object'
  ) {
    return Object.values(value).flatMap(valueStrings)
  }

  return []
}

function semanticTokens(value: string): string[] {
  return plainNormalize(value)
    .split(/\s+/u)
    .filter(
      token =>
        token.length >= 4 &&
        !STOPWORDS.has(token),
    )
    .map(token =>
      token.length >= 7
        ? token.slice(0, 7)
        : token,
    )
}

function semanticOverlap(
  text: string,
  source: string,
): number {
  const sourceTokens =
    new Set(semanticTokens(source))
  const textTokens =
    new Set(semanticTokens(text))

  if (sourceTokens.size === 0) {
    return 0
  }

  let matches = 0

  for (const token of sourceTokens) {
    if (textTokens.has(token)) {
      matches += 1
    }
  }

  return matches / sourceTokens.size
}

function factAnchorCount(
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
): number {
  const used = new Set(
    candidate.fact_requirements_used,
  )

  return plan.fact_requirements
    .filter(requirement =>
      used.has(requirement.requirement_key),
    )
    .filter(requirement =>
      factRequirementAnchored(
        candidate.text,
        requirement,
      ),
    )
    .length
}

function factRequirementAnchored(
  text: string,
  requirement: MessagePlanFactRequirementV1,
): boolean {
  const normalizedText = plainNormalize(text)

  if (
    requirement.assertion_policy ===
      'describe_constraint_only'
  ) {
    return /\b(?:cotacao|confirmar|confirmacao|depende|calculad|verific)\b/u.test(
      normalizedText,
    )
  }

  const values = valueStrings(
    requirement.value,
  ).filter(value => {
    const normalized = plainNormalize(value)
    return (
      normalized.length >= 4 &&
      !/^\d+(?:[.,]\d+)?$/u.test(
        normalized,
      )
    )
  })

  return values.some(value =>
    normalizedText.includes(
      plainNormalize(value),
    ) ||
    semanticOverlap(text, value) >= 0.6,
  )
}

function requirementIsAnchored(
  requirement: MessagePlanContentRequirementV1,
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
): boolean {
  const text = plainNormalize(
    candidate.text,
  )
  const hasQuestion =
    candidate.text.includes('?')
  const facts = factAnchorCount(
    plan,
    candidate,
  )

  switch (requirement) {
    case 'acknowledge_customer_point':
      return /\b(?:entendi|entendo|compreendo|faz sentido|seu ponto|esse ponto)\b/u.test(text)

    case 'answer_requested_information':
      return facts > 0

    case 'explain_quote_requirement':
      return /\b(?:cotacao|confirmar|confirmacao|depende|calculad|verific)\b/u.test(text)

    case 'surface_verified_difference':
      return (
        facts > 0 ||
        /\b(?:diferenc|inclui|incluido|incluida|vantagem|confirmad)\b/u.test(text)
      )

    case 'address_objection':
      return /\b(?:pesando|pesou|duvida|preocup|questao|percepcao)\b/u.test(text)

    case 'clarify_missing_information':
      return hasQuestion

    case 'confirm_decision_criterion':
      return /\b(?:pesa|pesando|importante|prioridade|criterio|escolha|decisao)\b/u.test(text)

    case 'reduce_decision_risk':
      return /\b(?:segur|confirmad|supos|risco|decisao|certeza)\b/u.test(text)

    case 'recover_process':
      return /\b(?:retomar|pendente|continuar|retomamos|ponto que ficou)\b/u.test(text)

    case 'propose_next_step':
      return /\b(?:proxima etapa|seguir|avancar|agendar|marcar|proximo passo)\b/u.test(text)

    case 'confirm_commitment':
      return /\b(?:combinad|confirm|seguimos|seguir com|fechado|recebi|recebimento)\b/u.test(text)

    case 'respect_customer_timing':
      return /\b(?:sem problema|seu tempo|com calma|quando fizer sentido|quando voce puder|respeito)\b/u.test(text)

    case 'close_without_pressure':
      return /\b(?:obrigad|agradeco|combinado|sem pressa|tudo certo)\b/u.test(text)

    case 'acknowledge_non_commercial':
      return /\b(?:certo|entendi|compreendi|claro|beleza|tranquilo)\b/u.test(text)
  }
}

function anchoringRatio(
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
): number {
  if (
    plan.content_requirements.length === 0
  ) {
    return 1
  }

  const anchored =
    plan.content_requirements.filter(
      requirement =>
        requirementIsAnchored(
          requirement,
          plan,
          candidate,
        ),
    ).length

  return anchored /
    plan.content_requirements.length
}

function repeatedLanguage(
  text: string,
): boolean {
  const normalized = plainNormalize(text)
  const acknowledgmentHits = [
    /\bentendi\b/gu,
    /\bentendo\b/gu,
    /\bcompreendo\b/gu,
  ].reduce(
    (total, pattern) =>
      total +
      (normalized.match(pattern)?.length ?? 0),
    0,
  )

  const possoHits =
    normalized.match(/\bposso\b/gu)?.length ?? 0

  return (
    acknowledgmentHits >= 2 ||
    possoHits >= 2
  )
}

function sentenceWordCounts(
  text: string,
): number[] {
  return text
    .split(/[.!?]+/u)
    .map(sentence => words(sentence).length)
    .filter(count => count > 0)
}

function genericQuestion(
  text: string,
): boolean {
  const questions = text
    .split(/(?<=\?)/u)
    .filter(part => part.includes('?'))
    .map(part => normalize(part))

  return questions.some(question =>
    QUESTION_GENERIC_PATTERNS.some(
      pattern => pattern.test(question),
    ),
  )
}

function sellerIntentRequestsClarification(
  plan: MessagePlanV1,
): boolean {
  const intent =
    plainNormalize(
      plan.seller_intent.value,
    )

  return [
    'perguntar',
    'clarificar',
    'esclarecer',
    'entender melhor',
    'descobrir',
    'pedir contexto',
    'pedir informacao',
    'confirmar com o cliente se',
    'confirmar com a cliente se',
    'perguntar ao cliente se',
    'perguntar para o cliente se',
  ].some(term =>
    intent.includes(term),
  )
}

function sellerIntentConfirmationTarget(
  plan: MessagePlanV1,
): string | null {
  const raw =
    plan.seller_intent.value
      .trim()

  const match =
    raw.match(
      /^confirmar com (?:o|a) cliente se\s+(.+)$/iu,
    ) ??
    raw.match(
      /^perguntar (?:ao|para o|à|a) cliente se\s+(.+)$/iu,
    )

  return match?.[1]
    ?.trim()
    .replace(/[.!?]+$/u, '') ??
    null
}

function sellerIntentQuestionAligned(
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
): boolean {
  const target =
    sellerIntentConfirmationTarget(
      plan,
    )

  return (
    target !== null &&
    candidate.question_count === 1 &&
    semanticOverlap(
      candidate.text,
      target,
    ) >= 0.65
  )
}

function sellerIntentIssues(
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
): CriticIssueV1[] {
  const issues: CriticIssueV1[] = []
  const requestedMove =
    inferSellerRequestedMoveV1(
      plan.seller_intent.value,
    )

  if (
    requestedMove &&
    plan.commercial_move.source ===
      'seller_request' &&
    candidate.commercial_move !==
      requestedMove
  ) {
    issues.push(issue(
      'SELLER_INTENT_MISMATCH',
      'commercial_coherence',
      'A candidate executa um movimento diferente do pedido explícito do vendedor.',
      'major',
    ))
  }

  if (
    (
      plan.question_plan.purpose ===
        'clarify_request' ||
      plan.question_plan.purpose ===
        'obtain_context'
    ) &&
    candidate.question_count > 0 &&
    !sellerIntentRequestsClarification(
      plan,
    )
  ) {
    issues.push(issue(
      'SELLER_INTENT_MISMATCH',
      'commercial_coherence',
      'A candidate devolve uma pergunta de contexto embora o vendedor não tenha pedido clarificação.',
      'major',
    ))
  }

  if (
    requestedMove ===
      'no_commercial_move' &&
    plan.situation.situation ===
      'non_commercial' &&
    /\b(?:decisao|duvida|avancar|solucao|proxima etapa|contrat|preco)\b/u.test(
      plainNormalize(
        candidate.text,
      ),
    )
  ) {
    issues.push(issue(
      'SELLER_INTENT_MISMATCH',
      'commercial_coherence',
      'A candidate introduz condução comercial em uma intenção explicitamente relacional ou casual.',
      'major',
    ))
  }

  return issues
}

function questionPurposeAligned(
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
): boolean {
  if (!candidate.text.includes('?')) {
    return false
  }

  const text = plainNormalize(
    candidate.text,
  )

  switch (plan.question_plan.purpose) {
    case 'none':
      return true

    case 'clarify_request':
    case 'obtain_context':
      return (
        sellerIntentQuestionAligned(
          plan,
          candidate,
        ) ||
        /\b(?:precisa|confirmar|agora|ponto|contexto|entender)\b/u.test(text)
      )

    case 'clarify_missing_information': {
      const required =
        plan.question_plan.required_information.filter(
          item =>
            !plan.question_plan.known_information_skipped.includes(
              item,
            ),
        )

      if (required.length === 0) {
        return true
      }

      const cueMap: Record<string, RegExp> = {
        objective: /\b(?:objetivo|alcancar|conseguir)\b/u,
        problem: /\b(?:problema|situacao|resolver)\b/u,
        impact: /\b(?:impacto|afeta|consequencia)\b/u,
        need: /\b(?:precisa|necessidade|resolver)\b/u,
        budget: /\b(?:orcamento|investimento|faixa|valor)\b/u,
        timeline: /\b(?:prazo|quando|tempo)\b/u,
        decision_maker: /\b(?:quem|decisao|participa)\b/u,
        priority: /\b(?:prioridade|principal|mais importante)\b/u,
        decision_criteria: /\b(?:pesa|criterio|escolha|importante)\b/u,
        current_process: /\b(?:hoje|atualmente|faz isso|processo)\b/u,
        product_fit: /\b(?:solucao|atenda|precisa)\b/u,
        other: /\b(?:falta|esclarecer|duvida)\b/u,
      }

      return required.some(item =>
        cueMap[item]?.test(text) ??
        semanticTokens(item).some(
          token => text.includes(token),
        ),
      )
    }

    case 'isolate_objection':
      return /\b(?:pesou|pesando|ponto|duvida|preocup|percepcao)\b/u.test(text)

    case 'confirm_decision_criterion':
      return /\b(?:pesa|criterio|prioridade|importante|escolha|prazo|investimento)\b/u.test(text)

    case 'reduce_uncertainty':
      return /\b(?:duvida|incerteza|falta|seguranca|deixando)\b/u.test(text)
  }

  return false
}

function scoreCommercialCoherence(
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
): {
  score: number
  issues: CriticIssueV1[]
} {
  let score = 94
  const issues: CriticIssueV1[] = []
  const ratio = anchoringRatio(
    plan,
    candidate,
  )
  const text = plainNormalize(
    candidate.text,
  )

  if (
    plan.content_requirements.length > 0 &&
    ratio === 0
  ) {
    score -= 38
    issues.push(issue(
      'WEAK_COMMERCIAL_EXECUTION',
      'commercial_coherence',
      'O texto não materializa de forma perceptível os requisitos comerciais do plano.',
      'major',
    ))
  } else if (ratio < 0.5) {
    score -= 25
    issues.push(issue(
      'WEAK_COMMERCIAL_EXECUTION',
      'commercial_coherence',
      'O texto executa apenas uma parte pequena do movimento comercial planejado.',
      'major',
    ))
  } else if (ratio < 0.8) {
    score -= 10
    issues.push(issue(
      'WEAK_COMMERCIAL_EXECUTION',
      'commercial_coherence',
      'A execução comercial é válida, mas parte do movimento permanece pouco perceptível no texto.',
      'moderate',
    ))
  }

  if (
    plan.content_requirements.includes(
      'acknowledge_customer_point',
    ) &&
    /^(?:entendi|entendo|compreendo)[.!]?$/u.test(
      normalize(candidate.text),
    ) &&
    plan.content_requirements.length > 1
  ) {
    score -= 18
    issues.push(issue(
      'WEAK_ACKNOWLEDGEMENT',
      'commercial_coherence',
      'O reconhecimento do ponto do cliente é correto, mas sozinho não sustenta o restante do movimento planejado.',
    ))
  }

  if (
    plan.content_requirements.includes(
      'address_objection',
    ) &&
    !requirementIsAnchored(
      'address_objection',
      plan,
      candidate,
    )
  ) {
    score -= 18
    issues.push(issue(
      'WEAK_COMMERCIAL_EXECUTION',
      'commercial_coherence',
      'A mensagem reconhece a objeção, mas não a trabalha de forma suficiente para executar o movimento planejado.',
      'major',
    ))
  }

  if (
    (
      plan.situation.situation === 'objection' ||
      [
        'isolate_objection',
        'resolve_objection',
      ].includes(plan.commercial_move.move)
    ) &&
    matchesAny(candidate.text, GENERIC_PATTERNS)
  ) {
    score -= 18
    issues.push(issue(
      'GENERIC_OBJECTION_HANDLING',
      'commercial_coherence',
      'A objeção recebe uma resposta genérica em vez de uma condução ligada ao ponto comercial atual.',
      'major',
    ))
  }

  if (
    plan.commercial_move.move ===
      'respect_customer_timing' &&
    !/\b(?:sem problema|seu tempo|com calma|quando fizer sentido|respeito)\b/u.test(
      text,
    )
  ) {
    score -= 14
  }

  if (
    plan.commercial_move.move ===
      'close_conversation' &&
    !/\b(?:obrigad|agradeco|combinado|tudo certo)\b/u.test(
      text,
    )
  ) {
    score -= 14
  }

  if (
    plan.response_mode === 'ask' &&
    plan.question_plan.should_ask &&
    !candidate.text.includes('?')
  ) {
    score -= 15
  }

  const intentIssues =
    sellerIntentIssues(
      plan,
      candidate,
    )

  if (intentIssues.length > 0) {
    score -= 45
    issues.push(
      ...intentIssues,
    )
  }

  return {
    score: clamp(score),
    issues,
  }
}

function scoreNaturalness(
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
): {
  score: number
  issues: CriticIssueV1[]
} {
  let score = 94
  const issues: CriticIssueV1[] = []
  const artificial = matchCount(
    candidate.text,
    ARTIFICIAL_PATTERNS,
  )
  const boilerplate = matchCount(
    candidate.text,
    BOILERPLATE_PATTERNS,
  )
  const corporate = matchCount(
    candidate.text,
    CORPORATE_PATTERNS,
  )

  if (artificial > 0) {
    score -= Math.min(42, artificial * 18)
    issues.push(issue(
      'ROBOTIC_LANGUAGE',
      'naturalness',
      'Há formulação com aparência de template ou linguagem artificial para uma conversa comercial.',
      artificial >= 2 ? 'major' : 'moderate',
    ))
  }

  if (boilerplate > 0) {
    const wordCount = words(
      candidate.text,
    ).length
    const penalty =
      wordCount <= 18
        ? 24
        : Math.min(28, boilerplate * 10)

    score -= penalty
    issues.push(issue(
      'BOILERPLATE_DOMINATES',
      'naturalness',
      'Frases de cortesia/template ocupam espaço relevante sem acrescentar contexto comercial.',
      wordCount <= 18 ? 'major' : 'moderate',
    ))
  }

  if (repeatedLanguage(candidate.text)) {
    score -= 20
    issues.push(issue(
      'REPETITIVE_LANGUAGE',
      'naturalness',
      'A repetição de construções próximas torna a mensagem mecânica.',
      'major',
    ))
  }

  if (corporate > 0) {
    score -= Math.min(24, corporate * 12)
    issues.push(issue(
      'EXCESSIVE_CORPORATE_LANGUAGE',
      'naturalness',
      'A linguagem customer-facing está mais corporativa do que uma conversa comercial precisa ser.',
    ))
  }

  if (
    plan.communication_style.formality !== 'formal' &&
    matchCount(
      candidate.text,
      FORMAL_MARKERS,
    ) >= 3
  ) {
    score -= 12
  }

  return {
    score: clamp(score),
    issues,
  }
}

function scoreSpecificity(
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
): {
  score: number
  issues: CriticIssueV1[]
} {
  let score = 58
  const issues: CriticIssueV1[] = []
  const ratio = anchoringRatio(
    plan,
    candidate,
  )
  const usedFacts =
    candidate.fact_requirements_used.length
  const anchoredFacts = factAnchorCount(
    plan,
    candidate,
  )
  const generic = matchCount(
    candidate.text,
    GENERIC_PATTERNS,
  )

  score += ratio * 24

  if (usedFacts > 0) {
    score +=
      anchoredFacts > 0
        ? Math.min(14, anchoredFacts * 8)
        : 2
  }

  if (
    candidate.text.includes('?') &&
    questionPurposeAligned(
      plan,
      candidate,
    )
  ) {
    score += 7
  }

  if (generic > 0) {
    score -= Math.min(38, generic * 20)
    issues.push(issue(
      'GENERIC_RESPONSE',
      'specificity',
      'A mensagem contém formulação reutilizável em muitos contextos sem ancoragem comercial suficiente.',
      generic >= 2 ? 'major' : 'moderate',
    ))
  }

  if (
    plan.content_requirements.length >= 2 &&
    ratio < 0.5
  ) {
    score -= 14
    issues.push(issue(
      'WEAK_CONTEXT_ANCHORING',
      'specificity',
      'A candidate se conecta pouco aos requisitos contextuais já presentes no MessagePlan.',
      'major',
    ))
  }

  if (
    words(candidate.text).length <= 5 &&
    plan.content_requirements.length >= 2
  ) {
    score -= 12
  }

  return {
    score: clamp(score),
    issues,
  }
}

function scoreClarity(
  candidate: MessageCandidateV1,
): {
  score: number
  issues: CriticIssueV1[]
} {
  let score = 96
  const issues: CriticIssueV1[] = []
  const counts = sentenceWordCounts(
    candidate.text,
  )
  const longest =
    counts.length > 0
      ? Math.max(...counts)
      : 0
  const total = words(candidate.text).length

  if (longest > 42) {
    score -= 32
  } else if (longest > 30) {
    score -= 18
  } else if (longest > 24) {
    score -= 8
  }

  if (total > 150) {
    score -= 18
  } else if (total > 110) {
    score -= 8
  }

  const conditionals =
    plainNormalize(candidate.text)
      .match(/\bse\b/gu)?.length ?? 0

  if (conditionals >= 4) {
    score -= 12
  }

  if (score < 80) {
    issues.push(issue(
      'CLARITY_LOW',
      'clarity',
      'A leitura exige mais esforço do que o necessário por comprimento ou encadeamento de ideias.',
      score < 65 ? 'major' : 'moderate',
    ))
  }

  return {
    score: clamp(score),
    issues,
  }
}

function scoreConcision(
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
): {
  score: number
  issues: CriticIssueV1[]
} {
  const count = words(candidate.text).length
  let score = 95
  const issues: CriticIssueV1[] = []

  if (
    plan.communication_style.target_length ===
      'short'
  ) {
    if (count > 70) {
      score = 35
    } else if (count > 50) {
      score = 55
    } else if (count > 35) {
      score = 78
    }

    if (
      count < 6 &&
      plan.content_requirements.length >= 2
    ) {
      score = Math.min(score, 62)
      issues.push(issue(
        'UNDERDEVELOPED_FOR_TARGET',
        'concision',
        'A mensagem ficou curta a ponto de enfraquecer requisitos comerciais que precisam aparecer.',
      ))
    }
  } else if (
    plan.communication_style.target_length ===
      'medium'
  ) {
    if (count > 120) {
      score = 58
    } else if (count > 90) {
      score = 76
    } else if (
      count < 5 &&
      plan.content_requirements.length >= 2
    ) {
      score = 62
    }
  } else {
    if (count > 180) {
      score = 68
    } else if (
      count < 12 &&
      plan.content_requirements.length >= 2
    ) {
      score = 68
      issues.push(issue(
        'UNDERDEVELOPED_FOR_TARGET',
        'concision',
        'O plano permite desenvolvimento maior, mas a candidate ficou curta para o conteúdo necessário.',
        'minor',
      ))
    }
  }

  if (score < 80 && count > 35) {
    issues.push(issue(
      'OVERLONG_FOR_TARGET',
      'concision',
      `A candidate possui ${count} palavras e excede o comprimento planejado (${plan.communication_style.target_length}).`,
      score < 60 ? 'major' : 'moderate',
    ))
  }

  return {
    score: clamp(score),
    issues,
  }
}

function scoreQuestionQuality(
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
): {
  score: number | null
  issues: CriticIssueV1[]
} {
  if (
    !plan.question_plan.should_ask ||
    plan.question_plan.max_questions === 0 ||
    !candidate.text.includes('?')
  ) {
    return {
      score: null,
      issues: [],
    }
  }

  let score = 94
  const issues: CriticIssueV1[] = []

  if (genericQuestion(candidate.text)) {
    score -= 38
    issues.push(issue(
      'VAGUE_QUESTION',
      'question_quality',
      'A pergunta é válida, mas genérica demais para o propósito de descoberta/clarificação definido no plano.',
      'major',
    ))
  }

  if (
    !questionPurposeAligned(
      plan,
      candidate,
    )
  ) {
    score -= 28
    issues.push(issue(
      'QUESTION_PURPOSE_MISMATCH',
      'question_quality',
      'A pergunta não demonstra conexão suficiente com o propósito ou informação exigida pelo QuestionPlan.',
      'major',
    ))
  }

  const questionParts = candidate.text
    .split(/(?<=\?)/u)
    .filter(part => part.includes('?'))

  if (
    questionParts.some(part =>
      words(part).length > 24,
    )
  ) {
    score -= 12
  }

  return {
    score: clamp(score),
    issues,
  }
}

function scoreNextStep(
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
  questionScore: number | null,
): {
  score: number | null
  issues: CriticIssueV1[]
} {
  const kind = plan.next_step_plan.kind
  const text = plainNormalize(
    candidate.text,
  )
  const issues: CriticIssueV1[] = []

  if (
    [
      'none',
      'answer_and_wait',
    ].includes(kind)
  ) {
    return {
      score: null,
      issues,
    }
  }

  if (
    ['ask', 'clarify'].includes(kind)
  ) {
    return {
      score: questionScore ?? 78,
      issues,
    }
  }

  let score = 90

  if (kind === 'propose_next_step') {
    const concrete = /\b(?:proxima etapa|proximo passo|agendar|marcar|seguir para)\b/u.test(text)
    const generic = /\b(?:vamos avancar|podemos avancar|vamos seguir)\b/u.test(text)

    if (!concrete || generic) {
      score -= generic ? 28 : 18
      issues.push(issue(
        'GENERIC_NEXT_STEP',
        'next_step_fit',
        'O próximo passo é permitido, mas está formulado de modo genérico e pouco acionável.',
        generic ? 'major' : 'moderate',
      ))
    }
  }

  if (
    kind === 'confirm_commitment' &&
    !/\b(?:combinad|confirm|seguimos|seguir com|fechado)\b/u.test(text)
  ) {
    score -= 18
  }

  if (
    kind === 'respect_timing' &&
    !/\b(?:sem problema|seu tempo|com calma|quando fizer sentido|respeito)\b/u.test(text)
  ) {
    score -= 18
    issues.push(issue(
      'TIMING_RESPONSE_STIFF',
      'next_step_fit',
      'A resposta respeita estruturalmente o timing, mas não o comunica de forma natural e perceptível.',
    ))
  }

  if (
    kind === 'give_space' &&
    !/\b(?:com calma|fique a vontade|quando fizer sentido|seu tempo)\b/u.test(text)
  ) {
    score -= 14
  }

  if (kind === 'close') {
    const naturalClose = /\b(?:obrigad|agradeco|combinado|tudo certo)\b/u.test(text)
    if (!naturalClose) {
      score -= 18
      issues.push(issue(
        'REJECTION_STIFF',
        'next_step_fit',
        'O encerramento é estruturalmente correto, mas pouco humano para uma rejeição.',
      ))
    }
  }

  return {
    score: clamp(score),
    issues,
  }
}

function scoreCommunicationFit(
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
): {
  score: number
  issues: CriticIssueV1[]
} {
  let score = 94
  const issues: CriticIssueV1[] = []
  const wordCount = words(candidate.text).length
  const text = plainNormalize(candidate.text)

  if (
    plan.communication_style.directness ===
      'direct' &&
    (
      wordCount > 55 ||
      matchCount(
        candidate.text,
        BOILERPLATE_PATTERNS,
      ) >= 1
    )
  ) {
    score -= 22
    issues.push(issue(
      'INDIRECT_FOR_DIRECT_STYLE',
      'communication_fit',
      'O plano pede comunicação direta, mas a candidate adiciona rodeio ou abertura desnecessária.',
      'moderate',
    ))
  }

  const formality =
    plan.communication_style.formality

  if (
    formality === 'formal' &&
    matchesAny(candidate.text, INFORMAL_MARKERS)
  ) {
    score -= 24
    issues.push(issue(
      'FORMALITY_MISMATCH',
      'communication_fit',
      'A linguagem está informal de forma clara para um plano que pede formalidade.',
      'major',
    ))
  }

  if (
    formality === 'informal' &&
    matchCount(
      candidate.text,
      FORMAL_MARKERS,
    ) >= 2
  ) {
    score -= 18
    issues.push(issue(
      'FORMALITY_MISMATCH',
      'communication_fit',
      'A linguagem ficou formal demais para a política de comunicação do plano.',
      'moderate',
    ))
  }

  if (
    plan.communication_style.paragraph_density ===
      'compact' &&
    candidate.text.split(/\n\s*\n/u).length >= 4
  ) {
    score -= 10
  }

  if (
    plan.communication_style.emoji_policy === 'none' &&
    /[😀-🙏🌀-🫿]/u.test(candidate.text)
  ) {
    score -= 12
  }

  // greeting_policy e closing_policy podem pedir preservação do seller sem
  // carregar o padrão textual observado. A ausência desse dado não gera
  // penalidade nem tentativa de inferência nesta camada.
  void text

  return {
    score: clamp(score),
    issues,
  }
}

function weightedOverall(
  dimensions: CriticDimensionScoresV1,
): number {
  let weighted = 0
  let activeWeight = 0

  for (
    const [dimension, weight] of
    Object.entries(
      CRITIC_DIMENSION_WEIGHTS,
    ) as Array<[CriticDimensionV1, number]>
  ) {
    const score = dimensions[dimension]

    if (score === null) {
      continue
    }

    weighted += score * weight
    activeWeight += weight
  }

  if (activeWeight === 0) {
    return 0
  }

  return clamp(weighted / activeWeight)
}

function statusForScore(
  score: number,
): CandidateCriticStatusV1 {
  if (
    score >= CRITIC_THRESHOLDS.recommended
  ) {
    return 'recommended'
  }

  if (
    score >= CRITIC_THRESHOLDS.acceptable
  ) {
    return 'acceptable'
  }

  return 'weak'
}

function strengthsFor(
  dimensions: CriticDimensionScoresV1,
): string[] {
  const strengths: string[] = []

  if (
    (dimensions.commercial_coherence ?? 0) >=
      88
  ) {
    strengths.push(
      'Executa de forma clara o movimento comercial planejado.',
    )
  }

  if (
    (dimensions.naturalness ?? 0) >= 88
  ) {
    strengths.push(
      'A linguagem é natural e utilizável em conversa real.',
    )
  }

  if (
    (dimensions.specificity ?? 0) >= 84
  ) {
    strengths.push(
      'A resposta está ancorada no contexto comercial disponível.',
    )
  }

  if (
    (dimensions.clarity ?? 0) >= 90
  ) {
    strengths.push(
      'A mensagem é rápida de compreender e tem progressão clara.',
    )
  }

  if (
    dimensions.question_quality !== null &&
    dimensions.question_quality >= 88
  ) {
    strengths.push(
      'A pergunta tem propósito e ajuda a conversa a avançar.',
    )
  }

  if (
    dimensions.next_step_fit !== null &&
    dimensions.next_step_fit >= 88
  ) {
    strengths.push(
      'O próximo passo está coerente com o momento comercial.',
    )
  }

  return strengths
}

function critiqueCandidate(
  plan: MessagePlanV1,
  candidate: MessageCandidateV1,
): CandidateCritiqueV1 {
  const commercial =
    scoreCommercialCoherence(
      plan,
      candidate,
    )
  const naturalness =
    scoreNaturalness(
      plan,
      candidate,
    )
  const specificity =
    scoreSpecificity(
      plan,
      candidate,
    )
  const clarity = scoreClarity(candidate)
  const concision = scoreConcision(
    plan,
    candidate,
  )
  const question = scoreQuestionQuality(
    plan,
    candidate,
  )
  const nextStep = scoreNextStep(
    plan,
    candidate,
    question.score,
  )
  const communication =
    scoreCommunicationFit(
      plan,
      candidate,
    )

  const dimensions: CriticDimensionScoresV1 = {
    commercial_coherence:
      commercial.score,
    naturalness: naturalness.score,
    specificity: specificity.score,
    clarity: clarity.score,
    concision: concision.score,
    question_quality: question.score,
    next_step_fit: nextStep.score,
    communication_fit:
      communication.score,
  }

  const overall = weightedOverall(
    dimensions,
  )

  const issues =
    uniqueIssues([
      ...commercial.issues,
      ...naturalness.issues,
      ...specificity.issues,
      ...clarity.issues,
      ...concision.issues,
      ...question.issues,
      ...nextStep.issues,
      ...communication.issues,
    ])

  const sellerIntentMismatch =
    issues.some(
      item =>
        item.code ===
          'SELLER_INTENT_MISMATCH' &&
        item.severity === 'major',
    )

  return {
    candidate_id: candidate.candidate_id,
    status:
      sellerIntentMismatch
        ? 'weak'
        : statusForScore(overall),
    overall_score: overall,
    dimensions,
    strengths:
      sellerIntentMismatch
        ? []
        : strengthsFor(dimensions),
    issues,
  }
}

function emptyResult(
  status: CriticResultV1['status'],
): CriticResultV1 {
  return {
    contract_version:
      COMMERCIAL_NATURALNESS_CRITIC_CONTRACT_VERSION,
    status,
    critiques: [],
    ranked_candidate_ids: [],
    recommended_candidate_ids: [],
    acceptable_candidate_ids: [],
    weak_candidate_ids: [],
  }
}

function rankedCritiques(
  critiques: readonly CandidateCritiqueV1[],
): CandidateCritiqueV1[] {
  return [...critiques].sort(
    (left, right) =>
      right.overall_score -
        left.overall_score ||
      (right.dimensions
        .commercial_coherence ?? -1) -
        (left.dimensions
          .commercial_coherence ?? -1) ||
      (right.dimensions.naturalness ?? -1) -
        (left.dimensions.naturalness ?? -1) ||
      (right.dimensions.specificity ?? -1) -
        (left.dimensions.specificity ?? -1) ||
      left.candidate_id.localeCompare(
        right.candidate_id,
        'en',
        { numeric: true },
      ),
  )
}

export function critiqueMessageCandidatesV1(
  input: CriticInputV1,
): CriticResultV1 {
  if (
    input.hard_gate_result.status ===
      'blocked'
  ) {
    return emptyResult('blocked')
  }

  if (
    input.hard_gate_result.status ===
      'approval_required'
  ) {
    return emptyResult(
      'approval_required',
    )
  }

  const passed = new Set(
    input.hard_gate_result
      .passed_candidate_ids,
  )

  const eligible =
    input.generation_result.candidates
      .filter(candidate =>
        passed.has(candidate.candidate_id),
      )

  if (eligible.length === 0) {
    return emptyResult(
      'no_eligible_candidates',
    )
  }

  const critiques = eligible.map(candidate =>
    critiqueCandidate(
      input.message_plan,
      candidate,
    ),
  )

  const ranked = rankedCritiques(
    critiques,
  )

  return {
    contract_version:
      COMMERCIAL_NATURALNESS_CRITIC_CONTRACT_VERSION,
    status: 'evaluated',
    critiques,
    ranked_candidate_ids:
      ranked.map(
        critique =>
          critique.candidate_id,
      ),
    recommended_candidate_ids:
      ranked
        .filter(
          critique =>
            critique.status ===
              'recommended',
        )
        .map(
          critique =>
            critique.candidate_id,
        ),
    acceptable_candidate_ids:
      ranked
        .filter(
          critique =>
            critique.status ===
              'acceptable',
        )
        .map(
          critique =>
            critique.candidate_id,
        ),
    weak_candidate_ids:
      ranked
        .filter(
          critique =>
            critique.status === 'weak',
        )
        .map(
          critique =>
            critique.candidate_id,
        ),
  }
}

export function createCommercialNaturalnessCriticV1() {
  return {
    critique:
      critiqueMessageCandidatesV1,
  }
}
