// ---------------------------------------------------------------------------
// CycleSuggestedAction — Próximo Passo Sugerido
//
// Analisa o estado do lead e exibe a sugestão operacional de maior prioridade.
// Motor determinístico — sem IA, toda sugestão vem de regras explícitas.
// Exibe no máximo 1 sugestão (a de maior prioridade).
// ---------------------------------------------------------------------------

import {
  IconAlertTriangle,
  IconClock,
  IconClipboard,
  IconArrowRightCircle,
  IconZap,
  IconWhatsApp,
  IconPencil,
  IconArrowRight,
  IconLightbulb,
  IconTarget,
} from '@/app/components/icons/UiIcons'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CycleEvent {
  id: string
  event_type: string
  from_stage: string | null
  to_stage: string | null
  occurred_at: string
  metadata: Record<string, unknown> | null
}

interface CycleCycle {
  status?: string | null
  next_action?: string | null
  next_action_date?: string | null
}

interface Props {
  events: CycleEvent[]
  cycle: CycleCycle
  onOpenWhatsApp?: () => void
  onRegisterContact?: () => void
  onUpdateNextAction?: () => void
  onMoveStage?: () => void
}

// ---------------------------------------------------------------------------
// Internal suggestion shape
// ---------------------------------------------------------------------------

type SuggestionIcon =
  | 'alert'
  | 'clock'
  | 'clipboard'
  | 'arrowRight'
  | 'arrowRightCircle'
  | 'zap'
  | 'lightbulb'
  | 'target'

type CtaAction = 'openWhatsApp' | 'registerContact' | 'updateNextAction' | 'moveStage'

