// ==============================================================================
// Service: Vocação Operacional por Dia da Semana — Fase 6.2
//
// Classifica cada dia da semana segundo sua vocação operacional predominante:
//   - Prospecção:  sales_cycles.first_worked_at (primeiro trabalho real no ciclo)
//   - Fechamento:  sales_cycles.won_at (ganhos confirmados)
//   - Follow-up:   cycle_events com event_type='stage_changed' e
//                  metadata.to_status IN ('contato','respondeu')
//   - Negociação:  cycle_events com event_type='stage_changed' e
//                  metadata.to_status = 'negociacao'
//
// HONESTIDADE DAS MÉTRICAS:
//   - Se count < 3 para um tipo de vocação, a confiança é 'insuficiente'
//   - Se cycle_events não retornar dados, followup e negociacao ficam como 'insuficiente'
//   - Não há forçar vocação artificial quando a base é insuficiente
// ==============================================================================

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import type {
  WeekdayVocationFilters,
  WeekdayVocationRow,
  WeekdayVocationSummary,
  VocationType,
  VocationConfidence,
  VocationSignal,
} from '@/app/types/weekdayVocation'
import type { WeekdayIndex } from '@/app/types/weekdayPerformance'

const BUSINESS_TZ = 'America/Sao_Paulo'

function weekdayInBusinessTZ(ts: string | Date): WeekdayIndex {
  const d = ts instanceof Date ? ts : new Date(ts)
  const wdShort = d.toLocaleString('en-US', { timeZone: BUSINESS_TZ, weekday: 'short' })

  const map: Record<string, WeekdayIndex> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  return (map[wdShort] ?? 0) as WeekdayIndex
}

const WEEKDAY_LABELS: string[] = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
]

const WEEKDAY_SHORTS: string[] = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const VOCATION_LABELS: Record<VocationType, string> = {
  prospeccao: 'Prospecção',
  followup: 'Follow-up',
  negociacao: 'Negociação',
  fechamento: 'Fechamento',
}

/**
 * Determina o nível de confiança com base na contagem de eventos.
 * Thresholds: alta >= 15, moderada >= 8, baixa >= 3, insuficiente < 3
 */
function classifyConfidence(count: number): VocationConfidence {
  if (count >= 15) return 'alta'
  if (count >= 8) return 'moderada'
  if (count >= 3) return 'baixa'
  return 'insuficiente'
}

/**
 * Constrói a observação textual para um dia com base nos seus sinais.
 */
function buildObservation(
  weekday_label: string,
  signals: VocationSignal[],
  dominant_vocation: VocationType | null
): string {
  if (!dominant_vocation) {
    return `${weekday_label} não tem base suficiente para classificar vocação operacional.`
  }

  const dominated = signals.find((s) => s.type === dominant_vocation)
  if (!dominated) return `${weekday_label}: dados insuficientes.`

  const confLabel: Record<VocationConfidence, string> = {
    alta: 'forte',
    moderada: 'moderada',
    baixa: 'fraca',
    insuficiente: 'insuficiente',
  }

  const parts: string[] = [
    `${weekday_label} apresenta vocação predominante de ${dominated.label} (confiança ${confLabel[dominated.confidence]}).`,
  ]

  // Menciona forças secundárias relevantes
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

  // Alerta dias fracos de fechamento mas fortes de prospecção
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
    parts.push(`Dia fraco de fechamento mas forte de prospecção — priorizar abertura de contatos.`)
  }

  return parts.join(' ')
}

/**
 * Gera a leitura resumida para o período com frases diagnósticas.
 */
