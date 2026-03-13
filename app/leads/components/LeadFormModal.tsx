'use client'

import { useState } from 'react'
import LeadFormComplete from './LeadFormComplete'

interface LeadFormModalProps {
  companyId: string
  userId: string
  trigger?: React.ReactNode
}

export default function LeadFormModal({ companyId, userId, trigger }: LeadFormModalProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {trigger ? (
        <div onClick={() => setIsOpen(true)}>
          {trigger}
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #2a2a2a',
            background: '#111',
            color: 'white',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          + Criar Lead
        </button>
      )}

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: 12,
              border: '1px solid #2a2a2a',
              maxWidth: '800px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <LeadFormComplete
              companyId={companyId}
              userId={userId}
              onClose={() => setIsOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}