import 'server-only'

import {
  parseStatefulCopilotBackgroundJobMessage,
} from './stateful-copilot-background-job'

import {
  processStatefulCopilotBackgroundMessage as processLegacyCompatibleBackgroundMessage,
} from './stateful-copilot-background-worker'

import {
  resolveCompanionBackgroundRuntime,
} from './companion-background-runtime-router'

export async function processCompanionBackgroundMessage(
  rawMessage:
    unknown,
  metadata: {
    delivery_count:
      number
  },
): Promise<void> {
  const job =
    parseStatefulCopilotBackgroundJobMessage(
      rawMessage,
    )

  const runtime =
    resolveCompanionBackgroundRuntime({
      company_id:
        job.company_id,
    })

  return processLegacyCompatibleBackgroundMessage(
    rawMessage,
    metadata,
    {
      run_runtime:
        runtime.run_runtime,
    },
  )
}
