import type {
  DiagnosticInputMessage,
} from './diagnostic-input'

import type {
  StatefulCopilotInput,
} from './stateful-copilot-input'

export const COMMERCIAL_REASONING_CORE_V2_DYNAMICS_VERSION =
  'commercial-reasoning-core-v2-dynamics-v1' as const

type ActiveMessage =
  DiagnosticInputMessage & {
    normalized_text: string
  }

export type CommercialReasoningCoreV2RepeatedCustomerRequest = {
  first_message_id: string
  repeated_message_id: string
  similarity: number
  elapsed_minutes: number | null
}

export type CommercialReasoningCoreV2SellerResponseGap = {
  customer_message_id: string
  seller_message_id: string | null
  delay_minutes: number | null
}

export type CommercialReasoningCoreV2ResolvedAttachmentRequest = {
  request_message_id: string
  attachment_message_id: string
  attachment_file_name: string
}

export type CommercialReasoningCoreV2ThirdPartyMention = {
  message_id: string
  relation_terms: string[]
}

export type CommercialReasoningCoreV2ScheduleRequest = {
  message_id: string
  has_explicit_time_reference: boolean
}

export type CommercialReasoningCoreV2Dynamics = {
  version:
    typeof COMMERCIAL_REASONING_CORE_V2_DYNAMICS_VERSION

  repeated_customer_requests:
    CommercialReasoningCoreV2RepeatedCustomerRequest[]

  seller_response_gaps:
    CommercialReasoningCoreV2SellerResponseGap[]

  resolved_attachment_requests:
    CommercialReasoningCoreV2ResolvedAttachmentRequest[]

  outgoing_attachment_message_ids:
    string[]

  third_party_mentions:
    CommercialReasoningCoreV2ThirdPartyMention[]

  explicit_schedule_requests:
    CommercialReasoningCoreV2ScheduleRequest[]
}

const REQUEST_STOPWORDS =
  new Set([
    'a',
    'as',
    'ao',
    'aos',
    'da',
    'das',
    'de',
    'do',
    'dos',
    'e',
    'em',
    'eu',
    'me',
    'na',
    'nas',
    'no',
    'nos',
    'o',
    'os',
    'para',
    'por',
    'pra',
    'pro',
    'pf',
    'pff',
    'favor',
    'pode',
    'poderia',
    'quero',
    'queria',
    'gostaria',
    'uma',
    'um',
    'voce',
    'voces',
  ])

const MATERIAL_TERMS =
  new Set([
    'arquivo',
    'catalogo',
    'documento',
    'foto',
    'grade',
    'imagem',
    'material',
    'orcamento',
    'pdf',
    'planilha',
    'proposta',
    'tabela',
    'video',
  ])

const THIRD_PARTY_TERMS = [
  'amiga',
  'amigo',
  'amigas',
  'amigos',
  'esposa',
  'esposo',
  'filha',
  'filho',
  'irma',
  'irmao',
  'marido',
  'namorada',
  'namorado',
  'pai',
  'mae',
  'socia',
  'socio',
  'colega',
] as const

function normalizeText(
  value: unknown,
): string {
  return typeof value ===
    'string'
    ? value
        .normalize('NFD')
        .replace(
          /[\u0300-\u036f]/g,
          '',
        )
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          ' ',
        )
        .replace(
          /\s+/g,
          ' ',
        )
        .trim()
    : ''
}

function messageText(
  message:
    DiagnosticInputMessage,
): string {
  if (
    message.content_type ===
      'audio'
  ) {
    return message
      .audio_transcription ??
      ''
  }

  return message
    .text_content ??
    ''
}

function tokenize(
  value: string,
): string[] {
  return [
    ...new Set(
      normalizeText(
        value,
      )
        .split(' ')
        .filter(
          token =>
            token.length >= 3 &&
            !REQUEST_STOPWORDS.has(
              token,
            ),
        ),
    ),
  ]
}

function similarity(
  left: string,
  right: string,
): number {
  const leftNormalized =
    normalizeText(
      left,
    )

  const rightNormalized =
    normalizeText(
      right,
    )

  if (
    !leftNormalized ||
    !rightNormalized
  ) {
    return 0
  }

  if (
    leftNormalized ===
    rightNormalized
  ) {
    return 1
  }

  const leftTokens =
    new Set(
      tokenize(
        left,
      ),
    )

  const rightTokens =
    new Set(
      tokenize(
        right,
      ),
    )

  if (
    leftTokens.size < 3 ||
    rightTokens.size < 3
  ) {
    return 0
  }

  let intersection = 0

  for (const token of leftTokens) {
    if (
      rightTokens.has(
        token,
      )
    ) {
      intersection += 1
    }
  }

  const union =
    new Set([
      ...leftTokens,
      ...rightTokens,
    ]).size

  return union > 0
    ? intersection / union
    : 0
}

