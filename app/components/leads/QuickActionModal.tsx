'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'

// ============================================================================
// Types
// ============================================================================

export type QuickActionType =
  // Etapa NOVO
  | 'quick_approach_contact'
  | 'quick_call_done'
  | 'quick_whats_sent'
  | 'quick_email_sent'
  | 'quick_bad_data'
  // Etapa CONTATO
  | 'quick_showed_interest'
  | 'quick_asked_info'
  | 'quick_answered_doubt'
  | 'quick_scheduled'
  | 'quick_asked_proposal'
  // Etapa RESPONDEU
  | 'quick_qualified'
  | 'quick_proposal_presented'
  | 'quick_doubt_answered'
  | 'quick_visit_scheduled'
  | 'quick_negotiation_started'
  // Etapa NEGOCIAÇÃO
  | 'quick_final_proposal_sent'
  | 'quick_objection_registered'
  | 'quick_commercial_condition'
  | 'quick_closing_scheduled'
  | 'quick_closed_won'
  | 'quick_closed_lost'
  // Genérica
  | 'quick_proposal'

export const QUICK_ACTION_SUGGESTED_STATUS: Record<QuickActionType, string | null> = {
  // NOVO
  quick_approach_contact: 'contato',
  quick_call_done: 'contato',
  quick_whats_sent: 'contato',
  quick_email_sent: 'contato',
  quick_bad_data: null,
  // CONTATO
  quick_showed_interest: 'respondeu',
  quick_asked_info: null,
  quick_answered_doubt: 'respondeu',
  quick_scheduled: 'respondeu',
  quick_asked_proposal: 'negociacao',
  // RESPONDEU
  quick_qualified: 'negociacao',
  quick_proposal_presented: 'negociacao',
  quick_doubt_answered: null,
  quick_visit_scheduled: null,
  quick_negotiation_started: 'negociacao',
  // NEGOCIAÇÃO
  quick_final_proposal_sent: null,
  quick_objection_registered: null,
  quick_commercial_condition: null,
  quick_closing_scheduled: null,
  quick_closed_won: 'ganho',
  quick_closed_lost: 'perdido',
  // Genérica
  quick_proposal: 'negociacao',
}

// ============================================================================
// getActionsForStatus
// ============================================================================

const STATUS_LABEL_MAP: Record<string, string> = {
  novo: 'Novo',
  contato: 'Contato',
  respondeu: 'Respondeu',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
}

export function getActionsForStatus(status: string): { id: QuickActionType; label: string }[] {
  switch (status) {
    case 'novo':
      return [
        { id: 'quick_approach_contact', label: 'Abordagem realizada' },
        { id: 'quick_call_done', label: 'Ligação feita' },
        { id: 'quick_whats_sent', label: 'WhatsApp enviado' },
        { id: 'quick_email_sent', label: 'Email enviado' },
        { id: 'quick_bad_data', label: 'Telefone incorreto' },
      ]
    case 'contato':
      return [
        { id: 'quick_showed_interest', label: 'Demonstrou interesse' },
        { id: 'quick_asked_info', label: 'Pediu mais informações' },
        { id: 'quick_answered_doubt', label: 'Respondeu dúvida' },
        { id: 'quick_scheduled', label: 'Agendamento realizado' },
        { id: 'quick_asked_proposal', label: 'Pediu proposta' },
      ]
    case 'respondeu':
      return [
        { id: 'quick_qualified', label: 'Qualificação realizada' },
        { id: 'quick_proposal_presented', label: 'Proposta apresentada' },
        { id: 'quick_doubt_answered', label: 'Dúvida respondida' },
        { id: 'quick_visit_scheduled', label: 'Visita agendada' },
        { id: 'quick_negotiation_started', label: 'Negociação iniciada' },
      ]
    case 'negociacao':
      return [
        { id: 'quick_final_proposal_sent', label: 'Proposta final enviada' },
        { id: 'quick_objection_registered', label: 'Objeção registrada' },
        { id: 'quick_commercial_condition', label: 'Condição comercial discutida' },
        { id: 'quick_closing_scheduled', label: 'Fechamento agendado' },
        { id: 'quick_closed_won', label: 'Fechou ✓' },
        { id: 'quick_closed_lost', label: 'Perdido ✗' },
      ]
    default:
      return [
        { id: 'quick_approach_contact', label: 'Abordagem realizada' },
        { id: 'quick_call_done', label: 'Ligação feita' },
        { id: 'quick_answered_doubt', label: 'Respondeu dúvida' },
        { id: 'quick_scheduled', label: 'Agendamento realizado' },
        { id: 'quick_proposal', label: 'Proposta realizada' },
        { id: 'quick_bad_data', label: 'Telefone incorreto' },
      ]
  }
}

