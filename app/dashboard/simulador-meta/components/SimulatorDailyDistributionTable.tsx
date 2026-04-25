'use client'

import React, { useMemo, useState } from 'react'
import type {
  CalendarDistributionRow,
  DailyGoalDistribution,
  DistributionConfidence,
  OperationalFocusType,
} from '@/app/types/distribution'

const TABLE_UI = {
  surface: '#0d0f14',
  surfaceSoft: '#10131a',
  surfaceElevated: '#121621',
  borderSoft: 'rgba(148, 163, 184, 0.10)',
  borderMuted: 'rgba(148, 163, 184, 0.07)',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textSubtle: '#64748b',
  blue: '#60a5fa',
  green: '#86efac',
  amber: '#fbbf24',
  red: '#fca5a5',
  purple: '#c4b5fd',
} as const

const FOCUS_COLORS: Record<OperationalFocusType, string> = {
  prospeccao: TABLE_UI.blue,
  followup: TABLE_UI.amber,
  negociacao: TABLE_UI.purple,
  fechamento: TABLE_UI.green,
  neutro: TABLE_UI.textSubtle,
}

const CONFIDENCE_COLORS: Record<DistributionConfidence, string> = {
  alta: TABLE_UI.green,
  moderada: TABLE_UI.amber,
  baixa: TABLE_UI.red,
  insuficiente: TABLE_UI.textSubtle,
}

const CONFIDENCE_LABELS: Record<DistributionConfidence, string> = {
  alta: 'Alta',
  moderada: 'Moderada',
  baixa: 'Baixa',
  insuficiente: '—',
}

function formatDate(d: string): string {
  const parts = d.split('-')
  if (parts.length < 3) return d
  return `${parts[2]}/${parts[1]}`
}

function formatWeight(weight: number) {
  return `${((Number(weight) || 0) * 100).toFixed(1)}%`
}

function FocusBadge({ row }: { row: CalendarDistributionRow }) {
  const color = FOCUS_COLORS[row.focus_type]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: `${color}12`,
        border: `1px solid ${color}26`,
        borderRadius: 999,
        padding: '5px 9px',
        fontSize: 11.5,
        color,
        fontWeight: 850,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
        }}
      />
      {row.focus_label}
    </span>
  )
}

function RowDetail({ row }: { row: CalendarDistributionRow }) {
  return (
    <tr>
      <td
        colSpan={7}
        style={{
          padding: '0 12px 12px',
          background: 'rgba(9, 11, 15, 0.52)',
          borderBottom: `1px solid ${TABLE_UI.borderMuted}`,
        }}
      >
        <div
          style={{
            border: `1px solid ${TABLE_UI.borderMuted}`,
            background: 'rgba(15, 18, 26, 0.72)',
            borderRadius: 12,
            padding: '11px 12px',
            color: TABLE_UI.textMuted,
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: TABLE_UI.textPrimary }}>Motivo:</strong> {row.reason}
          {' · '}
          <strong style={{ color: TABLE_UI.textPrimary }}>Peso relativo:</strong> {formatWeight(row.weight)}
        </div>
      </td>
    </tr>
  )
}

interface SimulatorDailyDistributionTableProps {
  distribution: DailyGoalDistribution
  onlyWorkingDays?: boolean
}

