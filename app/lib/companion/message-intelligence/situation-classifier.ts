import type {
  MessageContextSnapshotV1,
} from './context-snapshot'

import type {
  SituationClassificationV1,
  SituationEvidenceV1,
  StrategyKnowledgeHintsV1,
} from './strategy-contracts'

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAny(text: string, patterns: readonly string[]): boolean {
  return patterns.some(pattern => text.includes(pattern))
}

function activeMemory(item: { memory_status?: unknown }): boolean {
  const status = String(item.memory_status ?? 'active').toLocaleLowerCase('en')
  return !['closed', 'resolved', 'superseded', 'inactive'].includes(status)
}

function customerMemoryEvidence(
  items: Array<{
    memory_id?: string | null
    summary?: string
    memory_status?: unknown
    evidence_message_ids?: string[]
  }>,
  signal: string,
): SituationEvidenceV1[] {
  const active = items.filter(activeMemory)
  if (active.length === 0) return []

  const ids = [
    ...new Set(
      active.flatMap(item => [
        ...(item.memory_id ? [item.memory_id] : []),
        ...(item.evidence_message_ids ?? []),
      ]),
    ),
  ].sort()

  return [{ source: 'memory', ids, signal }]
}

function incomingMessages(snapshot: MessageContextSnapshotV1) {
  const current =
    snapshot.conversation.current_interaction?.messages?.filter(
      (item: { direction: string }) => item.direction === 'incoming',
    ) ?? []

  return current.length > 0
    ? current
    : snapshot.conversation.messages.filter(
        (item: { direction: string }) => item.direction === 'incoming',
      )
}

function latestIncoming(snapshot: MessageContextSnapshotV1) {
  return incomingMessages(snapshot).at(-1) ?? null
}

function latestIncomingBurst(snapshot: MessageContextSnapshotV1) {
  const incoming = incomingMessages(snapshot)
  const latest = incoming.at(-1)
  if (!latest) return []

  const latestAt = Date.parse(latest.occurred_at)

  return incoming.filter(message => {
    const messageAt = Date.parse(message.occurred_at)
    if (Number.isFinite(latestAt) && Number.isFinite(messageAt)) {
      return messageAt === latestAt
    }
    return message.occurred_at === latest.occurred_at
  })
}

function messageText(
  message: {
    text_content?: string | null
    audio_transcription?: string | null
  } | null,
): string {
  if (!message) return ''
  return normalizeText(
    message.text_content ?? message.audio_transcription ?? '',
  )
}

function burstMessageMatching(
  burst: ReturnType<typeof latestIncomingBurst>,
  predicate: (text: string) => boolean,
) {
  for (let index = burst.length - 1; index >= 0; index -= 1) {
    const message = burst[index]
    if (predicate(messageText(message))) return message
  }
  return null
}

function messageEvidence(
  message: { message_id?: string } | null,
  signal: string,
): SituationEvidenceV1[] {
  if (!message) return []
  return [{
    source: 'message',
    ids: message.message_id ? [message.message_id] : [],
    signal,
  }]
}

function result(
  situation: SituationClassificationV1['situation'],
  confidence: SituationClassificationV1['confidence'],
  evidence: SituationEvidenceV1[],
): SituationClassificationV1 {
  return { situation, confidence, evidence }
}

const REJECTION_PATTERNS = [
  'nao tenho interesse', 'nao quero', 'pode encerrar', 'nao me procure',
  'pare de me chamar', 'nao vou comprar', 'desisti',
] as const

const POSTPONEMENT_PATTERNS = [
  'mais pra frente', 'mais para frente', 'mes que vem', 'proximo mes',
  'ano que vem', 'depois eu vejo', 'falamos depois', 'me chama depois',
  'agora nao', 'deixa para depois',
] as const

const CLOSING_PATTERNS = [
  'quero fechar', 'vamos fechar', 'pode fechar', 'quero contratar',
  'vamos seguir', 'pode prosseguir', 'como eu contrato', 'onde eu assino',
] as const

