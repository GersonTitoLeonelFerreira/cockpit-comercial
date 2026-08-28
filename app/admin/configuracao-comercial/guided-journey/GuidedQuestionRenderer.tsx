'use client'

import * as React from 'react'

import {
  editingTextToLines,
  linesToEditingText,
} from '@/app/lib/commercial-config/guided-journey/text-editing'
import type {
  GuidedAnswerType,
  GuidedQuestionOption,
} from '@/app/lib/commercial-config/guided-journey/types'
import type {
  CommercialBuilderSalesEventDetail,
} from '@/app/types/commercial-method-builder'
import type {
  CommercialBuyerDecisionEventCriterion,
} from '@/app/types/commercial-method-buyer-decision'

export const GJ_DS = {
  cardBg: '#141722',
  surfaceBg: '#111318',
  surfaceRaised: '#171a25',
  border: '#1a1d2e',
  borderStrong: '#252a3d',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  greenSoft: '#86efac',
  yellowSoft: '#fcd34d',
  radius: 8,
  radiusContainer: 12,
} as const

export const gjInputStyle: React.CSSProperties = {
  background: GJ_DS.surfaceBg,
  border: `1px solid ${GJ_DS.borderStrong}`,
  borderRadius: GJ_DS.radius,
  color: GJ_DS.textPrimary,
  fontFamily: 'inherit',
  fontSize: 14,
  lineHeight: 1.6,
  outline: 'none',
  padding: '12px 13px',
  width: '100%',
}

function OptionButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? 'rgba(59,130,246,0.16)' : GJ_DS.surfaceBg,
        border: `1px solid ${active ? 'rgba(96,165,250,0.5)' : GJ_DS.borderStrong}`,
        borderRadius: GJ_DS.radius,
        color: active ? GJ_DS.blueSoft : GJ_DS.textSecondary,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 750,
        padding: '11px 15px',
        textAlign: 'left',
        transition: 'all 120ms ease',
      }}
    >
      {active ? '✓ ' : ''}
      {label}
    </button>
  )
}

interface RendererProps {
  answerType: GuidedAnswerType
  options?: GuidedQuestionOption[]
  value: unknown
  onChange: (value: unknown) => void
}

const YES_NO_OPTIONS = [
  { value: 'true', label: 'Sim' },
  { value: 'false', label: 'Não' },
]

const YES_NO_SOMETIMES_OPTIONS = [
  { value: 'yes', label: 'Sim' },
  { value: 'sometimes', label: 'Às vezes' },
  { value: 'no', label: 'Não' },
]

const NEVER_SOMETIMES_OFTEN_OPTIONS = [
  { value: 'rarely', label: 'Raramente' },
  { value: 'sometimes', label: 'Às vezes' },
  { value: 'often', label: 'Frequentemente' },
]

