// Sonda de latência da Fase 5.2.7.
//
// Instrumenta somente as chamadas HTTP à OpenAI feitas pelo runner dinâmico.
// Não altera o motor, prompts, Supabase, CRM, Agenda ou WhatsApp.
//
// Uso:
//   node --env-file=.env.local \
//     --conditions=react-server \
//     --import ./scripts/register-typescript-test-loader.mjs \
//     scripts/companion-dynamic-dialogue-latency-probe.mjs \
//     --only price-objection-existing-system

import {
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

const OPENAI_RESPONSES_URL =
  'https://api.openai.com/v1/responses'

const originalFetch =
  globalThis.fetch.bind(globalThis)

const observations = []
const phaseCounters = new Map()

const here = path.dirname(
  fileURLToPath(import.meta.url),
)

const outputDirectory =
  path.resolve(here, 'output')

const outputPath =
  path.join(
    outputDirectory,
    'companion-dynamic-dialogue-latency-probe.json',
  )

function isRecord(value) {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function parseRequestBody(init) {
  if (
    !init ||
    typeof init.body !== 'string'
  ) {
    return {
      raw: null,
      parsed: null,
    }
  }

  try {
    return {
      raw: init.body,
      parsed: JSON.parse(init.body),
    }
  } catch {
    return {
      raw: init.body,
      parsed: null,
    }
  }
}

function classifyPhase(schemaName) {
  switch (schemaName) {
    case 'yolen_stateful_copilot_v2':
      return 'diagnostic'

    case 'yolen_stateful_communication_v1':
      return 'communication'

    case 'dynamic_customer_reply':
      return 'customer_simulator'

    case 'dynamic_companion_judgement':
      return 'judge'

    default:
      return 'unknown'
  }
}

function nextPhaseSequence(phase) {
  const next =
    (phaseCounters.get(phase) ?? 0) + 1

  phaseCounters.set(
    phase,
    next,
  )

  return next
}

function extractPromptMetrics(body, rawBody) {
  const instructions =
    typeof body?.instructions === 'string'
      ? body.instructions
      : ''

  const inputText =
    body?.input?.[0]?.content?.[0]?.text

  return {
    instructions_chars:
      instructions.length,

    input_chars:
      typeof inputText === 'string'
        ? inputText.length
        : 0,

    request_body_chars:
      typeof rawBody === 'string'
        ? rawBody.length
        : 0,

    max_output_tokens:
      Number.isFinite(
        body?.max_output_tokens,
      )
        ? body.max_output_tokens
        : null,
  }
}

function roundMilliseconds(value) {
  return Math.round(value)
}

function normalizeError(error) {
  if (!error) {
    return null
  }

  return {
    name:
      typeof error.name === 'string'
        ? error.name
        : null,

    message:
      typeof error.message === 'string'
        ? error.message
        : String(error),
  }
}

globalThis.fetch = async (
  input,
  init,
) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input?.url

  if (url !== OPENAI_RESPONSES_URL) {
    return originalFetch(
      input,
      init,
    )
  }

  const {
    raw,
    parsed,
  } = parseRequestBody(init)

  const schemaName =
    isRecord(parsed?.text?.format)
      ? parsed.text.format.name ?? null
      : null

  const phase =
    classifyPhase(schemaName)

  const phaseSequence =
    nextPhaseSequence(phase)

  const startedAt =
    new Date().toISOString()

  const started =
    performance.now()

  const baseRecord = {
    sequence:
      observations.length + 1,

    phase,

    phase_sequence:
      phaseSequence,

    schema_name:
      typeof schemaName === 'string'
        ? schemaName
        : null,

    model:
      typeof parsed?.model === 'string'
        ? parsed.model
        : null,

    started_at:
      startedAt,

    ...extractPromptMetrics(
      parsed,
      raw,
    ),
  }

  try {
    const response =
      await originalFetch(
        input,
        init,
      )

    observations.push({
      ...baseRecord,

      duration_ms:
        roundMilliseconds(
          performance.now() - started,
        ),

      ok:
        response.ok,

      status:
        response.status,

      error:
        null,
    })

    return response
  } catch (error) {
    observations.push({
      ...baseRecord,

      duration_ms:
        roundMilliseconds(
          performance.now() - started,
        ),

      ok:
        false,

      status:
        null,

      error:
        normalizeError(error),
    })

    throw error
  }
}

function summarizeByPhase() {
  const phases = {}

  for (const item of observations) {
    const current =
      phases[item.phase] ?? {
        calls: 0,
        total_ms: 0,
        min_ms: null,
        max_ms: null,
        failures: 0,
        total_input_chars: 0,
        total_request_body_chars: 0,
      }

    current.calls += 1
    current.total_ms +=
      item.duration_ms

    current.min_ms =
      current.min_ms === null
        ? item.duration_ms
        : Math.min(
            current.min_ms,
            item.duration_ms,
          )

    current.max_ms =
      current.max_ms === null
        ? item.duration_ms
        : Math.max(
            current.max_ms,
            item.duration_ms,
          )

    if (!item.ok) {
      current.failures += 1
    }

    current.total_input_chars +=
      item.input_chars

    current.total_request_body_chars +=
      item.request_body_chars

    phases[item.phase] =
      current
  }

  for (const value of Object.values(phases)) {
    value.avg_ms =
      value.calls > 0
        ? Math.round(
            value.total_ms /
              value.calls,
          )
        : 0
  }

  return phases
}

function printMilliseconds(value) {
  return `${(
    value / 1000
  ).toFixed(2)}s`
}

let reported = false

function reportLatency() {
  if (reported) {
    return
  }

  reported = true

  const summary =
    summarizeByPhase()

  const report = {
    report_version:
      'phase-5.2.7-latency-probe-v1',

    generated_at:
      new Date().toISOString(),

    observations,
    summary,
  }

  mkdirSync(
    outputDirectory,
    {
      recursive: true,
    },
  )

  writeFileSync(
    outputPath,
    `${JSON.stringify(
      report,
      null,
      2,
    )}\n`,
    'utf8',
  )

  console.log(
    '\n=== FASE 5.2.7 — LATENCIA OPENAI POR CHAMADA ===',
  )

  if (observations.length === 0) {
    console.log(
      'Nenhuma chamada à OpenAI foi observada.',
    )
  }

  for (const item of observations) {
    const status =
      item.ok
        ? `HTTP ${item.status}`
        : item.status === null
          ? item.error?.name ?? 'erro'
          : `HTTP ${item.status}`

    console.log(
      `${String(item.sequence).padStart(2, '0')} | ${item.phase} #${item.phase_sequence} | ${printMilliseconds(item.duration_ms)} | ${status} | modelo=${item.model ?? 'n/a'} | input=${item.input_chars} chars | body=${item.request_body_chars} chars`,
    )
  }

  console.log(
    '\n=== RESUMO POR CAMADA ===',
  )

  for (
    const [phase, value]
    of Object.entries(summary)
  ) {
    console.log(
      `${phase}: ${value.calls} chamada(s) | média ${printMilliseconds(value.avg_ms)} | mín ${printMilliseconds(value.min_ms ?? 0)} | máx ${printMilliseconds(value.max_ms ?? 0)} | total ${printMilliseconds(value.total_ms)} | falhas ${value.failures}`,
    )
  }

  console.log(
    `\nJSON de latência: ${outputPath}`,
  )
}

process.once(
  'beforeExit',
  reportLatency,
)

await import(
  './companion-dynamic-dialogue-validation-runner.mjs'
)
