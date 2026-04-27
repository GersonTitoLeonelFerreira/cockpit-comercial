'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import {
  getActiveCompetency,
  getSalesCycleMetrics,
  calculateSimulatorResult,
  calculateTheory10020,
  getGroupConversion,
  getRevenueSummary,
  getRevenueGoal,
  upsertRevenueGoal,
  getHistoricalTicket,
} from '@/app/lib/services/simulator'
import { getCloseRateReal, percentToRate } from '@/app/lib/services/simulatorRateReal'
import type {
  ActiveCompetency,
  GroupConversionRow,
  HistoricalTicketResponse,
  RevenueDayPoint,
  RevenueSummaryResponse,
  SimulatorMetrics,
  SimulatorMode,
  SimulatorResult,
  Theory10020Result,
} from '@/app/types/simulator'
import type { CloseRateRealResponse } from '@/app/types/simulatorRateReal'
import { InfoTip } from '@/app/components/InfoTip'
import { RevenueChart } from './components/RevenueChart'
import MetaSummaryHeader, { toBRL, getRevenueStatus, statusLabel } from '@/app/components/meta/MetaSummaryCard'
import { buildCalendarDistribution } from '@/app/lib/services/calendarDistribution'
import { getWeekdayVocation } from '@/app/lib/services/weekdayVocation'
import { getMonthlySeasonalityPerformance } from '@/app/lib/services/monthlySeasonalityPerformance'
import { getPeriodRadar } from '@/app/lib/services/periodRadar'
import type { DailyGoalDistribution, DistributionInputSignals } from '@/app/types/distribution'
import SimulatorDistributionSummary from './components/SimulatorDistributionSummary'
import SimulatorDailyDistributionTable from './components/SimulatorDailyDistributionTable'

function toYMD(v: string) {
  return (v ?? '').split('T')[0].split(' ')[0]
}

function pct(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return `${Math.round(v * 100)}%`
}

function safeNumber(v: unknown) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0

  const s = String(v ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')

  const n = parseFloat(s || '0')

  return Number.isFinite(n) ? n : 0
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }

  return fallback
}

// ============================
// Calendário operacional
// ============================

// 0=Dom,1=Seg,...6=Sáb
type WorkDays = Record<number, boolean>

// Chave: YYYY-MM-DD
// Valor true = trabalha nessa data
// Valor false = não trabalha nessa data
type ExecutionDayOverrides = Record<string, boolean>

function defaultWorkDays(): WorkDays {
  return {
    0: false, // Dom
    1: true, // Seg
    2: true, // Ter
    3: true, // Qua
    4: true, // Qui
    5: true, // Sex
    6: false, // Sáb
  }
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function isExecutionDay(
  date: Date,
  workDays: WorkDays,
  overrides: ExecutionDayOverrides = {},
): boolean {
  const key = dateKey(date)

  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    return Boolean(overrides[key])
  }

  return Boolean(workDays[date.getDay()])
}

function countRemainingWorkDays(
  endDate: Date,
  workDays: WorkDays,
  overrides: ExecutionDayOverrides = {},
): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  endDate.setHours(0, 0, 0, 0)

  if (endDate < today) return 0

  let count = 0
  const cur = new Date(today)

  while (cur <= endDate) {
    if (isExecutionDay(cur, workDays, overrides)) count++
    cur.setDate(cur.getDate() + 1)
  }

  return count
}

function countWorkDaysInRange(
  start: string,
  end: string,
  workDays: WorkDays,
  overrides: ExecutionDayOverrides = {},
): number {
  const s = new Date(toYMD(start) + 'T00:00:00')
  const e = new Date(toYMD(end) + 'T00:00:00')
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)

  if (e < s) return 0

  let count = 0
  const cur = new Date(s)

  while (cur <= e) {
    if (isExecutionDay(cur, workDays, overrides)) count++
    cur.setDate(cur.getDate() + 1)
  }

  return count
}

function countWorkDaysUntilToday(
  start: string,
  end: string,
  workDays: WorkDays,
  overrides: ExecutionDayOverrides = {},
): number {
  const s = new Date(toYMD(start) + 'T00:00:00')
  const e = new Date(toYMD(end) + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)

  const last = today < e ? today : e
  if (last < s) return 0

  let count = 0
  const cur = new Date(s)

  while (cur <= last) {
    if (isExecutionDay(cur, workDays, overrides)) count++
    cur.setDate(cur.getDate() + 1)
  }

  return count
}

type ExecutionCalendarDay = {
  date: string
  day: number
  weekday: number
  weekdayLabel: string
  isDefaultExecutionDay: boolean
  isExecutionDay: boolean
  override: boolean | null
}

function buildExecutionCalendarDays(
  start: string,
  end: string,
  workDays: WorkDays,
  overrides: ExecutionDayOverrides = {},
): ExecutionCalendarDay[] {
  const s = new Date(toYMD(start) + 'T00:00:00')
  const e = new Date(toYMD(end) + 'T00:00:00')
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)

  if (e < s) return []

  const days: ExecutionCalendarDay[] = []
  const cur = new Date(s)

  while (cur <= e) {
    const key = dateKey(cur)
    const weekday = cur.getDay()
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, key)
    const defaultExecutionDay = Boolean(workDays[weekday])

    days.push({
      date: key,
      day: cur.getDate(),
      weekday,
      weekdayLabel: WEEKDAY_LABELS[weekday],
      isDefaultExecutionDay: defaultExecutionDay,
      isExecutionDay: hasOverride ? Boolean(overrides[key]) : defaultExecutionDay,
      override: hasOverride ? Boolean(overrides[key]) : null,
    })

    cur.setDate(cur.getDate() + 1)
  }

  return days
}

function getExecutionCalendarSummary(days: ExecutionCalendarDay[]) {
  const totalDefaultExecutionDays = days.filter((day) => day.isDefaultExecutionDay).length
  const totalExecutionDays = days.filter((day) => day.isExecutionDay).length
  const addedExecutionDays = days.filter(
    (day) => day.override === true && !day.isDefaultExecutionDay,
  ).length
  const removedExecutionDays = days.filter(
    (day) => day.override === false && day.isDefaultExecutionDay,
  ).length

  return {
    totalDefaultExecutionDays,
    totalExecutionDays,
    addedExecutionDays,
    removedExecutionDays,
  }
}

// ============================

function TitleWithTip({
  label,
  tipTitle,
  ariaLabel,
  children,
  width,
}: {
  label: string
  tipTitle: string
  ariaLabel?: string
  children: React.ReactNode
  width?: number
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <span>{label}</span>
      <InfoTip title={tipTitle} ariaLabel={ariaLabel ?? `Ajuda: ${label}`} width={width}>
        {children}
      </InfoTip>
    </span>
  )
}

const SIMULATOR_UI = {
  surface: '#0d0f14',
  surfaceSoft: '#10131a',
  surfaceElevated: '#121621',
  borderSoft: 'rgba(148, 163, 184, 0.10)',
  borderMuted: 'rgba(148, 163, 184, 0.07)',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textSubtle: '#64748b',
  blue: '#3b82f6',
  blueSoft: 'rgba(59, 130, 246, 0.14)',
  green: '#22c55e',
  greenSoft: 'rgba(34, 197, 94, 0.13)',
  red: '#ef4444',
  redSoft: 'rgba(239, 68, 68, 0.13)',
} as const

function getCardTone(tone?: 'neutral' | 'good' | 'bad') {
  if (tone === 'good') {
    return {
      valueColor: '#86efac',
      accentColor: SIMULATOR_UI.green,
      accentBackground: SIMULATOR_UI.greenSoft,
      borderColor: 'rgba(34, 197, 94, 0.20)',
    }
  }

  if (tone === 'bad') {
    return {
      valueColor: '#fca5a5',
      accentColor: SIMULATOR_UI.red,
      accentBackground: SIMULATOR_UI.redSoft,
      borderColor: 'rgba(239, 68, 68, 0.22)',
    }
  }

  return {
    valueColor: SIMULATOR_UI.textPrimary,
    accentColor: SIMULATOR_UI.textSubtle,
    accentBackground: 'rgba(148, 163, 184, 0.08)',
    borderColor: SIMULATOR_UI.borderSoft,
  }
}

function Card({
  title,
  value,
  subtitle,
  tone = 'neutral',
}: {
  title: React.ReactNode
  value: React.ReactNode
  subtitle?: React.ReactNode
  tone?: 'neutral' | 'good' | 'bad'
}) {
  const toneStyle = getCardTone(tone)
  const hasSemanticTone = tone === 'good' || tone === 'bad'

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        border: `1px solid ${hasSemanticTone ? toneStyle.borderColor : SIMULATOR_UI.borderMuted}`,
        background: hasSemanticTone
          ? `linear-gradient(135deg, ${toneStyle.accentBackground} 0%, ${SIMULATOR_UI.surfaceSoft} 34%, ${SIMULATOR_UI.surface} 100%)`
          : `linear-gradient(135deg, ${SIMULATOR_UI.surfaceSoft} 0%, ${SIMULATOR_UI.surface} 100%)`,
        borderRadius: 16,
        padding: '16px 18px',
        minHeight: 112,
        boxShadow: '0 10px 28px rgba(0, 0, 0, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.035)',
      }}
    >
      {hasSemanticTone ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: toneStyle.accentColor,
            opacity: 0.9,
          }}
        />
      ) : null}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          marginBottom: 10,
          fontSize: 12,
          fontWeight: 750,
          lineHeight: 1.25,
          color: SIMULATOR_UI.textMuted,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: -0.45,
          lineHeight: 1.05,
          color: toneStyle.valueColor,
        }}
      >
        {value}
      </div>

      {subtitle ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 12.5,
            lineHeight: 1.45,
            color: SIMULATOR_UI.textSubtle,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  )
}



