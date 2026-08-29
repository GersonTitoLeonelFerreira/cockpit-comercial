import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC,
} from './stateful-copilot-background-job'

export type CompanionRuntimeDiagnosticStage =
  'producer_retry' |
  'consumer_start'

export async function recordCompanionRuntimePathDiagnostic({
  admin,
  company_id,
  cycle_id,
  analysis_job_id,
  stage,
}: {
  admin: SupabaseClient
  company_id: string
  cycle_id: string
  analysis_job_id: string
  stage: CompanionRuntimeDiagnosticStage
}): Promise<void> {
  try {
    const {
      error,
    } =
      await admin
        .from(
          'companion_runtime_path_diagnostics',
        )
        .insert({
          company_id,
          cycle_id,
          analysis_job_id,
          stage,
          deployment_sha:
            process.env
              .VERCEL_GIT_COMMIT_SHA ??
            null,
          vercel_env:
            process.env
              .VERCEL_ENV ??
            null,
          queue_topic:
            STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC,
          consumer_version:
            'companion-deep-analysis-v3',
        })

    if (error) {
      console.warn(
        'YOLEN_COMPANION_RUNTIME_PATH_DIAGNOSTIC_FAILED',
        JSON.stringify({
          stage,
          company_id,
          cycle_id,
          analysis_job_id,
          error_code:
            error.code ??
            null,
        }),
      )
    }
  } catch {
    console.warn(
      'YOLEN_COMPANION_RUNTIME_PATH_DIAGNOSTIC_FAILED',
      JSON.stringify({
        stage,
        company_id,
        cycle_id,
        analysis_job_id,
        error_code:
          'UNEXPECTED_DIAGNOSTIC_ERROR',
      }),
    )
  }
}