export default function SimulatorDailyDistributionTable({
  distribution,
  onlyWorkingDays = true,
}: SimulatorDailyDistributionTableProps) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  const rows = useMemo(() => {
    return onlyWorkingDays
      ? distribution.rows.filter((row) => row.is_working_day)
      : distribution.rows
  }, [distribution.rows, onlyWorkingDays])

  function toggleExpand(date: string) {
    setExpandedDate((prev) => (prev === date ? null : date))
  }

  if (rows.length === 0) {
    return (
      <div
        style={{
          border: `1px solid ${TABLE_UI.borderMuted}`,
          background: 'rgba(9, 11, 15, 0.46)',
          borderRadius: 16,
          padding: 22,
          textAlign: 'center',
          color: TABLE_UI.textMuted,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        Nenhum dia útil encontrado no período configurado.
      </div>
    )
  }

  return (
    <div
      style={{
        border: `1px solid ${TABLE_UI.borderSoft}`,
        background: `linear-gradient(135deg, ${TABLE_UI.surfaceElevated} 0%, ${TABLE_UI.surfaceSoft} 45%, ${TABLE_UI.surface} 100%)`,
        borderRadius: 20,
        padding: 16,
        boxShadow: '0 14px 34px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.035)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              color: TABLE_UI.textPrimary,
              fontSize: 15,
              fontWeight: 950,
              letterSpacing: -0.2,
              lineHeight: 1.2,
            }}
          >
            Calendário de execução diária
          </div>

          <div
            style={{
              marginTop: 5,
              color: TABLE_UI.textMuted,
              fontSize: 12.5,
              lineHeight: 1.45,
              maxWidth: 760,
            }}
          >
            Cada linha mostra a carga recomendada para o dia, o foco operacional e a confiança da distribuição.
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${TABLE_UI.borderMuted}`,
            background: 'rgba(9, 11, 15, 0.46)',
            borderRadius: 999,
            padding: '7px 10px',
            color: TABLE_UI.textSubtle,
            fontSize: 11.5,
            fontWeight: 800,
            whiteSpace: 'nowrap',
          }}
        >
          {rows.length} dia{rows.length !== 1 ? 's' : ''} exibido{rows.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div
        style={{
          overflowX: 'auto',
          border: `1px solid ${TABLE_UI.borderMuted}`,
          borderRadius: 16,
          background: 'rgba(9, 11, 15, 0.38)',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
            fontSize: 13,
            minWidth: 760,
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>Data</th>
              <th style={thStyle}>Dia</th>
              <th style={thStyle}>Foco</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Leads</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Ganhos</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Peso</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Confiança</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const isExpanded = expandedDate === row.date
              const confidenceColor = CONFIDENCE_COLORS[row.confidence]

              return (
                <React.Fragment key={row.date}>
                  <tr
                    onClick={() => toggleExpand(row.date)}
                    style={{
                      cursor: 'pointer',
                      background: isExpanded ? 'rgba(96, 165, 250, 0.06)' : 'transparent',
                    }}
                  >
                    <td style={tdStyle}>
                      <span
                        style={{
                          color: TABLE_UI.textPrimary,
                          fontWeight: 850,
                        }}
                      >
                        {formatDate(row.date)}
                      </span>
                    </td>

                    <td style={tdStyle}>
                      <span
                        style={{
                          color: TABLE_UI.textMuted,
                          fontWeight: 750,
                        }}
                      >
                        {row.weekday_short}
                      </span>
                    </td>

                    <td style={tdStyle}>
                      <FocusBadge row={row} />
                    </td>

                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        color: TABLE_UI.textPrimary,
                        fontWeight: 900,
                        fontSize: 14,
                      }}
                    >
                      {row.leads_goal}
                    </td>

                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        color: TABLE_UI.green,
                        fontWeight: 900,
                        fontSize: 14,
                      }}
                    >
                      {row.wins_goal}
                    </td>

                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        color: TABLE_UI.textSubtle,
                        fontSize: 12.5,
                        fontWeight: 750,
                      }}
                    >
                      {formatWeight(row.weight)}
                    </td>

                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 7,
                          color: confidenceColor,
                          fontSize: 11.5,
                          fontWeight: 850,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 999,
                            background: confidenceColor,
                            boxShadow: `0 0 0 4px ${confidenceColor}18`,
                          }}
                        />
                        {CONFIDENCE_LABELS[row.confidence]}
                      </span>
                    </td>
                  </tr>

                  {isExpanded ? <RowDetail row={row} /> : null}
                </React.Fragment>
              )
            })}
          </tbody>

          <tfoot>
            <tr>
              <td
                colSpan={3}
                style={{
                  ...tdStyle,
                  borderTop: `1px solid ${TABLE_UI.borderSoft}`,
                  color: TABLE_UI.textMuted,
                  fontSize: 12,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.045em',
                }}
              >
                Total
              </td>

              <td
                style={{
                  ...tdStyle,
                  borderTop: `1px solid ${TABLE_UI.borderSoft}`,
                  textAlign: 'right',
                  color: TABLE_UI.textPrimary,
                  fontWeight: 950,
                }}
              >
                {distribution.summary.total_leads}
              </td>

              <td
                style={{
                  ...tdStyle,
                  borderTop: `1px solid ${TABLE_UI.borderSoft}`,
                  textAlign: 'right',
                  color: TABLE_UI.green,
                  fontWeight: 950,
                }}
              >
                {distribution.summary.total_wins}
              </td>

              <td
                colSpan={2}
                style={{
                  ...tdStyle,
                  borderTop: `1px solid ${TABLE_UI.borderSoft}`,
                  textAlign: 'right',
                  color: TABLE_UI.textSubtle,
                  fontSize: 12,
                  fontWeight: 750,
                }}
              >
                {distribution.summary.total_working_days} dias úteis
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div
        style={{
          marginTop: 10,
          color: TABLE_UI.textSubtle,
          fontSize: 12,
          lineHeight: 1.45,
          textAlign: 'right',
        }}
      >
        Clique em uma linha para ver o motivo da distribuição.
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '11px 12px',
  color: TABLE_UI.textSubtle,
  fontWeight: 900,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.055em',
  borderBottom: `1px solid ${TABLE_UI.borderSoft}`,
  background: 'rgba(15, 18, 26, 0.68)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '11px 12px',
  fontSize: 13,
  borderBottom: `1px solid ${TABLE_UI.borderMuted}`,
  verticalAlign: 'middle',
}