function FunnelStageCard({
  label,
  value,
  accent,
}: {
  label: string
  value: React.ReactNode
  accent: string
}) {
  return (
    <div
      style={{
        border: `1px solid ${SIMULATOR_UI.borderMuted}`,
        background: 'rgba(9, 11, 15, 0.46)',
        borderRadius: 14,
        padding: '13px 14px',
        display: 'grid',
        gap: 10,
        minHeight: 92,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div
          style={{
            color: SIMULATOR_UI.textMuted,
            fontSize: 12,
            fontWeight: 850,
            lineHeight: 1.2,
          }}
        >
          {label}
        </div>

        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: accent,
            boxShadow: `0 0 0 4px ${accent}22`,
            flexShrink: 0,
          }}
        />
      </div>

      <div
        style={{
          color: SIMULATOR_UI.textPrimary,
          fontSize: 24,
          fontWeight: 950,
          letterSpacing: -0.5,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function GroupConversionList({ rows }: { rows: GroupConversionRow[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 1.4fr) repeat(4, minmax(90px, 0.7fr))',
          gap: 10,
          padding: '0 12px 6px',
          color: SIMULATOR_UI.textSubtle,
          fontSize: 11.5,
          fontWeight: 850,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        <div>Grupo</div>
        <div style={{ textAlign: 'right' }}>Trabalhados</div>
        <div style={{ textAlign: 'right' }}>Ganhos</div>
        <div style={{ textAlign: 'right' }}>Taxa</div>
        <div style={{ textAlign: 'right' }}>Participação</div>
      </div>

      {rows.map((row, index) => {
        const conversionRate =
          typeof row.pct_grupo === 'number'
            ? row.pct_grupo
            : row.trabalhados > 0
              ? row.ganho / row.trabalhados
              : 0

        const participationRate = typeof row.pct_participacao === 'number' ? row.pct_participacao : 0

        const conversionTone =
          conversionRate >= 0.25
            ? '#86efac'
            : conversionRate >= 0.12
              ? '#fbbf24'
              : '#fca5a5'

        return (
          <div
            key={row.group_id ?? `${row.group_name ?? 'grupo'}-${index}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(180px, 1.4fr) repeat(4, minmax(90px, 0.7fr))',
              gap: 10,
              alignItems: 'center',
              border: `1px solid ${SIMULATOR_UI.borderMuted}`,
              background: 'rgba(9, 11, 15, 0.46)',
              borderRadius: 14,
              padding: '12px',
            }}
          >
            <div
              style={{
                minWidth: 0,
              }}
            >
              <div
                style={{
                  color: SIMULATOR_UI.textPrimary,
                  fontSize: 13.5,
                  fontWeight: 850,
                  lineHeight: 1.25,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={row.group_name || 'Sem grupo'}
              >
                {row.group_name || 'Sem grupo'}
              </div>

              <div
                style={{
                  marginTop: 4,
                  color: SIMULATOR_UI.textSubtle,
                  fontSize: 12,
                  lineHeight: 1.25,
                }}
              >
                Grupo de leads do período
              </div>
            </div>

            <div
              style={{
                textAlign: 'right',
                color: SIMULATOR_UI.textSecondary,
                fontSize: 13,
                fontWeight: 850,
              }}
            >
              {row.trabalhados}
            </div>

            <div
              style={{
                textAlign: 'right',
                color: '#86efac',
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              {row.ganho}
            </div>

            <div
              style={{
                textAlign: 'right',
                color: conversionTone,
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              {pct(conversionRate)}
            </div>

            <div
              style={{
                textAlign: 'right',
                color: SIMULATOR_UI.textMuted,
                fontSize: 13,
                fontWeight: 850,
              }}
            >
              {pct(participationRate)}
            </div>
          </div>
        )
      })}
    </div>
  )
}


function RateResultPanel({
  metrics,
  result,
  targetWins,
  taxaUsadaNoCalculo,
  remainingBusinessDays,
  context = 'wins',
}: {
  metrics: SimulatorMetrics | null
  result: SimulatorResult | null
  targetWins: number
  taxaUsadaNoCalculo: number
  remainingBusinessDays: number
  context?: 'financial' | 'wins'
}) {
  const isFinancialMode = context === 'financial'

  const workedCount = metrics?.worked_count ?? 0
  const currentWins = metrics?.current_wins ?? 0
  const remainingWins = result?.remaining_wins ?? 0
  const neededWorkedCycles = result?.needed_worked_cycles ?? 0
  const remainingWorkedCycles = result?.remaining_worked_cycles ?? 0
  const dailyWorkedRemaining = result?.daily_worked_remaining ?? 0
  const progressRatio = result?.progress_pct ?? 0
  const safeProgressRatio = Math.max(0, Math.min(1, Number.isFinite(progressRatio) ? progressRatio : 0))
  const progressPercent = Math.round(safeProgressRatio * 100)
  const onTrack = Boolean(result?.on_track)

  const unitLabel = isFinancialMode ? 'vendas' : 'ganhos'
  const unitLabelCapitalized = isFinancialMode ? 'Vendas' : 'Ganhos'

  const statusLabelText = isFinancialMode
    ? onTrack
      ? 'Conversão adequada'
      : 'Conversão abaixo'
    : onTrack
      ? 'Ritmo adequado'
      : 'Ritmo exige atenção'

  const statusColor = onTrack ? '#86efac' : '#fbbf24'
  const statusBackground = onTrack ? 'rgba(34, 197, 94, 0.10)' : 'rgba(245, 158, 11, 0.10)'

  const formatNumber = (value: number) => {
    if (!Number.isFinite(value)) return '—'

    return value.toLocaleString('pt-BR', {
      maximumFractionDigits: 1,
    })
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              color: SIMULATOR_UI.textPrimary,
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: -0.2,
              lineHeight: 1.2,
            }}
          >
            {isFinancialMode ? 'Conversão conectada ao faturamento' : 'Leitura operacional da conversão'}
          </div>

          <div
            style={{
              marginTop: 5,
              color: SIMULATOR_UI.textMuted,
              fontSize: 13,
              lineHeight: 1.45,
              maxWidth: 780,
            }}
          >
            {isFinancialMode
              ? 'Traduz a meta financeira em vendas necessárias, ciclos de trabalho e ritmo diário restante.'
              : 'Mostra se o volume atual de ciclos trabalhados sustenta a meta de ganhos no período.'}
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${SIMULATOR_UI.borderMuted}`,
            background: statusBackground,
            borderRadius: 999,
            padding: '7px 11px',
            color: statusColor,
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: 'nowrap',
          }}
        >
          {statusLabelText}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
          gap: 12,
        }}
      >
        <Card
          title="Ciclos trabalhados"
          value={workedCount}
          subtitle="Base já movimentada no período"
        />

        <Card
          title={`${unitLabelCapitalized} atuais`}
          value={currentWins}
          subtitle={
            isFinancialMode
              ? `Meta derivada: ${targetWins} vendas`
              : `Meta operacional: ${targetWins} ganhos`
          }
          tone={currentWins >= targetWins ? 'good' : 'neutral'}
        />

        <Card
          title={`${unitLabelCapitalized} restantes`}
          value={remainingWins}
          subtitle={
            isFinancialMode
              ? 'Quantidade estimada para cobrir o gap financeiro'
              : 'Quantidade ainda necessária para atingir a meta'
          }
          tone={remainingWins <= 0 ? 'good' : 'bad'}
        />

        <Card
          title="Ciclos restantes"
          value={remainingWorkedCycles}
          subtitle="Volume estimado ainda necessário"
          tone={remainingWorkedCycles <= 0 ? 'good' : 'neutral'}
        />
      </div>

      <div
        style={{
          border: `1px solid ${SIMULATOR_UI.borderMuted}`,
          background: 'rgba(9, 11, 15, 0.46)',
          borderRadius: 16,
          padding: 18,
          display: 'grid',
          gap: 14,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                color: SIMULATOR_UI.textSubtle,
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 6,
              }}
            >
              Taxa usada no cálculo
            </div>

            <div
              style={{
                color: '#93c5fd',
                fontSize: 24,
                fontWeight: 950,
                letterSpacing: -0.5,
              }}
            >
              {pct(taxaUsadaNoCalculo)}
            </div>
          </div>

          <div>
            <div
              style={{
                color: SIMULATOR_UI.textSubtle,
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 6,
              }}
            >
              Ciclos necessários totais
            </div>

            <div
              style={{
                color: SIMULATOR_UI.textPrimary,
                fontSize: 24,
                fontWeight: 950,
                letterSpacing: -0.5,
              }}
            >
              {neededWorkedCycles}
            </div>
          </div>

          <div>
            <div
              style={{
                color: SIMULATOR_UI.textSubtle,
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 6,
              }}
            >
              Ritmo diário restante
            </div>

            <div
              style={{
                color: dailyWorkedRemaining > 0 ? '#fbbf24' : '#86efac',
                fontSize: 24,
                fontWeight: 950,
                letterSpacing: -0.5,
              }}
            >
              {formatNumber(dailyWorkedRemaining)}
            </div>

            <div
              style={{
                marginTop: 4,
                color: SIMULATOR_UI.textSubtle,
                fontSize: 12,
              }}
            >
              ciclos/leads por dia de execução
            </div>
          </div>

          <div>
            <div
              style={{
                color: SIMULATOR_UI.textSubtle,
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 6,
              }}
            >
              Dias de execução restantes
            </div>

            <div
              style={{
                color: SIMULATOR_UI.textPrimary,
                fontSize: 24,
                fontWeight: 950,
                letterSpacing: -0.5,
              }}
            >
              {remainingBusinessDays}
            </div>
          </div>
        </div>

        <div>
          <div
            style={{
              height: 10,
              borderRadius: 999,
              background: 'rgba(148, 163, 184, 0.10)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                borderRadius: 999,
                background: onTrack ? '#22c55e' : '#f59e0b',
                transition: 'width 240ms ease',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              marginTop: 8,
              color: SIMULATOR_UI.textSubtle,
              fontSize: 12,
              fontWeight: 750,
            }}
          >
            <span>{isFinancialMode ? 'Progresso contra vendas necessárias' : 'Progresso operacional'}</span>
            <span style={{ color: onTrack ? '#86efac' : '#fbbf24' }}>{progressPercent}%</span>
          </div>
        </div>

        <div
          style={{
            borderTop: `1px solid ${SIMULATOR_UI.borderMuted}`,
            paddingTop: 12,
            color: SIMULATOR_UI.textMuted,
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          Com taxa de conversão de{' '}
          <strong style={{ color: '#93c5fd' }}>{pct(taxaUsadaNoCalculo)}</strong>, o simulador estima que sejam necessários{' '}
          <strong style={{ color: SIMULATOR_UI.textPrimary }}>{neededWorkedCycles} ciclos trabalhados</strong> para buscar{' '}
          <strong style={{ color: '#86efac' }}>{targetWins} {unitLabel}</strong>. Ainda restam{' '}
          <strong style={{ color: remainingWorkedCycles > 0 ? '#fbbf24' : '#86efac' }}>
            {remainingWorkedCycles} ciclos
          </strong>{' '}
          para completar o esforço previsto.
        </div>
      </div>
    </div>
  )
}




function ExecutionCalendarModal({
  open,
  periodStart,
  periodEnd,
  days,
  summary,
  onClose,
  onSetOverride,
  onClearOverride,
  onResetAll,
}: {
  open: boolean
  periodStart: string
  periodEnd: string
  days: ExecutionCalendarDay[]
  summary: ReturnType<typeof getExecutionCalendarSummary>
  onClose: () => void
  onSetOverride: (date: string, value: boolean) => void
  onClearOverride: (date: string) => void
  onResetAll: () => void
}) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Calendário operacional"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(2, 6, 23, 0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(980px, 100%)',
          maxHeight: '88vh',
          overflow: 'hidden',
          border: `1px solid ${SIMULATOR_UI.borderSoft}`,
          background: 'linear-gradient(135deg, rgba(18, 22, 33, 0.98) 0%, rgba(9, 11, 15, 0.98) 100%)',
          borderRadius: 22,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: '18px 20px',
            borderBottom: `1px solid ${SIMULATOR_UI.borderMuted}`,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 14,
          }}
        >
          <div>
            <div
              style={{
                color: SIMULATOR_UI.textPrimary,
                fontSize: 18,
                fontWeight: 950,
                letterSpacing: -0.3,
                lineHeight: 1.2,
              }}
            >
              Calendário operacional
            </div>

            <div
              style={{
                marginTop: 5,
                color: SIMULATOR_UI.textMuted,
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              Ajuste quais datas contam como dias de execução entre {periodStart} e {periodEnd}.
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: `1px solid ${SIMULATOR_UI.borderMuted}`,
              background: 'rgba(9, 11, 15, 0.66)',
              color: SIMULATOR_UI.textSecondary,
              borderRadius: 12,
              height: 34,
              padding: '0 12px',
              fontSize: 12.5,
              fontWeight: 850,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Fechar
          </button>
        </div>

        <div
          style={{
            padding: 20,
            overflow: 'auto',
            maxHeight: 'calc(88vh - 76px)',
            display: 'grid',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
              gap: 10,
            }}
          >
            <Card
              title="Dias padrão"
              value={summary.totalDefaultExecutionDays}
              subtitle="Pelos dias da semana marcados"
            />
            <Card
              title="Dias adicionados"
              value={summary.addedExecutionDays}
              subtitle="Exceções incluídas manualmente"
              tone={summary.addedExecutionDays > 0 ? 'good' : 'neutral'}
            />
            <Card
              title="Dias removidos"
              value={summary.removedExecutionDays}
              subtitle="Feriados, pausas ou bloqueios"
              tone={summary.removedExecutionDays > 0 ? 'bad' : 'neutral'}
            />
            <Card
              title="Dias de execução"
              value={summary.totalExecutionDays}
              subtitle="Base final usada nos cálculos"
            />
          </div>

          <div
            style={{
              border: `1px solid ${SIMULATOR_UI.borderMuted}`,
              background: 'rgba(9, 11, 15, 0.42)',
              borderRadius: 16,
              padding: 14,
              display: 'grid',
              gap: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div
                  style={{
                    color: SIMULATOR_UI.textPrimary,
                    fontSize: 14,
                    fontWeight: 900,
                  }}
                >
                  Datas do período
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: SIMULATOR_UI.textMuted,
                    fontSize: 12.5,
                    lineHeight: 1.45,
                  }}
                >
                  Use “Trabalha” para adicionar uma data fora do padrão. Use “Não trabalha” para remover feriado, pausa ou bloqueio.
                </div>
              </div>

              <button
                type="button"
                onClick={onResetAll}
                disabled={summary.addedExecutionDays === 0 && summary.removedExecutionDays === 0}
                style={{
                  height: 34,
                  borderRadius: 10,
                  border: `1px solid ${SIMULATOR_UI.borderMuted}`,
                  background: 'rgba(15, 18, 26, 0.78)',
                  color: SIMULATOR_UI.textSecondary,
                  padding: '0 12px',
                  fontSize: 12.5,
                  fontWeight: 850,
                  cursor:
                    summary.addedExecutionDays === 0 && summary.removedExecutionDays === 0
                      ? 'not-allowed'
                      : 'pointer',
                  opacity: summary.addedExecutionDays === 0 && summary.removedExecutionDays === 0 ? 0.5 : 1,
                }}
              >
                Limpar ajustes
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(124px, 1fr))',
                gap: 10,
              }}
            >
              {days.map((day) => {
                const isAdded = day.override === true && !day.isDefaultExecutionDay
                const isRemoved = day.override === false && day.isDefaultExecutionDay
                const hasOverride = day.override !== null

                const borderColor = isAdded
                  ? 'rgba(34, 197, 94, 0.35)'
                  : isRemoved
                    ? 'rgba(239, 68, 68, 0.35)'
                    : day.isExecutionDay
                      ? 'rgba(59, 130, 246, 0.20)'
                      : SIMULATOR_UI.borderMuted

                const background = isAdded
                  ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.14) 0%, rgba(9, 11, 15, 0.52) 100%)'
                  : isRemoved
                    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.14) 0%, rgba(9, 11, 15, 0.52) 100%)'
                    : day.isExecutionDay
                      ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.10) 0%, rgba(9, 11, 15, 0.52) 100%)'
                      : 'rgba(9, 11, 15, 0.40)'

                return (
                  <div
                    key={day.date}
                    style={{
                      border: `1px solid ${borderColor}`,
                      background,
                      borderRadius: 14,
                      padding: 11,
                      display: 'grid',
                      gap: 9,
                      minHeight: 142,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            color: SIMULATOR_UI.textPrimary,
                            fontSize: 18,
                            fontWeight: 950,
                            lineHeight: 1,
                          }}
                        >
                          {String(day.day).padStart(2, '0')}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            color: SIMULATOR_UI.textMuted,
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          {day.weekdayLabel}
                        </div>
                      </div>

                      <div
                        style={{
                          border: `1px solid ${SIMULATOR_UI.borderMuted}`,
                          background: day.isExecutionDay
                            ? 'rgba(34, 197, 94, 0.10)'
                            : 'rgba(148, 163, 184, 0.08)',
                          color: day.isExecutionDay ? '#86efac' : SIMULATOR_UI.textSubtle,
                          borderRadius: 999,
                          padding: '4px 7px',
                          fontSize: 10.5,
                          fontWeight: 900,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {day.isExecutionDay ? 'Executa' : 'Pausa'}
                      </div>
                    </div>

                    <div
                      style={{
                        color: SIMULATOR_UI.textSubtle,
                        fontSize: 11.5,
                        lineHeight: 1.35,
                        minHeight: 30,
                      }}
                    >
                      {isAdded
                        ? 'Adicionado manualmente.'
                        : isRemoved
                          ? 'Removido manualmente.'
                          : day.isDefaultExecutionDay
                            ? 'Ativo pelo padrão semanal.'
                            : 'Inativo pelo padrão semanal.'}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 6,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onSetOverride(day.date, true)}
                        style={{
                          height: 28,
                          borderRadius: 9,
                          border: '1px solid rgba(34, 197, 94, 0.24)',
                          background: 'rgba(34, 197, 94, 0.10)',
                          color: '#bbf7d0',
                          fontSize: 11,
                          fontWeight: 850,
                          cursor: 'pointer',
                        }}
                      >
                        Trabalha
                      </button>

                      <button
                        type="button"
                        onClick={() => onSetOverride(day.date, false)}
                        style={{
                          height: 28,
                          borderRadius: 9,
                          border: '1px solid rgba(239, 68, 68, 0.24)',
                          background: 'rgba(239, 68, 68, 0.10)',
                          color: '#fecaca',
                          fontSize: 11,
                          fontWeight: 850,
                          cursor: 'pointer',
                        }}
                      >
                        Não trabalha
                      </button>
                    </div>

                    {hasOverride ? (
                      <button
                        type="button"
                        onClick={() => onClearOverride(day.date)}
                        style={{
                          height: 28,
                          borderRadius: 9,
                          border: `1px solid ${SIMULATOR_UI.borderMuted}`,
                          background: 'rgba(15, 18, 26, 0.78)',
                          color: SIMULATOR_UI.textMuted,
                          fontSize: 11,
                          fontWeight: 850,
                          cursor: 'pointer',
                        }}
                      >
                        Voltar ao padrão
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


function ExecutionCalendarSummaryStrip({
  summary,
  totalDays,
  hasOverrides,
  onOpenCalendar,
}: {
  summary: ReturnType<typeof getExecutionCalendarSummary>
  totalDays: number
  hasOverrides: boolean
  onOpenCalendar: () => void
}) {
  const items = [
    {
      label: 'Dias no período',
      value: totalDays,
      description: 'Total de datas entre início e fim',
    },
    {
      label: 'Dias padrão',
      value: summary.totalDefaultExecutionDays,
      description: 'Base pelos dias da semana marcados',
    },
    {
      label: 'Dias adicionados',
      value: summary.addedExecutionDays,
      description: 'Exceções incluídas manualmente',
    },
    {
      label: 'Dias removidos',
      value: summary.removedExecutionDays,
      description: 'Feriados, pausas ou dias bloqueados',
    },
    {
      label: 'Dias de execução',
      value: summary.totalExecutionDays,
      description: 'Base final usada nos cálculos',
      highlight: true,
    },
  ]

  return (
    <section
      style={{
        border: `1px solid ${SIMULATOR_UI.borderSoft}`,
        background: 'linear-gradient(135deg, rgba(18, 22, 33, 0.76) 0%, rgba(13, 15, 20, 0.96) 100%)',
        borderRadius: 18,
        padding: 16,
        display: 'grid',
        gap: 14,
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.025)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              color: SIMULATOR_UI.textPrimary,
              fontSize: 14,
              fontWeight: 900,
              lineHeight: 1.2,
            }}
          >
            Calendário operacional
          </div>

          <div
            style={{
              marginTop: 4,
              color: SIMULATOR_UI.textMuted,
              fontSize: 12.5,
              lineHeight: 1.45,
            }}
          >
            Define quais datas realmente contam como dias de execução para metas, ritmo diário e projeções.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              border: `1px solid ${SIMULATOR_UI.borderMuted}`,
              background: hasOverrides ? 'rgba(34, 197, 94, 0.10)' : 'rgba(59, 130, 246, 0.10)',
              color: hasOverrides ? '#bbf7d0' : '#bfdbfe',
              borderRadius: 999,
              padding: '7px 10px',
              fontSize: 11.5,
              fontWeight: 850,
              whiteSpace: 'nowrap',
            }}
          >
            {hasOverrides ? 'Base atual: calendário ajustado' : 'Base atual: padrão semanal'}
          </div>

          <button
            type="button"
            onClick={onOpenCalendar}
            style={{
              height: 32,
              borderRadius: 999,
              border: '1px solid rgba(59, 130, 246, 0.34)',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.22) 0%, rgba(59, 130, 246, 0.08) 100%)',
              color: '#dbeafe',
              padding: '0 12px',
              fontSize: 11.5,
              fontWeight: 900,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Abrir calendário
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
          gap: 10,
        }}
      >
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              border: `1px solid ${item.highlight ? 'rgba(59, 130, 246, 0.28)' : SIMULATOR_UI.borderMuted}`,
              background: item.highlight
                ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.16) 0%, rgba(9, 11, 15, 0.62) 100%)'
                : 'rgba(9, 11, 15, 0.46)',
              borderRadius: 14,
              padding: '12px 13px',
              minHeight: 86,
            }}
          >
            <div
              style={{
                color: SIMULATOR_UI.textMuted,
                fontSize: 11.5,
                fontWeight: 850,
                lineHeight: 1.25,
              }}
            >
              {item.label}
            </div>

            <div
              style={{
                marginTop: 8,
                color: item.highlight ? '#93c5fd' : SIMULATOR_UI.textPrimary,
                fontSize: 22,
                fontWeight: 950,
                letterSpacing: -0.35,
                lineHeight: 1,
              }}
            >
              {item.value}
            </div>

            <div
              style={{
                marginTop: 7,
                color: SIMULATOR_UI.textSubtle,
                fontSize: 11.5,
                lineHeight: 1.35,
              }}
            >
              {item.description}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}


