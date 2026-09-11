import type {
  StatefulCopilotOutput,
} from './stateful-copilot-contract'

import type {
  StatefulCopilotExecutionPlan,
} from './stateful-copilot-execution-plan'

import {
  StatefulCopilotExecutionError,
  executeStatefulCopilotModelAttempt,
  type StatefulCopilotExecutionAttemptResult,
  type StatefulCopilotProvider,
} from './stateful-copilot-executor'

import {
  CommercialTruthGuardError,
  assessCommercialTruthFromUserPrompt,
  reconcileStatefulCommercialTruth,
} from './commercial-truth'

import {
  deriveCommercialResponsibilityFromUserPrompt,
} from './commercial-responsibility'

const RETRYABLE_MODEL_OUTPUT_CODES =
  new Set([
    'EMPTY_MODEL_OUTPUT',
    'INVALID_MODEL_JSON',
    'INVALID_MODEL_OUTPUT',
  ])

type StatefulCopilotAttemptExecutor =
  typeof executeStatefulCopilotModelAttempt

type JsonRecord =
  Record<string, unknown>

export type StatefulCopilotOrchestratorDependencies = {
  execute_attempt?:
    StatefulCopilotAttemptExecutor
}

export type StatefulCopilotBlockedResult = {
  mode: 'blocked'

  output: null

  limitations: string[]

  execution: {
    mode: 'blocked'
    provider: 'deterministic'
    model: null
    request_id: null
    usage: null
    attempts: 0
    recovered_after_retry: false
  }
}

export type StatefulCopilotModelResult = {
  mode: 'model'

  output:
    StatefulCopilotOutput

  execution:
    StatefulCopilotExecutionAttemptResult[
      'execution'
    ] & {
      attempts: 1 | 2

      recovered_after_retry:
        boolean
    }
}

export type StatefulCopilotOrchestrationResult =
  | StatefulCopilotBlockedResult
  | StatefulCopilotModelResult

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function shouldRetryModelOutput(
  error: unknown,
): boolean {
  return (
    error instanceof
      CommercialTruthGuardError ||
    (
      error instanceof
        StatefulCopilotExecutionError &&
      RETRYABLE_MODEL_OUTPUT_CODES.has(
        error.code,
      )
    )
  )
}

function buildCommercialTruthInstruction(
  userPrompt: string,
): string | null {
  const assessment =
    assessCommercialTruthFromUserPrompt(
      userPrompt,
    )

  if (
    !assessment.requires_commercial_relevance &&
    !assessment.third_party_prospect_detected &&
    assessment.stage_floor === null
  ) {
    return null
  }

  const responsibility =
    deriveCommercialResponsibilityFromUserPrompt(
      userPrompt,
    )

  const rules = [
    'COMMERCIAL_TRUTH_GUARD — estas restrições foram derivadas deterministicamente da fotografia atual e não podem ser contraditas pelo modelo.',
    `commercial_relevance_required=${assessment.requires_commercial_relevance ? 'commercial' : 'not_forced'}.`,
    `buyer_side_role_required=${assessment.requires_buyer_side_role ? 'buyer' : 'not_forced'}.`,
    `minimum_journey_stage=${assessment.stage_floor ?? 'none'}.`,
    `signals=${assessment.signal_categories.join(',') || 'none'}.`,
    `pending_fact=${responsibility.pending_fact ?? 'none'}.`,
    `seller_action_already_performed=${responsibility.seller_action_already_performed ? 'true' : 'false'}.`,
    `waiting_on=${responsibility.waiting_on}.`,
    `responsibility_evidence_message_ids=${responsibility.evidence_message_ids.join(',') || 'none'}.`,
    'Separe fato pendente de ação já executada pelo vendedor. Mensagem outgoing atual prova apenas o que o vendedor já fez; não a transforme em pendência futura nem recomende repetir a mesma ação.',
    'Determine quem precisa agir agora pelo estado da conversa. Quando o vendedor já transferiu uma próxima ação concreta ao cliente, não crie nova ação do vendedor apenas para manter movimento artificial.',
    'A fotografia de responsabilidade acima é um guard operacional: use-a para evitar repetição, mas não invente conclusão comercial que as mensagens não sustentam.',
  ]

  if (assessment.third_party_prospect_detected) {
    rules.push(
      'A conversa atual indica terceiro como prospect real. O contato atual continua sendo o interlocutor e deve estar representado como commercial_party.current_contact.intermediary; a pessoa indicada deve estar representada como commercial_party.related.prospect. Se esses fatos já estiverem ativos no estado anterior, preserve-os e não os duplique; caso contrário, adicione-os ao state_patch. Não trate interlocutor e prospect como a mesma pessoa.',
    )
  }

  return rules.join('\n')
}

function buildTruthAwarePlan(
  plan: StatefulCopilotExecutionPlan,
): StatefulCopilotExecutionPlan {
  if (plan.mode !== 'model') {
    return plan
  }

  const instruction =
    buildCommercialTruthInstruction(
      plan.request.user_prompt,
    )

  if (!instruction) {
    return plan
  }

  return {
    ...plan,
    request: {
      ...plan.request,
      system_prompt: [
        plan.request.system_prompt,
        instruction,
      ].join('\n'),
    },
  }
}

