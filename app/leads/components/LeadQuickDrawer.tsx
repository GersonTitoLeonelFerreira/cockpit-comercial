'use client'

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import {
  IconWhatsApp,
  IconClipboard,
  IconCircleCheck,
  IconLink,
  IconX,
} from '@/app/components/icons/UiIcons'
import { toLocalDatetimeInputValue } from '@/app/lib/dateUtils'
import { calculateCyclePulse } from '@/app/lib/services/sales-pulse'
import type { SalesPulseCycleRow, SalesPulseSeverity } from '@/app/types/sales-pulse'

export type WorklistItem = {
  id: string
  lead_id: string
  name: string
  phone: string | null
  status: string
  next_action: string | null
  next_action_date: string | null
  stage_entered_at: string
  updated_at?: string | null
}

type LeadQuickDrawerProps = {
  item: WorklistItem | null
  onClose: () => void
  supabase: any
  onSaved?: () => void
}

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  contato: 'Contato',
  respondeu: 'Agenda',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
}

const PULSE_BADGE_STYLES: Record<
  SalesPulseSeverity,
  { border: string; background: string; color: string }
> = {
  positive: {
    border: 'rgba(34,197,94,0.30)',
    background: 'rgba(34,197,94,0.10)',
    color: '#86efac',
  },
  neutral: {
    border: 'rgba(59,130,246,0.30)',
    background: 'rgba(59,130,246,0.10)',
    color: '#93c5fd',
  },
  warning: {
    border: 'rgba(245,158,11,0.34)',
    background: 'rgba(245,158,11,0.12)',
    color: '#fcd34d',
  },
  danger: {
    border: 'rgba(239,68,68,0.34)',
    background: 'rgba(239,68,68,0.12)',
    color: '#fca5a5',
  },
  dead: {
    border: 'rgba(113,113,122,0.34)',
    background: 'rgba(113,113,122,0.12)',
    color: '#d4d4d8',
  },
}

function supportsSalesPulse(status: string) {
  return status === 'contato' || status === 'respondeu' || status === 'negociacao'
}

function getQuickDrawerPulse(item: WorklistItem | null) {
  if (!item || !supportsSalesPulse(item.status)) return null

  const row: SalesPulseCycleRow = {
    id: item.id,
    company_id: '',
    lead_id: item.lead_id,
    owner_user_id: null,
    status: item.status as SalesPulseCycleRow['status'],
    previous_status: null,
    stage_entered_at: item.stage_entered_at,
    next_action: item.next_action,
    next_action_date: item.next_action_date,
    current_group_id: null,
    created_at: item.stage_entered_at,
    updated_at: item.updated_at ?? item.stage_entered_at,
    closed_at: null,
    won_at: null,
    lost_at: null,
    lost_reason: null,
    leads: {
      id: item.lead_id,
      name: item.name,
      phone: item.phone,
      email: null,
    },
  }

  return calculateCyclePulse(row)
}

