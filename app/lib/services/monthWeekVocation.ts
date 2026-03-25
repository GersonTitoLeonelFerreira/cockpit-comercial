// ==============================================================================
// Service: Vocação Operacional por Semana do Mês — Fase 6.3
//
// Classifica cada semana do mês segundo sua vocação operacional predominante:
//   - Prospecção:  sales_cycles.first_worked_at
//   - Fechamento:  sales_cycles.won_at (status='ganho', won_total > 0)
//   - Follow-up:   cycle_events com event_type='stage_changed' e
//                  metadata.to_status IN ('contato','respondeu')
//   - Negociação:  cycle_events com event_type='stage_changed' e
//                  metadata.to_status = 'negociacao'
//
// HONESTIDADE:
//   - Se count < 3 para um tipo, confiança = 'insuficiente'
//   - Se cycle_events não retornar dados, followup e negociacao ficam 'insuficiente'
//   - 5ª semana quase sempre terá base insuficiente (janela de 3 dias)
// ==============================================================================

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import type {
  MonthWeekFilters,
  MonthWeekVocationalRow,
  MonthWeekVocationalSummary,
  MonthWeekVocationType,
  MonthWeekVocationConfidence,
  MonthWeekVocationSignal,
  MonthWeekIndex,
} from '@/app/types/monthWeekPerformance'

const WEEK_LABELS: string[] = ['', '1ª semana', '2ª semana', '3ª semana', '4ª semana', '5ª semana']
const WEEK_SHORTS: string[] = ['', 'Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5']
const WEEK_DESCRIPTIONS: string[] = ['', 'Dias 1–7', 'Dias 8–14', 'Dias 15–21', 'Dias 22–28', 'Dias 29–31']

const VOCATION_LABELS: Record<MonthWeekVocationType, string> = {
  prospeccao: 'Prospecção',
  followup: 'Follow-up',
  negociacao: 'Negociação',
  fechamento: 'Fechamento',
}

const SOURCE_DESCRIPTIONS: Record<MonthWeekVocationType, string> = {
  prospeccao: 'Baseado em first_worked_at de sales_cycles',
  followup: "Baseado em cycle_events com to_status IN ('contato','respondeu')",
  negociacao: "Baseado em cycle_events com to_status = 'negociacao'",
  fechamento: 'Baseado em won_at de sales_cycles (status=ganho)',
}

/**
 * Retorna o número da semana do mês (1–5) para um dado timestamp.
 */
function getMonthWeek(ts: string): MonthWeekIndex {
  const d = new Date(ts)
  const dayOfMonth = d.getUTCDate()
  return Math.min(5, Math.ceil(dayOfMonth / 7)) as MonthWeekIndex
}

/**
 * Determina o nível de confiança com base na contagem de eventos.
 * Thresholds: alta >= 15, moderada >= 8, baixa >= 3, insuficiente < 3
 */
function classifyConfidence(count: number): MonthWeekVocationConfidence {
  if (count >= 15) return 'alta'
  if (count >= 8) return 'moderada'
  if (count >= 3) return 'baixa'
  return 'insuficiente'
}

function buildObservation(
  week_label: string,
  signals: MonthWeekVocationSignal[],
  dominant_vocation: MonthWeekVocationType | null
): string {
  if (!dominant_vocation) {
    return `A ${week_label} não tem base suficiente para classificar vocação operacional.`
  }

  const dominated = signals.find((s) => s.type === dominant_vocation)
  if (!dominated) return `${week_label}: dados insuficientes.`

  const confLabel: Record<MonthWeekVocationConfidence, string> = {
    alta: 'forte',
    moderada: 'moderada',
    baixa: 'fraca',
    insuficiente: 'insuficiente',
  }

  const parts: string[] = [
    `A ${week_label} apresenta vocação predominante de ${dominated.label} (confiança ${confLabel[dominated.confidence]}).`,
  ]

  const secondary = signals
    .filter(
      (s) =>
        s.type !== dominant_vocation &&
        s.confidence !== 'insuficiente' &&
        s.strength >= 0.6
    )
    .sort((a, b) => b.strength - a.strength)

  if (secondary.length > 0) {
    const names = secondary.map((s) => s.label).join(' e ')
    parts.push(`Também relevante: ${names}.`)
  }

  const fech = signals.find((s) => s.type === 'fechamento')
  const prosp = signals.find((s) => s.type === 'prospeccao')
  if (
    dominant_vocation !== 'fechamento' &&
    fech &&
    fech.confidence !== 'insuficiente' &&
    fech.strength < 0.4 &&
    prosp &&
    prosp.strength >= 0.6
  ) {
    parts.push('Semana fraca de fechamento mas forte de prospecção — priorizar abertura de contatos.')
  }

  return parts.join(' ')
}

