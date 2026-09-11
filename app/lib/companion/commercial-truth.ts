import type {
  DiagnosticLeadStatus,
} from './diagnostic-contract'

import type {
  StatefulCopilotOutput,
} from './stateful-copilot-contract'

export const COMMERCIAL_PARTY_FACT_KINDS = [
  'commercial_party.current_contact.prospect',
  'commercial_party.current_contact.intermediary',
  'commercial_party.current_contact.decision_maker',
  'commercial_party.current_contact.influencer',
  'commercial_party.current_contact.user',
  'commercial_party.current_contact.beneficiary',
  'commercial_party.related.prospect',
  'commercial_party.related.decision_maker',
  'commercial_party.related.influencer',
  'commercial_party.related.user',
  'commercial_party.related.beneficiary',
] as const

export type CommercialPartyFactKind =
  (typeof COMMERCIAL_PARTY_FACT_KINDS)[number]

export type CommercialPartyScope =
  'current_contact' | 'related'

export type CommercialPartyRole =
  | 'prospect'
  | 'intermediary'
  | 'decision_maker'
  | 'influencer'
  | 'user'
  | 'beneficiary'

export type CommercialPartyFactDescriptor = {
  scope: CommercialPartyScope
  role: CommercialPartyRole
}

export type CommercialTruthStageFloor =
  'respondeu' | 'negociacao' | null

export type CommercialTruthAssessment = {
  requires_commercial_relevance: boolean
  requires_buyer_side_role: boolean
  third_party_prospect_detected: boolean
  stage_floor: CommercialTruthStageFloor
  signal_categories: string[]
  reasons: string[]
  current_crm_status: DiagnosticLeadStatus | null
}

type JsonRecord =
  Record<string, unknown>

type PromptMessage = {
  direction: string
  text_content: string | null
  audio_transcription: string | null
}

