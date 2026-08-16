import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const MAX_PAIR_GAP_MS = 15 * 60 * 1000

const record = (v) => v && typeof v === 'object' && !Array.isArray(v)
const text = (v) => typeof v === 'string' && v.trim() ? v.trim() : null
const num = (v) => typeof v === 'number' && Number.isFinite(v) ? v : null
const time = (v) => {
  const parsed = Date.parse(text(v) || '')
  return Number.isFinite(parsed) ? parsed : null
}
const path = (value, keys) => {
  let current = value
  for (const key of keys) {
    if (!record(current)) return null
    current = current[key]
  }
  return current
}
const avg = (values) => values.length
  ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
  : null
const pct = (values, ratio) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))]
}

function executionLayers(execution) {
  if (
    record(execution?.diagnostic) ||
    record(execution?.communication)
  ) {
    return [
      ['diagnostic', execution.diagnostic],
      ['communication', execution.communication],
    ].filter(([, value]) => record(value))
  }

  return record(execution)
    ? [['legacy', execution]]
    : []
}

function emptyTokenMetrics() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    measured_events: 0,
  }
}

function pairRuns(events, notes) {
  const used = new Set()
  const pairs = []

  for (const event of [...events].sort((a, b) => (time(a.generated_at) || 0) - (time(b.generated_at) || 0))) {
    const eventTime = time(event.generated_at)
    const cycleId = text(event.cycle_id)
    if (eventTime === null || !cycleId) continue

    let best = -1
    let bestGap = Infinity

    for (let i = 0; i < notes.length; i += 1) {
      if (used.has(i) || text(notes[i]?.cycle_id) !== cycleId) continue
      const noteTime = time(notes[i]?.created_at)
      if (noteTime === null || noteTime > eventTime) continue
      const gap = eventTime - noteTime
      if (gap <= MAX_PAIR_GAP_MS && gap < bestGap) {
        best = i
        bestGap = gap
      }
    }

    if (best >= 0) {
      used.add(best)
      pairs.push({ event, note: notes[best], pair_gap_ms: bestGap })
    }
  }

  return {
    pairs,
    unpaired_v2_count: Math.max(0, events.length - pairs.length),
    unpaired_v1_count: Math.max(0, notes.length - used.size),
  }
}

