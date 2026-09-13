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

import {
  applyCommercialReasoningCoreV2FactualGuard,
  type CommercialReasoningCoreV2FactualGuardReport,
} from './commercial-reasoning-core-v2-factual-guard'

export type CommercialReasoningCoreV2RunResult =
  CommercialReasoningCoreV2ExecutionResult & {
    factual_guard:
      CommercialReasoningCoreV2FactualGuardReport
  }

export async function runCommercialReasoningCoreV2({
  input,
  provider,
}: {
  input: StatefulCopilotInput
  provider: StatefulCopilotProvider
}): Promise<CommercialReasoningCoreV2RunResult> {
  const plan =
    buildCommercialReasoningCoreV2ExecutionPlan({
      input,
    })

  const execution =
    await executeCommercialReasoningCoreV2({
      plan,
      provider,
    })

  const guarded =
    applyCommercialReasoningCoreV2FactualGuard({
      input,
      output: execution.output,
    })

  return {
    ...execution,
    output: guarded.output,
    factual_guard: guarded.report,
  }
}
