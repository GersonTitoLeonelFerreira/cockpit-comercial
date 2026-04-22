'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  analyzeConversation,
  applyAISuggestion,
} from '@/app/lib/services/ai-sales-copilot'
import {
  logAIAnalysis,
  logAISuggestionRejected,
} from '@/app/lib/services/sales-cycles'
import {
  OPEN_SALES_CYCLE_STATUSES as OPEN_STATUSES,
  TERMINAL_SALES_CYCLE_STATUSES as TERMINAL_STATUSES,
  SALES_CYCLE_VISUAL_LABELS as STATUS_LABELS,
} from '@/app/lib/sales-cycle-status'
import type { SalesCycle, LeadStatus } from '@/app/types/sales_cycles'
import type { AISalesSuggestion, ConversationSource, AIAuditDiagnostics } from '@/app/types/ai-sales'

type SalesCycleWithLead = SalesCycle & {
  leads?: {
    id?: string
    name?: string
    phone?: string | null
    email?: string | null
  }
}

interface LeadCopilotPanelProps {
  cycle: SalesCycleWithLead
  variant?: 'full' | 'compact'
  onApplied?: () => void | Promise<void>
  onRejected?: () => void | Promise<void>

  /**
   * Modo "movimentação".
   * Quando o painel é aberto por um arrasto do kanban ou por um botão de etapa
   * na página do lead, passamos aqui a etapa que o vendedor tentou mover.
   * O dropdown já abre pré-preenchido com esse valor e aparece um cabeçalho
   * claro explicando o que está sendo feito.
   */
  forcedInitialStatus?: LeadStatus

  /**
   * Callback chamado quando o vendedor fecha o painel sem aplicar (botão
   * "Descartar" ou fechar o drawer). Usado pelo Kanban para reverter o arrasto.
   */
  onCancel?: () => void | Promise<void>

  /**
   * Chamado quando o vendedor aperta "Aplicar sugestão" com o dropdown em
   * `ganho` ou `perdido`. O painel NÃO formaliza esses status — quem formaliza
   * é o WinDealModal / LostDealModal. Então avisamos o container e ele abre
   * o modal oficial.
   */
  onTerminalApply?: (status: 'ganho' | 'perdido') => void
}