function Section({
  title,
  description,
  children,
}: {
  title: React.ReactNode
  description?: string
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        border: `1px solid ${SIMULATOR_UI.borderSoft}`,
        background: `linear-gradient(135deg, rgba(18, 22, 33, 0.92) 0%, rgba(13, 15, 20, 0.98) 100%)`,
        borderRadius: 20,
        padding: '22px',
        boxShadow: '0 14px 36px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.035)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 850,
            color: SIMULATOR_UI.textPrimary,
            letterSpacing: -0.15,
            lineHeight: 1.25,
          }}
        >
          {title}
        </div>

        {description ? (
          <div
            style={{
              maxWidth: 780,
              fontSize: 13,
              color: SIMULATOR_UI.textMuted,
              lineHeight: 1.45,
            }}
          >
            {description}
          </div>
        ) : null}
      </div>

      <div>{children}</div>
    </section>
  )
}

function tabStyle(isActive: boolean): React.CSSProperties {
  return {
    height: 36,
    padding: '0 14px',
    background: isActive
      ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.24) 0%, rgba(59, 130, 246, 0.10) 100%)'
      : 'transparent',
    color: isActive ? '#dbeafe' : SIMULATOR_UI.textMuted,
    border: isActive
      ? '1px solid rgba(59, 130, 246, 0.34)'
      : '1px solid transparent',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: 12.5,
    fontWeight: isActive ? 850 : 700,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    transition: 'background 160ms ease, border-color 160ms ease, color 160ms ease',
    boxShadow: isActive ? '0 8px 20px rgba(59, 130, 246, 0.10)' : 'none',
  }
}

const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginBottom: 7,
        fontSize: 12,
        fontWeight: 750,
        color: SIMULATOR_UI.textMuted,
        lineHeight: 1.2,
      }}
    >
      {children}
    </div>
  )
}

function controlBaseStyle(): React.CSSProperties {
  return {
    width: '100%',
    height: 34,
    borderRadius: 10,
    border: `1px solid ${SIMULATOR_UI.borderSoft}`,
    background: 'rgba(9, 11, 15, 0.72)',
    color: SIMULATOR_UI.textPrimary,
    padding: '0 11px',
    fontSize: 12.5,
    fontWeight: 650,
    outline: 'none',
  }
}

