import {
  assessStatefulCopilotActivePilotReadiness,
} from '../app/lib/companion/stateful-copilot-active-pilot-readiness.ts'

const companyId =
  process.argv[2]
    ?.trim()

if (!companyId) {
  console.error(
    'Uso: npm run check:companion-active-readiness -- <company_id>',
  )

  process.exit(2)
}

const report =
  assessStatefulCopilotActivePilotReadiness({
    company_id:
      companyId,

    configured_mode:
      process.env
        .COMPANION_STATEFUL_MODE,

    configured_company_ids:
      process.env
        .COMPANION_STATEFUL_COMPANY_IDS,

    configured_engine_version:
      process.env
        .COMPANION_ENGINE_VERSION,
  })

console.log(
  JSON.stringify(
    report,
    null,
    2,
  ),
)

if (!report.ready) {
  process.exitCode =
    1
}
