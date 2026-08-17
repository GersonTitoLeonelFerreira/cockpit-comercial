import {
  createClient,
} from '@supabase/supabase-js'

import {
  buildStatefulCopilotActivePilotReport,
} from '../app/lib/companion/stateful-copilot-active-pilot-report.ts'

import {
  loadStatefulCopilotActivePilotTelemetry,
} from '../app/lib/server/stateful-copilot-active-pilot-report-source.ts'

function text(
  value,
) {
  return typeof value ===
    'string' &&
    value.trim()
    ? value.trim()
    : null
}

const companyId =
  text(
    process.argv[2],
  )

if (
  !companyId
) {
  console.error(
    'Uso: npm run report:companion-active-pilot-live -- <company_id> [hours] [minimum_events] [maximum_fallback_rate]',
  )

  process.exit(2)
}

const hours =
  process.argv[3] ===
    undefined
    ? 24
    : Number(
        process.argv[3],
      )

if (
  !Number.isInteger(
    hours,
  ) ||
  hours <
    1 ||
  hours >
    720
) {
  console.error(
    'A janela precisa ser um inteiro entre 1 e 720 horas.',
  )

  process.exit(2)
}

const minimumEvents =
  process.argv[4] ===
    undefined
    ? undefined
    : Number(
        process.argv[4],
      )

const maximumFallbackRate =
  process.argv[5] ===
    undefined
    ? undefined
    : Number(
        process.argv[5],
      )

const url =
  text(
    process.env
      .NEXT_PUBLIC_SUPABASE_URL,
  )

const serviceRoleKey =
  text(
    process.env
      .SUPABASE_SERVICE_ROLE_KEY,
  )

if (
  !url ||
  !serviceRoleKey
) {
  console.error(
    'Supabase server-side não configurado.',
  )

  process.exit(2)
}

const since =
  new Date(
    Date.now() -
    hours *
      60 *
      60 *
      1000,
  ).toISOString()

const admin =
  createClient(
    url,
    serviceRoleKey,
    {
      auth: {
        persistSession:
          false,

        autoRefreshToken:
          false,
      },
    },
  )

let telemetry

try {
  telemetry =
    await loadStatefulCopilotActivePilotTelemetry({
      company_id:
        companyId,

      since,

      query:
        async ({
          company_id,
          since,
          limit,
        }) => {
          const {
            data,
            error,
          } =
            await admin
              .from(
                'companion_active_pilot_events',
              )
              .select(
                'telemetry,recorded_at',
              )
              .eq(
                'company_id',
                company_id,
              )
              .gte(
                'recorded_at',
                since,
              )
              .order(
                'recorded_at',
                {
                  ascending:
                    true,
                },
              )
              .limit(
                limit,
              )

          return {
            data,
            error,
          }
        },
    })
} catch (error) {
  console.error(
    error instanceof
      Error
      ? error.message
      : 'Falha ao carregar auditoria do piloto active.',
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
    {
      company_id:
        companyId,

      window_hours:
        hours,

      since,

      event_source:
        'companion_active_pilot_events',

      ...report,
    },
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
