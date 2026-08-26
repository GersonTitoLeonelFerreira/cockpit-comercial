/**
 * Question Engine — arquitetura obrigatória da Jornada Guiada (Onda 8 / Fase 2B).
 *
 * Uma fonte estruturada única para perguntas, em vez de condicionais
 * espalhadas em JSX. `GuidedQuestion<TData>` é genérico para poder operar
 * tanto sobre `CommercialMethodBuilderData` (capítulos 1-3 + base comercial)
 * quanto sobre `CommercialBuyerDecisionDraft` (capítulo 4) e
 * `CommercialMethodConstructionStageDraft` (capítulo 5 — construção de
 * etapas, E01-E15), sem duplicar o motor de roteamento.
 */

export type GuidedAnswerType =
  | 'single_choice'
  | 'multiple_choice'
  | 'yes_no'
  | 'yes_no_sometimes'
  | 'yes_no_rarely_often'
  | 'short_text'
  | 'long_text'
  | 'multiline_list'
  | 'number'
  | 'compound_event_list'
  | 'event_criteria_list'

export interface GuidedQuestionOption {
  value: string
  label: string
}

export interface GuidedChapterMeta {
  id: string
  order: number
  title: string
  short_title: string
}

export interface GuidedQuestion<TData> {
  id: string
  chapterId: string
  title: string
  helper?: string
  whyItMatters?: string
  example?: string
  answerType: GuidedAnswerType
  options?: GuidedQuestionOption[]
  /** Lê o valor atual da pergunta a partir do estado da jornada. */
  getValue: (data: TData) => unknown
  /** Retorna um novo estado com o valor da pergunta atualizado (imutável). */
  setValue: (data: TData, value: unknown) => TData
  /**
   * Determina se a pergunta deve aparecer. Perguntas sem `showWhen` sempre
   * aparecem (sujeitas a `skipWhen`). Este é o coração do roteamento —
   * substitui condicionais espalhadas pela UI.
   */
  showWhen?: (data: TData) => boolean
  /** Oposto complementar de `showWhen`, para condições de exclusão explícitas. */
  skipWhen?: (data: TData) => boolean
  /** Rótulos de princípios internos que este fato ativa (não é score visível). */
  activatesPrinciples?: string[]
  /** Rótulos de princípios que este fato desativa quando respondido. */
  deactivatesPrinciples?: string[]
  /**
   * Microfeedback pedagógico — texto curto derivado exclusivamente dos fatos
   * já respondidos. Nunca inventa informação; retorna null quando não há
   * fato suficiente para um comentário útil.
   */
  microfeedback?: (data: TData) => string | null
  /** Caminho documental do campo de destino (para relatório e depuração). */
  writesTo: string
  /**
   * Sobrescreve a detecção padrão de "já respondida" (baseada em
   * `getValue`). Necessário para perguntas cujo valor é sempre não-vazio
   * por construção (ex.: listas compostas derivadas de outra pergunta).
   */
  isAnswered?: (data: TData) => boolean
}

export function isValueFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  return true
}

export function isQuestionVisible<TData>(
  question: GuidedQuestion<TData>,
  data: TData,
): boolean {
  if (question.skipWhen && question.skipWhen(data)) return false
  if (question.showWhen && !question.showWhen(data)) return false
  return true
}

export function isQuestionAnswered<TData>(
  question: GuidedQuestion<TData>,
  data: TData,
): boolean {
  if (question.isAnswered) return question.isAnswered(data)
  return isValueFilled(question.getValue(data))
}

export function getVisibleQuestions<TData>(
  questions: GuidedQuestion<TData>[],
  data: TData,
): GuidedQuestion<TData>[] {
  return questions.filter((question) => isQuestionVisible(question, data))
}

export function getChapterVisibleQuestions<TData>(
  questions: GuidedQuestion<TData>[],
  chapterId: string,
  data: TData,
): GuidedQuestion<TData>[] {
  return getVisibleQuestions(
    questions.filter((question) => question.chapterId === chapterId),
    data,
  )
}

