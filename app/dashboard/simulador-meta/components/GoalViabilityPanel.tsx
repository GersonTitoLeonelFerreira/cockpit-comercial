'use client'

import React, { useMemo, useState } from 'react'
import { buildGoalViability } from '@/app/lib/services/goalViability'
import type {
  HistoricalTicketResponse,
  SimulatorMetrics,
  Theory10020Result,
} from '@/app/types/simulator'
import type { CloseRateRealResponse } from '@/app/types/simulatorRateReal'
import type { DailyGoalDistribution } from '@/app/types/distribution'
import type { GoalViabilityTone } from '@/app/types/goalViability'

const UI = {
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
} as const

function toneColor(tone: GoalViabilityTone) {
  if (tone === 'good') return UI.green
  if (tone === 'warn') return UI.amber
  if (tone === 'bad') return UI.red
  return UI.blue
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })
}

function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: GoalViabilityTone
}) {
  const color = toneColor(tone)

  return (
    <div
      style={{
        border: `1px solid ${UI.borderMuted}`,
        background: 'rgba(9, 11, 15, 0.46)',
        borderRadius: 14,
        padding: 14,
        minHeight: 96,
        display: 'grid',
        alignContent: 'space-between',
        gap: 8,
      }}
    >
      <div
        style={{
          color: UI.textSubtle,
          fontSize: 11.5,
          fontWeight: 850,
          textTransform: 'uppercase',
          letterSpacing: '0.045em',
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>

      <div
        style={{
          color,
          fontSize: 24,
          fontWeight: 950,
          letterSpacing: -0.45,
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>

      {sub ? (
        <div
          style={{
            color: UI.textSubtle,
            fontSize: 12,
            lineHeight: 1.35,
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        border: `1px solid ${UI.borderMuted}`,
        background: 'rgba(9, 11, 15, 0.34)',
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div
        style={{
          color: UI.textPrimary,
          fontSize: 13.5,
          fontWeight: 900,
          letterSpacing: -0.15,
          marginBottom: 12,
        }}
      >
        {title}
      </div>

      {children}
    </div>
  )
}

function ListBlock({
  items,
  empty,
  tone,
}: {
  items: string[]
  empty: string
  tone: GoalViabilityTone
}) {
  const color = toneColor(tone)

  if (items.length === 0) {
    return (
      <div
        style={{
          color: UI.textSubtle,
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
      >
        {empty}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map((item, index) => (
        <div
          key={`${item}-${index}`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 9,
            alignItems: 'flex-start',
            color: UI.textMuted,
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 7,
              height: 7,
              marginTop: 6,
              borderRadius: 999,
              background: color,
              boxShadow: `0 0 0 4px ${color}18`,
            }}
          />
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}

export default function GoalViabilityPanel({
  theoryResult,
  metrics,
  closeRateReal,
  historicalTicket,
  distribution,
  remainingBusinessDays,
}: {
  theoryResult: Theory10020Result | null
  metrics: SimulatorMetrics | null
  closeRateReal: CloseRateRealResponse | null
  historicalTicket: HistoricalTicketResponse | null
  distribution: DailyGoalDistribution | null
  remainingBusinessDays: number
}) {
  const [dailyCapacityPerSeller, setDailyCapacityPerSeller] = useState(40)
  const [activeSellersCount, setActiveSellersCount] = useState(1)

  const viability = useMemo(() => {
    return buildGoalViability({
      theoryResult,
      metrics,
      closeRateReal,
      historicalTicket,
      distribution,
      remainingBusinessDays,
      dailyCapacityPerSeller,
      activeSellersCount,
    })
  }, [
    theoryResult,
    metrics,
    closeRateReal,
    historicalTicket,
    distribution,
    remainingBusinessDays,
    dailyCapacityPerSeller,
    activeSellersCount,
  ])

  const statusColor = toneColor(viability.tone)

  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        border: `1px solid ${statusColor}28`,
        background: `linear-gradient(135deg, ${statusColor}12 0%, ${UI.surfaceElevated} 32%, ${UI.surface} 100%)`,
        borderRadius: 22,
        padding: 18,
        boxShadow:
          '0 16px 42px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.035)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: '0 0 auto 0',
          height: 2,
          background: `linear-gradient(90deg, transparent, ${statusColor}88, transparent)`,
        }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <div
            style={{
              color: UI.textPrimary,
              fontSize: 17,
              fontWeight: 950,
              letterSpacing: -0.25,
              lineHeight: 1.2,
            }}
          >
            Confiabilidade do Plano
          </div>

          <div
            style={{
              marginTop: 6,
              color: UI.textMuted,
              fontSize: 13,
              lineHeight: 1.5,
              maxWidth: 840,
            }}
          >
            Valida se a meta é executável considerando taxa, ticket, base disponível,
            capacidade diária, distribuição e margem de atraso.
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${statusColor}38`,
            background: `${statusColor}14`,
            color: statusColor,
            borderRadius: 999,
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 950,
            whiteSpace: 'nowrap',
          }}
        >
          {viability.statusLabel}
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${statusColor}22`,
          background: 'rgba(9, 11, 15, 0.44)',
          borderRadius: 16,
          padding: 16,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            color: UI.textPrimary,
            fontSize: 15,
            fontWeight: 950,
            lineHeight: 1.3,
          }}
        >
          {viability.headline}
        </div>

        <div
          style={{
            marginTop: 8,
            color: UI.textMuted,
            fontSize: 13,
            lineHeight: 1.55,
            maxWidth: 980,
          }}
        >
          {viability.explanation}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <KpiCard
          label="Confiança"
          value={`${viability.score}%`}
          sub={viability.confidenceLabel}
          tone={viability.tone}
        />

        <KpiCard
          label="Base disponível"
          value={`${viability.baseCoveragePct}%`}
          sub={`${formatNumber(viability.availableBase)} de ${formatNumber(viability.requiredBase)} necessárias`}
          tone={viability.baseCoveragePct >= 100 ? 'good' : 'bad'}
        />

        <KpiCard
          label="Capacidade usada"
          value={`${viability.dailyCapacityUsagePct}%`}
          sub={`${formatNumber(viability.totalDailyCapacity)} oportunidades/dia`}
          tone={viability.dailyCapacityUsagePct <= 100 ? 'good' : 'bad'}
        />

        <KpiCard
          label="Perdendo 2 dias"
          value={`+${viability.recoveryScenario.two_day_increase_pct}%`}
          sub={`${viability.recoveryScenario.if_loses_2_days} oportunidades/dia`}
          tone={viability.recoveryScenario.two_day_increase_pct <= 30 ? 'good' : 'warn'}
        />
      </div>

      <div
        style={{
          border: `1px solid ${UI.borderMuted}`,
          background: 'rgba(9, 11, 15, 0.34)',
          borderRadius: 16,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            color: UI.textPrimary,
            fontSize: 13.5,
            fontWeight: 900,
            marginBottom: 10,
          }}
        >
          Capacidade operacional usada na simulação
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 10,
          }}
        >
          <label
            style={{
              display: 'grid',
              gap: 6,
              color: UI.textMuted,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Capacidade diária por vendedor
            <input
              type="number"
              min={1}
              value={dailyCapacityPerSeller}
              onChange={(event) => setDailyCapacityPerSeller(Math.max(1, Number(event.target.value || 1)))}
              style={{
                width: '100%',
                border: `1px solid ${UI.borderMuted}`,
                background: UI.surfaceSoft,
                color: UI.textPrimary,
                borderRadius: 12,
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 800,
                outline: 'none',
              }}
            />
          </label>

          <label
            style={{
              display: 'grid',
              gap: 6,
              color: UI.textMuted,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Vendedores ativos na execução
            <input
              type="number"
              min={1}
              value={activeSellersCount}
              onChange={(event) => setActiveSellersCount(Math.max(1, Number(event.target.value || 1)))}
              style={{
                width: '100%',
                border: `1px solid ${UI.borderMuted}`,
                background: UI.surfaceSoft,
                color: UI.textPrimary,
                borderRadius: 12,
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 800,
                outline: 'none',
              }}
            />
          </label>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <Section title="Pontos que sustentam o plano">
          <ListBlock
            items={viability.strengths}
            empty="Nenhuma premissa forte o suficiente foi identificada ainda."
            tone="good"
          />
        </Section>

        <Section title="Pontos de risco">
          <ListBlock
            items={viability.risks}
            empty="Nenhum risco crítico identificado nas premissas principais."
            tone="warn"
          />
        </Section>
      </div>

      <Section title="Ações recomendadas antes de executar">
        <ListBlock
          items={viability.recommendedActions}
          empty="Nenhuma ação corretiva necessária no momento."
          tone={viability.tone === 'good' ? 'good' : 'warn'}
        />
      </Section>

      <details
        style={{
          marginTop: 14,
          border: `1px solid ${UI.borderMuted}`,
          background: 'rgba(9, 11, 15, 0.28)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            userSelect: 'none',
            listStyle: 'none',
            padding: '14px 16px',
            color: UI.textPrimary,
            fontSize: 13,
            fontWeight: 900,
          }}
        >
          Ver critérios usados na viabilidade
        </summary>

        <div
          style={{
            borderTop: `1px solid ${UI.borderMuted}`,
            padding: 14,
            display: 'grid',
            gap: 10,
          }}
        >
          {viability.criteria.map((criterion) => {
            const color = toneColor(criterion.tone)

            return (
              <div
                key={criterion.id}
                style={{
                  border: `1px solid ${UI.borderMuted}`,
                  background: 'rgba(15, 18, 26, 0.58)',
                  borderRadius: 14,
                  padding: 12,
                  display: 'grid',
                  gap: 5,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      color: UI.textPrimary,
                      fontSize: 13,
                      fontWeight: 900,
                    }}
                  >
                    {criterion.label}
                  </div>

                  <span
                    style={{
                      border: `1px solid ${color}24`,
                      background: `${color}10`,
                      color,
                      borderRadius: 999,
                      padding: '4px 8px',
                      fontSize: 10.5,
                      fontWeight: 900,
                    }}
                  >
                    {criterion.score}%
                  </span>
                </div>

                <div
                  style={{
                    color: UI.textSecondary,
                    fontSize: 12.5,
                    fontWeight: 800,
                  }}
                >
                  {criterion.value}
                </div>

                <div
                  style={{
                    color: UI.textSubtle,
                    fontSize: 12.2,
                    lineHeight: 1.45,
                  }}
                >
                  {criterion.description}
                </div>
              </div>
            )
          })}
        </div>
      </details>
    </section>
  )
}