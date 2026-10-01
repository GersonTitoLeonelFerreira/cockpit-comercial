// Leitura completa no painel — view model do AGORA e da ANÁLISE.
//
// Funções puras: recebem a rodada escolhida pela orquestração
// (full-reading-panel.ts) e o kanban atual do ciclo, e devolvem o que a
// extensão desenha. O texto do modelo vai sempre como dado: a extensão
// monta os elementos com textContent, nunca com innerHTML.
//
// Travas no código (não só no prompt):
// - kanban em Ganho: nada de retomar, nada de follow-up de venda, nada de
//   "oportunidade estagnada", nenhum card de etapa;
// - Perdido/Cancelado: nenhuma ação comercial, a menos que o cliente
//   tenha escrito depois do encerramento;
// - Ganho e Perdido sugeridos nunca são aplicados por aqui: o botão abre
//   o fechamento estruturado do Yolen, com a confirmação do vendedor.

import {
  FULL_READING_KANBAN_STAGES,
  findStageCoherenceProblem,
  isFullReadingKanbanStage,
  type FullReadingClosingData,
  type FullReadingDecision,
  type FullReadingKanbanStage,
} from '../companion/full-reading/output'

import {
  formatTranscriptTimestamp,
} from '../companion/full-reading/transcript'

import {
  getSalesCycleLabel,
} from '../sales-cycle-status'

import type {
  LeadStatus,
} from '@/app/types/sales_cycles'

export const FULL_READING_RUNNING_NOTICE =
  'Lendo a conversa inteira…'

export const FULL_READING_SOURCE_LABEL =
  'Leitura completa · Claude'

const OPEN_STAGES =
  new Set(['novo', 'contato', 'respondeu', 'negociacao', 'pausado'])

const CLOSED_STAGES =
  new Set(['perdido', 'cancelado'])

// Ações que, com o kanban em Ganho, seriam retomar a venda já feita.
const SALE_RESUMING_ACTIONS =
  new Set(['retomar', 'follow_up'])

export const RESUME_WORDING =
  /\bretom(ar|e|ada)\b|\bfollow[\s-]?up\b|\bestagnad[ao]\b/i

const MAX_PREFILL_LENGTH =
  200

export type FullReadingPanelState =
  | 'ready'
  | 'running'
  | 'failed'

export type FullReadingPanelKanban = {
  status: string
  stage_entered_at: string | null
  next_action: string | null
  next_action_date: string | null
  closed_at: string | null
}

export type FullReadingPanelReading = {
  run_id: string
  completed_at: string | null
  analysis_markdown: string
  decision: FullReadingDecision & {
    sistema?: {
      alertas?: unknown[]
    }
  }
}

export type FullReadingStageCardKind =
  | 'apply'
  | 'confirm_won'
  | 'confirm_lost'
  | 'open_cycle'

export type FullReadingApplyRequest = {
  cycle_id: string
  applied_status: FullReadingKanbanStage
  next_action: string | null
  next_action_date: string | null
  source: 'whatsapp_companion'
  confirmed_by_human: true
  suggestion: {
    recommended_status: FullReadingKanbanStage
    confidence: null
    action_channel: null
    action_result: null
    result_detail: null
    next_action: string | null
    next_action_date: string | null
    summary: string
    tags: string[]
    should_close_won: false
    should_close_lost: false
    close_reason: null
    reason_for_recommendation: string
    source: 'full_reading'
  }
}

export type FullReadingStageCard = {
  kind: FullReadingStageCardKind
  current_status: string
  current_label: string
  suggested_status: FullReadingKanbanStage
  suggested_label: string
  title: string
  reason: string
  button_label: string
  // Caminho na Yolen para Ganho/Perdido/reabrir: só abre a tela do ciclo
  // (e o modal de fechamento, quando for o caso). Nunca fecha sozinho.
  cycle_path: string | null
  // Só para etapa aberta: o corpo exato da rota apply-suggestion. A rota
  // continua exigindo o clique (confirmed_by_human) e recusando ganho e
  // perdido.
  apply_request: FullReadingApplyRequest | null
  prefill: FullReadingClosingData
}

export type FullReadingAgoraMain = {
  situacao: string
  acao: string
  por_que: string
}