export interface ChapterProgress {
  chapterId: string
  answered: number
  total: number
  complete: boolean
}

export function getChapterProgress<TData>(
  questions: GuidedQuestion<TData>[],
  chapterId: string,
  data: TData,
): ChapterProgress {
  const visible = getChapterVisibleQuestions(questions, chapterId, data)
  const answered = visible.filter((question) => isQuestionAnswered(question, data)).length
  return {
    chapterId,
    answered,
    total: visible.length,
    complete: visible.length > 0 && answered === visible.length,
  }
}

/**
 * Determina a próxima pergunta a ser exibida: a primeira pergunta visível
 * (respeitando show_when/skip_when) ainda não respondida, na ordem do
 * registro. Isto é o roteamento — nenhuma navegação linear Q01→Q02→...→Q96.
 */
export function getNextQuestion<TData>(
  questions: GuidedQuestion<TData>[],
  data: TData,
): GuidedQuestion<TData> | null {
  for (const question of questions) {
    if (!isQuestionVisible(question, data)) continue
    if (!isQuestionAnswered(question, data)) return question
  }
  return null
}

/**
 * Pergunta anterior visível a `currentId` na ordem do registro (para o botão
 * "voltar" — permite revisitar respostas já dadas, diferente de
 * `getNextQuestion`, que pula perguntas respondidas).
 */
export function getPreviousQuestion<TData>(
  questions: GuidedQuestion<TData>[],
  data: TData,
  currentId: string,
): GuidedQuestion<TData> | null {
  const visible = getVisibleQuestions(questions, data)
  const index = visible.findIndex((question) => question.id === currentId)
  if (index <= 0) return null
  return visible[index - 1]
}

export function getQuestionById<TData>(
  questions: GuidedQuestion<TData>[],
  id: string | null,
): GuidedQuestion<TData> | null {
  if (!id) return null
  return questions.find((question) => question.id === id) ?? null
}

/**
 * Todas as perguntas visíveis já respondidas, na ordem do registro — usado
 * para o resumo de capítulo e para navegação "editar resposta anterior".
 */
export function getAnsweredVisibleQuestions<TData>(
  questions: GuidedQuestion<TData>[],
  data: TData,
): GuidedQuestion<TData>[] {
  return getVisibleQuestions(questions, data).filter((question) =>
    isQuestionAnswered(question, data),
  )
}

/**
 * Ativação de princípios internos (seção 12/13): coleta os rótulos de todas
 * as perguntas respondidas e visíveis, exclusivamente com base em fatos
 * já informados.
 */
export function getActivatedPrinciples<TData>(
  questions: GuidedQuestion<TData>[],
  data: TData,
): string[] {
  const active = new Set<string>()
  for (const question of questions) {
    if (!isQuestionVisible(question, data)) continue
    if (!isQuestionAnswered(question, data)) continue
    for (const principle of question.activatesPrinciples ?? []) active.add(principle)
  }
  for (const question of questions) {
    if (!isQuestionAnswered(question, data)) continue
    for (const principle of question.deactivatesPrinciples ?? []) active.delete(principle)
  }
  return Array.from(active)
}

export const GUIDED_JOURNEY_CHAPTERS: GuidedChapterMeta[] = [
  { id: 'company', order: 1, title: 'Conhecendo sua empresa', short_title: 'Sua empresa' },
  { id: 'buyers', order: 2, title: 'Como seus clientes compram', short_title: 'Como compram' },
  { id: 'sales_today', order: 3, title: 'Como sua equipe vende hoje', short_title: 'Como vendem hoje' },
  { id: 'decision', order: 4, title: 'Como seus clientes decidem', short_title: 'Como decidem' },
  { id: 'method', order: 5, title: 'Construindo seu método', short_title: 'Seu método' },
]
