'use client'

import * as React from 'react'

import { getGenericCommercialMethodGuidance } from '@/app/lib/commercial-config/assisted-method-construction'
import { STAGE_QUESTIONS } from '@/app/lib/commercial-config/guided-journey/question-registry-stage'
import {
  getNextQuestion,
  getPreviousQuestion,
  getQuestionById,
  getVisibleQuestions,
  isQuestionAnswered,
  isQuestionVisible,
} from '@/app/lib/commercial-config/guided-journey/types'
import type {
  CommercialMethodConstructionStageDraft,
  CommercialMethodStageAssistiveSuggestions,
} from '@/app/types/commercial-method-construction'

import GuidedQuestionRenderer, { GJ_DS } from './GuidedQuestionRenderer'
import QuestionShell from './QuestionShell'

interface Props {
  stage: CommercialMethodConstructionStageDraft
  onChange: (next: CommercialMethodConstructionStageDraft) => void
  assist?: CommercialMethodStageAssistiveSuggestions | null
  onDone: () => void
}

const ASSIST_FIELD_MAP: Record<string, keyof CommercialMethodStageAssistiveSuggestions> = {
  E05: 'completion_criteria',
  E12: 'recommended_questions',
  E13: 'common_mistakes',
}

export default function GuidedStageJourney({ stage, onChange, assist, onDone }: Props) {
  const [viewingQuestionId, setViewingQuestionId] = React.useState<string | null>(null)

  const visible = getVisibleQuestions(STAGE_QUESTIONS, stage)
  const nextQuestion = getNextQuestion(STAGE_QUESTIONS, stage)
  const activeQuestion = viewingQuestionId
    ? getQuestionById(STAGE_QUESTIONS, viewingQuestionId)
    : nextQuestion

  if (!activeQuestion || (viewingQuestionId && !isQuestionVisible(activeQuestion, stage))) {
    if (nextQuestion) {
      setViewingQuestionId(null)
      return null
    }

    return (
      <div
        style={{
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(134,239,172,0.2)',
          borderRadius: GJ_DS.radius,
          padding: 18,
        }}
      >
        <strong style={{ color: GJ_DS.greenSoft, fontSize: 13 }}>Etapa detalhada</strong>
        <p style={{ color: GJ_DS.textSecondary, fontSize: 11, lineHeight: 1.6, marginTop: 8 }}>
          Você pode revisar qualquer resposta ou seguir para a próxima etapa.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            onClick={onDone}
            style={{ background: GJ_DS.blue, border: 0, borderRadius: GJ_DS.radius, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 850, padding: '10px 16px' }}
          >
            Concluir esta etapa
          </button>
          <button
            type="button"
            onClick={() => setViewingQuestionId(visible[0]?.id ?? null)}
            style={{ background: 'transparent', border: 0, color: GJ_DS.textSecondary, cursor: 'pointer', fontSize: 11 }}
          >
            Revisar respostas
          </button>
        </div>
      </div>
    )
  }

  const position = visible.findIndex((question) => question.id === activeQuestion.id) + 1
  const currentValue = activeQuestion.getValue(stage)
  const isAnswered = isQuestionAnswered(activeQuestion, stage)
  const genericGuidance =
    typeof currentValue === 'string' ? getGenericCommercialMethodGuidance(currentValue) : null

  const assistKey = ASSIST_FIELD_MAP[activeQuestion.id]
  const suggestions = assistKey && assist ? assist[assistKey] : []
  const currentList = Array.isArray(currentValue) ? (currentValue as string[]) : []
  const suggestionsToOffer = suggestions.filter((item) => !currentList.includes(item))

  function handleChange(nextValue: unknown) {
    onChange(activeQuestion!.setValue(stage, nextValue))
  }

  function handleContinue() {
    setViewingQuestionId(null)
  }

  function handleBack() {
    const previous = getPreviousQuestion(STAGE_QUESTIONS, stage, activeQuestion!.id)
    setViewingQuestionId(previous?.id ?? null)
  }

  return (
    <QuestionShell
      chapterLabel="Capítulo 5 de 5 · Construindo seu método"
      progressLabel={`Pergunta ${position} de ${visible.length} desta etapa`}
      progressPercent={visible.length > 0 ? (position / visible.length) * 100 : 0}
      title={activeQuestion.title}
      helper={activeQuestion.helper}
      whyItMatters={activeQuestion.whyItMatters}
      example={activeQuestion.example}
      microfeedback={genericGuidance ? [genericGuidance] : undefined}
      canGoBack={Boolean(getPreviousQuestion(STAGE_QUESTIONS, stage, activeQuestion.id))}
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
      {suggestionsToOffer.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: GJ_DS.textMuted, fontSize: 10 }}>Sugestões da Yolen com base no seu diagnóstico:</span>
          {suggestionsToOffer.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onChange(activeQuestion!.setValue(stage, [...currentList, item]))}
              style={{
                background: GJ_DS.surfaceBg,
                border: `1px solid ${GJ_DS.borderStrong}`,
                borderRadius: GJ_DS.radius,
                color: GJ_DS.blueSoft,
                cursor: 'pointer',
                fontSize: 11,
                padding: '9px 10px',
                textAlign: 'left',
              }}
            >
              + {item}
            </button>
          ))}
        </div>
      )}
    </QuestionShell>
  )
}