function SmallActionButton({
  children,
  onClick,
  disabled,
  tone = 'neutral',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'neutral' | 'primary'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 34,
        borderRadius: 10,
        border:
          tone === 'primary'
            ? '1px solid rgba(59, 130, 246, 0.45)'
            : `1px solid ${SIMULATOR_UI.borderSoft}`,
        background:
          tone === 'primary'
            ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.26) 0%, rgba(59, 130, 246, 0.12) 100%)'
            : 'rgba(15, 18, 26, 0.78)',
        color: tone === 'primary' ? '#bfdbfe' : SIMULATOR_UI.textSecondary,
        padding: '0 12px',
        fontSize: 12.5,
        fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function ModePill({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 34,
        border: active
          ? '1px solid rgba(59, 130, 246, 0.48)'
          : `1px solid ${SIMULATOR_UI.borderMuted}`,
        background: active
          ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.26) 0%, rgba(59, 130, 246, 0.10) 100%)'
          : 'rgba(9, 11, 15, 0.52)',
        color: active ? '#dbeafe' : SIMULATOR_UI.textMuted,
        borderRadius: 999,
        padding: '0 12px',
        fontSize: 12.5,
        fontWeight: active ? 850 : 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function WorkdayChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 34,
        minWidth: 48,
        borderRadius: 999,
        border: active
          ? '1px solid rgba(34, 197, 94, 0.38)'
          : `1px solid ${SIMULATOR_UI.borderMuted}`,
        background: active
          ? 'rgba(34, 197, 94, 0.12)'
          : 'rgba(9, 11, 15, 0.56)',
        color: active ? '#bbf7d0' : SIMULATOR_UI.textMuted,
        fontSize: 12,
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function SimulatorTopControls({
  isAdmin,
  sellers,
  selectedSellerId,
  setSelectedSellerId,
  periodStart,
  setPeriodStart,
  periodEnd,
  setPeriodEnd,
  mode,
  setMode,
  revenueGoalContextLabel,
  revenueGoalInputText,
  setRevenueGoalInputText,
  goalLoading,
  goalSaving,
  onSaveGoal,
  onUndoGoal,
  goalError,
  goalSuccess,
  ticketMedioText,
  setTicketMedioText,
  ticketSource,
  setTicketSource,
  historicalTicket,
  historicalTicketLoading,
  rateSource,
  setRateSource,
  closeRatePercent,
  setCloseRatePercent,
  rateRealData,
  rateRealLoading,
  daysWindow,
  setDaysWindow,
  workDays,
  setWorkDays,
  autoRemainingDays,
  setAutoRemainingDays,
  remainingBusinessDays,
}: {
  isAdmin: boolean
  sellers: Array<{ id: string; label: string }>
  selectedSellerId: string | null
  setSelectedSellerId: (value: string | null) => void
  periodStart: string
  setPeriodStart: (value: string) => void
  periodEnd: string
  setPeriodEnd: (value: string) => void
  mode: SimulatorMode
  setMode: (value: SimulatorMode) => void
  revenueGoalContextLabel: string
  revenueGoalInputText: string
  setRevenueGoalInputText: (value: string) => void
  goalLoading: boolean
  goalSaving: boolean
  onSaveGoal: () => void
  onUndoGoal: () => void
  goalError: string | null
  goalSuccess: string | null
  ticketMedioText: string
  setTicketMedioText: (value: string) => void
  ticketSource: 'manual' | 'historico'
  setTicketSource: (value: 'manual' | 'historico') => void
  historicalTicket: HistoricalTicketResponse | null
  historicalTicketLoading: boolean
  rateSource: 'real' | 'planejada'
  setRateSource: (value: 'real' | 'planejada') => void
  closeRatePercent: number
  setCloseRatePercent: (value: number) => void
  rateRealData: CloseRateRealResponse | null
  rateRealLoading: boolean
  daysWindow: number
  setDaysWindow: (value: number) => void
  workDays: WorkDays
  setWorkDays: React.Dispatch<React.SetStateAction<WorkDays>>
  autoRemainingDays: boolean
  setAutoRemainingDays: (value: boolean) => void
  remainingBusinessDays: number
}) {
  const realRatePercent = rateRealData?.vendor?.close_rate
    ? Math.round(rateRealData.vendor.close_rate * 1000) / 10
    : null

    return (
      <div
        style={{
          marginBottom: 14,
          border: `1px solid ${SIMULATOR_UI.borderSoft}`,
          background: 'rgba(13, 15, 20, 0.88)',
          borderRadius: 18,
          padding: 16,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)',
        }}
      >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 14,
          paddingBottom: 12,
          borderBottom: `1px solid ${SIMULATOR_UI.borderMuted}`,
        }}
      >
        <div>
          <div
            style={{
              color: SIMULATOR_UI.textSecondary,
              fontSize: 13,
              fontWeight: 850,
              letterSpacing: -0.1,
              lineHeight: 1.2,
            }}
          >
            Cenário principal
          </div>

          <div
            style={{
              marginTop: 3,
              color: SIMULATOR_UI.textSubtle,
              fontSize: 12,
              lineHeight: 1.35,
            }}
          >
            Escopo, período, tipo de meta e valor-base da simulação.
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${SIMULATOR_UI.borderMuted}`,
            background: 'rgba(9, 11, 15, 0.52)',
            borderRadius: 999,
            padding: '6px 10px',
            color: SIMULATOR_UI.textMuted,
            fontSize: 12,
            fontWeight: 750,
            whiteSpace: 'nowrap',
          }}
        >
          {periodStart || '----'} até {periodEnd || '----'} · {remainingBusinessDays} dias de execução
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 14,
          alignItems: 'end',
        }}
      >
        <div>
          <FieldLabel>Escopo da análise</FieldLabel>

          {isAdmin ? (
            <select
              value={selectedSellerId ?? 'empresa'}
              onChange={(event) => {
                const value = event.target.value
                setSelectedSellerId(value === 'empresa' ? null : value)
              }}
              style={controlBaseStyle()}
            >
              <option value="empresa">Empresa inteira</option>
              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.label}
                </option>
              ))}
            </select>
          ) : (
            <div
              style={{
                ...controlBaseStyle(),
                display: 'flex',
                alignItems: 'center',
                color: SIMULATOR_UI.textSecondary,
              }}
            >
              Minha meta
            </div>
          )}
        </div>

        <div>
          <FieldLabel>Período</FieldLabel>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            <input
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
              style={controlBaseStyle()}
            />

            <input
              type="date"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
              style={controlBaseStyle()}
            />
          </div>
        </div>

        <div>
          <FieldLabel>Tipo de meta</FieldLabel>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <ModePill active={mode === 'faturamento'} onClick={() => setMode('faturamento')}>
              Faturamento
            </ModePill>

            <ModePill active={mode === 'recebimento'} onClick={() => setMode('recebimento')}>
              Recebimento
            </ModePill>

            <ModePill active={mode === 'ganhos'} onClick={() => setMode('ganhos')}>
              Ganhos
            </ModePill>
          </div>
        </div>

        <div>
          <FieldLabel>{revenueGoalContextLabel}</FieldLabel>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 8,
            }}
          >
            <input
              type="text"
              value={revenueGoalInputText}
              onChange={(event) => setRevenueGoalInputText(event.target.value)}
              disabled={!isAdmin || goalLoading || goalSaving}
              placeholder="Ex.: 200000"
              style={{
                ...controlBaseStyle(),
                opacity: goalLoading || goalSaving ? 0.7 : 1,
              }}
            />

{isAdmin ? (
              <>
                <SmallActionButton
                  tone="primary"
                  onClick={onSaveGoal}
                  disabled={goalLoading || goalSaving}
                >
                  {goalSaving ? 'Salvando...' : 'Salvar'}
                </SmallActionButton>

                <SmallActionButton onClick={onUndoGoal} disabled={goalSaving || goalLoading}>
                  Desfazer
                </SmallActionButton>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {goalError ? (
        <div
          style={{
            marginTop: 12,
            color: '#fecaca',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {goalError}
        </div>
      ) : null}

      {goalSuccess ? (
        <div
          style={{
            marginTop: 12,
            color: '#bbf7d0',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {goalSuccess}
        </div>
      ) : null}

<details
        style={{
          marginTop: 14,
          border: `1px solid ${SIMULATOR_UI.borderMuted}`,
          background: 'rgba(9, 11, 15, 0.38)',
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            userSelect: 'none',
            listStyle: 'none',
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  color: SIMULATOR_UI.textSecondary,
                  fontSize: 13,
                  fontWeight: 900,
                  lineHeight: 1.2,
                }}
              >
                Ajustes avançados
              </div>

              <div
                style={{
                  marginTop: 3,
                  color: SIMULATOR_UI.textSubtle,
                  fontSize: 12,
                  lineHeight: 1.35,
                }}
              >
                Ticket médio, taxa de conversão e dias trabalhados.
              </div>
            </div>

            <div
              style={{
                border: `1px solid ${SIMULATOR_UI.borderMuted}`,
                background: 'rgba(13, 15, 20, 0.72)',
                borderRadius: 999,
                padding: '6px 10px',
                color: SIMULATOR_UI.textMuted,
                fontSize: 12,
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              Configurar cenário
            </div>
          </div>
        </summary>

        <div
          style={{
            borderTop: `1px solid ${SIMULATOR_UI.borderMuted}`,
            padding: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Ticket médio</FieldLabel>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
              }}
            >
              <input
                type="text"
                value={ticketMedioText}
                onChange={(event) => {
                  setTicketMedioText(event.target.value)
                  setTicketSource('manual')
                }}
                style={controlBaseStyle()}
              />

              <SmallActionButton
                onClick={() => {
                  if (historicalTicket?.is_sufficient) {
                    setTicketMedioText(String(Math.round(historicalTicket.ticket_medio || 0)))
                    setTicketSource('historico')
                  }
                }}
                disabled={historicalTicketLoading || !historicalTicket?.is_sufficient}
              >
                Histórico
              </SmallActionButton>
            </div>

            <div
              style={{
                marginTop: 7,
                color: SIMULATOR_UI.textSubtle,
                fontSize: 12,
                lineHeight: 1.35,
              }}
            >
              Origem atual: {ticketSource === 'historico' ? 'histórico' : 'manual'}.
            </div>
          </div>

          <div>
            <FieldLabel>Taxa de conversão usada</FieldLabel>

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              <ModePill active={rateSource === 'planejada'} onClick={() => setRateSource('planejada')}>
                Planejada
              </ModePill>

              <ModePill active={rateSource === 'real'} onClick={() => setRateSource('real')}>
                Real
              </ModePill>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}
            >
              <input
                type="number"
                min={1}
                max={100}
                value={closeRatePercent}
                onChange={(event) => setCloseRatePercent(Number(event.target.value || 0))}
                style={controlBaseStyle()}
              />

              <select
                value={daysWindow}
                onChange={(event) => setDaysWindow(Number(event.target.value))}
                style={controlBaseStyle()}
              >
                <option value={30}>30 dias</option>
                <option value={60}>60 dias</option>
                <option value={90}>90 dias</option>
                <option value={180}>180 dias</option>
              </select>
            </div>

            <div
              style={{
                marginTop: 7,
                color: SIMULATOR_UI.textSubtle,
                fontSize: 12,
                lineHeight: 1.35,
              }}
            >
              {rateRealLoading
                ? 'Carregando taxa real...'
                : realRatePercent !== null
                  ? `Taxa real encontrada: ${realRatePercent}%.`
                  : 'Sem taxa real suficiente para este recorte.'}
            </div>
          </div>

          <div>
            <FieldLabel>Dias trabalhados</FieldLabel>

            <div
              style={{
                display: 'flex',
                gap: 7,
                flexWrap: 'wrap',
              }}
            >
              {Object.entries(WEEKDAY_LABELS).map(([key, label]) => {
                const day = Number(key)

                return (
                  <WorkdayChip
                    key={day}
                    label={label}
                    active={Boolean(workDays[day])}
                    onClick={() => {
                      setWorkDays((current) => ({
                        ...current,
                        [day]: !current[day],
                      }))
                    }}
                  />
                )
              })}
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 12,
                color: SIMULATOR_UI.textMuted,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={autoRemainingDays}
                onChange={(event) => setAutoRemainingDays(event.target.checked)}
              />
              Recalcular dias restantes automaticamente
            </label>
          </div>
        </div>
      </details>
    </div>
  )
}

type DecisionRevenueKpis = {
  goal: number
  totalReal: number
  gap: number
  required_per_business_day: number
  projection: number
  pacingRatio: number
  status: ReturnType<typeof getRevenueStatus>
} | null

function DecisionHero({
  mode,
  revenueMetricLabel,
  revenueKpis,
  theory10020Result,
  revenueLoading,
  revenueError,
  remainingBusinessDays,
  rateSource,
  taxaUsadaNoCalculo,
}: {
  mode: SimulatorMode
  revenueMetricLabel: string
  revenueKpis: DecisionRevenueKpis
  theory10020Result: Theory10020Result | null
  revenueLoading: boolean
  revenueError: string | null
  remainingBusinessDays: number
  rateSource: 'real' | 'planejada'
  taxaUsadaNoCalculo: number
}) {
  const isRevenueMode = mode !== 'ganhos'

  const goal = revenueKpis?.goal ?? theory10020Result?.meta_total ?? 0
  const totalReal = revenueKpis?.totalReal ?? theory10020Result?.total_real ?? 0
  const gap = revenueKpis?.gap ?? theory10020Result?.gap ?? Math.max(0, goal - totalReal)
  const projection = revenueKpis?.projection ?? 0
  const requiredPerDay = revenueKpis?.required_per_business_day ?? 0
  const progressPct = goal > 0 ? Math.min(999, Math.round((totalReal / goal) * 100)) : 0

  const revenueStatus = revenueKpis?.status ?? null

  const status: 'sem-meta' | 'meta-atingida' | ReturnType<typeof getRevenueStatus> =
    goal <= 0
      ? 'sem-meta'
      : gap <= 0
        ? 'meta-atingida'
        : revenueStatus ?? 'acelerar'

  const statusText =
    status === 'meta-atingida'
      ? 'Meta atingida'
      : status === 'sem-meta'
        ? 'Meta não definida'
        : statusLabel(status)

  const statusColor =
    status === 'meta-atingida'
      ? '#86efac'
      : status === 'sem-meta'
        ? SIMULATOR_UI.textMuted
        : status === 'no_ritmo'
          ? '#86efac'
          : status === 'atencao'
            ? '#fbbf24'
            : '#fca5a5'

  const statusBackground =
    status === 'meta-atingida'
      ? 'rgba(34, 197, 94, 0.10)'
      : status === 'sem-meta'
        ? 'rgba(148, 163, 184, 0.08)'
        : status === 'no_ritmo'
          ? 'rgba(34, 197, 94, 0.10)'
          : status === 'atencao'
            ? 'rgba(245, 158, 11, 0.10)'
            : 'rgba(239, 68, 68, 0.10)'

  const progressBarColor =
    gap <= 0
      ? '#22c55e'
      : progressPct >= 75
        ? '#22c55e'
        : progressPct >= 45
          ? '#f59e0b'
          : '#ef4444'

  const projectionTone =
    goal <= 0
      ? SIMULATOR_UI.textMuted
      : projection >= goal
        ? '#86efac'
        : '#fbbf24'

  if (!isRevenueMode) {
    return (
      <section
        style={{
          marginBottom: 16,
          border: `1px solid ${SIMULATOR_UI.borderSoft}`,
          background: 'rgba(13, 15, 20, 0.88)',
          borderRadius: 20,
          padding: 20,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)',
        }}
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <div
            style={{
              color: SIMULATOR_UI.textMuted,
              fontSize: 12,
              fontWeight: 850,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Visão de ganhos
          </div>

          <div
            style={{
              color: SIMULATOR_UI.textPrimary,
              fontSize: 24,
              fontWeight: 950,
              letterSpacing: -0.6,
              lineHeight: 1.1,
            }}
          >
            Acompanhe ciclos, ganhos e ritmo operacional.
          </div>

          <div
            style={{
              maxWidth: 760,
              color: SIMULATOR_UI.textMuted,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Neste modo, a análise principal fica concentrada nas abas de taxa, resultado e funil do período.
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      style={{
        marginBottom: 16,
        border: `1px solid ${SIMULATOR_UI.borderSoft}`,
        background:
          'linear-gradient(135deg, rgba(18, 22, 33, 0.94) 0%, rgba(13, 15, 20, 0.98) 58%, rgba(9, 11, 15, 1) 100%)',
        borderRadius: 22,
        padding: 22,
        boxShadow: '0 14px 34px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255,255,255,0.035)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          alignItems: 'stretch',
        }}
      >
        <div style={{ display: 'grid', alignContent: 'space-between', gap: 18 }}>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  color: SIMULATOR_UI.textMuted,
                  fontSize: 12,
                  fontWeight: 850,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Status da meta
              </span>

              <span
                style={{
                  border: `1px solid ${SIMULATOR_UI.borderMuted}`,
                  background: statusBackground,
                  color: statusColor,
                  borderRadius: 999,
                  padding: '5px 10px',
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {statusText}
              </span>
            </div>

            <div
              style={{
                color: SIMULATOR_UI.textPrimary,
                fontSize: 30,
                fontWeight: 950,
                letterSpacing: -0.9,
                lineHeight: 1.08,
              }}
            >
              {goal > 0 ? (
                <>Meta de {revenueMetricLabel.toLowerCase()} em andamento.</>
              ) : (
                'Defina uma meta para gerar leitura executiva.'
              )}
            </div>

            <div
              style={{
                marginTop: 10,
                maxWidth: 820,
                color: SIMULATOR_UI.textMuted,
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              {goal > 0 ? (
                <>
                  Realizado:{' '}
                  <strong style={{ color: SIMULATOR_UI.textPrimary }}>{toBRL(totalReal)}</strong>{' '}
                  de{' '}
                  <strong style={{ color: SIMULATOR_UI.textPrimary }}>{toBRL(goal)}</strong>.
                  Ainda faltam{' '}
                  <strong style={{ color: gap > 0 ? '#fca5a5' : '#86efac' }}>{toBRL(gap)}</strong>.
                </>
              ) : (
                <>
                  Sem meta cadastrada, o simulador não consegue calcular gap, projeção e esforço necessário.
                </>
              )}
            </div>
          </div>

          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  border: `1px solid ${SIMULATOR_UI.borderMuted}`,
                  background: 'rgba(9, 11, 15, 0.46)',
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    color: SIMULATOR_UI.textSubtle,
                    fontSize: 12,
                    fontWeight: 800,
                    marginBottom: 6,
                  }}
                >
                  Falta
                </div>

                <div
                  style={{
                    color: gap > 0 ? '#fca5a5' : '#86efac',
                    fontSize: 21,
                    fontWeight: 950,
                    letterSpacing: -0.45,
                  }}
                >
                  {toBRL(gap)}
                </div>
              </div>

              <div
                style={{
                  border: `1px solid ${SIMULATOR_UI.borderMuted}`,
                  background: 'rgba(9, 11, 15, 0.46)',
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    color: SIMULATOR_UI.textSubtle,
                    fontSize: 12,
                    fontWeight: 800,
                    marginBottom: 6,
                  }}
                >
                  Ritmo necessário
                </div>

                <div
                  style={{
                    color: requiredPerDay > 0 ? '#fbbf24' : '#86efac',
                    fontSize: 21,
                    fontWeight: 950,
                    letterSpacing: -0.45,
                  }}
                >
                  {toBRL(requiredPerDay)}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    color: SIMULATOR_UI.textSubtle,
                    fontSize: 11.5,
                    lineHeight: 1.35,
                  }}
                >
                  por dia de execução
                </div>
              </div>
            </div>

            <div
              style={{
                height: 10,
                borderRadius: 999,
                background: 'rgba(148, 163, 184, 0.10)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.min(progressPct, 100)}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: progressBarColor,
                  transition: 'width 240ms ease',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 8,
                color: SIMULATOR_UI.textSubtle,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <span>0%</span>
              <span style={{ color: progressBarColor }}>{progressPct}% realizado</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${SIMULATOR_UI.borderMuted}`,
            background: 'rgba(9, 11, 15, 0.50)',
            borderRadius: 18,
            padding: 18,
            display: 'grid',
            gap: 14,
          }}
        >
          <div>
            <div
              style={{
                color: SIMULATOR_UI.textMuted,
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 5,
              }}
            >
              Meta de {revenueMetricLabel}
            </div>

            <div
              style={{
                color: SIMULATOR_UI.textPrimary,
                fontSize: 23,
                fontWeight: 950,
                letterSpacing: -0.5,
              }}
            >
              {toBRL(goal)}
            </div>
          </div>

          <div>
            <div
              style={{
                color: SIMULATOR_UI.textMuted,
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 5,
              }}
            >
              Projeção no ritmo atual
            </div>

            <div
              style={{
                color: projectionTone,
                fontSize: 22,
                fontWeight: 950,
                letterSpacing: -0.45,
              }}
            >
              {projection > 0 ? toBRL(projection) : '—'}
            </div>
          </div>

          <div>
            <div
              style={{
                color: SIMULATOR_UI.textMuted,
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 5,
              }}
            >
              Dias de execução restantes
            </div>

            <div
              style={{
                color: SIMULATOR_UI.textPrimary,
                fontSize: 22,
                fontWeight: 950,
              }}
            >
              {remainingBusinessDays}
            </div>
          </div>

          <div
            style={{
              borderTop: `1px solid ${SIMULATOR_UI.borderMuted}`,
              paddingTop: 12,
              color: SIMULATOR_UI.textSubtle,
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            Conversão usada:{' '}
            <strong style={{ color: SIMULATOR_UI.textSecondary }}>
              {(taxaUsadaNoCalculo * 100).toFixed(1)}%
            </strong>{' '}
            · Fonte: {rateSource === 'real' ? 'real' : 'planejada'}.
          </div>
        </div>
      </div>

      {revenueLoading ? (
        <div
          style={{
            marginTop: 14,
            color: SIMULATOR_UI.textMuted,
            fontSize: 13,
          }}
        >
          Atualizando dados de {revenueMetricLabel.toLowerCase()}...
        </div>
      ) : null}

      {revenueError ? (
        <div
          style={{
            marginTop: 14,
            color: '#fecaca',
            fontSize: 13,
            fontWeight: 750,
          }}
        >
          {revenueError}
        </div>
      ) : null}
    </section>
  )
}

