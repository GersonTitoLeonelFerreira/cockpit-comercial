'use client'

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Placement = 'auto' | 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function InfoTip({
  title,
  ariaLabel,
  children,
  width = 380,
  placement = 'auto',
}: {
  title: string
  ariaLabel?: string
  children: React.ReactNode
  width?: number
  placement?: Placement
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const btnRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  const contentId = useId()

  // Position state
  const [pos, setPos] = useState<{ top: number; left: number; origin: 'top' | 'bottom' }>({
    top: 0,
    left: 0,
    origin: 'top',
  })

  useEffect(() => setMounted(true), [])

  // Close on ESC + click outside
  useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    function onPointerDown(e: MouseEvent | PointerEvent) {
      const target = e.target as Node | null
      if (!target) return

      const btn = btnRef.current
      const pop = popRef.current

      // click no botão: deixa o onClick cuidar
      if (btn && btn.contains(target)) return

      // click dentro do popover: não fecha
      if (pop && pop.contains(target)) return

      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  // Reposition on open + on resize/scroll
  const computePosition = () => {
    const btn = btnRef.current
    if (!btn) return

    const r = btn.getBoundingClientRect()

    const vw = window.innerWidth
    const vh = window.innerHeight

    const w = clamp(width, 280, Math.min(420, vw - 16))
    const gap = 8

    // prefer bottom, but if doesn't fit, use top
    const spaceBottom = vh - r.bottom
    const spaceTop = r.top

    let origin: 'top' | 'bottom' = 'top'
    let top = r.bottom + gap

    const shouldFlipToTop = spaceBottom < 240 && spaceTop > spaceBottom
    if (placement.startsWith('top') || (placement === 'auto' && shouldFlipToTop)) {
      origin = 'bottom'
      top = r.top - gap
    }

    const isEnd = placement.endsWith('end')
    const isStart = placement.endsWith('start')

    let left = r.right - w // end
    if (isStart) left = r.left
    if (placement === 'auto' || (!isStart && !isEnd)) {
      // auto: align right edge to button, but clamp in viewport
      left = r.right - w
    }

    // clamp inside viewport with small padding
    const pad = 8
    left = clamp(left, pad, vw - w - pad)

    // If opening to top, we use translateY(-100%) with origin bottom.
    // So top is the anchor point.
    setPos({ top, left, origin })
  }

  useLayoutEffect(() => {
    if (!open) return
    computePosition()

    function onReflow() {
      computePosition()
    }

    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true) // capture scroll from containers too
    return () => {
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, width, placement])

  const tipButtonStyle: React.CSSProperties = useMemo(
    () => ({
      marginLeft: 6,
      width: 16,
      height: 16,
      borderRadius: 999,
      border: '1px solid rgba(255,255,255,0.18)',
      background: open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
      color: 'rgba(255,255,255,0.92)',
      fontSize: 11,
      fontWeight: 900,
      lineHeight: '16px',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0.95,
      boxShadow: open ? '0 0 0 2px rgba(255,255,255,0.06)' : 'none',
      flex: '0 0 auto',
    }),
    [open],
  )

  const overlay = open ? (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'transparent',
      }}
      // click overlay will close via document listener, but this makes it "feel" modal
    />
  ) : null

  const popover = open ? (
    <div
      ref={popRef}
      id={contentId}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      style={{
        position: 'fixed',
        zIndex: 9999,
        width: clamp(width, 280, 420),
        maxWidth: 'min(92vw, 420px)',
        left: pos.left,
        top: pos.top,
        transform: pos.origin === 'bottom' ? 'translateY(-100%)' : 'translateY(0)',
        border: '1px solid rgba(255,255,255,0.14)',
        background: '#0f0f0f',
        borderRadius: 12,
        padding: 12,
        boxShadow: '0 14px 34px rgba(0,0,0,0.62)',
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>{title}</div>

      <div
        style={{
          fontSize: 12,
          opacity: 0.9,
          lineHeight: 1.55,
          maxHeight: '60vh',
          overflow: 'auto',
          paddingRight: 4,
        }}
      >
        {children}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, opacity: 0.55 }}>
        Dica: clique fora ou pressione ESC para fechar.
      </div>
    </div>
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel ?? `Ajuda: ${title}`}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((v) => !v)}
        style={tipButtonStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.06)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = open ? '0 0 0 2px rgba(255,255,255,0.06)' : 'none'
        }}
      >
        !
      </button>

      {mounted ? createPortal(<>{overlay}{popover}</>, document.body) : null}
    </>
  )
}