'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'

// ============================================================================
// Types
// ============================================================================

export type QuickActionType =
  | 'quick_approach_contact'
  | 'quick_call_done'
  | 'quick_answered_doubt'
  | 'quick_scheduled'
  | 'quick_proposal'
  | 'quick_bad_data'

export const QUICK_ACTION_SUGGESTED_STATUS: Record<QuickActionType, string | null> = {
  quick_approach_contact: 'contato',
  quick_call_done: 'contato',
  quick_answered_doubt: 'respondeu',
  quick_scheduled: 'respondeu',
  quick_proposal: 'negociacao',
  quick_bad_data: null,
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
      source: 'kanban_quick_action',
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
  onClose,
  onSave,
  isLoading,
}: {
  isOpen: boolean
  leadName: string
  onClose: () => void
  onSave: (action: string, detail: string) => void
  isLoading: boolean
}) {
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [detail, setDetail] = useState('')

  const actions: { id: QuickActionType; label: string }[] = [
    { id: 'quick_approach_contact', label: 'Abordagem realizada' },
    { id: 'quick_call_done', label: 'Ligação feita' },
    { id: 'quick_answered_doubt', label: 'Respondido dúvida' },
    { id: 'quick_scheduled', label: 'Agendamento realizado' },
    { id: 'quick_proposal', label: 'Proposta realizada' },
    { id: 'quick_bad_data', label: 'Telefone incorreto' },
  ]

  const handleSave = () => {
    if (!selectedAction) {
      alert('Selecione uma ação')
      return
    }
    onSave(selectedAction, detail)
    setSelectedAction(null)
    setDetail('')
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
        <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 12 }}>Registrar Contato</div>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 16, color: '#bfdbfe' }}>
          Lead: <strong>{leadName}</strong>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 8 }}>Ação *</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {actions.map((action) => (
              <button
                key={action.id}
                onClick={() => setSelectedAction(action.id)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: selectedAction === action.id ? '1px solid #10b981' : '1px solid #2a2a2a',
                  background: selectedAction === action.id ? '#10b981' : '#222',
                  color: selectedAction === action.id ? '#000' : 'white',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 700,
                  transition: 'all 200ms',
                }}
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
