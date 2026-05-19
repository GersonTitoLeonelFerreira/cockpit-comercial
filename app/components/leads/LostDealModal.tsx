'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'

import { IconCircleX, IconLoader } from '@/app/components/icons/UiIcons'
import { closeCycleLost } from '@/app/lib/services/sales-cycles'

const ACTION_CHANNELS = ['Whats', 'Ligação', 'Email', 'Presencial', 'DM', 'Outro'] as const

const LOST_REASON_OTHER = 'Outro'

const LOST_REASONS = [
  'Sem resposta após tentativas',
  'Sem interesse',
  'Preço',
  'Fechou com concorrente',
  'Contato inválido',
  'Fora do perfil',
  LOST_REASON_OTHER,
] as const

type LostDealModalProps = {
  isOpen: boolean
  dealId: string
  dealName?: string
  onClose: () => void
  onSuccess: () => void
}

const DS = {
  overlay: 'rgba(0,0,0,0.72)',
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
  red: '#ef4444',
  redSoft: '#fca5a5',
  redBg: 'rgba(239,68,68,0.10)',
  redBorder: 'rgba(239,68,68,0.34)',
  amberSoft: '#fcd34d',
  amberBg: 'rgba(245,158,11,0.12)',
  amberBorder: 'rgba(245,158,11,0.30)',
  radius: 8,
  radiusContainer: 14,
} as const

const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: 42,
  padding: '10px 12px',
  borderRadius: DS.radius,
  border: `1px solid ${DS.border}`,
  background: DS.inputBg,
  color: DS.textPrimary,
  fontSize: 12,
  outline: 'none',
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 7,
  color: DS.textSecondary,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.02em',
}

const sectionCardStyle: CSSProperties = {
  border: `1px solid ${DS.border}`,
  background: DS.panelBg,
  borderRadius: DS.radiusContainer,
  padding: 14,
}

