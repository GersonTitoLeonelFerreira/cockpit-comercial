'use client'

import { useMemo, useRef, useState } from 'react'
import type { RevenueDayPoint } from '@/app/types/simulator'

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

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

type HoverState = {
  i: number
  xPx: number
  yPx: number
  tooltipLeft: number
  tooltipTop: number
} | null

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

  const [hover, setHover] = useState<HoverState>(null)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

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
  } = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of series) map.set(p.date, Number(p.value || 0))

    const start = new Date(`${toYMD(startDate)}T00:00:00`)
    const end = new Date(`${toYMD(endDate)}T00:00:00`)
    const businessSet = getBusinessDaysSet(start, end)

    const pts: Array<{
      date: string
      daily: number
      acc: number
      isBusiness: boolean
      isFuture: boolean
    }> = []

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

      pts.push({ date: key, daily, acc, isBusiness, isFuture })
      d.setDate(d.getDate() + 1)
    }

    const businessDays = pts.filter((p) => p.isBusiness).length
    const businessCountSafe = Math.max(1, businessDays)

    let metaAcc = 0
    const metaByIdx: number[] = []
    for (const p of pts) {
      if (p.isBusiness) metaAcc += (Number(goal) || 0) / businessCountSafe
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
    }
  }, [series, goal, startDate, endDate, today])

  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const barZoneH = innerH * 0.35
  const accZoneH = innerH

  const yDaily = (v: number) => padT + innerH - (v / Math.max(1, maxDaily)) * barZoneH
  const yAcc = (v: number) => padT + innerH - (v / Math.max(1, maxAcc)) * accZoneH
  const x = (i: number) => padL + (i / Math.max(1, points.length - 1)) * innerW

  const realLine = points
    .map((_, i) => `${x(i).toFixed(2)},${yAcc(realAccByIndex[i]).toFixed(2)}`)
    .join(' ')

  const metaLine = points
    .map((_, i) => `${x(i).toFixed(2)},${yAcc(metaByIndex[i]).toFixed(2)}`)
    .join(' ')

  const gridVals = useMemo(() => niceGridValues(maxAcc, 4), [maxAcc])

  const xLabels = useMemo(() => {
    const labels: Array<{ i: number; label: string }> = []

    for (let i = 0; i < points.length; i++) {
      const day = parseInt(points[i].date.slice(8, 10), 10)
      if (
        i === 0 ||
        day === 7 ||
        day === 14 ||
        day === 21 ||
        day === 28 ||
        i === points.length - 1
      ) {
        if (labels.length && labels[labels.length - 1].i === i) continue
        labels.push({ i, label: points[i].date.slice(5).replace('-', '/') })
      }
    }

    return labels
  }, [points])

  const progressPct = goal > 0 ? Math.min(100, Math.round((totalReal / goal) * 100)) : 0

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const container = containerRef.current
    if (!container || points.length === 0) return

    const svgRect = e.currentTarget.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    const relX = ((e.clientX - svgRect.left) / svgRect.width) * W
    const relY = ((e.clientY - svgRect.top) / svgRect.height) * H

    const t = (relX - padL) / Math.max(1, innerW)
    const i = clamp(Math.round(t * (points.length - 1)), 0, Math.max(0, points.length - 1))

    const xPx = (relX / W) * containerRect.width
    const yPx = (relY / H) * containerRect.height

    const tooltipLeft = clamp(xPx + 12, 8, containerRect.width - 280)
    const tooltipTop = clamp(yPx + 12, 8, containerRect.height - 140)

    setHover({
      i,
      xPx: relX,
      yPx: relY,
      tooltipLeft,
      tooltipTop,
    })
  }

  function onLeave() {
    setHover(null)
  }

  const hoverData = hover ? points[hover.i] : null
  const hoverMetaAcc = hover ? metaByIndex[hover.i] : 0
  const hoverRealAcc = hover ? realAccByIndex[hover.i] : 0

  return (
    <div
      ref={containerRef}
      style={{
        border: '1px solid rgba(59,130,246,0.18)',
        background:
          'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0.02) 50%, rgba(13,15,20,0.95) 100%)',
        borderRadius: 14,
        padding: '18px 18px',
        position: 'relative',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(59,130,246,0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            fontWeight: 900,
            color: '#edf2f7',
            fontSize: 13,
            paddingLeft: 10,
            borderLeft: '2px solid rgba(59,130,246,0.4)',
          }}
        >
          {title}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {goal > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 60,
                  height: 6,
                  borderRadius: 3,
                  background: '#1a1d2e',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, progressPct)}%`,
                    height: '100%',
                    borderRadius: 3,
                    background:
                      progressPct >= 100
                        ? '#10b981'
                        : progressPct >= 50
                          ? '#60a5fa'
                          : '#f59e0b',
                    transition: 'width 300ms ease',
                  }}
                />
              </div>

              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: progressPct >= 100 ? '#10b981' : '#8fa3bc',
                }}
              >
                {progressPct}%
              </span>
            </div>
          )}

          <div style={{ fontSize: 11, color: '#546070' }}>
            Real: <b style={{ color: '#8fa3bc' }}>{formatBRL(totalReal)}</b> · Meta:{' '}
            <b style={{ color: '#8fa3bc' }}>{formatBRL(goal)}</b> · Dias úteis:{' '}
            <b style={{ color: '#8fa3bc' }}>{businessCount}</b>
            {lastDate ? <span style={{ opacity: 0.6 }}> · até {lastDate}</span> : null}
          </div>
        </div>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ marginTop: 6, display: 'block', cursor: 'crosshair' }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {todayIndex >= 0 && todayIndex < points.length - 1 && (
          <rect
            x={x(todayIndex + 1)}
            y={padT}
            width={x(points.length - 1) - x(todayIndex + 1)}
            height={innerH}
            fill="rgba(255,255,255,0.02)"
          />
        )}

        <line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={padT + innerH}
          stroke="rgba(255,255,255,0.10)"
        />
        <line
          x1={padL}
          y1={padT + innerH}
          x2={padL + innerW}
          y2={padT + innerH}
          stroke="rgba(255,255,255,0.10)"
        />

        {gridVals.map((v) => {
          const y = yAcc(v)
          if (y < padT + 4) return null

          return (
            <g key={v}>
              <line
                x1={padL}
                y1={y}
                x2={padL + innerW}
                y2={y}
                stroke="rgba(255,255,255,0.05)"
              />
              <text x={padL - 6} y={y + 4} fontSize="10" fill="#546070" textAnchor="end">
                {formatBRShort(v)}
              </text>
            </g>
          )
        })}

        <text x={padL - 6} y={padT + innerH + 4} fontSize="10" fill="#546070" textAnchor="end">
          0
        </text>

        {xLabels.map(({ i, label }) => (
          <text
            key={i}
            x={x(i)}
            y={padT + innerH + 16}
            fontSize="10"
            fill="#546070"
            textAnchor="middle"
          >
            {label}
          </text>
        ))}

        {todayIndex >= 0 && (
          <g>
            <line
              x1={x(todayIndex)}
              y1={padT}
              x2={x(todayIndex)}
              y2={padT + innerH}
              stroke="rgba(59,130,246,0.3)"
              strokeDasharray="3 3"
            />
            <text
              x={x(todayIndex)}
              y={padT - 4}
              fontSize="9"
              fill="#60a5fa"
              textAnchor="middle"
              fontWeight="700"
            >
              HOJE
            </text>
          </g>
        )}

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
                  ? 'rgba(255,255,255,0.03)'
                  : isWeekend
                    ? 'rgba(255,255,255,0.04)'
                    : 'rgba(59,130,246,0.25)'
              }
              stroke={isFuture ? 'none' : 'rgba(59,130,246,0.12)'}
            />
          )
        })}

        {points.length > 1 && (
          <polygon
            points={`${x(0).toFixed(2)},${(padT + innerH).toFixed(2)} ${realLine} ${x(points.length - 1).toFixed(2)},${(padT + innerH).toFixed(2)}`}
            fill="url(#realGradient)"
          />
        )}

        <defs>
          <linearGradient id="realGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(96,165,250,0.15)" />
            <stop offset="100%" stopColor="rgba(96,165,250,0.0)" />
          </linearGradient>
        </defs>

        <polyline
          points={metaLine}
          fill="none"
          stroke="rgba(255,255,255,0.40)"
          strokeWidth={1.8}
          strokeDasharray="6 4"
        />
        <polyline points={realLine} fill="none" stroke="#60a5fa" strokeWidth={2.4} />

        {hoverData && hover ? (
          <>
            <line
              x1={x(hover.i)}
              y1={padT}
              x2={x(hover.i)}
              y2={padT + innerH}
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="4 4"
            />
            <circle
              cx={x(hover.i)}
              cy={yAcc(hoverRealAcc)}
              r={4}
              fill="#60a5fa"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={1}
            />
            <circle
              cx={x(hover.i)}
              cy={yAcc(hoverMetaAcc)}
              r={3}
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          </>
        ) : null}

        <g transform={`translate(${padL + 4}, 22)`}>
          <rect
            x="0"
            y="-10"
            width="10"
            height="10"
            rx="2"
            fill="rgba(59,130,246,0.25)"
            stroke="rgba(59,130,246,0.12)"
          />
          <text x="14" y="-2" fontSize="10" fill="#8fa3bc">
            Diário
          </text>

          <line x1="60" y1="-5" x2="78" y2="-5" stroke="#60a5fa" strokeWidth="2.4" />
          <text x="82" y="-2" fontSize="10" fill="#8fa3bc">
            Real acumulado
          </text>

          <line
            x1="178"
            y1="-5"
            x2="196"
            y2="-5"
            stroke="rgba(255,255,255,0.40)"
            strokeWidth="1.8"
            strokeDasharray="6 4"
          />
          <text x="200" y="-2" fontSize="10" fill="#8fa3bc">
            Meta acumulada
          </text>
        </g>
      </svg>

      {hoverData && hover ? (
        <div
          style={{
            position: 'absolute',
            left: hover.tooltipLeft,
            top: hover.tooltipTop,
            width: 270,
            pointerEvents: 'none',
            border: '1px solid rgba(59,130,246,0.20)',
            background:
              'linear-gradient(135deg, rgba(13,15,20,0.98) 0%, rgba(59,130,246,0.06) 100%)',
            borderRadius: 12,
            padding: '12px 14px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(59,130,246,0.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#edf2f7' }}>
              {hoverData.date}
            </span>

            <span
              style={{
                fontSize: 9,
                padding: '2px 6px',
                borderRadius: 4,
                background: hoverData.isFuture
                  ? 'rgba(255,255,255,0.06)'
                  : hoverData.isBusiness
                    ? 'rgba(59,130,246,0.12)'
                    : 'rgba(255,255,255,0.06)',
                color: hoverData.isFuture
                  ? '#546070'
                  : hoverData.isBusiness
                    ? '#60a5fa'
                    : '#546070',
                fontWeight: 600,
              }}
            >
              {hoverData.isFuture
                ? 'Futuro'
                : hoverData.isBusiness
                  ? 'Dia útil'
                  : 'Fim de sem.'}
            </span>
          </div>

          <div style={{ marginTop: 8, display: 'grid', gap: 5, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ color: '#8fa3bc' }}>Diário</span>
              <b style={{ color: '#93c5fd' }}>{formatBRL(hoverData.daily)}</b>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ color: '#8fa3bc' }}>Real acumulado</span>
              <b style={{ color: '#edf2f7' }}>{formatBRL(hoverRealAcc)}</b>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ color: '#8fa3bc' }}>Meta acumulada</span>
              <b style={{ color: '#edf2f7' }}>{formatBRL(hoverMetaAcc)}</b>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                paddingTop: 4,
                borderTop: '1px solid rgba(255,255,255,0.06)',
                marginTop: 2,
              }}
            >
              <span style={{ color: '#8fa3bc' }}>Gap</span>
              <b style={{ color: hoverMetaAcc - hoverRealAcc <= 0 ? '#6ee7b7' : '#fca5a5' }}>
                {formatBRL(hoverMetaAcc - hoverRealAcc)}
              </b>
            </div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: '#4a5569',
          paddingLeft: 10,
          borderLeft: '2px solid rgba(59,130,246,0.15)',
        }}
      >
        Linhas: acumulado real vs acumulado ideal (meta distribuída pelos dias úteis). Barras:
        valor diário.
      </div>
    </div>
  )
}