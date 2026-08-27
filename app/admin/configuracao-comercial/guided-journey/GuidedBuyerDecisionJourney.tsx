'use client'

import * as React from 'react'

import {
  getBuyerDecisionProfile,
  validateBuyerDecisionDraft,
} from '@/app/lib/commercial-config/buyer-decision-architecture'
import { buildBuyerDecisionMicrofeedback } from '@/app/lib/commercial-config/guided-journey/microfeedback'
import { BUYER_DECISION_QUESTIONS } from '@/app/lib/commercial-config/guided-journey/question-registry-buyer-decision'
import type { BuyerDecisionContext } from '@/app/lib/commercial-config/guided-journey/question-registry-buyer-decision'
import {
  getNextQuestion,
  getPreviousQuestion,
  getQuestionById,
  getVisibleQuestions,
  isQuestionAnswered,
  isQuestionVisible,
} from '@/app/lib/commercial-config/guided-journey/types'
import type { CommercialMethodBuilderData } from '@/app/types/commercial-method-builder'
import type { CommercialBuyerDecisionDraft } from '@/app/types/commercial-method-buyer-decision'

import GuidedQuestionRenderer, { GJ_DS } from './GuidedQuestionRenderer'
import QuestionShell from './QuestionShell'

interface Props {
  diagnosis: CommercialMethodBuilderData
  value: CommercialBuyerDecisionDraft
  onChange: (value: CommercialBuyerDecisionDraft) => void
  onConfirm: (value: CommercialBuyerDecisionDraft) => void
}

export default function GuidedBuyerDecisionJourney({ diagnosis, value, onChange, onConfirm }: Props) {
  const [viewingQuestionId, setViewingQuestionId] = React.useState<string | null>(null)
  const [seenMicrofeedback, setSeenMicrofeedback] = React.useState<Set<string>>(new Set())

  const context: BuyerDecisionContext = { diagnosis, decision: value }
  const visible = getVisibleQuestions(BUYER_DECISION_QUESTIONS, context)
  const nextQuestion = getNextQuestion(BUYER_DECISION_QUESTIONS, context)
  const activeQuestion = viewingQuestionId
    ? getQuestionById(BUYER_DECISION_QUESTIONS, viewingQuestionId)
    : nextQuestion

  if (!activeQuestion || (viewingQuestionId && !isQuestionVisible(activeQuestion, context))) {
    if (nextQuestion) {
      setViewingQuestionId(null)
      return null
    }

    const issues = validateBuyerDecisionDraft(diagnosis, value)
    const profile = getBuyerDecisionProfile(diagnosis, value)
    const depthText =
      profile.depth === 'light'
        ? 'Sua venda tende a ser curta e direta.'
        : profile.depth === 'moderate'
          ? 'Sua venda tem alguma complexidade: vale garantir descoberta e critérios claros antes de apresentar preço.'
          : 'Sua venda exige mais alinhamento porque várias pessoas e processos participam da decisão.'

    return (
      <div style={{ display: 'grid', gap: 14, margin: '0 auto', maxWidth: 640, width: '100%' }}>
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
            Entendemos como seus clientes decidem
          </h2>
          <p style={{ color: GJ_DS.blueSoft, fontSize: 12, lineHeight: 1.6, margin: 0 }}>{depthText}</p>
          {issues.length > 0 && (
            <div style={{ color: GJ_DS.yellowSoft, fontSize: 11, lineHeight: 1.6 }}>
              <strong>Complete estes pontos antes de continuar:</strong>
              <ul style={{ marginBottom: 0 }}>
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              onClick={() => onConfirm({ ...value, confirmed: true })}
              disabled={issues.length > 0}
              style={{
                background: issues.length > 0 ? GJ_DS.surfaceBg : GJ_DS.blue,
                border: 0,
                borderRadius: GJ_DS.radius,
                color: issues.length > 0 ? GJ_DS.textMuted : '#fff',
                cursor: issues.length > 0 ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 850,
                padding: '12px 18px',
              }}
            >
              Está correto, continuar
            </button>
            <button
              type="button"
              onClick={() => setViewingQuestionId(visible[0]?.id ?? null)}
              style={{ background: 'transparent', border: 0, color: GJ_DS.textSecondary, cursor: 'pointer', fontSize: 12 }}
            >
              Editar respostas
            </button>
          </div>
        </div>
      </div>
    )
  }

  const position = visible.findIndex((question) => question.id === activeQuestion.id) + 1
  const currentValue = activeQuestion.getValue(context)
  const microfeedback = buildBuyerDecisionMicrofeedback(diagnosis, value).filter((text) => !seenMicrofeedback.has(text))
  const isAnswered = isQuestionAnswered(activeQuestion, context)

  function handleChange(nextValue: unknown) {
    onChange(activeQuestion!.setValue(context, nextValue).decision)
  }

  function handleContinue() {
    setSeenMicrofeedback((current) => {
      const next = new Set(current)
      for (const text of microfeedback) next.add(text)
      return next
    })
    setViewingQuestionId(null)
  }

  function handleBack() {
    const previous = getPreviousQuestion(BUYER_DECISION_QUESTIONS, context, activeQuestion!.id)
    setViewingQuestionId(previous?.id ?? null)
  }

  return (
    <QuestionShell
      chapterLabel="Capítulo 4 de 5 · Como seus clientes decidem"
      progressLabel={`Pergunta ${position} de ${visible.length} deste capítulo`}
      progressPercent={visible.length > 0 ? (position / visible.length) * 100 : 0}
      title={activeQuestion.title}
      helper={activeQuestion.helper}
      whyItMatters={activeQuestion.whyItMatters}
      example={activeQuestion.example}
      microfeedback={microfeedback}
      canGoBack={Boolean(getPreviousQuestion(BUYER_DECISION_QUESTIONS, context, activeQuestion.id))}
      onBack={handleBack}
      onContinue={handleContinue}
      continueDisabled={!isAnswered}
      onSaveForLater={() => setViewingQuestionId(null)}
      savingLabel=""
    >
      <GuidedQuestionRenderer
        answerType={activeQuestion.answerType}
        options={activeQuestion.options}
        value={currentValue}
        onChange={handleChange}
      />
    </QuestionShell>
  )
}