export type FullReadingAgoraView = {
  state: FullReadingPanelState
  notice: string | null
  failure_code: string | null
  kanban: {
    status: string
    label: string
  }
  kanban_line: string
  main: FullReadingAgoraMain | null
  stage_card: FullReadingStageCard | null
  // A leitura diz que o kanban está atrasado (sugere outra etapa).
  kanban_late: boolean
  // Trava que vale também para o AGORA de hoje (fallback em falha ou
  // enquanto a primeira leitura roda): 'ganho' tira retomada/follow-up de
  // venda; 'encerrado' tira toda ação (Perdido/Cancelado sem mensagem do
  // cliente depois do encerramento).
  legacy_lock: 'ganho' | 'encerrado' | null
  // O card de SLA da etapa ("oportunidade estagnada") some.
  hide_stage_sla: boolean
  locks: string[]
  footer: string | null
  run_id: string | null
  // Muda sempre que o conteúdo muda: a extensão só redesenha quando muda.
  view_key: string
}

export type FullReadingAnalysisBlock = {
  type: 'paragraph' | 'list'
  items: string[]
}

export type FullReadingAnalysisSection = {
  key: string
  title: string
  blocks: FullReadingAnalysisBlock[]
}

export type FullReadingAnalysisView = {
  state: FullReadingPanelState
  notice: string | null
  failure_code: string | null
  sections: FullReadingAnalysisSection[]
  afirmacoes_a_confirmar: string[]
  alertas_de_captura: string[]
  footer: string | null
  run_id: string | null
  view_key: string
}

function stageLabel(
  status: string,
): string {
  return getSalesCycleLabel(status as LeadStatus)
}

function clean(
  value: unknown,
): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : ''
}

function toTime(
  value: string | null | undefined,
): number | null {
  if (!value) {
    return null
  }

  const parsed =
    Date.parse(value)

  return Number.isNaN(parsed)
    ? null
    : parsed
}

function buildFooter(
  completedAt: string | null,
): string | null {
  return completedAt && toTime(completedAt) !== null
    ? `${FULL_READING_SOURCE_LABEL} · ${formatTranscriptTimestamp(completedAt)}`
    : FULL_READING_SOURCE_LABEL
}

function buildFailureNotice(
  failureCode: string | null,
): string {
  return failureCode
    ? `Leitura completa indisponível agora (${failureCode}). Mostrando a análise anterior.`
    : 'Leitura completa indisponível agora. Mostrando a análise anterior.'
}

