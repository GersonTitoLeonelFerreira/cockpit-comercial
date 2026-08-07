import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_STATEFUL_COPILOT_ACTIVATION_MODE,
  STATEFUL_COPILOT_ACTIVATION_MODES,
  StatefulCopilotActivationGateError,
  resolveStatefulCopilotActivationGate,
} from './stateful-copilot-activation-gate.ts'

const companyId =
  '10000000-0000-4000-8000-000000000001'

const anotherCompanyId =
  '10000000-0000-4000-8000-000000000002'

test(
  'mantém o stateful desativado por padrão',
  () => {
    const decision =
      resolveStatefulCopilotActivationGate({
        company_id:
          companyId,

        configured_mode:
          undefined,

        configured_company_ids:
          undefined,

        configured_engine_version:
          'v1',
      })

    assert.equal(
      DEFAULT_STATEFUL_COPILOT_ACTIVATION_MODE,
      'disabled',
    )

    assert.deepEqual(
      STATEFUL_COPILOT_ACTIVATION_MODES,
      [
        'disabled',
        'shadow',
        'active',
      ],
    )

    assert.deepEqual(
      decision,
      {
        mode:
          'disabled',

        company_id:
          companyId,

        allowed_company_ids:
          [],

        engine_version:
          null,

        enabled:
          false,

        should_execute_stateful:
          false,

        should_persist_stateful_state:
          false,

        should_expose_stateful_result:
          false,

        preserve_v1_response:
          true,

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,

        reason:
          'globally_disabled',
      },
    )
  },
)

test(
  'modo shadow executa e persiste sem substituir a resposta V1',
  () => {
    const decision =
      resolveStatefulCopilotActivationGate({
        company_id:
          companyId,

        configured_mode:
          'shadow',

        configured_company_ids:
          companyId,

        configured_engine_version:
          'v1',
      })

    assert.equal(
      decision.enabled,
      true,
    )

    assert.equal(
      decision.should_execute_stateful,
      true,
    )

    assert.equal(
      decision.should_persist_stateful_state,
      true,
    )

    assert.equal(
      decision.should_expose_stateful_result,
      false,
    )

    assert.equal(
      decision.preserve_v1_response,
      true,
    )

    assert.equal(
      decision.reason,
      'shadow_enabled',
    )
  },
)

test(
  'modo active expõe o V2 somente com motor v2',
  () => {
    const decision =
      resolveStatefulCopilotActivationGate({
        company_id:
          companyId,

        configured_mode:
          'active',

        configured_company_ids:
          companyId,

        configured_engine_version:
          'v2',
      })

    assert.equal(
      decision.enabled,
      true,
    )

    assert.equal(
      decision.should_execute_stateful,
      true,
    )

    assert.equal(
      decision.should_persist_stateful_state,
      true,
    )

    assert.equal(
      decision.should_expose_stateful_result,
      true,
    )

    assert.equal(
      decision.preserve_v1_response,
      false,
    )

    assert.equal(
      decision.reason,
      'active_enabled',
    )
  },
)

test(
  'modo active falha fechado quando o motor continua em v1',
  () => {
    const decision =
      resolveStatefulCopilotActivationGate({
        company_id:
          companyId,

        configured_mode:
          'active',

        configured_company_ids:
          companyId,

        configured_engine_version:
          'v1',
      })

    assert.equal(
      decision.enabled,
      false,
    )

    assert.equal(
      decision.should_execute_stateful,
      false,
    )

    assert.equal(
      decision.should_expose_stateful_result,
      false,
    )

    assert.equal(
      decision.preserve_v1_response,
      true,
    )

    assert.equal(
      decision.reason,
      'active_engine_version_required',
    )
  },
)

test(
  'empresa fora da lista nunca executa o stateful',
  () => {
    const decision =
      resolveStatefulCopilotActivationGate({
        company_id:
          anotherCompanyId,

        configured_mode:
          'shadow',

        configured_company_ids:
          companyId,

        configured_engine_version:
          'v1',
      })

    assert.equal(
      decision.enabled,
      false,
    )

    assert.equal(
      decision.should_execute_stateful,
      false,
    )

    assert.equal(
      decision.reason,
      'company_not_allowed',
    )

    assert.deepEqual(
      decision.allowed_company_ids,
      [
        companyId,
      ],
    )
  },
)

test(
  'normaliza lista e remove empresas duplicadas',
  () => {
    const decision =
      resolveStatefulCopilotActivationGate({
        company_id:
          companyId,

        configured_mode:
          ' SHADOW ',

        configured_company_ids:
          `${companyId}, ${anotherCompanyId}, ${companyId}`,

        configured_engine_version:
          ' V1 ',
      })

    assert.deepEqual(
      decision.allowed_company_ids,
      [
        companyId,
        anotherCompanyId,
      ],
    )

    assert.equal(
      decision.mode,
      'shadow',
    )

    assert.equal(
      decision.engine_version,
      'v1',
    )
  },
)

test(
  'rejeita modo de ativação desconhecido',
  () => {
    assert.throws(
      () =>
        resolveStatefulCopilotActivationGate({
          company_id:
            companyId,

          configured_mode:
            'production',

          configured_company_ids:
            companyId,

          configured_engine_version:
            'v2',
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotActivationGateError,
        )

        assert.equal(
          error.code,
          'INVALID_STATEFUL_ACTIVATION_MODE',
        )

        assert.equal(
          error.path,
          'configured_mode',
        )

        return true
      },
    )
  },
)

test(
  'proíbe ativação global por curinga',
  () => {
    assert.throws(
      () =>
        resolveStatefulCopilotActivationGate({
          company_id:
            companyId,

          configured_mode:
            'shadow',

          configured_company_ids:
            '*',

          configured_engine_version:
            'v1',
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotActivationGateError,
        )

        assert.equal(
          error.code,
          'STATEFUL_GLOBAL_WILDCARD_FORBIDDEN',
        )

        return true
      },
    )
  },
)

test(
  'rejeita identificador de empresa inválido',
  () => {
    assert.throws(
      () =>
        resolveStatefulCopilotActivationGate({
          company_id:
            'empresa-invalida',

          configured_mode:
            'disabled',
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotActivationGateError,
        )

        assert.equal(
          error.code,
          'INVALID_STATEFUL_COMPANY_ID',
        )

        assert.equal(
          error.path,
          'company_id',
        )

        return true
      },
    )
  },
)

test(
  'nunca autoriza escrita automática no CRM ou Agenda',
  () => {
    for (
      const mode of
      STATEFUL_COPILOT_ACTIVATION_MODES
    ) {
      const decision =
        resolveStatefulCopilotActivationGate({
          company_id:
            companyId,

          configured_mode:
            mode,

          configured_company_ids:
            companyId,

          configured_engine_version:
            'v2',
        })

      assert.equal(
        decision.automatic_crm_write,
        false,
      )

      assert.equal(
        decision.automatic_agenda_write,
        false,
      )
    }
  },
)