function buildLeituraResumida(
  rows: WeekdayVocationRow[],
  melhor_dia_prospeccao: WeekdayVocationRow | null,
  melhor_dia_followup: WeekdayVocationRow | null,
  melhor_dia_negociacao: WeekdayVocationRow | null,
  melhor_dia_fechamento: WeekdayVocationRow | null,
  has_cycle_events: boolean
): string[] {
  const frases: string[] = []

  if (melhor_dia_fechamento) {
    frases.push(
      `${melhor_dia_fechamento.weekday_label} se destaca como dia de fechamento (confiança: ${melhor_dia_fechamento.dominant_confidence}).`
    )
  }

  if (melhor_dia_prospeccao) {
    frases.push(
      `${melhor_dia_prospeccao.weekday_label} apresenta maior força de abertura de trabalho (prospecção).`
    )
  }

  if (melhor_dia_followup && has_cycle_events) {
    frases.push(
      `${melhor_dia_followup.weekday_label} concentra mais eventos de follow-up e resposta.`
    )
  }

  if (melhor_dia_negociacao && has_cycle_events) {
    frases.push(
      `${melhor_dia_negociacao.weekday_label} lidera avanços para estágio de negociação.`
    )
  }

  // Dias com base insuficiente em tudo
  const insuficienteTotal = rows.filter(
    (r) =>
      r.signals.every((s) => s.confidence === 'insuficiente') &&
      r.signals.some((s) => s.count > 0)
  )
  if (insuficienteTotal.length > 0) {
    const names = insuficienteTotal.map((r) => r.weekday_short).join(', ')
    frases.push(
      `Os dias ${names} têm volume muito baixo de atividade — amplie o período para leitura mais confiável.`
    )
  }

  if (!has_cycle_events) {
    frases.push(
      'Follow-up e negociação não puderam ser classificados: nenhum evento de cycle_events encontrado no período.'
    )
  }

  if (frases.length === 0) {
    frases.push('Período com volume insuficiente para gerar leitura de vocação operacional.')
  }

  return frases
}

/**
 * Função principal: retorna a classificação de vocação operacional por dia da semana.
 */
