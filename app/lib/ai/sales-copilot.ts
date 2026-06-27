import type { LeadStatus } from '@/app/types/sales_cycles'
import type {
  AISalesContext,
  AISalesSuggestion,
  AIAuditDiagnostics,
  AIAuditSegmentPreviews,
  AIAuditSegmentSignals,
  AIAuditFinalResolution,
  ConversationSource,
} from '@/app/types/ai-sales'
import {
  TERMINAL_SALES_CYCLE_STATUSES as TERMINAL_STATUSES,
  getSalesCycleLabel,
} from '@/app/lib/sales-cycle-status'
import {
  buildTranscriptSegments,
  buildTranscriptSignals,
  segmentPreview,
  hasFinalResolution,
  hasActiveNegotiationWithoutResolution,
  extractSuggestedDateFromText,
  type TranscriptSegments,
  type TranscriptSignals,
} from '@/app/lib/ai/sales-copilot-transcript'

type AnalyzeConversationInput = {
  context: AISalesContext
  conversationText: string
  source: ConversationSource
}

type ProviderCommercialFacts = {
  lead_responded?: boolean
  no_response?: boolean
  commercial_objection_active?: boolean
  follow_up_requested?: boolean
  follow_up_has_date_or_period?: boolean
  visit_or_test_drive_scheduled?: boolean
  explicit_win?: boolean
  explicit_loss?: boolean
  final_intent?: string | null
}

