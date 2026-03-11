'use client'

import React, { useState, useMemo } from 'react'

type Status = 'novo' | 'contato' | 'respondeu' | 'negociacao' | 'ganho' | 'perdido'

const ACTION_CHANNELS = ['Whats', 'Ligação', 'Email', 'Presencial', 'DM', 'Outro']

const ACTION_RESULTS: Record<Status, string[]> = {
  novo: [],
  contato: ['Whats enviado', 'Ligação feita', 'Email enviado', 'Tentativa de contato (sem resposta)'],
  respondeu: ['Qualificar (dor/objetivo)', 'Enviar detalhes/informações', 'Agendar visita/aula', 'Pedir documentos'],
  negociacao: ['Enviar proposta', 'Negociar condições', 'Agendar fechamento', 'Revisar objeções'],
  ganho: ['Fechou plano/contrato'],
  perdido: [],
}

const NEXT_ACTIONS: Record<Status, string[]> = {
  novo: [],
  contato: ['Nova tentativa', 'Ligar novamente', 'Whats follow-up', 'Email follow-up'],
  respondeu: ['Qualificar', 'Enviar proposta', 'Agendar visita', 'Enviar contrato'],
  negociacao: ['Negociar', 'Enviar proposta final', 'Agendar fechamento', 'Revisão final'],
  ganho: [],
  perdido: [],
}

const LOST_REASONS = [
  'Preço',
  'Sem interesse',
  'Concorrente',
  'Sem resposta após tentativas',
  'Dados incorretos',
  'Fora do perfil',
  'Outro',
]

type CheckpointPayload = {
  action_channel: string
  action_result: string
  next_action: string
  next_action_date: string
  note: string
  win_reason?: string
  lost_reason?: string
}

export default function StageCheckpointModal({
  open,
  fromStatus,
  toStatus,
  onCancel,
  onConfirm,
  loading,
}: {
  open: boolean
  fromStatus: Status
  toStatus: Status
  onCancel: () => void
  onConfirm: (payload: CheckpointPayload) => void
  loading: boolean
}) {
  const [actionChannel, setActionChannel] = useState('')
  const [actionResult, setActionResult] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [note, setNote] = useState('')
  const [winReason, setWinReason] = useState('')
  const [lostReason, setLostReason] = useState('')

  const actionResultOptions = useMemo(() => ACTION_RESULTS[toStatus] || [], [toStatus])
  const nextActionOptions = useMemo(() => NEXT_ACTIONS[toStatus] || [], [toStatus])

  const isOpenStage = ['contato', 'respondeu', 'negociacao'].includes(toStatus)
  const isWon = toStatus === 'ganho'
  const isLost = toStatus === 'perdido'
  const isReopening = toStatus === 'novo'

  const requiresNextActionDate =
    actionResult === 'Tentativa de contato (sem resposta)' ||
    actionResult === 'Email enviado' ||
    (isOpenStage && nextAction)

  const isValid =
    actionChannel &&
    actionResult &&
    (!isOpenStage || nextAction) &&
    (!requiresNextActionDate || nextActionDate) &&
    (!isReopening || note.trim()) &&
    (!isWon || winReason.trim()) &&
    (!isLost || lostReason.trim())

  const handleConfirm = () => {
    if (!isValid) return

    const payload: CheckpointPayload = {
      action_channel: actionChannel,
      action_result: actionResult,
      next_action: nextAction,
      next_action_date: nextActionDate,
      note: note.trim(),
    }

    if (isWon) payload.win_reason = winReason.trim()
    if (isLost) payload.lost_reason = lostReason.trim()

    onConfirm(payload)
  }

  if (!open) return null

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
        zIndex: 10000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#111',
          border: '1px solid #333',
          borderRadius: 12,
          padding: 24,
          width: '90%',
          maxWidth: 500,
          color: 'white',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>
          Checkpoint de Transição
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 20 }}>
          {fromStatus.toUpperCase()} → {toStatus.toUpperCase()}
        </div>

        {/* ACTION CHANNEL */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
            Canal de Ação *
          </label>
          <select
            value={actionChannel}
            onChange={(e) => setActionChannel(e.target.value)}
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: '#222',
              color: 'white',
              fontSize: 12,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            <option value="">Selecione…</option>
            {ACTION_CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                {ch}
              </option>
            ))}
          </select>
        </div>

        {/* ACTION RESULT */}
        {actionResultOptions.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
              Resultado *
            </label>
            <select
              value={actionResult}
              onChange={(e) => setActionResult(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: 6,
                border: '1px solid #2a2a2a',
                background: '#222',
                color: 'white',
                fontSize: 12,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              <option value="">Selecione…</option>
              {actionResultOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* NEXT ACTION */}
        {nextActionOptions.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
              Próxima Ação {isOpenStage ? '*' : ''}
            </label>
            <select
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: 6,
                border: '1px solid #2a2a2a',
                background: '#222',
                color: 'white',
                fontSize: 12,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              <option value="">Selecione…</option>
              {nextActionOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* NEXT ACTION DATE */}
        {(requiresNextActionDate || isOpenStage) && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
              Data/Hora {requiresNextActionDate ? '*' : '(recomendado)'}
            </label>
            <input
              type="datetime-local"
              value={nextActionDate}
              onChange={(e) => setNextActionDate(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: 6,
                border: '1px solid #2a2a2a',
                background: '#222',
                color: 'white',
                fontSize: 12,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            />
          </div>
        )}

        {/* NOTE (for reopening) */}
        {isReopening && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
              Reabertura - Motivo *
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={loading}
              placeholder="Por que está reabrindo este lead?"
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
                cursor: loading ? 'not-allowed' : 'auto',
                opacity: loading ? 0.5 : 1,
              }}
            />
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
              {note.length} caracteres
            </div>
          </div>
        )}

        {/* WIN REASON */}
        {isWon && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
              Motivo Ganho *
            </label>
            <textarea
              value={winReason}
              onChange={(e) => setWinReason(e.target.value)}
              disabled={loading}
              placeholder="Ex: Fechou plano anual..."
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
                cursor: loading ? 'not-allowed' : 'auto',
                opacity: loading ? 0.5 : 1,
              }}
            />
          </div>
        )}

        {/* LOST REASON */}
        {isLost && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
              Motivo Perda *
            </label>
            <select
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: 6,
                border: '1px solid #2a2a2a',
                background: '#222',
                color: 'white',
                fontSize: 12,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              <option value="">Selecione…</option>
              {LOST_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* BUTTONS */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: 'transparent',
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 900,
              fontSize: 12,
              opacity: loading ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid || loading}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 6,
              border: 'none',
              background: isValid && !loading ? '#10b981' : '#1f2937',
              color: 'white',
              cursor: isValid && !loading ? 'pointer' : 'not-allowed',
              fontWeight: 900,
              fontSize: 12,
              opacity: isValid && !loading ? 1 : 0.5,
            }}
          >
            {loading ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}