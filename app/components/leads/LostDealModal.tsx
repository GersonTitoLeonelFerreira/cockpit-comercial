'use client'

import { useState } from 'react'
import { closeCycleLost } from '@/app/lib/services/sales-cycles'
import { IconCircleX, IconLoader } from '@/app/components/icons/UiIcons'

const ACTION_CHANNELS = ['Whats', 'Ligação', 'Email', 'Presencial', 'DM', 'Outro']

const LOST_REASON_OTHER = 'Outro'

const LOST_REASONS = [
  'Sem resposta após tentativas',
  'Sem interesse',
  'Preço',
  'Fechou com concorrente',
  'Contato inválido',
  'Fora do perfil',
  LOST_REASON_OTHER,
]

type LostDealModalProps = {
  isOpen: boolean
  dealId: string
  dealName?: string
  onClose: () => void
  onSuccess: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  borderRadius: 6,
  border: '1px solid #2a2a2a',
  background: '#0f0f0f',
  color: 'white',
  fontSize: 12,
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  display: 'block',
  marginBottom: 8,
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 16,
}

export function LostDealModal({
  isOpen,
  dealId,
  dealName,
  onClose,
  onSuccess,
}: LostDealModalProps) {
  const [actionChannel, setActionChannel] = useState('')
  const [lostReason, setLostReason] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLostWithOther = lostReason === LOST_REASON_OTHER
  const normalizedNote = note.trim()
  const finalLostReason = isLostWithOther ? normalizedNote : lostReason
  const isValid = !!actionChannel && !!lostReason && (!isLostWithOther || !!normalizedNote)

  const handleSave = async () => {
    if (!isValid) return

    try {
      setSaving(true)
      setError(null)

      await closeCycleLost({
        cycle_id: dealId,
        lost_reason: finalLostReason,
        note: isLostWithOther ? null : (normalizedNote || null),
        action_channel: actionChannel || null,
      })

      setActionChannel('')
      setLostReason('')
      setNote('')

      onSuccess()
      onClose()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erro ao salvar'
      setError(message)
      console.error('Erro:', e)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
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
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#111',
          border: '1px solid #333',
          borderRadius: 12,
          padding: 24,
          width: '90%',
          maxWidth: 480,
          color: 'white',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconCircleX size={20} color="#f87171" />
          Marcar Deal como Perdido
        </div>

        {dealName && (
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
              marginBottom: 16,
              padding: '8px 12px',
              background: '#0f0f0f',
              borderRadius: 6,
              border: '1px solid #222',
            }}
          >
            <strong>Deal:</strong> {dealName}
          </div>
        )}

        {error && (
          <div
            style={{
              fontSize: 12,
              background: '#7f1d1d',
              color: '#fecaca',
              padding: 10,
              borderRadius: 6,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <div style={sectionStyle}>
          <label style={labelStyle}>Canal de Ação *</label>
          <select
            value={actionChannel}
            onChange={(e) => setActionChannel(e.target.value)}
            disabled={saving}
            style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
          >
            <option value="">— Selecione —</option>
            {ACTION_CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                {ch}
              </option>
            ))}
          </select>
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Motivo da Perda *</label>
          <select
            value={lostReason}
            onChange={(e) => {
              setLostReason(e.target.value)
              if (e.target.value !== LOST_REASON_OTHER) setNote('')
            }}
            disabled={saving}
            style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
          >
            <option value="">— Selecione —</option>
            {LOST_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </div>

        {isLostWithOther && (
          <div style={sectionStyle}>
            <label style={labelStyle}>Qual foi o motivo da perda? *</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
              placeholder="Descreva o motivo específico da perda…"
              style={{
                ...inputStyle,
                minHeight: 70,
                resize: 'vertical',
                opacity: saving ? 0.7 : 1,
              }}
            />
          </div>
        )}

        {!isLostWithOther && (
          <div style={sectionStyle}>
            <label style={labelStyle}>Observação (opcional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
              placeholder="Contexto adicional, observações livres…"
              style={{
                ...inputStyle,
                minHeight: 70,
                resize: 'vertical',
                opacity: saving ? 0.7 : 1,
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 6,
              border: 'none',
              background: isValid && !saving ? '#ef4444' : '#1f2937',
              color: 'white',
              cursor: isValid && !saving ? 'pointer' : 'not-allowed',
              fontWeight: 900,
              fontSize: 12,
              opacity: isValid && !saving ? 1 : 0.5,
            }}
          >
            {saving ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <IconLoader size={14} /> Salvando...
              </span>
            ) : (
              'Confirmar Perda'
            )}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 900,
              fontSize: 12,
              opacity: saving ? 0.7 : 1,
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}