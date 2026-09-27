import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import type {
  CommercialReasoning,
} from './commercial-reasoning-contract'

import type {
  CommercialCoachingDiagnosis,
} from './commercial-coaching-engine'

export const COMMERCIAL_MESSAGE_STRATEGY_VERSION =
  'commercial-message-strategy-v1' as const

export type CommercialMessageContextReference = {
  text: string
  evidence_message_id: string
  required_in_draft: boolean
  anchors: string[]
}

export type CommercialMessageStrategy = {
  contract_version:
    typeof COMMERCIAL_MESSAGE_STRATEGY_VERSION

  objective: string | null
  relationship_bridge: string | null
  context_reference:
    CommercialMessageContextReference | null

  technique_id: string | null
  technique_title: string | null

  desired_microcommitment: string | null

  facts_allowed: string[]
  facts_required_but_missing: string[]

  prohibited_moves: string[]

  tone: string | null
  max_length: number

  evidence_message_ids: string[]
  memory_ids: string[]
}

export type CommercialMessageCriticViolation =
  | 'message_too_long'
  | 'generic_message'
  | 'repeats_recent_seller_action'

export type CommercialMessageCriticResult = {
  passed: boolean
  violations:
    CommercialMessageCriticViolation[]
}

const MAX_MESSAGE_LENGTH = 1200

const STOPWORDS =
  new Set([
    'agora',
    'ainda',
    'cliente',
    'comercial',
    'como',
    'conversa',
    'depois',
    'essa',
    'esse',
    'esta',
    'este',
    'fazer',
    'isso',
    'para',
    'pessoa',
    'precisa',
    'sobre',
    'vendedor',
    'voce',
    'você',
    'quer',
    'quero',
  ])

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