function hashKey(
  value: string,
): string {
  // FNV-1a 32 bits: só identifica mudança de conteúdo, não é segurança.
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

// O cliente escreveu depois do encerramento? Sem data de encerramento ou
// sem mensagem do cliente, a resposta é não (trava fechada).
export function customerWroteAfterClosure({
  closedAt,
  lastCustomerMessageAt,
}: {
  closedAt: string | null
  lastCustomerMessageAt: string | null
}): boolean {
  const closed =
    toTime(closedAt)

  const lastCustomer =
    toTime(lastCustomerMessageAt)

  return (
    closed !== null &&
    lastCustomer !== null &&
    lastCustomer > closed
  )
}

function limitPrefill(
  value: string,
): string {
  return value.length > MAX_PREFILL_LENGTH
    ? value.slice(0, MAX_PREFILL_LENGTH)
    : value
}

function buildClosingPrefill(
  closing: FullReadingClosingData | undefined,
): FullReadingClosingData {
  return {
    produto: limitPrefill(clean(closing?.produto)),
    valor: limitPrefill(clean(closing?.valor)),
    forma_pagamento: limitPrefill(clean(closing?.forma_pagamento)),
    motivo_perda: limitPrefill(clean(closing?.motivo_perda)),
  }
}

export function buildCycleClosingPath({
  cycleId,
  close,
  prefill,
}: {
  cycleId: string
  close: 'ganho' | 'perdido' | null
  prefill: FullReadingClosingData
}): string {
  const params =
    new URLSearchParams()

  if (close === 'ganho') {
    params.set('fechar', 'ganho')

    if (prefill.produto) params.set('produto', prefill.produto)
    if (prefill.valor) params.set('valor', prefill.valor)
    if (prefill.forma_pagamento) params.set('pagamento', prefill.forma_pagamento)
  }

  if (close === 'perdido') {
    params.set('fechar', 'perdido')

    if (prefill.motivo_perda) params.set('motivo', prefill.motivo_perda)
  }

  const query =
    params.toString()

  return `/sales-cycles/${encodeURIComponent(cycleId)}${query ? `?${query}` : ''}`
}

function isPastOrInvalid(
  value: string | null,
  referenceTime: string,
): boolean {
  const time =
    toTime(value)

  const reference =
    toTime(referenceTime) ?? Date.now()

  return time === null || time <= reference
}

function buildStageCard({
  decision,
  kanban,
  cycleId,
  referenceTime,
  lastCustomerMessageAt,
}: {
  decision: FullReadingPanelReading['decision']
  kanban: FullReadingPanelKanban
  cycleId: string
  referenceTime: string
  lastCustomerMessageAt: string | null
}): FullReadingStageCard | null {
  const suggested =
    decision.etapa_kanban_sugerida

  const current =
    kanban.status

  if (!isFullReadingKanbanStage(suggested) || suggested === current) {
    return null
  }

  // A coerência já foi aplicada na rodada; aqui é a segunda trava, para
  // uma rodada gravada que tenha escapado dela.
  if (
    findStageCoherenceProblem(decision) !== null ||
    (Array.isArray(decision.sistema?.alertas) && decision.sistema.alertas.length > 0)
  ) {
    return null
  }

  // Ganho é fechamento estruturado: não se reabre pelo painel.
  if (current === 'ganho') {
    return null
  }

  const closed =
    CLOSED_STAGES.has(current)

  if (
    closed &&
    !customerWroteAfterClosure({
      closedAt: kanban.closed_at,
      lastCustomerMessageAt,
    })
  ) {
    return null
  }

  const prefill =
    buildClosingPrefill(decision.fechamento)

  const reason =
    clean(decision.motivo_etapa) ||
    clean(decision.por_que)

  const base = {
    current_status: current,
    current_label: stageLabel(current),
    suggested_status: suggested,
    suggested_label: stageLabel(suggested),
    title: `Kanban: ${stageLabel(current)} → a conversa indica ${stageLabel(suggested)}`,
    reason,
    prefill,
  }

  if (closed) {
    return {
      ...base,
      kind: 'open_cycle',
      button_label: 'Abrir no Yolen',
      cycle_path: buildCycleClosingPath({ cycleId, close: null, prefill }),
      apply_request: null,
    }
  }

  if (suggested === 'ganho') {
    return {
      ...base,
      kind: 'confirm_won',
      button_label: 'Confirmar venda',
      cycle_path: buildCycleClosingPath({ cycleId, close: 'ganho', prefill }),
      apply_request: null,
    }
  }

  if (suggested === 'perdido') {
    return {
      ...base,
      kind: 'confirm_lost',
      button_label: 'Confirmar perda',
      cycle_path: buildCycleClosingPath({ cycleId, close: 'perdido', prefill }),
      apply_request: null,
    }
  }

  if (!OPEN_STAGES.has(suggested)) {
    return null
  }

  // Aplicar só muda a etapa: a próxima ação registrada continua a mesma
  // (a rota apply-suggestion grava o que vier no corpo). Uma data que já
  // passou não pode ir (a rota recusa); vai só o texto.
  const nextAction =
    clean(kanban.next_action) || null

  const nextActionDate =
    nextAction && !isPastOrInvalid(kanban.next_action_date, referenceTime)
      ? kanban.next_action_date
      : null

  return {
    ...base,
    kind: 'apply',
    button_label: 'Aplicar',
    cycle_path: null,
    apply_request: {
      cycle_id: cycleId,
      applied_status: suggested,
      next_action: nextAction,
      next_action_date: nextActionDate,
      source: 'whatsapp_companion',
      confirmed_by_human: true,
      suggestion: {
        recommended_status: suggested,
        confidence: null,
        action_channel: null,
        action_result: null,
        result_detail: null,
        next_action: nextAction,
        next_action_date: nextActionDate,
        summary: clean(decision.situacao_resumo) || reason,
        tags: [],
        should_close_won: false,
        should_close_lost: false,
        close_reason: null,
        reason_for_recommendation: reason || 'Etapa indicada pela leitura completa.',
        source: 'full_reading',
      },
    },
  }
}

function buildMain({
  decision,
  kanban,
  lastCustomerMessageAt,
  locks,
}: {
  decision: FullReadingPanelReading['decision']
  kanban: FullReadingPanelKanban
  lastCustomerMessageAt: string | null
  locks: string[]
}): FullReadingAgoraMain {
  let acao =
    clean(decision.acao_resumo)

  let porQue =
    clean(decision.por_que)

  if (
    kanban.status === 'ganho' &&
    (
      SALE_RESUMING_ACTIONS.has(decision.acao_agora) ||
      RESUME_WORDING.test(acao)
    )
  ) {
    acao =
      'Acompanhar o pós-venda. A negociação do que já foi vendido está encerrada.'
    porQue =
      'A venda está registrada como ganha no kanban; adicionais ficam como oportunidades.'
    locks.push('ganho_sem_retomada')
  }

  if (
    CLOSED_STAGES.has(kanban.status) &&
    decision.acao_agora !== 'nao_intervir' &&
    !customerWroteAfterClosure({
      closedAt: kanban.closed_at,
      lastCustomerMessageAt,
    })
  ) {
    acao =
      'Nenhuma ação comercial agora.'
    porQue =
      'A oportunidade está encerrada no kanban e o cliente não escreveu depois do encerramento.'
    locks.push('encerrado_sem_acao')
  }

  return {
    situacao: clean(decision.situacao_resumo),
    acao,
    por_que: porQue,
  }
}

export function buildFullReadingAgoraView({
  state,
  reading,
  failureCode,
  kanban,
  cycleId,
  referenceTime,
  lastCustomerMessageAt,
}: {
  state: FullReadingPanelState
  reading: FullReadingPanelReading | null
  failureCode: string | null
  kanban: FullReadingPanelKanban
  cycleId: string
  referenceTime: string
  lastCustomerMessageAt: string | null
}): FullReadingAgoraView {
  const kanbanLabel =
    stageLabel(kanban.status)

  // Na falha o painel volta ao AGORA de hoje: a leitura antiga não é
  // mostrada como se fosse atual.
  const shownReading =
    state === 'failed'
      ? null
      : reading

  const locks: string[] = []

  const main =
    shownReading
      ? buildMain({
          decision: shownReading.decision,
          kanban,
          lastCustomerMessageAt,
          locks,
        })
      : null

  const stageCard =
    shownReading
      ? buildStageCard({
          decision: shownReading.decision,
          kanban,
          cycleId,
          referenceTime,
          lastCustomerMessageAt,
        })
      : null

  const kanbanLate =
    stageCard !== null

  const hideStageSla =
    kanbanLate ||
    kanban.status === 'ganho' ||
    CLOSED_STAGES.has(kanban.status)

  const notice =
    state === 'running'
      ? FULL_READING_RUNNING_NOTICE
      : state === 'failed'
        ? buildFailureNotice(failureCode)
        : null

  const legacyLock: FullReadingAgoraView['legacy_lock'] =
    kanban.status === 'ganho'
      ? 'ganho'
      : CLOSED_STAGES.has(kanban.status) &&
          !customerWroteAfterClosure({
            closedAt: kanban.closed_at,
            lastCustomerMessageAt,
          })
        ? 'encerrado'
        : null

  const view: Omit<FullReadingAgoraView, 'view_key'> = {
    state,
    notice,
    failure_code: state === 'failed' ? failureCode : null,
    kanban: {
      status: kanban.status,
      label: kanbanLabel,
    },
    kanban_line: `Etapa no kanban: ${kanbanLabel}`,
    main,
    stage_card: stageCard,
    kanban_late: kanbanLate,
    legacy_lock: legacyLock,
    hide_stage_sla: hideStageSla,
    locks,
    footer: shownReading ? buildFooter(shownReading.completed_at) : null,
    run_id: shownReading?.run_id ?? null,
  }

  return {
    ...view,
    view_key: hashKey(JSON.stringify(view)),
  }
}

// ---------------------------------------------------------------------------
// ANÁLISE
// ---------------------------------------------------------------------------

const ANALYSIS_SECTIONS: {
  key: string
  title: string
  match: RegExp
}[] = [
  { key: 'fase', title: 'Fase da relação', match: /^fase da rela/i },
  { key: 'linha_do_tempo', title: 'Linha do tempo', match: /^linha do tempo/i },
  { key: 'pendencias', title: 'Pendências', match: /^pend[eê]ncias/i },
  { key: 'oportunidades', title: 'Oportunidades', match: /^oportunidades/i },
  { key: 'cliente', title: 'Cliente: fatos e inferências', match: /^cliente/i },
  { key: 'conducao', title: 'Condução do vendedor', match: /^condu[cç][aã]o/i },
  { key: 'mensagem', title: 'Mensagem sugerida', match: /^mensagem sugerida/i },
]

// Tira a marcação inline do markdown: o texto vai para textContent.
function stripInlineMarkdown(
  value: string,
): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseBlocks(
  lines: string[],
): FullReadingAnalysisBlock[] {
  const blocks: FullReadingAnalysisBlock[] = []
  let paragraph: string[] = []
  let list: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      const text =
        stripInlineMarkdown(paragraph.join(' '))

      if (text) {
        blocks.push({ type: 'paragraph', items: [text] })
      }
    }

    paragraph = []
  }

  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ type: 'list', items: list })
    }

    list = []
  }

  for (const rawLine of lines) {
    const line =
      rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const bullet =
      /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)

    if (bullet) {
      flushParagraph()

      const item =
        stripInlineMarkdown(bullet[1])

      if (item) {
        list.push(item)
      }

      continue
    }

    if (/^#{1,6}\s/.test(line)) {
      flushParagraph()
      flushList()

      const heading =
        stripInlineMarkdown(line.replace(/^#{1,6}\s+/, ''))

      if (heading) {
        blocks.push({ type: 'paragraph', items: [heading] })
      }

      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()

  return blocks
}

export function parseFullReadingAnalysisSections(
  markdown: string,
): FullReadingAnalysisSection[] {
  const lines =
    markdown.replace(/\r\n?/g, '\n').split('\n')

  const chunks: { heading: string; lines: string[] }[] = []
  let current: { heading: string; lines: string[] } | null = null

  for (const line of lines) {
    const heading =
      /^#{2,3}\s+(.+?)\s*#*\s*$/.exec(line.trim())

    if (heading) {
      current = {
        heading: stripInlineMarkdown(heading[1]),
        lines: [],
      }
      chunks.push(current)
      continue
    }

    current?.lines.push(line)
  }

  const sections: FullReadingAnalysisSection[] = []

  for (const definition of ANALYSIS_SECTIONS) {
    const chunk =
      chunks.find((candidate) => definition.match.test(candidate.heading))

    if (!chunk) {
      continue
    }

    const blocks =
      parseBlocks(chunk.lines)

    if (blocks.length > 0) {
      sections.push({
        key: definition.key,
        title: definition.title,
        blocks,
      })
    }
  }

  // O modelo fugiu do formato: mostra o texto inteiro numa seção só, em
  // vez de esconder a análise.
  if (sections.length === 0 && markdown.trim()) {
    const blocks =
      parseBlocks(lines)

    if (blocks.length > 0) {
      sections.push({
        key: 'analise',
        title: 'Análise',
        blocks,
      })
    }
  }

  return sections
}

function cleanList(
  values: unknown,
): string[] {
  return Array.isArray(values)
    ? values.map(clean).filter((value) => value.length > 0)
    : []
}

export function buildFullReadingAnalysisView({
  state,
  reading,
  failureCode,
}: {
  state: FullReadingPanelState
  reading: FullReadingPanelReading | null
  failureCode: string | null
}): FullReadingAnalysisView {
  const shownReading =
    state === 'failed'
      ? null
      : reading

  const view: Omit<FullReadingAnalysisView, 'view_key'> = {
    state,
    notice:
      state === 'running'
        ? FULL_READING_RUNNING_NOTICE
        : state === 'failed'
          ? buildFailureNotice(failureCode)
          : null,
    failure_code: state === 'failed' ? failureCode : null,
    sections:
      shownReading
        ? parseFullReadingAnalysisSections(shownReading.analysis_markdown)
        : [],
    afirmacoes_a_confirmar:
      shownReading
        ? cleanList(shownReading.decision.afirmacoes_a_confirmar)
        : [],
    alertas_de_captura:
      shownReading
        ? cleanList(shownReading.decision.alertas_de_captura)
        : [],
    footer: shownReading ? buildFooter(shownReading.completed_at) : null,
    run_id: shownReading?.run_id ?? null,
  }

  return {
    ...view,
    view_key: hashKey(JSON.stringify(view)),
  }
}

// Usado pelos testes e pela orquestração para validar uma decisão gravada.
export function isUsableStoredDecision(
  value: unknown,
): value is FullReadingPanelReading['decision'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const record =
    value as Record<string, unknown>

  return (
    typeof record.situacao_resumo === 'string' &&
    typeof record.acao_resumo === 'string' &&
    typeof record.por_que === 'string' &&
    typeof record.acao_agora === 'string' &&
    (FULL_READING_KANBAN_STAGES as readonly string[]).includes(
      String(record.etapa_kanban_sugerida),
    ) &&
    Boolean(record.fechamento) &&
    typeof record.fechamento === 'object'
  )
}
