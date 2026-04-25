'use client'

import React, { useMemo, useRef, useState } from 'react'
import { RevenueDayPoint } from '@/app/types/simulator'

const CHART_UI = {
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

function formatBRL(v: number) {
  return (Number(v) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatBRShort(v: number) {
  const n = Number(v) || 0

  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1).replace('.', ',')}k`

  return String(Math.round(n))
}

function toYMD(v: string) {
  return (v ?? '').split('T')[0].split(' ')[0]
}

function formatDateShort(v: string) {
  const clean = toYMD(v)
  const parts = clean.split('-')

  if (parts.length !== 3) return '—'

  return `${parts[2]}/${parts[1]}`
}

function getBusinessDaysSet(start: Date, end: Date) {
  const set = new Set<string>()
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)

  const e = new Date(end)
  e.setHours(0, 0, 0, 0)

  while (d <= e) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) set.add(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }

  return set
}

function niceGridValues(maxVal: number, steps: number): number[] {
  if (maxVal <= 0) return [0]

  const raw = maxVal / steps
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const nice = [1, 2, 2.5, 5, 10].find((n) => n * mag >= raw) ?? 10
  const step = nice * mag
  const vals: number[] = []

  for (let v = step; v <= maxVal * 1.05; v += step) {
    vals.push(v)
  }

  return vals
}

function MetricBlock({
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  helper?: React.ReactNode
  tone?: 'neutral' | 'good' | 'attention' | 'bad'
}) {
  const toneColor =
    tone === 'good'
      ? CHART_UI.green
      : tone === 'attention'
        ? CHART_UI.amber
        : tone === 'bad'
          ? CHART_UI.red
          : CHART_UI.textPrimary

  return (
    <div
      style={{
        border: `1px solid ${CHART_UI.borderMuted}`,
        background: 'rgba(9, 11, 15, 0.46)',
        borderRadius: 14,
        padding: '13px 14px',
        minHeight: 92,
        display: 'grid',
        alignContent: 'space-between',
        gap: 9,
      }}
    >
      <div
        style={{
          color: CHART_UI.textSubtle,
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
          color: toneColor,
          fontSize: 22,
          fontWeight: 950,
          letterSpacing: -0.45,
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>

      {helper ? (
        <div
          style={{
            color: CHART_UI.textSubtle,
            fontSize: 12,
            lineHeight: 1.35,
          }}
        >
          {helper}
        </div>
      ) : null}
    </div>
  )
}

function LegendItem({
  type,
  label,
}: {
  type: 'bar' | 'real' | 'goal'
  label: string
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        color: CHART_UI.textMuted,
        fontSize: 11.5,
        fontWeight: 750,
        whiteSpace: 'nowrap',
      }}
    >
      {type === 'bar' ? (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: 'rgba(96, 165, 250, 0.24)',
            border: '1px solid rgba(96, 165, 250, 0.20)',
          }}
        />
      ) : null}

      {type === 'real' ? (
        <span
          style={{
            width: 18,
            height: 2,
            borderRadius: 999,
            background: CHART_UI.blue,
          }}
        />
      ) : null}

      {type === 'goal' ? (
        <span
          style={{
            width: 18,
            height: 0,
            borderTop: '2px dashed rgba(203, 213, 225, 0.62)',
          }}
        />
      ) : null}

      <span>{label}</span>
    </div>
  )
}

export function RevenueChart({
  title,
  series,
  goal,
  startDate,
  endDate,
}: {
  title: string
  series: RevenueDayPoint[]
  goal: number
  startDate: string
  endDate: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const W = 860
  const H = 280
  const padL = 52
  const padR = 18
  const padT = 32
  const padB = 40

  const [hover, setHover] = useState<{
    i: number
    xPx: number
    yPx: number
  } | null>(null)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const safeSeries = Array.isArray(series) ? series : []
  const goalSafe = Math.max(0, Number(goal) || 0)

  const {
    points,
    maxDaily,
    maxAcc,
    metaByIndex,
    realAccByIndex,
    businessCount,
    totalReal,
    lastDate,
    todayIndex,
    hasValidRange,
  } = useMemo(() => {
    const startKey = toYMD(startDate)
    const endKey = toYMD(endDate)

    const start = new Date(`${startKey}T00:00:00`)
    const end = new Date(`${endKey}T00:00:00`)

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    ) {
      return {
        points: [] as {
          date: string
          daily: number
          acc: number
          isBusiness: boolean
          isFuture: boolean
        }[],
        maxDaily: 0,
        maxAcc: 0,
        metaByIndex: [] as number[],
        realAccByIndex: [] as number[],
        businessCount: 0,
        totalReal: 0,
        lastDate: '',
        todayIndex: -1,
        hasValidRange: false,
      }
    }

    const map = new Map<string, number>()

    for (const p of safeSeries) {
      map.set(p.date, Number(p.value || 0))
    }

    const businessSet = getBusinessDaysSet(start, end)

    const pts: {
      date: string
      daily: number
      acc: number
      isBusiness: boolean
      isFuture: boolean
    }[] = []

    let acc = 0
    let maxD = 0
    let maxA = 0
    let tIdx = -1

    const d = new Date(start)

    while (d <= end) {
      const key = d.toISOString().slice(0, 10)
      const daily = map.get(key) ?? 0

      acc += daily

      const isBusiness = businessSet.has(key)
      const isFuture = key > today

      maxD = Math.max(maxD, daily)
      maxA = Math.max(maxA, acc)

      if (key === today) tIdx = pts.length

      pts.push({
        date: key,
        daily,
        acc,
        isBusiness,
        isFuture,
      })

      d.setDate(d.getDate() + 1)
    }

    const businessDays = pts.filter((p) => p.isBusiness).length
    const businessCountSafe = Math.max(1, businessDays)

    let metaAcc = 0
    const metaByIdx: number[] = []

    for (const p of pts) {
      if (p.isBusiness) metaAcc += goalSafe / businessCountSafe
      metaByIdx.push(metaAcc)
    }

    const realAcc = pts.map((p) => p.acc)

    const last = pts.length ? pts[pts.length - 1].acc : 0
    const lastD = pts.length ? pts[pts.length - 1].date : ''

    return {
      points: pts,
      maxDaily: maxD,
      maxAcc: Math.max(maxA, metaAcc),
      metaByIndex: metaByIdx,
      realAccByIndex: realAcc,
      businessCount: businessDays,
      totalReal: last,
      lastDate: lastD,
      todayIndex: tIdx,
      hasValidRange: true,
    }
  }, [safeSeries, goalSafe, startDate, endDate, today])

  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const barZoneH = innerH * 0.35
  const accZoneH = innerH

  const yDaily = (v: number) => padT + innerH - (v / Math.max(1, maxDaily)) * barZoneH
  const yAcc = (v: number) => padT + innerH - (v / Math.max(1, maxAcc)) * accZoneH
  const x = (i: number) => padL + (i / Math.max(1, points.length - 1)) * innerW

  const realLine = points.map((_, i) => `${x(i).toFixed(2)},${yAcc(realAccByIndex[i]).toFixed(2)}`).join(' ')
  const metaLine = points.map((_, i) => `${x(i).toFixed(2)},${yAcc(metaByIndex[i]).toFixed(2)}`).join(' ')

  const gridVals = useMemo(() => niceGridValues(maxAcc, 4), [maxAcc])

  const xLabels = useMemo(() => {
    const labels: { i: number; label: string }[] = []

    for (let i = 0; i < points.length; i++) {
      const day = parseInt(points[i].date.slice(8, 10))

      if (i === 0 || day === 7 || day === 14 || day === 21 || day === 28 || i === points.length - 1) {
        if (labels.length && labels[labels.length - 1].i === i) continue
        labels.push({
          i,
          label: points[i].date.slice(5).replace('-', '/'),
        })
      }
    }

    return labels
  }, [points])

  const progressPct = goalSafe > 0 ? Math.min(100, Math.round((totalReal / goalSafe) * 100)) : 0
  const gap = goalSafe > 0 ? goalSafe - totalReal : 0
  const hasAnyDailyValue = points.some((p) => p.daily > 0)
  const hasAnyOperationalData = hasAnyDailyValue || goalSafe > 0

  const todayMeta = todayIndex >= 0 ? metaByIndex[todayIndex] ?? 0 : metaByIndex[metaByIndex.length - 1] ?? 0
  const todayReal = todayIndex >= 0 ? realAccByIndex[todayIndex] ?? totalReal : totalReal
  const todayGap = goalSafe > 0 ? todayMeta - todayReal : 0

  const status =
    goalSafe <= 0
      ? {
          label: 'Meta não definida',
          color: CHART_UI.textMuted,
          background: 'rgba(148, 163, 184, 0.08)',
          border: CHART_UI.borderMuted,
        }
      : totalReal >= goalSafe
        ? {
            label: 'Meta batida',
            color: CHART_UI.green,
            background: 'rgba(34, 197, 94, 0.10)',
            border: 'rgba(34, 197, 94, 0.18)',
          }
        : todayGap <= 0
          ? {
              label: 'No ritmo',
              color: CHART_UI.green,
              background: 'rgba(34, 197, 94, 0.10)',
              border: 'rgba(34, 197, 94, 0.18)',
            }
          : {
              label: 'Abaixo do ritmo',
              color: CHART_UI.amber,
              background: 'rgba(245, 158, 11, 0.10)',
              border: 'rgba(245, 158, 11, 0.18)',
            }

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v))
  }

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!containerRef.current || !points.length) return

    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * W
    const relY = ((e.clientY - rect.top) / rect.height) * H
    const t = (relX - padL) / Math.max(1, innerW)
    const i = clamp(Math.round(t * (points.length - 1)), 0, Math.max(0, points.length - 1))

    setHover({
      i,
      xPx: relX,
      yPx: relY,
    })
  }

  function onLeave() {
    setHover(null)
  }

  const hoverData = hover ? points[hover.i] : null
  const hoverMetaAcc = hover ? metaByIndex[hover.i] : 0
  const hoverRealAcc = hover ? realAccByIndex[hover.i] : 0

  const tooltip = useMemo(() => {
    if (!hover || !containerRef.current) return null

    const box = containerRef.current.getBoundingClientRect()
    const xPx = (hover.xPx / W) * box.width
    const yPx = (hover.yPx / H) * box.height
    const left = clamp(xPx + 12, 8, box.width - 280)
    const top = clamp(yPx + 12, 8, box.height - 150)

    return { left, top }
  }, [hover])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        overflow: 'hidden',
        border: `1px solid ${CHART_UI.borderSoft}`,
        background: `linear-gradient(135deg, ${CHART_UI.surfaceElevated} 0%, ${CHART_UI.surfaceSoft} 45%, ${CHART_UI.surface} 100%)`,
        borderRadius: 20,
        padding: 20,
        boxShadow: '0 16px 38px rgba(0, 0, 0, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.035)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: '0 0 auto 0',
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(96, 165, 250, 0.36), transparent)',
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
        <div style={{ minWidth: 260 }}>
          <div
            style={{
              color: CHART_UI.textPrimary,
              fontSize: 16,
              fontWeight: 950,
              letterSpacing: -0.25,
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>

          <div
            style={{
              marginTop: 6,
              color: CHART_UI.textMuted,
              fontSize: 13,
              lineHeight: 1.45,
              maxWidth: 760,
            }}
          >
            Evolução diária e acumulada do resultado real contra a meta distribuída pelos dias úteis.
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${status.border}`,
            background: status.background,
            color: status.color,
            borderRadius: 999,
            padding: '7px 11px',
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: 'nowrap',
          }}
        >
          {status.label}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <MetricBlock
          label="Real no período"
          value={formatBRL(totalReal)}
          helper={lastDate ? `Até ${formatDateShort(lastDate)}` : 'Sem fechamento no período'}
          tone={goalSafe > 0 && totalReal >= goalSafe ? 'good' : 'neutral'}
        />

        <MetricBlock
          label="Meta do período"
          value={goalSafe > 0 ? formatBRL(goalSafe) : '—'}
          helper={goalSafe > 0 ? `${businessCount} dias úteis no ciclo` : 'Defina uma meta para comparar'}
        />

        <MetricBlock
          label="Progresso"
          value={goalSafe > 0 ? `${progressPct}%` : '—'}
          helper={goalSafe > 0 ? 'Real acumulado sobre a meta' : 'Sem meta cadastrada'}
          tone={progressPct >= 100 ? 'good' : progressPct >= 70 ? 'attention' : 'neutral'}
        />

        <MetricBlock
          label="Gap atual"
          value={goalSafe > 0 ? formatBRL(gap) : '—'}
          helper={
            goalSafe <= 0
              ? 'Sem leitura de gap'
              : gap > 0
                ? 'Valor ainda necessário'
                : 'Resultado acima da meta'
          }
          tone={goalSafe > 0 && gap <= 0 ? 'good' : goalSafe > 0 ? 'attention' : 'neutral'}
        />
      </div>

      {!hasValidRange ? (
        <div
          style={{
            border: `1px solid ${CHART_UI.borderMuted}`,
            background: 'rgba(9, 11, 15, 0.46)',
            borderRadius: 16,
            padding: 22,
            color: CHART_UI.textMuted,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Não foi possível montar a evolução porque o período do simulador está inválido.
        </div>
      ) : !hasAnyOperationalData ? (
        <div
          style={{
            border: `1px solid ${CHART_UI.borderMuted}`,
            background: 'rgba(9, 11, 15, 0.46)',
            borderRadius: 16,
            padding: 24,
            display: 'grid',
            gap: 8,
          }}
        >
          <div
            style={{
              color: CHART_UI.textPrimary,
              fontSize: 14,
              fontWeight: 900,
            }}
          >
            Sem evolução para exibir
          </div>

          <div
            style={{
              color: CHART_UI.textMuted,
              fontSize: 13,
              lineHeight: 1.5,
              maxWidth: 760,
            }}
          >
            Ainda não existe faturamento registrado e nenhuma meta definida para este período. Assim que houver meta ou resultado real, o gráfico passa a mostrar a comparação acumulada.
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              border: `1px solid ${CHART_UI.borderMuted}`,
              background: 'rgba(9, 11, 15, 0.38)',
              borderRadius: 16,
              padding: '14px 14px 10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 6,
                padding: '0 2px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                }}
              >
                <LegendItem type="bar" label="Resultado diário" />
                <LegendItem type="real" label="Real acumulado" />
                {goalSafe > 0 ? <LegendItem type="goal" label="Meta acumulada" /> : null}
              </div>

              {goalSafe > 0 ? (
                <div
                  style={{
                    color: CHART_UI.textSubtle,
                    fontSize: 11.5,
                    fontWeight: 750,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Gap até hoje:{' '}
                  <strong
                    style={{
                      color: todayGap <= 0 ? CHART_UI.green : CHART_UI.amber,
                    }}
                  >
                    {formatBRL(todayGap)}
                  </strong>
                </div>
              ) : null}
            </div>

            <svg
              width="100%"
              viewBox={`0 0 ${W} ${H}`}
              style={{
                display: 'block',
                cursor: 'crosshair',
              }}
              onMouseMove={onMove}
              onMouseLeave={onLeave}
            >
              {todayIndex >= 0 && todayIndex < points.length - 1 ? (
                <rect
                  x={x(todayIndex + 1)}
                  y={padT}
                  width={x(points.length - 1) - x(todayIndex + 1)}
                  height={innerH}
                  fill="rgba(255,255,255,0.018)"
                />
              ) : null}

              <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="rgba(148, 163, 184, 0.12)" />
              <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke="rgba(148, 163, 184, 0.12)" />

              {gridVals.map((v) => {
                const y = yAcc(v)

                if (y < padT + 4 || v <= 0) return null

                return (
                  <g key={v}>
                    <line x1={padL} y1={y} x2={padL + innerW} y2={y} stroke="rgba(148, 163, 184, 0.065)" />
                    <text x={padL - 6} y={y + 4} fontSize="10" fill="#64748b" textAnchor="end">
                      {formatBRShort(v)}
                    </text>
                  </g>
                )
              })}

              <text x={padL - 6} y={padT + innerH + 4} fontSize="10" fill="#64748b" textAnchor="end">
                0
              </text>

              {xLabels.map(({ i, label }) => (
                <text key={i} x={x(i)} y={padT + innerH + 16} fontSize="10" fill="#64748b" textAnchor="middle">
                  {label}
                </text>
              ))}

              {todayIndex >= 0 ? (
                <g>
                  <line
                    x1={x(todayIndex)}
                    y1={padT}
                    x2={x(todayIndex)}
                    y2={padT + innerH}
                    stroke="rgba(96, 165, 250, 0.32)"
                    strokeDasharray="3 3"
                  />
                  <text x={x(todayIndex)} y={padT - 5} fontSize="9" fill="#93c5fd" textAnchor="middle" fontWeight="800">
                    HOJE
                  </text>
                </g>
              ) : null}

              {points.map((p, i) => {
                const bw = Math.max(2, (innerW / Math.max(1, points.length)) * 0.68)
                const bx = x(i) - bw / 2
                const by = yDaily(p.daily)
                const bh = padT + innerH - by

                if (bh < 0.5) return null

                const isWeekend = !p.isBusiness
                const isFuture = p.isFuture

                return (
                  <rect
                    key={p.date}
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    rx={2}
                    fill={
                      isFuture
                        ? 'rgba(148, 163, 184, 0.035)'
                        : isWeekend
                          ? 'rgba(148, 163, 184, 0.055)'
                          : 'rgba(96, 165, 250, 0.24)'
                    }
                    stroke={isFuture ? 'none' : 'rgba(96, 165, 250, 0.13)'}
                  />
                )
              })}

              {points.length > 1 ? (
                <>
                  <polygon
                    points={`${x(0).toFixed(2)},${(padT + innerH).toFixed(2)} ${realLine} ${x(points.length - 1).toFixed(2)},${(padT + innerH).toFixed(2)}`}
                    fill="url(#phase18RealGradient)"
                  />

                  <defs>
                    <linearGradient id="phase18RealGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(96, 165, 250, 0.13)" />
                      <stop offset="100%" stopColor="rgba(96, 165, 250, 0.0)" />
                    </linearGradient>
                  </defs>
                </>
              ) : null}

              {goalSafe > 0 && points.length > 1 ? (
                <polyline
                  points={metaLine}
                  fill="none"
                  stroke="rgba(203, 213, 225, 0.62)"
                  strokeWidth={1.8}
                  strokeDasharray="6 4"
                />
              ) : null}

              {points.length > 1 ? (
                <polyline
                  points={realLine}
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth={2.4}
                />
              ) : null}

              {hoverData ? (
                <>
                  <line
                    x1={x(hover.i)}
                    y1={padT}
                    x2={x(hover.i)}
                    y2={padT + innerH}
                    stroke="rgba(203, 213, 225, 0.18)"
                    strokeDasharray="4 4"
                  />

                  <circle
                    cx={x(hover.i)}
                    cy={yAcc(hoverRealAcc)}
                    r={4}
                    fill="#60a5fa"
                    stroke="rgba(248, 250, 252, 0.42)"
                    strokeWidth={1}
                  />

                  {goalSafe > 0 ? (
                    <circle
                      cx={x(hover.i)}
                      cy={yAcc(hoverMetaAcc)}
                      r={3}
                      fill="none"
                      stroke="rgba(203, 213, 225, 0.64)"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                    />
                  ) : null}
                </>
              ) : null}
            </svg>
          </div>

          {hoverData && tooltip ? (
            <div
              style={{
                position: 'absolute',
                left: tooltip.left,
                top: tooltip.top,
                width: 270,
                pointerEvents: 'none',
                border: `1px solid ${CHART_UI.borderSoft}`,
                background: 'linear-gradient(135deg, rgba(13, 15, 20, 0.98) 0%, rgba(18, 22, 33, 0.98) 100%)',
                borderRadius: 14,
                padding: '12px 14px',
                boxShadow: '0 16px 34px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 950,
                    color: CHART_UI.textPrimary,
                  }}
                >
                  {hoverData.date}
                </span>

                <span
                  style={{
                    fontSize: 9.5,
                    padding: '3px 7px',
                    borderRadius: 999,
                    background: hoverData.isFuture
                      ? 'rgba(148, 163, 184, 0.08)'
                      : hoverData.isBusiness
                        ? 'rgba(96, 165, 250, 0.12)'
                        : 'rgba(148, 163, 184, 0.08)',
                    color: hoverData.isFuture
                      ? CHART_UI.textSubtle
                      : hoverData.isBusiness
                        ? '#93c5fd'
                        : CHART_UI.textSubtle,
                    fontWeight: 800,
                  }}
                >
                  {hoverData.isFuture ? 'Futuro' : hoverData.isBusiness ? 'Dia útil' : 'Fim de sem.'}
                </span>
              </div>

              <div
                style={{
                  marginTop: 9,
                  display: 'grid',
                  gap: 6,
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: CHART_UI.textMuted }}>Resultado diário</span>
                  <strong style={{ color: '#93c5fd' }}>{formatBRL(hoverData.daily)}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: CHART_UI.textMuted }}>Real acumulado</span>
                  <strong style={{ color: CHART_UI.textPrimary }}>{formatBRL(hoverRealAcc)}</strong>
                </div>

                {goalSafe > 0 ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ color: CHART_UI.textMuted }}>Meta acumulada</span>
                      <strong style={{ color: CHART_UI.textPrimary }}>{formatBRL(hoverMetaAcc)}</strong>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        paddingTop: 6,
                        borderTop: '1px solid rgba(148, 163, 184, 0.10)',
                        marginTop: 3,
                      }}
                    >
                      <span style={{ color: CHART_UI.textMuted }}>Gap no dia</span>
                      <strong
                        style={{
                          color: hoverMetaAcc - hoverRealAcc <= 0 ? CHART_UI.green : CHART_UI.red,
                        }}
                      >
                        {formatBRL(hoverMetaAcc - hoverRealAcc)}
                      </strong>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            style={{
              marginTop: 12,
              color: CHART_UI.textSubtle,
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            Leitura: as barras mostram o resultado diário. A linha azul mostra o acumulado real. A linha tracejada mostra a meta acumulada distribuída pelos dias úteis.
          </div>
        </>
      )}
    </div>
  )
}