function buildLeituraResumida(
  rows: MonthWeekVocationalRow[],
  melhor_prospeccao: MonthWeekVocationalRow | null,
  melhor_followup: MonthWeekVocationalRow | null,
  melhor_negociacao: MonthWeekVocationalRow | null,
  melhor_fechamento: MonthWeekVocationalRow | null,
  has_cycle_events: boolean
): string[] {
  const frases: string[] = []

  if (melhor_fechamento) {
    frases.push(
      `A ${melhor_fechamento.week_label} se destaca como semana de fechamento (confiança: ${melhor_fechamento.dominant_confidence}).`
    )
  }

  if (melhor_prospeccao) {
    frases.push(
      `A ${melhor_prospeccao.week_label} apresenta maior força de abertura de trabalho (prospecção).`
    )
  }

  if (melhor_followup && has_cycle_events) {
    frases.push(
      `A ${melhor_followup.week_label} concentra mais eventos de follow-up e resposta.`
    )
  }

  if (melhor_negociacao && has_cycle_events) {
    frases.push(
      `A ${melhor_negociacao.week_label} lidera avanços para estágio de negociação.`
    )
  }

  const insuficienteTotal = rows.filter(
    (r) =>
      r.signals.every((s) => s.confidence === 'insuficiente') &&
      r.signals.some((s) => s.count > 0)
  )
  if (insuficienteTotal.length > 0) {
    const names = insuficienteTotal.map((r) => r.week_short).join(', ')
    frases.push(
      `${names} com volume muito baixo de atividade — amplie o período para leitura mais confiável.`
    )
  }

  if (!has_cycle_events) {
    frases.push(
      'Follow-up e negociação não puderam ser classificados: nenhum evento de cycle_events encontrado no período.'
    )
  }

  if (frases.length === 0) {
    frases.push('Período com volume insuficiente para gerar leitura de vocação por semana do mês.')
  }

  return frases
}

