'use client'

import React, { useState, useMemo } from 'react'

type Status = 'novo' | 'contato' | 'respondeu' | 'negociacao' | 'ganho' | 'perdido'

const ACTION_CHANNELS = ['Whats', 'Ligação', 'Email', 'Presencial', 'DM', 'Outro']

const LOST_REASONS = [
  'Preço',
  'Sem interesse',
  'Concorrente',
  'Sem resposta após tentativas',
  'Dados incorretos',
  'Fora do perfil',
  'Outro',
]

// ============================================================================
// Per-transition configuration matrix
// ============================================================================

type ResultDetailConfig = {
  label: string
  required: boolean
  placeholder?: string
}

type TransitionConfig = {
  results: string[]
  resultDetails: Record<string, ResultDetailConfig>
  nextActions: string[]
  requiresNextAction: boolean
}

const TRANSITION_CONFIGS: Partial<Record<Status, Partial<Record<Status, TransitionConfig>>>> = {
  novo: {
    contato: {
      results: [
        'Tentativa de contato (sem resposta)',
        'Mensagem enviada - aguardando retorno',
        'Ligação feita',
        'Email enviado',
      ],
      resultDetails: {
        'Tentativa de contato (sem resposta)': {
          label: 'Detalhe da tentativa',
          required: false,
          placeholder: 'Ex: Telefone não atende, sem resposta no Whats…',
        },
        'Mensagem enviada - aguardando retorno': {
          label: 'Assunto/resumo da mensagem',
          required: false,
          placeholder: 'Ex: Enviou apresentação do produto',
        },
      },
      nextActions: [
        'Nova tentativa de contato',
        'Ligar novamente',
        'Whats follow-up',
        'Email follow-up',
        'Aguardar retorno',
      ],
      requiresNextAction: true,
    },
    respondeu: {
      results: ['Respondeu mensagem', 'Ligou de volta', 'Confirmou interesse'],
      resultDetails: {},
      nextActions: ['Qualificar lead', 'Enviar proposta', 'Agendar reunião', 'Enviar contrato'],
      requiresNextAction: true,
    },
    negociacao: {
      results: [
        'Qualificou direto - avançou para negociação',
        'Proposta solicitada',
        'Reunião marcada',
      ],
      resultDetails: {
        'Qualificou direto - avançou para negociação': {
          label: 'Contexto da qualificação',
          required: true,
          placeholder: 'Ex: Tem dor clara, orçamento definido, decisor identificado…',
        },
      },
      nextActions: [
        'Enviar proposta',
        'Agendar reunião de negociação',
        'Enviar contrato',
        'Agendar fechamento',
      ],
      requiresNextAction: true,
    },
    perdido: {
      results: [],
      resultDetails: {},
      nextActions: [],
      requiresNextAction: false,
    },
  },
  contato: {
    respondeu: {
      results: ['Respondeu mensagem', 'Ligou de volta', 'Agendou reunião'],
      resultDetails: {},
      nextActions: ['Qualificar', 'Enviar proposta', 'Agendar visita', 'Enviar contrato'],
      requiresNextAction: true,
    },
    negociacao: {
      results: ['Qualificado', 'Proposta solicitada', 'Documentos enviados', 'Reunião agendada'],
      resultDetails: {
        Qualificado: {
          label: 'Contexto da qualificação',
          required: true,
          placeholder: 'Dor, objetivo, orçamento…',
        },
      },
      nextActions: [
        'Enviar proposta',
        'Agendar reunião de negociação',
        'Enviar contrato',
        'Agendar fechamento',
      ],
      requiresNextAction: true,
    },
    ganho: {
      results: ['Fechou contrato', 'Fechou plano/serviço'],
      resultDetails: {},
      nextActions: [],
      requiresNextAction: false,
    },
    perdido: {
      results: [],
      resultDetails: {},
      nextActions: [],
      requiresNextAction: false,
    },
  },
}

const FALLBACK_CONFIG: TransitionConfig = {
  results: ['Ação realizada', 'Qualificação feita', 'Proposta enviada', 'Outro'],
  resultDetails: {},
  nextActions: ['Follow-up', 'Ligar novamente', 'Enviar proposta', 'Agendar reunião'],
  requiresNextAction: false,
}

function getTransitionConfig(from: Status, to: Status): TransitionConfig {
  return TRANSITION_CONFIGS[from]?.[to] ?? FALLBACK_CONFIG
}

// ============================================================================
// Payload type
// ============================================================================

export type CheckpointPayload = {
  action_channel: string
  action_result: string
  result_detail?: string
  next_action: string
  next_action_date: string
  note: string
  win_reason?: string
  lost_reason?: string
}

// ============================================================================
// Inner form — mounted fresh on each open to naturally reset all fields
// ============================================================================