const COMPARISON_PATTERNS = [
  'compar', 'diferenca entre', 'versus', ' vs ', 'concorrente', 'melhor que',
] as const

const UNCERTAINTY_PATTERNS = [
  'nao sei', 'nao tenho certeza', 'estou em duvida', 'tenho duvida',
  'estou inseguro', 'preciso pensar', 'vou pensar', 'vou analisar',
] as const

const OBJECTION_PATTERNS = [
  'esta caro', 'muito caro', 'nao cabe no orcamento', 'sem orcamento',
  'nao vejo valor', 'nao confio', 'nao funciona para mim',
  'nao serve para mim', 'prefiro o concorrente',
] as const

const INFORMATION_PATTERNS = [
  'quanto custa', 'qual o valor', 'qual valor', 'preco',
  'formas de pagamento', 'forma de pagamento', 'tem contrato',
  'como funciona', 'qual horario', 'tem desconto', 'qual condicao',
  'quais condicoes',
] as const

const RELATIONSHIP_INTENT_PATTERNS = [
  'conversa descontraida', 'conversa casual', 'fortalecer vinculo',
  'fortalecer relacionamento', 'sem objetivo comercial',
  'responder de forma casual',
] as const

function supportAvailabilityIntent(text: string): boolean {
  const hasOffer = /\b(?:oferecer|ofereco|manter|ficar|deixar)\b/u.test(text)
  const hasSupport = /\b(?:apoio|ajuda|auxilio|auxiliar|disponibilidade|disponivel)\b/u.test(text)
  const hasSupportContext = /\b(?:pendenc|administrativ|operacion|duvid|necessidad|ajudar)\w*/u.test(text)

  return (
    (hasOffer && hasSupport) ||
    (hasSupport && hasSupportContext)
  )
}

function sellerIntentReopensObjection(text: string): boolean {
  return /\b(?:objecao|barreira|resistencia|preco|caro|orcamento)\w*/u.test(text)
}

function sellerIntentReopensUncertainty(text: string): boolean {
  return /\b(?:duvida|incerteza|indecis|decisao|pensar|analisar|risco)\w*/u.test(text)
}

function sellerIntentReopensCommitment(text: string): boolean {
  return /\b(?:confirmar|reafirmar|agendamento|agendar|horario combinado|demonstracao|encontro|reuniao|compromisso|fechamento)\b/u.test(text)
}

function sellerIntentReopensComparison(text: string): boolean {
  return /\b(?:comparar|comparacao|concorrente|alternativa|versus)\b/u.test(text)
}

function sellerIntentReopensDiscovery(text: string): boolean {
  return /\b(?:descobrir|diagnosticar|discovery|perguntar|entender necessidade|aprofundar)\b/u.test(text)
}

function explicitCommitmentConfirmation(text: string): boolean {
  return /^(?:agendado|confirmado|combinado|fechado|fechou entao)\b/u.test(text)
}

function explicitActionCommitment(text: string): boolean {
  const actionCommitment =
    /\b(?:vou|vamos)\s+(?:mandar|enviar|fazer|verificar|resolver|providenciar|confirmar|retornar|responder)\b/u.test(text) ||
    /\b(?:pode deixar|deixa comigo)\b/u.test(text)

  const temporalPresenceCommitment =
    /\b(?:amanha|hoje|depois de amanha)\s+(?:eu\s+)?(?:estou|vou|estarei)\s+(?:ai|la)\b/u.test(text) ||
    /\b(?:eu\s+)?(?:vou|estarei)\s+(?:ai|la)\s+(?:amanha|hoje|depois de amanha)\b/u.test(text) ||
    /\b(?:eu\s+)?(?:vou|estarei)\s+(?:amanha|hoje|depois de amanha)\b/u.test(text)

  return actionCommitment || temporalPresenceCommitment
}

