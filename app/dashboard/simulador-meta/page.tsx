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
import MetaSummaryHeader, { toBRL, getRevenueStatus } from '@/app/components/meta/MetaSummaryCard'
import { buildCalendarDistribution } from '@/app/lib/services/calendarDistribution'
import { getWeekdayVocation } from '@/app/lib/services/weekdayVocation'
import { getMonthlySeasonalityPerformance } from '@/app/lib/services/monthlySeasonalityPerformance'
import { getPeriodRadar } from '@/app/lib/services/periodRadar'
import {
  getExecutionDayCalendar,
  saveExecutionDayCalendar,
} from '@/app/lib/services/executionDayCalendar'
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

function formatDateBR(value: string) {
  if (!value) return '----'

  const [year, month, day] = value.split('-')

  if (!year || !month || !day) return value

  return `${day}/${month}/${year}`
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

  const formatNumber = (value: number) => {
    if (!Number.isFinite(value)) return '—'

    return value.toLocaleString('pt-BR', {
      maximumFractionDigits: 1,
    })
  }

  const actionUnitLabel = isFinancialMode ? 'vendas restantes' : 'ganhos restantes'
  const dailyActionLabel = dailyWorkedRemaining === 1 ? 'oportunidade por dia' : 'oportunidades por dia'
  const remainingDaysLabel = remainingBusinessDays === 1 ? 'dia de execução restante' : 'dias de execução restantes'

  const actionMainText =
    remainingWins <= 0 || remainingWorkedCycles <= 0
      ? `Meta operacional concluída. Mantenha o acompanhamento para preservar o resultado até o fechamento do período.`
      : remainingBusinessDays > 0
        ? `Trabalhar ${formatNumber(dailyWorkedRemaining)} ${dailyActionLabel} nos próximos ${remainingBusinessDays} ${remainingDaysLabel} para buscar ${formatNumber(remainingWins)} ${actionUnitLabel}.`
        : `Não há dias de execução restantes no calendário. Revise o calendário operacional ou reprograme a meta.`

  const actionSupportText =
    remainingWins <= 0 || remainingWorkedCycles <= 0
      ? `O foco agora é sustentar a cadência comercial, evitar perda de oportunidades abertas e proteger o resultado realizado.`
      : dailyWorkedRemaining >= 100
        ? `Ritmo crítico: este volume tende a exigir reforço de base, redistribuição de carteira ou revisão da meta.`
        : dailyWorkedRemaining >= 40
          ? `Ritmo alto: valide capacidade real do time, qualidade da base e cadência de abordagem.`
          : `Ritmo operacionalmente viável se houver disciplina diária de execução e acompanhamento próximo.`

  const statusLabelText = isFinancialMode
    ? onTrack
      ? 'Conversão adequada'
      : 'Conversão abaixo'
    : onTrack
      ? 'Ritmo adequado'
      : 'Ritmo exige atenção'

  const statusColor = onTrack ? '#86efac' : '#fbbf24'
  const statusBackground = onTrack ? 'rgba(34, 197, 94, 0.10)' : 'rgba(245, 158, 11, 0.10)'

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
              ? 'Traduz a meta financeira em vendas necessárias, oportunidades trabalhadas e ritmo diário restante.'
              : 'Mostra se o volume atual de oportunidades trabalhadas sustenta a meta de ganhos no período.'}
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
          title="Oportunidades trabalhadas"
          value={workedCount}
          subtitle="Base comercial já movimentada no período"
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
          title="Oportunidades restantes"
          value={remainingWorkedCycles}
          subtitle="Volume comercial ainda necessário"
          tone={remainingWorkedCycles <= 0 ? 'good' : 'neutral'}
        />
      </div>

      <div
        style={{
          border: `1px solid ${dailyWorkedRemaining >= 100 ? 'rgba(239, 68, 68, 0.28)' : dailyWorkedRemaining >= 40 ? 'rgba(245, 158, 11, 0.28)' : 'rgba(34, 197, 94, 0.22)'}`,
          background:
            dailyWorkedRemaining >= 100
              ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(9, 11, 15, 0.58) 100%)'
              : dailyWorkedRemaining >= 40
                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.11) 0%, rgba(9, 11, 15, 0.58) 100%)'
                : 'linear-gradient(135deg, rgba(34, 197, 94, 0.10) 0%, rgba(9, 11, 15, 0.58) 100%)',
          borderRadius: 16,
          padding: 18,
          display: 'grid',
          gap: 10,
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
                fontSize: 15,
                fontWeight: 950,
                letterSpacing: -0.15,
                lineHeight: 1.25,
              }}
            >
              Ação recomendada
            </div>

            <div
              style={{
                marginTop: 6,
                color: SIMULATOR_UI.textSecondary,
                fontSize: 13.5,
                lineHeight: 1.55,
                maxWidth: 920,
              }}
            >
              {actionMainText}
            </div>
          </div>

          <div
            style={{
              border: `1px solid ${SIMULATOR_UI.borderMuted}`,
              background: 'rgba(9, 11, 15, 0.48)',
              borderRadius: 999,
              padding: '7px 10px',
              color:
                dailyWorkedRemaining >= 100
                  ? '#fca5a5'
                  : dailyWorkedRemaining >= 40
                    ? '#fbbf24'
                    : '#86efac',
              fontSize: 12,
              fontWeight: 900,
              whiteSpace: 'nowrap',
            }}
          >
            {dailyWorkedRemaining >= 100 ? 'Ritmo crítico' : dailyWorkedRemaining >= 40 ? 'Ritmo alto' : 'Ritmo controlável'}
          </div>
        </div>

        <div
          style={{
            color: SIMULATOR_UI.textMuted,
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          {actionSupportText}
        </div>
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
              Oportunidades necessárias
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
              oportunidades por dia de execução
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
          <strong style={{ color: SIMULATOR_UI.textPrimary }}>{neededWorkedCycles} oportunidades trabalhadas</strong> para buscar{' '}
          <strong style={{ color: '#86efac' }}>{targetWins} {unitLabel}</strong>. Ainda restam{' '}
          <strong style={{ color: remainingWorkedCycles > 0 ? '#fbbf24' : '#86efac' }}>
          {remainingWorkedCycles} oportunidades
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
  canEdit,
  calendarSaving,
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
  canEdit: boolean
  calendarSaving: boolean
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
              {canEdit
                ? `Ajuste quais datas contam como dias de execução entre ${formatDateBR(periodStart)} e ${formatDateBR(periodEnd)}.`
                : `Visualize quais datas contam como dias de execução entre ${formatDateBR(periodStart)} e ${formatDateBR(periodEnd)}. Apenas administradores podem alterar este calendário.`}
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
                  {canEdit
                    ? 'Use “Trabalha” para adicionar uma data fora do padrão. Use “Não trabalha” para remover feriado, pausa ou bloqueio.'
                    : 'Calendário em modo de visualização. Solicite a um administrador qualquer ajuste de feriado, pausa ou bloqueio.'}
                </div>
              </div>

              <button
                type="button"
                onClick={onResetAll}
                disabled={!canEdit || calendarSaving || (summary.addedExecutionDays === 0 && summary.removedExecutionDays === 0)}
                title={
                  !canEdit
                    ? 'Apenas administradores podem alterar o calendário operacional.'
                    : calendarSaving
                      ? 'Aguarde o salvamento do calendário.'
                      : undefined
                }
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
                    !canEdit || calendarSaving || (summary.addedExecutionDays === 0 && summary.removedExecutionDays === 0)
                      ? 'not-allowed'
                      : 'pointer',
                  opacity: !canEdit || calendarSaving || (summary.addedExecutionDays === 0 && summary.removedExecutionDays === 0) ? 0.5 : 1,
                }}
              >
                {calendarSaving ? 'Salvando...' : 'Limpar ajustes'}
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
                        disabled={!canEdit || calendarSaving}
                        title={
                          !canEdit
                            ? 'Apenas administradores podem alterar o calendário operacional.'
                            : calendarSaving
                              ? 'Aguarde o salvamento do calendário.'
                              : undefined
                        }
                        style={{
                          height: 28,
                          borderRadius: 9,
                          border: '1px solid rgba(34, 197, 94, 0.24)',
                          background: 'rgba(34, 197, 94, 0.10)',
                          color: '#bbf7d0',
                          fontSize: 11,
                          fontWeight: 850,
                          cursor: canEdit && !calendarSaving ? 'pointer' : 'not-allowed',
                          opacity: canEdit && !calendarSaving ? 1 : 0.45,
                        }}
                      >
                        Trabalha
                      </button>

                      <button
                        type="button"
                        onClick={() => onSetOverride(day.date, false)}
                        disabled={!canEdit || calendarSaving}
                        title={
                          !canEdit
                            ? 'Apenas administradores podem alterar o calendário operacional.'
                            : calendarSaving
                              ? 'Aguarde o salvamento do calendário.'
                              : undefined
                        }
                        style={{
                          height: 28,
                          borderRadius: 9,
                          border: '1px solid rgba(239, 68, 68, 0.24)',
                          background: 'rgba(239, 68, 68, 0.10)',
                          color: '#fecaca',
                          fontSize: 11,
                          fontWeight: 850,
                          cursor: canEdit && !calendarSaving ? 'pointer' : 'not-allowed',
                          opacity: canEdit && !calendarSaving ? 1 : 0.45,
                        }}
                      >
                        Não trabalha
                      </button>
                    </div>

                    {hasOverride ? (
                      <button
                        type="button"
                        onClick={() => onClearOverride(day.date)}
                        disabled={!canEdit || calendarSaving}
                        title={
                          !canEdit
                            ? 'Apenas administradores podem alterar o calendário operacional.'
                            : calendarSaving
                              ? 'Aguarde o salvamento do calendário.'
                              : undefined
                        }
                        style={{
                          height: 28,
                          borderRadius: 9,
                          border: `1px solid ${SIMULATOR_UI.borderMuted}`,
                          background: 'rgba(15, 18, 26, 0.78)',
                          color: SIMULATOR_UI.textMuted,
                          fontSize: 11,
                          fontWeight: 850,
                          cursor: canEdit && !calendarSaving ? 'pointer' : 'not-allowed',
                          opacity: canEdit && !calendarSaving ? 1 : 0.45,
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
  calendarSaving,
  calendarSaveError,
  calendarSaveSuccess,
  onOpenCalendar,
}: {
  summary: ReturnType<typeof getExecutionCalendarSummary>
  totalDays: number
  hasOverrides: boolean
  calendarSaving: boolean
  calendarSaveError: string | null
  calendarSaveSuccess: string | null
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

          {calendarSaving || calendarSaveError || calendarSaveSuccess ? (
            <div
              style={{
                border: `1px solid ${
                  calendarSaveError
                    ? 'rgba(239, 68, 68, 0.28)'
                    : calendarSaving
                      ? 'rgba(245, 158, 11, 0.28)'
                      : 'rgba(34, 197, 94, 0.24)'
                }`,
                background: calendarSaveError
                  ? 'rgba(239, 68, 68, 0.10)'
                  : calendarSaving
                    ? 'rgba(245, 158, 11, 0.10)'
                    : 'rgba(34, 197, 94, 0.10)',
                color: calendarSaveError
                  ? '#fca5a5'
                  : calendarSaving
                    ? '#fbbf24'
                    : '#bbf7d0',
                borderRadius: 999,
                padding: '7px 10px',
                fontSize: 11.5,
                fontWeight: 850,
                whiteSpace: 'nowrap',
              }}
              title={calendarSaveError ?? calendarSaveSuccess ?? undefined}
            >
              {calendarSaveError
                ? 'Erro ao salvar calendário'
                : calendarSaving
                  ? 'Salvando calendário...'
                  : calendarSaveSuccess}
            </div>
          ) : null}

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
  disabled = false,
}: {
  active: boolean
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Apenas administradores podem alterar os dias padrão de execução.' : undefined}
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
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  )
}

function DecisionCommandPanel({
  revenueKpis,
  result,
  targetWins,
  remainingBusinessDays,
  taxaUsadaNoCalculo,
  activeTab,
  setActiveTab,
  showRevenueMode,
  goalContextLabel,
  canEditGoal,
}: {
  revenueKpis: DecisionRevenueKpis | null
  result: SimulatorResult | null
  targetWins: number
  remainingBusinessDays: number
  taxaUsadaNoCalculo: number
  activeTab: 'teoria' | 'evolucao' | 'taxa-resultado' | 'funil' | 'distribuicao'
  setActiveTab: (value: 'teoria' | 'evolucao' | 'taxa-resultado' | 'funil' | 'distribuicao') => void
  showRevenueMode: boolean
  goalContextLabel: string
  canEditGoal: boolean
}) {
  const goal = revenueKpis?.goal ?? 0
  const totalReal = revenueKpis?.totalReal ?? 0
  const gap = revenueKpis?.gap ?? 0
  const requiredPerDay = revenueKpis?.required_per_business_day ?? 0

  const remainingWins = result?.remaining_wins ?? 0
  const remainingOpportunities = result?.remaining_worked_cycles ?? 0
  const dailyOpportunities = result?.daily_worked_remaining ?? 0

  const hasGoal = goal > 0
  const goalReached = hasGoal && gap <= 0
  const progressPct = hasGoal
    ? Math.max(0, Math.min(100, Math.round((totalReal / goal) * 100)))
    : 0

  const isCritical = hasGoal && !goalReached && (dailyOpportunities >= 100 || remainingBusinessDays <= 2)
  const isHigh = hasGoal && !goalReached && !isCritical && dailyOpportunities >= 40

  const decisionTone = !hasGoal
    ? 'neutral'
    : goalReached
      ? 'good'
      : isCritical
        ? 'critical'
        : isHigh
          ? 'warning'
          : 'good'

  const decisionLabel =
    decisionTone === 'critical'
      ? 'Ritmo crítico'
      : decisionTone === 'warning'
        ? 'Acelerar'
        : decisionTone === 'good'
          ? goalReached
            ? 'Meta atingida'
            : 'Ritmo controlável'
          : 'Meta pendente'

  const decisionColor =
    decisionTone === 'critical'
      ? '#fca5a5'
      : decisionTone === 'warning'
        ? '#fbbf24'
        : decisionTone === 'good'
          ? '#86efac'
          : SIMULATOR_UI.textMuted

  const decisionBorder =
    decisionTone === 'critical'
      ? 'rgba(239, 68, 68, 0.30)'
      : decisionTone === 'warning'
        ? 'rgba(245, 158, 11, 0.28)'
        : decisionTone === 'good'
          ? 'rgba(34, 197, 94, 0.24)'
          : SIMULATOR_UI.borderMuted

  const decisionBackground =
    decisionTone === 'critical'
      ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.14) 0%, rgba(9, 11, 15, 0.70) 100%)'
      : decisionTone === 'warning'
        ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(9, 11, 15, 0.70) 100%)'
        : decisionTone === 'good'
          ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.10) 0%, rgba(9, 11, 15, 0.70) 100%)'
          : 'linear-gradient(135deg, rgba(59, 130, 246, 0.10) 0%, rgba(9, 11, 15, 0.70) 100%)'

  const mainCommand =
    !hasGoal
      ? canEditGoal
        ? 'Defina uma meta para liberar a recomendação operacional do período.'
        : `${goalContextLabel} ainda não definida. Solicite ao gestor a definição da meta para liberar a recomendação operacional.`
      : goalReached
        ? 'Meta atingida. Mantenha o acompanhamento para preservar o resultado até o fechamento do período.'
        : remainingBusinessDays <= 0
          ? 'Não há dias de execução restantes. Revise o calendário operacional ou reprograme a meta.'
          : `Trabalhar ${dailyOpportunities.toLocaleString('pt-BR')} oportunidades por dia nos próximos ${remainingBusinessDays} dias de execução para buscar ${remainingWins.toLocaleString('pt-BR')} vendas restantes.`

  const supportCommand =
    !hasGoal
      ? 'Sem meta cadastrada, o simulador não consegue calcular gap, ritmo diário e esforço necessário.'
      : goalReached
        ? 'O foco agora é proteger as oportunidades abertas, evitar perdas e manter cadência de acompanhamento.'
        : isCritical
          ? 'Ritmo crítico: a decisão gerencial é reforçar base, redistribuir carteira, aumentar cadência ou revisar a meta.'
          : isHigh
            ? 'Ritmo alto: valide capacidade real do time, qualidade da base e consistência da abordagem diária.'
            : 'Ritmo operacionalmente viável se houver disciplina diária de execução e acompanhamento próximo.'

  const decisionButtonStyle = (active: boolean): React.CSSProperties => ({
    height: 34,
    borderRadius: 999,
    border: active
      ? '1px solid rgba(96, 165, 250, 0.46)'
      : `1px solid ${SIMULATOR_UI.borderMuted}`,
    background: active
      ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.32), rgba(30, 64, 175, 0.20))'
      : 'rgba(9, 11, 15, 0.44)',
    color: active ? '#dbeafe' : SIMULATOR_UI.textSecondary,
    padding: '0 12px',
    fontSize: 12,
    fontWeight: 850,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })

  return (
    <section
      style={{
        border: `1px solid ${decisionBorder}`,
        background: decisionBackground,
        borderRadius: 20,
        padding: 18,
        display: 'grid',
        gap: 16,
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255,255,255,0.035)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 14,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: SIMULATOR_UI.textSubtle,
              fontSize: 11,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 7,
            }}
          >
            Painel de decisão
          </div>

          <div
            style={{
              color: SIMULATOR_UI.textPrimary,
              fontSize: 21,
              fontWeight: 950,
              letterSpacing: -0.45,
              lineHeight: 1.18,
            }}
          >
            {mainCommand}
          </div>

          <div
            style={{
              marginTop: 8,
              color: SIMULATOR_UI.textMuted,
              fontSize: 13.5,
              lineHeight: 1.55,
              maxWidth: 980,
            }}
          >
            {supportCommand}
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${decisionColor}33`,
            background: `${decisionColor}14`,
            color: decisionColor,
            borderRadius: 999,
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 950,
            whiteSpace: 'nowrap',
          }}
        >
          {decisionLabel}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 10,
        }}
      >
        <div
          style={{
            border: `1px solid ${SIMULATOR_UI.borderMuted}`,
            background: 'rgba(9, 11, 15, 0.44)',
            borderRadius: 14,
            padding: '12px 13px',
          }}
        >
          <div style={{ color: SIMULATOR_UI.textSubtle, fontSize: 11.5, fontWeight: 850 }}>
            Falta para meta
          </div>
          <div style={{ marginTop: 6, color: '#fca5a5', fontSize: 20, fontWeight: 950 }}>
            {hasGoal ? toBRL(gap) : '—'}
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${SIMULATOR_UI.borderMuted}`,
            background: 'rgba(9, 11, 15, 0.44)',
            borderRadius: 14,
            padding: '12px 13px',
          }}
        >
          <div style={{ color: SIMULATOR_UI.textSubtle, fontSize: 11.5, fontWeight: 850 }}>
            Ritmo financeiro
          </div>
          <div style={{ marginTop: 6, color: '#fbbf24', fontSize: 20, fontWeight: 950 }}>
            {hasGoal ? toBRL(requiredPerDay) : '—'}
          </div>
          <div style={{ marginTop: 3, color: SIMULATOR_UI.textSubtle, fontSize: 11.5 }}>
            por dia de execução
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${SIMULATOR_UI.borderMuted}`,
            background: 'rgba(9, 11, 15, 0.44)',
            borderRadius: 14,
            padding: '12px 13px',
          }}
        >
          <div style={{ color: SIMULATOR_UI.textSubtle, fontSize: 11.5, fontWeight: 850 }}>
            Vendas restantes
          </div>
          <div style={{ marginTop: 6, color: '#fca5a5', fontSize: 20, fontWeight: 950 }}>
            {remainingWins.toLocaleString('pt-BR')}
          </div>
          <div style={{ marginTop: 3, color: SIMULATOR_UI.textSubtle, fontSize: 11.5 }}>
            meta estimada: {targetWins.toLocaleString('pt-BR')}
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${SIMULATOR_UI.borderMuted}`,
            background: 'rgba(9, 11, 15, 0.44)',
            borderRadius: 14,
            padding: '12px 13px',
          }}
        >
          <div style={{ color: SIMULATOR_UI.textSubtle, fontSize: 11.5, fontWeight: 850 }}>
            Oportunidades restantes
          </div>
          <div style={{ marginTop: 6, color: SIMULATOR_UI.textPrimary, fontSize: 20, fontWeight: 950 }}>
            {remainingOpportunities.toLocaleString('pt-BR')}
          </div>
          <div style={{ marginTop: 3, color: SIMULATOR_UI.textSubtle, fontSize: 11.5 }}>
            conversão usada: {pct(taxaUsadaNoCalculo)}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 8,
        }}
      >
        <div
          style={{
            height: 7,
            borderRadius: 999,
            overflow: 'hidden',
            background: 'rgba(148, 163, 184, 0.12)',
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              background: decisionColor,
              borderRadius: 999,
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            color: SIMULATOR_UI.textSubtle,
            fontSize: 12,
            fontWeight: 750,
          }}
        >
          <span>Progresso financeiro: {progressPct}%</span>
          <span>
            Realizado {hasGoal ? toBRL(totalReal) : '—'} de {hasGoal ? toBRL(goal) : '—'}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('distribuicao')}
          style={decisionButtonStyle(activeTab === 'distribuicao')}
        >
          Abrir agenda de execução
        </button>

        {showRevenueMode ? (
          <button
            type="button"
            onClick={() => setActiveTab('evolucao')}
            style={decisionButtonStyle(activeTab === 'evolucao')}
          >
            Ver evolução
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setActiveTab('teoria')}
          style={decisionButtonStyle(activeTab === 'teoria')}
        >
          Ver cálculo do plano
        </button>
      </div>
    </section>
  )
}

