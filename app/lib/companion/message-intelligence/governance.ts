import type {
  MessageContextSnapshotV1,
} from './context-snapshot'

import type {
  CommercialSituationPlaybookRuleV1,
} from './commercial-situation-playbook'

import type {
  CommercialMoveDecisionV1,
  GovernanceConstraintV1,
  GovernanceDecisionV1,
  GovernanceStatusV1,
  StrategyKnowledgeHintsV1,
} from './strategy-contracts'

function normalizeText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(
  value: string,
): string[] {
  return normalizeText(value)
    .split(' ')
    .filter(
      token => token.length >= 4,
    )
}

function semanticOverlap(
  left: string,
  right: string,
): number {
  const leftTokens =
    new Set(tokens(left))
  const rightTokens =
    new Set(tokens(right))

  if (
    leftTokens.size === 0 ||
    rightTokens.size === 0
  ) {
    return 0
  }

  let matches = 0

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      matches += 1
    }
  }

  return matches /
    Math.min(
      leftTokens.size,
      rightTokens.size,
    )
}

function matchedRule(
  intent: string,
  rules: readonly string[],
): string | null {
  const normalizedIntent =
    normalizeText(intent)

  return rules.find(rule => {
    const normalizedRule =
      normalizeText(rule)

    return (
      normalizedIntent.includes(
        normalizedRule,
      ) ||
      semanticOverlap(
        normalizedIntent,
        normalizedRule,
      ) >= 0.6
    )
  }) ?? null
}

const MANIPULATIVE_OR_DECEPTIVE_PATTERNS = [
  'minta para o cliente',
  'inventar uma condicao',
  'invente uma condicao',
  'falsa urgencia',
  'falsa escassez',
  'diga que e a ultima vaga',
  'finja que e a ultima vaga',
  'pressione ate aceitar',
  'pressionar ate aceitar',
  'explore o medo',
  'explorar o medo',
  'explore a vulnerabilidade',
  'explorar a vulnerabilidade',
  'manipule o cliente',
  'coagir o cliente',
  'ameace o cliente',
] as const

const APPROVAL_TERMS = [
  'aprovacao',
  'autorizacao',
  'alçada',
  'alcada',
  'somente gestor',
  'somente admin',
] as const

const APPROVAL_ACTION_TERMS = [
  'desconto',
  'excecao',
  'condicao especial',
  'prazo especial',
  'preco especial',
  'negociar preco',
] as const

function hasAny(
  text: string,
  terms: readonly string[],
): boolean {
  const normalized =
    normalizeText(text)

  return terms.some(
    term =>
      normalized.includes(
        normalizeText(term),
      ),
  )
}

function strongestStatus(
  statuses: GovernanceStatusV1[],
): GovernanceStatusV1 {
  const rank:
    Record<GovernanceStatusV1, number> = {
    allowed: 0,
    allowed_with_warning: 1,
    approval_required: 2,
    blocked: 3,
  }

  return [...statuses].sort(
    (left, right) =>
      rank[right] - rank[left],
  )[0] ?? 'allowed'
}