function comparable(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function anchorsFrom(
  value: string,
): string[] {
  return unique(
    comparable(value)
      .split(' ')
      .filter(
        token =>
          token.length >= 4 &&
          !STOPWORDS.has(token) &&
          !/^\d+$/.test(token),
      ),
  ).slice(0, 8)
}

function sellerIntentIsContextLight(
  value: string | null | undefined,
): boolean {
  if (!value) {
    return false
  }

  return /\b(agradec|obrigad|desped|encerr|disposicao|cumpriment|paraben|pedir desculp|desculp)\w*/.test(
    comparable(value),
  )
}

function activeMessageText(
  message:
    CompanionDiagnosticInput[
      'conversation'
    ]['messages'][number],
): string | null {
  const value =
    message.text_content ??
    message.audio_transcription

  if (
    typeof value !== 'string'
  ) {
    return null
  }

  const clean =
    value
      .replace(/\s+/g, ' ')
      .trim()

  return clean || null
}

function latestCustomerReference(
  input:
    CompanionDiagnosticInput,
): {
  text: string
  message_id: string
} | null {
  const customerMessages =
    input.conversation.messages
      .filter(
        message =>
          message.direction ===
            'incoming' &&
          message.author_kind ===
            'customer',
      )
      .map(message => ({
        message,
        text:
          activeMessageText(
            message,
          ),
      }))
      .filter(
        (
          item,
        ): item is {
          message:
            CompanionDiagnosticInput[
              'conversation'
            ]['messages'][number]
          text: string
        } =>
          Boolean(item.text),
      )

  const latest =
    customerMessages[
      customerMessages.length - 1
    ]

  return latest
    ? {
        text:
          latest.text,
        message_id:
          latest.message.id,
      }
    : null
}

function desiredMicrocommitment({
  reasoning,
  coaching,
}: {
  reasoning: CommercialReasoning
  coaching:
    CommercialCoachingDiagnosis
}): string | null {
  const technique =
    coaching.chosen_technique
      ?.id

  switch (technique) {
    case 'technique.guided_choice':
      return 'Obter uma escolha simples entre alternativas reais já disponíveis.'

    case 'technique.objection_diagnosis':
      return 'Obter uma resposta curta que esclareça a causa real da objeção.'

    case 'technique.third_party_handoff':
      return 'Definir um próximo passo claro com o interlocutor sem confundir quem está na conversa com o prospect relacionado.'

    case 'technique.discovery_before_prescription':
      return 'Obter uma informação de descoberta que realmente altere a recomendação.'

    case 'technique.commitment_wait':
      return null

    default:
      return reasoning.status ===
        'silent'
        ? null
        : reasoning.objective_now
  }
}

function missingFacts(
  reasoning:
    CommercialReasoning,
): string[] {
  const result: string[] = []

  for (
    const limitation of
      reasoning.limitations
  ) {
    if (
      limitation.includes(
        'grounded_multiple_valid_options_required',
      )
    ) {
      result.push(
        'multiple_valid_options',
      )
    }
  }

  return unique(result)
}

function bridgeFor({
  coaching,
}: {
  coaching:
    CommercialCoachingDiagnosis
}): string | null {
  if (
    coaching.sequence_break
      .happened &&
    coaching.client_intent_now
  ) {
    return (
      'Retomar a intenção já demonstrada pelo cliente antes de introduzir uma etapa comercial diferente.'
    )
  }

  if (
    coaching.client_intent_now
  ) {
    return (
      'Responder a partir da intenção atual do cliente sem reiniciar a conversa nem apagar o que já foi feito.'
    )
  }

  return null
}

export function buildCommercialMessageStrategy({
  reasoning,
  coaching,
  diagnostic_input,
  seller_intent = null,
}: {
  reasoning:
    CommercialReasoning
  coaching:
    CommercialCoachingDiagnosis
  diagnostic_input:
    CompanionDiagnosticInput
  seller_intent?:
    string | null
}): CommercialMessageStrategy {
  const reference =
    latestCustomerReference(
      diagnostic_input,
    )

  const referenceAnchors =
    reference
      ? anchorsFrom(
          reference.text,
        )
      : []

  const requiredInDraft =
    Boolean(
      reasoning.status !==
        'silent' &&
      !sellerIntentIsContextLight(
        seller_intent,
      ) &&
      reference &&
      referenceAnchors.length > 0 &&
      (
        coaching.sequence_break
          .happened ||
        coaching
          .client_intent_now
          ?.confidence === 'high'
      ),
    )

  const factsAllowed =
    reasoning
      .company_knowledge_used
      .map(
        item =>
          item.why_relevant,
      )

  const factsMissing =
    missingFacts(
      reasoning,
    )

  const prohibitedMoves =
    unique([
      ...reasoning.do_not_do,
      ...diagnostic_input
        .commercial_context
        .prohibited_behaviors,
      ...(
        factsMissing.includes(
          'multiple_valid_options',
        )
          ? [
              'Não inventar alternativas, horários, vagas ou disponibilidade para criar uma escolha guiada.',
            ]
          : []
      ),
    ])

  return {
    contract_version:
      COMMERCIAL_MESSAGE_STRATEGY_VERSION,
    objective:
      reasoning.status ===
        'silent'
        ? null
        : reasoning.objective_now,
    relationship_bridge:
      bridgeFor({
        coaching,
      }),
    context_reference:
      reference
        ? {
            text:
              reference.text,
            evidence_message_id:
              reference.message_id,
            required_in_draft:
              requiredInDraft,
            anchors:
              referenceAnchors,
          }
        : null,
    technique_id:
      coaching.chosen_technique
        ?.id ??
      null,
    technique_title:
      coaching.chosen_technique
        ?.title ??
      null,
    desired_microcommitment:
      desiredMicrocommitment({
        reasoning,
        coaching,
      }),
    facts_allowed:
      unique(
        factsAllowed,
      ),
    facts_required_but_missing:
      factsMissing,
    prohibited_moves:
      prohibitedMoves,
    tone:
      diagnostic_input
        .commercial_context
        .communication_tone,
    max_length:
      MAX_MESSAGE_LENGTH,
    evidence_message_ids:
      unique([
        ...coaching
          .evidence_message_ids,
        ...(
          reference
            ? [
                reference.message_id,
              ]
            : []
        ),
      ]),
    memory_ids:
      unique([
        ...coaching.memory_ids,
      ]),
  }
}

function repeatsRecentOutgoing({
  message,
  recent_outgoing_messages,
}: {
  message: string
  recent_outgoing_messages:
    readonly string[]
}): boolean {
  const normalized =
    comparable(message)

  if (
    normalized.length < 12
  ) {
    return false
  }

  return recent_outgoing_messages
    .some((previous) => {
      const prior =
        comparable(previous)

      if (
        prior.length < 12
      ) {
        return false
      }

      return (
        prior === normalized ||
        prior.includes(
          normalized,
        ) ||
        normalized.includes(
          prior,
        )
      )
    })
}

export function evaluateCommercialMessageDraft({
  message,
  strategy,
  recent_outgoing_messages = [],
}: {
  message: string
  strategy:
    CommercialMessageStrategy
  recent_outgoing_messages?:
    readonly string[]
}): CommercialMessageCriticResult {
  const violations:
    CommercialMessageCriticViolation[] =
    []

  if (
    message.length >
    strategy.max_length
  ) {
    violations.push(
      'message_too_long',
    )
  }

  const reference =
    strategy.context_reference

  if (
    reference
      ?.required_in_draft &&
    reference.anchors.length > 0
  ) {
    const messageTokens =
      new Set(
        comparable(message)
          .split(' ')
          .filter(Boolean),
      )

    const hasReference =
      reference.anchors.some(
        anchor =>
          messageTokens.has(
            anchor,
          ),
      )

    if (!hasReference) {
      violations.push(
        'generic_message',
      )
    }
  }

  if (
    repeatsRecentOutgoing({
      message,
      recent_outgoing_messages,
    })
  ) {
    violations.push(
      'repeats_recent_seller_action',
    )
  }

  return {
    passed:
      violations.length === 0,
    violations:
      unique(
        violations,
      ) as
        CommercialMessageCriticViolation[],
  }
}
