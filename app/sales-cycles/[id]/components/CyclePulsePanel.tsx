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
  blueSoft: '#93c5fd',
  danger: '#fca5a5',
} as const

const severityText: Record<SalesPulseSeverity, string> = {
  positive: '#86efac',
  neutral: DS.blueSoft,
  warning: '#fcd34d',
  danger: DS.danger,
  dead: '#d4d4d8',
}

function supportsSalesPulse(status: SalesCycle['status']) {
  return status === 'contato' || status === 'respondeu' || status === 'negociacao'
}

function formatNextActionDate(value: string | null) {
  if (!value) return 'Sem data'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
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

function MetricPill({
  label,
  value,
  danger,
}: {
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div
      style={{
        border: `1px solid ${DS.borderSubtle}`,
        background: DS.surfaceBg,
        borderRadius: 10,
        padding: '8px 10px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: DS.textMuted,
          fontSize: 9,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: danger ? DS.danger : DS.textPrimary,
          fontSize: 12,
          fontWeight: 800,
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

export default function CyclePulsePanel({ cycle, lead }: CyclePulsePanelProps) {
  if (!supportsSalesPulse(cycle.status)) return null

  const pulse = calculateCyclePulse(buildPulseRow(cycle, lead))
  const color = severityText[pulse.severity]

  return (
    <div
      style={{
        background: DS.panelBg,
        border: `1px solid ${DS.border}`,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px minmax(0, 1fr) 280px',
          gap: 14,
          alignItems: 'start',
        }}
      >
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

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: `1px solid ${DS.border}`,
              background: DS.surfaceBg,
              color,
              borderRadius: 999,
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 900,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            {pulse.stateLabel} · {pulse.score}/100
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 10,
            minWidth: 0,
          }}
        >
          <div>
            <div
              style={{
                color: DS.textMuted,
                fontSize: 9,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 5,
              }}
            >
              Sinal principal
            </div>
            <div
              style={{
                color: DS.textPrimary,
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {pulse.mainReason}
            </div>
          </div>

          <div>
            <div
              style={{
                color: DS.textMuted,
                fontSize: 9,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 5,
              }}
            >
              Orientação
            </div>
            <div
              style={{
                color: DS.textPrimary,
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {pulse.recommendedAction}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <MetricPill
            label="Tempo na etapa"
            value={
              pulse.daysInStage == null
                ? '—'
                : `${pulse.daysInStage}d`
            }
          />
          <MetricPill
            label="Sem atualização"
            value={
              pulse.daysSinceUpdate == null
                ? '—'
                : `${pulse.daysSinceUpdate}d`
            }
          />
        </div>
      </div>

      {pulse.signals.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${DS.borderSubtle}`,
          }}
        >
          {pulse.signals.slice(0, 4).map((signal) => (
            <span
              key={`${signal.label}-${signal.detail}`}
              title={signal.detail}
              style={{
                border: `1px solid ${DS.borderSubtle}`,
                background: DS.surfaceBg,
                color: severityText[signal.severity],
                borderRadius: 999,
                padding: '4px 8px',
                fontSize: 10,
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {signal.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}