export function buildShadowReport({
  state_events = [],
  v1_notes = [],
  input_usd_per_1m = null,
  output_usd_per_1m = null,
} = {}) {
  const events = Array.isArray(state_events) ? state_events : []
  const notes = Array.isArray(v1_notes) ? v1_notes : []
  const pairing = pairRuns(events, notes)
  const latencies = []
  const tokens = emptyTokenMetrics()
  const layerTokens = {
    diagnostic: emptyTokenMetrics(),
    communication: emptyTokenMetrics(),
    legacy: emptyTokenMetrics(),
  }
  const models = {}
  let retried = 0
  let recovered = 0
  let crmWrites = 0
  let agendaWrites = 0

  for (const event of events) {
    const generated = time(event.generated_at)
    const persisted = time(event.persisted_at)
    if (generated !== null && persisted !== null && persisted >= generated) {
      latencies.push(persisted - generated)
    }

    const layers = executionLayers(event.execution)
    let eventMeasured = false
    let eventRetried = false
    let eventRecovered = false

    for (const [layerName, execution] of layers) {
      const usage = record(execution.usage) ? execution.usage : {}
      const input = num(usage.input_tokens)
      const output = num(usage.output_tokens)
      const total = num(usage.total_tokens)
      const measured = input !== null || output !== null || total !== null
      const layer = layerTokens[layerName]

      tokens.input_tokens += input || 0
      tokens.output_tokens += output || 0
      tokens.total_tokens += total ?? ((input || 0) + (output || 0))
      layer.input_tokens += input || 0
      layer.output_tokens += output || 0
      layer.total_tokens += total ?? ((input || 0) + (output || 0))

      if (measured) {
        eventMeasured = true
        layer.measured_events += 1
      }

      const model = text(execution.model) || 'unknown'
      const modelKey = layerName === 'legacy' ? model : `${layerName}:${model}`
      models[modelKey] = (models[modelKey] || 0) + 1
      if ((num(execution.attempts) || 0) > 1) eventRetried = true
      if (execution.recovered_after_retry === true) eventRecovered = true
    }

    if (eventMeasured) tokens.measured_events += 1
    if (eventRetried) retried += 1
    if (eventRecovered) recovered += 1
    if (event.automatic_crm_write === true) crmWrites += 1
    if (event.automatic_agenda_write === true) agendaWrites += 1
  }

  let comparable = 0
  let agreements = 0
  const comparisons = pairing.pairs.map(({ event, note, pair_gap_ms }) => {
    const v1 = text(path(note, ['yolen_decision', 'recommended_status']))
    const v2 = text(path(event, ['normalized_output', 'operational_suggestions', 'crm', 'recommended_status']))
    const canCompare = Boolean(v1 && v2)
    const agrees = canCompare ? v1 === v2 : null
    if (canCompare) {
      comparable += 1
      if (agrees) agreements += 1
    }
    return { cycle_id: text(event.cycle_id), generated_at: text(event.generated_at), pair_gap_ms, v1_recommended_status: v1, v2_recommended_status: v2, comparable: canCompare, agrees }
  })

  const inputRate = num(input_usd_per_1m)
  const outputRate = num(output_usd_per_1m)
  const cost = inputRate !== null && outputRate !== null
    ? Number(((tokens.input_tokens / 1_000_000) * inputRate + (tokens.output_tokens / 1_000_000) * outputRate).toFixed(6))
    : null

  return {
    report_version: 'phase-5.2-shadow-report-v2',
    totals: {
      v1_analyses: notes.length,
      v2_persisted_analyses: events.length,
      paired_analyses: pairing.pairs.length,
      v1_without_persisted_v2: pairing.unpaired_v1_count,
      v2_without_matching_v1: pairing.unpaired_v2_count,
    },
    persistence_latency_ms: {
      measured_events: latencies.length,
      average: avg(latencies),
      p50: pct(latencies, 0.5),
      p95: pct(latencies, 0.95),
      max: latencies.length ? Math.max(...latencies) : null,
    },
    tokens,
    layer_tokens: layerTokens,
    estimated_cost_usd: cost,
    pricing: { input_usd_per_1m: inputRate, output_usd_per_1m: outputRate },
    models,
    retries: { retried_events: retried, recovered_events: recovered },
    safety: {
      automatic_crm_writes: crmWrites,
      automatic_agenda_writes: agendaWrites,
      passed: crmWrites === 0 && agendaWrites === 0,
    },
    crm_status_comparison: {
      comparable_pairs: comparable,
      agreements,
      disagreements: comparable - agreements,
      agreement_rate: comparable ? Number((agreements / comparable).toFixed(4)) : null,
    },
    comparisons,
  }
}

function uuid(value) {
  const normalized = text(value)
  if (!normalized || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error('O company_id precisa ser um UUID válido.')
  }
  return normalized.toLowerCase()
}

async function main() {
  const url = text(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const key = text(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !key) throw new Error('Supabase server-side não configurado.')

  const companyId = uuid(process.argv[2])
  const hours = process.argv[3] === undefined ? 24 : Number(process.argv[3])
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
    throw new Error('A janela precisa ser um inteiro entre 1 e 720 horas.')
  }

  const since = new Date(Date.now() - hours * 3600000).toISOString()
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const [v2, v1] = await Promise.all([
    admin.from('companion_commercial_state_events')
      .select('cycle_id,normalized_output,execution,automatic_crm_write,automatic_agenda_write,generated_at,persisted_at')
      .eq('company_id', companyId).gte('generated_at', since).order('generated_at').limit(1000),
    admin.from('ai_coaching_notes')
      .select('cycle_id,yolen_decision,created_at')
      .eq('company_id', companyId).eq('source', 'whatsapp_companion')
      .gte('created_at', since).order('created_at').limit(3000),
  ])

  if (v2.error) throw new Error('Falha ao carregar eventos V2.')
  if (v1.error) throw new Error('Falha ao carregar análises V1.')

  const report = buildShadowReport({
    state_events: v2.data || [],
    v1_notes: v1.data || [],
    input_usd_per_1m: process.env.COMPANION_SHADOW_INPUT_USD_PER_1M ? Number(process.env.COMPANION_SHADOW_INPUT_USD_PER_1M) : null,
    output_usd_per_1m: process.env.COMPANION_SHADOW_OUTPUT_USD_PER_1M ? Number(process.env.COMPANION_SHADOW_OUTPUT_USD_PER_1M) : null,
  })

  console.log(JSON.stringify({ company_id: companyId, window_hours: hours, since, ...report }, null, 2))
}

const direct = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (direct) main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha inesperada no relatório shadow.')
  process.exitCode = 1
})
