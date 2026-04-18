import type { LeadStatus } from '@/app/types/sales_cycles'
import type { AISalesContext, AISalesSuggestion, ConversationSource } from '@/app/types/ai-sales'
import {
  TERMINAL_SALES_CYCLE_STATUSES as TERMINAL_STATUSES,
  buildSalesCycleAIGuide,
  getSalesCycleLabel,
} from '@/app/lib/sales-cycle-status'

type AnalyzeConversationInput = {
  context: AISalesContext
  conversationText: string
  source: ConversationSource
}

type ProviderRawSuggestion = {
  recommended_status?: string
  confidence?: number
  action_channel?: string | null
  action_result?: string | null
  result_detail?: string | null
  next_action?: string | null
  next_action_date?: string | null
  summary?: string
  tags?: string[]
  should_close_won?: boolean
  should_close_lost?: boolean
  close_reason?: string | null
  reason_for_recommendation?: string
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini'

function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0.6
  return Math.max(0, Math.min(1, n))
}

function isLeadStatus(value: unknown): value is LeadStatus {
  return (
    typeof value === 'string' &&
    ['novo', 'contato', 'respondeu', 'negociacao', 'pausado', 'cancelado', 'ganho', 'perdido'].includes(value)
  )
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term))
}

function inferChannel(text: string, source: ConversationSource): string | null {
  if (source === 'whatsapp') return 'Whats'
  if (source === 'phone_summary') return 'Ligação'

  if (containsAny(text, ['whatsapp', 'wpp', 'zap', 'mensagem'])) return 'Whats'
  if (containsAny(text, ['ligação', 'ligacao', 'telefone', 'liguei', 'falamos por telefone'])) return 'Ligação'
  if (containsAny(text, ['email', 'e-mail'])) return 'Email'
  if (containsAny(text, ['presencial', 'pessoalmente', 'visita'])) return 'Presencial'

  return null
}

function buildFutureIso(hoursAhead: number): string {
  const d = new Date(Date.now() + hoursAhead * 60 * 60 * 1000)
  return d.toISOString()
}

function defaultNextActionForStatus(status: LeadStatus): string | null {
  switch (status) {
    case 'novo':
      return 'Entrar em contato'
    case 'contato':
      return 'Nova tentativa de contato'
    case 'respondeu':
      return 'Confirmar agenda / próximo passo'
    case 'negociacao':
      return 'Retornar negociação'
    default:
      return null
  }
}

function extractTags(text: string): string[] {
  const tags = new Set<string>()

  if (containsAny(text, ['preço', 'preco', 'caro', 'desconto', 'valor'])) tags.add('objecao_preco')
  if (containsAny(text, ['proposta', 'condição', 'condicao', 'parcelado', 'avista', 'pix'])) tags.add('condicao_comercial')
  if (containsAny(text, ['respondeu', 'retornou', 'me respondeu', 'falou comigo'])) tags.add('houve_resposta')
  if (containsAny(text, ['sem resposta', 'não respondeu', 'nao respondeu', 'visualizou e não respondeu', 'visualizou e nao respondeu'])) tags.add('sem_resposta')
  if (containsAny(text, ['agendar', 'agenda', 'marcou', 'quarta', 'quinta', 'sexta', 'amanhã', 'amanha', 'horário', 'horario', 'retorno', 'retorna'])) tags.add('retorno_agendado')
  if (containsAny(text, ['fechou', 'pagou', 'assinou', 'matriculou', 'confirmou pagamento'])) tags.add('fechamento_confirmado')
  if (containsAny(text, ['sem interesse', 'não quer', 'nao quer', 'desistiu', 'concorrente'])) tags.add('risco_perda')

  return Array.from(tags)
}

function textHasNegotiationEvidence(text: string): boolean {
  return containsAny(text, [
    'proposta',
    'valor',
    'preço',
    'preco',
    'desconto',
    'parcelado',
    'avista',
    'pix',
    'condição',
    'condicao',
    'pensar até',
    'retorna na sexta',
    'retorno na sexta',
    'negociar',
    'negociação',
    'negociacao',
    'achou caro',
    'achou o valor alto',
    'concorrente',
    'comparando plano',
    'comparando preço',
    'comparando preco',
    'condição especial',
    'condicao especial',
  ])
}

