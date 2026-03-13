'use client'

import React, { useState } from 'react'
import { useCallback } from 'react'

export function ReturnToPoolModal({
  isOpen,
  selectedCount,
  onClose,
  onConfirm,
  isLoading,
}: {
  isOpen: boolean
  selectedCount: number
  onClose: () => void
  onConfirm: () => Promise<void>
  isLoading: boolean
}) {
  const [localLoading, setLocalLoading] = useState(false)

  const handleClick = useCallback(async () => {
    if (localLoading || selectedCount === 0) return

    if (!confirm(`Devolver ${selectedCount} leads ao pool?`)) return

    setLocalLoading(true)
    try {
      await onConfirm()
    } finally {
      setLocalLoading(false)
    }
  }, [localLoading, selectedCount, onConfirm])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#111',
          border: '1px solid #333',
          borderRadius: 12,
          padding: 24,
          width: '90%',
          maxWidth: 400,
          color: 'white',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 20 }}>
          Devolver ao Pool
        </div>

        <div style={{ fontSize: 12, marginBottom: 20, opacity: 0.8 }}>
          Você tem certeza que deseja devolver <strong>{selectedCount}</strong> leads ao pool?
        </div>

        <button
          onClick={handleClick}
          disabled={localLoading || selectedCount === 0}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 6,
            border: 'none',
            background: !localLoading && selectedCount > 0 ? '#dc2626' : '#7f1d1d',
            color: '#fecaca',
            cursor: !localLoading && selectedCount > 0 ? 'pointer' : 'not-allowed',
            fontWeight: 900,
            fontSize: 12,
            marginBottom: 12,
            transition: 'all 200ms',
          }}
        >
          {localLoading ? '⏳ Devolvendo…' : '✓ Devolver Leads'}
        </button>

        <button
          onClick={onClose}
          disabled={localLoading}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: 6,
            border: '1px solid #2a2a2a',
            background: 'transparent',
            color: 'white',
            cursor: localLoading ? 'not-allowed' : 'pointer',
            fontWeight: 900,
            fontSize: 12,
            opacity: localLoading ? 0.5 : 1,
            transition: 'all 200ms',
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}