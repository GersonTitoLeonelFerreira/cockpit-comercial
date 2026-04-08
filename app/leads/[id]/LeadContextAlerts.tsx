// ---------------------------------------------------------------------------
// LeadContextAlerts — alertas contextuais determinísticos do lead
// Exibe chips de alerta baseados no histórico salvo, sem IA, sem texto inventado.
// Server Component — sem 'use client'.
// ---------------------------------------------------------------------------

import { classifyEvent } from '@/app/config/eventClassification'

interface LeadEvent {
  id: string
  event_type: string
  from_stage: string | null
  to_stage: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

interface LeadSummary {
  status: string | null
  next_action: string | null
  next_contact_at: string | null
  created_at: string
}

interface Props {
  events: LeadEvent[]
  lead: LeadSummary
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = ['ganho', 'perdido']

function isTerminal(status: string | null | undefined): boolean {
  if (!status) return false
  return TERMINAL_STATUSES.includes(status.toLowerCase())
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

function daysDiff(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (isNaN(d.getTime())) return false
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function isPast(iso: string | null | undefined): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (isNaN(d.getTime())) return false
  return d < new Date()
}

function isFuture(iso: string | null | undefined): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (isNaN(d.getTime())) return false
  return d > new Date()
}

/** Extrai o objeto de checkpoint compatível com eventos antigos e novos */
function getCheckpoint(ev: LeadEvent): Record<string, any> {
  const m = ev.metadata ?? {}
  return (m.checkpoint as Record<string, any>) ??
    (m.metadata as Record<string, any>) ??
    m
}

function str(v: unknown): string | null {
  if (v == null || v === '') return null
  return String(v)
}

// ---------------------------------------------------------------------------
// Tipos de alerta
// ---------------------------------------------------------------------------

type AlertLevel = 'critico' | 'atencao' | 'informativo'

interface Alert {
  level: AlertLevel
  text: string
}

const LEVEL_COLORS: Record<AlertLevel, string> = {
  critico: '#ef4444',
  atencao: '#f59e0b',
  informativo: '#3b82f6',
}

const LEVEL_BG: Record<AlertLevel, string> = {
  critico: 'rgba(239,68,68,0.08)',
  atencao: 'rgba(245,158,11,0.08)',
  informativo: 'rgba(59,130,246,0.08)',
}

const LEVEL_BORDER: Record<AlertLevel, string> = {
  critico: 'rgba(239,68,68,0.22)',
  atencao: 'rgba(245,158,11,0.22)',
  informativo: 'rgba(59,130,246,0.22)',
}

// ---------------------------------------------------------------------------
// Lógica de geração de alertas
// ---------------------------------------------------------------------------

function buildAlerts(events: LeadEvent[], lead: LeadSummary): Alert[] {
  const alerts: Alert[] = []

  const terminal = isTerminal(lead.status)

  // ── CRÍTICO ───────────────────────────────────────────────────────────────

  // Próxima ação vencida
  if (
    lead.next_contact_at &&
    isPast(lead.next_contact_at) &&
    !isToday(lead.next_contact_at) &&
    !terminal
  ) {
    alerts.push({
      level: 'critico',
      text: `Próxima ação vencida desde ${fmtDateShort(lead.next_contact_at)}`,
    })
  }

  // Lead parado há X dias (último evento de ATIVIDADE > 7 dias)
  // Considera apenas atividades comerciais, não eventos de sistema
  if (!terminal && events.length > 0) {
    const lastActivity = events.find(ev => classifyEvent(ev) === 'activity')
    if (lastActivity) {
      const days = daysDiff(lastActivity.created_at)
      if (days !== null && days > 7) {
        alerts.push({
          level: 'critico',
          text: `Sem atividade há ${days} dia${days !== 1 ? 's' : ''}`,
        })
      }
    } else {
      // Nenhuma atividade registrada — usar o evento mais recente
      const days = daysDiff(events[0]?.created_at)
      if (days !== null && days > 7) {
        alerts.push({
          level: 'critico',
          text: `Lead parado há ${days} dia${days !== 1 ? 's' : ''}`,
        })
      }
    }
  }

  // ── ATENÇÃO ───────────────────────────────────────────────────────────────

  // Lead parado na mesma etapa há muito tempo (sem movimentação real > 14 dias)
  if (!terminal) {
    const lastStageMove = events.find(ev => classifyEvent(ev) === 'stage_move')
    const daysInStage = daysDiff(lastStageMove?.created_at ?? lead.created_at)
    if (daysInStage !== null && daysInStage > 14) {
      alerts.push({
        level: 'atencao',
        text: `Sem movimentação de etapa há ${daysInStage} dia${daysInStage !== 1 ? 's' : ''}`,
      })
    }
  }

  // Lead sem próxima ação definida
  if (!terminal && !lead.next_action) {
    alerts.push({
      level: 'atencao',
      text: 'Lead sem próxima ação definida',
    })
  }

  // Próxima ação para hoje
  if (lead.next_contact_at && isToday(lead.next_contact_at)) {
    alerts.push({
      level: 'atencao',
      text: 'Próxima ação para hoje',
    })
  }

  // Objeção registrada anteriormente — apenas quando explicitamente registrada como objeção
  const hasObjection = events.some(ev => {
    const m = ev.metadata ?? {}
    const cp = getCheckpoint(ev)
    // 1. Explicit action_id for objection
    const actionId = typeof m.action_id === 'string' ? m.action_id : ''
    if (
      actionId === 'negociacao_objecao_registrada' ||
      actionId === 'quick_objection_registered'
    ) return true
    // 2. Explicit objection field in metadata
    if (typeof m.objection === 'string' && m.objection.trim().length > 0) return true
    // 3. Checkpoint action_result explicitly identifies objection
    if (cp.action_result === 'Objeção identificada') return true
    return false
  })
  if (hasObjection) {
    alerts.push({
      level: 'atencao',
      text: 'Objeção registrada anteriormente',
    })
  }

  // Lead já foi perdido anteriormente (retornou ao funil)
  const hadLoss = events.some(ev => {
    const to = ev.to_stage ?? str((ev.metadata ?? {}).to_stage)
    return to && String(to).toLowerCase() === 'perdido'
  })
  if (hadLoss && lead.status?.toLowerCase() !== 'perdido') {
    alerts.push({
      level: 'atencao',
      text: 'Lead já foi perdido anteriormente',
    })
  }

  // ── INFORMATIVO ───────────────────────────────────────────────────────────

  // Proposta/observação registrada anteriormente (note preenchido)
  const hasNote = events.some(ev => {
    const cp = getCheckpoint(ev)
    return !!str(cp.note)
  })
  if (hasNote) {
    alerts.push({
      level: 'informativo',
      text: 'Proposta/observação registrada anteriormente',
    })
  }

  // Lead já teve ganho anterior (retornou ao funil)
  const hadWin = events.some(ev => {
    const to = ev.to_stage ?? str((ev.metadata ?? {}).to_stage)
    return to && String(to).toLowerCase() === 'ganho'
  })
  if (hadWin && lead.status?.toLowerCase() !== 'ganho') {
    alerts.push({
      level: 'informativo',
      text: 'Lead já teve ganho anterior',
    })
  }

  // Próxima ação futura agendada
  if (
    lead.next_contact_at &&
    isFuture(lead.next_contact_at) &&
    !isToday(lead.next_contact_at)
  ) {
    alerts.push({
      level: 'informativo',
      text: `Próxima ação futura agendada para ${fmtDateShort(lead.next_contact_at)}`,
    })
  }

  // Priorizar crítico > atenção > informativo e limitar a 5
  const ORDER: Record<AlertLevel, number> = { critico: 0, atencao: 1, informativo: 2 }
  alerts.sort((a, b) => ORDER[a.level] - ORDER[b.level])
  return alerts.slice(0, 5)
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function LeadContextAlerts({ events, lead }: Props) {
  if (!events) return null

  const alerts = buildAlerts(events, lead)
  if (alerts.length === 0) return null

  return (
    <div
      style={{
        marginTop: 12,
        padding: '14px 16px',
        border: '1px solid #2a2a2a',
        borderRadius: 10,
        background: '#0d1117',
      }}
    >
      <div
        style={{
          fontSize: 11,
          opacity: 0.5,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 10,
        }}
      >
        Alertas
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {alerts.map((alert, i) => (
          <div
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderRadius: 20,
              background: LEVEL_BG[alert.level],
              border: `1px solid ${LEVEL_BORDER[alert.level]}`,
              width: 'fit-content',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: LEVEL_COLORS[alert.level],
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, color: '#e5e7eb' }}>{alert.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
