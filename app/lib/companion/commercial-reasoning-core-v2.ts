import type {
  StatefulCopilotInput,
} from './stateful-copilot-input'

import type {
  StatefulCopilotProvider,
} from './stateful-copilot-executor'

import {
  buildCommercialReasoningCoreV2ExecutionPlan,
} from './commercial-reasoning-core-v2-execution-plan'

import {
  executeCommercialReasoningCoreV2,
  type CommercialReasoningCoreV2ExecutionResult,
} from './commercial-reasoning-core-v2-executor'

export async function runCommercialReasoningCoreV2({
  input,
  provider,
}: {
  input: StatefulCopilotInput
  provider: StatefulCopilotProvider
}): Promise<CommercialReasoningCoreV2ExecutionResult> {
  const plan =
    buildCommercialReasoningCoreV2ExecutionPlan({
      input,
    })

  return executeCommercialReasoningCoreV2({
    plan,
    provider,
  })
}