const sectionTitleStyle: CSSProperties = {
  marginBottom: 12,
  color: DS.textPrimary,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
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

  const isValid =
    !!actionChannel &&
    !!lostReason &&
    (!isLostWithOther || normalizedNote.length >= 3)

  const resetFormAfterSuccess = () => {
    setActionChannel('')
    setLostReason('')
    setNote('')
    setError(null)
  }

  const handleClose = () => {
    if (saving) return
    onClose()
  }

  const handleSave = async () => {
    if (!isValid) {
      setError('Informe canal, motivo da perda e os detalhes obrigatórios.')
      return
    }

    try {
      setSaving(true)
      setError(null)

      await closeCycleLost({
        cycle_id: dealId,
        lost_reason: finalLostReason,
        note: isLostWithOther ? null : normalizedNote || null,
        action_channel: actionChannel || null,
      })

      resetFormAfterSuccess()
      onSuccess()
      onClose()
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, 'Erro ao confirmar perda'))
      console.error('Erro ao confirmar perda:', saveError)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        background: DS.overlay,
        backdropFilter: 'blur(8px)',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: 'min(620px, 96vw)',
          maxHeight: '92vh',
          overflow: 'hidden',
          border: `1px solid ${DS.border}`,
          borderRadius: 18,
          background: DS.surfaceBg,
          color: DS.textPrimary,
          boxShadow: '0 28px 80px rgba(0,0,0,0.62)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: '18px 20px',
            borderBottom: `1px solid ${DS.border}`,
            background: 'linear-gradient(135deg, rgba(239,68,68,0.13), rgba(17,19,24,0.98))',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: `1px solid ${DS.redBorder}`,
                background: DS.redBg,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <IconCircleX size={18} color={DS.redSoft} />
            </div>

            <div>
              <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 4 }}>
                Confirmar venda perdida
              </div>
              <div style={{ color: DS.textSecondary, fontSize: 12, lineHeight: 1.45 }}>
                Registre o motivo real da perda para manter histórico, relatórios e análise comercial confiáveis.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: `1px solid ${DS.border}`,
              background: DS.panelBg,
              color: DS.textSecondary,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 900,
              opacity: saving ? 0.6 : 1,
            }}
            aria-label="Fechar modal"
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: 20,
            overflowY: 'auto',
            display: 'grid',
            gap: 14,
          }}
        >
          {dealName && (
            <div
              style={{
                border: `1px solid ${DS.borderSubtle}`,
                background: DS.cardBg,
                borderRadius: DS.radiusContainer,
                padding: '10px 12px',
              }}
            >
              <div
                style={{
                  color: DS.textLabel,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 5,
                }}
              >
                Oportunidade
              </div>
              <div style={{ color: DS.textPrimary, fontSize: 13, fontWeight: 800 }}>
                {dealName}
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                border: `1px solid ${DS.redBorder}`,
                background: DS.redBg,
                color: DS.redSoft,
                borderRadius: DS.radiusContainer,
                padding: 12,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              border: `1px solid ${DS.amberBorder}`,
              background: DS.amberBg,
              borderRadius: DS.radiusContainer,
              padding: 12,
              color: DS.amberSoft,
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            Atenção: ao confirmar perda, o ciclo sai da operação ativa e entra no histórico de perdas.
            Use um motivo objetivo para não contaminar os relatórios.
          </div>

          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>Classificação da perda</div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>Canal da ação *</label>
                <select
                  value={actionChannel}
                  onChange={(event) => setActionChannel(event.target.value)}
                  disabled={saving}
                  style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
                >
                  <option value="">Selecione o canal</option>
                  {ACTION_CHANNELS.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Motivo da perda *</label>
                <select
                  value={lostReason}
                  onChange={(event) => {
                    setLostReason(event.target.value)

                    if (event.target.value !== LOST_REASON_OTHER) {
                      setNote('')
                    }
                  }}
                  disabled={saving}
                  style={{ ...inputStyle, opacity: saving ? 0.7 : 1 }}
                >
                  <option value="">Selecione o motivo</option>
                  {LOST_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>
              {isLostWithOther ? 'Motivo específico' : 'Observação comercial'}
            </div>

            <label style={labelStyle}>
              {isLostWithOther
                ? 'Descreva o motivo da perda *'
                : 'Contexto adicional'}
            </label>

            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={saving}
              placeholder={
                isLostWithOther
                  ? 'Ex.: cliente mudou de cidade, não tem documentação, decidiu esperar outro momento...'
                  : 'Ex.: cliente achou caro, pediu contato futuro, disse que vai conversar com familiar...'
              }
              style={{
                ...inputStyle,
                minHeight: 96,
                resize: 'vertical',
                opacity: saving ? 0.7 : 1,
              }}
            />

            {isLostWithOther && (
              <div style={{ marginTop: 8, color: DS.textMuted, fontSize: 11, lineHeight: 1.45 }}>
                Quando selecionar “Outro”, o texto acima vira o motivo oficial da perda.
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '14px 20px',
            borderTop: `1px solid ${DS.border}`,
            background: DS.surfaceBg,
            display: 'flex',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            style={{
              flex: 1,
              minHeight: 42,
              borderRadius: DS.radius,
              border: `1px solid ${DS.border}`,
              background: DS.panelBg,
              color: DS.textSecondary,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 800,
              fontSize: 12,
              opacity: saving ? 0.6 : 1,
            }}
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!isValid || saving}
            style={{
              flex: 1.4,
              minHeight: 42,
              borderRadius: DS.radius,
              border: `1px solid ${DS.redBorder}`,
              background: isValid && !saving ? '#b91c1c' : DS.panelBg,
              color: isValid && !saving ? '#ffffff' : DS.textMuted,
              cursor: isValid && !saving ? 'pointer' : 'not-allowed',
              fontWeight: 900,
              fontSize: 12,
              opacity: isValid && !saving ? 1 : 0.62,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            }}
          >
            {saving ? (
              <>
                <IconLoader size={14} />
                Salvando perda...
              </>
            ) : (
              'Confirmar venda perdida'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}