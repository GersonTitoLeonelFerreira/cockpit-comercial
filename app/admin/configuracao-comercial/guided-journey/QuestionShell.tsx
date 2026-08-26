'use client'

import * as React from 'react'

import { GJ_DS, gjInputStyle } from './GuidedQuestionRenderer'

interface QuestionShellProps {
  chapterLabel: string
  progressLabel: string
  progressPercent: number
  title: string
  helper?: string
  whyItMatters?: string
  example?: string
  microfeedback?: string[]
  canGoBack: boolean
  onBack: () => void
  onContinue: () => void
  continueLabel?: string
  continueDisabled?: boolean
  onSaveForLater: () => void
  savingLabel: string
  children: React.ReactNode
}

export default function QuestionShell({
  chapterLabel,
  progressLabel,
  progressPercent,
  title,
  helper,
  whyItMatters,
  example,
  microfeedback,
  canGoBack,
  onBack,
  onContinue,
  continueLabel = 'Continuar →',
  continueDisabled,
  onSaveForLater,
  savingLabel,
  children,
}: QuestionShellProps) {
  return (
    <div style={{ display: 'grid', gap: 14, margin: '0 auto', maxWidth: 640, width: '100%' }}>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          justifyContent: 'space-between',
        }}
      >
        {canGoBack ? (
          <button
            type="button"
            onClick={onBack}
            style={{ background: 'transparent', border: 0, color: GJ_DS.textSecondary, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0 }}
          >
            ← Voltar
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onSaveForLater}
          style={{ background: 'transparent', border: 0, color: GJ_DS.textMuted, cursor: 'pointer', fontSize: 11 }}
        >
          Salvar e continuar depois
        </button>
      </div>

      <div>
        <div
          style={{
            color: GJ_DS.blueSoft,
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {chapterLabel}
        </div>
        <div
          style={{
            background: GJ_DS.surfaceBg,
            borderRadius: 999,
            height: 4,
            marginTop: 10,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              background: GJ_DS.blue,
              borderRadius: 999,
              height: '100%',
              transition: 'width 200ms ease',
              width: `${Math.min(100, Math.max(0, progressPercent))}%`,
            }}
          />
        </div>
        <div style={{ color: GJ_DS.textMuted, fontSize: 10, marginTop: 6 }}>{progressLabel}</div>
      </div>

      {microfeedback && microfeedback.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {microfeedback.map((text) => (
            <div
              key={text}
              style={{
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(96,165,250,0.22)',
                borderRadius: GJ_DS.radius,
                color: GJ_DS.blueSoft,
                fontSize: 12,
                lineHeight: 1.6,
                padding: '11px 13px',
              }}
            >
              {text}
            </div>
          ))}
        </div>
      )}

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
        <div>
          <h2 style={{ color: GJ_DS.textPrimary, fontSize: 21, fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>
            {title}
          </h2>
          {helper && (
            <p style={{ color: GJ_DS.textSecondary, fontSize: 13, lineHeight: 1.6, margin: '10px 0 0' }}>{helper}</p>
          )}
        </div>

        {children}

        {(whyItMatters || example) && (
          <div style={{ display: 'grid', gap: 6 }}>
            {whyItMatters && (
              <div style={{ color: GJ_DS.textMuted, fontSize: 11, lineHeight: 1.55 }}>
                <strong style={{ color: GJ_DS.textSecondary }}>Por que perguntamos: </strong>
                {whyItMatters}
              </div>
            )}
            {example && (
              <div style={{ color: GJ_DS.textMuted, fontSize: 11, lineHeight: 1.55 }}>
                <strong style={{ color: GJ_DS.textSecondary }}>Exemplo: </strong>
                {example}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ color: GJ_DS.textMuted, fontSize: 10 }}>{savingLabel}</div>
        <button
          type="button"
          onClick={onContinue}
          disabled={continueDisabled}
          style={{
            background: continueDisabled ? GJ_DS.surfaceBg : GJ_DS.blue,
            border: 0,
            borderRadius: GJ_DS.radius,
            color: continueDisabled ? GJ_DS.textMuted : '#fff',
            cursor: continueDisabled ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 850,
            padding: '12px 20px',
          }}
        >
          {continueLabel}
        </button>
      </div>
    </div>
  )
}

export { gjInputStyle }