interface Suggestion {
  iconType: SuggestionIcon
  title: string
  reason: string
  detail?: string
  urgency: 'high' | 'medium' | 'low'
  cta?: CtaAction
  ctaLabel?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract checkpoint payload from event metadata (handles nested shapes) */
function getCheckpoint(ev: CycleEvent): Record<string, unknown> {
  const m = ev.metadata ?? {}
  return (
    (m.checkpoint as Record<string, unknown>) ??
    (m.metadata as Record<string, unknown>) ??
    m
  )
}

/** Convert null/undefined/'' to null; any other value becomes a string. */
function str(v: unknown): string | null {
  if (v == null || v === '') return null
  return String(v)
}

/**
 * Parse a date string to a local Date at midnight, stripping time components.
 * Works with "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm:ss..." formats.
 */
function parseLocalDate(dateStr: string): Date {
  const datePart = dateStr.split('T')[0]
  const parts = datePart.split('-')
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
}

/** Return today's date at local midnight. */
function todayMidnight(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// ---------------------------------------------------------------------------
// Suggestion engine — rules evaluated in priority order (first match wins)
// ---------------------------------------------------------------------------

function buildSuggestion(events: CycleEvent[], cycle: CycleCycle): Suggestion | null {
  const status = String(cycle.status ?? '').toLowerCase()

  // Closed cycles — no suggestion
  if (status === 'ganho' || status === 'perdido') return null

  const today = todayMidnight()

  // ── Rule 1: Overdue next action ──────────────────────────────────────────
  // Condition: next_action_date exists and is strictly before today
  if (cycle.next_action_date) {
    try {
      const actionDay = parseLocalDate(cycle.next_action_date)
      if (actionDay < today) {
        return {
          iconType: 'alert',
          title: 'Executar a próxima ação pendente',
          reason: 'Baseado na próxima ação vencida',
          detail: str(cycle.next_action) ?? undefined,
          urgency: 'high',
          cta: 'updateNextAction',
          ctaLabel: 'Atualizar próxima ação',
        }
      }
    } catch {
      // If date parsing fails, skip this rule
    }
  }

  // ── Rule 2: Next action scheduled for today ──────────────────────────────
  // Condition: next_action_date is today
  if (cycle.next_action_date) {
    try {
      const actionDay = parseLocalDate(cycle.next_action_date)
      if (actionDay.getTime() === today.getTime()) {
        return {
          iconType: 'clock',
          title: 'Executar a ação agendada para hoje',
          reason: 'Baseado na agenda de hoje',
          detail: str(cycle.next_action) ?? undefined,
          urgency: 'medium',
          cta: 'updateNextAction',
          ctaLabel: 'Atualizar próxima ação',
        }
      }
    } catch {
      // If date parsing fails, skip this rule
    }
  }

  // ── Rule 3: Unanswered objection ─────────────────────────────────────────
  // Condition: most recent event with result_detail is newer than last commercial activity
  const objectionEvent = events.find(ev => {
    const cp = getCheckpoint(ev)
    return !!str(cp.result_detail)
  })
  if (objectionEvent) {
    const objectionTime = new Date(objectionEvent.occurred_at).getTime()
    const hasNewerCommercialActivity = events.some(ev => {
      if (ev.id === objectionEvent.id) return false
      const evTime = new Date(ev.occurred_at).getTime()
      if (evTime <= objectionTime) return false
      const cp = getCheckpoint(ev)
      const hasActivityFields = !!str(cp.action_channel) || !!str(cp.action_result)
      const isQuickAction = str((ev.metadata ?? {}).source) === 'quick_action'
      return hasActivityFields || isQuickAction
    })
    if (!hasNewerCommercialActivity) {
      const cp = getCheckpoint(objectionEvent)
      return {
        iconType: 'alert',
        title: 'Responder à objeção registrada',
        reason: 'Baseado na última objeção registrada',
        detail: str(cp.result_detail) ?? undefined,
        urgency: 'medium',
        cta: 'registerContact',
        ctaLabel: 'Registrar contato',
      }
    }
  }

  // ── Rule 4: Proposal without follow-up ───────────────────────────────────
  // Condition: most recent event with note (not a loss) has no commercial activity after it
  const proposalEvent = events.find(ev => {
    const m = ev.metadata ?? {}
    const to = ev.to_stage ?? str(m.to_status)
    const isLoss = to && String(to).toLowerCase() === 'perdido'
    const cp = getCheckpoint(ev)
    return !isLoss && !!str(cp.note)
  })
  if (proposalEvent) {
    const proposalTime = new Date(proposalEvent.occurred_at).getTime()
    const hasNewerCommercialActivity = events.some(ev => {
      if (ev.id === proposalEvent.id) return false
      const evTime = new Date(ev.occurred_at).getTime()
      if (evTime <= proposalTime) return false
      const cp = getCheckpoint(ev)
      const hasActivityFields = !!str(cp.action_channel) || !!str(cp.action_result)
      const isQuickAction = str((ev.metadata ?? {}).source) === 'quick_action'
      return hasActivityFields || isQuickAction
    })
    if (!hasNewerCommercialActivity) {
      return {
        iconType: 'clipboard',
        title: 'Acompanhar proposta apresentada',
        reason: 'Baseado na proposta sem retorno',
        urgency: 'medium',
        cta: 'openWhatsApp',
        ctaLabel: 'Abrir WhatsApp',
      }
    }
  }

  // ── Rule 5: Lead stopped without next action ─────────────────────────────
  // Condition: next_action is null or empty
  if (!cycle.next_action || String(cycle.next_action).trim() === '') {
    return {
      iconType: 'zap',
      title: 'Definir próxima ação para este lead',
      reason: 'Nenhuma próxima ação definida',
      urgency: 'low',
      cta: 'updateNextAction',
      ctaLabel: 'Definir próxima ação',
    }
  }

  // ── Rule 6: Return after previous loss ───────────────────────────────────
  // Condition: lead has a prior loss in history AND current status ≠ perdido
  if (status !== 'perdido') {
    const hasPriorLoss = events.some(ev => {
      const m = ev.metadata ?? {}
      const to = ev.to_stage ?? str(m.to_status)
      return to && String(to).toLowerCase() === 'perdido'
    })
    if (hasPriorLoss) {
      return {
        iconType: 'arrowRightCircle',
        title: 'Retomar contato com base no interesse já demonstrado',
        reason: 'Lead retornou ao funil após perda anterior',
        urgency: 'low',
        cta: 'registerContact',
        ctaLabel: 'Registrar contato',
      }
    }
  }

  // ── Rule 7: Stage-based fallback ─────────────────────────────────────────
  const stageMap: Record<string, { title: string; reason: string; cta?: CtaAction; ctaLabel?: string }> = {
    novo: {
      title: 'Realizar primeira abordagem',
      reason: 'Lead ainda em fase inicial',
      cta: 'openWhatsApp',
      ctaLabel: 'Abrir WhatsApp',
    },
    contato: {
      title: 'Qualificar interesse e avançar conversa',
      reason: 'Lead em fase de contato',
      cta: 'registerContact',
      ctaLabel: 'Registrar contato',
    },
    respondeu: {
      title: 'Apresentar proposta ou agendar reunião',
      reason: 'Lead demonstrou interesse',
      cta: 'moveStage',
      ctaLabel: 'Mover etapa',
    },
    negociacao: {
      title: 'Avançar para fechamento',
      reason: 'Lead em negociação ativa',
      cta: 'moveStage',
      ctaLabel: 'Mover etapa',
    },
  }

  const stageSuggestion = stageMap[status]
  if (stageSuggestion) {
    return {
      iconType: 'target',
      title: stageSuggestion.title,
      reason: stageSuggestion.reason,
      urgency: 'low',
      cta: stageSuggestion.cta,
      ctaLabel: stageSuggestion.ctaLabel,
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

function SuggestionIconEl({ type, size }: { type: SuggestionIcon; size: number }) {
  const p = { size }
  switch (type) {
    case 'alert':           return <IconAlertTriangle {...p} />
    case 'clock':           return <IconClock {...p} />
    case 'clipboard':       return <IconClipboard {...p} />
    case 'arrowRight':      return <IconArrowRight {...p} />
    case 'arrowRightCircle':return <IconArrowRightCircle {...p} />
    case 'zap':             return <IconZap {...p} />
    case 'lightbulb':       return <IconLightbulb {...p} />
    case 'target':          return <IconTarget {...p} />
    default:                return <IconArrowRight {...p} />
  }
}

function CtaIconEl({ action, size }: { action: CtaAction; size: number }) {
  const p = { size }
  switch (action) {
    case 'openWhatsApp':    return <IconWhatsApp {...p} />
    case 'registerContact': return <IconClipboard {...p} />
    case 'updateNextAction':return <IconPencil {...p} />
    case 'moveStage':       return <IconArrowRight {...p} />
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CycleSuggestedAction({
  events,
  cycle,
  onOpenWhatsApp,
  onRegisterContact,
  onUpdateNextAction,
  onMoveStage,
}: Props) {
  if (!events) return null

  const suggestion = buildSuggestion(events, cycle)
  if (!suggestion) return null

  const isUrgent = suggestion.urgency === 'high'
  const borderColor = isUrgent ? '#f59e0b' : '#3b82f6'
  const iconColor = isUrgent ? '#f59e0b' : '#60a5fa'
  const ctaTextColor = isUrgent ? '#fbbf24' : '#60a5fa'

  const handleCta = () => {
    switch (suggestion.cta) {
      case 'openWhatsApp':    onOpenWhatsApp?.(); break
      case 'registerContact': onRegisterContact?.(); break
      case 'updateNextAction':onUpdateNextAction?.(); break
      case 'moveStage':       onMoveStage?.(); break
    }
  }

  return (
    <div
      style={{
        padding: '14px 16px',
        background: '#1e1e2e',
        border: `1px solid ${borderColor}40`,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 10,
          color: '#8b8fa2',
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        <span style={{ color: iconColor }}>
          <IconLightbulb size={12} />
        </span>
        Próximo passo sugerido
      </div>

      {/* Title row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginBottom: 6,
        }}
      >
        <span style={{ color: iconColor, flexShrink: 0, marginTop: 1 }}>
          <SuggestionIconEl type={suggestion.iconType} size={16} />
        </span>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#f1f5f9',
            lineHeight: 1.4,
          }}
        >
          {suggestion.title}
        </div>
      </div>

      {/* Reason */}
      <div
        style={{
          fontSize: 11,
          color: '#6b7280',
          marginLeft: 26,
          marginBottom: suggestion.detail || suggestion.cta ? 10 : 0,
        }}
      >
        {suggestion.reason}
      </div>

      {/* Contextual detail */}
      {suggestion.detail && (
        <div
          style={{
            fontSize: 12,
            color: '#d1d5db',
            background: '#181824',
            borderRadius: 6,
            padding: '6px 10px',
            marginLeft: 26,
            marginBottom: suggestion.cta ? 10 : 0,
            fontStyle: 'italic',
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}
        >
          {suggestion.detail}
        </div>
      )}

      {/* CTA button */}
      {suggestion.cta && suggestion.ctaLabel && (
        <button
          onClick={handleCta}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            background: `${borderColor}18`,
            border: `1px solid ${borderColor}50`,
            borderRadius: 8,
            color: ctaTextColor,
            cursor: 'pointer',
          }}
        >
          <CtaIconEl action={suggestion.cta} size={13} />
          {suggestion.ctaLabel}
        </button>
      )}
    </div>
  )
}