// ============================================================================
// logQuickAction
// ============================================================================

export async function logQuickAction(
  supabase: any,
  companyId: string,
  cycleId: string,
  userId: string,
  eventType: QuickActionType,
  detail: string = '',
  channel: 'whatsapp' | 'copy' = 'copy'
) {
  try {
    const metadata = {
      source: 'quick_action',
      detail,
      channel,
      suggested_next_status: QUICK_ACTION_SUGGESTED_STATUS[eventType],
    }
    await supabase.from('cycle_events').insert({
      company_id: companyId,
      cycle_id: cycleId,
      event_type: eventType,
      created_by: userId,
      metadata,
      occurred_at: new Date().toISOString(),
    })
    return QUICK_ACTION_SUGGESTED_STATUS[eventType]
  } catch (e: any) {
    console.error(`Erro ao registrar ação rápida (cycleId=${cycleId}):`, e)
    return null
  }
}

// ============================================================================
// QuickActionModal
// ============================================================================

export function QuickActionModal({
  isOpen,
  leadName,
  currentStatus,
  onClose,
  onSave,
  isLoading,
}: {
  isOpen: boolean
  leadName: string
  currentStatus?: string
  onClose: () => void
  onSave: (action: QuickActionType, detail: string) => void
  isLoading: boolean
}) {
  const [selectedAction, setSelectedAction] = useState<QuickActionType | null>(null)
  const [detail, setDetail] = useState('')

  const actions = getActionsForStatus(currentStatus ?? '')
  const stageLabel = currentStatus ? (STATUS_LABEL_MAP[currentStatus] ?? currentStatus) : null

  const handleSave = () => {
    if (!selectedAction) {
      alert('Selecione uma ação')
      return
    }
    onSave(selectedAction, detail)
    setSelectedAction(null)
    setDetail('')
  }

  const getActionStyle = (action: { id: QuickActionType; label: string }, isSelected: boolean) => {
    const base = {
      padding: '8px 10px',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 10,
      fontWeight: 700,
      transition: 'all 200ms',
    }
    if (action.id === 'quick_closed_won') {
      return {
        ...base,
        border: isSelected ? '1px solid #10b981' : '1px solid #064e3b',
        background: isSelected ? '#10b981' : '#052e16',
        color: isSelected ? '#000' : '#6ee7b7',
      }
    }
    if (action.id === 'quick_closed_lost') {
      return {
        ...base,
        border: isSelected ? '1px solid #ef4444' : '1px solid #7f1d1d',
        background: isSelected ? '#ef4444' : '#2d0a0a',
        color: isSelected ? '#fff' : '#fca5a5',
      }
    }
    return {
      ...base,
      border: isSelected ? '1px solid #10b981' : '1px solid #2a2a2a',
      background: isSelected ? '#10b981' : '#222',
      color: isSelected ? '#000' : 'white',
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#111',
          border: '1px solid #333',
          borderRadius: 12,
          padding: 20,
          width: '90%',
          maxWidth: 400,
          color: 'white',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>Registrar Contato</div>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 16, color: '#bfdbfe' }}>
          Lead: <strong>{leadName}</strong>
          {stageLabel && (
            <span style={{ marginLeft: 8, color: '#a78bfa' }}>· Etapa: {stageLabel}</span>
          )}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 8 }}>Ação *</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {actions.map((action) => (
              <button
                key={action.id}
                onClick={() => setSelectedAction(action.id)}
                style={getActionStyle(action, selectedAction === action.id)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>Detalhes (opcional)</label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Adicione notas..."
            style={{
              width: '100%',
              minHeight: 60,
              padding: '8px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: '#222',
              color: 'white',
              fontSize: 11,
              fontFamily: 'system-ui',
              resize: 'vertical',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: 'transparent',
              color: 'white',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 11,
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedAction || isLoading}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 6,
              border: 'none',
              background: selectedAction && !isLoading ? '#10b981' : '#1f2937',
              color: 'white',
              cursor: selectedAction && !isLoading ? 'pointer' : 'not-allowed',
              fontWeight: 700,
              fontSize: 11,
              opacity: selectedAction && !isLoading ? 1 : 0.5,
            }}
          >
            {isLoading ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