export async function getWeekdayVocation(
  filters: WeekdayVocationFilters
): Promise<WeekdayVocationSummary> {
  const supabase = supabaseBrowser()

  // Counts per weekday for each vocation type
  const countsByType: Record<VocationType, number[]> = {
    prospeccao: Array(7).fill(0),
    followup: Array(7).fill(0),
    negociacao: Array(7).fill(0),
    fechamento: Array(7).fill(0),
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
      const wd = weekdayInBusinessTZ(ts)
      countsByType.prospeccao[wd] += 1
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
      const wd = weekdayInBusinessTZ(ts)
      countsByType.fechamento[wd] += 1
    }
  }

  // ==========================================================================
  // 3. Follow-up e Negociação — cycle_events
  //    Não quebra se a tabela não existir ou não tiver company_id
  // ==========================================================================
  let has_cycle_events = false

  try {
    const { data: eventsData, error: eventsError } = await supabase
      .from('cycle_events')
      .select('created_at, event_type, metadata')
      .eq('company_id', filters.companyId)
      .eq('event_type', 'stage_changed')
      .gte('created_at', dateStartIso)
      .lte('created_at', dateEndIso)

    if (!eventsError && eventsData && eventsData.length > 0) {
      has_cycle_events = true

      for (const row of eventsData) {
        const r = row as Record<string, unknown>
        const ts = r.created_at as string | null
        if (!ts) continue

        const meta = r.metadata as Record<string, unknown> | null
        const toStatus = meta?.to_status as string | undefined

        if (!toStatus) continue

        const wd = weekdayInBusinessTZ(ts)

        if (toStatus === 'contato' || toStatus === 'respondeu') {
          countsByType.followup[wd] += 1
        } else if (toStatus === 'negociacao') {
          countsByType.negociacao[wd] += 1
        }
      }
    }
  } catch {
    // cycle_events may not exist in all installations — gracefully degrade
    has_cycle_events = false
  }

  // ==========================================================================
  // 4. Calcular totals, shares e strengths por tipo
  // ==========================================================================
  const totals: Record<VocationType, number> = {
    prospeccao: countsByType.prospeccao.reduce((s, c) => s + c, 0),
    followup: countsByType.followup.reduce((s, c) => s + c, 0),
    negociacao: countsByType.negociacao.reduce((s, c) => s + c, 0),
    fechamento: countsByType.fechamento.reduce((s, c) => s + c, 0),
  }

  const maxShares: Record<VocationType, number> = {
    prospeccao: 0,
    followup: 0,
    negociacao: 0,
    fechamento: 0,
  }

  const vocTypes: VocationType[] = ['prospeccao', 'followup', 'negociacao', 'fechamento']

  for (const vt of vocTypes) {
    const total = totals[vt]
    if (total === 0) continue
    for (let wd = 0; wd < 7; wd++) {
      const share = countsByType[vt][wd] / total
      if (share > maxShares[vt]) maxShares[vt] = share
    }
  }

  const SOURCE_DESCRIPTIONS: Record<VocationType, string> = {
    prospeccao: 'Baseado em first_worked_at de sales_cycles',
    followup: "Baseado em cycle_events com to_status IN ('contato','respondeu')",
    negociacao: "Baseado em cycle_events com to_status = 'negociacao'",
    fechamento: 'Baseado em won_at de sales_cycles (status=ganho)',
  }

  // ==========================================================================
  // 5. Montar rows
  // ==========================================================================
  const rows: WeekdayVocationRow[] = []

  for (let i = 0; i < 7; i++) {
    const wd = i as WeekdayIndex

    const signals: VocationSignal[] = vocTypes.map((vt) => {
      const count = countsByType[vt][wd]
      const total = totals[vt]
      const share = total > 0 ? count / total : 0
      const maxShare = maxShares[vt]
      const strength = maxShare > 0 ? share / maxShare : 0

      // followup e negociacao ficam insuficiente se cycle_events não teve dados
      const effectiveConfidence: VocationConfidence =
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

    // Determina vocação dominante: sinal com maior strength que não seja insuficiente
    const eligible = signals.filter((s) => s.confidence !== 'insuficiente' && s.count > 0)
    const dominant =
      eligible.length > 0
        ? eligible.reduce((best, s) => (s.strength > best.strength ? s : best))
        : null

    const dominant_vocation: VocationType | null = dominant?.type ?? null
    const dominant_confidence: VocationConfidence = dominant?.confidence ?? 'insuficiente'
    const dominant_label =
      dominant_vocation ? VOCATION_LABELS[dominant_vocation] : 'Base insuficiente'

    const observation = buildObservation(WEEKDAY_LABELS[i], signals, dominant_vocation)

    rows.push({
      weekday: wd,
      weekday_label: WEEKDAY_LABELS[i],
      weekday_short: WEEKDAY_SHORTS[i],
      signals,
      dominant_vocation,
      dominant_label,
      dominant_confidence,
      observation,
    })
  }

  // ==========================================================================
  // 6. Melhores dias por vocação
  // ==========================================================================
  function bestDayForVocation(vt: VocationType): WeekdayVocationRow | null {
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

  const melhor_dia_prospeccao = bestDayForVocation('prospeccao')
  const melhor_dia_followup = has_cycle_events ? bestDayForVocation('followup') : null
  const melhor_dia_negociacao = has_cycle_events ? bestDayForVocation('negociacao') : null
  const melhor_dia_fechamento = bestDayForVocation('fechamento')

  // ==========================================================================
  // 7. Leitura resumida
  // ==========================================================================
  const leitura_resumida = buildLeituraResumida(
    rows,
    melhor_dia_prospeccao,
    melhor_dia_followup,
    melhor_dia_negociacao,
    melhor_dia_fechamento,
    has_cycle_events
  )

  return {
    rows,
    melhor_dia_prospeccao,
    melhor_dia_followup,
    melhor_dia_negociacao,
    melhor_dia_fechamento,
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
