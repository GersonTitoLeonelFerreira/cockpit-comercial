import type {
  CommercialMoveV1,
  CommercialObjectiveV1,
  FrameworkReferenceV1,
  GovernanceStatusV1,
  SituationKeyV1,
} from './strategy-contracts'

export const COMMERCIAL_SITUATION_PLAYBOOK_CONTRACT_VERSION =
  'commercial-situation-playbook-v1' as const

export type CommercialSituationPlaybookTechniqueV1 = {
  technique_key: string
  framework_reference: FrameworkReferenceV1
}

export type CommercialSituationPlaybookRuleV1 = {
  rule_key: string
  priority: number
  situation: SituationKeyV1
  objective: CommercialObjectiveV1 | null
  allowed_moves: CommercialMoveV1[]
  avoided_moves: CommercialMoveV1[]
  method_constraints: string[]
  governance_constraints: Array<{
    status: GovernanceStatusV1
    rule: string
  }>
  techniques: CommercialSituationPlaybookTechniqueV1[]
}

export type CommercialSituationPlaybookV1 = {
  contract_version:
    typeof COMMERCIAL_SITUATION_PLAYBOOK_CONTRACT_VERSION
  company_id: string
  version: number
  rules: CommercialSituationPlaybookRuleV1[]
}

export function resolveCommercialSituationPlaybookRuleV1({
  playbook,
  situation,
  objective,
}: {
  playbook: CommercialSituationPlaybookV1 | null
  situation: SituationKeyV1
  objective: CommercialObjectiveV1
}): CommercialSituationPlaybookRuleV1 | null {
  if (!playbook) {
    return null
  }

  return [...playbook.rules]
    .filter(
      rule =>
        rule.situation === situation &&
        (
          rule.objective === null ||
          rule.objective === objective
        ),
    )
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        left.rule_key.localeCompare(
          right.rule_key,
          'en',
        ),
    )[0] ?? null
}