export async function getMonthWeekVocation(
  filters: MonthWeekFilters
): Promise<MonthWeekVocationalSummary> {
  const supabase = supabaseBrowser()

  // Contagens por semana do mês (índice 1-5) para cada tipo de vocação
  const countsByType: Record<MonthWeekVocationType, number[]> = {
    prospeccao: Array(6).fill(0),   // [0] não usado; [1..5] = semanas
    followup: Array(6).fill(0),
    negociacao: Array(6).fill(0),
    fechamento: Array(6).fill(0),
  }

  const dateStartIso = filters.dateStart + 'T00:00:00.000Z'
  const dateEndIso = filters.dateEnd + 'T23:59:59.999Z'

  // ==========================================================================
  // 1. Prospecção — sales_cycles.first_worked_at
  // ==========================================================================
  {
    let q = supabase
      .from('sales_cycles')
      .select('first_worked_at')
      .eq('company_id', filters.companyId)
      .not('first_worked_at', 'is', null)
      .gte('first_worked_at', dateStartIso)
      .lte('first_worked_at', dateEndIso)

    if (filters.ownerId) {
      q = q.eq('owner_user_id', filters.ownerId)
    }

    const { data } = await q

    for (const row of data ?? []) {
      const r = row as Record<string, unknown>
      const ts = r.first_worked_at as string | null
      if (!ts) continue
      const wk = getMonthWeek(ts)
      countsByType.prospeccao[wk] += 1
    }
  }

  // ==========================================================================
  // 2. Fechamento — sales_cycles.won_at
  // ==========================================================================
  {
    let q = supabase
      .from('sales_cycles')
      .select('won_at')
      .eq('company_id', filters.companyId)
      .eq('status', 'ganho')
      .not('won_at', 'is', null)
      .gt('won_total', 0)
      .gte('won_at', dateStartIso)
      .lte('won_at', dateEndIso)

    if (filters.ownerId) {
      q = q.eq('won_owner_user_id', filters.ownerId)
    }

    const { data } = await q

    for (const row of data ?? []) {
      const r = row as Record<string, unknown>
      const ts = r.won_at as string | null
      if (!ts) continue
      const wk = getMonthWeek(ts)
      countsByType.fechamento[wk] += 1
    }
  }

  // ==========================================================================
  // 3. Follow-up e Negociação — cycle_events
  //    NOTA: cycle_events não possui owner_user_id direto. Quando ownerId está
  //    ativo, filtramos por created_by como melhor proxy disponível — cobre o
  //    caso do vendedor registrando o próprio evento, mas pode excluir eventos
  //    criados por admin em nome do vendedor. Comportamento consistente com
  //    Fase 6.2 (weekdayVocation.ts).
  // ==========================================================================
  let has_cycle_events = false

  try {
    let eventsQuery = supabase
      .from('cycle_events')
      .select('created_at, event_type, metadata')
      .eq('company_id', filters.companyId)
      .eq('event_type', 'stage_changed')
      .gte('created_at', dateStartIso)
      .lte('created_at', dateEndIso)

    if (filters.ownerId) {
      eventsQuery = eventsQuery.eq('created_by', filters.ownerId)
    }

    const { data: eventsData, error: eventsError } = await eventsQuery

    if (!eventsError && eventsData && eventsData.length > 0) {
      has_cycle_events = true

      for (const row of eventsData) {
        const r = row as Record<string, unknown>
        const ts = r.created_at as string | null
        if (!ts) continue

        const meta = r.metadata as Record<string, unknown> | null
        const toStatus = meta?.to_status as string | undefined
        if (!toStatus) continue

        const wk = getMonthWeek(ts)

        if (toStatus === 'contato' || toStatus === 'respondeu') {
          countsByType.followup[wk] += 1
        } else if (toStatus === 'negociacao') {
          countsByType.negociacao[wk] += 1
        }
      }
    }
  } catch {
    has_cycle_events = false
  }

  // ==========================================================================
  // 4. Calcular totals, shares e strengths
  // ==========================================================================
  const vocTypes: MonthWeekVocationType[] = ['prospeccao', 'followup', 'negociacao', 'fechamento']

  const totals: Record<MonthWeekVocationType, number> = {
    prospeccao: countsByType.prospeccao.reduce((s, c) => s + c, 0),
    followup: countsByType.followup.reduce((s, c) => s + c, 0),
    negociacao: countsByType.negociacao.reduce((s, c) => s + c, 0),
    fechamento: countsByType.fechamento.reduce((s, c) => s + c, 0),
  }

  const maxShares: Record<MonthWeekVocationType, number> = {
    prospeccao: 0,
    followup: 0,
    negociacao: 0,
    fechamento: 0,
  }

  for (const vt of vocTypes) {
    const total = totals[vt]
    if (total === 0) continue
    for (let wk = 1; wk <= 5; wk++) {
      const share = countsByType[vt][wk] / total
      if (share > maxShares[vt]) maxShares[vt] = share
    }
  }

  // ==========================================================================
  // 5. Montar rows
  // ==========================================================================
  const rows: MonthWeekVocationalRow[] = []

  for (let i = 1; i <= 5; i++) {
    const week = i as MonthWeekIndex

    const signals: MonthWeekVocationSignal[] = vocTypes.map((vt) => {
      const count = countsByType[vt][i]
      const total = totals[vt]
      const share = total > 0 ? count / total : 0
      const maxShare = maxShares[vt]
      const strength = maxShare > 0 ? share / maxShare : 0

      const effectiveConfidence: MonthWeekVocationConfidence =
        !has_cycle_events && (vt === 'followup' || vt === 'negociacao')
          ? 'insuficiente'
          : classifyConfidence(count)

      return {
        type: vt,
        label: VOCATION_LABELS[vt],
        count,
        share,
        strength,
        confidence: effectiveConfidence,
        source_description: SOURCE_DESCRIPTIONS[vt],
      }
    })

    const eligible = signals.filter((s) => s.confidence !== 'insuficiente' && s.count > 0)
    const dominant =
      eligible.length > 0
        ? eligible.reduce((best, s) => (s.strength > best.strength ? s : best))
        : null

    const dominant_vocation: MonthWeekVocationType | null = dominant?.type ?? null
    const dominant_confidence: MonthWeekVocationConfidence = dominant?.confidence ?? 'insuficiente'
    const dominant_label =
      dominant_vocation ? VOCATION_LABELS[dominant_vocation] : 'Base insuficiente'

    const observation = buildObservation(WEEK_LABELS[i], signals, dominant_vocation)

    rows.push({
      week,
      week_label: WEEK_LABELS[i],
      week_short: WEEK_SHORTS[i],
      week_description: WEEK_DESCRIPTIONS[i],
      signals,
      dominant_vocation,
      dominant_label,
      dominant_confidence,
      observation,
    })
  }

  // ==========================================================================
  // 6. Melhores semanas por vocação
  // ==========================================================================
  function bestWeekForVocation(vt: MonthWeekVocationType): MonthWeekVocationalRow | null {
    const candidates = rows.filter((r) => {
      const sig = r.signals.find((s) => s.type === vt)
      return sig && sig.confidence !== 'insuficiente' && sig.count > 0
    })
    if (candidates.length === 0) return null
    return candidates.reduce((best, r) => {
      const bSig = best.signals.find((s) => s.type === vt)!
      const rSig = r.signals.find((s) => s.type === vt)!
      return rSig.strength > bSig.strength ? r : best
    })
  }

  const melhor_semana_prospeccao = bestWeekForVocation('prospeccao')
  const melhor_semana_followup = has_cycle_events ? bestWeekForVocation('followup') : null
  const melhor_semana_negociacao = has_cycle_events ? bestWeekForVocation('negociacao') : null
  const melhor_semana_fechamento = bestWeekForVocation('fechamento')

  // ==========================================================================
  // 7. Leitura resumida
  // ==========================================================================
  const leitura_resumida = buildLeituraResumida(
    rows,
    melhor_semana_prospeccao,
    melhor_semana_followup,
    melhor_semana_negociacao,
    melhor_semana_fechamento,
    has_cycle_events
  )

  return {
    rows,
    melhor_semana_prospeccao,
    melhor_semana_followup,
    melhor_semana_negociacao,
    melhor_semana_fechamento,
    leitura_resumida,
    period_start: filters.dateStart,
    period_end: filters.dateEnd,
    total_events_prospeccao: totals.prospeccao,
    total_events_followup: totals.followup,
    total_events_negociacao: totals.negociacao,
    total_events_fechamento: totals.fechamento,
    has_cycle_events,
  }
}
