import {
  readFileSync,
} from 'node:fs'

import {
  resolve,
} from 'node:path'

import {
  buildStatefulCopilotActivePilotReport,
} from '../app/lib/companion/stateful-copilot-active-pilot-report.ts'

const inputPath =
  process.argv[2]

if (!inputPath) {
  console.error(
    'Uso: npm run report:companion-active-pilot -- <arquivo.json> [minimum_events] [maximum_fallback_rate]',
  )

  process.exit(2)
}

const minimumEvents =
  process.argv[3] ===
    undefined
    ? undefined
    : Number(
        process.argv[3],
      )

const maximumFallbackRate =
  process.argv[4] ===
    undefined
    ? undefined
    : Number(
        process.argv[4],
      )

let parsed

try {
  parsed =
    JSON.parse(
      readFileSync(
        resolve(
          inputPath,
        ),
        'utf8',
      ),
    )
} catch {
  console.error(
    'Arquivo de telemetria inválido ou JSON malformado.',
  )

  process.exit(2)
}

const telemetry =
  Array.isArray(
    parsed,
  )
    ? parsed
    : Array.isArray(
          parsed?.events,
        )
      ? parsed.events
      : null

if (!telemetry) {
  console.error(
    'O arquivo precisa conter uma lista JSON ou um objeto com events[].',
  )

  process.exit(2)
}

const thresholds =
  minimumEvents ===
      undefined &&
    maximumFallbackRate ===
      undefined
    ? undefined
    : {
        ...(minimumEvents ===
        undefined
          ? {}
          : {
              minimum_events:
                minimumEvents,
            }),

        ...(maximumFallbackRate ===
        undefined
          ? {}
          : {
              maximum_fallback_rate:
                maximumFallbackRate,
            }),
      }

let report

try {
  report =
    buildStatefulCopilotActivePilotReport({
      telemetry,
      thresholds,
    })
} catch (error) {
  console.error(
    error instanceof
      Error
      ? error.message
      : 'Falha ao gerar relatório do piloto active.',
  )

  process.exit(2)
}

console.log(
  JSON.stringify(
    report,
    null,
    2,
  ),
)

if (
  report.decision ===
  'KILL_SWITCH'
) {
  process.exitCode =
    3
}
