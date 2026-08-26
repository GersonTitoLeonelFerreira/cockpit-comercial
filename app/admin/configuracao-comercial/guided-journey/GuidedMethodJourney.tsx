'use client'

import * as React from 'react'

import {
  buildChapterSummary,
  buildDiagnosisMicrofeedback,
} from '@/app/lib/commercial-config/guided-journey/microfeedback'
import { normalizeCommercialMethodBuilderData } from '@/app/lib/commercial-config/guided-journey/normalize'
import { DIAGNOSIS_QUESTIONS } from '@/app/lib/commercial-config/guided-journey/question-registry-diagnosis'
import {
  applySaveResult,
  beginSave,
  bumpRevision,
  createRevisionGuardState,
} from '@/app/lib/commercial-config/guided-journey/revision-guard'
import {
  GUIDED_JOURNEY_CHAPTERS,
  getChapterProgress,
  getChapterVisibleQuestions,
  getNextQuestion,
  getPreviousQuestion,
  getQuestionById,
  isQuestionAnswered,
  isQuestionVisible,
} from '@/app/lib/commercial-config/guided-journey/types'
import {
  createEmptyCommercialMethodBuilderDraft,
} from '@/app/types/commercial-method-builder'
import type {
  CommercialMethodBuilderData,
  CommercialMethodBuilderDraftInput,
  CommercialMethodBuilderDraftRecord,
} from '@/app/types/commercial-method-builder'

import ChapterSummaryScreen from './ChapterSummaryScreen'
import GuidedQuestionRenderer, { GJ_DS } from './GuidedQuestionRenderer'
import QuestionShell from './QuestionShell'

const CHAPTER_FLOW = ['company', 'buyers', 'sales_today', 'decision'] as const

type BuilderResponse =
  | { ok: true; draft: CommercialMethodBuilderDraftRecord | null }
  | { ok: false; error: string }

type SaveResponse =
  | { ok: true; draft: CommercialMethodBuilderDraftRecord }
  | { ok: false; error: string }

interface Props {
  onBack: () => void
  onReadyForConstruction: () => void
}

function chapterMeta(chapterId: string) {
  return GUIDED_JOURNEY_CHAPTERS.find((chapter) => chapter.id === chapterId) ?? GUIDED_JOURNEY_CHAPTERS[0]
}