function ExecutionPlanPanel({
  theory10020Result,
  remainingBusinessDays,
  rateSource,
  rateRealData,
}: {
  theory10020Result: Theory10020Result | null
  remainingBusinessDays: number
  rateSource: 'real' | 'planejada'
  rateRealData: CloseRateRealResponse | null
}) {
  if (!theory10020Result) {
    return (
      <div
        style={{
          border: `1px solid ${SIMULATOR_UI.borderSoft}`,
          background: 'rgba(9, 11, 15, 0.52)',
          borderRadius: 16,
          padding: 18,
          color: SIMULATOR_UI.textMuted,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        Informe um ticket médio maior que zero para gerar o plano operacional.
      </div>
    )
  }

  const t = theory10020Result

  const leadsPerDayIsHeavy = t.leads_restantes_por_dia > 15
  const winsPerDayIsHeavy = t.ganhos_restantes_por_dia > 4

  const rateLabel =
    rateSource === 'real' && (rateRealData?.vendor?.close_rate ?? null) !== null
      ? 'taxa real'
      : 'taxa planejada'

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            color: SIMULATOR_UI.textMuted,
            fontSize: 13,
            lineHeight: 1.45,
            maxWidth: 780,
          }}
        >
          Foco operacional: volume restante de leads, ganhos necessários e cadência diária até o fim do período.
        </div>

        <div
          style={{
            border: `1px solid ${SIMULATOR_UI.borderMuted}`,
            background: 'rgba(9, 11, 15, 0.46)',
            borderRadius: 999,
            padding: '6px 10px',
            color: SIMULATOR_UI.textMuted,
            fontSize: 12,
            fontWeight: 800,
            whiteSpace: 'nowrap',
          }}
        >
          {remainingBusinessDays} dias de execução restantes
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 12,
        }}
      >
        <Card
          title="Leads restantes"
          value={t.leads_restantes}
          subtitle="Volume total que ainda precisa ser trabalhado"
        />

        <Card
          title="Ganhos restantes"
          value={t.ganhos_restantes}
          subtitle="Fechamentos necessários para cobrir o gap"
          tone={t.ganhos_restantes <= 0 ? 'good' : 'neutral'}
        />

        <Card
          title="Leads por dia de execução"
          value={t.leads_restantes_por_dia}
          subtitle={leadsPerDayIsHeavy ? 'Ritmo alto. Exige cadência forte.' : 'Ritmo operacional administrável.'}
          tone={leadsPerDayIsHeavy ? 'bad' : 'neutral'}
        />

        <Card
          title="Ganhos por dia de execução"
          value={t.ganhos_restantes_por_dia}
          subtitle={winsPerDayIsHeavy ? 'Pressão alta de fechamento.' : 'Ritmo de fechamento viável.'}
          tone={winsPerDayIsHeavy ? 'bad' : 'good'}
        />
      </div>

      <div
        style={{
          border: `1px solid ${SIMULATOR_UI.borderSoft}`,
          background: 'rgba(9, 11, 15, 0.46)',
          borderRadius: 16,
          padding: 18,
          display: 'grid',
          gap: 10,
        }}
      >
        <div
          style={{
            color: SIMULATOR_UI.textPrimary,
            fontSize: 14,
            fontWeight: 900,
            letterSpacing: -0.1,
          }}
        >
          Diagnóstico objetivo
        </div>

        <div
          style={{
            color: SIMULATOR_UI.textSecondary,
            fontSize: 13.5,
            lineHeight: 1.65,
          }}
        >
          Faltam <strong style={{ color: '#fca5a5' }}>{toBRL(t.gap)}</strong> para bater a meta. Com ticket médio de{' '}
          <strong style={{ color: '#c4b5fd' }}>{toBRL(t.ticket_medio)}</strong> e conversão de{' '}
          <strong style={{ color: '#93c5fd' }}>{(t.close_rate * 100).toFixed(1)}%</strong> usando {rateLabel}, o time precisa trabalhar{' '}
          <strong style={{ color: '#67e8f9' }}>{t.leads_restantes} leads restantes</strong> para gerar aproximadamente{' '}
          <strong style={{ color: '#86efac' }}>{t.ganhos_restantes} ganhos</strong>.
        </div>

        <div
          style={{
            borderTop: `1px solid ${SIMULATOR_UI.borderMuted}`,
            paddingTop: 10,
            color: SIMULATOR_UI.textMuted,
            fontSize: 12.5,
            lineHeight: 1.55,
          }}
        >
          Ritmo recomendado: manter pelo menos{' '}
          <strong style={{ color: leadsPerDayIsHeavy ? '#fca5a5' : '#67e8f9' }}>
            {t.leads_restantes_por_dia} leads por dia de execução
          </strong>{' '}
          e buscar{' '}
          <strong style={{ color: winsPerDayIsHeavy ? '#fca5a5' : '#86efac' }}>
            {t.ganhos_restantes_por_dia} ganhos por dia de execução
          </strong>
          . Se esse volume estiver acima da capacidade real do time, a decisão gerencial é revisar meta, ampliar base de prospecção ou reforçar cadência.
        </div>
      </div>
    </div>
  )
}

