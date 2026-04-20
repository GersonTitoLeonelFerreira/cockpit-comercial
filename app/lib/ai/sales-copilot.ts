import type { LeadStatus } from '@/app/types/sales_cycles'
import type {
  AISalesContext,
  AISalesSuggestion,
  AIAuditDiagnostics,
  ConversationSource,
} from '@/app/types/ai-sales'
import {
  TERMINAL_SALES_CYCLE_STATUSES as TERMINAL_STATUSES,
  buildSalesCycleAIGuide,
  getSalesCycleLabel,
} from '@/app/lib/sales-cycle-status'
import { buildSalesCopilotExamplesGuide } from '@/app/lib/ai/sales-copilot-examples'

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

type ProviderCallResult = {
  raw: ProviderRawSuggestion | null
  failureReason: string | null
}

type FallbackAuditBuild = {
  suggestion: AISalesSuggestion
  diagnostics: AIAuditDiagnostics
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini'

const LOST_TERMS = [
  'fechou com concorrente',
  'fechou com a concorrente',
  'fechou com o concorrente',
  'sem interesse',
  'nao tem interesse',
  'não tem interesse',
  'nao tem mais interesse',
  'não tem mais interesse',
  'nao quer',
  'não quer',
  'nao quer mais',
  'não quer mais',
  'desistiu',
  'fora do perfil',
  'contato invalido',
  'contato inválido',
  'nao entrar mais em contato',
  'não entrar mais em contato',
]

const WON_TERMS = [
  'confirmou pagamento',
  'pagou',
  'assinou',
  'matriculou',
  'contrato assinado',
  'cadastro concluido',
  'cadastro concluído',
  'fechou comigo',
  'fechou conosco',
  'fechou com a gente',
  'fechou o plano',
]

const NEGOTIATION_TERMS = [
  'proposta',
  'valor',
  'preco',
  'preço',
  'desconto',
  'parcelado',
  'avista',
  'pix',
  'condicao',
  'condição',
  'pensar ate',
  'pensar até',
  'retorna na sexta',
  'retorno na sexta',
  'negociar',
  'negociacao',
  'negociação',
  'achou caro',
  'achou o valor alto',
  'concorrente',
  'comparando plano',
  'comparando preco',
  'comparando preço',
  'condicao especial',
  'condição especial',
  'fidelidade',
]

const NO_RESPONSE_TERMS = [
  'sem resposta',
  'nao respondeu',
  'não respondeu',
  'mensagem enviada',
  'tentativa de contato',
  'liguei e nao atendeu',
  'liguei e não atendeu',
  'visualizou e nao respondeu',
  'visualizou e não respondeu',
  'nao retornou',
  'não retornou',
]

const AGENDA_TERMS = [
  'cliente respondeu',
  'respondeu e pediu',
  'me respondeu',
  'retornou',
  'pediu para retornar',
  'pediu retorno',
  'pediu mais informacoes',
  'pediu mais informações',
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
  'amanha',
  'amanhã',
  'horario',
  'horário',
  'combinado',
  'vai vir',
  'vai passar',
  'passa aqui',
  'visita',
  'vir aqui',
  'perguntou os horarios',
  'perguntou os horários',
]

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

function normalizeForCompare(text: string): string {
  return normalizeWhitespace(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function textPreview(text: string, max = 220): string {
  const normalized = normalizeWhitespace(text)
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max)}...`
}

function matchedTerms(text: string, terms: string[]): string[] {
  const haystack = normalizeForCompare(text)
  return terms.filter((term) => haystack.includes(normalizeForCompare(term)))
}

function containsAny(text: string, terms: string[]): boolean {
  return matchedTerms(text, terms).length > 0
}

function inferChannel(text: string, source: ConversationSource): string | null {
  if (source === 'whatsapp') return 'Whats'
  if (source === 'phone_summary') return 'Ligação'

  if (containsAny(text, ['whatsapp', 'wpp', 'zap', 'mensagem'])) return 'Whats'
  if (containsAny(text, ['ligacao', 'liguei', 'telefone', 'falamos por telefone'])) return 'Ligação'
  if (containsAny(text, ['email', 'e mail'])) return 'Email'
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

  if (containsAny(text, ['preco', 'preço', 'caro', 'desconto', 'valor'])) tags.add('objecao_preco')
  if (containsAny(text, ['proposta', 'condicao', 'condição', 'parcelado', 'avista', 'pix'])) tags.add('condicao_comercial')
  if (containsAny(text, ['respondeu', 'retornou', 'me respondeu', 'falou comigo'])) tags.add('houve_resposta')
  if (containsAny(text, ['sem resposta', 'nao respondeu', 'não respondeu', 'visualizou e nao respondeu', 'visualizou e não respondeu'])) tags.add('sem_resposta')
  if (containsAny(text, ['agendar', 'agenda', 'marcou', 'horario', 'horário', 'amanha', 'amanhã', 'quarta', 'quinta', 'sexta', 'retorno', 'retornar'])) tags.add('retorno_agendado')
  if (containsAny(text, ['pagou', 'assinou', 'matriculou', 'confirmou pagamento', 'contrato assinado'])) tags.add('fechamento_confirmado')
  if (containsAny(text, ['sem interesse', 'nao quer', 'não quer', 'concorrente'])) tags.add('risco_perda')

  return Array.from(tags)
}

function buildHistorySignalList(
  context: AISalesContext,
  mode: 'negotiation' | 'agenda'
): string[] {
  return (context.recent_events ?? [])
    .map((event) => {
      const haystack = [
        event.to_status,
        event.action_result,
        event.result_detail,
        event.next_action,
      ]
        .filter(Boolean)
        .join(' ')

      const matches =
        mode === 'negotiation'
          ? event.to_status === 'negociacao' || matchedTerms(haystack, NEGOTIATION_TERMS).length > 0
          : event.to_status === 'respondeu' || matchedTerms(haystack, AGENDA_TERMS).length > 0

      if (!matches) return null

      return [
        event.occurred_at ? `when=${event.occurred_at}` : null,
        event.to_status ? `to=${event.to_status}` : null,
        event.action_result ? `result=${event.action_result}` : null,
        event.result_detail ? `detail=${event.result_detail}` : null,
        event.next_action ? `next=${event.next_action}` : null,
      ]
        .filter(Boolean)
        .join(' | ')
    })
    .filter((v): v is string => Boolean(v))
}

function buildFallbackSuggestion(
  input: AnalyzeConversationInput,
  diagnostics: AIAuditDiagnostics
): AISalesSuggestion {
  const text = normalizeWhitespace(input.conversationText)
  const currentStatus = input.context.current_status
  const channel = inferChannel(text, input.source)

  if (TERMINAL_STATUSES.includes(currentStatus)) {
    diagnostics.selected_rule = 'terminal_current_status'
    diagnostics.notes.push('O ciclo já estava terminal antes da análise.')
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

  const lost = diagnostics.text_signals.lost
  const won = diagnostics.text_signals.won
  const negotiation = diagnostics.text_signals.negotiation
  const noResponse = diagnostics.text_signals.no_response
  const agenda = diagnostics.text_signals.agenda
  const historyNegotiation = diagnostics.history_signals.negotiation
  const historyAgenda = diagnostics.history_signals.agenda

  if (lost.length > 0) {
    diagnostics.selected_rule = 'lost_text'
    return {
      recommended_status: 'perdido',
      confidence: 0.93,
      action_channel: channel,
      action_result: null,
      result_detail: 'Há evidência textual clara de perda comercial.',
      next_action: null,
      next_action_date: null,
      summary: 'A conversa indica perda do lead.',
      tags: extractTags(text),
      should_close_won: false,
      should_close_lost: true,
      close_reason: containsAny(text, ['preco', 'preço', 'caro']) ? 'Preço' : 'Sem interesse',
      reason_for_recommendation: 'Foram detectados sinais claros de encerramento negativo.',
      source: 'fallback',
    }
  }

  if (won.length > 0) {
    diagnostics.selected_rule = 'won_text'
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

  if (negotiation.length > 0 || historyNegotiation.length > 0) {
    diagnostics.selected_rule = negotiation.length > 0 ? 'negotiation_text' : 'negotiation_history'
    diagnostics.used_history = negotiation.length === 0 && historyNegotiation.length > 0
    return {
      recommended_status: 'negociacao',
      confidence: 0.87,
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
      reason_for_recommendation: 'Foi detectada discussão comercial real. Aqui não é só agenda: já existe negociação em curso.',
      source: 'fallback',
    }
  }

  if (noResponse.length > 0) {
    diagnostics.selected_rule = 'contact_no_response_text'
    return {
      recommended_status: 'contato',
      confidence: 0.84,
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
      reason_for_recommendation: 'A conversa indica tentativa de contato sem resposta, então a etapa correta é CONTATO.',
      source: 'fallback',
    }
  }

  if (agenda.length > 0 || historyAgenda.length > 0) {
    diagnostics.selected_rule = agenda.length > 0 ? 'agenda_text' : 'agenda_history'
    diagnostics.used_history = agenda.length === 0 && historyAgenda.length > 0
    return {
      recommended_status: 'respondeu',
      confidence: 0.86,
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
      reason_for_recommendation: 'Foi detectada resposta real do lead com próximo passo concreto, mas sem negociação comercial em andamento.',
      source: 'fallback',
    }
  }

  diagnostics.selected_rule = 'fallback_current_status'
  diagnostics.notes.push('Nenhuma regra forte foi encontrada. O fallback manteve o estado atual do ciclo.')
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

function buildFallbackAudit(input: AnalyzeConversationInput): FallbackAuditBuild {
  const text = normalizeWhitespace(input.conversationText)

  const diagnostics: AIAuditDiagnostics = {
    engine: 'fallback',
    selected_rule: 'unknown',
    fallback_rule: null,
    used_history: false,
    multiple_text_signals: false,
    text_preview: textPreview(text),
    text_signals: {
      lost: matchedTerms(text, LOST_TERMS),
      won: matchedTerms(text, WON_TERMS),
      negotiation: matchedTerms(text, NEGOTIATION_TERMS),
      no_response: matchedTerms(text, NO_RESPONSE_TERMS),
      agenda: matchedTerms(text, AGENDA_TERMS),
    },
    history_signals: {
      negotiation: buildHistorySignalList(input.context, 'negotiation'),
      agenda: buildHistorySignalList(input.context, 'agenda'),
    },
    provider: {
      attempted: Boolean(OPENAI_API_KEY),
      model: OPENAI_API_KEY ? OPENAI_MODEL : null,
      success: false,
      failure_reason: OPENAI_API_KEY ? null : 'OPENAI_API_KEY ausente',
    },
    notes: [],
  }

  const activeTextSignalCount = [
    diagnostics.text_signals.lost.length > 0,
    diagnostics.text_signals.won.length > 0,
    diagnostics.text_signals.negotiation.length > 0,
    diagnostics.text_signals.no_response.length > 0,
    diagnostics.text_signals.agenda.length > 0,
  ].filter(Boolean).length

  diagnostics.multiple_text_signals = activeTextSignalCount > 1

  if (diagnostics.multiple_text_signals) {
    diagnostics.notes.push('O texto atual contém múltiplos sinais de estágio ao mesmo tempo.')
  }

  if (diagnostics.history_signals.negotiation.length > 0 || diagnostics.history_signals.agenda.length > 0) {
    diagnostics.notes.push('Há sinais relevantes no histórico recente do ciclo.')
  }

  const suggestion = buildFallbackSuggestion(input, diagnostics)

  return { suggestion, diagnostics }
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
    buildSalesCopilotExamplesGuide(),
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

async function callOpenAI(input: AnalyzeConversationInput): Promise<ProviderCallResult> {
  if (!OPENAI_API_KEY) {
    return {
      raw: null,
      failureReason: 'OPENAI_API_KEY ausente',
    }
  }

  const promptPayload = {
    context: input.context,
    source: input.source,
    conversation_text: input.conversationText,
  }

  try {
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
      return {
        raw: null,
        failureReason: `openai_http_${response.status}`,
      }
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content

    if (!content || typeof content !== 'string') {
      return {
        raw: null,
        failureReason: 'openai_empty_content',
      }
    }

    try {
      return {
        raw: JSON.parse(content) as ProviderRawSuggestion,
        failureReason: null,
      }
    } catch {
      return {
        raw: null,
        failureReason: 'openai_invalid_json',
      }
    }
  } catch {
    return {
      raw: null,
      failureReason: 'openai_fetch_failed',
    }
  }
}

export async function analyzeConversationWithCopilotDetailed(
  input: AnalyzeConversationInput
): Promise<{
  suggestion: AISalesSuggestion
  diagnostics: AIAuditDiagnostics
}> {
  const normalizedInput: AnalyzeConversationInput = {
    ...input,
    conversationText: normalizeWhitespace(input.conversationText),
  }

  const fallbackDecision = buildFallbackAudit(normalizedInput)
  const diagnostics = fallbackDecision.diagnostics

  const providerResult = await callOpenAI(normalizedInput)

  diagnostics.provider = {
    attempted: Boolean(OPENAI_API_KEY),
    model: OPENAI_API_KEY ? OPENAI_MODEL : null,
    success: Boolean(providerResult.raw),
    failure_reason: providerResult.failureReason,
  }

  if (!providerResult.raw) {
    return {
      suggestion: fallbackDecision.suggestion,
      diagnostics,
    }
  }

  const aiSuggestion = sanitizeSuggestion(providerResult.raw, fallbackDecision.suggestion, normalizedInput.context)

  return {
    suggestion: aiSuggestion,
    diagnostics: {
      ...diagnostics,
      engine: 'ai',
      fallback_rule: diagnostics.selected_rule,
      selected_rule: `provider_${aiSuggestion.recommended_status}`,
      used_history: false,
      notes: [...diagnostics.notes, 'A resposta final veio do provider externo.'],
    },
  }
}

export async function analyzeConversationWithCopilot(
  input: AnalyzeConversationInput
): Promise<AISalesSuggestion> {
  const result = await analyzeConversationWithCopilotDetailed(input)
  return result.suggestion
}