function elapsedMinutes(
  first: string,
  second: string,
): number | null {
  const firstMs =
    Date.parse(
      first,
    )

  const secondMs =
    Date.parse(
      second,
    )

  if (
    !Number.isFinite(
      firstMs,
    ) ||
    !Number.isFinite(
      secondMs,
    ) ||
    secondMs < firstMs
  ) {
    return null
  }

  return Math.round(
    (
      secondMs -
      firstMs
    ) /
      60_000,
  )
}

function isRequestLike(
  value: string,
): boolean {
  const normalized =
    normalizeText(
      value,
    )

  return (
    /\b(agend|agenda|marc|marca|reserv|manda|mandar|envia|enviar|encaminh|compartilh|passa|passar|quero|queria|gostaria|poderia)\w*/.test(
      normalized,
    ) ||
    value.includes('?')
  )
}

function extractAttachmentFileName(
  value: string,
): string | null {
  const match =
    value.match(
      /\[Arquivo:\s*([^\]]+)\]/i,
    )

  return match?.[1]
    ?.trim() ||
    null
}

function isMaterialRequest(
  value: string,
): boolean {
  if (
    !isRequestLike(
      value,
    )
  ) {
    return false
  }

  return tokenize(
    value,
  ).some(
    token =>
      MATERIAL_TERMS.has(
        token,
      ),
  )
}

function materialRequestMatchesFile(
  requestText: string,
  fileName: string,
): boolean {
  const requestTokens =
    tokenize(
      requestText,
    )
      .filter(
        token =>
          MATERIAL_TERMS.has(
            token,
          ) ||
          token.length >= 4,
      )

  const fileTokens =
    new Set(
      tokenize(
        fileName,
      ),
    )

  return requestTokens.some(
    token =>
      fileTokens.has(
        token,
      ),
  )
}

function hasExplicitScheduleIntent(
  value: string,
): boolean {
  const normalized =
    normalizeText(
      value,
    )

  return /\b(agend|agenda|marc|marca|reserv|aula experimental|horario)\w*/.test(
    normalized,
  )
}

function hasExplicitTimeReference(
  value: string,
): boolean {
  const normalized =
    normalizeText(
      value,
    )

  return (
    /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo|hoje|amanha)\b/.test(
      normalized,
    ) ||
    /\b(?:[01]?\d|2[0-3])(?::[0-5]\d|h\d{0,2})?\b/.test(
      normalized,
    )
  )
}

function activeMessages(
  input:
    StatefulCopilotInput,
): ActiveMessage[] {
  const activeIds =
    new Set(
      input
        .diagnostic_input
        .conversation
        .active_message_ids,
    )

  return input
    .diagnostic_input
    .conversation
    .messages
    .filter(
      message =>
        activeIds.has(
          message.id,
        ),
    )
    .map(
      message => ({
        ...message,
        normalized_text:
          messageText(
            message,
          ),
      }),
    )
    .sort(
      (left, right) => {
        const sequenceDiff =
          Number(
            left.sequence,
          ) -
          Number(
            right.sequence,
          )

        if (
          Number.isFinite(
            sequenceDiff,
          ) &&
          sequenceDiff !== 0
        ) {
          return sequenceDiff
        }

        return Date.parse(
          left.occurred_at,
        ) -
          Date.parse(
            right.occurred_at,
          )
      },
    )
}

function buildRepeatedCustomerRequests(
  messages:
    ActiveMessage[],
): CommercialReasoningCoreV2RepeatedCustomerRequest[] {
  const incoming =
    messages.filter(
      message =>
        message.direction ===
          'incoming' &&
        isRequestLike(
          message.normalized_text,
        ),
    )

  const results:
    CommercialReasoningCoreV2RepeatedCustomerRequest[] = []

  for (
    let currentIndex = 1;
    currentIndex < incoming.length;
    currentIndex += 1
  ) {
    const current =
      incoming[
        currentIndex
      ]

    for (
      let previousIndex =
        currentIndex - 1;
      previousIndex >=
        Math.max(
          0,
          currentIndex - 8,
        );
      previousIndex -= 1
    ) {
      const previous =
        incoming[
          previousIndex
        ]

      const score =
        similarity(
          previous.normalized_text,
          current.normalized_text,
        )

      if (
        score < 0.68
      ) {
        continue
      }

      results.push({
        first_message_id:
          previous.id,
        repeated_message_id:
          current.id,
        similarity:
          Number(
            score.toFixed(
              3,
            ),
          ),
        elapsed_minutes:
          elapsedMinutes(
            previous.occurred_at,
            current.occurred_at,
          ),
      })

      break
    }
  }

  return results
    .slice(-4)
}