function isTerminalStatus(status: LeadStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return 'Alta'
  if (confidence >= 0.65) return 'Média'
  return 'Baixa'
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function excerpt(text: string, max = 400): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}...`
}

function joinSignals(list: string[] | undefined): string {
  if (!list || list.length === 0) return '—'
  return list.join(', ')
}

export default function LeadCopilotPanel({
  cycle,
  variant = 'full',
  onApplied,
  onRejected,
  forcedInitialStatus,
  onCancel,
  onTerminalApply,
}: LeadCopilotPanelProps) {
  const [source, setSource] = useState<ConversationSource>('whatsapp')
  const [conversationText, setConversationText] = useState('')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<AISalesSuggestion | null>(null)
  const [auditDiagnostics, setAuditDiagnostics] = useState<AIAuditDiagnostics | null>(null)

  // Dropdown inicial:
  // - Se estamos em modo movimentação → pré-seleciona a etapa tentada
  // - Senão → mantém a etapa atual do ciclo
  const [editableStatus, setEditableStatus] = useState<LeadStatus>(
    forcedInitialStatus ?? cycle.status
  )
  const [editableNextAction, setEditableNextAction] = useState('')
  const [editableNextActionDate, setEditableNextActionDate] = useState('')
  const [editableSummary, setEditableSummary] = useState('')

  // Auditoria fica escondida por padrão — botão expande quando o vendedor quer ver.
  const [showAudit, setShowAudit] = useState(false)

  // Modo movimentação — usado para o cabeçalho azul e o comportamento do cancelar
  const isMoveMode = Boolean(forcedInitialStatus)

  // Se o container trocar a etapa forçada (por ex: nova tentativa de arrasto),
  // precisamos refletir isso no dropdown.
  useEffect(() => {
    if (forcedInitialStatus) {
      setEditableStatus(forcedInitialStatus)
    }
  }, [forcedInitialStatus])

  const canAnalyze = conversationText.trim().length >= 15
  const compact = variant === 'compact'

  const currentLeadName = useMemo(() => {
    return cycle?.leads?.name || 'Lead'
  }, [cycle])

  const handleAnalyze = async () => {
    if (!canAnalyze) {
      setError('Cole a conversa ou escreva um resumo com pelo menos 15 caracteres.')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await analyzeConversation({
        cycle_id: cycle.id,
        source,
        conversation_text: conversationText,
      })

      setSuggestion(response.suggestion)
      setAuditDiagnostics(response.diagnostics ?? null)
      setEditableStatus(response.suggestion.recommended_status)
      setEditableNextAction(response.suggestion.next_action || '')
      setEditableNextActionDate(toDatetimeLocalValue(response.suggestion.next_action_date))
      setEditableSummary(response.suggestion.summary || '')

      try {
        await logAIAnalysis(cycle.id, response.suggestion, excerpt(conversationText))
      } catch {
        // não bloqueia a UX por falha de auditoria
      }
    } catch (e: any) {
      setError(e?.message || 'Erro ao analisar conversa.')
      setSuggestion(null)
      setAuditDiagnostics(null)
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async () => {
    if (!suggestion) return

    // Se o vendedor está tentando aplicar com dropdown em ganho/perdido,
    // delegamos pro container abrir WinDealModal / LostDealModal.
    if (editableStatus === 'ganho' || editableStatus === 'perdido') {
      if (onTerminalApply) {
        onTerminalApply(editableStatus)
        return
      }
      setError(
        'Para fechar como ganho ou perdido, use os botões próprios de fechamento.'
      )
      return
    }

    try {
      setApplying(true)
      setError(null)

      await applyAISuggestion({
        cycle_id: cycle.id,
        applied_status: editableStatus,
        next_action:
          editableStatus === 'novo'
            ? null
            : editableNextAction.trim() || null,
        next_action_date:
          editableStatus === 'novo'
            ? null
            : editableNextActionDate
              ? new Date(editableNextActionDate).toISOString()
              : null,
        edited_summary: editableSummary || null,
        suggestion,
        source: compact ? 'ai_copilot_kanban' : 'ai_copilot_detail',
      })

      setConversationText('')
      setSuggestion(null)
      setAuditDiagnostics(null)
      setEditableSummary('')
      setEditableNextAction('')
      setEditableNextActionDate('')

      await onApplied?.()
    } catch (e: any) {
      setError(e?.message || 'Erro ao aplicar sugestão.')
    } finally {
      setApplying(false)
    }
  }

  const handleReject = async () => {
    try {
      if (suggestion) {
        await logAISuggestionRejected(cycle.id, {
          original_status: cycle.status,
          suggested_status: suggestion.recommended_status,
          suggestion,
          source: compact ? 'ai_copilot_kanban' : 'ai_copilot_detail',
        })
      }
    } catch {
      // não bloqueia a UX por falha de auditoria
    }

    setSuggestion(null)
    setAuditDiagnostics(null)
    setEditableSummary('')
    setEditableNextAction('')
    setEditableNextActionDate('')

    // Em modo movimentação, "descartar" deve reverter o arrasto.
    if (isMoveMode && onCancel) {
      await onCancel()
      return
    }

    await onRejected?.()
  }

  const applyButtonLabel = applying
    ? 'Aplicando...'
    : editableStatus === 'ganho'
      ? 'Confirmar Ganho...'
      : editableStatus === 'perdido'
        ? 'Confirmar Perdido...'
        : 'Aplicar sugestão'

  return (
    <div className={`bg-gray-900 border border-gray-700 rounded-lg ${compact ? 'p-4' : 'p-6'} text-white`}>
      {/* Cabeçalho padrão */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-400 uppercase">Copiloto Comercial</h3>
          <p className={`text-gray-300 mt-2 ${compact ? 'text-xs' : 'text-sm'}`}>
            Cole a conversa do WhatsApp ou resuma a ligação. A IA interpreta e sugere a atualização do ciclo.
          </p>
        </div>
        <div className="text-right text-xs text-gray-500">
          Lead: <span className="text-gray-300 font-semibold">{currentLeadName}</span>
        </div>
      </div>

      {/* Cabeçalho extra — modo movimentação (só aparece quando veio de arrasto/botão) */}
      {isMoveMode && forcedInitialStatus && (
        <div className="mb-4 rounded-lg border border-blue-800 bg-blue-950/30 px-4 py-3">
          <div className="text-xs font-bold text-blue-300 uppercase mb-1">
            Movendo lead para
          </div>
          <div className="text-lg font-bold text-blue-100">
            {STATUS_LABELS[forcedInitialStatus]}
          </div>
          <div className="text-xs text-blue-200/80 mt-2">
            Cole a conversa ou descreva o que aconteceu. A IA vai validar essa movimentação
            — se ela discordar, o estágio sugerido abaixo é ajustado automaticamente.
            Você pode alterar o estágio manualmente antes de aplicar.
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Origem</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as ConversationSource)}
            disabled={loading || applying}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="phone_summary">Resumo de ligação</option>
            <option value="notes">Anotação livre</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Conversa / resumo</label>
          <textarea
            value={conversationText}
            onChange={(e) => setConversationText(e.target.value)}
            disabled={loading || applying}
            placeholder="Cole aqui a conversa ou escreva com suas palavras o que aconteceu com o cliente..."
            className={`w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-3 text-sm text-white placeholder-gray-500 ${compact ? 'min-h-[140px]' : 'min-h-[180px]'}`}
          />
          <div className="mt-2 text-xs text-gray-500">
            {conversationText.trim().length} caracteres
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze || loading || applying}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Analisando...' : 'Analisar com IA'}
          </button>

          <button
            onClick={() => {
              setConversationText('')
              setSuggestion(null)
              setAuditDiagnostics(null)
              setEditableSummary('')
              setEditableNextAction('')
              setEditableNextActionDate('')
              setError(null)
            }}
            disabled={loading || applying}
            className="rounded-md border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            Limpar
          </button>
        </div>
      </div>

      {suggestion && (
        <div className="mt-6 rounded-xl border border-blue-900/60 bg-blue-950/20 p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-sm font-bold text-blue-300">Sugestão da IA</div>
              <div className="text-xs text-gray-400 mt-1">
                Confiança: <span className="font-semibold text-gray-200">{confidenceLabel(suggestion.confidence)}</span> ({Math.round(suggestion.confidence * 100)}%)
              </div>
            </div>
            <div className="text-xs text-gray-500">
              Origem: <span className="text-gray-300">{suggestion.source}</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Estágio sugerido</label>
              <select
                value={editableStatus}
                onChange={(e) => setEditableStatus(e.target.value as LeadStatus)}
                disabled={applying}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
              >
                {OPEN_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
                <option value="ganho">{STATUS_LABELS.ganho}</option>
                <option value="perdido">{STATUS_LABELS.perdido}</option>
              </select>

              {/* Aviso quando a IA sugere algo diferente do que o vendedor tentou arrastar */}
              {isMoveMode
                && forcedInitialStatus
                && editableStatus !== forcedInitialStatus && (
                  <div className="mt-2 text-[11px] text-amber-300/90">
                    A IA sugeriu <strong>{STATUS_LABELS[editableStatus]}</strong> em vez de{' '}
                    <strong>{STATUS_LABELS[forcedInitialStatus]}</strong>. Se você quer manter a etapa
                    original, altere o dropdown antes de aplicar.
                  </div>
                )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Canal identificado</label>
              <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white">
                {suggestion.action_channel || '—'}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Resumo da IA</label>
              <textarea
                value={editableSummary}
                onChange={(e) => setEditableSummary(e.target.value)}
                disabled={applying}
                className="w-full min-h-[90px] rounded-md border border-gray-700 bg-gray-800 px-3 py-3 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Próxima ação</label>
              <input
                type="text"
                value={editableNextAction}
                onChange={(e) => setEditableNextAction(e.target.value)}
                disabled={applying || editableStatus === 'novo' || isTerminalStatus(editableStatus)}
                placeholder={editableStatus === 'novo' ? 'Em novo, a próxima ação não será aplicada nesta fase' : 'Ex: Retornar negociação'}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Data sugerida</label>
              <input
                type="datetime-local"
                value={editableNextActionDate}
                onChange={(e) => setEditableNextActionDate(e.target.value)}
                disabled={applying || editableStatus === 'novo' || isTerminalStatus(editableStatus)}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Resultado detectado</label>
              <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white">
                {suggestion.action_result || '—'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Detalhe detectado</label>
              <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white">
                {suggestion.result_detail || '—'}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Justificativa da IA</label>
              <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white">
                {suggestion.reason_for_recommendation}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Tags</label>
              <div className="flex flex-wrap gap-2">
                {suggestion.tags.length > 0 ? (
                  suggestion.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-blue-900/60 bg-blue-950/30 px-3 py-1 text-xs text-blue-200"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-400">Nenhuma tag detectada</span>
                )}
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* Auditoria — escondida por padrão, expande com o botão        */}
          {/* ============================================================ */}
          {auditDiagnostics && (
            <div className="mt-5 rounded-xl border border-amber-900/60 bg-amber-950/20 p-4">
              <button
                type="button"
                onClick={() => setShowAudit((v) => !v)}
                className="w-full flex items-center justify-between text-sm font-bold text-amber-300 hover:text-amber-200 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="inline-block w-4 text-center">{showAudit ? '▾' : '▸'}</span>
                  Auditoria da IA
                </span>
                <span className="text-[10px] font-normal text-amber-200/60 uppercase">
                  {showAudit ? 'Ocultar' : 'Ver detalhes'}
                </span>
              </button>

              {showAudit && (
                <div className="mt-3 grid gap-3 md:grid-cols-2 text-xs">
                  <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2">
                    <div className="text-gray-400 uppercase font-bold mb-1">Motor final</div>
                    <div className="text-white">{auditDiagnostics.engine}</div>
                  </div>

                  <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2">
                    <div className="text-gray-400 uppercase font-bold mb-1">Regra escolhida</div>
                    <div className="text-white">{auditDiagnostics.selected_rule}</div>
                  </div>

                  <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2">
                    <div className="text-gray-400 uppercase font-bold mb-1">Usou histórico</div>
                    <div className="text-white">{auditDiagnostics.used_history ? 'Sim' : 'Não'}</div>
                  </div>

                  <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2">
                    <div className="text-gray-400 uppercase font-bold mb-1">Múltiplos sinais no texto</div>
                    <div className="text-white">{auditDiagnostics.multiple_text_signals ? 'Sim' : 'Não'}</div>
                  </div>

                  <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 md:col-span-2">
                    <div className="text-gray-400 uppercase font-bold mb-1">Preview do texto auditado</div>
                    <div className="text-white whitespace-pre-wrap">{auditDiagnostics.text_preview}</div>
                  </div>

                  {auditDiagnostics.final_resolution && (
                    <div className="rounded-md border border-emerald-900/60 bg-emerald-950/20 px-3 py-2 md:col-span-2">
                      <div className="text-emerald-300 uppercase font-bold mb-2">Desfecho final (Fase 5D)</div>
                      <div className="text-white">
                        Compromisso no final:{' '}
                        <span className="font-semibold">
                          {auditDiagnostics.final_resolution.final_commitment_detected ? 'Sim' : 'Não'}
                        </span>
                      </div>
                      <div className="text-white">
                        Agendamento no final:{' '}
                        <span className="font-semibold">
                          {auditDiagnostics.final_resolution.final_schedule_detected ? 'Sim' : 'Não'}
                        </span>
                      </div>
                      <div className="text-white">
                        Desfecho superou negociação intermediária:{' '}
                        <span className="font-semibold">
                          {auditDiagnostics.final_resolution.overrode_negotiation ? 'Sim' : 'Não'}
                        </span>
                      </div>
                      <div className="text-white mt-1">
                        Motivo da regra: {auditDiagnostics.final_resolution.reason}
                      </div>
                    </div>
                  )}

                  {auditDiagnostics.segment_previews && (
                    <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 md:col-span-2">
                      <div className="text-gray-400 uppercase font-bold mb-2">Segmentos usados na decisão</div>
                      <div className="text-xs text-gray-400 mb-2">
                        Turnos detectados: {auditDiagnostics.segment_previews.turn_count} •{' '}
                        {auditDiagnostics.segment_previews.has_speaker_markers
                          ? 'Com marcadores de Cliente/Vendedor'
                          : 'Sem marcadores — usando texto bruto'}
                      </div>

                      <div className="mt-2">
                        <div className="text-gray-400 font-bold">Trecho final da conversa</div>
                        <div className="text-white whitespace-pre-wrap">
                          {auditDiagnostics.segment_previews.tail || '—'}
                        </div>
                      </div>

                      <div className="mt-2">
                        <div className="text-gray-400 font-bold">Trecho final do cliente</div>
                        <div className="text-white whitespace-pre-wrap">
                          {auditDiagnostics.segment_previews.client_tail || '—'}
                        </div>
                      </div>

                      <div className="mt-2">
                        <div className="text-gray-400 font-bold">Trecho final do vendedor</div>
                        <div className="text-white whitespace-pre-wrap">
                          {auditDiagnostics.segment_previews.seller_tail || '—'}
                        </div>
                      </div>
                    </div>
                  )}

                  {auditDiagnostics.segment_signals && (
                    <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 md:col-span-2">
                      <div className="text-gray-400 uppercase font-bold mb-2">Sinais por segmento</div>

                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1">
                          <div className="text-gray-400 font-bold">Texto inteiro</div>
                          <div className="text-white">Compromisso final: {joinSignals(auditDiagnostics.segment_signals.full.final_commitment)}</div>
                          <div className="text-white">Agendamento final: {joinSignals(auditDiagnostics.segment_signals.full.final_schedule)}</div>
                          <div className="text-white">Comercial: {joinSignals(auditDiagnostics.segment_signals.full.commercial)}</div>
                          <div className="text-white">Sem resposta: {joinSignals(auditDiagnostics.segment_signals.full.no_response)}</div>
                          <div className="text-white">Perdido: {joinSignals(auditDiagnostics.segment_signals.full.lost)}</div>
                          <div className="text-white">Ganho: {joinSignals(auditDiagnostics.segment_signals.full.won)}</div>
                        </div>

                        <div className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1">
                          <div className="text-gray-400 font-bold">Trecho final</div>
                          <div className="text-white">Compromisso final: {joinSignals(auditDiagnostics.segment_signals.tail.final_commitment)}</div>
                          <div className="text-white">Agendamento final: {joinSignals(auditDiagnostics.segment_signals.tail.final_schedule)}</div>
                          <div className="text-white">Comercial: {joinSignals(auditDiagnostics.segment_signals.tail.commercial)}</div>
                          <div className="text-white">Sem resposta: {joinSignals(auditDiagnostics.segment_signals.tail.no_response)}</div>
                          <div className="text-white">Perdido: {joinSignals(auditDiagnostics.segment_signals.tail.lost)}</div>
                          <div className="text-white">Ganho: {joinSignals(auditDiagnostics.segment_signals.tail.won)}</div>
                        </div>

                        <div className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1">
                          <div className="text-gray-400 font-bold">Cliente (final)</div>
                          <div className="text-white">Compromisso final: {joinSignals(auditDiagnostics.segment_signals.client_tail.final_commitment)}</div>
                          <div className="text-white">Agendamento final: {joinSignals(auditDiagnostics.segment_signals.client_tail.final_schedule)}</div>
                          <div className="text-white">Comercial: {joinSignals(auditDiagnostics.segment_signals.client_tail.commercial)}</div>
                          <div className="text-white">Sem resposta: {joinSignals(auditDiagnostics.segment_signals.client_tail.no_response)}</div>
                          <div className="text-white">Perdido: {joinSignals(auditDiagnostics.segment_signals.client_tail.lost)}</div>
                          <div className="text-white">Ganho: {joinSignals(auditDiagnostics.segment_signals.client_tail.won)}</div>
                        </div>

                        <div className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1">
                          <div className="text-gray-400 font-bold">Vendedor (final)</div>
                          <div className="text-white">Compromisso final: {joinSignals(auditDiagnostics.segment_signals.seller_tail.final_commitment)}</div>
                          <div className="text-white">Agendamento final: {joinSignals(auditDiagnostics.segment_signals.seller_tail.final_schedule)}</div>
                          <div className="text-white">Comercial: {joinSignals(auditDiagnostics.segment_signals.seller_tail.commercial)}</div>
                          <div className="text-white">Sem resposta: {joinSignals(auditDiagnostics.segment_signals.seller_tail.no_response)}</div>
                          <div className="text-white">Perdido: {joinSignals(auditDiagnostics.segment_signals.seller_tail.lost)}</div>
                          <div className="text-white">Ganho: {joinSignals(auditDiagnostics.segment_signals.seller_tail.won)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 md:col-span-2">
                    <div className="text-gray-400 uppercase font-bold mb-2">Provider</div>
                    <div className="text-white">Tentou usar provider: {auditDiagnostics.provider.attempted ? 'Sim' : 'Não'}</div>
                    <div className="text-white">Modelo: {auditDiagnostics.provider.model || '—'}</div>
                    <div className="text-white">Sucesso: {auditDiagnostics.provider.success ? 'Sim' : 'Não'}</div>
                    <div className="text-white">Falha: {auditDiagnostics.provider.failure_reason || '—'}</div>
                  </div>

                  <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2">
                    <div className="text-gray-400 uppercase font-bold mb-2">Sinais de texto</div>
                    <div className="text-white">Perdido: {joinSignals(auditDiagnostics.text_signals.lost)}</div>
                    <div className="text-white">Ganho: {joinSignals(auditDiagnostics.text_signals.won)}</div>
                    <div className="text-white">Negociação: {joinSignals(auditDiagnostics.text_signals.negotiation)}</div>
                    <div className="text-white">Contato sem resposta: {joinSignals(auditDiagnostics.text_signals.no_response)}</div>
                    <div className="text-white">Agenda: {joinSignals(auditDiagnostics.text_signals.agenda)}</div>
                  </div>

                  <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2">
                    <div className="text-gray-400 uppercase font-bold mb-2">
                      Sinais do histórico{' '}
                      <span className="text-gray-500 text-[10px]">(apenas leitura — não é usado pelo fallback)</span>
                    </div>
                    <div className="text-white whitespace-pre-wrap">
                      Negociação:{' '}
                      {auditDiagnostics.history_signals.negotiation.length > 0
                        ? auditDiagnostics.history_signals.negotiation.join('\n')
                        : '—'}
                    </div>
                    <div className="text-white whitespace-pre-wrap mt-2">
                      Agenda:{' '}
                      {auditDiagnostics.history_signals.agenda.length > 0
                        ? auditDiagnostics.history_signals.agenda.join('\n')
                        : '—'}
                    </div>
                  </div>

                  <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 md:col-span-2">
                    <div className="text-gray-400 uppercase font-bold mb-2">Notas</div>
                    <div className="text-white whitespace-pre-wrap">
                      {auditDiagnostics.notes.length > 0 ? auditDiagnostics.notes.join('\n') : '—'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              onClick={handleApply}
              disabled={applying || loading}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {applyButtonLabel}
            </button>

            <button
              onClick={handleReject}
              disabled={applying}
              className="rounded-md border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}