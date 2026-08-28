'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  analyzeConversation,
  applyAISuggestion,
} from '@/app/lib/services/ai-sales-copilot'
import {
  OPEN_SALES_CYCLE_STATUSES as OPEN_STATUSES,
  TERMINAL_SALES_CYCLE_STATUSES as TERMINAL_STATUSES,
  SALES_CYCLE_VISUAL_LABELS as STATUS_LABELS,
} from '@/app/lib/sales-cycle-status'
import type { SalesCycle, LeadStatus } from '@/app/types/sales_cycles'
import type { AISalesSuggestion, ConversationSource, AIAuditDiagnostics } from '@/app/types/ai-sales'
import AICoachingReview from '@/app/components/leads/AICoachingReview'

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

function suggestionSourceLabel(source: AISalesSuggestion['source']): string {
  if (source === 'yolen') return 'Yolen + IA'
  if (source === 'ai') return 'IA'
  return 'Regra local'
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function joinSignals(list: string[] | undefined): string {
  if (!list || list.length === 0) return '—'
  return list.join(', ')
}

const DS = {
  surfaceBg: '#111318',
  panelBg: '#0d0f14',
  cardBg: '#141722',
  inputBg: '#090b0f',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  blueBg: 'rgba(59,130,246,0.10)',
  blueBorder: 'rgba(59,130,246,0.32)',
  amberSoft: '#fcd34d',
  amberBg: 'rgba(245,158,11,0.10)',
  amberBorder: 'rgba(245,158,11,0.30)',
  redBg: 'rgba(127,29,29,0.50)',
  redText: '#fecaca',
  redBorder: 'rgba(248,113,113,0.35)',
  radius: 8,
  radiusContainer: 14,
} as const

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

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao analisar conversa.')
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
        // Fase 12A, Frente 2B (re-auditoria): só é enviado true aqui
        // porque handleApply só roda em resposta ao clique explícito do
        // vendedor no botão "Aplicar sugestão" (a própria revisão da
        // sugestão editável nesta tela é a confirmação humana).
        confirmed_by_human: true,
      })

      setConversationText('')
      setSuggestion(null)
      setAuditDiagnostics(null)
      setEditableSummary('')
      setEditableNextAction('')
      setEditableNextActionDate('')

      await onApplied?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao aplicar sugestão.')
    } finally {
      setApplying(false)
    }
  }

  const handleReject = async () => {
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
          <div
            style={{
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radiusContainer,
              background: DS.surfaceBg,
              color: DS.textPrimary,
              overflow: 'hidden',
            }}
          >
            {/* Cabeçalho padrão */}
            <div
              style={{
                padding: compact ? 14 : 18,
                borderBottom: `1px solid ${DS.border}`,
                background: 'linear-gradient(135deg, rgba(59,130,246,0.14), rgba(17,19,24,0.98))',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    color: DS.blueSoft,
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Copiloto Comercial
                </div>
      
                <div
                  style={{
                    color: DS.textPrimary,
                    fontSize: compact ? 12 : 14,
                    fontWeight: 800,
                    lineHeight: 1.45,
                  }}
                >
                  Cole a conversa do WhatsApp ou resuma a ligação. A IA interpreta e sugere a atualização do ciclo.
                </div>
              </div>
      
              <div
                style={{
                  border: `1px solid ${DS.borderSubtle}`,
                  background: DS.panelBg,
                  borderRadius: DS.radius,
                  padding: '8px 10px',
                  minWidth: 130,
                  textAlign: 'right',
                }}
              >
                <div
                  style={{
                    color: DS.textLabel,
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 4,
                  }}
                >
                  Lead
                </div>
                <div
                  style={{
                    color: DS.textSecondary,
                    fontSize: 12,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 180,
                  }}
                >
                  {currentLeadName}
                </div>
              </div>
            </div>
      
            <div style={{ padding: compact ? 14 : 18 }}>

      {/* Cabeçalho extra — modo movimentação (só aparece quando veio de arrasto/botão) */}
      {isMoveMode && forcedInitialStatus && (
        <div
          style={{
            marginBottom: 14,
            border: `1px solid ${DS.blueBorder}`,
            background: DS.blueBg,
            borderRadius: DS.radiusContainer,
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              color: DS.blueSoft,
              fontSize: 10,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 5,
            }}
          >
            Movendo lead para
          </div>

          <div style={{ color: DS.textPrimary, fontSize: 16, fontWeight: 900 }}>
            {STATUS_LABELS[forcedInitialStatus]}
          </div>

          <div style={{ color: DS.textSecondary, fontSize: 12, lineHeight: 1.45, marginTop: 8 }}>
            Cole a conversa ou descreva o que aconteceu. A IA valida a movimentação e permite ajustar o estágio antes de aplicar.
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: 14,
            border: `1px solid ${DS.redBorder}`,
            background: DS.redBg,
            color: DS.redText,
            borderRadius: DS.radius,
            padding: '10px 12px',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}

<div
        style={{
          display: 'grid',
          gap: 14,
        }}
      >
        <div
          style={{
            border: `1px solid ${DS.border}`,
            background: DS.panelBg,
            borderRadius: DS.radiusContainer,
            padding: 14,
          }}
        >
          <div
            style={{
              color: DS.textPrimary,
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            Entrada da análise
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: compact ? '1fr' : '180px 1fr',
              gap: 12,
              alignItems: 'start',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  color: DS.textSecondary,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  marginBottom: 7,
                }}
              >
                Origem
              </label>

              <select
                value={source}
                onChange={(event) => setSource(event.target.value as ConversationSource)}
                disabled={loading || applying}
                style={{
                  width: '100%',
                  minHeight: 42,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  background: DS.inputBg,
                  color: DS.textPrimary,
                  padding: '10px 12px',
                  fontSize: 12,
                  outline: 'none',
                  opacity: loading || applying ? 0.7 : 1,
                  cursor: loading || applying ? 'not-allowed' : 'pointer',
                }}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="phone_summary">Resumo de ligação</option>
                <option value="notes">Anotação livre</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  color: DS.textSecondary,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  marginBottom: 7,
                }}
              >
                Conversa ou resumo
              </label>

              <textarea
                value={conversationText}
                onChange={(event) => setConversationText(event.target.value)}
                disabled={loading || applying}
                placeholder="Cole aqui a conversa ou escreva com suas palavras o que aconteceu com o cliente..."
                style={{
                  width: '100%',
                  minHeight: compact ? 140 : 180,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  background: DS.inputBg,
                  color: DS.textPrimary,
                  padding: '12px 12px',
                  fontSize: 12,
                  lineHeight: 1.5,
                  outline: 'none',
                  resize: 'vertical',
                  opacity: loading || applying ? 0.7 : 1,
                }}
              />

              <div
                style={{
                  marginTop: 8,
                  color: DS.textMuted,
                  fontSize: 11,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <span>Mínimo recomendado: 15 caracteres.</span>
                <span>{conversationText.trim().length} caracteres</span>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!canAnalyze || loading || applying}
            style={{
              minHeight: 40,
              borderRadius: DS.radius,
              border: `1px solid ${DS.blueBorder}`,
              background: !canAnalyze || loading || applying ? DS.panelBg : DS.blue,
              color: !canAnalyze || loading || applying ? DS.textMuted : '#ffffff',
              padding: '9px 14px',
              fontSize: 12,
              fontWeight: 900,
              cursor: !canAnalyze || loading || applying ? 'not-allowed' : 'pointer',
              opacity: !canAnalyze || loading || applying ? 0.65 : 1,
            }}
          >
            {loading ? 'Analisando...' : 'Analisar com IA'}
          </button>

          <button
            type="button"
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
            style={{
              minHeight: 40,
              borderRadius: DS.radius,
              border: `1px solid ${DS.border}`,
              background: DS.panelBg,
              color: DS.textSecondary,
              padding: '9px 14px',
              fontSize: 12,
              fontWeight: 800,
              cursor: loading || applying ? 'not-allowed' : 'pointer',
              opacity: loading || applying ? 0.65 : 1,
            }}
          >
            Limpar
          </button>
        </div>
      </div>

      {suggestion && (
        <div
          style={{
            marginTop: 18,
            border: `1px solid ${DS.blueBorder}`,
            borderRadius: DS.radiusContainer,
            background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(13,15,20,0.98))',
            padding: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div>
              <div
                style={{
                  color: DS.blueSoft,
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Análise comercial
              </div>

              <div
                style={{
                  color: DS.textSecondary,
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                Confiança:{' '}
                <span style={{ color: DS.textPrimary, fontWeight: 900 }}>
                  {confidenceLabel(suggestion.confidence)}
                </span>{' '}
                <span style={{ color: DS.textMuted }}>
                  ({Math.round(suggestion.confidence * 100)}%)
                </span>
              </div>
            </div>

            <div
              style={{
                border: `1px solid ${DS.borderSubtle}`,
                background: DS.panelBg,
                borderRadius: DS.radius,
                padding: '8px 10px',
                minWidth: 120,
                textAlign: 'right',
              }}
            >
              <div
                style={{
                  color: DS.textLabel,
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 4,
                }}
              >
                Origem
              </div>

              <div
                style={{
                  color: DS.textSecondary,
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {suggestionSourceLabel(suggestion.source)}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))',
              gap: 14,
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  color: DS.textSecondary,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  marginBottom: 7,
                }}
              >
                Estágio sugerido
              </label>

              <select
                value={editableStatus}
                onChange={(event) => setEditableStatus(event.target.value as LeadStatus)}
                disabled={applying}
                style={{
                  width: '100%',
                  minHeight: 42,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  background: DS.inputBg,
                  color: DS.textPrimary,
                  padding: '10px 12px',
                  fontSize: 12,
                  outline: 'none',
                  opacity: applying ? 0.7 : 1,
                  cursor: applying ? 'not-allowed' : 'pointer',
                }}
              >
                {OPEN_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
                <option value="ganho">{STATUS_LABELS.ganho}</option>
                <option value="perdido">{STATUS_LABELS.perdido}</option>
              </select>

              {isMoveMode &&
                forcedInitialStatus &&
                editableStatus !== forcedInitialStatus && (
                  <div
                    style={{
                      marginTop: 8,
                      border: '1px solid rgba(245,158,11,0.32)',
                      background: 'rgba(245,158,11,0.10)',
                      color: '#fcd34d',
                      borderRadius: DS.radius,
                      padding: '8px 10px',
                      fontSize: 11,
                      lineHeight: 1.45,
                    }}
                  >
                    A IA sugeriu <strong>{STATUS_LABELS[editableStatus]}</strong> em vez de{' '}
                    <strong>{STATUS_LABELS[forcedInitialStatus]}</strong>. Se quiser manter a etapa
                    original, altere o dropdown antes de aplicar.
                  </div>
                )}
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  color: DS.textSecondary,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  marginBottom: 7,
                }}
              >
                Canal identificado
              </label>

              <div
                style={{
                  minHeight: 42,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  background: DS.inputBg,
                  color: DS.textPrimary,
                  padding: '10px 12px',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {suggestion.action_channel || '—'}
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label
                style={{
                  display: 'block',
                  color: DS.textSecondary,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  marginBottom: 7,
                }}
              >
                Resumo da IA
              </label>

              <textarea
                value={editableSummary}
                onChange={(event) => setEditableSummary(event.target.value)}
                disabled={applying}
                style={{
                  width: '100%',
                  minHeight: 92,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  background: DS.inputBg,
                  color: DS.textPrimary,
                  padding: '12px 12px',
                  fontSize: 12,
                  lineHeight: 1.5,
                  outline: 'none',
                  resize: 'vertical',
                  opacity: applying ? 0.7 : 1,
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  color: DS.textSecondary,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  marginBottom: 7,
                }}
              >
                Próxima ação
              </label>

              <input
                type="text"
                value={editableNextAction}
                onChange={(event) => setEditableNextAction(event.target.value)}
                disabled={applying || editableStatus === 'novo' || isTerminalStatus(editableStatus)}
                placeholder={
                  editableStatus === 'novo'
                    ? 'Em novo, a próxima ação não será aplicada nesta fase'
                    : 'Ex.: Retornar negociação'
                }
                style={{
                  width: '100%',
                  minHeight: 42,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  background: DS.inputBg,
                  color: DS.textPrimary,
                  padding: '10px 12px',
                  fontSize: 12,
                  outline: 'none',
                  opacity: applying || editableStatus === 'novo' || isTerminalStatus(editableStatus) ? 0.58 : 1,
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  color: DS.textSecondary,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  marginBottom: 7,
                }}
              >
                Data sugerida
              </label>

              <input
                type="datetime-local"
                value={editableNextActionDate}
                onChange={(event) => setEditableNextActionDate(event.target.value)}
                disabled={applying || editableStatus === 'novo' || isTerminalStatus(editableStatus)}
                style={{
                  width: '100%',
                  minHeight: 42,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  background: DS.inputBg,
                  color: DS.textPrimary,
                  padding: '10px 12px',
                  fontSize: 12,
                  outline: 'none',
                  opacity: applying || editableStatus === 'novo' || isTerminalStatus(editableStatus) ? 0.58 : 1,
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  color: DS.textSecondary,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  marginBottom: 7,
                }}
              >
                Resultado detectado
              </label>

              <div
                style={{
                  minHeight: 42,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  background: DS.inputBg,
                  color: DS.textPrimary,
                  padding: '10px 12px',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {suggestion.action_result || '—'}
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  color: DS.textSecondary,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  marginBottom: 7,
                }}
              >
                Detalhe detectado
              </label>

              <div
                style={{
                  minHeight: 42,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  background: DS.inputBg,
                  color: DS.textPrimary,
                  padding: '10px 12px',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {suggestion.result_detail || '—'}
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label
                style={{
                  display: 'block',
                  color: DS.textSecondary,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  marginBottom: 7,
                }}
              >
                Justificativa da IA
              </label>

              <div
                style={{
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  background: DS.inputBg,
                  color: DS.textPrimary,
                  padding: '10px 12px',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                {suggestion.reason_for_recommendation}
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label
                style={{
                  display: 'block',
                  color: DS.textSecondary,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  marginBottom: 7,
                }}
              >
                Tags
              </label>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {suggestion.tags.length > 0 ? (
                  suggestion.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        border: `1px solid ${DS.blueBorder}`,
                        background: DS.blueBg,
                        color: DS.blueSoft,
                        borderRadius: 999,
                        padding: '5px 10px',
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span style={{ color: DS.textMuted, fontSize: 12 }}>
                    Nenhuma tag detectada
                  </span>
                )}
              </div>
            </div>
          </div>

          <AICoachingReview
            cycleId={cycle.id}
            conversationText={conversationText}
            source={source}
            suggestion={suggestion}
            persistenceSource={
              compact
                ? 'ai_copilot_kanban'
                : 'ai_copilot_detail'
            }
          />

          {/* ============================================================ */}
          {/* Auditoria — escondida por padrão, expande com o botão        */}
          {/* ============================================================ */}
          {auditDiagnostics && (
            <div
              style={{
                marginTop: 18,
                border: `1px solid ${DS.amberBorder}`,
                borderRadius: DS.radiusContainer,
                background: DS.amberBg,
                padding: 14,
              }}
            >
              <button
                type="button"
                onClick={() => setShowAudit((value) => !value)}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      border: `1px solid ${DS.amberBorder}`,
                      background: DS.panelBg,
                      color: DS.amberSoft,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 12,
                      fontWeight: 900,
                      flexShrink: 0,
                    }}
                  >
                    {showAudit ? '▾' : '▸'}
                  </span>

                  <span>
                    <span
                      style={{
                        display: 'block',
                        color: DS.amberSoft,
                        fontSize: 11,
                        fontWeight: 900,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        marginBottom: 3,
                      }}
                    >
                      Auditoria da IA
                    </span>

                    <span
                      style={{
                        display: 'block',
                        color: DS.textSecondary,
                        fontSize: 11,
                        lineHeight: 1.4,
                      }}
                    >
                      Diagnóstico técnico da decisão, sinais detectados e motor usado.
                    </span>
                  </span>
                </span>

                <span
                  style={{
                    border: `1px solid ${DS.borderSubtle}`,
                    borderRadius: 999,
                    background: DS.panelBg,
                    color: DS.textSecondary,
                    padding: '5px 9px',
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {showAudit ? 'Ocultar' : 'Ver detalhes'}
                </span>
              </button>

              {showAudit && (
                <div
                  style={{
                    marginTop: 12,
                    display: 'grid',
                    gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                    gap: 12,
                    fontSize: 12,
                  }}
                >
                  <div
                    style={{
                      border: `1px solid ${DS.border}`,
                      background: DS.panelBg,
                      borderRadius: DS.radius,
                      padding: '10px 12px',
                    }}
                  >
                    <div
                      style={{
                        color: DS.textLabel,
                        fontSize: 10,
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: 5,
                      }}
                    >
                      Motor final
                    </div>
                    <div style={{ color: DS.textPrimary, fontWeight: 800 }}>
                      {auditDiagnostics.engine}
                    </div>
                  </div>

                  <div
                    style={{
                      border: `1px solid ${DS.border}`,
                      background: DS.panelBg,
                      borderRadius: DS.radius,
                      padding: '10px 12px',
                    }}
                  >
                    <div
                      style={{
                        color: DS.textLabel,
                        fontSize: 10,
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: 5,
                      }}
                    >
                      Regra escolhida
                    </div>
                    <div style={{ color: DS.textPrimary, fontWeight: 800 }}>
                      {auditDiagnostics.selected_rule}
                    </div>
                  </div>

                  <div
                    style={{
                      border: `1px solid ${DS.border}`,
                      background: DS.panelBg,
                      borderRadius: DS.radius,
                      padding: '10px 12px',
                    }}
                  >
                    <div
                      style={{
                        color: DS.textLabel,
                        fontSize: 10,
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: 5,
                      }}
                    >
                      Usou histórico
                    </div>
                    <div style={{ color: DS.textPrimary, fontWeight: 800 }}>
                      {auditDiagnostics.used_history ? 'Sim' : 'Não'}
                    </div>
                  </div>

                  <div
                    style={{
                      border: `1px solid ${DS.border}`,
                      background: DS.panelBg,
                      borderRadius: DS.radius,
                      padding: '10px 12px',
                    }}
                  >
                    <div
                      style={{
                        color: DS.textLabel,
                        fontSize: 10,
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: 5,
                      }}
                    >
                      Múltiplos sinais no texto
                    </div>
                    <div style={{ color: DS.textPrimary, fontWeight: 800 }}>
                      {auditDiagnostics.multiple_text_signals ? 'Sim' : 'Não'}
                    </div>
                  </div>

                  <div
                    style={{
                      gridColumn: '1 / -1',
                      border: `1px solid ${DS.border}`,
                      background: DS.panelBg,
                      borderRadius: DS.radius,
                      padding: '10px 12px',
                    }}
                  >
                    <div
                      style={{
                        color: DS.textLabel,
                        fontSize: 10,
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: 7,
                      }}
                    >
                      Preview do texto auditado
                    </div>
                    <div
                      style={{
                        color: DS.textPrimary,
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.5,
                      }}
                    >
                      {auditDiagnostics.text_preview}
                    </div>
                  </div>

                  {auditDiagnostics.final_resolution && (
                    <div
                      style={{
                        gridColumn: '1 / -1',
                        border: '1px solid rgba(16,185,129,0.30)',
                        background: 'rgba(16,185,129,0.08)',
                        borderRadius: DS.radius,
                        padding: '12px 14px',
                      }}
                    >
                      <div
                        style={{
                          color: '#86efac',
                          fontSize: 10,
                          fontWeight: 900,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          marginBottom: 10,
                        }}
                      >
                        Desfecho final
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: compact ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        <div
                          style={{
                            border: `1px solid ${DS.borderSubtle}`,
                            background: DS.panelBg,
                            borderRadius: DS.radius,
                            padding: '9px 10px',
                          }}
                        >
                          <div
                            style={{
                              color: DS.textLabel,
                              fontSize: 10,
                              fontWeight: 900,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              marginBottom: 5,
                            }}
                          >
                            Compromisso final
                          </div>
                          <div style={{ color: DS.textPrimary, fontWeight: 900 }}>
                            {auditDiagnostics.final_resolution.final_commitment_detected ? 'Sim' : 'Não'}
                          </div>
                        </div>

                        <div
                          style={{
                            border: `1px solid ${DS.borderSubtle}`,
                            background: DS.panelBg,
                            borderRadius: DS.radius,
                            padding: '9px 10px',
                          }}
                        >
                          <div
                            style={{
                              color: DS.textLabel,
                              fontSize: 10,
                              fontWeight: 900,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              marginBottom: 5,
                            }}
                          >
                            Agendamento final
                          </div>
                          <div style={{ color: DS.textPrimary, fontWeight: 900 }}>
                            {auditDiagnostics.final_resolution.final_schedule_detected ? 'Sim' : 'Não'}
                          </div>
                        </div>

                        <div
                          style={{
                            border: `1px solid ${DS.borderSubtle}`,
                            background: DS.panelBg,
                            borderRadius: DS.radius,
                            padding: '9px 10px',
                          }}
                        >
                          <div
                            style={{
                              color: DS.textLabel,
                              fontSize: 10,
                              fontWeight: 900,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              marginBottom: 5,
                            }}
                          >
                            Superou negociação
                          </div>
                          <div style={{ color: DS.textPrimary, fontWeight: 900 }}>
                            {auditDiagnostics.final_resolution.overrode_negotiation ? 'Sim' : 'Não'}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          border: `1px solid ${DS.borderSubtle}`,
                          background: DS.inputBg,
                          borderRadius: DS.radius,
                          padding: '10px 12px',
                          color: DS.textPrimary,
                          fontSize: 12,
                          lineHeight: 1.5,
                        }}
                      >
                        <span style={{ color: DS.textSecondary, fontWeight: 800 }}>
                          Motivo da regra:{' '}
                        </span>
                        {auditDiagnostics.final_resolution.reason}
                      </div>
                    </div>
                  )}

{auditDiagnostics.segment_previews && (
                    <div
                      style={{
                        gridColumn: '1 / -1',
                        border: `1px solid ${DS.border}`,
                        background: DS.panelBg,
                        borderRadius: DS.radius,
                        padding: '12px 14px',
                      }}
                    >
                      <div
                        style={{
                          color: DS.textLabel,
                          fontSize: 10,
                          fontWeight: 900,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          marginBottom: 6,
                        }}
                      >
                        Segmentos usados na decisão
                      </div>

                      <div
                        style={{
                          color: DS.textSecondary,
                          fontSize: 11,
                          lineHeight: 1.45,
                          marginBottom: 12,
                        }}
                      >
                        Turnos detectados: {auditDiagnostics.segment_previews.turn_count} •{' '}
                        {auditDiagnostics.segment_previews.has_speaker_markers
                          ? 'Com marcadores de Cliente/Vendedor'
                          : 'Sem marcadores — usando texto bruto'}
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: compact ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            border: `1px solid ${DS.borderSubtle}`,
                            background: DS.inputBg,
                            borderRadius: DS.radius,
                            padding: '10px 12px',
                          }}
                        >
                          <div
                            style={{
                              color: DS.textLabel,
                              fontSize: 10,
                              fontWeight: 900,
                              marginBottom: 6,
                            }}
                          >
                            Trecho final da conversa
                          </div>
                          <div
                            style={{
                              color: DS.textPrimary,
                              whiteSpace: 'pre-wrap',
                              lineHeight: 1.45,
                              fontSize: 12,
                            }}
                          >
                            {auditDiagnostics.segment_previews.tail || '—'}
                          </div>
                        </div>

                        <div
                          style={{
                            border: `1px solid ${DS.borderSubtle}`,
                            background: DS.inputBg,
                            borderRadius: DS.radius,
                            padding: '10px 12px',
                          }}
                        >
                          <div
                            style={{
                              color: DS.textLabel,
                              fontSize: 10,
                              fontWeight: 900,
                              marginBottom: 6,
                            }}
                          >
                            Trecho final do cliente
                          </div>
                          <div
                            style={{
                              color: DS.textPrimary,
                              whiteSpace: 'pre-wrap',
                              lineHeight: 1.45,
                              fontSize: 12,
                            }}
                          >
                            {auditDiagnostics.segment_previews.client_tail || '—'}
                          </div>
                        </div>

                        <div
                          style={{
                            border: `1px solid ${DS.borderSubtle}`,
                            background: DS.inputBg,
                            borderRadius: DS.radius,
                            padding: '10px 12px',
                          }}
                        >
                          <div
                            style={{
                              color: DS.textLabel,
                              fontSize: 10,
                              fontWeight: 900,
                              marginBottom: 6,
                            }}
                          >
                            Trecho final do vendedor
                          </div>
                          <div
                            style={{
                              color: DS.textPrimary,
                              whiteSpace: 'pre-wrap',
                              lineHeight: 1.45,
                              fontSize: 12,
                            }}
                          >
                            {auditDiagnostics.segment_previews.seller_tail || '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

{auditDiagnostics.segment_signals && (
                    <div
                      style={{
                        gridColumn: '1 / -1',
                        border: `1px solid ${DS.border}`,
                        background: DS.panelBg,
                        borderRadius: DS.radius,
                        padding: '12px 14px',
                      }}
                    >
                      <div
                        style={{
                          color: DS.textLabel,
                          fontSize: 10,
                          fontWeight: 900,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          marginBottom: 10,
                        }}
                      >
                        Sinais por segmento
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            border: `1px solid ${DS.borderSubtle}`,
                            background: DS.inputBg,
                            borderRadius: DS.radius,
                            padding: '10px 12px',
                          }}
                        >
                          <div
                            style={{
                              color: DS.textSecondary,
                              fontSize: 11,
                              fontWeight: 900,
                              marginBottom: 8,
                            }}
                          >
                            Texto inteiro
                          </div>

                          <div style={{ display: 'grid', gap: 5, color: DS.textPrimary, fontSize: 12 }}>
                            <div>Compromisso final: {joinSignals(auditDiagnostics.segment_signals.full.final_commitment)}</div>
                            <div>Agendamento final: {joinSignals(auditDiagnostics.segment_signals.full.final_schedule)}</div>
                            <div>Comercial: {joinSignals(auditDiagnostics.segment_signals.full.commercial)}</div>
                            <div>Sem resposta: {joinSignals(auditDiagnostics.segment_signals.full.no_response)}</div>
                            <div>Perdido: {joinSignals(auditDiagnostics.segment_signals.full.lost)}</div>
                            <div>Ganho: {joinSignals(auditDiagnostics.segment_signals.full.won)}</div>
                          </div>
                        </div>

                        <div
                          style={{
                            border: `1px solid ${DS.borderSubtle}`,
                            background: DS.inputBg,
                            borderRadius: DS.radius,
                            padding: '10px 12px',
                          }}
                        >
                          <div
                            style={{
                              color: DS.textSecondary,
                              fontSize: 11,
                              fontWeight: 900,
                              marginBottom: 8,
                            }}
                          >
                            Trecho final
                          </div>

                          <div style={{ display: 'grid', gap: 5, color: DS.textPrimary, fontSize: 12 }}>
                            <div>Compromisso final: {joinSignals(auditDiagnostics.segment_signals.tail.final_commitment)}</div>
                            <div>Agendamento final: {joinSignals(auditDiagnostics.segment_signals.tail.final_schedule)}</div>
                            <div>Comercial: {joinSignals(auditDiagnostics.segment_signals.tail.commercial)}</div>
                            <div>Sem resposta: {joinSignals(auditDiagnostics.segment_signals.tail.no_response)}</div>
                            <div>Perdido: {joinSignals(auditDiagnostics.segment_signals.tail.lost)}</div>
                            <div>Ganho: {joinSignals(auditDiagnostics.segment_signals.tail.won)}</div>
                          </div>
                        </div>

                        <div
                          style={{
                            border: `1px solid ${DS.borderSubtle}`,
                            background: DS.inputBg,
                            borderRadius: DS.radius,
                            padding: '10px 12px',
                          }}
                        >
                          <div
                            style={{
                              color: DS.textSecondary,
                              fontSize: 11,
                              fontWeight: 900,
                              marginBottom: 8,
                            }}
                          >
                            Cliente final
                          </div>

                          <div style={{ display: 'grid', gap: 5, color: DS.textPrimary, fontSize: 12 }}>
                            <div>Compromisso final: {joinSignals(auditDiagnostics.segment_signals.client_tail.final_commitment)}</div>
                            <div>Agendamento final: {joinSignals(auditDiagnostics.segment_signals.client_tail.final_schedule)}</div>
                            <div>Comercial: {joinSignals(auditDiagnostics.segment_signals.client_tail.commercial)}</div>
                            <div>Sem resposta: {joinSignals(auditDiagnostics.segment_signals.client_tail.no_response)}</div>
                            <div>Perdido: {joinSignals(auditDiagnostics.segment_signals.client_tail.lost)}</div>
                            <div>Ganho: {joinSignals(auditDiagnostics.segment_signals.client_tail.won)}</div>
                          </div>
                        </div>

                        <div
                          style={{
                            border: `1px solid ${DS.borderSubtle}`,
                            background: DS.inputBg,
                            borderRadius: DS.radius,
                            padding: '10px 12px',
                          }}
                        >
                          <div
                            style={{
                              color: DS.textSecondary,
                              fontSize: 11,
                              fontWeight: 900,
                              marginBottom: 8,
                            }}
                          >
                            Vendedor final
                          </div>

                          <div style={{ display: 'grid', gap: 5, color: DS.textPrimary, fontSize: 12 }}>
                            <div>Compromisso final: {joinSignals(auditDiagnostics.segment_signals.seller_tail.final_commitment)}</div>
                            <div>Agendamento final: {joinSignals(auditDiagnostics.segment_signals.seller_tail.final_schedule)}</div>
                            <div>Comercial: {joinSignals(auditDiagnostics.segment_signals.seller_tail.commercial)}</div>
                            <div>Sem resposta: {joinSignals(auditDiagnostics.segment_signals.seller_tail.no_response)}</div>
                            <div>Perdido: {joinSignals(auditDiagnostics.segment_signals.seller_tail.lost)}</div>
                            <div>Ganho: {joinSignals(auditDiagnostics.segment_signals.seller_tail.won)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

<div
                    style={{
                      gridColumn: '1 / -1',
                      border: `1px solid ${DS.border}`,
                      background: DS.panelBg,
                      borderRadius: DS.radius,
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        color: DS.textLabel,
                        fontSize: 10,
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: 10,
                      }}
                    >
                      Provider
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: compact ? '1fr' : 'repeat(4, minmax(0, 1fr))',
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          border: `1px solid ${DS.borderSubtle}`,
                          background: DS.inputBg,
                          borderRadius: DS.radius,
                          padding: '9px 10px',
                        }}
                      >
                        <div style={{ color: DS.textLabel, fontSize: 10, fontWeight: 900, marginBottom: 5 }}>
                          Tentou usar
                        </div>
                        <div style={{ color: DS.textPrimary, fontSize: 12, fontWeight: 900 }}>
                          {auditDiagnostics.provider.attempted ? 'Sim' : 'Não'}
                        </div>
                      </div>

                      <div
                        style={{
                          border: `1px solid ${DS.borderSubtle}`,
                          background: DS.inputBg,
                          borderRadius: DS.radius,
                          padding: '9px 10px',
                        }}
                      >
                        <div style={{ color: DS.textLabel, fontSize: 10, fontWeight: 900, marginBottom: 5 }}>
                          Modelo
                        </div>
                        <div style={{ color: DS.textPrimary, fontSize: 12, fontWeight: 900 }}>
                          {auditDiagnostics.provider.model || '—'}
                        </div>
                      </div>

                      <div
                        style={{
                          border: `1px solid ${DS.borderSubtle}`,
                          background: DS.inputBg,
                          borderRadius: DS.radius,
                          padding: '9px 10px',
                        }}
                      >
                        <div style={{ color: DS.textLabel, fontSize: 10, fontWeight: 900, marginBottom: 5 }}>
                          Sucesso
                        </div>
                        <div style={{ color: DS.textPrimary, fontSize: 12, fontWeight: 900 }}>
                          {auditDiagnostics.provider.success ? 'Sim' : 'Não'}
                        </div>
                      </div>

                      <div
                        style={{
                          border: `1px solid ${DS.borderSubtle}`,
                          background: DS.inputBg,
                          borderRadius: DS.radius,
                          padding: '9px 10px',
                        }}
                      >
                        <div style={{ color: DS.textLabel, fontSize: 10, fontWeight: 900, marginBottom: 5 }}>
                          Falha
                        </div>
                        <div style={{ color: DS.textPrimary, fontSize: 12, fontWeight: 900 }}>
                          {auditDiagnostics.provider.failure_reason || '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      border: `1px solid ${DS.border}`,
                      background: DS.panelBg,
                      borderRadius: DS.radius,
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        color: DS.textLabel,
                        fontSize: 10,
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: 10,
                      }}
                    >
                      Sinais de texto
                    </div>

                    <div style={{ display: 'grid', gap: 6, color: DS.textPrimary, fontSize: 12 }}>
                      <div>Perdido: {joinSignals(auditDiagnostics.text_signals.lost)}</div>
                      <div>Ganho: {joinSignals(auditDiagnostics.text_signals.won)}</div>
                      <div>Negociação: {joinSignals(auditDiagnostics.text_signals.negotiation)}</div>
                      <div>Contato sem resposta: {joinSignals(auditDiagnostics.text_signals.no_response)}</div>
                      <div>Agenda: {joinSignals(auditDiagnostics.text_signals.agenda)}</div>
                    </div>
                  </div>

                  <div
                    style={{
                      border: `1px solid ${DS.border}`,
                      background: DS.panelBg,
                      borderRadius: DS.radius,
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        color: DS.textLabel,
                        fontSize: 10,
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: 10,
                      }}
                    >
                      Sinais do histórico
                    </div>

                    <div style={{ color: DS.textMuted, fontSize: 10, marginBottom: 8 }}>
                      Apenas leitura — não é usado pelo fallback.
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gap: 8,
                        color: DS.textPrimary,
                        fontSize: 12,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      <div>
                        <span style={{ color: DS.textSecondary, fontWeight: 800 }}>Negociação: </span>
                        {auditDiagnostics.history_signals.negotiation.length > 0
                          ? auditDiagnostics.history_signals.negotiation.join('\n')
                          : '—'}
                      </div>

                      <div>
                        <span style={{ color: DS.textSecondary, fontWeight: 800 }}>Agenda: </span>
                        {auditDiagnostics.history_signals.agenda.length > 0
                          ? auditDiagnostics.history_signals.agenda.join('\n')
                          : '—'}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      gridColumn: '1 / -1',
                      border: `1px solid ${DS.border}`,
                      background: DS.panelBg,
                      borderRadius: DS.radius,
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        color: DS.textLabel,
                        fontSize: 10,
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: 10,
                      }}
                    >
                      Notas
                    </div>

                    <div
                      style={{
                        border: `1px solid ${DS.borderSubtle}`,
                        background: DS.inputBg,
                        borderRadius: DS.radius,
                        padding: '10px 12px',
                        color: DS.textPrimary,
                        fontSize: 12,
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.5,
                      }}
                    >
                      {auditDiagnostics.notes.length > 0 ? auditDiagnostics.notes.join('\n') : '—'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

<div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: `1px solid ${DS.borderSubtle}`,
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={handleReject}
              disabled={applying}
              style={{
                minHeight: 42,
                flex: '1 1 160px',
                borderRadius: DS.radius,
                border: `1px solid ${DS.border}`,
                background: DS.panelBg,
                color: DS.textSecondary,
                padding: '9px 14px',
                fontSize: 12,
                fontWeight: 800,
                cursor: applying ? 'not-allowed' : 'pointer',
                opacity: applying ? 0.65 : 1,
              }}
            >
              Descartar
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={applying || loading}
              style={{
                minHeight: 42,
                flex: '1.4 1 220px',
                borderRadius: DS.radius,
                border:
                  editableStatus === 'ganho'
                    ? '1px solid rgba(16,185,129,0.34)'
                    : editableStatus === 'perdido'
                      ? '1px solid rgba(239,68,68,0.34)'
                      : `1px solid ${DS.blueBorder}`,
                background:
                  applying || loading
                    ? DS.panelBg
                    : editableStatus === 'ganho'
                      ? '#1e7d4a'
                      : editableStatus === 'perdido'
                        ? '#b91c1c'
                        : DS.blue,
                color: applying || loading ? DS.textMuted : '#ffffff',
                padding: '9px 14px',
                fontSize: 12,
                fontWeight: 900,
                cursor: applying || loading ? 'not-allowed' : 'pointer',
                opacity: applying || loading ? 0.65 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
              }}
            >
              {applyButtonLabel}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}