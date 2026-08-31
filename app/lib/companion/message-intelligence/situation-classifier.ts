import type {
  MessageContextSnapshotV1,
} from './context-snapshot'

import type {
  SituationClassificationV1,
  SituationEvidenceV1,
  StrategyKnowledgeHintsV1,
} from './strategy-contracts'

function normalizeText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAny(
  text: string,
  patterns: readonly string[],
): boolean {
  return patterns.some(
    pattern => text.includes(pattern),
  )
}

function activeMemory(
  item: { memory_status?: unknown },
): boolean {
  const status =
    String(item.memory_status ?? 'active')
      .toLocaleLowerCase('en')

  return ![
    'closed',
    'resolved',
    'superseded',
    'inactive',
  ].includes(status)
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
  const active =
    items.filter(activeMemory)

  if (active.length === 0) {
    return []
  }

  const ids = [
    ...new Set(
      active.flatMap(item => [
        ...(item.memory_id
          ? [item.memory_id]
          : []),
        ...(item.evidence_message_ids ?? []),
      ]),
    ),
  ].sort()

  return [{
    source: 'memory',
    ids,
    signal,
  }]
}

function latestIncoming(
  snapshot: MessageContextSnapshotV1,
) {
  const current =
    snapshot.conversation
      .current_interaction
      ?.messages
      ?.filter(
        (item: { direction: string }) =>
          item.direction === 'incoming',
      ) ?? []

  const source =
    current.length > 0
      ? current
      : snapshot.conversation.messages.filter(
          (item: { direction: string }) =>
            item.direction === 'incoming',
        )

  return source.at(-1) ?? null
}

function messageText(
  message: {
    text_content?: string | null
    audio_transcription?: string | null
  } | null,
): string {
  if (!message) {
    return ''
  }

  return normalizeText(
    message.text_content ??
      message.audio_transcription ??
      '',
  )
}

function messageEvidence(
  message: { message_id?: string } | null,
  signal: string,
): SituationEvidenceV1[] {
  if (!message) {
    return []
  }

  return [{
    source: 'message',
    ids: message.message_id
      ? [message.message_id]
      : [],
    signal,
  }]
}

function result(
  situation: SituationClassificationV1['situation'],
  confidence: SituationClassificationV1['confidence'],
  evidence: SituationEvidenceV1[],
): SituationClassificationV1 {
  return {
    situation,
    confidence,
    evidence,
  }
}

const REJECTION_PATTERNS = [
  'nao tenho interesse',
  'nao quero',
  'pode encerrar',
  'nao me procure',
  'pare de me chamar',
  'nao vou comprar',
  'desisti',
] as const

const POSTPONEMENT_PATTERNS = [
  'mais pra frente',
  'mais para frente',
  'mes que vem',
  'proximo mes',
  'ano que vem',
  'depois eu vejo',
  'falamos depois',
  'me chama depois',
  'agora nao',
  'deixa para depois',
] as const

const CLOSING_PATTERNS = [
  'quero fechar',
  'vamos fechar',
  'pode fechar',
  'quero contratar',
  'vamos seguir',
  'pode prosseguir',
  'como eu contrato',
  'onde eu assino',
] as const

const COMPARISON_PATTERNS = [
  'compar',
  'diferenca entre',
  'versus',
  ' vs ',
  'concorrente',
  'melhor que',
] as const

const UNCERTAINTY_PATTERNS = [
  'nao sei',
  'nao tenho certeza',
  'estou em duvida',
  'tenho duvida',
  'estou inseguro',
  'preciso pensar',
  'vou pensar',
  'vou analisar',
] as const

const OBJECTION_PATTERNS = [
  'esta caro',
  'muito caro',
  'nao cabe no orcamento',
  'sem orcamento',
  'nao vejo valor',
  'nao confio',
  'nao funciona para mim',
  'nao serve para mim',
  'prefiro o concorrente',
] as const

const INFORMATION_PATTERNS = [
  'quanto custa',
  'qual o valor',
  'qual valor',
  'preco',
  'formas de pagamento',
  'forma de pagamento',
  'tem contrato',
  'como funciona',
  'qual horario',
  'tem desconto',
  'qual condicao',
  'quais condicoes',
] as const