export default function GuidedQuestionRenderer({ answerType, options, value, onChange }: RendererProps) {
  if (answerType === 'single_choice') {
    const current = (value as string) ?? ''
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {(options ?? []).map((option) => (
          <OptionButton
            key={option.value}
            label={option.label}
            active={current === option.value}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>
    )
  }

  if (answerType === 'multiple_choice') {
    const current = Array.isArray(value) ? (value as string[]) : []
    return (
      <div
        style={{
          display: 'grid',
          gap: 8,
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        }}
      >
        {(options ?? []).map((option) => {
          const checked = current.includes(option.value)
          return (
            <OptionButton
              key={option.value}
              label={option.label}
              active={checked}
              onClick={() =>
                onChange(
                  checked
                    ? current.filter((item) => item !== option.value)
                    : [...current, option.value],
                )
              }
            />
          )
        })}
      </div>
    )
  }

  if (answerType === 'yes_no') {
    const current = value as boolean | null
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {YES_NO_OPTIONS.map((option) => (
          <OptionButton
            key={option.value}
            label={option.label}
            active={current !== null && current !== undefined && String(current) === option.value}
            onClick={() => onChange(option.value === 'true')}
          />
        ))}
      </div>
    )
  }

  if (answerType === 'yes_no_sometimes') {
    const current = (value as string) ?? ''
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {YES_NO_SOMETIMES_OPTIONS.map((option) => (
          <OptionButton key={option.value} label={option.label} active={current === option.value} onClick={() => onChange(option.value)} />
        ))}
      </div>
    )
  }

  if (answerType === 'yes_no_rarely_often') {
    const current = (value as string) ?? ''
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {NEVER_SOMETIMES_OFTEN_OPTIONS.map((option) => (
          <OptionButton key={option.value} label={option.label} active={current === option.value} onClick={() => onChange(option.value)} />
        ))}
      </div>
    )
  }

  if (answerType === 'short_text') {
    return (
      <input
        value={(value as string) ?? ''}
        onChange={(event) => onChange(event.target.value)}
        style={gjInputStyle}
        placeholder="Digite sua resposta"
      />
    )
  }

  if (answerType === 'long_text') {
    return (
      <textarea
        rows={4}
        value={(value as string) ?? ''}
        onChange={(event) => onChange(event.target.value)}
        style={{ ...gjInputStyle, resize: 'vertical' }}
        placeholder="Digite sua resposta"
      />
    )
  }

  if (answerType === 'number') {
    return (
      <input
        type="number"
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        style={gjInputStyle}
      />
    )
  }

  if (answerType === 'multiline_list') {
    const current = Array.isArray(value) ? (value as string[]) : []
    return (
      <textarea
        rows={5}
        value={linesToEditingText(current)}
        onChange={(event) => onChange(editingTextToLines(event.target.value))}
        style={{ ...gjInputStyle, resize: 'vertical' }}
        placeholder="Uma resposta por linha"
      />
    )
  }

  if (answerType === 'compound_event_list') {
    const current = Array.isArray(value) ? (value as CommercialBuilderSalesEventDetail[]) : []
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        {current.map((detail, index) => (
          <div
            key={detail.event}
            style={{
              background: GJ_DS.surfaceRaised,
              border: `1px solid ${GJ_DS.border}`,
              borderRadius: GJ_DS.radius,
              display: 'grid',
              gap: 10,
              padding: 14,
            }}
          >
            <strong style={{ color: GJ_DS.textPrimary, fontSize: 13 }}>{detail.event}</strong>
            <div>
              <span style={{ color: GJ_DS.textSecondary, display: 'block', fontSize: 11, marginBottom: 6 }}>
                Isso acontece em toda venda?
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { value: 'always', label: 'Sempre' },
                  { value: 'sometimes', label: 'Somente em alguns casos' },
                  { value: 'optional', label: 'Opcional' },
                ].map((option) => (
                  <OptionButton
                    key={option.value}
                    label={option.label}
                    active={detail.frequency === option.value}
                    onClick={() => {
                      const next = [...current]
                      next[index] = { ...detail, frequency: option.value as typeof detail.frequency }
                      onChange(next)
                    }}
                  />
                ))}
              </div>
            </div>
            <div>
              <span style={{ color: GJ_DS.textSecondary, display: 'block', fontSize: 11, marginBottom: 6 }}>
                O que precisa acontecer para ele realmente ajudar a venda a avançar?
              </span>
              <textarea
                rows={2}
                value={detail.success_definition}
                onChange={(event) => {
                  const next = [...current]
                  next[index] = { ...detail, success_definition: event.target.value }
                  onChange(next)
                }}
                style={{ ...gjInputStyle, resize: 'vertical' }}
              />
            </div>
            <div>
              <span style={{ color: GJ_DS.textSecondary, display: 'block', fontSize: 11, marginBottom: 6 }}>
                Esse momento precisa mudar conforme o que já sabemos sobre o cliente?
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {YES_NO_SOMETIMES_OPTIONS.map((option) => (
                  <OptionButton
                    key={option.value}
                    label={option.label}
                    active={detail.depends_on_customer_knowledge === option.value}
                    onClick={() => {
                      const next = [...current]
                      next[index] = {
                        ...detail,
                        depends_on_customer_knowledge: option.value as typeof detail.depends_on_customer_knowledge,
                      }
                      onChange(next)
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (answerType === 'event_criteria_list') {
    const current = Array.isArray(value) ? (value as CommercialBuyerDecisionEventCriterion[]) : []
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {current.map((entry, index) => (
          <div
            key={entry.event}
            style={{
              background: GJ_DS.surfaceRaised,
              border: `1px solid ${GJ_DS.border}`,
              borderRadius: GJ_DS.radius,
              padding: 14,
            }}
          >
            <strong style={{ color: GJ_DS.textPrimary, fontSize: 13, display: 'block', marginBottom: 8 }}>
              {entry.event}
            </strong>
            <textarea
              rows={3}
              value={linesToEditingText(entry.criteria)}
              onChange={(event) => {
                const next = [...current]
                next[index] = { ...entry, criteria: editingTextToLines(event.target.value) }
                onChange(next)
              }}
              style={{ ...gjInputStyle, resize: 'vertical' }}
              placeholder="Um critério por linha"
            />
          </div>
        ))}
      </div>
    )
  }

  return null
}