function collectActiveExistingPartyKinds(
  userPrompt: string,
): Set<string> {
  let parsed: unknown

  try {
    parsed = JSON.parse(userPrompt)
  } catch {
    return new Set()
  }

  if (!isRecord(parsed)) {
    return new Set()
  }

  const input =
    isRecord(parsed.input)
      ? parsed.input
      : null

  const stateContext =
    isRecord(input?.state_context)
      ? input.state_context
      : null

  const previousState =
    isRecord(stateContext?.previous_state)
      ? stateContext.previous_state
      : null

  const facts =
    Array.isArray(previousState?.facts)
      ? previousState.facts
      : []

  return new Set(
    facts
      .filter(isRecord)
      .filter(
        fact =>
          fact.memory_status === 'active' &&
          typeof fact.kind === 'string',
      )
      .map(
        fact => fact.kind as string,
      )
      .filter(
        kind =>
          kind.startsWith(
            'commercial_party.',
          ),
      ),
  )
}

function validateThirdPartyRoles({
  plan,
  output,
}: {
  plan: StatefulCopilotExecutionPlan
  output: StatefulCopilotOutput
}): void {
  if (plan.mode !== 'model') {
    return
  }

  const assessment =
    assessCommercialTruthFromUserPrompt(
      plan.request.user_prompt,
    )

  if (!assessment.third_party_prospect_detected) {
    return
  }

  const kinds =
    collectActiveExistingPartyKinds(
      plan.request.user_prompt,
    )

  for (
    const fact of
    output.state_patch.facts_to_add
  ) {
    kinds.add(fact.kind)
  }

  const requiredKinds = [
    'commercial_party.current_contact.intermediary',
    'commercial_party.related.prospect',
  ]

  const missingKinds =
    requiredKinds.filter(
      kind => !kinds.has(kind),
    )

  if (missingKinds.length === 0) {
    return
  }

  throw new CommercialTruthGuardError({
    code:
      'THIRD_PARTY_ROLE_FACTS_REQUIRED',
    path:
      'output.state_patch.facts_to_add',
    message:
      'A oportunidade de terceiro precisa distinguir interlocutor e prospect no estado comercial.',
    reasons: [
      ...assessment.reasons,
      `Papéis ausentes: ${missingKinds.join(', ')}.`,
    ],
  })
}

function reconcileAttemptResult({
  result,
  plan,
}: {
  result:
    StatefulCopilotExecutionAttemptResult
  plan:
    StatefulCopilotExecutionPlan
}): StatefulCopilotExecutionAttemptResult {
  if (plan.mode !== 'model') {
    return result
  }

  const output =
    reconcileStatefulCommercialTruth({
      user_prompt:
        plan.request.user_prompt,
      output:
        result.output,
    })

  validateThirdPartyRoles({
    plan,
    output,
  })

  return {
    ...result,
    output,
  }
}

function buildRepairPlan({
  plan,
  error,
}: {
  plan: StatefulCopilotExecutionPlan
  error: unknown
}): StatefulCopilotExecutionPlan {
  if (
    plan.mode !== 'model' ||
    !(error instanceof CommercialTruthGuardError)
  ) {
    return plan
  }

  const repairInstruction = [
    'REPARO OBRIGATÓRIO DO COMMERCIAL_TRUTH_GUARD.',
    `failure_code=${error.code}.`,
    `failure_path=${error.path}.`,
    ...error.reasons.map(
      reason => `reason=${reason}`,
    ),
    'Corrija a classificação/papéis/estado indicados sem apagar evidência comercial válida e retorne novamente o contrato completo.',
  ].join('\n')

  return {
    ...plan,
    request: {
      ...plan.request,
      system_prompt: [
        plan.request.system_prompt,
        repairInstruction,
      ].join('\n'),
    },
  }
}

function buildModelResult({
  result,
  attempts,
}: {
  result:
    StatefulCopilotExecutionAttemptResult

  attempts:
    1 | 2
}): StatefulCopilotModelResult {
  return {
    mode:
      'model',

    output:
      result.output,

    execution: {
      ...result.execution,

      attempts,

      recovered_after_retry:
        attempts === 2,
    },
  }
}

export async function executeStatefulCopilotPlan({
  plan,
  provider,
  dependencies = {},
}: {
  plan:
    StatefulCopilotExecutionPlan

  provider:
    StatefulCopilotProvider

  dependencies?:
    StatefulCopilotOrchestratorDependencies
}): Promise<StatefulCopilotOrchestrationResult> {
  if (plan.mode === 'blocked') {
    return {
      mode:
        'blocked',

      output:
        null,

      limitations: [
        ...plan.limitations,
      ],

      execution: {
        mode:
          'blocked',

        provider:
          'deterministic',

        model:
          null,

        request_id:
          null,

        usage:
          null,

        attempts:
          0,

        recovered_after_retry:
          false,
      },
    }
  }

  const executeAttempt =
    dependencies.execute_attempt ??
    executeStatefulCopilotModelAttempt

  const truthAwarePlan =
    buildTruthAwarePlan(plan)

  let firstError: unknown = null

  try {
    const firstResult =
      await executeAttempt({
        plan:
          truthAwarePlan,
        provider,
      })

    return buildModelResult({
      result:
        reconcileAttemptResult({
          result:
            firstResult,
          plan:
            truthAwarePlan,
        }),

      attempts:
        1,
    })
  } catch (error) {
    if (
      !shouldRetryModelOutput(
        error,
      )
    ) {
      throw error
    }

    firstError = error
  }

  const repairPlan =
    buildRepairPlan({
      plan:
        truthAwarePlan,
      error:
        firstError,
    })

  const secondResult =
    await executeAttempt({
      plan:
        repairPlan,
      provider,
    })

  return buildModelResult({
    result:
      reconcileAttemptResult({
        result:
          secondResult,
        plan:
          repairPlan,
      }),

    attempts:
      2,
  })
}