function buildSellerResponseGaps(
  messages:
    ActiveMessage[],
): CommercialReasoningCoreV2SellerResponseGap[] {
  const results:
    CommercialReasoningCoreV2SellerResponseGap[] = []

  messages.forEach(
    (
      message,
      index,
    ) => {
      if (
        message.direction !==
          'incoming' ||
        !isRequestLike(
          message.normalized_text,
        )
      ) {
        return
      }

      const sellerMessage =
        messages
          .slice(
            index + 1,
          )
          .find(
            candidate =>
              candidate.direction ===
              'outgoing',
          ) ?? null

      results.push({
        customer_message_id:
          message.id,
        seller_message_id:
          sellerMessage
            ?.id ??
          null,
        delay_minutes:
          sellerMessage
            ? elapsedMinutes(
                message.occurred_at,
                sellerMessage.occurred_at,
              )
            : null,
      })
    },
  )

  return results
    .sort(
      (left, right) =>
        (
          right.delay_minutes ??
          Number.MAX_SAFE_INTEGER
        ) -
        (
          left.delay_minutes ??
          Number.MAX_SAFE_INTEGER
        ),
    )
    .slice(
      0,
      6,
    )
}

function buildAttachmentSignals(
  messages:
    ActiveMessage[],
): {
  resolved:
    CommercialReasoningCoreV2ResolvedAttachmentRequest[]

  outgoingIds:
    string[]
} {
  const resolved:
    CommercialReasoningCoreV2ResolvedAttachmentRequest[] = []

  const outgoingIds:
    string[] = []

  messages.forEach(
    (
      message,
      index,
    ) => {
      if (
        message.direction !==
        'outgoing'
      ) {
        return
      }

      const fileName =
        extractAttachmentFileName(
          message.normalized_text,
        )

      if (!fileName) {
        return
      }

      outgoingIds.push(
        message.id,
      )

      const priorRequest =
        [
          ...messages
            .slice(
              Math.max(
                0,
                index - 20,
              ),
              index,
            ),
        ]
          .reverse()
          .find(
            candidate =>
              candidate.direction ===
                'incoming' &&
              isMaterialRequest(
                candidate.normalized_text,
              ) &&
              materialRequestMatchesFile(
                candidate.normalized_text,
                fileName,
              ),
          )

      if (!priorRequest) {
        return
      }

      resolved.push({
        request_message_id:
          priorRequest.id,
        attachment_message_id:
          message.id,
        attachment_file_name:
          fileName,
      })
    },
  )

  return {
    resolved:
      resolved.slice(
        -4,
      ),
    outgoingIds:
      outgoingIds.slice(
        -6,
      ),
  }
}

function buildThirdPartyMentions(
  messages:
    ActiveMessage[],
): CommercialReasoningCoreV2ThirdPartyMention[] {
  return messages
    .filter(
      message =>
        message.direction ===
        'incoming',
    )
    .map(
      message => {
        const normalized =
          normalizeText(
            message.normalized_text,
          )

        const terms =
          THIRD_PARTY_TERMS.filter(
            term =>
              new RegExp(
                `\\b${term}\\b`,
              ).test(
                normalized,
              ),
          )

        return {
          message_id:
            message.id,
          relation_terms:
            [
              ...terms,
            ],
        }
      },
    )
    .filter(
      item =>
        item.relation_terms
          .length > 0,
    )
    .slice(
      -4,
    )
}

function buildScheduleRequests(
  messages:
    ActiveMessage[],
): CommercialReasoningCoreV2ScheduleRequest[] {
  return messages
    .filter(
      message =>
        message.direction ===
          'incoming' &&
        hasExplicitScheduleIntent(
          message.normalized_text,
        ),
    )
    .map(
      message => ({
        message_id:
          message.id,
        has_explicit_time_reference:
          hasExplicitTimeReference(
            message.normalized_text,
          ),
      }),
    )
    .slice(
      -4,
    )
}

export function buildCommercialReasoningCoreV2Dynamics(
  input:
    StatefulCopilotInput,
): CommercialReasoningCoreV2Dynamics {
  const messages =
    activeMessages(
      input,
    )

  const attachmentSignals =
    buildAttachmentSignals(
      messages,
    )

  return {
    version:
      COMMERCIAL_REASONING_CORE_V2_DYNAMICS_VERSION,

    repeated_customer_requests:
      buildRepeatedCustomerRequests(
        messages,
      ),

    seller_response_gaps:
      buildSellerResponseGaps(
        messages,
      ),

    resolved_attachment_requests:
      attachmentSignals.resolved,

    outgoing_attachment_message_ids:
      attachmentSignals.outgoingIds,

    third_party_mentions:
      buildThirdPartyMentions(
        messages,
      ),

    explicit_schedule_requests:
      buildScheduleRequests(
        messages,
      ),
  }
}