export function classifyCommercialSituationV1(
  snapshot: MessageContextSnapshotV1,
  hints: StrategyKnowledgeHintsV1 | null = null,
): SituationClassificationV1 {
  if (snapshot.commercial.commercial_relevance?.value === 'non_commercial') {
    return result('non_commercial', 'high', [{
      source: 'commercial_reading',
      ids: [],
      signal: 'Commercial reading marcou a interação como não comercial.',
    }])
  }

  if (hints?.situation_hint) {
    return result(hints.situation_hint, 'high', [{
      source: 'knowledge_hint',
      ids: [...(hints.evidence_ids ?? [])].sort(),
      signal: 'Boundary de conhecimento forneceu classificação explícita.',
    }])
  }

  const sellerIntent = normalizeText(snapshot.seller_intent?.value ?? '')
  const latest = latestIncoming(snapshot)
  const text = messageText(latest)
  const burst = latestIncomingBurst(snapshot)
  const hasCurrentIncoming = Boolean(text)

  const commitmentConfirmationMessage = burstMessageMatching(
    burst,
    explicitCommitmentConfirmation,
  )
  if (commitmentConfirmationMessage) {
    return result('closing', 'high', messageEvidence(
      commitmentConfirmationMessage,
      'Confirmação explícita de compromisso ou agendamento no último burst recebido.',
    ))
  }

  const rejectionMessage = burstMessageMatching(
    burst,
    value => includesAny(value, REJECTION_PATTERNS),
  )
  if (rejectionMessage) {
    return result('rejection', 'high', messageEvidence(
      rejectionMessage,
      'Recusa explícita de continuidade no último burst recebido.',
    ))
  }

  const postponementMessage = burstMessageMatching(
    burst,
    value => includesAny(value, POSTPONEMENT_PATTERNS),
  )
  if (postponementMessage) {
    return result('postponement', 'high', messageEvidence(
      postponementMessage,
      'Adiamento explícito sem recusa definitiva no último burst recebido.',
    ))
  }

  const closingMessage = burstMessageMatching(
    burst,
    value => includesAny(value, CLOSING_PATTERNS),
  )
  if (closingMessage) {
    return result('closing', 'high', messageEvidence(
      closingMessage,
      'Intenção explícita de avançar ou contratar no último burst recebido.',
    ))
  }

  const actionCommitmentMessage = burstMessageMatching(
    burst,
    explicitActionCommitment,
  )
  if (actionCommitmentMessage) {
    return result('commitment_pending', 'high', messageEvidence(
      actionCommitmentMessage,
      'Compromisso explícito do cliente de executar a próxima ação no último burst recebido.',
    ))
  }

  const comparisonMessage = burstMessageMatching(
    burst,
    value => includesAny(value, COMPARISON_PATTERNS),
  )
  if (comparisonMessage) {
    return result('comparison', 'high', messageEvidence(
      comparisonMessage,
      'Comparação comercial explícita no último burst recebido.',
    ))
  }

  const objectionMessage = burstMessageMatching(
    burst,
    value => includesAny(value, OBJECTION_PATTERNS),
  )

  const questionMessage = burstMessageMatching(
    burst,
    value =>
      (value.includes('?') || includesAny(value, INFORMATION_PATTERNS)) &&
      !includesAny(value, OBJECTION_PATTERNS),
  )
  if (questionMessage) {
    return result('information_request', 'high', messageEvidence(
      questionMessage,
      'Pedido de informação no último burst recebido sem resistência comercial explícita.',
    ))
  }

  const objectionEvidence = customerMemoryEvidence(
    snapshot.customer.objections,
    'Existe objeção comercial ativa no snapshot.',
  )
  const objectionMemoryRelevant =
    !hasCurrentIncoming || sellerIntentReopensObjection(sellerIntent)

  if (objectionMessage || (objectionMemoryRelevant && objectionEvidence.length > 0)) {
    return result(
      'objection',
      objectionMessage ? 'medium' : 'high',
      [
        ...(objectionMemoryRelevant ? objectionEvidence : []),
        ...messageEvidence(
          objectionMessage,
          'Barreira comercial observável no último burst recebido.',
        ),
      ],
    )
  }

  const uncertaintyMessage = burstMessageMatching(
    burst,
    value => includesAny(value, UNCERTAINTY_PATTERNS),
  )
  const uncertaintyEvidence = customerMemoryEvidence(
    snapshot.customer.uncertainties,
    'Existe incerteza ativa no snapshot.',
  )
  const uncertaintyMemoryRelevant =
    !hasCurrentIncoming || sellerIntentReopensUncertainty(sellerIntent)

  if (uncertaintyMessage || (uncertaintyMemoryRelevant && uncertaintyEvidence.length > 0)) {
    const uncertaintyText = messageText(uncertaintyMessage)
    const decisionPending =
      Boolean(uncertaintyMessage) &&
      includesAny(uncertaintyText, ['preciso pensar', 'vou pensar', 'vou analisar'])

    return result(
      decisionPending ? 'decision_pending' : 'uncertainty',
      uncertaintyMessage ? 'medium' : 'high',
      [
        ...(uncertaintyMemoryRelevant ? uncertaintyEvidence : []),
        ...messageEvidence(
          uncertaintyMessage,
          decisionPending
            ? 'Decisão ainda pendente no último burst recebido.'
            : 'Incerteza explícita no último burst recebido.',
        ),
      ],
    )
  }

  if (
    includesAny(sellerIntent, RELATIONSHIP_INTENT_PATTERNS) ||
    supportAvailabilityIntent(sellerIntent)
  ) {
    return result('non_commercial', 'high', [{
      source: 'seller_intent',
      ids: [],
      signal:
        'O vendedor pediu continuidade relacional ou apoio sem objetivo comercial e o turno atual não contém sinal forte que deva prevalecer.',
    }])
  }

  if (snapshot.commercial.recovery_guidance?.value) {
    const recovery = snapshot.commercial.recovery_guidance.value
    return result('recovery', 'high', [{
      source: 'commercial_reading',
      ids: [
        ...(recovery.evidence_message_ids ?? []),
        ...(recovery.memory_ids ?? []),
      ].sort(),
      signal: 'Commercial reading determinou necessidade de recuperação.',
    }])
  }

  const commitmentEvidence = customerMemoryEvidence(
    snapshot.customer.commitments,
    'Existe compromisso comercial pendente.',
  )
  if (
    commitmentEvidence.length > 0 &&
    (!hasCurrentIncoming || sellerIntentReopensCommitment(sellerIntent))
  ) {
    return result('commitment_pending', 'high', commitmentEvidence)
  }

  const competitorEvidence = customerMemoryEvidence(
    snapshot.customer.competitors,
    'Existe alternativa ou concorrente ativo no contexto.',
  )
  if (
    competitorEvidence.length > 0 &&
    (!hasCurrentIncoming || sellerIntentReopensComparison(sellerIntent))
  ) {
    return result('comparison', 'medium', competitorEvidence)
  }

  const missingDiscoveryEvidence = customerMemoryEvidence(
    snapshot.customer.missing_discovery,
    'Há descoberta comercial relevante ainda faltante.',
  )
  if (
    missingDiscoveryEvidence.length > 0 &&
    (!hasCurrentIncoming || sellerIntentReopensDiscovery(sellerIntent))
  ) {
    return result('discovery', 'medium', missingDiscoveryEvidence)
  }

  if (
    includesAny(sellerIntent, ['follow up', 'follow-up', 'retomar contato', 'cobrar retorno'])
  ) {
    return result('follow_up', 'medium', [{
      source: 'seller_intent',
      ids: [],
      signal: 'Intenção do vendedor é retomar uma continuidade comercial já existente.',
    }])
  }

  if (!latest && !text) {
    return result('insufficient_context', 'low', [{
      source: 'commercial_reading',
      ids: [],
      signal: 'Não há mensagem recebida nem memória comercial suficiente para orientar movimento.',
    }])
  }

  return result(
    'insufficient_context',
    'low',
    messageEvidence(
      latest,
      'A evidência atual não permite classificar a situação com segurança; memória histórica não substitui relevância do turno atual.',
    ),
  )
}