function SimulatorTopControls({
  isAdmin,
  sellers,
  companyName,
  selectedSellerId,
  setSelectedSellerId,
  sellerGoalScope,
  setSellerGoalScope,
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
  companyName: string
  selectedSellerId: string | null
  setSelectedSellerId: (value: string | null) => void
  sellerGoalScope: 'company' | 'mine'
  setSellerGoalScope: (value: 'company' | 'mine') => void
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

  const normalizedCompanyName = String(companyName ?? '').trim()

  const companyScopeLabel =
    normalizedCompanyName && normalizedCompanyName.toLowerCase() !== 'empresa sem nome'
      ? normalizedCompanyName
      : 'Meta da empresa'

  const selectedScopeLabel = isAdmin
    ? selectedSellerId
      ? sellers.find((seller) => seller.id === selectedSellerId)?.label ?? 'Vendedor selecionado'
      : companyScopeLabel
    : sellerGoalScope === 'mine'
      ? 'Minha meta'
      : companyScopeLabel

  const modeLabel =
    mode === 'faturamento'
      ? 'Faturamento'
      : mode === 'recebimento'
        ? 'Recebimento'
        : 'Ganhos'

  const formattedGoalValue = safeNumber(revenueGoalInputText).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })

  const formattedPeriodStart = formatDateBR(periodStart)
  const formattedPeriodEnd = formatDateBR(periodEnd)

  const scenarioSummary = `${selectedScopeLabel} · ${modeLabel} · ${formattedPeriodStart} até ${formattedPeriodEnd} · Meta ${formattedGoalValue}`

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
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: SIMULATOR_UI.textSecondary,
              fontSize: 13,
              fontWeight: 850,
              letterSpacing: -0.1,
              lineHeight: 1.2,
            }}
          >
            Cenário da simulação
          </div>

          <div
            style={{
              marginTop: 5,
              color: SIMULATOR_UI.textMuted,
              fontSize: 12.5,
              lineHeight: 1.4,
              maxWidth: 760,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={scenarioSummary}
          >
            {scenarioSummary}
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${SIMULATOR_UI.borderMuted}`,
            background: 'rgba(59, 130, 246, 0.10)',
            borderRadius: 999,
            padding: '6px 10px',
            color: '#bfdbfe',
            fontSize: 12,
            fontWeight: 850,
            whiteSpace: 'nowrap',
          }}
        >
          {remainingBusinessDays} dias de execução restantes
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
              <option value="empresa">{companyScopeLabel}</option>
              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.label}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={sellerGoalScope}
              onChange={(event) => setSellerGoalScope(event.target.value as 'company' | 'mine')}
              style={controlBaseStyle()}
            >
              <option value="company">{companyScopeLabel}</option>
              <option value="mine">Minha meta</option>
            </select>
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
                Ticket médio, taxa de conversão e calendário de execução.
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
              Ajustar parâmetros
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
                    disabled={!isAdmin}
                    onClick={() => {
                      if (!isAdmin) return

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
  [key: string]: unknown
}) {
  const hasPlan = theory10020Result !== null
  const rateSourceLabel = rateSource === 'real' ? 'Taxa real' : 'Taxa planejada'
  const rateSourceDescription =
    rateSource === 'real'
      ? 'Usa o histórico comercial carregado para calcular o esforço necessário.'
      : 'Usa a taxa informada manualmente para projetar o esforço necessário.'

  const calendarStatus =
    remainingBusinessDays > 0
      ? `${remainingBusinessDays} ${remainingBusinessDays === 1 ? 'dia útil restante' : 'dias úteis restantes'}`
      : 'Sem dias úteis restantes'

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          border: `1px solid ${SIMULATOR_UI.borderMuted}`,
          background:
            'linear-gradient(135deg, rgba(59, 130, 246, 0.10) 0%, rgba(13, 15, 20, 0.96) 42%, rgba(9, 11, 15, 0.98) 100%)',
          borderRadius: 18,
          padding: 18,
          display: 'grid',
          gap: 14,
          boxShadow: '0 16px 42px rgba(0, 0, 0, 0.24)',
        }}
      >
        <div>
          <div
            style={{
              color: SIMULATOR_UI.textPrimary,
              fontSize: 17,
              fontWeight: 950,
              letterSpacing: -0.25,
              lineHeight: 1.2,
            }}
          >
            Plano de execução da meta
          </div>

          <div
            style={{
              marginTop: 6,
              color: SIMULATOR_UI.textMuted,
              fontSize: 13.5,
              lineHeight: 1.5,
              maxWidth: 880,
            }}
          >
            Este painel transforma a meta em leitura operacional: fonte da taxa, disponibilidade
            do calendário e condição atual do cálculo.
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
            title="Cálculo do plano"
            value={hasPlan ? 'Ativo' : 'Pendente'}
            subtitle={
              hasPlan
                ? 'A simulação 100/20 está disponível para orientar a execução.'
                : 'Informe os dados da meta para gerar o plano operacional.'
            }
            tone={hasPlan ? 'good' : 'bad'}
          />

          <Card title="Fonte da taxa" value={rateSourceLabel} subtitle={rateSourceDescription} />

          <Card
            title="Calendário operacional"
            value={calendarStatus}
            subtitle="Base usada para calcular a pressão diária de execução."
            tone={remainingBusinessDays > 0 ? 'neutral' : 'bad'}
          />

          <Card
            title="Histórico comercial"
            value={rateRealData ? 'Carregado' : 'Indisponível'}
            subtitle={
              rateRealData
                ? 'A taxa real pode ser usada como referência de performance.'
                : 'Sem histórico carregado para esta leitura.'
            }
            tone={rateRealData ? 'good' : 'neutral'}
          />
        </div>

        <div
          style={{
            border: `1px solid ${SIMULATOR_UI.borderMuted}`,
            background: 'rgba(9, 11, 15, 0.46)',
            borderRadius: 16,
            padding: 16,
            color: SIMULATOR_UI.textSecondary,
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          {hasPlan
            ? 'Use este plano como referência de cadência. Se o ritmo diário ficar pesado, a decisão executiva correta é revisar capacidade, base disponível, taxa usada ou prazo de execução.'
            : 'O plano ainda não tem dados suficientes para leitura executiva. O próximo passo é preencher meta, ticket médio, taxa e calendário operacional.'}
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
  const [calendarSaving, setCalendarSaving] = useState(false)
  const [calendarSaveError, setCalendarSaveError] = useState<string | null>(null)
  const [calendarSaveSuccess, setCalendarSaveSuccess] = useState<string | null>(null)
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
  const [sellerGoalScope, setSellerGoalScope] = useState<'company' | 'mine'>('company')
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
  const [companyName, setCompanyName] = useState('Meta da empresa')

  // Plano de execução da meta
  const [ticketMedioText, setTicketMedioText] = useState<string>('5000')
  const [theory10020Result, setTheory10020Result] = useState<Theory10020Result | null>(null)

  // Rate source: 'real' uses historical vendor rate, 'planejada' uses closeRatePercent
  const [rateSource, setRateSource] = useState<'real' | 'planejada'>('planejada')

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'teoria' | 'evolucao' | 'taxa-resultado' | 'funil' | 'distribuicao'>('taxa-resultado')

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

        if (profile.company_id) {
          const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .select('trade_name, name, legal_name')
            .eq('id', profile.company_id)
            .maybeSingle()

          if (companyError) {
            console.warn('Erro ao carregar nome da empresa:', companyError.message)
            setCompanyName('Meta da empresa')
          } else {
            setCompanyName(
              companyData?.trade_name ||
                companyData?.name ||
                companyData?.legal_name ||
                'Meta da empresa',
            )
          }
        } else {
          setCompanyName('Meta da empresa')
        }

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

  const analysisOwnerId = useMemo(() => {
    if (isAdmin) return selectedSellerId

    return sellerGoalScope === 'mine' ? selectedSellerId : null
  }, [isAdmin, selectedSellerId, sellerGoalScope])

  // taxa real
  useEffect(() => {
    async function loadRateReal() {
      setRateRealLoading(true)
      try {
        const data = await getCloseRateReal(analysisOwnerId, daysWindow)
        setRateRealData(data)
      } catch (e: unknown) {
        console.warn('Erro ao carregar taxa real:', getErrorMessage(e, 'Erro desconhecido.'))
        setRateRealData(null)
      } finally {
        setRateRealLoading(false)
      }
    }
    if (competency) void loadRateReal()
  }, [analysisOwnerId, daysWindow, competency])

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

  // refetch metrics quando muda escopo ou período
  useEffect(() => {
    if (!periodStart) return

    async function refetch() {
      try {
        const newMetrics = await getSalesCycleMetrics(analysisOwnerId, periodStart)
        setMetrics(newMetrics)
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Erro ao atualizar métricas.'))
      }
    }

    void refetch()
  }, [periodStart, analysisOwnerId])

  // conversão por grupo
  useEffect(() => {
    if (!periodStart || !periodEnd || !companyId) return

    const cid = companyId

    async function loadGroupConversion() {
      setGroupConversionLoading(true)
      try {
        const rows = await getGroupConversion({
          companyId: cid,
          ownerId: analysisOwnerId,
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
  }, [periodStart, periodEnd, analysisOwnerId, companyId])

  const revenueDates = useMemo(() => {
    if (!periodStart || !periodEnd) return { start: '', end: '' }
    return {
      start: periodStart,
      end: periodEnd,
    }
  }, [periodStart, periodEnd])

  const revenueGoalOwnerId = useMemo(() => {
    if (!competency) return null

    return analysisOwnerId
  }, [analysisOwnerId, competency])

  const revenueGoalContextLabel = useMemo(() => {
    if (!isAdmin) {
      return sellerGoalScope === 'mine' ? 'Minha meta' : 'Meta da empresa'
    }

    return revenueGoalOwnerId ? 'Meta do vendedor' : 'Meta da empresa'
  }, [isAdmin, revenueGoalOwnerId, sellerGoalScope])

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

  // Plano de execução — recalcular quando inputs mudam
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

    const scopedTotalReal = analysisOwnerId
      ? Number(revenueSeller?.total_real || 0)
      : Number(revenueCompany?.total_real || 0)

    const result = calculateTheory10020({
      meta_total: activeGoalForKpis,
      ticket_medio: ticketValue,
      close_rate: taxaUsadaNoCalculo,
      remaining_business_days: remainingBusinessDays,
      total_real: scopedTotalReal,
    })
    setTheory10020Result(result)
  }, [mode, ticketMedioText, ticketSource, historicalTicket, activeGoalForKpis, taxaUsadaNoCalculo, remainingBusinessDays, revenueSeller, revenueCompany, analysisOwnerId])

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
          ownerId: analysisOwnerId,
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
  }, [companyId, competency, mode, analysisOwnerId])

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
            ownerId: analysisOwnerId,
            dateStart: histStart,
            dateEnd: histEnd,
          }),
          getMonthlySeasonalityPerformance({
            companyId: cid,
            ownerId: analysisOwnerId,
            dateStart: histStart,
            dateEnd: histEnd,
          }),
          getPeriodRadar({
            companyId: cid,
            ownerId: analysisOwnerId,
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

        const todayKey = dateKey(new Date())
        const distributionDateStart = todayKey > dateStart ? todayKey : dateStart
        const safeDistributionDateStart = distributionDateStart > dateEnd ? dateEnd : distributionDateStart

        const safeDistributionRate = Math.max(0.01, taxaUsadaNoCalculo)

        const totalLeadsForDist = theory10020Result?.ciclos_restantes
          ?? result?.remaining_worked_cycles
          ?? Math.ceil(targetWins / safeDistributionRate)

        const totalWinsForDist = theory10020Result?.vendas_restantes
          ?? result?.remaining_wins
          ?? targetWins

        const dist = buildCalendarDistribution(
          {
            dateStart: safeDistributionDateStart,
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
    analysisOwnerId,
    targetWins,
    taxaUsadaNoCalculo,
    workDays,
    executionDayOverrides,
    result?.remaining_worked_cycles,
    result?.remaining_wins,
    theory10020Result?.ciclos_restantes,
    theory10020Result?.vendas_restantes,
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

        const shouldLoadCompanyRevenue = isAdmin || analysisOwnerId === null

        if (shouldLoadCompanyRevenue) {
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

        const ownerIdForSeller = analysisOwnerId
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
  }, [mode, competency, companyId, isAdmin, analysisOwnerId, revenueDates.start, revenueDates.end])

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
  
      if (analysisOwnerId) {
        return revenueSellerKpis
      }
  
      return revenueCompanyKpis
    }, [showRevenueMode, analysisOwnerId, revenueSellerKpis, revenueCompanyKpis])
  
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

    useEffect(() => {
      if (!companyId || !periodStart || !periodEnd) {
        setWorkDays(defaultWorkDays())
        setExecutionDayOverrides({})
        setCalendarSaveError(null)
        setCalendarSaveSuccess(null)
        return
      }
  
      let cancelled = false
  
      async function loadExecutionDayCalendar() {
        try {
          const record = await getExecutionDayCalendar({
            companyId: companyId!,
            periodStart,
            periodEnd,
          })
  
          if (cancelled) return
  
          setWorkDays(record?.work_days ?? defaultWorkDays())
          setExecutionDayOverrides(record?.execution_day_overrides ?? {})
        } catch (error) {
          if (cancelled) return
  
          console.warn('Erro ao carregar calendário operacional do Supabase:', getErrorMessage(error, 'Erro desconhecido.'))
          setExecutionDayOverrides({})
        }
      }
  
      void loadExecutionDayCalendar()
  
      return () => {
        cancelled = true
      }
    }, [companyId, periodStart, periodEnd])
  
    async function persistExecutionCalendar(
      nextOverrides: ExecutionDayOverrides,
      nextWorkDays: WorkDays = workDays,
    ) {
      if (!companyId || !periodStart || !periodEnd) {
        setCalendarSaveError('Calendário operacional não salvo: empresa ou período ausente.')
        setCalendarSaveSuccess(null)
        console.warn('Calendário operacional não salvo: empresa ou período ausente.')
        return
      }
  
      setCalendarSaving(true)
      setCalendarSaveError(null)
      setCalendarSaveSuccess(null)
  
      try {
        await saveExecutionDayCalendar({
          companyId,
          periodStart,
          periodEnd,
          workDays: nextWorkDays,
          executionDayOverrides: nextOverrides,
        })
  
        setCalendarSaveSuccess('Calendário salvo')
  
        window.setTimeout(() => {
          setCalendarSaveSuccess(null)
        }, 2500)
      } catch (error) {
        const message = getErrorMessage(error, 'Erro desconhecido.')
        setCalendarSaveError(message)
        setCalendarSaveSuccess(null)
        console.warn('Erro ao salvar calendário operacional no Supabase:', message)
      } finally {
        setCalendarSaving(false)
      }
    }

    function handleSetWorkDays(nextValue: React.SetStateAction<WorkDays>) {
      if (calendarSaving) return

      setWorkDays((current) => {
        const next =
          typeof nextValue === 'function'
            ? (nextValue as (value: WorkDays) => WorkDays)(current)
            : nextValue
  
        void persistExecutionCalendar(executionDayOverrides, next)
  
        return next
      })
    }
  
    const hasExecutionDayOverrides = Object.keys(executionDayOverrides).length > 0

    function handleSetExecutionDayOverride(date: string, value: boolean) {
      if (calendarSaving) return
  
      setExecutionDayOverrides((current) => {
        const next = {
          ...current,
          [date]: value,
        }
  
        void persistExecutionCalendar(next, workDays)
  
        return next
      })
    }
  
    function handleClearExecutionDayOverride(date: string) {
      if (calendarSaving) return
  
      setExecutionDayOverrides((current) => {
        const next = { ...current }
        delete next[date]
  
        void persistExecutionCalendar(next, workDays)
  
        return next
      })
    }
  
    function handleResetExecutionDayOverrides() {
      if (calendarSaving) return
  
      setExecutionDayOverrides({})
      void persistExecutionCalendar({}, workDays)
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

  const showCompanyChart = showRevenueMode && analysisOwnerId === null
  const showSellerChart = showRevenueMode && analysisOwnerId !== null

  return (
    <div style={{ maxWidth: 1200, marginLeft: 'auto', marginRight: 'auto', padding: '0 0 40px' }}>

<SimulatorTopControls
        isAdmin={isAdmin}
        sellers={sellers}
        companyName={companyName}
        selectedSellerId={selectedSellerId}
        setSelectedSellerId={setSelectedSellerId}
        sellerGoalScope={sellerGoalScope}
        setSellerGoalScope={setSellerGoalScope}
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
        setWorkDays={handleSetWorkDays}
        autoRemainingDays={autoRemainingDays}
        setAutoRemainingDays={setAutoRemainingDays}
        remainingBusinessDays={remainingBusinessDays}
      />

<ExecutionCalendarSummaryStrip
        summary={executionCalendarSummary}
        totalDays={executionCalendarDays.length}
        hasOverrides={hasExecutionDayOverrides}
        calendarSaving={calendarSaving}
        calendarSaveError={calendarSaveError}
        calendarSaveSuccess={calendarSaveSuccess}
        onOpenCalendar={() => setExecutionCalendarOpen(true)}
      />

      <DecisionCommandPanel
        revenueKpis={decisionRevenueKpis}
        result={ratePanelResult}
        targetWins={ratePanelTargetWins}
        remainingBusinessDays={remainingBusinessDays}
        taxaUsadaNoCalculo={taxaUsadaNoCalculo}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        showRevenueMode={showRevenueMode}
        goalContextLabel={revenueGoalContextLabel}
        canEditGoal={isAdmin}
      />

      <ExecutionCalendarModal
        open={executionCalendarOpen}
        periodStart={periodStart}
        periodEnd={periodEnd}
        days={executionCalendarDays}
        summary={executionCalendarSummary}
        canEdit={isAdmin}
        calendarSaving={calendarSaving}
        onClose={() => setExecutionCalendarOpen(false)}
        onSetOverride={handleSetExecutionDayOverride}
        onClearOverride={handleClearExecutionDayOverride}
        onResetAll={handleResetExecutionDayOverrides}
      />


<ExecutionCalendarModal
        open={executionCalendarOpen}
        periodStart={periodStart}
        periodEnd={periodEnd}
        days={executionCalendarDays}
        summary={executionCalendarSummary}
        canEdit={isAdmin}
        calendarSaving={calendarSaving}
        onClose={() => setExecutionCalendarOpen(false)}
        onSetOverride={handleSetExecutionDayOverride}
        onClearOverride={handleClearExecutionDayOverride}
        onResetAll={handleResetExecutionDayOverrides}
      />


      {/* ================================================================ */}
      {/* TAB NAVIGATION                                                    */}
      {/* ================================================================ */}

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
          onClick={() => setActiveTab('taxa-resultado')}
          style={tabStyle(activeTab === 'taxa-resultado')}
        >
          Ritmo necessário
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('distribuicao')}
          style={tabStyle(activeTab === 'distribuicao')}
        >
          Plano diário
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
          onClick={() => setActiveTab('funil')}
          style={tabStyle(activeTab === 'funil')}
        >
          Funil do Período
        </button>

        {showRevenueMode ? (
          <button
          type="button"
          onClick={() => setActiveTab('teoria')}
          style={tabStyle(activeTab === 'teoria')}
        >
          Plano de Execução
        </button>
        ) : null}
      </div>

      {/* ================================================================ */}
      {/* TAB CONTENT                                                       */}
      {/* ================================================================ */}
      <div style={{ display: 'grid', gap: 16 }}>

        {/* ============================================================ */}
        {/* ABA 5: PLANO DE EXECUÇÃO                                      */}
        {/* ============================================================ */}
        {activeTab === 'teoria' && (
          mode === 'faturamento' ? (
            <Section
              title={
                <TitleWithTip label="Plano de Execução" tipTitle="Como o plano é calculado?" width={480}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div>
                      O plano cruza a meta financeira, o ticket médio e a taxa de conversão para estimar o volume de oportunidades que precisa ser trabalhado.
                    </div>
                    <div>
                      A lógica transforma a meta em leads necessários, fechamentos esperados e cadência diária de execução.
                    </div>
                  </div>
                </TitleWithTip>
              }
              description="Transforma a meta financeira em volume de oportunidades, fechamentos esperados e cadência diária de execução."
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
              Plano de Execução disponível apenas no modo Faturamento.
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
        {/* ABA 1: RITMO NECESSÁRIO                                      */}
        {/* ============================================================ */}
        {activeTab === 'taxa-resultado' && (
          <Section
          title="Ritmo necessário"
          description="Resumo executivo do esforço restante, taxa de conversão, vendas necessárias e ritmo diário até o fim do período."
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
              description="Distribuição compacta das oportunidades por estágio no período selecionado."
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
        {/* ABA 2: PLANO DIÁRIO                                           */}
        {/* ============================================================ */}
        {activeTab === 'distribuicao' && (
          <div style={{ display: 'grid', gap: 16 }}>

<Section
            title="Distribuição do saldo restante"
            description="Plano diário calculado a partir do calendário operacional, histórico disponível e carga necessária até o fim do período."
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
                    {distribution.summary.total_working_days} dias de execução · {formatDateBR(distribution.period_start)} até {formatDateBR(distribution.period_end)}
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
