import {
  resolveStatefulCopilotActivationGate,
  type StatefulCopilotActivationDecision,
} from './stateful-copilot-activation-gate'

export const STATEFUL_COPILOT_ACTIVE_PILOT_PHASE =
  'phase-5.4' as const

export type StatefulCopilotActivePilotReadinessCheck = {
  key:
    | 'configuration_valid'
    | 'active_mode'
    | 'single_company_allowlist'
    | 'pilot_company_allowed'
    | 'engine_v2'
    | 'stateful_execution_enabled'
    | 'stateful_persistence_enabled'
    | 'stateful_exposure_enabled'
    | 'v1_response_not_preserved'
    | 'crm_automatic_write_blocked'
    | 'agenda_automatic_write_blocked'
    | 'kill_switch_safe'

  passed:
    boolean

  detail:
    string
}

export type StatefulCopilotActivePilotReadinessArgs = {
  company_id:
    unknown

  configured_mode?:
    unknown

  configured_company_ids?:
    unknown

  configured_engine_version?:
    string | null
}

export type StatefulCopilotActivePilotRollback = {
  mode:
    'disabled'

  safe:
    boolean

  reason:
    string | null

  preserve_v1_response:
    boolean

  should_execute_stateful:
    boolean

  should_expose_stateful_result:
    boolean

  automatic_crm_write:
    boolean

  automatic_agenda_write:
    boolean
}

export type StatefulCopilotActivePilotReadinessReport = {
  phase:
    typeof STATEFUL_COPILOT_ACTIVE_PILOT_PHASE

  ready:
    boolean

  company_id:
    string | null

  activation:
    StatefulCopilotActivationDecision | null

  configuration_error: {
    code:
      string

    path:
      string
  } | null

  rollback:
    StatefulCopilotActivePilotRollback

  checks:
    StatefulCopilotActivePilotReadinessCheck[]
}

function getSafeConfigurationError(
  error: unknown,
) {
  if (
    error &&
    typeof error ===
      'object'
  ) {
    const candidate =
      error as {
        code?: unknown
        path?: unknown
      }

    return {
      code:
        typeof candidate.code ===
        'string'
          ? candidate.code
          : 'STATEFUL_CONFIGURATION_ERROR',

      path:
        typeof candidate.path ===
        'string'
          ? candidate.path
          : 'configuration',
    }
  }

  return {
    code:
      'STATEFUL_CONFIGURATION_ERROR',

    path:
      'configuration',
  }
}

function buildRollback({
  company_id,
  configured_company_ids,
  configured_engine_version,
}: StatefulCopilotActivePilotReadinessArgs):
  StatefulCopilotActivePilotRollback {
  try {
    const decision =
      resolveStatefulCopilotActivationGate({
        company_id,

        configured_mode:
          'disabled',

        configured_company_ids,

        configured_engine_version,
      })

    const safe =
      decision.mode ===
        'disabled' &&
      decision.reason ===
        'globally_disabled' &&
      decision.enabled ===
        false &&
      decision.should_execute_stateful ===
        false &&
      decision.should_persist_stateful_state ===
        false &&
      decision.should_expose_stateful_result ===
        false &&
      decision.preserve_v1_response ===
        true &&
      decision.automatic_crm_write ===
        false &&
      decision.automatic_agenda_write ===
        false

    return {
      mode:
        'disabled',

      safe,

      reason:
        decision.reason,

      preserve_v1_response:
        decision.preserve_v1_response,

      should_execute_stateful:
        decision.should_execute_stateful,

      should_expose_stateful_result:
        decision.should_expose_stateful_result,

      automatic_crm_write:
        decision.automatic_crm_write,

      automatic_agenda_write:
        decision.automatic_agenda_write,
    }
  } catch {
    return {
      mode:
        'disabled',

      safe:
        false,

      reason:
        null,

      preserve_v1_response:
        false,

      should_execute_stateful:
        false,

      should_expose_stateful_result:
        false,

      automatic_crm_write:
        false,

      automatic_agenda_write:
        false,
    }
  }
}

