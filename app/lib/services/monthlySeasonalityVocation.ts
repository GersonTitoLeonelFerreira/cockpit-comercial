// ==============================================================================
// Service: Vocação Operacional Mensal — Fase 6.4
//
// Classifica cada mês do ano segundo sua vocação operacional predominante:
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
//   - Meses sem atividade são incluídos (12 linhas sempre) com zeros
// ==============================================================================

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import type {
  MonthlySeasonalityFilters,
  MonthlyVocationalRow,
  MonthlyVocationalSummary,
  MonthlyVocationType,
  MonthlyVocationConfidence,
  MonthlyVocationSignal,
  MonthIndex,
} from '@/app/types/monthlySeasonality'

const MONTH_LABELS: string[] = [
  '',
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const MONTH_SHORTS: string[] = [
  '',
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

const VOCATION_LABELS: Record<MonthlyVocationType, string> = {
  prospeccao: 'Prospecção',
  followup: 'Follow-up',
  negociacao: 'Negociação',
  fechamento: 'Fechamento',
}

const SOURCE_DESCRIPTIONS: Record<MonthlyVocationType, string> = {
  prospeccao: 'Baseado em first_worked_at de sales_cycles',
  followup: "Baseado em cycle_events com to_status IN ('contato','respondeu')",
  negociacao: "Baseado em cycle_events com to_status = 'negociacao'",
  fechamento: 'Baseado em won_at de sales_cycles (status=ganho)',
}

/**
 * Extrai o número do mês (1–12) de um timestamp ISO.
 */
function getMonth(ts: string): MonthIndex {
  const d = new Date(ts)
  return (d.getUTCMonth() + 1) as MonthIndex
}

/**
 * Determina o nível de confiança com base na contagem de eventos.
 * Thresholds: alta >= 15, moderada >= 8, baixa >= 3, insuficiente < 3
 */
function classifyConfidence(count: number): MonthlyVocationConfidence {
  if (count >= 15) return 'alta'
  if (count >= 8) return 'moderada'
  if (count >= 3) return 'baixa'
  return 'insuficiente'
}

function buildObservation(
  month_label: string,
  signals: MonthlyVocationSignal[],
  dominant_vocation: MonthlyVocationType | null
): string {
  if (!dominant_vocation) {
    return `${month_label} não tem base suficiente para classificar vocação operacional.`
  }

  const dominated = signals.find((s) => s.type === dominant_vocation)
  if (!dominated) return `${month_label}: dados insuficientes.`

  const confLabel: Record<MonthlyVocationConfidence, string> = {
    alta: 'forte',
    moderada: 'moderada',
    baixa: 'fraca',
    insuficiente: 'insuficiente',
  }

  const parts: string[] = [
    `${month_label} apresenta vocação predominante de ${dominated.label} (confiança ${confLabel[dominated.confidence]}).`,
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
    parts.push('Mês fraco de fechamento mas forte de prospecção — priorizar abertura de contatos.')
  }

  return parts.join(' ')
}

function buildLeituraResumida(
  rows: MonthlyVocationalRow[],
  melhor_prospeccao: MonthlyVocationalRow | null,
  melhor_followup: MonthlyVocationalRow | null,
  melhor_negociacao: MonthlyVocationalRow | null,
  melhor_fechamento: MonthlyVocationalRow | null,
  has_cycle_events: boolean
): string[] {
  const frases: string[] = []

  if (melhor_fechamento) {
    frases.push(
      `${melhor_fechamento.month_label} se destaca como mês de fechamento (confiança: ${melhor_fechamento.dominant_confidence}).`
    )
  }

  if (melhor_prospeccao) {
    frases.push(
      `${melhor_prospeccao.month_label} apresenta maior força de abertura de trabalho (prospecção).`
    )
  }

  if (melhor_followup && has_cycle_events) {
    frases.push(
      `${melhor_followup.month_label} concentra mais eventos de follow-up e resposta.`
    )
  }

  if (melhor_negociacao && has_cycle_events) {
    frases.push(
      `${melhor_negociacao.month_label} lidera avanços para estágio de negociação.`
    )
  }

  const insuficienteTotal = rows.filter(
    (r) =>
      r.signals.every((s) => s.confidence === 'insuficiente') &&
      r.signals.some((s) => s.count > 0)
  )
  if (insuficienteTotal.length > 0) {
    const names = insuficienteTotal.map((r) => r.month_short).join(', ')
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
    frases.push('Período com volume insuficiente para gerar leitura de vocação mensal.')
  }

  return frases
}

export async function getMonthlySeasonalityVocation(
  filters: MonthlySeasonalityFilters
): Promise<MonthlyVocationalSummary> {
  const supabase = supabaseBrowser()

  // Contagens por mês (índice 1-12) para cada tipo de vocação
  const countsByType: Record<MonthlyVocationType, number[]> = {
    prospeccao: Array(13).fill(0),   // [0] não usado; [1..12] = meses
    followup: Array(13).fill(0),
    negociacao: Array(13).fill(0),
    fechamento: Array(13).fill(0),
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
      const mo = getMonth(ts)
      countsByType.prospeccao[mo] += 1
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
      const mo = getMonth(ts)
      countsByType.fechamento[mo] += 1
    }
  }

  // ==========================================================================
  // 3. Follow-up e Negociação — cycle_events
  //    NOTA: cycle_events não possui owner_user_id direto. Quando ownerId está
  //    ativo, filtramos por created_by como melhor proxy disponível — cobre o
  //    caso do vendedor registrando o próprio evento, mas pode excluir eventos
  //    criados por admin em nome do vendedor. Comportamento consistente com
  //    Fases anteriores (weekdayVocation.ts, monthWeekVocation.ts).
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

        const mo = getMonth(ts)

        if (toStatus === 'contato' || toStatus === 'respondeu') {
          countsByType.followup[mo] += 1
        } else if (toStatus === 'negociacao') {
          countsByType.negociacao[mo] += 1
        }
      }
    }
  } catch {
    has_cycle_events = false
  }

  // ==========================================================================
  // 4. Calcular totals, shares e strengths
  // ==========================================================================
  const vocTypes: MonthlyVocationType[] = ['prospeccao', 'followup', 'negociacao', 'fechamento']

  const totals: Record<MonthlyVocationType, number> = {
    prospeccao: countsByType.prospeccao.reduce((s, c) => s + c, 0),
    followup: countsByType.followup.reduce((s, c) => s + c, 0),
    negociacao: countsByType.negociacao.reduce((s, c) => s + c, 0),
    fechamento: countsByType.fechamento.reduce((s, c) => s + c, 0),
  }

  const maxShares: Record<MonthlyVocationType, number> = {
    prospeccao: 0,
    followup: 0,
    negociacao: 0,
    fechamento: 0,
  }

  for (const vt of vocTypes) {
    const total = totals[vt]
    if (total === 0) continue
    for (let mo = 1; mo <= 12; mo++) {
      const share = countsByType[vt][mo] / total
      if (share > maxShares[vt]) maxShares[vt] = share
    }
  }

  // ==========================================================================
  // 5. Montar rows
  // ==========================================================================
  const rows: MonthlyVocationalRow[] = []

  for (let i = 1; i <= 12; i++) {
    const month = i as MonthIndex

    const signals: MonthlyVocationSignal[] = vocTypes.map((vt) => {
      const count = countsByType[vt][i]
      const total = totals[vt]
      const share = total > 0 ? count / total : 0
      const maxShare = maxShares[vt]
      const strength = maxShare > 0 ? share / maxShare : 0

      const effectiveConfidence: MonthlyVocationConfidence =
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

    const dominant_vocation: MonthlyVocationType | null = dominant?.type ?? null
    const dominant_confidence: MonthlyVocationConfidence = dominant?.confidence ?? 'insuficiente'
    const dominant_label =
      dominant_vocation ? VOCATION_LABELS[dominant_vocation] : 'Base insuficiente'

    const observation = buildObservation(MONTH_LABELS[i], signals, dominant_vocation)

    rows.push({
      month,
      month_label: MONTH_LABELS[i],
      month_short: MONTH_SHORTS[i],
      signals,
      dominant_vocation,
      dominant_label,
      dominant_confidence,
      observation,
    })
  }

  // ==========================================================================
  // 6. Melhores meses por vocação
  // ==========================================================================
  function bestMonthForVocation(vt: MonthlyVocationType): MonthlyVocationalRow | null {
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

  const melhor_mes_prospeccao = bestMonthForVocation('prospeccao')
  const melhor_mes_followup = has_cycle_events ? bestMonthForVocation('followup') : null
  const melhor_mes_negociacao = has_cycle_events ? bestMonthForVocation('negociacao') : null
  const melhor_mes_fechamento = bestMonthForVocation('fechamento')

  // ==========================================================================
  // 7. Leitura resumida
  // ==========================================================================
  const leitura_resumida = buildLeituraResumida(
    rows,
    melhor_mes_prospeccao,
    melhor_mes_followup,
    melhor_mes_negociacao,
    melhor_mes_fechamento,
    has_cycle_events
  )

  return {
    rows,
    melhor_mes_prospeccao,
    melhor_mes_followup,
    melhor_mes_negociacao,
    melhor_mes_fechamento,
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
