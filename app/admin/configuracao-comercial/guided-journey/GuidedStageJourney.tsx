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

type StageSummaryRow = {
  label: string
  items: string[]
}

function buildStageSummaryRows(stage: CommercialMethodConstructionStageDraft): StageSummaryRow[] {
  const rows: StageSummaryRow[] = [
    { label: 'Por que existe', items: stage.purpose ? [stage.purpose] : [] },
    { label: 'Objetivo', items: stage.objective ? [stage.objective] : [] },
    { label: 'O que prova conclusão', items: stage.completion_criteria },
    { label: 'Quando aprofundar', items: stage.deepen_when },
    { label: 'Quando já sabe o suficiente', items: stage.sufficient_when },
    { label: 'Quando avançar', items: stage.advance_when },
    { label: 'Quando esperar', items: stage.wait_when },
    { label: 'Quando parar de perguntar', items: stage.stop_asking_when },
    { label: 'Perguntas sugeridas', items: stage.recommended_questions },
    { label: 'Erros comuns', items: stage.common_mistakes },
  ]

  if (stage.requirement !== 'required') {
    rows.push({ label: 'Quando pular esta etapa', items: stage.skip_conditions })
  }

  return rows.filter((row) => row.items.length > 0)
}

// Uma etapa só entra em modo de revisão quando a síntese determinística já
// trouxe conteúdo suficiente para o gestor confirmar. Uma etapa
// praticamente em branco (ex.: adicionada manualmente) vai direto para as
// perguntas — não há nada real para revisar.
function hasEnoughToReview(stage: CommercialMethodConstructionStageDraft): boolean {
  const hasCore = Boolean(stage.objective) || stage.completion_criteria.length > 0
  const filledFieldCount = buildStageSummaryRows(stage).length
  return hasCore && filledFieldCount >= 2
}

export default function GuidedStageJourney({ stage, onChange, assist, onDone }: Props) {
  const [viewingQuestionId, setViewingQuestionId] = React.useState<string | null>(null)
  const [reviewing, setReviewing] = React.useState(() => hasEnoughToReview(stage))

  React.useEffect(() => {
    setViewingQuestionId(null)
    setReviewing(hasEnoughToReview(stage))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.id])

  const visible = getVisibleQuestions(STAGE_QUESTIONS, stage)
  const nextQuestion = getNextQuestion(STAGE_QUESTIONS, stage)

  if (reviewing) {
    const rows = buildStageSummaryRows(stage)

    return (
      <div
        style={{
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(96,165,250,0.2)',
          borderRadius: GJ_DS.radius,
          padding: 18,
        }}
      >
        <strong style={{ color: GJ_DS.blueSoft, fontSize: 13 }}>{stage.name || 'Etapa sem nome'}</strong>
        <p style={{ color: GJ_DS.textSecondary, fontSize: 11, lineHeight: 1.6, marginTop: 6 }}>
          Com base no que você já contou, a Yolen montou esta etapa.
        </p>
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          {rows.map((row) => (
            <div key={row.label}>
              <span style={{ color: GJ_DS.textMuted, fontSize: 10, fontWeight: 850, textTransform: 'uppercase' }}>
                {row.label}
              </span>
              {row.items.length === 1 ? (
                <p style={{ color: GJ_DS.textPrimary, fontSize: 12, lineHeight: 1.55, margin: '4px 0 0' }}>
                  {row.items[0]}
                </p>
              ) : (
                <ul style={{ color: GJ_DS.textPrimary, fontSize: 12, lineHeight: 1.55, margin: '4px 0 0', paddingLeft: 18 }}>
                  {row.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={onDone}
            style={{ background: GJ_DS.blue, border: 0, borderRadius: GJ_DS.radius, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 850, padding: '10px 16px' }}
          >
            Está correto
          </button>
          <button
            type="button"
            onClick={() => {
              setReviewing(false)
              setViewingQuestionId(visible[0]?.id ?? null)
            }}
            style={{ background: 'transparent', border: 0, color: GJ_DS.textSecondary, cursor: 'pointer', fontSize: 11 }}
          >
            Quero ajustar
          </button>
        </div>
      </div>
    )
  }

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
