import type {
  StatefulCopilotInput,
} from './stateful-copilot-input'

import type {
  CommercialReasoningCoreV2Output,
} from './commercial-reasoning-core-v2-contract'

import {
  sanitizeCommercialReasoningCoreV2Evidence,
} from './commercial-reasoning-core-v2-evidence-guard'

import {
  reconcileCommercialReasoningCoreV2Method,
} from './commercial-reasoning-core-v2-method-guard'

import {
  applyCommercialReasoningCoreV2ContextLimitations,
} from './commercial-reasoning-core-v2-context-guard'

export type CommercialReasoningCoreV2FactualGuardReport = {
  adjusted: boolean
  adjustment_codes: string[]
}

export type CommercialReasoningCoreV2FactualGuardResult = {
  output: CommercialReasoningCoreV2Output
  report: CommercialReasoningCoreV2FactualGuardReport
}

export function applyCommercialReasoningCoreV2FactualGuard({
  input,
  output,
}: {
  input: StatefulCopilotInput
  output: CommercialReasoningCoreV2Output
}): CommercialReasoningCoreV2FactualGuardResult {
  const evidence =
    sanitizeCommercialReasoningCoreV2Evidence({
      input,
      output,
    })

  const method =
    reconcileCommercialReasoningCoreV2Method({
      input,
      output: evidence.output,
    })

  const context =
    applyCommercialReasoningCoreV2ContextLimitations({
      input,
      output: method.output,
    })

  const adjustmentCodes = [
    ...new Set([
      ...evidence.adjustment_codes,
      ...method.adjustment_codes,
      ...context.adjustment_codes,
    ]),
  ]

  return {
    output: context.output,
    report: {
      adjusted: adjustmentCodes.length > 0,
      adjustment_codes: adjustmentCodes,
    },
  }
}
