'use client'

import { useMemo, useState } from 'react'
import {
  analyzeConversation,
  applyAISuggestion,
} from '@/app/lib/services/ai-sales-copilot'
import {
  logAIAnalysis,
  logAISuggestionRejected,
} from '@/app/lib/services/sales-cycles'
import type { SalesCycle, LeadStatus } from '@/app/types/sales_cycles'
import type { AISalesSuggestion, ConversationSource } from '@/app/types/ai-sales'

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
}

const OPEN_STATUSES: LeadStatus[] = ['novo', 'contato', 'respondeu', 'negociacao', 'pausado']
const TERMINAL_STATUSES: LeadStatus[] = ['ganho', 'perdido', 'cancelado']

const STATUS_LABELS: Record<LeadStatus, string> = {
  novo: 'NOVO',
  contato: 'CONTATO',
  respondeu: 'AGENDA',
  negociacao: 'NEGOCIAÇÃO',
  pausado: 'PAUSADO',
  ganho: 'GANHO',
  perdido: 'PERDIDO',
  cancelado: 'CANCELADO',
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

export default function LeadCopilotPanel({
  cycle,
  variant = 'full',
  onApplied,
  onRejected,
}: LeadCopilotPanelProps) {
  const [source, setSource] = useState<ConversationSource>('whatsapp')
  const [conversationText, setConversationText] = useState('')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<AISalesSuggestion | null>(null)
  const [editableStatus, setEditableStatus] = useState<LeadStatus>(cycle.status)
  const [editableNextAction, setEditableNextAction] = useState('')
  const [editableNextActionDate, setEditableNextActionDate] = useState('')
  const [editableSummary, setEditableSummary] = useState('')

  const canAnalyze = conversationText.trim().length >= 15
  const terminalSuggestion = suggestion ? isTerminalStatus(suggestion.recommended_status) : false
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
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async () => {
    if (!suggestion) return
  
    if (isTerminalStatus(editableStatus)) {
      setError('Nesta fase, sugestões de ganho ou perdido ainda não são aplicadas por este botão. Use os botões próprios de fechamento.')
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
    setEditableSummary('')
    setEditableNextAction('')
    setEditableNextActionDate('')

    await onRejected?.()
  }

  return (
    <div className={`bg-gray-900 border border-gray-700 rounded-lg ${compact ? 'p-4' : 'p-6'} text-white`}>
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
                disabled={applying || editableStatus === 'novo'}
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
                disabled={applying || editableStatus === 'novo'}
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

          {terminalSuggestion && (
            <div className="mt-4 rounded-md border border-amber-800 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
              A IA sugeriu fechamento terminal. Nesta fase, aplique ganho ou perdido pelos botões próprios da tela.
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              onClick={handleApply}
              disabled={applying || loading || terminalSuggestion}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {applying ? 'Aplicando...' : 'Aplicar sugestão'}
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