export class CommercialTruthGuardError
  extends Error {
  readonly code: string
  readonly path: string
  readonly reasons: string[]

  constructor({
    code,
    path,
    message,
    reasons,
  }: {
    code: string
    path: string
    message: string
    reasons: string[]
  }) {
    super(message)

    this.name = 'CommercialTruthGuardError'
    this.code = code
    this.path = path
    this.reasons = reasons
  }
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function normalizeText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function messageText(
  message: PromptMessage,
): string {
  return normalizeText(
    [
      message.text_content,
      message.audio_transcription,
    ]
      .filter(
        (value): value is string =>
          typeof value === 'string' &&
          Boolean(value.trim()),
      )
      .join(' '),
  )
}

function asPromptMessages(
  value: unknown,
): PromptMessage[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter(isRecord)
    .map((item) => ({
      direction:
        typeof item.direction === 'string'
          ? item.direction
          : '',
      text_content:
        typeof item.text_content === 'string'
          ? item.text_content
          : null,
      audio_transcription:
        typeof item.audio_transcription === 'string'
          ? item.audio_transcription
          : null,
    }))
}

function getNestedRecord(
  value: unknown,
  keys: string[],
): JsonRecord | null {
  let current: unknown = value

  for (const key of keys) {
    if (!isRecord(current)) {
      return null
    }

    current = current[key]
  }

  return isRecord(current)
    ? current
    : null
}

function getCurrentCrmStatus(
  input: JsonRecord,
): DiagnosticLeadStatus | null {
  const diagnosticInput =
    getNestedRecord(
      input,
      [
        'input',
        'diagnostic_input',
      ],
    )

  const value =
    diagnosticInput?.current_crm_status

  return typeof value === 'string'
    ? value as DiagnosticLeadStatus
    : null
}

function getConfiguredProductNames(
  input: JsonRecord,
): string[] {
  const commercialContext =
    getNestedRecord(
      input,
      [
        'input',
        'diagnostic_input',
        'commercial_context',
      ],
    )

  const products =
    commercialContext?.products

  if (!Array.isArray(products)) {
    return []
  }

  const names: string[] = []

  for (const product of products) {
    if (!isRecord(product)) {
      continue
    }

    const directName =
      typeof product.name === 'string'
        ? product.name
        : null

    const definition =
      isRecord(product.definition)
        ? product.definition
        : null

    const definitionName =
      typeof definition?.name === 'string'
        ? definition.name
        : null

    for (const candidate of [
      directName,
      definitionName,
    ]) {
      if (!candidate) {
        continue
      }

      const normalized =
        normalizeText(candidate)

      if (
        normalized.length >= 3 &&
        !names.includes(normalized)
      ) {
        names.push(normalized)
      }
    }
  }

  return names
}

const TRANSACTION_PATTERNS = [
  /\b(?:quero|vamos|podemos|vou)\s+(?:contratar|fechar|comprar|assinar|matricular)\b/,
  /\b(?:pode|podemos)\s+(?:fechar|fazer a matricula|concluir)\b/,
  /\b(?:fechamos|contratei|comprei|assinei|matriculei)\b/,
] as const

const CHECKOUT_PATTERNS = [
  /\blink\s+(?:de|da|do|para)\s+(?:matricula|pagamento|checkout|contratacao)\b/,
  /\bcheckout\b/,
  /\b(?:finalizar|concluir)\s+(?:a\s+)?(?:matricula|compra|pagamento|contratacao)\b/,
] as const

const PRICE_PATTERNS = [
  /\br\$\s*\d/,
  /\b(?:preco|valor|mensalidade|investimento)\b/,
] as const

const PLAN_PATTERNS = [
  /\b(?:plano|pacote|proposta|oferta)\b/,
] as const

const PAYMENT_PATTERNS = [
  /\b(?:pagamento|pagar|cartao|pix|boleto|parcela|parcelamento|recorrente|credito)\b/,
] as const

const OBJECTION_PATTERNS = [
  /\bnao\s+(?:tenho|possuo|quero usar)\s+(?:cartao|credito)\b/,
  /\b(?:sem|falta de)\s+(?:cartao|credito|limite)\b/,
  /\b(?:caro|desconto|limite do cartao|ver com|falar com)\b/,
] as const

const PROPOSAL_CONTRACT_PATTERNS = [
  /\b(?:proposta comercial|contrato|termo de adesao)\b/,
] as const

const THIRD_PARTY_PROSPECT_PATTERNS = [
  /\b(?:minha|meu)\s+(?:irma|irmao|mae|pai|esposa|esposo|marido|mulher|filha|filho|amiga|amigo|socia|socio|parceira|parceiro)\s+(?:quer|precisa|procura|tem interesse|gostaria|vai fazer|vai comprar|vai contratar)\b/,
  /\b(?:e|eh|seria|vai ser)\s+para\s+(?:minha|meu)\s+(?:irma|irmao|mae|pai|esposa|esposo|marido|mulher|filha|filho|amiga|amigo|socia|socio|parceira|parceiro)\b/,
] as const

const SHORT_CONTINUATION_PATTERNS = [
  /^(?:sim|nao|pode|pode ser|quero|quero sim|fechado|combinado|isso|esse|essa|o primeiro|a primeira|vamos|ok|certo)$/,
] as const

function matchesAny(
  text: string,
  patterns: readonly RegExp[],
): boolean {
  return patterns.some(
    pattern => pattern.test(text),
  )
}

function collectSignalCategories({
  text,
  productNames,
}: {
  text: string
  productNames: string[]
}): string[] {
  const categories: string[] = []

  const add = (category: string) => {
    if (!categories.includes(category)) {
      categories.push(category)
    }
  }

  if (matchesAny(text, TRANSACTION_PATTERNS)) {
    add('transaction_intent')
  }

  if (matchesAny(text, CHECKOUT_PATTERNS)) {
    add('checkout')
  }

  if (matchesAny(text, PRICE_PATTERNS)) {
    add('price')
  }

  if (matchesAny(text, PLAN_PATTERNS)) {
    add('plan_offer')
  }

  if (matchesAny(text, PAYMENT_PATTERNS)) {
    add('payment')
  }

  if (matchesAny(text, OBJECTION_PATTERNS)) {
    add('objection')
  }

  if (matchesAny(text, PROPOSAL_CONTRACT_PATTERNS)) {
    add('proposal_contract')
  }

  if (
    productNames.some(
      productName =>
        text.includes(productName),
    )
  ) {
    add('configured_product')
  }

  return categories
}

function isStrongCommercialEvidence(
  categories: string[],
): boolean {
  if (
    categories.includes('transaction_intent') ||
    categories.includes('checkout')
  ) {
    return true
  }

  const meaningful =
    new Set(categories)

  // Um único token como "preço" ou "plano" não basta. O caso precisa
  // combinar sinais independentes da jornada ou ligar produto canônico
  // a outro sinal. Isso preserva o fail-closed de conversas pessoais.
  return (
    meaningful.size >= 3 ||
    (
      meaningful.has('configured_product') &&
      meaningful.size >= 2
    ) ||
    (
      meaningful.has('proposal_contract') &&
      (
        meaningful.has('price') ||
        meaningful.has('payment') ||
        meaningful.has('objection')
      )
    )
  )
}

function isLateJourneyEvidence(
  categories: string[],
): boolean {
  const values = new Set(categories)

  return (
    values.has('transaction_intent') ||
    values.has('checkout') ||
    (
      values.has('proposal_contract') &&
      (
        values.has('price') ||
        values.has('payment') ||
        values.has('objection')
      )
    ) ||
    (
      values.has('plan_offer') &&
      values.has('payment') &&
      (
        values.has('price') ||
        values.has('objection')
      )
    )
  )
}

function parsePromptInput(
  userPrompt: string,
): JsonRecord | null {
  try {
    const parsed: unknown =
      JSON.parse(userPrompt)

    return isRecord(parsed)
      ? parsed
      : null
  } catch {
    return null
  }
}

export function parseCommercialPartyFactKind(
  value: string,
): CommercialPartyFactDescriptor | null {
  if (
    !COMMERCIAL_PARTY_FACT_KINDS.includes(
      value as CommercialPartyFactKind,
    )
  ) {
    return null
  }

  const match =
    /^commercial_party\.(current_contact|related)\.(prospect|intermediary|decision_maker|influencer|user|beneficiary)$/
      .exec(value)

  if (!match) {
    return null
  }

  return {
    scope:
      match[1] as CommercialPartyScope,
    role:
      match[2] as CommercialPartyRole,
  }
}

export function assessCommercialTruthFromUserPrompt(
  userPrompt: string,
): CommercialTruthAssessment {
  const root =
    parsePromptInput(userPrompt)

  if (!root) {
    return {
      requires_commercial_relevance: false,
      requires_buyer_side_role: false,
      third_party_prospect_detected: false,
      stage_floor: null,
      signal_categories: [],
      reasons: [],
      current_crm_status: null,
    }
  }

  const conversation =
    getNestedRecord(
      root,
      [
        'input',
        'diagnostic_input',
        'conversation',
      ],
    )

  const currentMessages =
    asPromptMessages(
      conversation?.messages,
    )

  const bridgeMessages =
    asPromptMessages(
      conversation?.context_bridge_messages,
    )

  const productNames =
    getConfiguredProductNames(root)

  const incomingCurrentText =
    currentMessages
      .filter(
        message =>
          message.direction === 'incoming',
      )
      .map(messageText)
      .filter(Boolean)
      .join(' ')

  const currentText =
    currentMessages
      .map(messageText)
      .filter(Boolean)
      .join(' ')

  const bridgeText =
    bridgeMessages
      .map(messageText)
      .filter(Boolean)
      .join(' ')

  const currentCategories =
    collectSignalCategories({
      text: currentText,
      productNames,
    })

  const bridgeCategories =
    collectSignalCategories({
      text: bridgeText,
      productNames,
    })

  const latestIncoming =
    [...currentMessages]
      .reverse()
      .find(
        message =>
          message.direction === 'incoming',
      )

  const latestIncomingText =
    latestIncoming
      ? messageText(latestIncoming)
      : ''

  const directContinuation =
    Boolean(latestIncomingText) &&
    matchesAny(
      latestIncomingText,
      SHORT_CONTINUATION_PATTERNS,
    ) &&
    isStrongCommercialEvidence(
      bridgeCategories,
    )

  const strongCurrentEvidence =
    isStrongCommercialEvidence(
      currentCategories,
    )

  const thirdPartyProspect =
    matchesAny(
      incomingCurrentText,
      THIRD_PARTY_PROSPECT_PATTERNS,
    )

  const requiresCommercial =
    strongCurrentEvidence ||
    directContinuation ||
    thirdPartyProspect

  const combinedCategories =
    directContinuation
      ? Array.from(
          new Set([
            ...currentCategories,
            ...bridgeCategories,
            'direct_commercial_continuity',
          ]),
        )
      : currentCategories

  const reasons: string[] = []

  if (strongCurrentEvidence) {
    reasons.push(
      'A interação atual combina sinais comerciais fortes e independentes.',
    )
  }

  if (directContinuation) {
    reasons.push(
      'A mensagem atual é continuação direta de um contexto comercial forte imediatamente anterior.',
    )
  }

  if (thirdPartyProspect) {
    reasons.push(
      'O contato atual declarou uma oportunidade comercial para uma terceira pessoa.',
    )
  }

  const stageFloor =
    requiresCommercial &&
    isLateJourneyEvidence(
      combinedCategories,
    )
      ? 'negociacao'
      : requiresCommercial
        ? 'respondeu'
        : null

  return {
    requires_commercial_relevance:
      requiresCommercial,
    requires_buyer_side_role:
      requiresCommercial,
    third_party_prospect_detected:
      thirdPartyProspect,
    stage_floor:
      stageFloor,
    signal_categories:
      combinedCategories,
    reasons,
    current_crm_status:
      getCurrentCrmStatus(root),
  }
}

function crmRank(
  status: DiagnosticLeadStatus | null,
): number {
  switch (status) {
    case 'novo':
      return 0
    case 'contato':
      return 1
    case 'respondeu':
      return 2
    case 'negociacao':
      return 3
    case 'pausado':
      return 1
    default:
      return -1
  }
}

function applyStageFloor({
  output,
  assessment,
}: {
  output: StatefulCopilotOutput
  assessment: CommercialTruthAssessment
}): StatefulCopilotOutput {
  const floor =
    assessment.stage_floor

  const current =
    assessment.current_crm_status

  if (
    floor === null ||
    current === 'ganho' ||
    current === 'perdido' ||
    current === 'cancelado' ||
    crmRank(current) >= crmRank(floor)
  ) {
    return output
  }

  return {
    ...output,
    operational_suggestions: {
      ...output.operational_suggestions,
      crm: {
        should_change_crm_stage: true,
        recommended_status: floor,
        rationale:
          floor === 'negociacao'
            ? 'A conversa contém evidências fortes de etapa avançada da jornada comercial.'
            : 'A conversa contém evidência comercial atual suficiente para sair das etapas iniciais.',
        requires_human_confirmation: true,
      },
    },
  }
}

export function reconcileStatefulCommercialTruth({
  user_prompt,
  output,
}: {
  user_prompt: string
  output: StatefulCopilotOutput
}): StatefulCopilotOutput {
  const assessment =
    assessCommercialTruthFromUserPrompt(
      user_prompt,
    )

  if (
    assessment
      .requires_commercial_relevance &&
    output.commercial_relevance !==
      'commercial'
  ) {
    throw new CommercialTruthGuardError({
      code:
        'COMMERCIAL_RELEVANCE_FALSE_NEGATIVE',
      path:
        'output.commercial_relevance',
      message:
        'A saída descartou uma oportunidade com evidência comercial forte.',
      reasons:
        assessment.reasons,
    })
  }

  if (
    assessment.requires_buyer_side_role &&
    output.commercial_role !== 'buyer'
  ) {
    throw new CommercialTruthGuardError({
      code:
        'BUYER_SIDE_ROLE_REQUIRED',
      path:
        'output.commercial_role',
      message:
        'A saída tratou como fora do lado comprador uma interação que representa demanda pela oferta da empresa.',
      reasons:
        assessment.reasons,
    })
  }

  return applyStageFloor({
    output,
    assessment,
  })
}
