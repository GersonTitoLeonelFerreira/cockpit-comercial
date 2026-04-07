'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getActionsForStage,
  findActionById,
  getStageLabel,
  resolveActionId,
} from '@/app/config/stageActions'
import { EVENT_SOURCES } from '@/app/config/analyticsBase'

// ============================================================================
// Types
// ============================================================================

/** ID de ação — novo formato snake_case com prefixo de etapa, ou IDs legados */
export type QuickActionType = string

// ============================================================================
// getActionsForStatus
// ============================================================================

export function getActionsForStatus(status: string): { id: string; label: string }[] {
  const baseActions = getActionsForStage(status).map(a => ({ id: a.id, label: a.label }))
  if (status === 'negociacao') {
    return [
      ...baseActions,
      { id: 'quick_closed_won', label: 'Fechou ✓' },
      { id: 'quick_closed_lost', label: 'Perdido ✗' },
    ]
  }
  return baseActions
}

// ============================================================================
// logQuickAction
// ============================================================================

export async function logQuickAction(
  supabase: any,
  companyId: string,
  cycleId: string,
  userId: string,
  eventType: string,
  detail: string = '',
  channel: 'whatsapp' | 'copy' = 'copy'
) {
  try {
    // Special win/loss actions are not in the catalog
    const suggestedNextStatus =
      eventType === 'quick_closed_won' ? 'ganho' :
      eventType === 'quick_closed_lost' ? 'perdido' :
      findActionById(resolveActionId(eventType))?.suggestedNextStatus ?? null

    const metadata = {
      source: EVENT_SOURCES.quick_action,
      detail,
      channel,
      suggested_next_status: suggestedNextStatus,
    }
    await supabase.from('cycle_events').insert({
      company_id: companyId,
      cycle_id: cycleId,
      event_type: eventType,
      created_by: userId,
      metadata,
      occurred_at: new Date().toISOString(),
    })
    return suggestedNextStatus
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
  onSave: (action: string, detail: string) => void
  isLoading: boolean
}) {
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [detail, setDetail] = useState('')

  const actions = getActionsForStatus(currentStatus ?? '')
  const stageLabel = currentStatus ? (getStageLabel(currentStatus) ?? currentStatus) : null

  const handleSave = () => {
    if (!selectedAction) {
      alert('Selecione uma ação')
      return
    }
    onSave(selectedAction, detail)
    setSelectedAction(null)
    setDetail('')
  }

  const getActionStyle = (action: { id: string; label: string }, isSelected: boolean) => {
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
