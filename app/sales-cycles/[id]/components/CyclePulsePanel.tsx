import { calculateCyclePulse } from '@/app/lib/services/sales-pulse'
import type { SalesPulseCycleRow, SalesPulseSeverity } from '@/app/types/sales-pulse'
import type { SalesCycle } from '@/app/types/sales_cycles'

type CyclePulseLead = {
  id?: string | null
  name?: string | null
  phone?: string | null
  email?: string | null
}

type CyclePulsePanelProps = {
  cycle: SalesCycle
  lead: CyclePulseLead | null
  variant?: 'wide' | 'compact'
}

const DS = {
  panelBg: '#0d0f14',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
} as const

const severityClass: Record<SalesPulseSeverity, { border: string; background: string; color: string }> = {
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

function supportsSalesPulse(status: SalesCycle['status']) {
  return status === 'contato' || status === 'respondeu' || status === 'negociacao'
}

function formatNextActionDate(value: string | null) {
  if (!value) return 'Sem data definida'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function buildPulseRow(cycle: SalesCycle, lead: CyclePulseLead | null): SalesPulseCycleRow {
  return {
    id: cycle.id,
    company_id: cycle.company_id,
    lead_id: cycle.lead_id,
    owner_user_id: cycle.owner_user_id,
    status: cycle.status,
    previous_status: cycle.previous_status,
    stage_entered_at: cycle.stage_entered_at,
    next_action: cycle.next_action,
    next_action_date: cycle.next_action_date,
    current_group_id: cycle.current_group_id,
    created_at: cycle.created_at,
    updated_at: cycle.updated_at,
    closed_at: cycle.closed_at,
    won_at: cycle.won_at,
    lost_at: cycle.lost_at,
    lost_reason: cycle.lost_reason,
    leads: {
      id: lead?.id ?? cycle.lead_id,
      name: lead?.name ?? null,
      phone: lead?.phone ?? null,
      email: lead?.email ?? null,
    },
  }
}

function SmallMetric({ label, value, detail, danger }: { label: string; value: string; detail?: string; danger?: boolean }) {
  return (
    <div style={{ background: DS.surfaceBg, border: `1px solid ${DS.borderSubtle}`, borderRadius: 12, padding: 12 }}>
      <div style={{ color: DS.textMuted, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ marginTop: 7, color: danger ? '#fca5a5' : DS.textPrimary, fontSize: 13, fontWeight: 800, lineHeight: 1.35 }}>
        {value}
      </div>
      {detail && <div style={{ marginTop: 5, color: DS.textSecondary, fontSize: 11, lineHeight: 1.4 }}>{detail}</div>}
    </div>
  )
}

export default function CyclePulsePanel({ cycle, lead, variant = 'wide' }: CyclePulsePanelProps) {
  if (!supportsSalesPulse(cycle.status)) return null

  const compact = variant === 'compact'
  const pulse = calculateCyclePulse(buildPulseRow(cycle, lead))
  const styles = severityClass[pulse.severity]

  return (
    <div
      style={{
        background: DS.panelBg,
        border: `1px solid ${DS.border}`,
        borderRadius: 16,
        padding: compact ? 16 : 18,
        marginBottom: compact ? 0 : 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: DS.blue,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Pulso Comercial
          </div>
          <h2 style={{ margin: 0, fontSize: compact ? 15 : 18, lineHeight: 1.2, color: DS.textPrimary }}>
            Saúde da negociação
          </h2>
          {!compact && (
            <p style={{ margin: '8px 0 0', color: DS.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
              Leitura operacional do ciclo atual com base em etapa, tempo parado e próxima ação.
            </p>
          )}
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            alignSelf: 'flex-start',
            width: 'fit-content',
            padding: compact ? '6px 10px' : '8px 12px',
            borderRadius: 999,
            border: `1px solid ${styles.border}`,
            background: styles.background,
            color: styles.color,
            fontSize: compact ? 12 : 13,
            fontWeight: 900,
            lineHeight: 1.15,
            whiteSpace: 'nowrap',
          }}
        >
          {pulse.stateLabel} · {pulse.score}/100
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 14 }}>
        <SmallMetric
          label="Tempo na etapa"
          value={pulse.daysInStage == null ? '—' : `${pulse.daysInStage} dia${pulse.daysInStage === 1 ? '' : 's'}`}
        />
        <SmallMetric
          label="Próxima ação"
          value={pulse.isNextActionOverdue ? 'Vencida' : pulse.nextActionDate ? 'Em dia' : 'Não definida'}
          detail={formatNextActionDate(pulse.nextActionDate)}
          danger={pulse.isNextActionOverdue}
        />
        <SmallMetric
          label="Última atualização"
          value={pulse.daysSinceUpdate == null ? '—' : `${pulse.daysSinceUpdate} dia${pulse.daysSinceUpdate === 1 ? '' : 's'}`}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10, marginTop: 10 }}>
        <div style={{ background: DS.surfaceBg, border: `1px solid ${DS.borderSubtle}`, borderRadius: 12, padding: 12 }}>
          <div style={{ color: DS.textMuted, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Sinal principal
          </div>
          <div style={{ marginTop: 8, color: DS.textPrimary, fontSize: 12.5, lineHeight: 1.55 }}>
            {pulse.mainReason}
          </div>
        </div>

        <div style={{ background: DS.surfaceBg, border: `1px solid ${DS.borderSubtle}`, borderRadius: 12, padding: 12 }}>
          <div style={{ color: DS.textMuted, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Orientação
          </div>
          <div style={{ marginTop: 8, color: DS.textPrimary, fontSize: 12.5, lineHeight: 1.55 }}>
            {pulse.recommendedAction}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ color: DS.textMuted, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Sinais detectados
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {pulse.signals.map((signal) => {
            const signalStyle = severityClass[signal.severity]

            return (
              <div
                key={`${signal.label}-${signal.detail}`}
                title={signal.detail}
                style={{
                  border: `1px solid ${signalStyle.border}`,
                  background: signalStyle.background,
                  color: signalStyle.color,
                  borderRadius: 999,
                  padding: '4px 8px',
                  fontSize: 10.5,
                  fontWeight: 800,
                  maxWidth: '100%',
                }}
              >
                {signal.label}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
