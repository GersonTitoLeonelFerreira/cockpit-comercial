'use client'

import { useState } from 'react'
import ConversationCopilot from './ConversationCopilot'
import type { SalesCycle } from '@/app/types/sales_cycles'

type SalesCycleWithLead = SalesCycle & {
  leads?: {
    id?: string
    name?: string
    phone?: string | null
    email?: string | null
  }
}

export default function CopilotTogglePanel({ cycle }: { cycle: SalesCycleWithLead }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      style={{
        background: '#0d0f14',
        border: '1px solid #1a1d2e',
        borderRadius: 16,
        padding: open ? 16 : 18,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: '#3b82f6',
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Copiloto Comercial
          </div>

          <div
            style={{
              color: '#edf2f7',
              fontSize: 16,
              fontWeight: 900,
              lineHeight: 1.25,
            }}
          >
            Analisar conversa com IA
          </div>

          {!open && (
            <div
              style={{
                marginTop: 6,
                color: '#8fa3bc',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Abra somente quando quiser colar uma conversa, gerar leitura comercial ou atualizar o ciclo.
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          style={{
            border: '1px solid rgba(59,130,246,0.35)',
            background: open ? 'rgba(239,68,68,0.10)' : 'rgba(59,130,246,0.14)',
            color: open ? '#fca5a5' : '#93c5fd',
            borderRadius: 12,
            padding: '10px 14px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: 'nowrap',
          }}
        >
          {open ? 'Fechar Copiloto' : 'Abrir Copiloto'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 16 }}>
          <ConversationCopilot cycle={cycle} />
        </div>
      )}
    </div>
  )
}