export default function GuidedMethodJourney({ onBack, onReadyForConstruction }: Props) {
  const guardRef = React.useRef(createRevisionGuardState<CommercialMethodBuilderData | null>(null))
  const [, rerenderTick] = React.useReducer((tick: number) => tick + 1, 0)
  const rerender = React.useCallback(() => rerenderTick(), [])

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [savedAt, setSavedAt] = React.useState<string | null>(null)

  const [viewingQuestionId, setViewingQuestionId] = React.useState<string | null>(null)
  const [confirmedChapters, setConfirmedChapters] = React.useState<Set<string>>(new Set())
  const [seenMicrofeedback, setSeenMicrofeedback] = React.useState<Set<string>>(new Set())

  const data = guardRef.current.data

  const setGuard = React.useCallback(
    (next: ReturnType<typeof bumpRevision<CommercialMethodBuilderData | null>>) => {
      guardRef.current = next
      rerender()
    },
    [rerender],
  )

  const save = React.useCallback(async () => {
    if (!guardRef.current.data) return
    const sentRevision = beginSave(guardRef.current)
    const payload: CommercialMethodBuilderDraftInput = buildDraftPayload(guardRef.current.data)

    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/commercial-method-builder', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await response.json()) as SaveResponse

      if (!response.ok || !json.ok) {
        throw new Error(json.ok ? 'Erro ao salvar.' : json.error)
      }

      const result = applySaveResult(guardRef.current, sentRevision, json.draft.data)
      setGuard(result.state)
      setSavedAt(json.draft.updated_at)
      if (result.applied) setDirty(false)
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }, [setGuard])

  React.useEffect(() => {
    let active = true

    async function load() {
      try {
        const response = await fetch('/api/admin/commercial-method-builder', { method: 'GET', cache: 'no-store' })
        const json = (await response.json()) as BuilderResponse
        if (!response.ok || !json.ok) throw new Error(json.ok ? 'Erro ao carregar.' : json.error)
        if (!active) return

        const raw = json.draft?.data ?? createEmptyCommercialMethodBuilderDraft().data
        const normalized = normalizeCommercialMethodBuilderData(raw)
        guardRef.current = createRevisionGuardState(normalized)
        setSavedAt(json.draft?.updated_at ?? null)
        rerender()
      } catch (loadError: unknown) {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [rerender])

  React.useEffect(() => {
    if (loading || !dirty || saving) return
    const timer = window.setTimeout(() => void save(), 900)
    return () => window.clearTimeout(timer)
  }, [dirty, loading, saving, save, data])

  const updateData = React.useCallback(
    (updater: (current: CommercialMethodBuilderData) => CommercialMethodBuilderData) => {
      const current = guardRef.current.data
      if (!current) return
      setGuard(bumpRevision(guardRef.current, updater(current)))
      setDirty(true)
    },
    [setGuard],
  )

  async function saveForLater() {
    if (dirty) await save()
    onBack()
  }

  if (loading || !data) {
    return (
      <div style={{ color: GJ_DS.textSecondary, padding: 24, textAlign: 'center' }}>
        Carregando sua jornada guiada...
      </div>
    )
  }

  const journeyData: CommercialMethodBuilderData = data

  // Determina se algum capítulo anterior já foi totalmente respondido mas
  // ainda não teve o resumo confirmado (seção 13). Isso também cobre a
  // migração de draft antigo (seção 21): se o formulário anterior já
  // respondeu tudo, o primeiro capítulo completo aparece aqui como resumo
  // em vez de repetir perguntas já respondidas.
  // Só entra em jogo quando não há navegação explícita em andamento
  // (viewingQuestionId null): se o usuário clicou em "Editar respostas" ou
  // "Voltar" para revisar uma pergunta de um capítulo já completo, essa
  // navegação explícita tem prioridade sobre o gate do resumo — caso
  // contrário "Editar respostas" cairia de volta no próprio resumo.
  let pendingSummaryChapter: string | null = null
  if (!viewingQuestionId) {
    for (const chapterId of CHAPTER_FLOW) {
      const progress = getChapterProgress(DIAGNOSIS_QUESTIONS, chapterId, journeyData)
      if (progress.total > 0 && progress.complete && !confirmedChapters.has(chapterId)) {
        pendingSummaryChapter = chapterId
        break
      }
    }
  }

  if (pendingSummaryChapter) {
    const meta = chapterMeta(pendingSummaryChapter)
    return (
      <ChapterSummaryScreen
        chapterLabel={`Capítulo ${meta.order} de 5 · ${meta.title}`}
        blocks={buildChapterSummary(pendingSummaryChapter, journeyData)}
        onConfirm={() => {
          setConfirmedChapters((current) => new Set(current).add(pendingSummaryChapter as string))
          setViewingQuestionId(null)
        }}
        onEdit={() => {
          const firstQuestion = getChapterVisibleQuestions(DIAGNOSIS_QUESTIONS, pendingSummaryChapter as string, journeyData)[0]
          setViewingQuestionId(firstQuestion?.id ?? null)
        }}
      />
    )
  }

  const nextQuestion = getNextQuestion(DIAGNOSIS_QUESTIONS, journeyData)
  const activeQuestion = viewingQuestionId
    ? getQuestionById(DIAGNOSIS_QUESTIONS, viewingQuestionId)
    : nextQuestion

  if (!activeQuestion || (viewingQuestionId && !isQuestionVisible(activeQuestion, journeyData))) {
    if (nextQuestion) {
      setViewingQuestionId(null)
      return null
    }

    return (
      <div style={{ display: 'grid', gap: 14, margin: '0 auto', maxWidth: 640, width: '100%' }}>
        <div
          style={{
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(134,239,172,0.2)',
            borderRadius: GJ_DS.radiusContainer,
            padding: 22,
          }}
        >
          <div style={{ color: GJ_DS.greenSoft, fontSize: 14, fontWeight: 850 }}>
            Sua operação foi mapeada
          </div>
          <p style={{ color: GJ_DS.textSecondary, fontSize: 12, lineHeight: 1.65, marginTop: 8 }}>
            A Yolen já tem contexto suficiente para ajudar a transformar isso em um método comercial.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
            <button
              type="button"
              onClick={async () => {
                await save()
                onReadyForConstruction()
              }}
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
              Continuar para como seus clientes decidem
            </button>
            <button
              type="button"
              onClick={onBack}
              style={{ background: 'transparent', border: 0, color: GJ_DS.textSecondary, cursor: 'pointer', fontSize: 12 }}
            >
              ← Voltar às opções
            </button>
          </div>
        </div>
      </div>
    )
  }

  const chapter = chapterMeta(activeQuestion.chapterId)
  const chapterProgress = getChapterProgress(DIAGNOSIS_QUESTIONS, activeQuestion.chapterId, journeyData)
  const visibleInChapter = getChapterVisibleQuestions(DIAGNOSIS_QUESTIONS, activeQuestion.chapterId, journeyData)
  const positionInChapter = visibleInChapter.findIndex((question) => question.id === activeQuestion.id) + 1

  const value = activeQuestion.getValue(journeyData)
  const microfeedback = buildDiagnosisMicrofeedback(journeyData).filter((text) => !seenMicrofeedback.has(text))
  const currentMicrofeedback = activeQuestion.microfeedback?.(journeyData)

  function handleChange(nextValue: unknown) {
    updateData((current) => activeQuestion!.setValue(current, nextValue))
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
    const previous = getPreviousQuestion(DIAGNOSIS_QUESTIONS, journeyData, activeQuestion!.id)
    setViewingQuestionId(previous?.id ?? null)
    if (previous) {
      setConfirmedChapters((current) => {
        if (!current.has(previous.chapterId)) return current
        const next = new Set(current)
        next.delete(previous.chapterId)
        return next
      })
    }
  }

  const isAnswered = isQuestionAnswered(activeQuestion, journeyData)

  return (
    <QuestionShell
      chapterLabel={`Capítulo ${chapter.order} de 5 · ${chapter.title}`}
      progressLabel={`Pergunta ${positionInChapter} de ${chapterProgress.total} deste capítulo`}
      progressPercent={chapterProgress.total > 0 ? (positionInChapter / chapterProgress.total) * 100 : 0}
      title={activeQuestion.title}
      helper={activeQuestion.helper}
      whyItMatters={activeQuestion.whyItMatters}
      example={activeQuestion.example}
      microfeedback={[...(currentMicrofeedback ? [currentMicrofeedback] : []), ...microfeedback]}
      canGoBack={Boolean(getPreviousQuestion(DIAGNOSIS_QUESTIONS, journeyData, activeQuestion.id))}
      onBack={handleBack}
      onContinue={handleContinue}
      continueDisabled={!isAnswered && !isOptional(activeQuestion.id)}
      onSaveForLater={() => void saveForLater()}
      savingLabel={saving ? 'Salvando...' : dirty ? 'Alterações não salvas' : savedAt ? 'Salvo' : ''}
    >
      <GuidedQuestionRenderer
        answerType={activeQuestion.answerType}
        options={activeQuestion.options}
        value={value}
        onChange={handleChange}
      />
      {error && <div style={{ color: '#fca5a5', fontSize: 11 }}>{error}</div>}
    </QuestionShell>
  )
}

const OPTIONAL_QUESTION_IDS = new Set([
  'Q16b',
  'Q24b',
  'Q54b',
  'Q57b',
  'Q59c',
  'Q62b',
  'Q65',
  'Q82',
  'Q84',
])

function isOptional(id: string): boolean {
  return OPTIONAL_QUESTION_IDS.has(id)
}

function buildDraftPayload(journeyData: CommercialMethodBuilderData): CommercialMethodBuilderDraftInput {
  const flowComplete = CHAPTER_FLOW.every((chapterId) => {
    const progress = getChapterProgress(DIAGNOSIS_QUESTIONS, chapterId, journeyData)
    return progress.total === 0 || progress.complete
  })

  return {
    current_step: flowComplete ? 4 : 1,
    completed_steps: flowComplete ? [1, 2, 3] : [],
    ready_for_method: flowComplete,
    data: journeyData,
  }
}
