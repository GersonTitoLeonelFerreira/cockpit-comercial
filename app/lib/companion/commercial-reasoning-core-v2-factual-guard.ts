import type {
  StatefulCopilotInput,
} from './stateful-copilot-input'

import type {
  CommercialReasoningCoreV2Output,
} from './commercial-reasoning-core-v2-contract'

export type CommercialReasoningCoreV2FactualGuardReport = {
  adjusted: boolean
  adjustment_codes: string[]
}

export type CommercialReasoningCoreV2FactualGuardResult = {
  output: CommercialReasoningCoreV2Output
  report: CommercialReasoningCoreV2FactualGuardReport
}

export function applyCommercialReasoningCoreV2FactualGuard({
  input: _input,
  output,
}: {
  input: StatefulCopilotInput
  output: CommercialReasoningCoreV2Output
}): CommercialReasoningCoreV2FactualGuardResult {
  return {
    output,
    report: {
      adjusted: false,
      adjustment_codes: [],
    },
  }
}
