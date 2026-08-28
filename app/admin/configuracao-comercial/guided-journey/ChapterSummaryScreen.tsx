'use client'

import * as React from 'react'

import { GJ_DS } from './GuidedQuestionRenderer'
import type { ChapterSummaryBlock } from '@/app/lib/commercial-config/guided-journey/microfeedback'

interface ChapterSummaryScreenProps {
  chapterLabel: string
  blocks: ChapterSummaryBlock[]
  depthExplanation?: string
  onConfirm: () => void
  onEdit: () => void
}

export default function ChapterSummaryScreen({
  chapterLabel,
  blocks,
  depthExplanation,
  onConfirm,
  onEdit,
}: ChapterSummaryScreenProps) {
  return (
    <div style={{ display: 'grid', gap: 14, margin: '0 auto', maxWidth: 640, width: '100%' }}>
      <div style={{ color: GJ_DS.blueSoft, fontSize: 10, fontWeight: 850, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {chapterLabel}
      </div>
      <div
        style={{
          background: GJ_DS.cardBg,
          border: `1px solid ${GJ_DS.border}`,
          borderRadius: GJ_DS.radiusContainer,
          display: 'grid',
          gap: 16,
          padding: 26,
        }}
      >
        <h2 style={{ color: GJ_DS.textPrimary, fontSize: 20, fontWeight: 900, margin: 0 }}>
          O que entendemos até aqui
        </h2>

        {depthExplanation && (
          <p style={{ color: GJ_DS.blueSoft, fontSize: 12, lineHeight: 1.6, margin: 0 }}>{depthExplanation}</p>
        )}

        {blocks.map((block) => (
          <div
            key={block.key}
            style={{
              background: GJ_DS.surfaceBg,
              border: `1px solid ${GJ_DS.border}`,
              borderRadius: GJ_DS.radius,
              padding: 14,
            }}
          >
            <strong style={{ color: GJ_DS.textPrimary, fontSize: 12 }}>{block.title}</strong>
            <ul style={{ color: GJ_DS.textSecondary, fontSize: 12, lineHeight: 1.7, marginBottom: 0, marginTop: 8 }}>
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              background: GJ_DS.blue,
              border: 0,
              borderRadius: GJ_DS.radius,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 850,
              padding: '12px 18px',
            }}
          >
            Está correto, continuar
          </button>
          <button
            type="button"
            onClick={onEdit}
            style={{
              background: GJ_DS.surfaceBg,
              border: `1px solid ${GJ_DS.borderStrong}`,
              borderRadius: GJ_DS.radius,
              color: GJ_DS.textSecondary,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 750,
              padding: '11px 16px',
            }}
          >
            Editar respostas
          </button>
        </div>
      </div>
    </div>
  )
}
