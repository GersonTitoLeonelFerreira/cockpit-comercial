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

function safeNumber(v: any) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  const n = parseFloat(s || '0')
  return Number.isFinite(n) ? n : 0
}

// ============================
// Dias trabalhados
// ============================

// 0=Dom,1=Seg,...6=Sáb
type WorkDays = Record<number, boolean>

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

function countRemainingWorkDays(endDate: Date, workDays: WorkDays): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  endDate.setHours(0, 0, 0, 0)

  if (endDate < today) return 0

  let count = 0
  const cur = new Date(today)
  while (cur <= endDate) {
    const dow = cur.getDay()
    if (workDays[dow]) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function countWorkDaysInRange(start: string, end: string, workDays: WorkDays): number {
  const s = new Date(toYMD(start) + 'T00:00:00')
  const e = new Date(toYMD(end) + 'T00:00:00')
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)

  if (e < s) return 0

  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const dow = cur.getDay()
    if (workDays[dow]) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function countWorkDaysUntilToday(start: string, end: string, workDays: WorkDays): number {
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
    const dow = cur.getDay()
    if (workDays[dow]) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
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
    padding: '9px 16px',
    background: isActive
      ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.20) 0%, rgba(59, 130, 246, 0.08) 100%)'
      : 'rgba(13, 15, 20, 0.42)',
    color: isActive ? '#bfdbfe' : SIMULATOR_UI.textMuted,
    border: isActive
      ? '1px solid rgba(59, 130, 246, 0.36)'
      : `1px solid ${SIMULATOR_UI.borderMuted}`,
    borderRadius: 999,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: isActive ? 800 : 650,
    lineHeight: 1,
    transition: 'background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease',
    boxShadow: isActive ? '0 8px 22px rgba(59, 130, 246, 0.12)' : 'none',
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
    height: 38,
    borderRadius: 12,
    border: `1px solid ${SIMULATOR_UI.borderSoft}`,
    background: 'rgba(9, 11, 15, 0.72)',
    color: SIMULATOR_UI.textPrimary,
    padding: '0 12px',
    fontSize: 13,
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
        height: 38,
        borderRadius: 12,
        border:
          tone === 'primary'
            ? '1px solid rgba(59, 130, 246, 0.45)'
            : `1px solid ${SIMULATOR_UI.borderSoft}`,
        background:
          tone === 'primary'
            ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.26) 0%, rgba(59, 130, 246, 0.12) 100%)'
            : 'rgba(15, 18, 26, 0.78)',
        color: tone === 'primary' ? '#bfdbfe' : SIMULATOR_UI.textSecondary,
        padding: '0 14px',
        fontSize: 13,
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
        height: 38,
        border: active
          ? '1px solid rgba(59, 130, 246, 0.48)'
          : `1px solid ${SIMULATOR_UI.borderMuted}`,
        background: active
          ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.26) 0%, rgba(59, 130, 246, 0.10) 100%)'
          : 'rgba(9, 11, 15, 0.52)',
        color: active ? '#dbeafe' : SIMULATOR_UI.textMuted,
        borderRadius: 999,
        padding: '0 14px',
        fontSize: 13,
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
        marginBottom: 18,
        border: `1px solid ${SIMULATOR_UI.borderSoft}`,
        background:
          'linear-gradient(135deg, rgba(18, 22, 33, 0.90) 0%, rgba(9, 11, 15, 0.98) 100%)',
        borderRadius: 22,
        padding: 20,
        boxShadow:
          '0 16px 40px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255,255,255,0.035)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              color: SIMULATOR_UI.textPrimary,
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: -0.45,
              lineHeight: 1.15,
            }}
          >
            Simulador de Meta
          </h1>

          <p
            style={{
              margin: '7px 0 0',
              color: SIMULATOR_UI.textMuted,
              fontSize: 13,
              lineHeight: 1.45,
              maxWidth: 720,
            }}
          >
            Configure o cenário principal e acompanhe o esforço necessário para bater a meta.
          </p>
        </div>

        <div
          style={{
            border: `1px solid ${SIMULATOR_UI.borderMuted}`,
            background: 'rgba(9, 11, 15, 0.62)',
            borderRadius: 999,
            padding: '8px 12px',
            color: SIMULATOR_UI.textSecondary,
            fontSize: 12,
            fontWeight: 750,
            whiteSpace: 'nowrap',
          }}
        >
          {periodStart || '----'} até {periodEnd || '----'} · {remainingBusinessDays} dias úteis restantes
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
          marginTop: 16,
          borderTop: `1px solid ${SIMULATOR_UI.borderMuted}`,
          paddingTop: 14,
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            color: SIMULATOR_UI.textSecondary,
            fontSize: 13,
            fontWeight: 850,
            userSelect: 'none',
          }}
        >
          Ajustes avançados
        </summary>

        <div
          style={{
            marginTop: 14,
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
      ? 'rgba(34, 197, 94, 0.12)'
      : status === 'sem-meta'
        ? 'rgba(148, 163, 184, 0.08)'
        : status === 'no_ritmo'
          ? 'rgba(34, 197, 94, 0.12)'
          : status === 'atencao'
            ? 'rgba(245, 158, 11, 0.12)'
            : 'rgba(239, 68, 68, 0.12)'

  const progressBarColor =
    gap <= 0
      ? '#22c55e'
      : progressPct >= 75
        ? '#22c55e'
        : progressPct >= 45
          ? '#f59e0b'
          : '#ef4444'

  if (!isRevenueMode) {
    return (
      <section
        style={{
          marginBottom: 18,
          border: `1px solid ${SIMULATOR_UI.borderSoft}`,
          background: `linear-gradient(135deg, ${SIMULATOR_UI.surfaceSoft} 0%, ${SIMULATOR_UI.surface} 100%)`,
          borderRadius: 22,
          padding: 22,
          boxShadow: '0 14px 36px rgba(0, 0, 0, 0.20), inset 0 1px 0 rgba(255,255,255,0.035)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <div
              style={{
                marginBottom: 7,
                color: SIMULATOR_UI.textMuted,
                fontSize: 12,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Visão de ganhos
            </div>

            <div
              style={{
                color: SIMULATOR_UI.textPrimary,
                fontSize: 26,
                fontWeight: 950,
                letterSpacing: -0.6,
                lineHeight: 1.1,
              }}
            >
              Acompanhe ciclos, ganhos e ritmo operacional.
            </div>

            <div
              style={{
                marginTop: 9,
                maxWidth: 760,
                color: SIMULATOR_UI.textMuted,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Neste modo, a análise principal fica concentrada nas abas de taxa, resultado e funil do período.
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      style={{
        marginBottom: 18,
        border: `1px solid ${SIMULATOR_UI.borderSoft}`,
        background:
          'linear-gradient(135deg, rgba(18, 22, 33, 0.96) 0%, rgba(13, 15, 20, 0.98) 58%, rgba(9, 11, 15, 1) 100%)',
        borderRadius: 24,
        padding: 24,
        boxShadow: '0 18px 44px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 22,
          alignItems: 'stretch',
        }}
      >
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
              Decisão principal
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
              fontSize: 34,
              fontWeight: 950,
              letterSpacing: -1,
              lineHeight: 1.05,
            }}
          >
            {goal > 0 ? (
              <>
                Falta <span style={{ color: gap > 0 ? '#fca5a5' : '#86efac' }}>{toBRL(gap)}</span> para a meta.
              </>
            ) : (
              'Defina uma meta para gerar leitura executiva.'
            )}
          </div>

          <div
            style={{
              marginTop: 12,
              maxWidth: 820,
              color: SIMULATOR_UI.textMuted,
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            {goal > 0 ? (
              <>
                Você realizou <strong style={{ color: SIMULATOR_UI.textPrimary }}>{toBRL(totalReal)}</strong> de{' '}
                <strong style={{ color: SIMULATOR_UI.textPrimary }}>{toBRL(goal)}</strong>. O ritmo necessário é de{' '}
                <strong style={{ color: requiredPerDay > 0 ? '#fbbf24' : '#86efac' }}>
                  {toBRL(requiredPerDay)}
                </strong>{' '}
                por dia útil restante.
              </>
            ) : (
              <>
                Sem meta cadastrada, o simulador não consegue calcular gap, projeção e esforço necessário.
              </>
            )}
          </div>

          <div style={{ marginTop: 20 }}>
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
            background: 'rgba(9, 11, 15, 0.52)',
            borderRadius: 18,
            padding: 18,
            display: 'grid',
            gap: 14,
          }}
        >
          <div>
            <div style={{ color: SIMULATOR_UI.textMuted, fontSize: 12, fontWeight: 800, marginBottom: 5 }}>
              Meta de {revenueMetricLabel}
            </div>
            <div style={{ color: SIMULATOR_UI.textPrimary, fontSize: 24, fontWeight: 950, letterSpacing: -0.5 }}>
              {toBRL(goal)}
            </div>
          </div>

          <div>
            <div style={{ color: SIMULATOR_UI.textMuted, fontSize: 12, fontWeight: 800, marginBottom: 5 }}>
              Projeção no ritmo atual
            </div>
            <div style={{ color: projection >= goal && goal > 0 ? '#86efac' : '#fbbf24', fontSize: 22, fontWeight: 950 }}>
              {projection > 0 ? toBRL(projection) : '—'}
            </div>
          </div>

          <div>
            <div style={{ color: SIMULATOR_UI.textMuted, fontSize: 12, fontWeight: 800, marginBottom: 5 }}>
              Dias úteis restantes
            </div>
            <div style={{ color: SIMULATOR_UI.textPrimary, fontSize: 22, fontWeight: 950 }}>
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
        <div style={{ marginTop: 14, color: SIMULATOR_UI.textMuted, fontSize: 13 }}>
          Atualizando dados de {revenueMetricLabel.toLowerCase()}...
        </div>
      ) : null}

      {revenueError ? (
        <div style={{ marginTop: 14, color: '#fecaca', fontSize: 13, fontWeight: 750 }}>
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
          background: `linear-gradient(135deg, ${SIMULATOR_UI.surfaceSoft} 0%, ${SIMULATOR_UI.surface} 100%)`,
          borderRadius: 18,
          padding: 22,
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
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          border: `1px solid ${SIMULATOR_UI.borderSoft}`,
          background:
            'linear-gradient(135deg, rgba(18, 22, 33, 0.94) 0%, rgba(13, 15, 20, 0.98) 100%)',
          borderRadius: 22,
          padding: 22,
          boxShadow: '0 14px 34px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255,255,255,0.035)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                color: SIMULATOR_UI.textPrimary,
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: -0.3,
                lineHeight: 1.2,
              }}
            >
              Plano de execução restante
            </div>

            <div
              style={{
                marginTop: 6,
                color: SIMULATOR_UI.textMuted,
                fontSize: 13,
                lineHeight: 1.45,
                maxWidth: 780,
              }}
            >
              Agora o foco é operacional: quantos leads e fechamentos precisam acontecer até o fim do período.
            </div>
          </div>

          <div
            style={{
              border: `1px solid ${SIMULATOR_UI.borderMuted}`,
              background: 'rgba(9, 11, 15, 0.56)',
              borderRadius: 999,
              padding: '8px 12px',
              color: SIMULATOR_UI.textSecondary,
              fontSize: 12,
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            {remainingBusinessDays} dias úteis restantes
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
            title="Leads por dia útil"
            value={t.leads_restantes_por_dia}
            subtitle={leadsPerDayIsHeavy ? 'Ritmo alto. Exige cadência forte.' : 'Ritmo operacional administrável.'}
            tone={leadsPerDayIsHeavy ? 'bad' : 'neutral'}
          />

          <Card
            title="Ganhos por dia útil"
            value={t.ganhos_restantes_por_dia}
            subtitle={winsPerDayIsHeavy ? 'Pressão alta de fechamento.' : 'Ritmo de fechamento viável.'}
            tone={winsPerDayIsHeavy ? 'bad' : 'good'}
          />
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${SIMULATOR_UI.borderSoft}`,
          background: 'rgba(9, 11, 15, 0.62)',
          borderRadius: 18,
          padding: 20,
          display: 'grid',
          gap: 12,
        }}
      >
        <div
          style={{
            color: SIMULATOR_UI.textPrimary,
            fontSize: 15,
            fontWeight: 900,
            letterSpacing: -0.15,
          }}
        >
          Diagnóstico objetivo
        </div>

        <div
          style={{
            color: SIMULATOR_UI.textSecondary,
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          Faltam <strong style={{ color: '#fca5a5' }}>{toBRL(t.gap)}</strong> para bater a meta.
          Com ticket médio de <strong style={{ color: '#c4b5fd' }}>{toBRL(t.ticket_medio)}</strong> e conversão de{' '}
          <strong style={{ color: '#93c5fd' }}>{(t.close_rate * 100).toFixed(1)}%</strong> usando {rateLabel}, o time precisa trabalhar{' '}
          <strong style={{ color: '#67e8f9' }}>{t.leads_restantes} leads restantes</strong> para gerar aproximadamente{' '}
          <strong style={{ color: '#86efac' }}>{t.ganhos_restantes} ganhos</strong>.
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
          Ritmo recomendado: manter pelo menos{' '}
          <strong style={{ color: leadsPerDayIsHeavy ? '#fca5a5' : '#67e8f9' }}>
            {t.leads_restantes_por_dia} leads por dia útil
          </strong>{' '}
          e buscar{' '}
          <strong style={{ color: winsPerDayIsHeavy ? '#fca5a5' : '#86efac' }}>
            {t.ganhos_restantes_por_dia} ganhos por dia útil
          </strong>
          . Se esse volume estiver acima da capacidade real do time, a decisão gerencial é revisar meta, ampliar base de prospecção ou reforçar cadência.
        </div>
      </div>
    </div>
  )
}

function IconUsers({ size = 14, color = '#8fa3bc' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconBarChart({ size = 14, color = '#8fa3bc' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  )
}

function IconTag({ size = 14, color = '#a78bfa' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

function IconCrosshair({ size = 14, color = '#22d3ee' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </svg>
  )
}

function IconTrophy({ size = 14, color = '#10b981' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  )
}

function IconZap({ size = 14, color = '#22d3ee' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function IconCheckCircle({ size = 14, color = '#10b981' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

export default function SimuladorMetaPage() {
  const supabase = supabaseBrowser()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [competency, setCompetency] = useState<any>(null)
  const [metrics, setMetrics] = useState<SimulatorMetrics | null>(null)
  const [result, setResult] = useState<SimulatorResult | null>(null)

  const [mode, setMode] = useState<SimulatorMode>('faturamento')

  // Dias trabalhados (checkbox)
  const [workDays, setWorkDays] = useState<WorkDays>(defaultWorkDays())
  const [autoRemainingDays, setAutoRemainingDays] = useState(true)

  // Ganhos
  const [targetWins, setTargetWins] = useState(20)
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

  // Distribuição inteligente (Fase 6.6)
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
        const remainingDays = countRemainingWorkDays(endDate, workDays)
        setRemainingBusinessDays(remainingDays)

        if (isAdminUser) {
          const { data: sellersData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('company_id', profile.company_id)
            .eq('role', 'member')
            .order('full_name')

          const sellersList = (sellersData ?? []).map((s: any) => ({
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
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao carregar simulador.')
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
    const remainingDays = countRemainingWorkDays(endDate, workDays)
    setRemainingBusinessDays(remainingDays)
  }, [periodEnd, workDays, autoRemainingDays])

  // taxa real
  useEffect(() => {
    async function loadRateReal() {
      setRateRealLoading(true)
      try {
        const data = await getCloseRateReal(selectedSellerId, daysWindow)
        setRateRealData(data)
      } catch (e: any) {
        console.warn('Erro ao carregar taxa real:', e.message)
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
      periodStart && periodEnd ? countWorkDaysInRange(periodStart, periodEnd, workDays) : 22
    const newResult = calculateSimulatorResult(metrics, {
      target_wins: targetWins,
      close_rate: percentToRate(closeRatePercent),
      ticket_medio: 0,
      remaining_business_days: remainingBusinessDays,
      total_business_days: totalDays,
    })
    setResult(newResult)
  }, [targetWins, closeRatePercent, remainingBusinessDays, metrics, periodStart, periodEnd, workDays])

    // refetch metrics quando muda vendedor ou período
    useEffect(() => {
      if (!periodStart || selectedSellerId === undefined) return
      async function refetch() {
        try {
          const newMetrics = await getSalesCycleMetrics(selectedSellerId, periodStart)
          setMetrics(newMetrics)
        } catch (e: any) {
          setError(e?.message ?? 'Erro ao atualizar métricas.')
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
      } catch (e: any) {
        console.warn('Erro ao carregar conversão por grupo:', e.message)
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
  } catch (error: any) {
    setGoalError(error?.message ?? 'Erro ao salvar meta.')
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

    async function loadGoal() {
      setGoalLoading(true)
      setGoalError(null)
      setGoalSuccess(null)

      try {
        const res = await getRevenueGoal({
          companyId,
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
      } catch (e: any) {
        setGoalError(e?.message ?? 'Erro ao carregar meta.')
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
      } catch (e: any) {
        console.warn('Erro ao carregar ticket histórico:', e.message)
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

        const totalLeadsForDist = theory10020Result?.leads_para_contatar
          ?? Math.ceil(targetWins / Math.max(0.01, percentToRate(closeRatePercent)))

        const totalWinsForDist = targetWins

        const dist = buildCalendarDistribution(
          {
            dateStart,
            dateEnd,
            workDays,
            totalLeads: Math.max(0, totalLeadsForDist),
            totalWins: Math.max(0, totalWinsForDist),
            closeRate: percentToRate(closeRatePercent),
          },
          inputSignals,
        )

        setDistribution(dist)
      } catch (e: any) {
        setDistributionError(e?.message ?? 'Erro ao gerar distribuição.')
        setDistribution(null)
      } finally {
        setDistributionLoading(false)
      }
    }

    void loadDistribution()
  }, [activeTab, companyId, periodStart, periodEnd, selectedSellerId, targetWins, closeRatePercent, workDays, theory10020Result?.leads_para_contatar])

  // revenue (dados)
  useEffect(() => {
    if (!competency || !companyId) return

    async function loadRevenue() {
      if (mode === 'ganhos') {
        setRevenueCompany(null)
        setRevenueSeller(null)
        setRevenueError(null)
        return
      }

      setRevenueLoading(true)
      setRevenueError(null)

      const cid = companyId
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
      } catch (e: any) {
        console.warn('Erro ao carregar revenue:', e?.message ?? String(e))
        setRevenueError(e?.message ?? 'Erro ao carregar faturamento/recebimento.')
        setRevenueCompany(null)
        setRevenueSeller(null)
      } finally {
        setRevenueLoading(false)
      }
    }

    void loadRevenue()
  }, [mode, competency, companyId, isAdmin, selectedSellerId, revenueDates.start, revenueDates.end])

  function buildRevenueKpis(totalReal: number, goal: number) {
    const safeGoal = Math.max(0, Number(goal) || 0)

    const businessDaysTotal = countWorkDaysInRange(revenueDates.start, revenueDates.end, workDays)
    const businessDaysElapsed = countWorkDaysUntilToday(revenueDates.start, revenueDates.end, workDays)
    const businessDaysRemaining = Math.max(0, businessDaysTotal - businessDaysElapsed)

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
  }, [revenueCompany, activeGoalForKpis, revenueDates.start, revenueDates.end, workDays])

  const revenueSellerKpis = useMemo(() => {
    if (!revenueSeller?.success) return null
    return buildRevenueKpis(Number(revenueSeller.total_real || 0), activeGoalForKpis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueSeller, activeGoalForKpis, revenueDates.start, revenueDates.end, workDays])

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

  const progressTone =
    (result?.progress_pct ?? 0) >= 1 ? 'good' : (result?.progress_pct ?? 0) >= 0.5 ? 'neutral' : 'bad'

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
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <button onClick={() => setActiveTab('teoria')} style={tabStyle(activeTab === 'teoria')}>
          Esforço Máximo
        </button>
        {showRevenueMode ? (
          <button onClick={() => setActiveTab('evolucao')} style={tabStyle(activeTab === 'evolucao')}>
            Evolução
          </button>
        ) : null}
        <button onClick={() => setActiveTab('taxa-resultado')} style={tabStyle(activeTab === 'taxa-resultado')}>
          Taxa e Resultado
        </button>
        <button onClick={() => setActiveTab('funil')} style={tabStyle(activeTab === 'funil')}>
          Funil do Período
        </button>
        <button onClick={() => setActiveTab('distribuicao')} style={tabStyle(activeTab === 'distribuicao')}>
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
          <div style={{ display: 'grid', gap: 16 }}>

            {/* Taxa Real */}
            {rateRealData ? (
              <Section
                title={
                  <TitleWithTip label="Taxa Histórica" tipTitle="Como ler a Taxa Histórica" width={420}>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                    <li>Taxa calculada com base no histórico de ciclos (janela selecionada).</li>
                    <li>Se a amostra for pequena (&lt;30 ciclos), a taxa pode oscilar bastante.</li>
                  </ul>
                </TitleWithTip>
                }
                description="Calculada a partir dos ciclos ganhos vs trabalhados no período selecionado."
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <Card
                    title={
                      <TitleWithTip label="Taxa histórica (vendedor)" tipTitle="Taxa histórica do vendedor" width={380}>
                      <div>Ganhos ÷ Trabalhados do vendedor selecionado no período.</div>
                    </TitleWithTip>
                    }
                    value={rateRealData.vendor.close_rate ? `${(rateRealData.vendor.close_rate * 100).toFixed(1)}%` : '—'}
                    subtitle={
                      rateRealData.vendor.worked >= 30
                        ? `${rateRealData.vendor.wins} ganhos / ${rateRealData.vendor.worked} trabalhados`
                        : `Amostra pequena (${rateRealData.vendor.worked} ciclos)`
                    }
                    tone={rateRealData.vendor.worked >= 30 ? 'neutral' : 'bad'}
                  />

                  <Card
                    title={
                      <TitleWithTip label="Taxa histórica (empresa)" tipTitle="Taxa histórica da empresa" width={380}>
                      <div>Ganhos ÷ Trabalhados de toda a empresa no período.</div>
                    </TitleWithTip>
                    }
                    value={rateRealData.company.close_rate ? `${(rateRealData.company.close_rate * 100).toFixed(1)}%` : '—'}
                    subtitle={`${rateRealData.company.wins} ganhos / ${rateRealData.company.worked} trabalhados`}
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <select
                      value={daysWindow}
                      onChange={(e) => setDaysWindow(parseInt(e.target.value))}
                      style={{
                        padding: '8px 12px 8px 8px',
                        borderRadius: 8,
                        border: '1px solid #1a1d2e',
                        background: '#0d0f14',
                        color: '#edf2f7',
                        fontSize: 13,
                        fontWeight: 600,
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238fa3bc' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 8px center',
                        paddingRight: 28,
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'border-color 150ms ease',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#1a1d2e' }}
                    >
                      <option value={30}>Últimos 30 dias</option>
                      <option value={60}>Últimos 60 dias</option>
                      <option value={90}>Últimos 90 dias</option>
                    </select>

                    <button
                      onClick={() => {
                        if (rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30) {
                          const newPercent = Math.round(rateRealData.vendor.close_rate * 1000) / 10
                          setCloseRatePercent(newPercent)
                          setMode('ganhos')
                        }
                      }}
                      disabled={!rateRealData.vendor.close_rate || rateRealData.vendor.worked < 30}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30
                          ? '1px solid rgba(59,130,246,0.4)'
                          : '1px solid #1a1d2e',
                        background: rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30
                          ? 'linear-gradient(90deg, rgba(59,130,246,0.28) 0%, rgba(59,130,246,0.12) 100%)'
                          : '#0d0f14',
                        color: rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30
                          ? '#93c5fd'
                          : '#546070',
                        cursor: rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30 ? 'pointer' : 'not-allowed',
                        fontWeight: 700,
                        fontSize: 12,
                        opacity: rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30 ? 1 : 0.5,
                        transition: 'all 150ms ease',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Usar taxa real
                    </button>
                  </div>
                </div>

                {rateRealLoading ? <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>Carregando taxa real...</div> : null}
              </Section>
            ) : null}

            {/* Resultado */}
            <Section title="Resultado" description="Números para bater sua meta.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <Card title="Ciclos Necessários" value={result?.needed_worked_cycles ?? '—'} subtitle={result ? `${result.needed_wins} ganhos ÷ ${closeRatePercent}% taxa` : undefined} />
                <Card title="Ciclos Restantes" value={result?.remaining_worked_cycles ?? '—'} subtitle={result ? `${result.remaining_wins} ganhos restantes ÷ ${closeRatePercent}%` : undefined} />
                <Card title="Ciclos/Dia (período)" value={result?.daily_worked_needed ?? '—'} subtitle={result ? `${result.needed_worked_cycles} ciclos ÷ ${periodStart && periodEnd ? countWorkDaysInRange(periodStart, periodEnd, workDays) : 22} dias` : undefined} />
                <Card title="Ciclos/Dia (restante)" value={result?.daily_worked_remaining ?? '—'} subtitle={result ? `${result.remaining_worked_cycles} ciclos ÷ ${remainingBusinessDays} dias` : undefined} />
              </div>
            </Section>

            {/* Progresso */}
            <Section title="Progresso" description="Seu desempenho atual no mês.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <Card title="Ganhos Atuais" value={metrics?.current_wins ?? '—'} subtitle={result ? `${pct(result.progress_pct)} da meta (${result.needed_wins} alvo)` : undefined} tone={progressTone} />
                <Card title="Ciclos Trabalhados" value={metrics?.worked_count ?? '—'} subtitle={metrics && result ? `Taxa real: ${pct(metrics.current_wins / Math.max(1, metrics.worked_count))}` : undefined} tone="neutral" />
                <Card title="Status" value={result?.on_track ? 'No ritmo' : 'Acelerar'} tone={result?.on_track ? 'good' : 'bad'} />
              </div>
            </Section>

          </div>
        )}

        {/* ============================================================ */}
        {/* ABA 4: FUNIL DO PERÍODO                                       */}
        {/* ============================================================ */}
        {activeTab === 'funil' && (
          <div style={{ display: 'grid', gap: 16 }}>

            <Section title="Funil do Período" description="Distribuição dos ciclos por estágio.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                <div style={{ borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #3b82f6', background: '#0d0f14', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: '#8fa3bc', marginBottom: 4 }}>Novo</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#3b82f6' }}>{metrics?.counts_by_status.novo ?? '—'}</div>
                </div>
                <div style={{ borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #06b6d4', background: '#0d0f14', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: '#8fa3bc', marginBottom: 4 }}>Contato</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#06b6d4' }}>{metrics?.counts_by_status.contato ?? '—'}</div>
                </div>
                <div style={{ borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #eab308', background: '#0d0f14', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: '#8fa3bc', marginBottom: 4 }}>Respondeu</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#eab308' }}>{metrics?.counts_by_status.respondeu ?? '—'}</div>
                </div>
                <div style={{ borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #8b5cf6', background: '#0d0f14', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: '#8fa3bc', marginBottom: 4 }}>Negociação</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#8b5cf6' }}>{metrics?.counts_by_status.negociacao ?? '—'}</div>
                </div>
                <div style={{ borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #22c55e', background: '#0d0f14', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: '#8fa3bc', marginBottom: 4 }}>Ganho</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#22c55e' }}>{metrics?.counts_by_status.ganho ?? '—'}</div>
                </div>
                <div style={{ borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #ef4444', background: '#0d0f14', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: '#8fa3bc', marginBottom: 4 }}>Perdido</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#ef4444' }}>{metrics?.counts_by_status.perdido ?? '—'}</div>
                </div>
              </div>
            </Section>

            {/* Conversão por grupo */}
            {groupConversionLoading ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>Carregando funil por grupo...</div>
            ) : groupConversion.length > 0 ? (
              <Section title="Conversão por Grupo" description="Taxa de conversão por grupo de leads no período.">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1a1d2e' }}>
                        <th style={{ textAlign: 'left', padding: '8px 12px', color: '#4a5569', fontWeight: 700 }}>Grupo</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: '#4a5569', fontWeight: 700 }}>Trabalhados</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: '#4a5569', fontWeight: 700 }}>Ganhos</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: '#4a5569', fontWeight: 700 }}>Taxa</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: '#4a5569', fontWeight: 700 }}>Participação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupConversion.map((row, i) => (
                        <tr
                          key={row.group_id ?? i}
                          style={{ borderBottom: '1px solid #1a1d2e' }}
                        >
                          <td style={{ padding: '8px 12px' }}>{row.group_name || '—'}</td>
                          <td style={{ textAlign: 'right', padding: '8px 12px', opacity: 0.8 }}>{row.trabalhados}</td>
                          <td style={{ textAlign: 'right', padding: '8px 12px', color: '#10b981' }}>{row.ganho}</td>
                          <td style={{ textAlign: 'right', padding: '8px 12px', color: '#06b6d4' }}>{pct(row.pct_grupo)}</td>
                          <td style={{ textAlign: 'right', padding: '8px 12px', opacity: 0.7 }}>{pct(row.pct_participacao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            ) : null}

          </div>
        )}

        {/* ============================================================ */}
        {/* ABA 5: DISTRIBUIÇÃO INTELIGENTE (Fase 6.6)                    */}
        {/* ============================================================ */}
        {activeTab === 'distribuicao' && (
          <div style={{ display: 'grid', gap: 16 }}>

            <Section
              title="Distribuição Inteligente da Meta"
              description="Meta diária distribuída com base na vocação operacional, sazonalidade e radar do período (Fases 6.1–6.5)."
            >
              {/* Controles */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={distributionOnlyWorking}
                    onChange={(e) => setDistributionOnlyWorking(e.target.checked)}
                  />
                  Mostrar apenas dias úteis
                </label>
                {distribution ? (
                  <span style={{ fontSize: 12, opacity: 0.5 }}>
                    {distribution.summary.total_working_days} dias úteis · {periodStart} a {periodEnd}
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
                description="Meta de leads e ganhos por dia útil. Clique em uma linha para ver o motivo da distribuição."
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