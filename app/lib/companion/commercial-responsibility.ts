export type CommercialWaitingOn =
  | 'seller'
  | 'customer'
  | 'unknown'

export type CommercialPendingFact =
  | 'seller_response'
  | 'customer_response'
  | 'customer_commitment'
  | null

export type CommercialResponsibilitySnapshot = {
  pending_fact: CommercialPendingFact
  seller_action_already_performed: boolean
  waiting_on: CommercialWaitingOn
  evidence_message_ids: string[]
}

type JsonRecord =
  Record<string, unknown>

type PromptMessage = {
  id: string | null
  direction: string
  author_kind: string
  text_content: string | null
  audio_transcription: string | null
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

function getMessages(
  userPrompt: string,
): PromptMessage[] {
  let parsed: unknown

  try {
    parsed = JSON.parse(userPrompt)
  } catch {
    return []
  }

  if (!isRecord(parsed)) {
    return []
  }

  const input =
    isRecord(parsed.input)
      ? parsed.input
      : null

  const diagnostic =
    isRecord(input?.diagnostic_input)
      ? input.diagnostic_input
      : null

  const conversation =
    isRecord(diagnostic?.conversation)
      ? diagnostic.conversation
      : null

  if (!Array.isArray(conversation?.messages)) {
    return []
  }

  return conversation.messages
    .filter(isRecord)
    .map((message) => ({
      id:
        typeof message.id === 'string'
          ? message.id
          : typeof message.id === 'number'
            ? String(message.id)
            : null,
      direction:
        typeof message.direction === 'string'
          ? message.direction
          : '',
      // R2.4: fail-safe — um user_prompt sem author_kind (contrato
      // antigo) nunca derruba a leitura; cai no mesmo derivado de
      // direction já usado em toda a cadeia (nunca promove ausência a
      // 'human_agent'/'customer' por si só quando direction também
      // está ausente).
      author_kind:
        typeof message.author_kind === 'string'
          ? message.author_kind
          : message.direction === 'outgoing'
            ? 'human_agent'
            : message.direction === 'incoming'
              ? 'customer'
              : 'unknown',
      text_content:
        typeof message.text_content === 'string'
          ? message.text_content
          : null,
      audio_transcription:
        typeof message.audio_transcription === 'string'
          ? message.audio_transcription
          : null,
    }))
}

const CUSTOMER_FUTURE_ACTION_PATTERNS = [
  /\b(?:vou|vamos)\s+(?:ver|verificar|checar|olhar|falar|conversar|pagar|assinar|enviar|mandar|decidir|confirmar|resolver|providenciar)\b/,
  /\b(?:te|lhe)\s+(?:aviso|confirmo|mando|envio|retorno)\b/,
  /\b(?:depois|amanha|mais tarde)\s+(?:eu\s+)?(?:vejo|verifico|confirmo|pago|assino|mando|envio|resolvo)\b/,
] as const

const SELLER_ACTION_PATTERNS = [
  /\?\s*$/,
  /\b(?:enviei|mandei|encaminhei|segue|aqui esta|aqui esta o link|te mandei|te enviei)\b/,
  /\b(?:pode|consegue|me confirma|me envia|me manda|me avisa)\b/,
] as const

function matchesAny(
  text: string,
  patterns: readonly RegExp[],
): boolean {
  return patterns.some(
    pattern => pattern.test(text),
  )
}

export function deriveCommercialResponsibilityFromUserPrompt(
  userPrompt: string,
): CommercialResponsibilitySnapshot {
  const messages =
    getMessages(userPrompt)

  if (messages.length === 0) {
    return {
      pending_fact: null,
      seller_action_already_performed: false,
      waiting_on: 'unknown',
      evidence_message_ids: [],
    }
  }

  const latest =
    messages[messages.length - 1]

  const latestText =
    messageText(latest)

  // R2.4: author_kind é a autoridade de autoria — uma automação/flow do
  // ManyChat enviada como outgoing NUNCA pode ser contabilizada como
  // "o vendedor já agiu" (evidência de ação humana real).
  const outgoingMessages =
    messages.filter(
      message =>
        message.direction === 'outgoing' &&
        message.author_kind === 'human_agent',
    )

  const sellerActionAlreadyPerformed =
    outgoingMessages.some(
      message =>
        matchesAny(
          messageText(message),
          SELLER_ACTION_PATTERNS,
        ),
    )

  // R2.4: um compromisso do cliente só pode ser atribuído a uma
  // mensagem com autoria de cliente comprovada — 'unknown' falha
  // fechado para essa claim comercial forte.
  const customerFutureAction =
    latest.direction === 'incoming' &&
    latest.author_kind === 'customer' &&
    matchesAny(
      latestText,
      CUSTOMER_FUTURE_ACTION_PATTERNS,
    )

  let waitingOn:
    CommercialWaitingOn = 'unknown'

  let pendingFact:
    CommercialPendingFact = null

  if (customerFutureAction) {
    waitingOn = 'customer'
    pendingFact = 'customer_commitment'
  } else if (
    latest.direction === 'outgoing'
  ) {
    waitingOn = 'customer'
    pendingFact = 'customer_response'
  } else if (
    latest.direction === 'incoming'
  ) {
    waitingOn = 'seller'
    pendingFact = 'seller_response'
  }

  // R2.4: a instrução de guard cita evidence_message_ids como "prova do
  // que o vendedor/cliente já fez" — uma claim de autoria. A última
  // mensagem só entra como evidência quando seu author_kind confirma o
  // papel implícito em sua direction (outgoing→human_agent,
  // incoming→customer); automation/unknown nunca viram prova de ação do
  // vendedor nem de decisão do cliente, mesmo sendo a mensagem mais
  // recente.
  const latestAuthorshipConfirmed =
    (
      latest.direction === 'outgoing' &&
      latest.author_kind === 'human_agent'
    ) ||
    (
      latest.direction === 'incoming' &&
      latest.author_kind === 'customer'
    )

  const evidenceIds =
    [
      ...(
        latestAuthorshipConfirmed
          ? [latest.id]
          : []
      ),
      ...outgoingMessages
        .filter(
          message =>
            matchesAny(
              messageText(message),
              SELLER_ACTION_PATTERNS,
            ),
        )
        .map(message => message.id),
    ]
      .filter(
        (id): id is string =>
          typeof id === 'string' &&
          Boolean(id),
      )

  return {
    pending_fact:
      pendingFact,
    seller_action_already_performed:
      sellerActionAlreadyPerformed,
    waiting_on:
      waitingOn,
    evidence_message_ids:
      Array.from(
        new Set(evidenceIds),
      ),
  }
}
