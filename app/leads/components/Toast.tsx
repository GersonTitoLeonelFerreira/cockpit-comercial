'use client'

import React, { useCallback, useEffect, useState } from 'react'

export type ToastItem = {
  id: string
  message: string
  type?: 'success' | 'error' | 'info'
}

type ToastProps = {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

function ToastMessage({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const bg = toast.type === 'error' ? '#7f1d1d' : toast.type === 'info' ? '#1e3a5f' : '#064e3b'
  const color = toast.type === 'error' ? '#fca5a5' : toast.type === 'info' ? '#93c5fd' : '#6ee7b7'
  const border = toast.type === 'error' ? '#ef4444' : toast.type === 'info' ? '#3b82f6' : '#10b981'

  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 3000)
    return () => clearTimeout(t)
  }, [toast.id, onDismiss])

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: '10px 16px',
        color,
        fontSize: 13,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        minWidth: 180,
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          color,
          cursor: 'pointer',
          fontSize: 14,
          lineHeight: 1,
          padding: 0,
          opacity: 0.7,
        }}
      >
        ✕
      </button>
    </div>
  )
}

export function ToastContainer({ toasts, onDismiss }: ToastProps) {
  if (toasts.length === 0) return null
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <ToastMessage toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  )
}

let _counter = 0

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `toast-${Date.now()}-${++_counter}`
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, addToast, dismissToast }
}