function CheckpointForm({
  fromStatus,
  toStatus,
  onCancel,
  onConfirm,
  loading,
}: {
  fromStatus: Status
  toStatus: Status
  onCancel: () => void
  onConfirm: (payload: CheckpointPayload) => void
  loading: boolean
}) {
  const [actionChannel, setActionChannel] = useState('')
  const [actionResult, setActionResult] = useState('')
  const [resultDetail, setResultDetail] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [note, setNote] = useState('')
  const [winReason, setWinReason] = useState('')
  const [lostReason, setLostReason] = useState('')

  const config = useMemo(() => getTransitionConfig(fromStatus, toStatus), [fromStatus, toStatus])

  const resultDetailConfig: ResultDetailConfig | null = useMemo(
    () => (actionResult ? (config.resultDetails[actionResult] ?? null) : null),
    [config, actionResult]
  )

  const isWon = toStatus === 'ganho'
  const isLost = toStatus === 'perdido'
  const isReopening = toStatus === 'novo'

  const requiresNextActionDate =
    actionResult === 'Tentativa de contato (sem resposta)' ||
    actionResult === 'Email enviado' ||
    (config.requiresNextAction && !!nextAction)

  const showNextActionDate = requiresNextActionDate || config.requiresNextAction

  const isValid =
    !!actionChannel &&
    (config.results.length === 0 || !!actionResult) &&
    (!config.requiresNextAction || !!nextAction) &&
    (!requiresNextActionDate || !!nextActionDate) &&
    (!resultDetailConfig?.required || !!resultDetail.trim()) &&
    (!isReopening || !!note.trim()) &&
    (!isWon || !!winReason.trim()) &&
    (!isLost || !!lostReason)

  const handleConfirm = () => {
    if (!isValid) return

    const payload: CheckpointPayload = {
      action_channel: actionChannel,
      action_result: actionResult,
      next_action: nextAction,
      next_action_date: nextActionDate,
      note: note.trim(),
    }

    if (resultDetail.trim()) payload.result_detail = resultDetail.trim()
    if (isWon) payload.win_reason = winReason.trim()
    if (isLost) payload.lost_reason = lostReason

    onConfirm(payload)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px',
    borderRadius: 6,
    border: '1px solid #2a2a2a',
    background: '#222',
    color: 'white',
    fontSize: 12,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.5 : 1,
  }

  const textareaStyle: React.CSSProperties = {
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
  }

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
            style={inputStyle}
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
        {config.results.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
              Resultado *
            </label>
            <select
              value={actionResult}
              onChange={(e) => {
                setActionResult(e.target.value)
                setResultDetail('')
              }}
              disabled={loading}
              style={inputStyle}
            >
              <option value="">Selecione…</option>
              {config.results.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* RESULT DETAIL — dynamic, depends on selected result */}
        {resultDetailConfig && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
              {resultDetailConfig.label}
              {resultDetailConfig.required ? ' *' : ' (opcional)'}
            </label>
            <textarea
              value={resultDetail}
              onChange={(e) => setResultDetail(e.target.value)}
              disabled={loading}
              placeholder={resultDetailConfig.placeholder ?? ''}
              style={textareaStyle}
            />
          </div>
        )}

        {/* NEXT ACTION */}
        {config.nextActions.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
              Próxima Ação {config.requiresNextAction ? '*' : '(opcional)'}
            </label>
            <select
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              disabled={loading}
              style={inputStyle}
            >
              <option value="">Selecione…</option>
              {config.nextActions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* NEXT ACTION DATE */}
        {showNextActionDate && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
              Data/Hora da Próxima Ação {requiresNextActionDate ? '*' : '(recomendado)'}
            </label>
            <input
              type="datetime-local"
              value={nextActionDate}
              onChange={(e) => setNextActionDate(e.target.value)}
              disabled={loading}
              style={inputStyle}
            />
          </div>
        )}

        {/* NOTE (reopening: required; all other transitions: optional) */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
            {isReopening ? 'Reabertura - Motivo *' : 'Observação (opcional)'}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={loading}
            placeholder={
              isReopening
                ? 'Por que está reabrindo este lead?'
                : 'Contexto adicional, observações livres…'
            }
            style={textareaStyle}
          />
          {note.length > 0 && (
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>{note.length} caracteres</div>
          )}
        </div>

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
              style={textareaStyle}
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
              style={inputStyle}
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

// ============================================================================
// Public wrapper — only mounts the form when open, so state is always fresh
// ============================================================================

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
  if (!open) return null
  return (
    <CheckpointForm
      fromStatus={fromStatus}
      toStatus={toStatus}
      onCancel={onCancel}
      onConfirm={onConfirm}
      loading={loading}
    />
  )
}