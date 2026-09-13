import type { StatefulCopilotInput } from './stateful-copilot-input'
import type { CommercialReasoningCoreV2Output } from './commercial-reasoning-core-v2-contract'

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
  const codes: string[] = []
  const unknowns = [...output.factuality.unknowns]
  const messages = input.diagnostic_input.conversation.messages
  const methodConfig = input.diagnostic_input.commercial_context.sales_method

  if (messages.some(message =>
    message.content_type === 'audio' &&
    !message.audio_transcription?.trim()
  )) {
    unknowns.push('Existe áudio sem transcrição disponível; seu conteúdo não foi tratado como fato.')
    codes.push('PENDING_AUDIO_DECLARED_AS_UNKNOWN')
  }

  if (messages.some(message => {
    const text = message.text_content?.toLowerCase() ?? ''
    return text.includes('[arquivo:') || text.includes('[anexo:')
  })) {
    unknowns.push('Existe anexo registrado, mas o conteúdo interno do arquivo não está disponível nesta fotografia.')
    codes.push('ATTACHMENT_CONTENT_DECLARED_AS_UNKNOWN')
  }

  const method = methodConfig.configured
    ? {
        ...output.method,
        configured: true,
        name: methodConfig.name ?? output.method.name,
      }
    : {
        configured: false as const,
        name: null,
        current_stage: null,
        adherence: 'not_configured' as const,
        deviation: null,
        recovery_move: null,
        evidence_message_ids: [],
      }

  if (!methodConfig.configured && output.method.configured) {
    codes.push('METHOD_CONFIGURATION_RECONCILED')
  }

  const communication = output.communication.intervention_needed
    ? output.communication
    : {
        intervention_needed: false,
        recommended_question: null,
        suggested_message: null,
      }

  if (!output.communication.intervention_needed &&
    (output.communication.recommended_question || output.communication.suggested_message)) {
    codes.push('SILENT_COMMUNICATION_NORMALIZED')
  }

  const guardedOutput: CommercialReasoningCoreV2Output = {
    ...output,
    method,
    communication,
    factuality: {
      ...output.factuality,
      unknowns: [...new Set(unknowns)],
    },
  }

  const adjustmentCodes = [...new Set(codes)]

  return {
    output: guardedOutput,
    report: {
      adjusted: adjustmentCodes.length > 0,
      adjustment_codes: adjustmentCodes,
    },
  }
}
