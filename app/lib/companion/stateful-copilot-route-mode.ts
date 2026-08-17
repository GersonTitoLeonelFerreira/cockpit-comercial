import type {
  StatefulCopilotActivationDecision,
} from './stateful-copilot-activation-gate'

export const STATEFUL_COPILOT_ROUTE_MODES = [
  'v1',
  'shadow',
  'active',
] as const

export type StatefulCopilotRouteMode =
  (typeof STATEFUL_COPILOT_ROUTE_MODES)[number]

export function resolveStatefulCopilotRouteMode(
  activation:
    Pick<
      StatefulCopilotActivationDecision,
      'mode' |
      'should_execute_stateful'
    >,
): StatefulCopilotRouteMode {
  if (
    activation
      .should_execute_stateful !==
    true
  ) {
    return 'v1'
  }

  if (
    activation.mode ===
    'shadow'
  ) {
    return 'shadow'
  }

  if (
    activation.mode ===
    'active'
  ) {
    return 'active'
  }

  return 'v1'
}