type ProviderRawSuggestion = {
  confidence?: number
  action_channel?: string | null
  summary?: string
  tags?: string[]
  facts?: ProviderCommercialFacts
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

// ---------------------------------------------------------------------------
// Dicionários "antigos" — ainda alimentam a seção `text_signals` da auditoria
// para manter compatibilidade com o painel (Perdido/Ganho/Negociação/Agenda
// sobre o texto inteiro). A DECISÃO, porém, agora usa os sinais por segmento
// via sales-copilot-transcript.ts.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers gerais
// ---------------------------------------------------------------------------

function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0.6
  return Math.max(0, Math.min(1, n))
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

/**
 * Histórico continua sendo EXIBIDO na auditoria (apenas leitura),
 * mas — a partir da Fase 5D — não alimenta mais a decisão do fallback.
 */
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

// ---------------------------------------------------------------------------
// Auditoria expandida — segmentos e sinais
// ---------------------------------------------------------------------------

function toSegmentPreviews(segments: TranscriptSegments): AIAuditSegmentPreviews {
  return {
    full: segmentPreview(segments.full),
    tail: segmentPreview(segments.tail),
    client_tail: segmentPreview(segments.client_tail),
    seller_tail: segmentPreview(segments.seller_tail),
    has_speaker_markers: segments.has_speaker_markers,
    turn_count: segments.turns.length,
  }
}

function toSegmentSignals(signals: TranscriptSignals): AIAuditSegmentSignals {
  return {
    full: { ...signals.full },
    tail: { ...signals.tail },
    client_tail: { ...signals.client_tail },
    seller_tail: { ...signals.seller_tail },
  }
}

// ===========================================================================
// FALLBACK — Fase 5D
//
// Ordem de decisão em camadas:
//   1. ciclo já terminal
//   2. perdido explícito (em qualquer segmento)
//   3. ganho explícito (em qualquer segmento)
//   4. compromisso/agendamento final explícito -> `respondeu`  (nova camada)
//   5. contato sem resposta -> `contato`
//   6. negociação sem desfecho final -> `negociacao`
//   7. agenda por resposta concreta sem negociação dominante -> `respondeu`
//   8. manter status atual
//
// O fallback NÃO consulta mais `history_signals` para decidir.
// O histórico segue visível na auditoria.
// ===========================================================================

function buildFallbackSuggestion(
  input: AnalyzeConversationInput,
  diagnostics: AIAuditDiagnostics,
  segments: TranscriptSegments,
  signals: TranscriptSignals
): AISalesSuggestion {
  const text = normalizeWhitespace(input.conversationText)
  const currentStatus = input.context.current_status
  const channel = inferChannel(text, input.source)
  const suggestedDateFromText = extractSuggestedDateFromText(text)

  // ---- Camada 1: ciclo já terminal ---------------------------------------
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

  // ---- Atalhos de sinais por segmento ------------------------------------
  const lostAnywhere =
    signals.full.lost.length > 0 ||
    signals.tail.lost.length > 0 ||
    signals.client_tail.lost.length > 0

  const wonAnywhere =
    signals.full.won.length > 0 ||
    signals.tail.won.length > 0 ||
    signals.client_tail.won.length > 0

  const finalResolved = hasFinalResolution(signals)
  const finalCommitment =
    signals.tail.final_commitment.length > 0 ||
    signals.client_tail.final_commitment.length > 0
  const finalSchedule =
    signals.tail.final_schedule.length > 0 ||
    signals.client_tail.final_schedule.length > 0

  const hadCommercialSomewhere =
    signals.full.commercial.length > 0 ||
    signals.tail.commercial.length > 0 ||
    signals.client_tail.commercial.length > 0

  const noResponseAnywhere =
    signals.full.no_response.length > 0 ||
    signals.tail.no_response.length > 0

  const negotiationActive = hasActiveNegotiationWithoutResolution(signals)

  // ---- Camada 2: perdido explícito ---------------------------------------
  if (lostAnywhere) {
    diagnostics.selected_rule = 'lost_explicit'
    diagnostics.notes.push('Desfecho final explícito de perda detectado.')
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

  // ---- Camada 3: ganho explícito -----------------------------------------
  if (wonAnywhere) {
    diagnostics.selected_rule = 'won_explicit'
    diagnostics.notes.push('Desfecho final explícito de ganho detectado.')
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

  // ---- Camada 4: compromisso/agendamento final explícito -----------------
  // Esta é A REGRA NOVA da Fase 5D.
  // Se o bloco final da conversa (ou a última fala do cliente) trouxe
  // compromisso concreto ou agendamento, vence mesmo que no meio tenha
  // havido objeção de preço/consumo/manutenção.
  if (finalResolved) {
    const overrode = hadCommercialSomewhere
    diagnostics.selected_rule = overrode
      ? 'final_resolution_over_negotiation'
      : 'final_resolution'

    if (overrode) {
      diagnostics.notes.push(
        'Havia negociação comercial intermediária, mas o desfecho final da conversa virou compromisso concreto ou agendamento.'
      )
    } else {
      diagnostics.notes.push('Desfecho final da conversa indica compromisso concreto / agendamento.')
    }

    const reasonParts: string[] = []
    if (finalCommitment) reasonParts.push('compromisso concreto no final')
    if (finalSchedule) reasonParts.push('agendamento no final')
    if (overrode) reasonParts.push('sobrepondo objeção comercial anterior')

    return {
      recommended_status: 'respondeu',
      confidence: 0.9,
      action_channel: channel,
      action_result: 'Lead respondeu e fechou próximo passo concreto',
      result_detail: `No sistema, ${getSalesCycleLabel('respondeu')} é o nome visual da etapa interna "respondeu". O desfecho final da conversa trouxe ${reasonParts.join(' e ') || 'compromisso concreto'}.`,
      next_action: 'Confirmar agenda / próximo passo',
      next_action_date: suggestedDateFromText ?? buildFutureIso(12),
      summary: 'A conversa terminou com compromisso concreto ou agendamento do lead.',
      tags: extractTags(text),
      should_close_won: false,
      should_close_lost: false,
      close_reason: null,
      reason_for_recommendation: overrode
        ? 'Mesmo tendo havido objeção comercial no meio da conversa, o desfecho final virou compromisso concreto / agendamento — então o status correto é AGENDA (respondeu), não NEGOCIAÇÃO.'
        : 'O cliente assumiu compromisso concreto ou agendou visita/test drive no final da conversa.',
      source: 'fallback',
    }
  }

  // ---- Camada 5: contato sem resposta ------------------------------------
  if (noResponseAnywhere) {
    diagnostics.selected_rule = 'contact_no_response'
    diagnostics.notes.push('A conversa indica tentativa de contato sem resposta concreta do lead.')
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

  // ---- Camada 6: negociação sem desfecho final ---------------------------
  if (negotiationActive) {
    diagnostics.selected_rule = 'negotiation_active'
    diagnostics.notes.push('Discussão comercial ativa sem desfecho final concreto.')
    return {
      recommended_status: 'negociacao',
      confidence: 0.86,
      action_channel: channel,
      action_result: 'Objeção ou discussão comercial identificada',
      result_detail: `A conversa mostra sinais claros de ${getSalesCycleLabel('negociacao').toLowerCase()}: preço, proposta, condição comercial, comparação ou objeção — e não há compromisso concreto no final.`,
      next_action: 'Retornar negociação',
      next_action_date: buildFutureIso(24),
      summary: 'Há sinais de negociação ativa ou objeção comercial em andamento.',
      tags: extractTags(text),
      should_close_won: false,
      should_close_lost: false,
      close_reason: null,
      reason_for_recommendation: 'Foi detectada discussão comercial real e ainda não existe compromisso concreto / agendamento no final da conversa.',
      source: 'fallback',
    }
  }

  // ---- Camada 7: agenda por resposta concreta sem negociação dominante ---
  // Aqui entra o cenário "cliente respondeu e pediu para retornar amanhã às
  // 14h, também perguntou os horários disponíveis" — texto sem negociação,
  // mas com resposta concreta do cliente. Usa o dicionário antigo AGENDA_TERMS
  // sobre o texto inteiro porque é o sinal que marca "houve resposta".
  const agendaOnFull = matchedTerms(text, AGENDA_TERMS)
  if (agendaOnFull.length > 0) {
    diagnostics.selected_rule = 'agenda_response'
    diagnostics.notes.push('Resposta concreta do lead sem negociação dominante.')
    return {
      recommended_status: 'respondeu',
      confidence: 0.86,
      action_channel: channel,
      action_result: 'Lead respondeu com continuidade concreta',
      result_detail: `No sistema, ${getSalesCycleLabel('respondeu')} é o nome visual da etapa interna "respondeu". A conversa indica resposta com próximo passo concreto.`,
      next_action: 'Confirmar agenda / próximo passo',
      next_action_date: suggestedDateFromText ?? buildFutureIso(12),
      summary: 'O lead respondeu e existe continuidade objetiva para a conversa ou visita.',
      tags: extractTags(text),
      should_close_won: false,
      should_close_lost: false,
      close_reason: null,
      reason_for_recommendation: 'Foi detectada resposta real do lead com próximo passo concreto, mas sem negociação comercial em andamento.',
      source: 'fallback',
    }
  }

  // ---- Camada 8: manter status atual --------------------------------------
  diagnostics.selected_rule = 'fallback_current_status'
  diagnostics.notes.push('Nenhuma camada de decisão venceu. O fallback manteve o estado atual do ciclo.')
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

// ---------------------------------------------------------------------------
// Construção da auditoria do fallback
// ---------------------------------------------------------------------------

function buildFallbackAudit(input: AnalyzeConversationInput): FallbackAuditBuild {
  const text = normalizeWhitespace(input.conversationText)

  // Fase 5D — segmentação e sinais por segmento
  const segments = buildTranscriptSegments(text)
  const signals = buildTranscriptSignals(segments)

  const diagnostics: AIAuditDiagnostics = {
    engine: 'fallback',
    selected_rule: 'unknown',
    fallback_rule: null,

    // A partir da Fase 5D, o fallback NÃO decide mais por histórico.
    used_history: false,

    multiple_text_signals: false,
    text_preview: textPreview(text),

    // Mantido por compatibilidade — o painel continua lendo esta forma.
    text_signals: {
      lost: matchedTerms(text, LOST_TERMS),
      won: matchedTerms(text, WON_TERMS),
      negotiation: matchedTerms(text, NEGOTIATION_TERMS),
      no_response: matchedTerms(text, NO_RESPONSE_TERMS),
      agenda: matchedTerms(text, AGENDA_TERMS),
    },

    // Histórico continua sendo EXIBIDO como leitura auditável,
    // mas NÃO é mais gatilho de decisão do fallback.
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

    // Fase 5D — auditoria expandida
    segment_previews: toSegmentPreviews(segments),
    segment_signals: toSegmentSignals(signals),
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
    diagnostics.notes.push('Há sinais relevantes no histórico recente do ciclo (apenas leitura — não foi usado na decisão do fallback).')
  }

  const suggestion = buildFallbackSuggestion(input, diagnostics, segments, signals)

  // Preenche o bloco de "resolução final" DEPOIS que a decisão rodou,
  // porque depende de qual camada venceu.
  const finalCommitmentDetected =
    signals.tail.final_commitment.length > 0 ||
    signals.client_tail.final_commitment.length > 0

  const finalScheduleDetected =
    signals.tail.final_schedule.length > 0 ||
    signals.client_tail.final_schedule.length > 0

  const overrodeNegotiation =
    diagnostics.selected_rule === 'final_resolution_over_negotiation'

  const finalResolution: AIAuditFinalResolution = {
    final_commitment_detected: finalCommitmentDetected,
    final_schedule_detected: finalScheduleDetected,
    overrode_negotiation: overrodeNegotiation,
    reason:
      diagnostics.selected_rule === 'final_resolution_over_negotiation'
        ? 'Desfecho final superou negociação intermediária.'
        : diagnostics.selected_rule === 'final_resolution'
          ? 'Desfecho final sem negociação concorrente.'
          : diagnostics.selected_rule === 'negotiation_active'
            ? 'Negociação ativa sem desfecho final concreto.'
            : diagnostics.selected_rule === 'contact_no_response'
              ? 'Contato sem resposta concreta do lead.'
              : diagnostics.selected_rule === 'agenda_response'
                ? 'Resposta concreta do lead sem negociação dominante.'
                : diagnostics.selected_rule === 'lost_explicit'
                  ? 'Perda explícita detectada.'
                  : diagnostics.selected_rule === 'won_explicit'
                    ? 'Ganho explícito detectado.'
                    : 'Sem desfecho final relevante.',
  }

  diagnostics.final_resolution = finalResolution
  diagnostics.final_commitment_detected = finalCommitmentDetected
  diagnostics.final_schedule_detected = finalScheduleDetected

  return { suggestion, diagnostics }
}

// ---------------------------------------------------------------------------
// IA extrai fatos; Yolen decide o estágio operacional.
// ---------------------------------------------------------------------------

function getProviderFacts(raw: ProviderRawSuggestion | null): ProviderCommercialFacts | null {
  if (!raw?.facts || typeof raw.facts !== 'object' || Array.isArray(raw.facts)) {
    return null
  }

  return raw.facts
}

function isConfirmedFact(value: unknown): boolean {
  return value === true
}

function buildSuggestionFromCommercialFacts(
  input: AnalyzeConversationInput,
  fallback: AISalesSuggestion,
  raw: ProviderRawSuggestion,
  facts: ProviderCommercialFacts,
  fallbackRule: string
): AISalesSuggestion {
  if (TERMINAL_STATUSES.includes(input.context.current_status)) {
    return fallback
  }

  const leadResponded = isConfirmedFact(facts.lead_responded)

  const localLost = fallback.recommended_status === 'perdido'
  const localWon = fallback.recommended_status === 'ganho'
  const localNegotiation = fallback.recommended_status === 'negociacao'
  const localNoResponse = fallback.recommended_status === 'contato'

  const localFinalAgenda =
    fallbackRule === 'final_resolution' ||
    fallbackRule === 'final_resolution_over_negotiation'

  const concreteReturnDate = extractSuggestedDateFromText(input.conversationText)

  const explicitLoss = isConfirmedFact(facts.explicit_loss) || localLost
  const explicitWin = isConfirmedFact(facts.explicit_win) || localWon

  const visitOrTestDriveScheduled =
    leadResponded && isConfirmedFact(facts.visit_or_test_drive_scheduled)

  const returnWithConcreteDate =
    leadResponded &&
    isConfirmedFact(facts.follow_up_requested) &&
    Boolean(concreteReturnDate)

  const agendaDetected =
    localFinalAgenda ||
    visitOrTestDriveScheduled ||
    returnWithConcreteDate

  const commercialObjection =
    isConfirmedFact(facts.commercial_objection_active) || localNegotiation

    const noResponseDetected =
    !explicitLoss &&
    !explicitWin &&
    !agendaDetected &&
    !commercialObjection &&
    !leadResponded &&
    (isConfirmedFact(facts.no_response) || localNoResponse)

  let recommendedStatus: LeadStatus = fallback.recommended_status

  if (explicitLoss) {
    recommendedStatus = 'perdido'
  } else if (explicitWin) {
    recommendedStatus = 'ganho'
  } else if (agendaDetected) {
    recommendedStatus = 'respondeu'
  } else if (commercialObjection) {
    recommendedStatus = 'negociacao'
  } else if (noResponseDetected) {
    recommendedStatus = 'contato'
  }

  const tags =
    recommendedStatus === 'respondeu'
      ? [visitOrTestDriveScheduled ? 'visita_agendada' : 'retorno_agendado']
      : recommendedStatus === 'negociacao'
        ? ['objecao_comercial']
        : recommendedStatus === 'contato'
          ? ['sem_resposta']
          : recommendedStatus === 'ganho'
            ? ['ganho_explicito']
            : recommendedStatus === 'perdido'
              ? ['perda_explicita']
              : []

  const finalIntent =
    typeof facts.final_intent === 'string' && facts.final_intent.trim()
      ? facts.final_intent.trim()
      : null

      const factSummary =
      recommendedStatus === 'respondeu'
        ? visitOrTestDriveScheduled
          ? 'visita ou encontro concreto'
          : 'retorno ou agenda concreta'
        : recommendedStatus === 'negociacao'
          ? 'objeção comercial sem compromisso concreto'
          : recommendedStatus === 'contato'
            ? 'tentativa de contato sem resposta'
            : recommendedStatus === 'ganho'
              ? 'ganho explícito'
              : recommendedStatus === 'perdido'
                ? 'perda explícita'
                : 'sem avanço comercial suficiente'

  const providerConfidence = clampConfidence(raw.confidence)

  const confidence =
    explicitLoss || explicitWin || agendaDetected
      ? Math.max(providerConfidence, fallback.confidence, 0.9)
      : Math.max(providerConfidence, fallback.confidence)

  const actionChannel =
    typeof raw.action_channel === 'string' && raw.action_channel.trim()
      ? raw.action_channel.trim()
      : fallback.action_channel

  let actionResult: string | null = null
  let resultDetail: string | null = null
  let nextAction: string | null = null
  let nextActionDate: string | null = null
  let summary = ''

  if (recommendedStatus === 'novo') {
    actionResult = 'Lead sem avanço operacional'
    resultDetail = 'Ainda não há fato comercial suficiente para movimentação do ciclo.'
    nextAction = 'Entrar em contato'
    summary = 'Ainda não há evidência comercial suficiente para avançar o ciclo.'
  }

  if (recommendedStatus === 'contato') {
    actionResult = 'Tentativa de contato sem resposta'
    resultDetail = 'Houve tentativa de contato, mas sem continuidade concreta do lead.'
    nextAction = 'Nova tentativa de contato'
    nextActionDate = buildFutureIso(24)
    summary = 'Houve tentativa de contato, mas o lead ainda não apresentou resposta concreta.'
  }

  if (recommendedStatus === 'respondeu') {
    actionResult = 'Lead respondeu e possui próximo passo concreto'
    resultDetail =
      finalIntent ||
      'O cliente respondeu e existe retorno, agenda ou continuidade concreta para a operação.'
    nextAction = 'Confirmar agenda / próximo passo'
    nextActionDate =
      concreteReturnDate ??
      fallback.next_action_date ??
      buildFutureIso(12)
    summary = 'O lead respondeu e deixou um próximo passo concreto para continuidade comercial.'
  }

  if (recommendedStatus === 'negociacao') {
    actionResult = 'Objeção ou discussão comercial em andamento'
    resultDetail =
      finalIntent ||
      'Existe objeção, preço, proposta ou necessidade de avaliação sem compromisso concreto de retorno.'
    nextAction = 'Retornar negociação'
    nextActionDate = buildFutureIso(24)
    summary = 'O lead demonstrou objeção ou necessidade de avaliar antes de avançar na decisão.'
  }

  if (recommendedStatus === 'ganho') {
    actionResult = 'Fechamento comercial confirmado'
    resultDetail =
      finalIntent ||
      'A conversa contém evidência explícita de pagamento, assinatura, matrícula ou compra concluída.'
    nextAction = null
    nextActionDate = null
    summary = 'O lead confirmou a conclusão comercial.'
  }

  if (recommendedStatus === 'perdido') {
    actionResult = 'Perda comercial confirmada'
    resultDetail =
      finalIntent ||
      'A conversa contém evidência explícita de desinteresse definitivo ou fechamento com concorrente.'
    nextAction = null
    nextActionDate = null
    summary = 'O lead informou que não seguirá com a oportunidade.'
  }

  return {
    recommended_status: recommendedStatus,
    confidence,
    action_channel: actionChannel,
    action_result: actionResult,
    result_detail: resultDetail,
    next_action: nextAction,
    next_action_date: nextActionDate,
    summary,
    tags,
    should_close_won: recommendedStatus === 'ganho',
    should_close_lost: recommendedStatus === 'perdido',
    close_reason:
      recommendedStatus === 'perdido'
        ? fallback.close_reason ?? (commercialObjection ? 'Preço' : 'Sem interesse')
        : null,
    reason_for_recommendation: `O Yolen definiu ${getSalesCycleLabel(
      recommendedStatus
    )} a partir de ${factSummary}.`,
    source: 'yolen',
  }
}

function buildSystemPrompt(): string {
  return [
    'Você é um extrator de fatos comerciais.',
    'Leia a conversa e devolva somente JSON válido.',
    'Nunca escreva texto fora do JSON.',
    'Você NÃO decide estágio do funil, próxima ação, ganho ou perda.',
    'O sistema Yolen decide o estágio comercial a partir dos fatos que você extrair.',
    'Use o contexto e a conversa atual apenas para identificar fatos comprovados.',
    'Não invente fatos, datas, horários, visitas, pagamentos ou intenções.',
    'Se não houver evidência suficiente, use false.',
    'Retorne obrigatoriamente os campos: confidence, action_channel, summary, tags e facts.',
    'Dentro de facts, retorne obrigatoriamente:',
    'lead_responded, no_response, commercial_objection_active, follow_up_requested, follow_up_has_date_or_period, visit_or_test_drive_scheduled, explicit_win, explicit_loss, final_intent.',
    'lead_responded só é true quando existe resposta real do cliente na conversa.',
    'no_response nunca pode ser true quando lead_responded também for true.',
    'follow_up_requested só é true quando o cliente pede ou aceita que a empresa retorne em um momento futuro.',
    'follow_up_has_date_or_period só é true quando houver data, dia, horário ou período claramente definido, como segunda, sexta de manhã, amanhã à tarde ou 14h.',
    'A frase "vou pensar e depois te retorno" NÃO é agenda, NÃO tem data definida e NÃO é pedido de retorno. Nesse caso, use commercial_objection_active=true e follow_up_requested=false.',
    'A frase "pode me chamar na quinta de tarde" indica follow_up_requested=true e follow_up_has_date_or_period=true.',
    'visit_or_test_drive_scheduled só é true quando visita, teste ou encontro foi efetivamente combinado.',
    'commercial_objection_active só é true quando preço, proposta, condição, desconto, concorrência ou comparação ainda está em discussão sem desfecho final concreto.',
    'explicit_win só é true com prova clara de pagamento, assinatura, matrícula, compra ou contrato concluído.',
    'explicit_loss só é true com prova clara de desistência, fechamento com concorrente, pedido para não contatar ou desinteresse definitivo.',
    'summary deve ser factual e curto, sem citar estágio do funil.',
    'final_intent deve resumir a última intenção objetiva do cliente em uma frase curta ou ser null.',
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

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

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

  const providerFacts = getProviderFacts(providerResult.raw)

  if (!providerFacts) {
    return {
      suggestion: fallbackDecision.suggestion,
      diagnostics: {
        ...diagnostics,
        provider: {
          ...diagnostics.provider,
          success: false,
          failure_reason: 'openai_missing_commercial_facts',
        },
        notes: [
          ...diagnostics.notes,
          'A IA respondeu sem fatos comerciais estruturados. O Yolen usou apenas as regras locais.',
        ],
      },
    }
  }

  const yolenSuggestion = buildSuggestionFromCommercialFacts(
    normalizedInput,
    fallbackDecision.suggestion,
    providerResult.raw,
    providerFacts,
    diagnostics.selected_rule
  )

  return {
    suggestion: yolenSuggestion,
    diagnostics: {
      ...diagnostics,
      engine: 'yolen',
      fallback_rule: diagnostics.selected_rule,
      selected_rule: `yolen_${yolenSuggestion.recommended_status}`,
      used_history: false,
      notes: [
        ...diagnostics.notes,
        'A IA extraiu fatos comerciais e o Yolen calculou a decisão operacional final.',
      ],
    },
  }
}

export async function analyzeConversationWithCopilot(
  input: AnalyzeConversationInput
): Promise<AISalesSuggestion> {
  const result = await analyzeConversationWithCopilotDetailed(input)
  return result.suggestion
}