function textHasAgendaEvidence(text: string): boolean {
  return containsAny(text, [
    'respondeu',
    'me respondeu',
    'retornou',
    'quer saber',
    'pediu mais informações',
    'pediu mais informacoes',
    'demonstrou interesse',
    'aceitou continuar',
    'aceitou falar',
    'agendar',
    'agenda',
    'marcou',
    'marcamos',
    'quarta',
    'quinta',
    'sexta',
    'amanhã',
    'amanha',
    'horário',
    'horario',
    'retorno',
    'retorna',
    'combinado',
    'vai vir',
    'vai passar',
    'passa aqui',
    'visita',
    'vir aqui',
  ])
}

function recentEventsSuggestNegotiation(context: AISalesContext): boolean {
  return (context.recent_events ?? []).some((event) => {
    const haystack = [
      event.to_status,
      event.action_result,
      event.result_detail,
      event.next_action,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return (
      event.to_status === 'negociacao' ||
      textHasNegotiationEvidence(haystack)
    )
  })
}

function recentEventsSuggestAgenda(context: AISalesContext): boolean {
  return (context.recent_events ?? []).some((event) => {
    const haystack = [
      event.to_status,
      event.action_result,
      event.result_detail,
      event.next_action,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return (
      event.to_status === 'respondeu' ||
      textHasAgendaEvidence(haystack)
    )
  })
}

function heuristicSuggestion(input: AnalyzeConversationInput): AISalesSuggestion {
  const text = normalizeWhitespace(input.conversationText).toLowerCase()
  const currentStatus = input.context.current_status
  const channel = inferChannel(text, input.source)

  if (TERMINAL_STATUSES.includes(currentStatus)) {
    return {
      recommended_status: currentStatus,
      confidence: 0.95,
      action_channel: channel,
      action_result: null,
      result_detail: null,
      next_action: null,
      next_action_date: null,
      summary: 'O ciclo já está em estado terminal. A análise foi mantida apenas como leitura.',
      tags: ['ciclo_terminal'],
      should_close_won: false,
      should_close_lost: false,
      close_reason: null,
      reason_for_recommendation: 'Ciclo já fechado ou cancelado, portanto não deve ser movimentado automaticamente.',
      source: 'fallback',
    }
  }

  const explicitWon = containsAny(text, [
    'fechou',
    'pagou',
    'assinou',
    'matriculou',
    'confirmou pagamento',
    'comprou',
    'contrato assinado',
  ])

  if (explicitWon) {
    return {
      recommended_status: 'ganho',
      confidence: 0.93,
      action_channel: channel,
      action_result: null,
      result_detail: 'Há evidência textual clara de fechamento comercial.',
      next_action: null,
      next_action_date: null,
      summary: 'A conversa indica fechamento confirmado.',
      tags: extractTags(text),
      should_close_won: true,
      should_close_lost: false,
      close_reason: null,
      reason_for_recommendation: 'Foram detectados sinais claros de fechamento concluído.',
      source: 'fallback',
    }
  }

  const explicitLost = containsAny(text, [
    'sem interesse',
    'não quer',
    'nao quer',
    'desistiu',
    'fechou com concorrente',
    'contato inválido',
    'contato invalido',
    'fora do perfil',
  ])

  if (explicitLost) {
    return {
      recommended_status: 'perdido',
      confidence: 0.9,
      action_channel: channel,
      action_result: null,
      result_detail: 'Há evidência textual clara de perda comercial.',
      next_action: null,
      next_action_date: null,
      summary: 'A conversa indica perda do lead.',
      tags: extractTags(text),
      should_close_won: false,
      should_close_lost: true,
      close_reason: containsAny(text, ['preço', 'preco', 'caro']) ? 'Preço' : 'Sem interesse',
      reason_for_recommendation: 'Foram detectados sinais claros de encerramento negativo.',
      source: 'fallback',
    }
  }

  const negotiationEvidence = textHasNegotiationEvidence(text) || recentEventsSuggestNegotiation(input.context)

  if (negotiationEvidence) {
    return {
      recommended_status: 'negociacao',
      confidence: 0.86,
      action_channel: channel,
      action_result: 'Objeção ou discussão comercial identificada',
      result_detail: `A conversa mostra sinais claros de ${getSalesCycleLabel('negociacao').toLowerCase()}: preço, proposta, condição comercial, comparação ou objeção.`,
      next_action: 'Retornar negociação',
      next_action_date: buildFutureIso(24),
      summary: 'Há sinais de negociação ativa ou objeção comercial em andamento.',
      tags: extractTags(text),
      should_close_won: false,
      should_close_lost: false,
      close_reason: null,
      reason_for_recommendation: 'Foi detectada semântica de negociação. Nesse caso, não é só agenda: já existe discussão comercial em curso.',
      source: 'fallback',
    }
  }

  const agendaEvidence = textHasAgendaEvidence(text) || recentEventsSuggestAgenda(input.context)

  if (agendaEvidence) {
    return {
      recommended_status: 'respondeu',
      confidence: 0.82,
      action_channel: channel,
      action_result: 'Lead respondeu com continuidade concreta',
      result_detail: `No sistema, ${getSalesCycleLabel('respondeu')} é o nome visual da etapa interna "respondeu". A conversa indica resposta com próximo passo concreto.`,
      next_action: 'Confirmar agenda / próximo passo',
      next_action_date: buildFutureIso(12),
      summary: 'O lead respondeu e existe continuidade objetiva para a conversa ou visita.',
      tags: extractTags(text),
      should_close_won: false,
      should_close_lost: false,
      close_reason: null,
      reason_for_recommendation: 'Foi detectada resposta real do lead com continuidade concreta, mas sem sinais fortes de negociação comercial.',
      source: 'fallback',
    }
  }

  const noResponseEvidence = containsAny(text, [
    'sem resposta',
    'não respondeu',
    'nao respondeu',
    'mensagem enviada',
    'tentativa de contato',
    'liguei e não atendeu',
    'liguei e nao atendeu',
    'visualizou e não respondeu',
    'visualizou e nao respondeu',
  ])

  if (noResponseEvidence) {
    return {
      recommended_status: 'contato',
      confidence: 0.78,
      action_channel: channel,
      action_result: 'Tentativa de contato (sem resposta)',
      result_detail: 'Houve ação de contato, mas sem retorno do lead.',
      next_action: 'Nova tentativa de contato',
      next_action_date: buildFutureIso(24),
      summary: 'Foi realizado contato, porém ainda sem resposta do lead.',
      tags: extractTags(text),
      should_close_won: false,
      should_close_lost: false,
      close_reason: null,
      reason_for_recommendation: 'A conversa indica tentativa de contato sem resposta, portanto o ciclo deve sair de novo para contato.',
      source: 'fallback',
    }
  }

  return {
    recommended_status: currentStatus === 'novo' ? 'novo' : currentStatus,
    confidence: 0.55,
    action_channel: channel,
    action_result: null,
    result_detail: null,
    next_action: currentStatus === 'novo' ? 'Entrar em contato' : defaultNextActionForStatus(currentStatus),
    next_action_date: currentStatus === 'novo' ? null : buildFutureIso(24),
    summary: 'O texto não trouxe evidência forte o suficiente para uma mudança mais precisa.',
    tags: extractTags(text),
    should_close_won: false,
    should_close_lost: false,
    close_reason: null,
    reason_for_recommendation: 'Sem evidência suficiente para classificação mais avançada.',
    source: 'fallback',
  }
}

function sanitizeSuggestion(
  raw: ProviderRawSuggestion | null,
  fallback: AISalesSuggestion,
  context: AISalesContext
): AISalesSuggestion {
  if (!raw) return fallback

  const recommendedStatus: LeadStatus =
    isLeadStatus(raw.recommended_status) ? raw.recommended_status : fallback.recommended_status

  const suggestion: AISalesSuggestion = {
    recommended_status: recommendedStatus,
    confidence: clampConfidence(raw.confidence),
    action_channel: raw.action_channel ?? fallback.action_channel,
    action_result: raw.action_result ?? fallback.action_result,
    result_detail: raw.result_detail ?? fallback.result_detail,
    next_action: raw.next_action ?? fallback.next_action,
    next_action_date: raw.next_action_date ?? fallback.next_action_date,
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : fallback.summary,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((v): v is string => typeof v === 'string') : fallback.tags,
    should_close_won: Boolean(raw.should_close_won),
    should_close_lost: Boolean(raw.should_close_lost),
    close_reason: raw.close_reason ?? null,
    reason_for_recommendation:
      typeof raw.reason_for_recommendation === 'string' && raw.reason_for_recommendation.trim()
        ? raw.reason_for_recommendation.trim()
        : fallback.reason_for_recommendation,
    source: 'ai',
  }

  if (TERMINAL_STATUSES.includes(context.current_status)) {
    return {
      ...fallback,
      summary: 'O ciclo atual já está terminal. A sugestão foi neutralizada.',
      reason_for_recommendation: 'Não é seguro sugerir movimentação para um ciclo já encerrado.',
    }
  }

  if (suggestion.recommended_status === 'novo') {
    suggestion.next_action = 'Entrar em contato'
    suggestion.next_action_date = null
  }

  if (suggestion.recommended_status === 'respondeu' && !suggestion.next_action) {
    suggestion.next_action = 'Confirmar agenda / próximo passo'
  }

  if (suggestion.recommended_status === 'ganho') {
    suggestion.should_close_won = true
    suggestion.should_close_lost = false
  }

  if (suggestion.recommended_status === 'perdido') {
    suggestion.should_close_lost = true
    suggestion.should_close_won = false
  }

  return suggestion
}

function buildSystemPrompt(): string {
  return [
    'Você é um copiloto comercial.',
    'Sua função é ler uma conversa de vendas e devolver JSON puro.',
    'Nunca escreva texto fora do JSON.',
    'Analise o contexto do ciclo atual e recomende o estágio mais fiel ao que aconteceu de verdade.',
    buildSalesCycleAIGuide(),
    'O contexto pode incluir recent_events, que trazem o histórico recente do ciclo. Use esse histórico para entender o que já aconteceu antes da conversa atual.',
    'Mantenha coerência entre o texto atual e os eventos recentes.',
    'Você pode recomendar avanço direto de novo para respondeu ou negociacao se a conversa mostrar que isso já aconteceu na prática.',
    'Você não deve forçar passagem obrigatória por todas as etapas se a conversa já indicar estágio mais avançado.',
    'Só recomende ganho ou perdido quando houver evidência explícita.',
    'Se não houver evidência forte, seja conservador.',
    'Campos obrigatórios no JSON:',
    'recommended_status, confidence, action_channel, action_result, result_detail, next_action, next_action_date, summary, tags, should_close_won, should_close_lost, close_reason, reason_for_recommendation',
    'Use os status válidos: novo, contato, respondeu, negociacao, ganho, perdido.',
    'Lembre que respondeu é o nome interno da etapa visual AGENDA.',
    'Se houver tentativa sem resposta, normalmente o estágio correto é contato.',
    'Se houver resposta real do lead com próximo passo concreto, normalmente o estágio correto é respondeu/AGENDA.',
    'Se houver proposta, objeção, condição comercial ou pedido de pensar, o estágio correto pode ser negociacao mesmo que o ciclo ainda esteja em novo.',
    'Se a conversa indicar compra concluída, use ganho.',
    'Se a conversa indicar desinteresse definitivo ou perda clara, use perdido.',
  ].join(' ')
}

async function callOpenAI(input: AnalyzeConversationInput): Promise<ProviderRawSuggestion | null> {
  if (!OPENAI_API_KEY) return null

  const promptPayload = {
    context: input.context,
    source: input.source,
    conversation_text: input.conversationText,
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(),
        },
        {
          role: 'user',
          content: JSON.stringify(promptPayload),
        },
      ],
    }),
  })

  if (!response.ok) {
    return null
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content

  if (!content || typeof content !== 'string') {
    return null
  }

  try {
    return JSON.parse(content) as ProviderRawSuggestion
  } catch {
    return null
  }
}

export async function analyzeConversationWithCopilot(
  input: AnalyzeConversationInput
): Promise<AISalesSuggestion> {
  const normalizedInput: AnalyzeConversationInput = {
    ...input,
    conversationText: normalizeWhitespace(input.conversationText),
  }

  const fallback = heuristicSuggestion(normalizedInput)

  try {
    const aiRaw = await callOpenAI(normalizedInput)
    return sanitizeSuggestion(aiRaw, fallback, input.context)
  } catch {
    return fallback
  }
}