'use client'

import React, { useMemo, useRef, useState } from 'react'
import { RevenueDayPoint } from '@/app/types/simulator'

function formatBRL(v: number) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatBRShort(v: number) {
  const n = Number(v) || 0
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace('.', ',') + 'k'
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
  startDate: string // YYYY-MM-DD (ou com hora)
  endDate: string // YYYY-MM-DD (ou com hora)
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const W = 860
  const H = 260
  const padL = 44
  const padR = 18
  const padT = 28
  const padB = 34

  const [hover, setHover] = useState<{
    i: number
    xPx: number
    yPx: number
  } | null>(null)

  const {
    points,
    maxDaily,
    maxAcc,
    metaByIndex,
    realAccByIndex,
    businessCount,
    totalReal,
    lastDate,
  } = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of series) map.set(p.date, Number(p.value || 0))

    const start = new Date(toYMD(startDate) + 'T00:00:00')
    const end = new Date(toYMD(endDate) + 'T00:00:00')
    const businessSet = getBusinessDaysSet(start, end)

    const pts: { date: string; daily: number; acc: number; isBusiness: boolean }[] = []
    let acc = 0
    let maxD = 0
    let maxA = 0

    const d = new Date(start)
    while (d <= end) {
      const key = d.toISOString().slice(0, 10)
      const daily = map.get(key) ?? 0
      acc += daily
      const isBusiness = businessSet.has(key)

      maxD = Math.max(maxD, daily)
      maxA = Math.max(maxA, acc)

      pts.push({ date: key, daily, acc, isBusiness })
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
    }
  }, [series, goal, startDate, endDate])

  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const yDaily = (v: number) => padT + innerH - (v / Math.max(1, maxDaily)) * innerH
  const yAcc = (v: number) => padT + innerH - (v / Math.max(1, maxAcc)) * innerH
  const x = (i: number) => padL + (i / Math.max(1, points.length - 1)) * innerW

  const realLine = points.map((_, i) => `${x(i).toFixed(2)},${yAcc(realAccByIndex[i]).toFixed(2)}`).join(' ')
  const metaLine = points.map((_, i) => `${x(i).toFixed(2)},${yAcc(metaByIndex[i]).toFixed(2)}`).join(' ')

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v))
  }

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!containerRef.current) return

    // posição do mouse no viewBox
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * W
    const relY = ((e.clientY - rect.top) / rect.height) * H

    // converte X em índice (aproximação)
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

  // tooltip position (em px do container, não do SVG)
  const tooltip = useMemo(() => {
    if (!hover || !containerRef.current) return null

    // mapear x/y do viewBox pra px do container
    const box = containerRef.current.getBoundingClientRect()
    const xPx = (hover.xPx / W) * box.width
    const yPx = (hover.yPx / H) * box.height

    // deixa o tooltip "fugir" do cursor pra não tremer
    const left = clamp(xPx + 12, 8, box.width - 280)
    const top = clamp(yPx + 12, 8, box.height - 140)

    return { left, top }
  }, [hover])

  return (
    <div
      ref={containerRef}
      style={{
        border: '1px solid #1a1d2e',
        background: '#0d0f14',
        borderRadius: 12,
        padding: 16,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <div style={{ fontWeight: 900, color: '#edf2f7' }}>{title}</div>
        <div style={{ fontSize: 12, color: '#8fa3bc' }}>
          Real: <b>{formatBRL(totalReal)}</b> • Meta: <b>{formatBRL(goal)}</b> • Dias úteis: <b>{businessCount}</b>
          {lastDate ? <span style={{ opacity: 0.6 }}> • até {lastDate}</span> : null}
        </div>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ marginTop: 10, display: 'block', cursor: 'crosshair' }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {/* eixos */}
        <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="rgba(255,255,255,0.14)" />
        <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke="rgba(255,255,255,0.14)" />

        {/* grid horizontal (3 linhas) */}
        {[0.25, 0.5, 0.75].map((k) => {
          const y = padT + innerH * k
          return <line key={k} x1={padL} y1={y} x2={padL + innerW} y2={y} stroke="rgba(255,255,255,0.06)" />
        })}

        {/* barras diário */}
        {points.map((p, i) => {
          const bw = (innerW / Math.max(1, points.length)) * 0.72
          const bx = x(i) - bw / 2
          const by = yDaily(p.daily)
          const bh = padT + innerH - by
          const isWeekend = !p.isBusiness
          return (
            <rect
              key={p.date}
              x={bx}
              y={by}
              width={bw}
              height={bh}
              fill={isWeekend ? 'rgba(255,255,255,0.06)' : 'rgba(110,231,183,0.18)'}
              stroke="rgba(255,255,255,0.08)"
            />
          )
        })}

        {/* linhas acumuladas */}
        <polyline points={metaLine} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={2} strokeDasharray="6 6" />
        <polyline points={realLine} fill="none" stroke="rgba(110,231,183,0.95)" strokeWidth={2.6} />

        {/* hover: linha vertical + ponto */}
        {hoverData ? (
          <>
            <line
              x1={x(hover!.i)}
              y1={padT}
              x2={x(hover!.i)}
              y2={padT + innerH}
              stroke="rgba(255,255,255,0.22)"
              strokeDasharray="4 4"
            />
            <circle cx={x(hover!.i)} cy={yAcc(hoverRealAcc)} r={4} fill="rgba(110,231,183,0.95)" />
          </>
        ) : null}

        {/* legenda */}
        <g transform={`translate(${padL}, ${18})`}>
          <rect x="0" y="-10" width="10" height="10" fill="rgba(110,231,183,0.18)" stroke="rgba(255,255,255,0.08)" />
          <text x="16" y="-2" fontSize="11" fill="rgba(255,255,255,0.75)">Diário</text>

          <line x1="86" y1="-5" x2="106" y2="-5" stroke="rgba(110,231,183,0.95)" strokeWidth="2.6" />
          <text x="112" y="-2" fontSize="11" fill="rgba(255,255,255,0.75)">Real acumulado</text>

          <line x1="232" y1="-5" x2="252" y2="-5" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeDasharray="6 6" />
          <text x="258" y="-2" fontSize="11" fill="rgba(255,255,255,0.75)">Meta acumulada (linear)</text>
        </g>

        {/* labels de y (top/bottom) */}
        <text x={8} y={padT + 8} fontSize="11" fill="rgba(255,255,255,0.55)">
          {formatBRShort(maxAcc)}
        </text>
        <text x={8} y={padT + innerH} fontSize="11" fill="rgba(255,255,255,0.55)">
          0
        </text>
      </svg>

      {/* tooltip HTML (mais fácil de estilizar do que <text> no SVG) */}
      {hoverData && tooltip ? (
        <div
          style={{
            position: 'absolute',
            left: tooltip.left,
            top: tooltip.top,
            width: 280,
            pointerEvents: 'none',
            border: '1px solid #1a1d2e',
            background: 'rgba(13,15,20,0.97)',
            borderRadius: 10,
            padding: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900 }}>{hoverData.date}</div>

          <div style={{ marginTop: 8, display: 'grid', gap: 6, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ opacity: 0.75 }}>Diário</span>
              <b style={{ color: '#6ee7b7' }}>{formatBRL(hoverData.daily)}</b>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ opacity: 0.75 }}>Real acumulado</span>
              <b>{formatBRL(hoverRealAcc)}</b>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ opacity: 0.75 }}>Meta acumulada (linear)</span>
              <b>{formatBRL(hoverMetaAcc)}</b>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ opacity: 0.75 }}>Gap no dia (meta - real)</span>
              <b style={{ color: hoverMetaAcc - hoverRealAcc <= 0 ? '#6ee7b7' : '#ffb3b3' }}>
                {formatBRL(hoverMetaAcc - hoverRealAcc)}
              </b>
            </div>

            <div style={{ marginTop: 4, fontSize: 11, opacity: 0.65 }}>
              {hoverData.isBusiness ? 'Dia útil' : 'Fim de semana'}
            </div>
          </div>
        </div>
      ) : null}

<div style={{ marginTop: 8, fontSize: 11, color: '#546070' }}>
        Linhas: acumulado real vs acumulado ideal (meta distribuída pelos dias úteis). Barras: valor diário.
      </div>
    </div>
  )
}