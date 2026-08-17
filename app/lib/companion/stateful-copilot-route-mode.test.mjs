import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveStatefulCopilotRouteMode,
} from './stateful-copilot-route-mode.ts'

test(
  'disabled permanece no fluxo V1',
  () => {
    assert.equal(
      resolveStatefulCopilotRouteMode({
        mode:
          'disabled',
        should_execute_stateful:
          false,
      }),
      'v1',
    )
  },
)

test(
  'empresa fora da allowlist permanece no V1',
  () => {
    assert.equal(
      resolveStatefulCopilotRouteMode({
        mode:
          'shadow',
        should_execute_stateful:
          false,
      }),
      'v1',
    )
  },
)

test(
  'shadow autorizado permanece assíncrono',
  () => {
    assert.equal(
      resolveStatefulCopilotRouteMode({
        mode:
          'shadow',
        should_execute_stateful:
          true,
      }),
      'shadow',
    )
  },
)

test(
  'active sem autorização executável permanece no V1',
  () => {
    assert.equal(
      resolveStatefulCopilotRouteMode({
        mode:
          'active',
        should_execute_stateful:
          false,
      }),
      'v1',
    )
  },
)

test(
  'active autorizado seleciona execução síncrona',
  () => {
    assert.equal(
      resolveStatefulCopilotRouteMode({
        mode:
          'active',
        should_execute_stateful:
          true,
      }),
      'active',
    )
  },
)
