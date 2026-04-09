'use client'

import React, { useState } from 'react'
import type {
  CalendarDistributionRow,
  DailyGoalDistribution,
  DistributionConfidence,
  OperationalFocusType,
} from '@/app/types/distribution'

// ==============================================================================
// Helpers & constants
// ==============================================================================

const FOCUS_COLORS: Record<OperationalFocusType, string> = {
  prospeccao: '#3b82f6',
  followup: '#f59e0b',
  negociacao: '#8b5cf6',
  fechamento: '#10b981',
  neutro: '#6b7280',
}

const CONFIDENCE_COLORS: Record<DistributionConfidence, string> = {
  alta: '#10b981',
  moderada: '#f59e0b',
  baixa: '#ef4444',
  insuficiente: '#6b7280',
}

function formatDate(d: string): string {
  // YYYY-MM-DD → DD/MM
  const parts = d.split('-')
  if (parts.length < 3) return d
  return `${parts[2]}/${parts[1]}`
}

// ==============================================================================
// Row detail modal (tooltip-like inline expansion)
// ==============================================================================

function RowDetail({ row }: { row: CalendarDistributionRow }) {
  return (
    <tr>
      <td
        colSpan={7}
        style={{
          padding: '8px 16px 12px',
          background: '#111318',
          borderBottom: '1px solid #1a1a1a',
          fontSize: 12,
          color: '#8fa3bc',
          lineHeight: 1.6,
        }}
      >
                <strong style={{ color: '#edf2f7' }}>Motivo:</strong> {row.reason}
        {' · '}
        <strong style={{ color: '#ddd' }}>Peso relativo:</strong>{' '}
        {(row.weight * 100).toFixed(1)}%
      </td>
    </tr>
  )
}

// ==============================================================================
// Main component
// ==============================================================================

interface SimulatorDailyDistributionTableProps {
  distribution: DailyGoalDistribution
  /** Se true, mostra apenas dias úteis */
  onlyWorkingDays?: boolean
}

export default function SimulatorDailyDistributionTable({
  distribution,
  onlyWorkingDays = true,
}: SimulatorDailyDistributionTableProps) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  const rows = onlyWorkingDays
    ? distribution.rows.filter((r) => r.is_working_day)
    : distribution.rows

  function toggleExpand(date: string) {
    setExpandedDate((prev) => (prev === date ? null : date))
  }

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 13, opacity: 0.5, padding: 20, textAlign: 'center' }}>
        Nenhum dia útil encontrado no período configurado.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
        <tr style={{ borderBottom: '1px solid #1a1d2e' }}>
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
            const focusColor = FOCUS_COLORS[row.focus_type]
            const confColor = CONFIDENCE_COLORS[row.confidence]
            return (
              <React.Fragment key={row.date}>
                <tr
                  onClick={() => toggleExpand(row.date)}
                  style={{
                    borderBottom: isExpanded ? 'none' : '1px solid #1a1a1a',
                    cursor: 'pointer',
                    background: isExpanded ? '#0d0f14' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded) {
                      ;(e.currentTarget as HTMLTableRowElement).style.background = '#0d0f14'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) {
                      ;(e.currentTarget as HTMLTableRowElement).style.background = 'transparent'
                    }
                  }}
                >
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 600 }}>{formatDate(row.date)}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ opacity: 0.8 }}>{row.weekday_short}</span>
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: focusColor + '18',
                        border: `1px solid ${focusColor}44`,
                        borderRadius: 6,
                        padding: '2px 8px',
                        fontSize: 11,
                        color: focusColor,
                        fontWeight: 600,
                      }}
                    >
                      {row.focus_label}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                    {row.leads_goal}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#10b981', fontWeight: 700 }}>
                    {row.wins_goal}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', opacity: 0.6, fontSize: 12 }}>
                    {(row.weight * 100).toFixed(1)}%
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span style={{ color: confColor, fontSize: 11, fontWeight: 600 }}>
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
        <tr style={{ borderTop: '2px solid #1a1d2e', background: '#090b0f' }}>
            <td colSpan={3} style={{ ...tdStyle, fontWeight: 700, opacity: 0.7, fontSize: 12 }}>
              TOTAL
            </td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>
              {distribution.summary.total_leads}
            </td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
              {distribution.summary.total_wins}
            </td>
            <td colSpan={2} style={{ ...tdStyle, textAlign: 'right', opacity: 0.5, fontSize: 11 }}>
              {distribution.summary.total_working_days} dias úteis
            </td>
          </tr>
        </tfoot>
      </table>
      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.4, textAlign: 'right' }}>
        Clique em uma linha para ver o motivo da distribuição.
      </div>
    </div>
  )
}

// ==============================================================================
// Styles
// ==============================================================================

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  color: '#4a5569',
  fontWeight: 700,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

const tdStyle: React.CSSProperties = {
  padding: '9px 12px',
  fontSize: 13,
}

const CONFIDENCE_LABELS: Record<DistributionConfidence, string> = {
  alta: 'Alta',
  moderada: 'Moderada',
  baixa: 'Baixa',
  insuficiente: '—',
}
