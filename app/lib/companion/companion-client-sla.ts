import {
  TERMINAL_SALES_CYCLE_STATUSES,
  getSalesCycleLabel,
} from '../sales-cycle-status'

import type {
  LeadStatus,
} from '@/app/types/sales_cycles'

import type {
  CompanionClientSlaAssessment,
} from './companion-client-context-contract'

// Risco operacional por demora, baseado no tempo na etapa comercial atual
// (`stage_entered_at`) comparado à regra de SLA já configurada pela empresa
// em `company_sla_rules` (reaproveitada do Cockpit — não é uma
// infraestrutura nova). Isto é DIFERENTE do "tempo aguardando resposta"
// (companion-client-relationship.ts), que é sobre a última mensagem da
// conversa: aqui é sobre quanto tempo a oportunidade está nesta etapa do
// funil. Se a empresa não tiver uma regra configurada para a etapa, o
// resultado vem com `configured: false` e `risk: null` — nunca inventamos
// um limite (ex.: "1h") que não foi definido pela operação.

export type CompanionClientSlaRule = {
  status:
    LeadStatus

  target_minutes:
    number

  warning_minutes:
    number

  danger_minutes:
    number
}

function isPositiveFiniteNumber(
  value: unknown,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0
  )
}

export function assessCompanionClientSla({
  cycle_status,
  stage_entered_at,
  reference_time,
  rule,
}: {
  cycle_status:
    LeadStatus

  stage_entered_at:
    string

  reference_time:
    string

  rule:
    CompanionClientSlaRule | null
}): CompanionClientSlaAssessment {
  const stageLabel =
    getSalesCycleLabel(
      cycle_status,
    )

  if (
    TERMINAL_SALES_CYCLE_STATUSES.includes(
      cycle_status,
    )
  ) {
    return {
      configured:
        rule !== null,

      applicable:
        false,

      stage:
        cycle_status,

      stage_label:
        stageLabel,

      target_minutes:
        rule?.target_minutes ??
        null,

      warning_minutes:
        rule?.warning_minutes ??
        null,

      danger_minutes:
        rule?.danger_minutes ??
        null,

      elapsed_minutes:
        null,

      risk:
        null,
    }
  }

  const enteredTimestamp =
    Date.parse(
      stage_entered_at,
    )

  const referenceTimestamp =
    Date.parse(
      reference_time,
    )

  if (
    !Number.isFinite(
      enteredTimestamp,
    ) ||
    !Number.isFinite(
      referenceTimestamp,
    )
  ) {
    return {
      configured:
        rule !== null,

      applicable:
        false,

      stage:
        cycle_status,

      stage_label:
        stageLabel,

      target_minutes:
        rule?.target_minutes ??
        null,

      warning_minutes:
        rule?.warning_minutes ??
        null,

      danger_minutes:
        rule?.danger_minutes ??
        null,

      elapsed_minutes:
        null,

      risk:
        null,
    }
  }

  const elapsedMinutes =
    Math.max(
      0,
      Math.floor(
        (
          referenceTimestamp -
          enteredTimestamp
        ) /
          60_000,
      ),
    )

  if (
    !rule ||
    !isPositiveFiniteNumber(
      rule.warning_minutes,
    ) ||
    !isPositiveFiniteNumber(
      rule.danger_minutes,
    )
  ) {
    return {
      configured:
        false,

      applicable:
        true,

      stage:
        cycle_status,

      stage_label:
        stageLabel,

      target_minutes:
        null,

      warning_minutes:
        null,

      danger_minutes:
        null,

      elapsed_minutes:
        elapsedMinutes,

      risk:
        null,
    }
  }

  const risk =
    elapsedMinutes >=
    rule.danger_minutes
      ? 'high'
      : elapsedMinutes >=
        rule.warning_minutes
        ? 'medium'
        : 'low'

  return {
    configured:
      true,

    applicable:
      true,

    stage:
      cycle_status,

    stage_label:
      stageLabel,

    target_minutes:
      rule.target_minutes,

    warning_minutes:
      rule.warning_minutes,

    danger_minutes:
      rule.danger_minutes,

    elapsed_minutes:
      elapsedMinutes,

    risk,
  }
}
