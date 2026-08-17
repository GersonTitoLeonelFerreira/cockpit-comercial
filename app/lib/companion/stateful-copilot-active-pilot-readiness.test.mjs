import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assessStatefulCopilotActivePilotReadiness,
} from './stateful-copilot-active-pilot-readiness.ts'

const pilotCompanyId =
  '10000000-0000-4000-8000-000000000001'

const secondCompanyId =
  '10000000-0000-4000-8000-000000000002'

function getCheck(
  report,
  key,
) {
  return report
    .checks
    .find(
      check =>
        check.key ===
        key,
    )
}

test(
  'piloto único active com engine v2 fica pronto para ativação controlada',
  () => {
    const report =
      assessStatefulCopilotActivePilotReadiness({
        company_id:
          pilotCompanyId,

        configured_mode:
          'active',

        configured_company_ids:
          pilotCompanyId,

        configured_engine_version:
          'v2',
      })

    assert.equal(
      report.phase,
      'phase-5.4',
    )

    assert.equal(
      report.ready,
      true,
    )

    assert.equal(
      report.configuration_error,
      null,
    )

    assert.equal(
      report.rollback.safe,
      true,
    )

    assert.ok(
      report.checks.every(
        check =>
          check.passed,
      ),
    )
  },
)

test(
  'shadow nunca é confundido com piloto active pronto',
  () => {
    const report =
      assessStatefulCopilotActivePilotReadiness({
        company_id:
          pilotCompanyId,

        configured_mode:
          'shadow',

        configured_company_ids:
          pilotCompanyId,

        configured_engine_version:
          'v1',
      })

    assert.equal(
      report.ready,
      false,
    )

    assert.equal(
      getCheck(
        report,
        'active_mode',
      )?.passed,
      false,
    )

    assert.equal(
      report.rollback.safe,
      true,
    )
  },
)

test(
  'active com engine v1 é bloqueado',
  () => {
    const report =
      assessStatefulCopilotActivePilotReadiness({
        company_id:
          pilotCompanyId,

        configured_mode:
          'active',

        configured_company_ids:
          pilotCompanyId,

        configured_engine_version:
          'v1',
      })

    assert.equal(
      report.ready,
      false,
    )

    assert.equal(
      getCheck(
        report,
        'engine_v2',
      )?.passed,
      false,
    )

    assert.equal(
      report.activation
        ?.reason,
      'active_engine_version_required',
    )
  },
)

test(
  'primeiro piloto rejeita allowlist com mais de uma empresa',
  () => {
    const report =
      assessStatefulCopilotActivePilotReadiness({
        company_id:
          pilotCompanyId,

        configured_mode:
          'active',

        configured_company_ids:
          `${pilotCompanyId},${secondCompanyId}`,

        configured_engine_version:
          'v2',
      })

    assert.equal(
      report.ready,
      false,
    )

    assert.equal(
      getCheck(
        report,
        'single_company_allowlist',
      )?.passed,
      false,
    )
  },
)

test(
  'empresa fora da allowlist nunca fica pronta',
  () => {
    const report =
      assessStatefulCopilotActivePilotReadiness({
        company_id:
          pilotCompanyId,

        configured_mode:
          'active',

        configured_company_ids:
          secondCompanyId,

        configured_engine_version:
          'v2',
      })

    assert.equal(
      report.ready,
      false,
    )

    assert.equal(
      getCheck(
        report,
        'pilot_company_allowed',
      )?.passed,
      false,
    )
  },
)

test(
  'curinga global continua proibido no active',
  () => {
    const report =
      assessStatefulCopilotActivePilotReadiness({
        company_id:
          pilotCompanyId,

        configured_mode:
          'active',

        configured_company_ids:
          '*',

        configured_engine_version:
          'v2',
      })

    assert.equal(
      report.ready,
      false,
    )

    assert.equal(
      report.configuration_error
        ?.code,
      'STATEFUL_GLOBAL_WILDCARD_FORBIDDEN',
    )

    assert.equal(
      report.rollback.safe,
      true,
    )
  },
)

test(
  'disabled funciona como kill switch mesmo com allowlist e engine inválidas',
  () => {
    const report =
      assessStatefulCopilotActivePilotReadiness({
        company_id:
          pilotCompanyId,

        configured_mode:
          'disabled',

        configured_company_ids:
          '*',

        configured_engine_version:
          'engine-invalido',
      })

    assert.equal(
      report.ready,
      false,
    )

    assert.equal(
      report.configuration_error,
      null,
    )

    assert.equal(
      report.activation
        ?.reason,
      'globally_disabled',
    )

    assert.equal(
      report.rollback.safe,
      true,
    )

    assert.equal(
      report.rollback
        .should_execute_stateful,
      false,
    )

    assert.equal(
      report.rollback
        .should_expose_stateful_result,
      false,
    )

    assert.equal(
      report.rollback
        .preserve_v1_response,
      true,
    )
  },
)