export function classifyCommercialSituationV1(
  snapshot: MessageContextSnapshotV1,
  hints: StrategyKnowledgeHintsV1 | null = null,
): SituationClassificationV1 {
  if (
    snapshot.commercial
      .commercial_relevance
      ?.value === 'non_commercial'
  ) {
    return result(
      'non_commercial',
      'high',
      [{
        source: 'commercial_reading',
        ids: [],
        signal:
          'Commercial reading marcou a interação como não comercial.',
      }],
    )
  }

  if (hints?.situation_hint) {
    return result(
      hints.situation_hint,
      'high',
      [{
        source: 'knowledge_hint',
        ids: [...(hints.evidence_ids ?? [])].sort(),
        signal:
          'Boundary de conhecimento forneceu classificação explícita.',
      }],
    )
  }

  const latest =
    latestIncoming(snapshot)
  const text =
    messageText(latest)

  if (
    text &&
    includesAny(
      text,
      REJECTION_PATTERNS,
    )
  ) {
    return result(
      'rejection',
      'high',
      messageEvidence(
        latest,
        'Recusa explícita de continuidade.',
      ),
    )
  }

  if (
    text &&
    includesAny(
      text,
      POSTPONEMENT_PATTERNS,
    )
  ) {
    return result(
      'postponement',
      'high',
      messageEvidence(
        latest,
        'Adiamento explícito sem recusa definitiva.',
      ),
    )
  }

  if (
    text &&
    includesAny(
      text,
      CLOSING_PATTERNS,
    )
  ) {
    return result(
      'closing',
      'high',
      messageEvidence(
        latest,
        'Intenção explícita de avançar ou contratar.',
      ),
    )
  }

  const objectionEvidence =
    customerMemoryEvidence(
      snapshot.customer.objections,
      'Existe objeção comercial ativa no snapshot.',
    )

  const looksLikeQuestion =
    Boolean(text) &&
    (
      text.includes('?') ||
      includesAny(
        text,
        INFORMATION_PATTERNS,
      )
    )

  if (
    text &&
    includesAny(
      text,
      COMPARISON_PATTERNS,
    )
  ) {
    return result(
      'comparison',
      'high',
      messageEvidence(
        latest,
        'Comparação comercial explícita.',
      ),
    )
  }

  if (
    looksLikeQuestion &&
    !includesAny(
      text,
      OBJECTION_PATTERNS,
    )
  ) {
    return result(
      'information_request',
      'high',
      messageEvidence(
        latest,
        'Pedido de informação sem resistência comercial explícita.',
      ),
    )
  }

  if (
    objectionEvidence.length > 0 ||
    (
      text &&
      includesAny(
        text,
        OBJECTION_PATTERNS,
      )
    )
  ) {
    return result(
      'objection',
      objectionEvidence.length > 0
        ? 'high'
        : 'medium',
      [
        ...objectionEvidence,
        ...(
          text
            ? messageEvidence(
                latest,
                'Barreira comercial observável.',
              )
            : []
        ),
      ],
    )
  }

  const uncertaintyEvidence =
    customerMemoryEvidence(
      snapshot.customer.uncertainties,
      'Existe incerteza ativa no snapshot.',
    )

  if (
    uncertaintyEvidence.length > 0 ||
    (
      text &&
      includesAny(
        text,
        UNCERTAINTY_PATTERNS,
      )
    )
  ) {
    const decisionPending =
      text &&
      includesAny(
        text,
        [
          'preciso pensar',
          'vou pensar',
          'vou analisar',
        ],
      )

    return result(
      decisionPending
        ? 'decision_pending'
        : 'uncertainty',
      uncertaintyEvidence.length > 0
        ? 'high'
        : 'medium',
      [
        ...uncertaintyEvidence,
        ...messageEvidence(
          latest,
          decisionPending
            ? 'Decisão ainda pendente.'
            : 'Incerteza explícita.',
        ),
      ],
    )
  }

  if (
    snapshot.commercial
      .recovery_guidance
      ?.value
  ) {
    const recovery =
      snapshot.commercial
        .recovery_guidance.value

    return result(
      'recovery',
      'high',
      [{
        source: 'commercial_reading',
        ids: [
          ...(recovery.evidence_message_ids ?? []),
          ...(recovery.memory_ids ?? []),
        ].sort(),
        signal:
          'Commercial reading determinou necessidade de recuperação.',
      }],
    )
  }

  const commitmentEvidence =
    customerMemoryEvidence(
      snapshot.customer.commitments,
      'Existe compromisso comercial pendente.',
    )

  if (commitmentEvidence.length > 0) {
    return result(
      'commitment_pending',
      'high',
      commitmentEvidence,
    )
  }

  const competitorEvidence =
    customerMemoryEvidence(
      snapshot.customer.competitors,
      'Existe alternativa ou concorrente ativo no contexto.',
    )

  if (competitorEvidence.length > 0) {
    return result(
      'comparison',
      'medium',
      competitorEvidence,
    )
  }

  const missingDiscoveryEvidence =
    customerMemoryEvidence(
      snapshot.customer.missing_discovery,
      'Há descoberta comercial relevante ainda faltante.',
    )

  if (missingDiscoveryEvidence.length > 0) {
    return result(
      'discovery',
      'medium',
      missingDiscoveryEvidence,
    )
  }

  const sellerIntent =
    normalizeText(
      snapshot.seller_intent?.value ?? '',
    )

  if (
    includesAny(
      sellerIntent,
      [
        'follow up',
        'follow-up',
        'retomar contato',
        'cobrar retorno',
      ],
    )
  ) {
    return result(
      'follow_up',
      'medium',
      [{
        source: 'seller_intent',
        ids: [],
        signal:
          'Intenção do vendedor é retomar uma continuidade comercial já existente.',
      }],
    )
  }

  if (!latest && !text) {
    return result(
      'insufficient_context',
      'low',
      [{
        source: 'commercial_reading',
        ids: [],
        signal:
          'Não há mensagem recebida nem memória comercial suficiente para orientar movimento.',
      }],
    )
  }

  return result(
    'insufficient_context',
    'low',
    messageEvidence(
      latest,
      'A evidência atual não permite classificar a situação com segurança.',
    ),
  )
}
