'use client'

import React, { useState, useEffect, useCallback } from 'react'

export type WorklistItem = {
  id: string
  lead_id: string
  name: string
  phone: string | null
  status: string
  next_action: string | null
  next_action_date: string | null
  stage_entered_at: string
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
  respondeu: 'Respondeu',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
}

export default function LeadQuickDrawer({ item, onClose, supabase, onSaved }: LeadQuickDrawerProps) {
  const [nextAction, setNextAction] = useState('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (item) {
      setNextAction(item.next_action ?? '')
      setNextActionDate(
        item.next_action_date
          ? new Date(item.next_action_date).toISOString().slice(0, 16)
          : ''
      )
      setSaved(false)
    }
  }, [item])

  const handleSave = useCallback(async () => {
    if (!item) return
    setSaving(true)
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
    } catch (e: any) {
      alert('Erro ao salvar: ' + (e?.message ?? String(e)))
    } finally {
      setSaving(false)
    }
  }, [item, nextAction, nextActionDate, supabase, onSaved])

  const handleCopyPhone = useCallback(() => {
    if (item?.phone) {
      navigator.clipboard.writeText(item.phone).catch(() => {})
    }
  }, [item])

  const handleWhatsApp = useCallback(() => {
    if (!item?.phone) return
    const digits = item.phone.replace(/\D/g, '')
    window.open(`https://wa.me/55${digits}`, '_blank')
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
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                  }}
                >
                  💬 WhatsApp
                </button>
                <button
                  onClick={handleCopyPhone}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #374151',
                    background: '#1f2937',
                    color: '#d1d5db',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  📋 Copiar
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
              }}
            >
              {saving ? 'Salvando…' : saved ? '✓ Salvo' : 'Salvar agenda'}
            </button>
          </div>

          {/* Open full lead */}
          <div>
            <a
              href={`/sales-cycles/${item.id}`}
              style={{
                display: 'block',
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
              🔗 Abrir lead completo
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
