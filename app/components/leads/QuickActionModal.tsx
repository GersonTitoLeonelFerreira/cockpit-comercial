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

type QuickActionChannel = 'whatsapp' | 'copy'

type QuickActionMetadata = {
  source: string
  action_id: string
  detail: string
  channel: QuickActionChannel
  suggested_next_status: string | null
}

type CycleEventInsertPayload = {
  company_id: string
  cycle_id: string
  event_type: string
  created_by: string
  metadata: QuickActionMetadata
  occurred_at: string
}

type QuickActionSupabaseClient = {
  from: (table: 'cycle_events') => {
    insert: (payload: CycleEventInsertPayload) => PromiseLike<unknown>
  }
}

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
  supabase: QuickActionSupabaseClient,
  companyId: string,
  cycleId: string,
  userId: string,
  eventType: string,
  detail: string = '',
  channel: QuickActionChannel = 'copy'
) {
  try {
    // Special win/loss actions are not in the catalog
    const suggestedNextStatus =
      eventType === 'quick_closed_won' ? 'ganho' :
      eventType === 'quick_closed_lost' ? 'perdido' :
      findActionById(resolveActionId(eventType))?.suggestedNextStatus ?? null

    const metadata = {
      source: EVENT_SOURCES.quick_action,
      action_id: eventType,
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
  } catch (e: unknown) {
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
      minHeight: 42,
      padding: '10px 12px',
      borderRadius: 12,
      cursor: 'pointer',
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: '-0.01em',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition:
        'border-color 180ms ease, background 180ms ease, transform 180ms ease, box-shadow 180ms ease, color 180ms ease',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
    }

    if (action.id === 'quick_closed_won') {
      return {
        ...base,
        border: isSelected ? '1px solid rgba(16,185,129,0.85)' : '1px solid rgba(16,185,129,0.22)',
        background: isSelected
          ? 'linear-gradient(135deg, rgba(16,185,129,0.95), rgba(5,150,105,0.85))'
          : 'rgba(6,78,59,0.22)',
        color: isSelected ? '#02130d' : '#86efac',
        boxShadow: isSelected
          ? '0 14px 32px rgba(16,185,129,0.18), inset 0 1px 0 rgba(255,255,255,0.20)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }
    }

    if (action.id === 'quick_closed_lost') {
      return {
        ...base,
        border: isSelected ? '1px solid rgba(239,68,68,0.90)' : '1px solid rgba(239,68,68,0.22)',
        background: isSelected
          ? 'linear-gradient(135deg, rgba(239,68,68,0.95), rgba(185,28,28,0.85))'
          : 'rgba(127,29,29,0.22)',
        color: isSelected ? '#fff' : '#fca5a5',
        boxShadow: isSelected
          ? '0 14px 32px rgba(239,68,68,0.16), inset 0 1px 0 rgba(255,255,255,0.18)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }
    }

    return {
      ...base,
      border: isSelected ? '1px solid rgba(59,130,246,0.90)' : '1px solid rgba(148,163,184,0.14)',
      background: isSelected
        ? 'linear-gradient(135deg, rgba(37,99,235,0.95), rgba(29,78,216,0.82))'
        : 'linear-gradient(180deg, rgba(21,23,42,0.95), rgba(15,23,42,0.88))',
      color: isSelected ? '#ffffff' : '#e5e7eb',
      boxShadow: isSelected
        ? '0 14px 32px rgba(37,99,235,0.20), inset 0 1px 0 rgba(255,255,255,0.16)'
        : 'inset 0 1px 0 rgba(255,255,255,0.04)',
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
        background:
          'radial-gradient(circle at 50% 35%, rgba(37,99,235,0.14), transparent 32%), rgba(3,7,18,0.78)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: 18,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%',
          maxWidth: 440,
          color: '#f8fafc',
          borderRadius: 22,
          border: '1px solid rgba(148,163,184,0.16)',
          background:
            'linear-gradient(180deg, rgba(17,19,24,0.98), rgba(9,11,15,0.98))',
          boxShadow:
            '0 28px 80px rgba(0,0,0,0.62), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.05)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '20px 20px 16px',
            borderBottom: '1px solid rgba(148,163,184,0.10)',
            background:
              'linear-gradient(180deg, rgba(15,23,42,0.72), rgba(15,23,42,0.18))',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.16em',
              color: '#60a5fa',
              marginBottom: 8,
            }}
          >
            AÇÃO RÁPIDA
          </div>

          <div
            style={{
              fontSize: 18,
              fontWeight: 950,
              letterSpacing: '-0.03em',
              color: '#f8fafc',
              marginBottom: 12,
            }}
          >
            Registrar Contato
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              color: '#94a3b8',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 999,
                padding: '7px 10px',
                border: '1px solid rgba(59,130,246,0.18)',
                background: 'rgba(37,99,235,0.10)',
                color: '#bfdbfe',
                maxWidth: '100%',
              }}
            >
              Lead:
              <strong
                style={{
                  color: '#dbeafe',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {leadName}
              </strong>
            </span>

            {stageLabel && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 999,
                  padding: '7px 10px',
                  border: '1px solid rgba(168,85,247,0.18)',
                  background: 'rgba(88,28,135,0.16)',
                  color: '#c4b5fd',
                }}
              >
                Etapa: {stageLabel}
              </span>
            )}
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 900,
                display: 'block',
                marginBottom: 10,
                color: '#e5e7eb',
                letterSpacing: '-0.01em',
              }}
            >
              Ação *
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => setSelectedAction(action.id)}
                  style={getActionStyle(action, selectedAction === action.id)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 900,
                display: 'block',
                marginBottom: 8,
                color: '#e5e7eb',
                letterSpacing: '-0.01em',
              }}
            >
              Detalhes
              <span style={{ color: '#64748b', fontWeight: 800 }}> (opcional)</span>
            </label>

            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Adicione notas sobre o contato..."
              style={{
                width: '100%',
                minHeight: 82,
                padding: '12px 13px',
                borderRadius: 14,
                border: '1px solid rgba(148,163,184,0.14)',
                background: 'linear-gradient(180deg, rgba(15,23,42,0.82), rgba(15,23,42,0.64))',
                color: '#f8fafc',
                fontSize: 12,
                lineHeight: 1.5,
                fontFamily: 'system-ui',
                resize: 'vertical',
                outline: 'none',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              paddingTop: 2,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              style={{
                flex: 1,
                minHeight: 42,
                padding: '10px 12px',
                borderRadius: 13,
                border: '1px solid rgba(148,163,184,0.16)',
                background: 'rgba(15,23,42,0.48)',
                color: '#e5e7eb',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 850,
                fontSize: 12,
                opacity: isLoading ? 0.5 : 1,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!selectedAction || isLoading}
              style={{
                flex: 1,
                minHeight: 42,
                padding: '10px 12px',
                borderRadius: 13,
                border: selectedAction && !isLoading
                  ? '1px solid rgba(96,165,250,0.65)'
                  : '1px solid rgba(148,163,184,0.10)',
                background: selectedAction && !isLoading
                  ? 'linear-gradient(135deg, rgba(37,99,235,0.98), rgba(29,78,216,0.86))'
                  : 'rgba(30,41,59,0.55)',
                color: selectedAction && !isLoading ? '#ffffff' : '#94a3b8',
                cursor: selectedAction && !isLoading ? 'pointer' : 'not-allowed',
                fontWeight: 900,
                fontSize: 12,
                opacity: selectedAction && !isLoading ? 1 : 0.72,
                boxShadow: selectedAction && !isLoading
                  ? '0 16px 34px rgba(37,99,235,0.24), inset 0 1px 0 rgba(255,255,255,0.16)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.03)',
              }}
            >
              {isLoading ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
