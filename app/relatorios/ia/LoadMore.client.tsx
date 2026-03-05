'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

function buildHref(pathname: string, params: URLSearchParams) {
  const q = params.toString()
  return q ? `${pathname}?${q}` : pathname
}

export default function LoadMore({
  currentLimit,
  step = 50,
  max = 500,
  disabled,
}: {
  currentLimit: number
  step?: number
  max?: number
  disabled?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const canLoadMore = !disabled && currentLimit < max

  return (
    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
      <button
        type="button"
        disabled={!canLoadMore}
        onClick={() => {
          const params = new URLSearchParams(sp?.toString())
          const next = Math.min(max, currentLimit + step)
          params.set('limit', String(next))
          router.push(buildHref(pathname, params))
          router.refresh()
        }}
        style={{
          fontSize: 13,
          padding: '10px 14px',
          borderRadius: 12,
          border: '1px solid #2a2a2a',
          background: canLoadMore ? '#111' : '#0b0b0b',
          color: 'white',
          cursor: canLoadMore ? 'pointer' : 'not-allowed',
          opacity: canLoadMore ? 1 : 0.6,
        }}
      >
        {canLoadMore ? `Carregar mais ${step}` : 'Limite máximo atingido'}
      </button>
    </div>
  )
}