export function evaluateGovernanceDecisionV1({
  snapshot,
  commercial_move,
  hints,
  playbook_rule,
}: {
  snapshot: MessageContextSnapshotV1
  commercial_move: CommercialMoveDecisionV1
  hints: StrategyKnowledgeHintsV1 | null
  playbook_rule: CommercialSituationPlaybookRuleV1 | null
}): GovernanceDecisionV1 {
  const intent =
    snapshot.seller_intent?.value ?? ''

  const constraints:
    GovernanceConstraintV1[] = []
  const statuses:
    GovernanceStatusV1[] = []

  if (
    hasAny(
      intent,
      MANIPULATIVE_OR_DECEPTIVE_PATTERNS,
    )
  ) {
    statuses.push('blocked')
    constraints.push({
      code:
        'COMMERCIAL_SAFETY_MANIPULATION_BLOCK',
      source:
        'commercial_safety',
      detail:
        'Manipulação, coerção, falsa urgência, falsa escassez e exploração de vulnerabilidade não são movimentos comerciais permitidos.',
    })
  }

  const config =
    snapshot.company.commercial_config

  if (config) {
    const prohibited =
      matchedRule(
        intent,
        config.prohibited_behaviors,
      )

    if (prohibited) {
      statuses.push('blocked')
      constraints.push({
        code:
          'PROHIBITED_BEHAVIOR_BLOCK',
        source:
          'prohibited_behavior',
        detail: prohibited,
      })
    }

    if (
      config.required_behaviors.length > 0
    ) {
      statuses.push(
        'allowed_with_warning',
      )
      constraints.push({
        code:
          'REQUIRED_BEHAVIORS_APPLY',
        source:
          'required_behavior',
        detail:
          config.required_behaviors.join(' | '),
      })
    }
  }

  const productDefinitions =
    snapshot.company.products.map(
      (product: { definition: {
        forbidden_claims: string[]
        contract_conditions: string[]
        payment_conditions: string[]
        limitations: string[]
      } }) => product.definition,
    )

  const forbiddenClaims =
    productDefinitions.flatMap(
      definition =>
        definition.forbidden_claims,
    )

  const forbiddenClaim =
    matchedRule(
      intent,
      forbiddenClaims,
    )

  if (forbiddenClaim) {
    statuses.push('blocked')
    constraints.push({
      code:
        'PRODUCT_FORBIDDEN_CLAIM_BLOCK',
      source:
        'product_forbidden_claim',
      detail: forbiddenClaim,
    })
  }

  const productConditions =
    productDefinitions.flatMap(
      definition => [
        ...definition.contract_conditions,
        ...definition.payment_conditions,
      ],
    )

  const approvalRule =
    [
      ...(config?.required_behaviors ?? []),
      ...(config?.prohibited_behaviors ?? []),
      ...productConditions,
    ].find(rule =>
      hasAny(
        rule,
        APPROVAL_TERMS,
      ),
    ) ?? null

  if (
    hints?.authority === 'blocked'
  ) {
    statuses.push('blocked')
    constraints.push({
      code:
        'AUTHORITY_BLOCK',
      source: 'authority',
      detail:
        'O boundary de conhecimento informou que a ação está fora da autoridade disponível.',
    })
  } else if (
    hints?.authority ===
      'approval_required' ||
    (
      approvalRule !== null &&
      hasAny(
        intent,
        APPROVAL_ACTION_TERMS,
      )
    )
  ) {
    statuses.push(
      'approval_required',
    )
    constraints.push({
      code:
        'AUTHORITY_APPROVAL_REQUIRED',
      source: 'authority',
      detail:
        approvalRule ??
        'A execução depende de aprovação humana conforme o boundary de autoridade.',
    })
  }

  const factLimitations =
    snapshot.company.facts.flatMap(
      (fact: { definition: {
        limitations: string[]
      } }) =>
        fact.definition.limitations,
    )

  if (
    commercial_move.move ===
      'answer_directly' &&
    (
      hints?.fact_support ===
        'insufficient' ||
      (
        snapshot.company.facts.length === 0 &&
        snapshot.company.products.length === 0
      )
    )
  ) {
    statuses.push(
      'allowed_with_warning',
    )
    constraints.push({
      code:
        'FACT_SUPPORT_INSUFFICIENT',
      source:
        'fact_limitation',
      detail:
        'Responder apenas com informação comprovável; não preencher lacunas com inferência factual.',
    })
  }

  if (factLimitations.length > 0) {
    statuses.push(
      'allowed_with_warning',
    )
    constraints.push({
      code:
        'OFFICIAL_FACT_LIMITATIONS_APPLY',
      source:
        'fact_limitation',
      detail:
        factLimitations.join(' | '),
    })
  }

  if (
    playbook_rule &&
    playbook_rule.avoided_moves.includes(
      commercial_move.move,
    )
  ) {
    statuses.push(
      'allowed_with_warning',
    )
    constraints.push({
      code:
        'PLAYBOOK_AVOIDED_MOVE',
      source: 'playbook',
      detail:
        `O playbook recomenda evitar ${commercial_move.move} nesta situação.`,
    })
  }

  if (playbook_rule) {
    for (
      const rule of
      playbook_rule.governance_constraints
    ) {
      statuses.push(rule.status)
      constraints.push({
        code:
          'PLAYBOOK_GOVERNANCE_CONSTRAINT',
        source: 'playbook',
        detail: rule.rule,
      })
    }
  }

  const status =
    strongestStatus(statuses)

  if (status === 'blocked') {
    return {
      status,
      constraints,
      requires_human_approval: false,
      reason:
        'Existe restrição dura; o movimento não pode ser executado e não há fallback silencioso.',
    }
  }

  if (
    status === 'approval_required'
  ) {
    return {
      status,
      constraints,
      requires_human_approval: true,
      reason:
        'O movimento depende de aprovação explícita antes da execução.',
    }
  }

  if (
    status ===
      'allowed_with_warning'
  ) {
    return {
      status,
      constraints,
      requires_human_approval: false,
      reason:
        'O movimento é permitido desde que respeite os limites estruturados.',
    }
  }

  return {
    status: 'allowed',
    constraints,
    requires_human_approval: false,
    reason:
      'Nenhuma restrição de governance aplicável foi encontrada no contexto disponível.',
  }
}