export default function LeadQuickDrawer({ item, onClose, supabase, onSaved }: LeadQuickDrawerProps) {
  const [nextAction, setNextAction] = useState('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pulse = useMemo(() => getQuickDrawerPulse(item), [item])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (item) {
      setNextAction(item.next_action ?? '')
      setNextActionDate(
        item.next_action_date
          ? toLocalDatetimeInputValue(item.next_action_date)
          : ''
      )
      setSaved(false)
      setFeedbackError(null)
    }
  }, [item])

  const handleSave = useCallback(async () => {
    if (!item) return
    setSaving(true)
    setFeedbackError(null)

    try {
      const { error } = await supabase
        .from('sales_cycles')
        .update({
          next_action: nextAction.trim() || null,
          next_action_date: nextActionDate ? new Date(nextActionDate).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)

      if (error) throw error

      setSaved(true)
      onSaved?.()
    } catch (e: unknown) {
      setSaved(false)
      setFeedbackError(e instanceof Error ? e.message : 'Erro ao salvar agenda.')
    } finally {
      setSaving(false)
    }
  }, [item, nextAction, nextActionDate, supabase, onSaved])

  const handleCopyPhone = useCallback(() => {
    if (item?.phone) {
      navigator.clipboard.writeText(item.phone).catch(() => {})
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    }
  }, [item])

  const handleWhatsApp = useCallback(() => {
    if (!item?.phone) return
    const digits = item.phone.replace(/\D/g, '')
    const phone = digits.startsWith('55') ? digits : `55${digits}`
    window.open(`https://wa.me/${phone}`, '_blank')
  }, [item])

  if (!item) return null

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9990,
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 360,
          background: '#111',
          borderLeft: '1px solid #333',
          zIndex: 9991,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #222',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 900,
                fontSize: 15,
                color: 'white',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.name}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              {STATUS_LABELS[item.status] ?? item.status}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              fontSize: 20,
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Pulse */}
          {pulse && (
            <div
              style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 900, marginBottom: 8 }}>
                PULSO COMERCIAL
              </div>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  width: 'fit-content',
                  padding: '4px 8px',
                  borderRadius: 999,
                  border: `1px solid ${PULSE_BADGE_STYLES[pulse.severity].border}`,
                  background: PULSE_BADGE_STYLES[pulse.severity].background,
                  color: PULSE_BADGE_STYLES[pulse.severity].color,
                  fontSize: 11,
                  fontWeight: 900,
                  lineHeight: 1.15,
                  whiteSpace: 'nowrap',
                }}
              >
                {pulse.stateLabel} · {pulse.score}/100
              </div>

              <div style={{ marginTop: 10, color: '#d1d5db', fontSize: 12, lineHeight: 1.45 }}>
                {pulse.mainReason}
              </div>

              <div style={{ marginTop: 10, color: '#9ca3af', fontSize: 12, lineHeight: 1.45 }}>
                <strong style={{ color: '#e5e7eb' }}>Orientação:</strong> {pulse.recommendedAction}
              </div>
            </div>
          )}

          {/* Phone + Actions */}
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, marginBottom: 8 }}>
              TELEFONE
            </div>
            <div
              style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#e5e7eb',
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              {item.phone ?? 'Sem telefone'}
            </div>
            {item.phone && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleWhatsApp}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#065f46',
                    color: '#6ee7b7',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <IconWhatsApp size={14} /> WhatsApp
                </button>
                <button
                  onClick={handleCopyPhone}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #374151',
                    background: copied ? '#065f46' : '#1f2937',
                    color: copied ? '#6ee7b7' : '#d1d5db',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    transition: 'background 200ms, color 200ms',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {copied ? <><IconCircleCheck size={14} /> Copiado!</> : <><IconClipboard size={14} /> Copiar</>}
                </button>
              </div>
            )}
          </div>

          {/* Next action */}
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, marginBottom: 8 }}>
              PRÓXIMO CONTATO
            </div>
            <input
              type="text"
              value={nextAction}
              onChange={(e) => { setNextAction(e.target.value); setSaved(false) }}
              placeholder="Ex.: Ligar para fechar proposta"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #374151',
                background: '#1a1a1a',
                color: 'white',
                fontSize: 13,
                boxSizing: 'border-box',
                marginBottom: 8,
              }}
            />
            <input
              type="datetime-local"
              value={nextActionDate}
              onChange={(e) => { setNextActionDate(e.target.value); setSaved(false) }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #374151',
                background: '#1a1a1a',
                color: 'white',
                fontSize: 13,
                boxSizing: 'border-box',
                marginBottom: 8,
              }}
            />
            {feedbackError && (
              <div
                style={{
                  marginBottom: 8,
                  border: '1px solid rgba(239,68,68,0.35)',
                  background: 'rgba(127,29,29,0.22)',
                  color: '#fecaca',
                  borderRadius: 8,
                  padding: '9px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1.4,
                }}
              >
                {feedbackError}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: 'none',
                background: saved ? '#065f46' : '#1d4ed8',
                color: saved ? '#6ee7b7' : 'white',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 700,
                opacity: saving ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {saving ? 'Salvando…' : saved ? <><IconCircleCheck size={14} /> Salvo</> : 'Salvar agenda'}
            </button>
          </div>

          {/* Open full lead */}
          <div>
            <a
              href={`/sales-cycles/${item.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #374151',
                background: '#1f2937',
                color: '#93c5fd',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 700,
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
            >
              <IconLink size={14} /> Abrir lead completo
            </a>
          </div>

          {/* Agenda info */}
          {item.next_action_date && (
            <div
              style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 12,
              }}
            >
              <div style={{ color: '#9ca3af', fontWeight: 700, marginBottom: 4 }}>AGENDADO</div>
              <div style={{ color: '#fbbf24', fontWeight: 700 }}>
                {new Date(item.next_action_date).toLocaleString('pt-BR')}
              </div>
              {item.next_action && (
                <div style={{ color: '#d1d5db', marginTop: 4 }}>{item.next_action}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