function buildChecks({
  activation,
  configurationError,
  rollback,
}: {
  activation:
    StatefulCopilotActivationDecision | null

  configurationError:
    StatefulCopilotActivePilotReadinessReport[
      'configuration_error'
    ]

  rollback:
    StatefulCopilotActivePilotRollback
}): StatefulCopilotActivePilotReadinessCheck[] {
  return [
    {
      key:
        'configuration_valid',

      passed:
        configurationError ===
        null,

      detail:
        'A configuração precisa ser aceita pelo activation gate.',
    },
    {
      key:
        'active_mode',

      passed:
        activation?.mode ===
        'active',

      detail:
        'O piloto ativo exige COMPANION_STATEFUL_MODE=active.',
    },
    {
      key:
        'single_company_allowlist',

      passed:
        activation
          ?.allowed_company_ids
          .length ===
        1,

      detail:
        'O primeiro piloto ativo deve possuir exatamente uma empresa na allowlist.',
    },
    {
      key:
        'pilot_company_allowed',

      passed:
        Boolean(
          activation &&
          activation
            .allowed_company_ids
            .includes(
              activation.company_id,
            ),
        ),

      detail:
        'A empresa avaliada precisa ser a empresa explicitamente autorizada.',
    },
    {
      key:
        'engine_v2',

      passed:
        activation
          ?.engine_version ===
        'v2',

      detail:
        'O modo active somente pode expor o motor V2.',
    },
    {
      key:
        'stateful_execution_enabled',

      passed:
        activation
          ?.should_execute_stateful ===
        true,

      detail:
        'O runtime stateful precisa estar autorizado a executar.',
    },
    {
      key:
        'stateful_persistence_enabled',

      passed:
        activation
          ?.should_persist_stateful_state ===
        true,

      detail:
        'O estado V2 precisa ser persistido antes de poder ser exposto.',
    },
    {
      key:
        'stateful_exposure_enabled',

      passed:
        activation
          ?.should_expose_stateful_result ===
        true,

      detail:
        'O gate precisa autorizar explicitamente a exposição da resposta V2.',
    },
    {
      key:
        'v1_response_not_preserved',

      passed:
        activation
          ?.preserve_v1_response ===
        false,

      detail:
        'No active bem-sucedido, V1 não deve executar desnecessariamente.',
    },
    {
      key:
        'crm_automatic_write_blocked',

      passed:
        activation
          ?.automatic_crm_write ===
        false,

      detail:
        'O piloto não pode escrever automaticamente no CRM.',
    },
    {
      key:
        'agenda_automatic_write_blocked',

      passed:
        activation
          ?.automatic_agenda_write ===
        false,

      detail:
        'O piloto não pode escrever automaticamente na Agenda.',
    },
    {
      key:
        'kill_switch_safe',

      passed:
        rollback.safe,

      detail:
        'COMPANION_STATEFUL_MODE=disabled precisa interromper o V2 e preservar o V1.',
    },
  ]
}

export function assessStatefulCopilotActivePilotReadiness(
  args:
    StatefulCopilotActivePilotReadinessArgs,
): StatefulCopilotActivePilotReadinessReport {
  let activation:
    StatefulCopilotActivationDecision | null =
      null

  let configurationError:
    StatefulCopilotActivePilotReadinessReport[
      'configuration_error'
    ] =
      null

  try {
    activation =
      resolveStatefulCopilotActivationGate({
        company_id:
          args.company_id,

        configured_mode:
          args.configured_mode,

        configured_company_ids:
          args.configured_company_ids,

        configured_engine_version:
          args.configured_engine_version,
      })
  } catch (error) {
    configurationError =
      getSafeConfigurationError(
        error,
      )
  }

  const rollback =
    buildRollback(
      args,
    )

  const checks =
    buildChecks({
      activation,
      configurationError,
      rollback,
    })

  return {
    phase:
      STATEFUL_COPILOT_ACTIVE_PILOT_PHASE,

    ready:
      checks.every(
        check =>
          check.passed,
      ),

    company_id:
      activation
        ?.company_id ??
      null,

    activation,

    configuration_error:
      configurationError,

    rollback,

    checks,
  }
}