export default function SimuladorMetaPage() {
  const supabase = supabaseBrowser()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [competency, setCompetency] = useState<ActiveCompetency | null>(null)
  const [metrics, setMetrics] = useState<SimulatorMetrics | null>(null)
  const [result, setResult] = useState<SimulatorResult | null>(null)

  const [mode, setMode] = useState<SimulatorMode>('faturamento')

  // Dias trabalhados (checkbox)
  const [workDays, setWorkDays] = useState<WorkDays>(defaultWorkDays())
  const [executionDayOverrides, setExecutionDayOverrides] = useState<ExecutionDayOverrides>({})
  const [executionCalendarOpen, setExecutionCalendarOpen] = useState(false)
  const [autoRemainingDays, setAutoRemainingDays] = useState(true)

  // Ganhos
  const [targetWins] = useState(20)
  const [closeRatePercent, setCloseRatePercent] = useState(20)
  const [remainingBusinessDays, setRemainingBusinessDays] = useState(15)

  // Revenue (dados)
  const [revenueCompany, setRevenueCompany] = useState<RevenueSummaryResponse | null>(null)
  const [revenueSeller, setRevenueSeller] = useState<RevenueSummaryResponse | null>(null)
  const [revenueLoading, setRevenueLoading] = useState(false)
  const [revenueError, setRevenueError] = useState<string | null>(null)

  // Revenue (meta do banco + input digitável)
  const [revenueGoalDb, setRevenueGoalDb] = useState<number>(0)
  const [revenueGoalInputText, setRevenueGoalInputText] = useState<string>('0')
  const [goalLoading, setGoalLoading] = useState(false)
  const [goalSaving, setGoalSaving] = useState(false)
  const [goalError, setGoalError] = useState<string | null>(null)
  const [goalSuccess, setGoalSuccess] = useState<string | null>(null)

  const [isAdmin, setIsAdmin] = useState(false)
  const [sellers, setSellers] = useState<Array<{ id: string; label: string }>>([])
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null)

  const [rateRealData, setRateRealData] = useState<CloseRateRealResponse | null>(null)
  const [rateRealLoading, setRateRealLoading] = useState(false)
  const [daysWindow, setDaysWindow] = useState(90)

  const [groupConversion, setGroupConversion] = useState<GroupConversionRow[]>([])
  const [groupConversionLoading, setGroupConversionLoading] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)

  // Teoria 100/20
  const [ticketMedioText, setTicketMedioText] = useState<string>('5000')
  const [theory10020Result, setTheory10020Result] = useState<Theory10020Result | null>(null)

  // Rate source: 'real' uses historical vendor rate, 'planejada' uses closeRatePercent
  const [rateSource, setRateSource] = useState<'real' | 'planejada'>('planejada')

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'teoria' | 'evolucao' | 'taxa-resultado' | 'funil' | 'distribuicao'>('teoria')

  // Distribuição operacional da meta
  const [distribution, setDistribution] = useState<DailyGoalDistribution | null>(null)
  const [distributionLoading, setDistributionLoading] = useState(false)
  const [distributionError, setDistributionError] = useState<string | null>(null)
  const [distributionOnlyWorking, setDistributionOnlyWorking] = useState(true)

  // Período editável
  const [periodStart, setPeriodStart] = useState<string>('')
  const [periodEnd, setPeriodEnd] = useState<string>('')

  // Ticket source
  const [ticketSource, setTicketSource] = useState<'manual' | 'historico'>('manual')
  const [historicalTicket, setHistoricalTicket] = useState<HistoricalTicketResponse | null>(null)
  const [historicalTicketLoading, setHistoricalTicketLoading] = useState(false)

  // init
  useEffect(() => {
    async function init() {
      setLoading(true)
      setError(null)

      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) throw new Error('Você está deslogado.')

        const uid = userData.user.id

        const { data: profile } = await supabase
          .from('profiles')
          .select('role, company_id')
          .eq('id', uid)
          .maybeSingle()
        if (!profile?.role) throw new Error('Perfil não encontrado.')

        const isAdminUser = profile.role === 'admin'
        setIsAdmin(isAdminUser)
        setCompanyId(profile.company_id)

        const comp = await getActiveCompetency()
        setCompetency(comp)

        // Corrigir month_end: a RPC retorna o 1º dia do próximo mês (exclusivo)
        // Converter para o último dia do mês (inclusivo) para exibição
        const rawEnd = new Date(toYMD(comp.month_end) + 'T00:00:00')
        rawEnd.setDate(rawEnd.getDate() - 1)
        const correctedEnd = rawEnd.toISOString().slice(0, 10)

        setPeriodStart(toYMD(comp.month_start))
        setPeriodEnd(correctedEnd)

        const endDate = new Date(toYMD(comp.month_end) + 'T00:00:00')
        const remainingDays = countRemainingWorkDays(endDate, workDays, executionDayOverrides)
        setRemainingBusinessDays(remainingDays)

        if (isAdminUser) {
          const { data: sellersData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('company_id', profile.company_id)
            .eq('role', 'member')
            .order('full_name')

            const sellersList = (sellersData ?? []).map((s: { id: string; full_name: string | null }) => ({
              id: s.id,
              label: s.full_name || s.id,
            }))

          setSellers(sellersList)
          setSelectedSellerId(null)
        } else {
          setSelectedSellerId(uid)
        }

        const m = await getSalesCycleMetrics(null, comp.month_start)
        setMetrics(m)

        const totalDays = countWorkDaysInRange(
          toYMD(comp.month_start),
          correctedEnd,
          workDays,
        )
        const res = calculateSimulatorResult(m, {
          target_wins: targetWins,
          close_rate: percentToRate(closeRatePercent),
          ticket_medio: 0,
          remaining_business_days: remainingDays,
          total_business_days: totalDays,
        })
        setResult(res)
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Erro ao carregar simulador.'))
      } finally {
        setLoading(false)
      }
    }

    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  // ✅ useEffect correto (fora do init): auto recalcular dias restantes
  useEffect(() => {
    if (!periodEnd) return
    if (!autoRemainingDays) return

    const endDate = new Date(periodEnd + 'T00:00:00')
    const remainingDays = countRemainingWorkDays(endDate, workDays, executionDayOverrides)
    setRemainingBusinessDays(remainingDays)
  }, [periodEnd, workDays, executionDayOverrides, autoRemainingDays])

  // taxa real
  useEffect(() => {
    async function loadRateReal() {
      setRateRealLoading(true)
      try {
        const data = await getCloseRateReal(selectedSellerId, daysWindow)
        setRateRealData(data)
      } catch (e: unknown) {
        console.warn('Erro ao carregar taxa real:', getErrorMessage(e, 'Erro desconhecido.'))
        setRateRealData(null)
      } finally {
        setRateRealLoading(false)
      }
    }
    if (competency) void loadRateReal()
  }, [selectedSellerId, daysWindow, competency])

  // recalcula ganhos
  useEffect(() => {
    if (!metrics) return
    const totalDays =
      periodStart && periodEnd ? countWorkDaysInRange(periodStart, periodEnd, workDays, executionDayOverrides) : 22
    const newResult = calculateSimulatorResult(metrics, {
      target_wins: targetWins,
      close_rate: percentToRate(closeRatePercent),
      ticket_medio: 0,
      remaining_business_days: remainingBusinessDays,
      total_business_days: totalDays,
    })
    setResult(newResult)
  }, [targetWins, closeRatePercent, remainingBusinessDays, metrics, periodStart, periodEnd, workDays, executionDayOverrides])

  // refetch metrics quando muda vendedor ou período
  useEffect(() => {
    if (!periodStart || selectedSellerId === undefined) return

    async function refetch() {
      try {
        const newMetrics = await getSalesCycleMetrics(selectedSellerId, periodStart)
        setMetrics(newMetrics)
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Erro ao atualizar métricas.'))
      }
    }

    void refetch()
  }, [periodStart, selectedSellerId])

  // conversão por grupo
  useEffect(() => {
    if (!periodStart || !periodEnd || !companyId || selectedSellerId === undefined) return

    const cid = companyId

    async function loadGroupConversion() {
      setGroupConversionLoading(true)
      try {
        const rows = await getGroupConversion({
          companyId: cid,
          ownerId: selectedSellerId,
          dateStart: periodStart,
          dateEnd: periodEnd,
        })
        setGroupConversion(rows)
      } catch (e: unknown) {
        console.warn('Erro ao carregar conversão por grupo:', getErrorMessage(e, 'Erro desconhecido.'))
        setGroupConversion([])
      } finally {
        setGroupConversionLoading(false)
      }
    }

    void loadGroupConversion()
  }, [periodStart, periodEnd, selectedSellerId, companyId])

  const revenueDates = useMemo(() => {
    if (!periodStart || !periodEnd) return { start: '', end: '' }
    return {
      start: periodStart,
      end: periodEnd,
    }
  }, [periodStart, periodEnd])

  const revenueGoalOwnerId = useMemo(() => {
    if (!competency) return null
    if (isAdmin) return selectedSellerId
    return selectedSellerId
  }, [isAdmin, selectedSellerId, competency])

  const revenueGoalContextLabel = useMemo(() => {
    if (!isAdmin) return 'Meta do vendedor (definida pelo admin)'
    return revenueGoalOwnerId ? 'Meta do vendedor' : 'Meta da empresa'
  }, [isAdmin, revenueGoalOwnerId])

  const revenueGoalInputNumber = useMemo(
    () => Math.max(0, safeNumber(revenueGoalInputText)),
    [revenueGoalInputText],
  )

  const activeGoalForKpis = isAdmin ? revenueGoalInputNumber : revenueGoalDb

async function handleSaveGoalFromTop() {
  if (!companyId) {
    setGoalError('Empresa não encontrada para salvar a meta.')
    setGoalSuccess(null)
    return
  }

  if (!revenueDates.start || !revenueDates.end) {
    setGoalError('Período inválido para salvar a meta.')
    setGoalSuccess(null)
    return
  }

  setGoalSaving(true)
  setGoalError(null)
  setGoalSuccess(null)

  try {
    const ticketValue = Math.max(0, safeNumber(ticketMedioText))

    await upsertRevenueGoal({
      companyId,
      ownerId: revenueGoalOwnerId ?? null,
      startDate: revenueDates.start,
      endDate: revenueDates.end,
      goalValue: revenueGoalInputNumber,
      ticketMedio: ticketValue,
    })

    setRevenueGoalDb(revenueGoalInputNumber)
    setGoalSuccess('Meta salva com sucesso.')
  } catch (error: unknown) {
    setGoalError(getErrorMessage(error, 'Erro ao salvar meta.'))
    setGoalSuccess(null)
  } finally {
    setGoalSaving(false)
  }
}

function handleUndoGoalFromTop() {
  setRevenueGoalInputText(String(revenueGoalDb))
  setGoalError(null)
  setGoalSuccess(null)
}

  // Computed: taxa usada no cálculo da teoria
  const taxaUsadaNoCalculo = useMemo(() => {
    const taxaRealDecimal = rateRealData?.vendor?.close_rate ?? null
    if (rateSource === 'real' && taxaRealDecimal !== null) {
      return taxaRealDecimal
    }
    return closeRatePercent / 100
  }, [rateSource, rateRealData, closeRatePercent])

  // Teoria 100/20 — recalcular quando inputs mudam
  useEffect(() => {
    if (mode !== 'faturamento') {
      setTheory10020Result(null)
      return
    }

    const ticketValue = ticketSource === 'historico' && historicalTicket?.is_sufficient
      ? historicalTicket.ticket_medio
      : Math.max(0, safeNumber(ticketMedioText))
    if (ticketValue <= 0) {
      setTheory10020Result(null)
      return
    }

    const totalReal = Number(revenueSeller?.total_real || revenueCompany?.total_real || 0)

    const result = calculateTheory10020({
      meta_total: activeGoalForKpis,
      ticket_medio: ticketValue,
      close_rate: taxaUsadaNoCalculo,
      remaining_business_days: remainingBusinessDays,
      total_real: totalReal,
    })
    setTheory10020Result(result)
  }, [mode, ticketMedioText, ticketSource, historicalTicket, activeGoalForKpis, taxaUsadaNoCalculo, remainingBusinessDays, revenueSeller, revenueCompany])

  // Carregar meta do banco
  useEffect(() => {
    if (!companyId || !competency) return
    if (mode === 'ganhos') return

    const cid: string = companyId

    async function loadGoal() {
      setGoalLoading(true)
      setGoalError(null)
      setGoalSuccess(null)

      try {
        const res = await getRevenueGoal({
          companyId: cid,
          ownerId: revenueGoalOwnerId ?? null,
          startDate: revenueDates.start,
          endDate: revenueDates.end,
        })

        const dbValue = Number(res?.goal_value || 0)
        setRevenueGoalDb(dbValue)
        setRevenueGoalInputText(String(dbValue))

        const dbTicket = Number(res?.ticket_medio || 0)
        if (dbTicket > 0) {
          setTicketMedioText(String(dbTicket))
          setTicketSource('manual')
        }
      } catch (e: unknown) {
        setGoalError(getErrorMessage(e, 'Erro ao carregar meta.'))
        setRevenueGoalDb(0)
        setRevenueGoalInputText('0')
      } finally {
        setGoalLoading(false)
      }
    }

    void loadGoal()
  }, [companyId, competency, mode, revenueDates.start, revenueDates.end, revenueGoalOwnerId])

  // Load historical ticket
  useEffect(() => {
    if (!companyId || !competency) return
    if (mode !== 'faturamento') return

    async function loadHistoricalTicket() {
      setHistoricalTicketLoading(true)
      try {
        const data = await getHistoricalTicket({
          companyId: companyId!,
          ownerId: selectedSellerId ?? null,
          dateStart: toYMD(competency!.month_start),
          dateEnd: toYMD(competency!.month_end),
        })
        setHistoricalTicket(data)
      } catch (e: unknown) {
        console.warn('Erro ao carregar ticket histórico:', getErrorMessage(e, 'Erro desconhecido.'))
        setHistoricalTicket(null)
      } finally {
        setHistoricalTicketLoading(false)
      }
    }

    void loadHistoricalTicket()
  }, [companyId, competency, mode, selectedSellerId])

  // Distribuição inteligente — carrega quando a aba é ativada
  useEffect(() => {
    if (activeTab !== 'distribuicao') return
    if (!companyId || !competency) return

    const cid = companyId
    const dateStart = periodStart
    const dateEnd = periodEnd

    const histEnd = dateEnd
    const histStartDate = new Date(histEnd + 'T00:00:00')
    histStartDate.setFullYear(histStartDate.getFullYear() - 2)
    const histStart = histStartDate.toISOString().slice(0, 10)

    async function loadDistribution() {
      setDistributionLoading(true)
      setDistributionError(null)

      try {
        const [wdVocationSummary, monthlyPerfSummary, radarSummary] = await Promise.allSettled([
          getWeekdayVocation({
            companyId: cid,
            ownerId: selectedSellerId ?? null,
            dateStart: histStart,
            dateEnd: histEnd,
          }),
          getMonthlySeasonalityPerformance({
            companyId: cid,
            ownerId: selectedSellerId ?? null,
            dateStart: histStart,
            dateEnd: histEnd,
          }),
          getPeriodRadar({
            companyId: cid,
            ownerId: selectedSellerId ?? null,
            dateStart: histStart,
            dateEnd: histEnd,
          }),
        ])

        const inputSignals: DistributionInputSignals = {}

        if (wdVocationSummary.status === 'fulfilled') {
          const summary = wdVocationSummary.value
          const wdMap: DistributionInputSignals['weekdayVocation'] = {}
          for (const row of summary.rows) {
            const pSignal = row.signals.find((s) => s.type === 'prospeccao')
            const fSignal = row.signals.find((s) => s.type === 'fechamento')
            const fuSignal = row.signals.find((s) => s.type === 'followup')
            const nSignal = row.signals.find((s) => s.type === 'negociacao')
            wdMap[row.weekday] = {
              dominant_vocation: row.dominant_vocation,
              dominant_confidence: row.dominant_confidence,
              prospeccao_strength: pSignal?.strength ?? 0,
              fechamento_strength: fSignal?.strength ?? 0,
              followup_strength: fuSignal?.strength ?? 0,
              negociacao_strength: nSignal?.strength ?? 0,
            }
          }
          inputSignals.weekdayVocation = wdMap
        }

        if (monthlyPerfSummary.status === 'fulfilled') {
          const summary = monthlyPerfSummary.value
          const currentMonth = new Date(dateStart + 'T00:00:00').getMonth() + 1
          const monthRow = summary.rows.find((r) => r.month === currentMonth) ?? null
          if (monthRow) {
            inputSignals.monthlySeasonality = {
              month: monthRow.month,
              leads_trabalhados: monthRow.leads_trabalhados,
              ganhos: monthRow.ganhos,
              base_suficiente_trabalho: monthRow.base_suficiente_trabalho,
              base_suficiente_ganho: monthRow.base_suficiente_ganho,
              taxa_ganho: monthRow.taxa_ganho,
            }
          }
        }

        if (radarSummary.status === 'fulfilled') {
          const r = radarSummary.value
          inputSignals.periodRadar = {
            status: r.status,
            confidence: r.confidence,
            score_interno: r.score_interno,
          }
        }

        const safeDistributionRate = Math.max(0.01, taxaUsadaNoCalculo)

        const totalLeadsForDist = theory10020Result?.leads_para_contatar
          ?? Math.ceil(targetWins / safeDistributionRate)

        const totalWinsForDist = theory10020Result?.vendas_necessarias
          ?? targetWins

        const dist = buildCalendarDistribution(
          {
            dateStart,
            dateEnd,
            workDays,
            executionDayOverrides,
            totalLeads: Math.max(0, totalLeadsForDist),
            totalWins: Math.max(0, totalWinsForDist),
            closeRate: safeDistributionRate,
          },
          inputSignals,
        )

        setDistribution(dist)
      } catch (e: unknown) {
        setDistributionError(getErrorMessage(e, 'Erro ao gerar distribuição.'))
        setDistribution(null)
      } finally {
        setDistributionLoading(false)
      }
    }

    void loadDistribution()
  }, [
    activeTab,
    companyId,
    competency,
    periodStart,
    periodEnd,
    selectedSellerId,
    targetWins,
    taxaUsadaNoCalculo,
    workDays,
    executionDayOverrides,
    theory10020Result?.leads_para_contatar,
    theory10020Result?.vendas_necessarias,
  ])

  // revenue (dados)
  useEffect(() => {
    if (!competency || !companyId) return

    const cid: string = companyId

    async function loadRevenue() {
      if (mode === 'ganhos') {
        setRevenueCompany(null)
        setRevenueSeller(null)
        setRevenueError(null)
        return
      }

      setRevenueLoading(true)
      setRevenueError(null)

      const metric: 'faturamento' | 'recebimento' =
        mode === 'recebimento' ? 'recebimento' : 'faturamento'
      const startDate = revenueDates.start
      const endDate = revenueDates.end

      try {
        const fetches: Array<Promise<void>> = []

        if (isAdmin) {
          fetches.push(
            (async () => {
              const companyRes = await getRevenueSummary({
                companyId: cid,
                ownerId: null,
                startDate,
                endDate,
                metric,
              })
              setRevenueCompany(companyRes)
            })(),
          )
        } else {
          setRevenueCompany(null)
        }

        const ownerIdForSeller = selectedSellerId ?? null
        if (ownerIdForSeller) {
          fetches.push(
            (async () => {
              const sellerRes = await getRevenueSummary({
                companyId: cid,
                ownerId: ownerIdForSeller,
                startDate,
                endDate,
                metric,
              })
              setRevenueSeller(sellerRes)
            })(),
          )
        } else {
          setRevenueSeller(null)
        }

        await Promise.all(fetches)
      } catch (e: unknown) {
        const message = getErrorMessage(e, 'Erro ao carregar faturamento/recebimento.')
        console.warn('Erro ao carregar revenue:', message)
        setRevenueError(message)
        setRevenueCompany(null)
        setRevenueSeller(null)
      } finally {
        setRevenueLoading(false)
      }
    }

    void loadRevenue()
  }, [mode, competency, companyId, isAdmin, selectedSellerId, revenueDates.start, revenueDates.end])

  const executionCalendarDays = useMemo(() => {
    if (!periodStart || !periodEnd) return []

    return buildExecutionCalendarDays(
      periodStart,
      periodEnd,
      workDays,
      executionDayOverrides,
    )
  }, [periodStart, periodEnd, workDays, executionDayOverrides])

  const executionCalendarSummary = useMemo(
    () => getExecutionCalendarSummary(executionCalendarDays),
    [executionCalendarDays],
  )

  function buildRevenueKpis(totalReal: number, goal: number) {
    const safeGoal = Math.max(0, Number(goal) || 0)

    const calendarDays = buildExecutionCalendarDays(
      revenueDates.start,
      revenueDates.end,
      workDays,
      executionDayOverrides,
    )

    const calendarSummary = getExecutionCalendarSummary(calendarDays)

    const businessDaysTotal = calendarSummary.totalExecutionDays
    const businessDaysElapsed = countWorkDaysUntilToday(
      revenueDates.start,
      revenueDates.end,
      workDays,
      executionDayOverrides,
    )

    const endDate = new Date(toYMD(revenueDates.end) + 'T00:00:00')
    const businessDaysRemaining = countRemainingWorkDays(
      endDate,
      workDays,
      executionDayOverrides,
    )

    const gap = Math.max(0, safeGoal - totalReal)
    const requiredPerBD = businessDaysRemaining > 0 ? gap / businessDaysRemaining : gap

    const avgDaily = businessDaysElapsed > 0 ? totalReal / businessDaysElapsed : 0
    const projection = avgDaily * Math.max(1, businessDaysTotal)

    const pacingRatio = safeGoal > 0 ? projection / safeGoal : 0
    const status = getRevenueStatus(pacingRatio)

    return {
      goal: safeGoal,
      businessDaysTotal,
      businessDaysElapsed,
      businessDaysRemaining,
      totalReal,
      gap,
      required_per_business_day: requiredPerBD,
      projection,
      pacingRatio,
      status,
    }
  }

  const revenueCompanyKpis = useMemo(() => {
    if (!revenueCompany?.success) return null
    return buildRevenueKpis(Number(revenueCompany.total_real || 0), activeGoalForKpis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueCompany, activeGoalForKpis, revenueDates.start, revenueDates.end, workDays, executionDayOverrides])

  const revenueSellerKpis = useMemo(() => {
    if (!revenueSeller?.success) return null
    return buildRevenueKpis(Number(revenueSeller.total_real || 0), activeGoalForKpis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueSeller, activeGoalForKpis, revenueDates.start, revenueDates.end, workDays, executionDayOverrides])

  const showRevenueMode = mode !== 'ganhos'

  const revenueMetricLabel =
    mode === 'faturamento' ? 'Faturamento' : mode === 'recebimento' ? 'Recebimento' : 'Ganhos'

    const decisionRevenueKpis = useMemo(() => {
      if (!showRevenueMode) return null
  
      if (selectedSellerId) {
        return revenueSellerKpis
      }
  
      return revenueCompanyKpis
    }, [showRevenueMode, selectedSellerId, revenueSellerKpis, revenueCompanyKpis])
  
    const ratePanelTargetWins = useMemo(() => {
      if (showRevenueMode && theory10020Result) {
        return theory10020Result.vendas_necessarias
      }
  
      return targetWins
    }, [showRevenueMode, theory10020Result, targetWins])
  
    const ratePanelResult = useMemo<SimulatorResult | null>(() => {
      if (!showRevenueMode || !theory10020Result || !metrics) {
        return result
      }
  
      const safeRate = Math.max(0.01, taxaUsadaNoCalculo)
      const currentWins = metrics.current_wins ?? 0
      const workedCount = metrics.worked_count ?? 0
  
      const neededWins = Math.max(0, theory10020Result.vendas_necessarias)
      const remainingWins = Math.max(0, neededWins - currentWins)
  
      const neededWorkedCycles = Math.ceil(neededWins / safeRate)
      const remainingWorkedCycles = Math.ceil(remainingWins / safeRate)
      const dailyWorkedRemaining =
        remainingBusinessDays > 0
          ? Math.ceil(remainingWorkedCycles / remainingBusinessDays)
          : remainingWorkedCycles
  
      const currentRate = workedCount > 0 ? currentWins / workedCount : 0
  
      return {
        needed_wins: neededWins,
        remaining_wins: remainingWins,
        needed_worked_cycles: neededWorkedCycles,
        remaining_worked_cycles: remainingWorkedCycles,
        daily_worked_needed: neededWorkedCycles,
        daily_worked_remaining: dailyWorkedRemaining,
        simulation_15pct: Math.ceil(neededWins / 0.15),
        simulation_25pct: Math.ceil(neededWins / 0.25),
        progress_pct: neededWins > 0 ? currentWins / neededWins : 0,
        on_track: currentRate >= safeRate,
      }
    }, [
      showRevenueMode,
      theory10020Result,
      metrics,
      result,
      taxaUsadaNoCalculo,
      remainingBusinessDays,
    ])

  const executionCalendarStorageKey = useMemo(() => {
    const companyKey = companyId || 'sem-empresa'
    const startKey = periodStart || 'sem-inicio'
    const endKey = periodEnd || 'sem-fim'

    return `cockpit:simulador-meta:calendario-operacional:${companyKey}:${startKey}:${endKey}`
  }, [companyId, periodStart, periodEnd])

  useEffect(() => {
    if (!periodStart || !periodEnd) return

    try {
      const raw = window.localStorage.getItem(executionCalendarStorageKey)

      if (!raw) {
        setExecutionDayOverrides({})
        return
      }

      const parsed = JSON.parse(raw)

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setExecutionDayOverrides({})
        return
      }

      const safeOverrides = Object.entries(parsed).reduce<ExecutionDayOverrides>(
        (acc, [date, value]) => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(date) && typeof value === 'boolean') {
            acc[date] = value
          }

          return acc
        },
        {},
      )

      setExecutionDayOverrides(safeOverrides)
    } catch (error) {
      console.warn('Erro ao carregar calendário operacional:', getErrorMessage(error, 'Erro desconhecido.'))
      setExecutionDayOverrides({})
    }
  }, [executionCalendarStorageKey, periodStart, periodEnd])

  function persistExecutionDayOverrides(next: ExecutionDayOverrides) {
    try {
      if (Object.keys(next).length === 0) {
        window.localStorage.removeItem(executionCalendarStorageKey)
        return
      }

      window.localStorage.setItem(executionCalendarStorageKey, JSON.stringify(next))
    } catch (error) {
      console.warn('Erro ao salvar calendário operacional:', getErrorMessage(error, 'Erro desconhecido.'))
    }
  }

  const hasExecutionDayOverrides = Object.keys(executionDayOverrides).length > 0

  function handleSetExecutionDayOverride(date: string, value: boolean) {
    setExecutionDayOverrides((current) => {
      const next = {
        ...current,
        [date]: value,
      }

      persistExecutionDayOverrides(next)

      return next
    })
  }

  function handleClearExecutionDayOverride(date: string) {
    setExecutionDayOverrides((current) => {
      const next = { ...current }
      delete next[date]

      persistExecutionDayOverrides(next)

      return next
    })
  }

  function handleResetExecutionDayOverrides() {
    setExecutionDayOverrides({})
    persistExecutionDayOverrides({})
  }

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 18, opacity: 0.7 }}>Carregando simulador...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: '1px solid #3a2222',
            background: '#160b0b',
            color: '#ffb3b3',
          }}
        >
          {error}
        </div>
      </div>
    )
  }

  const showCompanyChart = showRevenueMode && isAdmin
  const showSellerChart = showRevenueMode && selectedSellerId !== null

  return (
    <div style={{ maxWidth: 1200, marginLeft: 'auto', marginRight: 'auto', padding: '0 0 40px' }}>

      <SimulatorTopControls
        isAdmin={isAdmin}
        sellers={sellers}
        selectedSellerId={selectedSellerId}
        setSelectedSellerId={setSelectedSellerId}
        periodStart={periodStart}
        setPeriodStart={setPeriodStart}
        periodEnd={periodEnd}
        setPeriodEnd={setPeriodEnd}
        mode={mode}
        setMode={(newMode) => {
          setMode(newMode)

          if (newMode === 'ganhos' && (activeTab === 'evolucao' || activeTab === 'teoria')) {
            setActiveTab('taxa-resultado')
          }
        }}
        revenueGoalContextLabel={revenueGoalContextLabel}
        revenueGoalInputText={revenueGoalInputText}
        setRevenueGoalInputText={setRevenueGoalInputText}
        goalLoading={goalLoading}
        goalSaving={goalSaving}
        onSaveGoal={handleSaveGoalFromTop}
        onUndoGoal={handleUndoGoalFromTop}
        goalError={goalError}
        goalSuccess={goalSuccess}
        ticketMedioText={ticketMedioText}
        setTicketMedioText={setTicketMedioText}
        ticketSource={ticketSource}
        setTicketSource={setTicketSource}
        historicalTicket={historicalTicket}
        historicalTicketLoading={historicalTicketLoading}
        rateSource={rateSource}
        setRateSource={setRateSource}
        closeRatePercent={closeRatePercent}
        setCloseRatePercent={setCloseRatePercent}
        rateRealData={rateRealData}
        rateRealLoading={rateRealLoading}
        daysWindow={daysWindow}
        setDaysWindow={setDaysWindow}
        workDays={workDays}
        setWorkDays={setWorkDays}
        autoRemainingDays={autoRemainingDays}
        setAutoRemainingDays={setAutoRemainingDays}
        remainingBusinessDays={remainingBusinessDays}
      />

      <ExecutionCalendarSummaryStrip
        summary={executionCalendarSummary}
        totalDays={executionCalendarDays.length}
        hasOverrides={hasExecutionDayOverrides}
        onOpenCalendar={() => setExecutionCalendarOpen(true)}
      />

      <ExecutionCalendarModal
        open={executionCalendarOpen}
        periodStart={periodStart}
        periodEnd={periodEnd}
        days={executionCalendarDays}
        summary={executionCalendarSummary}
        onClose={() => setExecutionCalendarOpen(false)}
        onSetOverride={handleSetExecutionDayOverride}
        onClearOverride={handleClearExecutionDayOverride}
        onResetAll={handleResetExecutionDayOverrides}
      />


      <DecisionHero
        mode={mode}
        revenueMetricLabel={revenueMetricLabel}
        revenueKpis={decisionRevenueKpis}
        theory10020Result={theory10020Result}
        revenueLoading={revenueLoading}
        revenueError={revenueError}
        remainingBusinessDays={remainingBusinessDays}
        rateSource={rateSource}
        taxaUsadaNoCalculo={taxaUsadaNoCalculo}
      />

      {/* ================================================================ */}
      {/* TAB NAVIGATION                                                    */}
      {/* ================================================================ */}
      <div
        style={{
          marginBottom: 16,
          border: `1px solid ${SIMULATOR_UI.borderSoft}`,
          background: 'rgba(13, 15, 20, 0.72)',
          borderRadius: 16,
          padding: 6,
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          alignItems: 'center',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('teoria')}
          style={tabStyle(activeTab === 'teoria')}
        >
          Esforço Máximo
        </button>

        {showRevenueMode ? (
          <button
            type="button"
            onClick={() => setActiveTab('evolucao')}
            style={tabStyle(activeTab === 'evolucao')}
          >
            Evolução
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setActiveTab('taxa-resultado')}
          style={tabStyle(activeTab === 'taxa-resultado')}
        >
          Taxa e Resultado
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('funil')}
          style={tabStyle(activeTab === 'funil')}
        >
          Funil do Período
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('distribuicao')}
          style={tabStyle(activeTab === 'distribuicao')}
        >
          Distribuição
        </button>
      </div>

      {/* ================================================================ */}
      {/* TAB CONTENT                                                       */}
      {/* ================================================================ */}
      <div style={{ display: 'grid', gap: 16 }}>

        {/* ============================================================ */}
        {/* ABA 1: ESFORÇO MÁXIMO                                         */}
        {/* ============================================================ */}
        {activeTab === 'teoria' && (
          mode === 'faturamento' ? (
            <Section
              title={
                <TitleWithTip label="Plano de Execução — Esforço Máximo" tipTitle="O que é o Esforço Máximo?" width={480}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div>
                      O cálculo usa <strong>1 ÷ taxa de conversão</strong> como multiplicador. Com 20% → ×5, com 15% → ×6.67, com 25% → ×4.
                    </div>
                    <div>
                      A lógica transforma meta financeira em volume de leads, ganhos necessários e ritmo diário de execução.
                    </div>
                  </div>
                </TitleWithTip>
              }
              description="Transforma a meta financeira em volume de leads, ganhos e ritmo diário de execução."
            >
              <ExecutionPlanPanel
                theory10020Result={theory10020Result}
                remainingBusinessDays={remainingBusinessDays}
                rateSource={rateSource}
                rateRealData={rateRealData}
              />
            </Section>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 14, opacity: 0.5 }}>
              Esforço Máximo disponível apenas no modo Faturamento.
            </div>
          )
        )}

        {/* ============================================================ */}
        {/* ABA 2: EVOLUÇÃO                                               */}
        {/* ============================================================ */}
        {activeTab === 'evolucao' && showRevenueMode && (
          <div style={{ display: 'grid', gap: 16 }}>
            {revenueLoading ? <div style={{ fontSize: 12, opacity: 0.7 }}>Carregando faturamento...</div> : null}
            {revenueError ? <div style={{ fontSize: 12, color: '#ffb3b3' }}>{revenueError}</div> : null}

            {showCompanyChart && revenueCompanyKpis ? (
              <MetaSummaryHeader
                title="Empresa (todos)"
                kpis={{
                  totalReal: revenueCompanyKpis.totalReal,
                  goal: revenueCompanyKpis.goal,
                  gap: revenueCompanyKpis.gap,
                  requiredPerBD: revenueCompanyKpis.required_per_business_day,
                  businessDaysRemaining: revenueCompanyKpis.businessDaysRemaining,
                  projection: revenueCompanyKpis.projection,
                  pacingRatio: revenueCompanyKpis.pacingRatio,
                  status: revenueCompanyKpis.status,
                }}
              />
            ) : null}

            {showCompanyChart && revenueCompany?.success ? (
              <RevenueChart
              title={`Evolução — Empresa (${revenueMetricLabel})`}
                series={(revenueCompany.days ?? []) as RevenueDayPoint[]}
                goal={activeGoalForKpis}
                startDate={revenueDates.start}
                endDate={revenueDates.end}
              />
            ) : null}

            {showSellerChart && revenueSeller?.success ? (
              <RevenueChart
              title={`Evolução — Vendedor (${revenueMetricLabel})`}
                series={(revenueSeller.days ?? []) as RevenueDayPoint[]}
                goal={activeGoalForKpis}
                startDate={revenueDates.start}
                endDate={revenueDates.end}
              />
            ) : null}

            {!showCompanyChart && !showSellerChart && !revenueLoading && !revenueError ? (
              <div style={{ fontSize: 13, opacity: 0.5, padding: 20, textAlign: 'center' }}>
                Nenhum dado de evolução disponível para o modo/seleção atual.
              </div>
            ) : null}
          </div>
        )}

        {/* ============================================================ */}
        {/* ABA 3: TAXA E RESULTADO                                       */}
        {/* ============================================================ */}
        {activeTab === 'taxa-resultado' && (
          <Section
            title="Taxa e Resultado"
            description="Resumo operacional da taxa de conversão, ganhos necessários e ritmo diário restante."
          >
            <RateResultPanel
              metrics={metrics}
              result={ratePanelResult}
              targetWins={ratePanelTargetWins}
              taxaUsadaNoCalculo={taxaUsadaNoCalculo}
              remainingBusinessDays={remainingBusinessDays}
              context={showRevenueMode ? 'financial' : 'wins'}
            />
          </Section>
        )}

        {/* ============================================================ */}
        {/* ABA 4: FUNIL DO PERÍODO                                       */}
        {/* ============================================================ */}
        {activeTab === 'funil' && (
          <div style={{ display: 'grid', gap: 16 }}>

<Section
              title="Funil do Período"
              description="Distribuição compacta dos ciclos por estágio no período selecionado."
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                  gap: 10,
                }}
              >
                <FunnelStageCard
                  label="Novo"
                  value={metrics?.counts_by_status.novo ?? '—'}
                  accent="#3b82f6"
                />

                <FunnelStageCard
                  label="Contato"
                  value={metrics?.counts_by_status.contato ?? '—'}
                  accent="#06b6d4"
                />

                <FunnelStageCard
                  label="Respondeu"
                  value={metrics?.counts_by_status.respondeu ?? '—'}
                  accent="#eab308"
                />

                <FunnelStageCard
                  label="Negociação"
                  value={metrics?.counts_by_status.negociacao ?? '—'}
                  accent="#8b5cf6"
                />

                <FunnelStageCard
                  label="Ganho"
                  value={metrics?.counts_by_status.ganho ?? '—'}
                  accent="#22c55e"
                />

                <FunnelStageCard
                  label="Perdido"
                  value={metrics?.counts_by_status.perdido ?? '—'}
                  accent="#ef4444"
                />
              </div>
            </Section>

            {/* Conversão por grupo */}
            {groupConversionLoading ? (
              <Section
                title="Conversão por Grupo"
                description="Carregando a conversão dos grupos de leads no período selecionado."
              >
                <div
                  style={{
                    border: `1px solid ${SIMULATOR_UI.borderMuted}`,
                    background: 'rgba(9, 11, 15, 0.46)',
                    borderRadius: 14,
                    padding: 16,
                    color: SIMULATOR_UI.textMuted,
                    fontSize: 13,
                  }}
                >
                  Carregando funil por grupo...
                </div>
              </Section>
            ) : groupConversion.length > 0 ? (
              <Section
                title="Conversão por Grupo"
                description="Leitura compacta da eficiência dos grupos de leads no período selecionado."
              >
                <GroupConversionList rows={groupConversion} />
              </Section>
            ) : (
              <Section
                title="Conversão por Grupo"
                description="Leitura compacta da eficiência dos grupos de leads no período selecionado."
              >
                <div
                  style={{
                    border: `1px solid ${SIMULATOR_UI.borderMuted}`,
                    background: 'rgba(9, 11, 15, 0.46)',
                    borderRadius: 14,
                    padding: 16,
                    color: SIMULATOR_UI.textMuted,
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  Nenhum grupo com conversão encontrado para o período atual.
                </div>
              </Section>
            )}

          </div>
        )}

        {/* ============================================================ */}
        {/* ABA 5: DISTRIBUIÇÃO OPERACIONAL                              */}
        {/* ============================================================ */}
        {activeTab === 'distribuicao' && (
          <div style={{ display: 'grid', gap: 16 }}>

            <Section
            title="Distribuição operacional da meta"
            description="Plano diário calculado a partir do calendário operacional, histórico disponível e carga necessária do período."
            >
              {/* Controles */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={distributionOnlyWorking}
                    onChange={(e) => setDistributionOnlyWorking(e.target.checked)}
                  />
                  Mostrar apenas dias de execução
                </label>
                {distribution ? (
                  <span style={{ fontSize: 12, opacity: 0.5 }}>
                    {distribution.summary.total_working_days} dias de execução · {periodStart} a {periodEnd}
                  </span>
                ) : null}
              </div>

              {distributionLoading ? (
                <div style={{ fontSize: 13, opacity: 0.6, padding: '12px 0' }}>
                  Carregando distribuição...
                </div>
              ) : distributionError ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: '#160b0b',
                    border: '1px solid #3a2222',
                    color: '#ffb3b3',
                    fontSize: 13,
                  }}
                >
                  {distributionError}
                </div>
              ) : distribution ? (
                <SimulatorDistributionSummary distribution={distribution} />
              ) : (
                <div style={{ fontSize: 13, opacity: 0.5, padding: '12px 0' }}>
                  Selecione a aba Distribuição para gerar o calendário de metas.
                </div>
              )}
            </Section>

            {distribution && !distributionLoading ? (
              <Section
                title="Calendário Diário"
                description="Meta de leads e ganhos por dia de execução. Clique em uma linha para ver o motivo da distribuição."
              >
                <SimulatorDailyDistributionTable
                  distribution={distribution}
                  onlyWorkingDays={distributionOnlyWorking}
                />
              </Section>
            ) : null}

          </div>
        )}

      </div>
    </div>
  )
}
