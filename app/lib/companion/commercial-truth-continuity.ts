import type {
  StatefulCopilotOutput,
} from './stateful-copilot-contract'

import {
  CommercialTruthGuardError,
  assessCommercialTruthFromUserPrompt,
  type CommercialTruthAssessment,
} from './commercial-truth'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function parseRoot(userPrompt: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(userPrompt)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function nestedRecord(
  root: JsonRecord,
  keys: string[],
): JsonRecord | null {
  let current: unknown = root

  for (const key of keys) {
    if (!isRecord(current)) {
      return null
    }

    current = current[key]
  }

  return isRecord(current) ? current : null
}

function currentIncomingText(root: JsonRecord): string {
  const conversation = nestedRecord(
    root,
    ['input', 'diagnostic_input', 'conversation'],
  )

  const messages = Array.isArray(conversation?.messages)
    ? conversation.messages
    : []

  const incoming = messages
    .filter(isRecord)
    .filter(message => message.direction === 'incoming')
    .map((message) => [
      typeof message.text_content === 'string'
        ? message.text_content
        : '',
      typeof message.audio_transcription === 'string'
        ? message.audio_transcription
        : '',
    ].filter(Boolean).join(' '))
    .filter(Boolean)

  return normalize(incoming.at(-1) ?? '')
}

const CONTINUATION_ONLY_PATTERNS = [
  /^(?:bom dia|boa tarde|boa noite|oi|ola|olá|e ai|e aí|opa)(?:[!. ]*)$/,
  /^(?:obrigado|obrigada|valeu|perfeito|certo|ok|beleza|entendi|show)(?:[!. ]*)$/,
] as const

function isShortContinuation(text: string): boolean {
  return Boolean(text) &&
    CONTINUATION_ONLY_PATTERNS.some(pattern => pattern.test(text))
}

function activeItems(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value
        .filter(isRecord)
        .filter(item => item.memory_status === 'active')
    : []
}

function previousStateHasCommercialContinuity(root: JsonRecord): boolean {
  const previousState = nestedRecord(
    root,
    ['input', 'state_context', 'previous_state'],
  )

  if (!previousState) {
    return false
  }

  const commercialRole = previousState.commercial_role
  const buyerSide = commercialRole === 'buyer'

  const activeMemoryCount = [
    'needs',
    'open_loops',
    'objections',
    'commitments',
    'signals',
    'uncertainties',
  ].reduce(
    (total, key) => total + activeItems(previousState[key]).length,
    0,
  )

  const activeCommercialPartyFacts = activeItems(previousState.facts)
    .filter(item =>
      typeof item.kind === 'string' &&
      item.kind.startsWith('commercial_party.'),
    )

  return buyerSide ||
    activeMemoryCount > 0 ||
    activeCommercialPartyFacts.length > 0
}

export function assessCommercialTruthWithContinuity(
  userPrompt: string,
): CommercialTruthAssessment {
  const base = assessCommercialTruthFromUserPrompt(userPrompt)

  if (base.requires_commercial_relevance) {
    return base
  }

  const root = parseRoot(userPrompt)

  if (!root) {
    return base
  }

  const currentText = currentIncomingText(root)

  if (
    !isShortContinuation(currentText) ||
    !previousStateHasCommercialContinuity(root)
  ) {
    return base
  }

  return {
    ...base,
    requires_commercial_relevance: true,
    requires_buyer_side_role: true,
    stage_floor: base.stage_floor ?? 'respondeu',
    signal_categories: Array.from(
      new Set([
        ...base.signal_categories,
        'active_commercial_continuity',
      ]),
    ),
    reasons: [
      ...base.reasons,
      'A mensagem atual é uma continuação curta de uma oportunidade comercial ainda ativa na memória canônica.',
    ],
  }
}

export function reconcileCommercialTruthContinuity({
  user_prompt,
  output,
}: {
  user_prompt: string
  output: StatefulCopilotOutput
}): StatefulCopilotOutput {
  const assessment = assessCommercialTruthWithContinuity(user_prompt)

  if (
    assessment.requires_commercial_relevance &&
    output.commercial_relevance !== 'commercial'
  ) {
    throw new CommercialTruthGuardError({
      code: 'ACTIVE_COMMERCIAL_CONTINUITY_REQUIRED',
      path: 'output.commercial_relevance',
      message:
        'A saída descartou uma oportunidade comercial ainda ativa após uma mensagem curta de continuidade.',
      reasons: assessment.reasons,
    })
  }

  if (
    assessment.requires_buyer_side_role &&
    output.commercial_role !== 'buyer'
  ) {
    throw new CommercialTruthGuardError({
      code: 'ACTIVE_COMMERCIAL_CONTINUITY_ROLE_REQUIRED',
      path: 'output.commercial_role',
      message:
        'A saída perdeu o lado comprador de uma oportunidade comercial ainda ativa.',
      reasons: assessment.reasons,
    })
  }

  return output
}
