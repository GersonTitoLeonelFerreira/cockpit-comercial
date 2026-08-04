export const COMPANION_DIAGNOSTIC_CONTRACT_VERSION =
  'phase-1-v1' as const

const ANALYSIS_STATUSES = [
  'complete',
  'limited',
  'blocked',
] as const

const COMMERCIAL_RELEVANCES = [
  'commercial',
  'non_commercial',
  'uncertain',
] as const

const CONFIDENCE_LEVELS = [
  'high',
  'medium',
  'low',
] as const

const SOLUTION_FIT_STATUSES = [
  'fit',
  'partial_fit',
  'misfit',
  'unknown',
] as const

const SELLER_RISK_TYPES = [
  'ignored_question',
  'partial_answer',
  'repeated_answered_question',
  'contradiction',
  'excessive_pressure',
  'premature_presentation',
] as const

const LEAD_STATUSES = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'pausado',
  'cancelado',
  'ganho',
  'perdido',
] as const

export type AnalysisStatus =
  (typeof ANALYSIS_STATUSES)[number]

export type CommercialRelevance =
  (typeof COMMERCIAL_RELEVANCES)[number]

export type DiagnosticConfidence =
  (typeof CONFIDENCE_LEVELS)[number]

export type SolutionFitStatus =
  (typeof SOLUTION_FIT_STATUSES)[number]

export type SellerRiskType =
  (typeof SELLER_RISK_TYPES)[number]

export type DiagnosticLeadStatus =
  (typeof LEAD_STATUSES)[number]

type JsonRecord = Record<string, unknown>

export type DiagnosticEvidenceItem = {
  summary: string
  evidence_message_ids: string[]
}

export type DiagnosticMissingInformationItem = {
  summary: string
  reason: string
}

export type DiagnosticSellerRisk =
  DiagnosticEvidenceItem & {
    type: SellerRiskType
  }

export type CompanionDiagnostic = {
  contract_version:
    typeof COMPANION_DIAGNOSTIC_CONTRACT_VERSION

  analysis_status: AnalysisStatus
  analysis_limitations: string[]

  commercial_relevance: CommercialRelevance
  confidence: DiagnosticConfidence

  customer_intent:
    | DiagnosticEvidenceItem
    | null

  needs: DiagnosticEvidenceItem[]

  missing_information:
    DiagnosticMissingInformationItem[]

  unanswered_questions:
    DiagnosticEvidenceItem[]

  active_objections:
    DiagnosticEvidenceItem[]

  seller_assessment: {
    strengths: DiagnosticEvidenceItem[]
    risks: DiagnosticSellerRisk[]
  }

  sales_method: {
    configured: boolean
    current_step: string | null
    completed_steps: string[]
    skipped_steps: string[]
    evidence_message_ids: string[]
  }

  solution_fit: {
    status: SolutionFitStatus
    rationale: string | null
    evidence_message_ids: string[]
  }

  guidance: {
    intervention_required: boolean
    next_move: string | null
    recommended_question: string | null
    suggested_message: string | null
  }

  crm_suggestion: {
    should_change_crm_stage: boolean
    recommended_status:
      | DiagnosticLeadStatus
      | null
    next_action_required: boolean
    expected_next_action_at: string | null
    prohibited_statuses:
      DiagnosticLeadStatus[]
    requires_human_confirmation: true
  }

  evidence_message_ids: string[]
}

export type CompanionDiagnosticContext = {
  available_message_ids: string[]
  current_crm_status:
    | DiagnosticLeadStatus
    | null
  reference_time: string
}

export class CompanionDiagnosticContractError
  extends Error {
  readonly code: string
  readonly path: string

  constructor(
    code: string,
    path: string,
    message: string,
  ) {
    super(message)

    this.name =
      'CompanionDiagnosticContractError'

    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new CompanionDiagnosticContractError(
    code,
    path,
    message,
  )
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function requireRecord(
  value: unknown,
  path: string,
): JsonRecord {
  if (!isRecord(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser um objeto.`,
    )
  }

  return value
}

function requireString(
  value: unknown,
  path: string,
): string {
  if (typeof value !== 'string') {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser um texto.`,
    )
  }

  const normalized = value.trim()

  if (!normalized) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} não pode ficar vazio.`,
    )
  }

  return normalized
}

function requireNullableString(
  record: JsonRecord,
  key: string,
  path: string,
): string | null {
  if (!(key in record)) {
    fail(
      'INVALID_SHAPE',
      `${path}.${key}`,
      `${path}.${key} precisa ser informado.`,
    )
  }

  const value = record[key]

  if (value === null) {
    return null
  }

  return requireString(
    value,
    `${path}.${key}`,
  )
}

function requireBoolean(
  value: unknown,
  path: string,
): boolean {
  if (typeof value !== 'boolean') {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser booleano.`,
    )
  }

  return value
}

function requireEnum<
  const TValues extends readonly string[],
>(
  value: unknown,
  allowedValues: TValues,
  path: string,
): TValues[number] {
  if (
    typeof value !== 'string' ||
    !allowedValues.includes(value)
  ) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} possui um valor inválido.`,
    )
  }

  return value as TValues[number]
}

function normalizeStringArray(
  value: unknown,
  path: string,
): string[] {
  if (!Array.isArray(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser uma lista.`,
    )
  }

  const result: string[] = []

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const normalized = requireString(
      value[index],
      `${path}[${index}]`,
    )

    if (!result.includes(normalized)) {
      result.push(normalized)
    }
  }

  return result
}

function normalizeEvidenceIds(
  value: unknown,
  path: string,
  availableMessageIds: Set<string>,
  requireEvidence: boolean,
): string[] {
  const ids = normalizeStringArray(
    value,
    path,
  )

  if (
    requireEvidence &&
    ids.length === 0
  ) {
    fail(
      'INVALID_EVIDENCE',
      path,
      `${path} precisa possuir evidência.`,
    )
  }

  for (const id of ids) {
    if (!availableMessageIds.has(id)) {
      fail(
        'INVALID_EVIDENCE',
        path,
        `A mensagem ${id} não está disponível na fotografia atual.`,
      )
    }
  }

  return ids
}

function normalizeEvidenceItem(
  value: unknown,
  path: string,
  availableMessageIds: Set<string>,
): DiagnosticEvidenceItem {
  const record = requireRecord(
    value,
    path,
  )

  return {
    summary: requireString(
      record.summary,
      `${path}.summary`,
    ),

    evidence_message_ids:
      normalizeEvidenceIds(
        record.evidence_message_ids,
        `${path}.evidence_message_ids`,
        availableMessageIds,
        true,
      ),
  }
}

function normalizeEvidenceItemArray(
  value: unknown,
  path: string,
  availableMessageIds: Set<string>,
): DiagnosticEvidenceItem[] {
  if (!Array.isArray(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser uma lista.`,
    )
  }

  return value.map(
    (item, index) =>
      normalizeEvidenceItem(
        item,
        `${path}[${index}]`,
        availableMessageIds,
      ),
  )
}

function normalizeMissingInformation(
  value: unknown,
  path: string,
): DiagnosticMissingInformationItem[] {
  if (!Array.isArray(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser uma lista.`,
    )
  }

  return value.map((item, index) => {
    const itemPath =
      `${path}[${index}]`

    const record = requireRecord(
      item,
      itemPath,
    )

    return {
      summary: requireString(
        record.summary,
        `${itemPath}.summary`,
      ),

      reason: requireString(
        record.reason,
        `${itemPath}.reason`,
      ),
    }
  })
}

function normalizeSellerRisks(
  value: unknown,
  path: string,
  availableMessageIds: Set<string>,
): DiagnosticSellerRisk[] {
  if (!Array.isArray(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser uma lista.`,
    )
  }

  return value.map((item, index) => {
    const itemPath =
      `${path}[${index}]`

    const record = requireRecord(
      item,
      itemPath,
    )

    const evidence =
      normalizeEvidenceItem(
        record,
        itemPath,
        availableMessageIds,
      )

    return {
      type: requireEnum(
        record.type,
        SELLER_RISK_TYPES,
        `${itemPath}.type`,
      ),

      ...evidence,
    }
  })
}

function normalizeLeadStatusArray(
  value: unknown,
  path: string,
): DiagnosticLeadStatus[] {
  if (!Array.isArray(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser uma lista.`,
    )
  }

  const result:
    DiagnosticLeadStatus[] = []

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const status = requireEnum(
      value[index],
      LEAD_STATUSES,
      `${path}[${index}]`,
    )

    if (!result.includes(status)) {
      result.push(status)
    }
  }

  return result
}

function normalizeNullableLeadStatus(
  record: JsonRecord,
  key: string,
  path: string,
): DiagnosticLeadStatus | null {
  if (!(key in record)) {
    fail(
      'INVALID_SHAPE',
      `${path}.${key}`,
      `${path}.${key} precisa ser informado.`,
    )
  }

  const value = record[key]

  if (value === null) {
    return null
  }

  return requireEnum(
    value,
    LEAD_STATUSES,
    `${path}.${key}`,
  )
}

function validateContext(
  context: CompanionDiagnosticContext,
) {
  const availableMessageIds =
    new Set<string>()

  for (
    let index = 0;
    index <
      context.available_message_ids.length;
    index += 1
  ) {
    const id = requireString(
      context.available_message_ids[index],
      `context.available_message_ids[${index}]`,
    )

    availableMessageIds.add(id)
  }

  if (
    context.current_crm_status !== null &&
    !LEAD_STATUSES.includes(
      context.current_crm_status,
    )
  ) {
    fail(
      'INVALID_CONTEXT',
      'context.current_crm_status',
      'A etapa atual do CRM é inválida.',
    )
  }

  const referenceTimestamp =
    Date.parse(context.reference_time)

  if (!Number.isFinite(referenceTimestamp)) {
    fail(
      'INVALID_REFERENCE_TIME',
      'context.reference_time',
      'O horário de referência é inválido.',
    )
  }

  return {
    availableMessageIds,
    referenceTimestamp,
  }
}

function validateAnalysisState(
  diagnostic: CompanionDiagnostic,
) {
  const hasLimitations =
    diagnostic.analysis_limitations.length >
    0

  if (
    diagnostic.analysis_status ===
      'complete' &&
    hasLimitations
  ) {
    fail(
      'INVARIANT_VIOLATION',
      'analysis_limitations',
      'Uma análise completa não pode possuir limitações.',
    )
  }

  if (
    diagnostic.analysis_status !==
      'complete' &&
    !hasLimitations
  ) {
    fail(
      'INVARIANT_VIOLATION',
      'analysis_limitations',
      'Análises limitadas ou bloqueadas precisam declarar limitações.',
    )
  }

  if (
    diagnostic.confidence === 'high' &&
    hasLimitations
  ) {
    fail(
      'INVARIANT_VIOLATION',
      'confidence',
      'Uma análise com limitações não pode possuir confiança alta.',
    )
  }
}

function validateMethod(
  diagnostic: CompanionDiagnostic,
) {
  const method =
    diagnostic.sales_method

  const hasMethodLimitation =
    diagnostic.analysis_limitations.includes(
      'method_not_configured',
    )

  if (!method.configured) {
    if (
      method.current_step !== null ||
      method.completed_steps.length > 0 ||
      method.skipped_steps.length > 0 ||
      method.evidence_message_ids.length > 0
    ) {
      fail(
        'INVARIANT_VIOLATION',
        'sales_method',
        'Um método não configurado não pode possuir etapas ou evidências inventadas.',
      )
    }

    if (!hasMethodLimitation) {
      fail(
        'INVARIANT_VIOLATION',
        'analysis_limitations',
        'Método ausente precisa declarar method_not_configured.',
      )
    }

    return
  }

  if (hasMethodLimitation) {
    fail(
      'INVARIANT_VIOLATION',
      'analysis_limitations',
      'Método configurado não pode declarar method_not_configured.',
    )
  }

  const hasMethodConclusion =
    method.current_step !== null ||
    method.completed_steps.length > 0 ||
    method.skipped_steps.length > 0

  if (
    hasMethodConclusion &&
    method.evidence_message_ids.length === 0
  ) {
    fail(
      'INVALID_EVIDENCE',
      'sales_method.evidence_message_ids',
      'A avaliação do método precisa possuir evidência.',
    )
  }
}

function validateSolutionFit(
  diagnostic: CompanionDiagnostic,
) {
  const solution =
    diagnostic.solution_fit

  const productInformationMissing =
    diagnostic.analysis_limitations.includes(
      'product_information_missing',
    )

  if (
    productInformationMissing &&
    solution.status !== 'unknown'
  ) {
    fail(
      'INVARIANT_VIOLATION',
      'solution_fit.status',
      'Sem informações de produto, a adequação precisa ser unknown.',
    )
  }

  if (solution.status === 'unknown') {
    if (
      solution.evidence_message_ids.length >
      0
    ) {
      fail(
        'INVARIANT_VIOLATION',
        'solution_fit.evidence_message_ids',
        'Adequação desconhecida não pode possuir evidência conclusiva.',
      )
    }

    return
  }

  if (!solution.rationale) {
    fail(
      'INVARIANT_VIOLATION',
      'solution_fit.rationale',
      'Uma adequação conclusiva precisa de justificativa.',
    )
  }

  if (
    solution.evidence_message_ids.length ===
    0
  ) {
    fail(
      'INVALID_EVIDENCE',
      'solution_fit.evidence_message_ids',
      'Uma adequação conclusiva precisa de evidência.',
    )
  }
}

function validateGuidance(
  diagnostic: CompanionDiagnostic,
) {
  const guidance =
    diagnostic.guidance

  if (!guidance.intervention_required) {
    if (
      guidance.next_move !== null ||
      guidance.recommended_question !==
        null ||
      guidance.suggested_message !== null
    ) {
      fail(
        'INVARIANT_VIOLATION',
        'guidance',
        'Sem intervenção, movimento, pergunta e mensagem precisam ser nulos.',
      )
    }
  }

  if (
    diagnostic.analysis_status ===
      'blocked' &&
    guidance.intervention_required
  ) {
    fail(
      'INVARIANT_VIOLATION',
      'guidance.intervention_required',
      'Uma análise bloqueada não pode orientar o vendedor.',
    )
  }

  if (
    diagnostic.commercial_relevance ===
      'non_commercial' &&
    guidance.intervention_required
  ) {
    fail(
      'INVARIANT_VIOLATION',
      'guidance.intervention_required',
      'Uma conversa não comercial não pode gerar intervenção.',
    )
  }
}

function validateBlockedAnalysis(
  diagnostic: CompanionDiagnostic,
) {
  if (
    diagnostic.analysis_status !==
    'blocked'
  ) {
    return
  }

  if (
    diagnostic.customer_intent !== null ||
    diagnostic.needs.length > 0 ||
    diagnostic.seller_assessment
      .strengths.length > 0 ||
    diagnostic.seller_assessment
      .risks.length > 0 ||
    diagnostic.solution_fit.status !==
      'unknown'
  ) {
    fail(
      'INVARIANT_VIOLATION',
      'analysis_status',
      'Uma análise bloqueada não pode inventar intenção, necessidade, avaliação ou adequação.',
    )
  }
}

function validateCrmSuggestion(
  diagnostic: CompanionDiagnostic,
  context:
    CompanionDiagnosticContext,
  referenceTimestamp: number,
) {
  const suggestion =
    diagnostic.crm_suggestion

  if (
    suggestion.requires_human_confirmation !==
    true
  ) {
    fail(
      'INVARIANT_VIOLATION',
      'crm_suggestion.requires_human_confirmation',
      'Toda sugestão de CRM exige confirmação humana.',
    )
  }

  const crmMustBeDisabled =
    diagnostic.analysis_status ===
      'blocked' ||
    diagnostic.commercial_relevance ===
      'non_commercial'

  if (crmMustBeDisabled) {
    if (
      suggestion.should_change_crm_stage ||
      suggestion.recommended_status !==
        null ||
      suggestion.next_action_required ||
      suggestion.expected_next_action_at !==
        null
    ) {
      fail(
        'INVARIANT_VIOLATION',
        'crm_suggestion',
        'Análise bloqueada ou não comercial não pode sugerir CRM ou Agenda.',
      )
    }

    return
  }

  if (
    suggestion.should_change_crm_stage
  ) {
    if (
      context.current_crm_status === null
    ) {
      fail(
        'INVARIANT_VIOLATION',
        'crm_suggestion.should_change_crm_stage',
        'Sem etapa atual, não é possível sugerir mudança de CRM.',
      )
    }

    if (
      suggestion.recommended_status ===
        null
    ) {
      fail(
        'INVARIANT_VIOLATION',
        'crm_suggestion.recommended_status',
        'Uma mudança de CRM precisa informar a etapa recomendada.',
      )
    }

    if (
      suggestion.recommended_status ===
      context.current_crm_status
    ) {
      fail(
        'INVARIANT_VIOLATION',
        'crm_suggestion.recommended_status',
        'A etapa recomendada precisa ser diferente da etapa atual.',
      )
    }
  } else if (
    suggestion.recommended_status !== null
  ) {
    if (
      context.current_crm_status === null ||
      suggestion.recommended_status !==
        context.current_crm_status
    ) {
      fail(
        'INVARIANT_VIOLATION',
        'crm_suggestion.recommended_status',
        'Sem mudança, a etapa informada só pode repetir a etapa atual.',
      )
    }
  }

  if (
    !suggestion.next_action_required &&
    suggestion.expected_next_action_at !==
      null
  ) {
    fail(
      'INVARIANT_VIOLATION',
      'crm_suggestion.expected_next_action_at',
      'Uma data de próxima ação exige next_action_required=true.',
    )
  }

  if (
    suggestion.expected_next_action_at !==
    null
  ) {
    const expectedTimestamp =
      Date.parse(
        suggestion.expected_next_action_at,
      )

    if (
      !Number.isFinite(expectedTimestamp)
    ) {
      fail(
        'INVALID_REFERENCE_TIME',
        'crm_suggestion.expected_next_action_at',
        'A data da próxima ação é inválida.',
      )
    }

    if (
      expectedTimestamp <=
      referenceTimestamp
    ) {
      fail(
        'INVARIANT_VIOLATION',
        'crm_suggestion.expected_next_action_at',
        'A próxima ação precisa estar no futuro.',
      )
    }
  }
}

export function normalizeCompanionDiagnostic(
  value: unknown,
  context: CompanionDiagnosticContext,
): CompanionDiagnostic {
  const {
    availableMessageIds,
    referenceTimestamp,
  } = validateContext(context)

  const root = requireRecord(
    value,
    'diagnostic',
  )

  if (
    root.contract_version !==
    COMPANION_DIAGNOSTIC_CONTRACT_VERSION
  ) {
    fail(
      'INVALID_CONTRACT_VERSION',
      'contract_version',
      `O contrato precisa ser ${COMPANION_DIAGNOSTIC_CONTRACT_VERSION}.`,
    )
  }

  const sellerAssessment =
    requireRecord(
      root.seller_assessment,
      'seller_assessment',
    )

  const salesMethod =
    requireRecord(
      root.sales_method,
      'sales_method',
    )

  const solutionFit =
    requireRecord(
      root.solution_fit,
      'solution_fit',
    )

  const guidance =
    requireRecord(
      root.guidance,
      'guidance',
    )

  const crmSuggestion =
    requireRecord(
      root.crm_suggestion,
      'crm_suggestion',
    )

  const customerIntent =
    root.customer_intent === null
      ? null
      : normalizeEvidenceItem(
          root.customer_intent,
          'customer_intent',
          availableMessageIds,
        )

  const expectedNextActionAt =
    requireNullableString(
      crmSuggestion,
      'expected_next_action_at',
      'crm_suggestion',
    )

  const diagnostic:
    CompanionDiagnostic = {
    contract_version:
      COMPANION_DIAGNOSTIC_CONTRACT_VERSION,

    analysis_status: requireEnum(
      root.analysis_status,
      ANALYSIS_STATUSES,
      'analysis_status',
    ),

    analysis_limitations:
      normalizeStringArray(
        root.analysis_limitations,
        'analysis_limitations',
      ),

    commercial_relevance: requireEnum(
      root.commercial_relevance,
      COMMERCIAL_RELEVANCES,
      'commercial_relevance',
    ),

    confidence: requireEnum(
      root.confidence,
      CONFIDENCE_LEVELS,
      'confidence',
    ),

    customer_intent: customerIntent,

    needs:
      normalizeEvidenceItemArray(
        root.needs,
        'needs',
        availableMessageIds,
      ),

    missing_information:
      normalizeMissingInformation(
        root.missing_information,
        'missing_information',
      ),

    unanswered_questions:
      normalizeEvidenceItemArray(
        root.unanswered_questions,
        'unanswered_questions',
        availableMessageIds,
      ),

    active_objections:
      normalizeEvidenceItemArray(
        root.active_objections,
        'active_objections',
        availableMessageIds,
      ),

    seller_assessment: {
      strengths:
        normalizeEvidenceItemArray(
          sellerAssessment.strengths,
          'seller_assessment.strengths',
          availableMessageIds,
        ),

      risks: normalizeSellerRisks(
        sellerAssessment.risks,
        'seller_assessment.risks',
        availableMessageIds,
      ),
    },

    sales_method: {
      configured: requireBoolean(
        salesMethod.configured,
        'sales_method.configured',
      ),

      current_step:
        requireNullableString(
          salesMethod,
          'current_step',
          'sales_method',
        ),

      completed_steps:
        normalizeStringArray(
          salesMethod.completed_steps,
          'sales_method.completed_steps',
        ),

      skipped_steps:
        normalizeStringArray(
          salesMethod.skipped_steps,
          'sales_method.skipped_steps',
        ),

      evidence_message_ids:
        normalizeEvidenceIds(
          salesMethod.evidence_message_ids,
          'sales_method.evidence_message_ids',
          availableMessageIds,
          false,
        ),
    },

    solution_fit: {
      status: requireEnum(
        solutionFit.status,
        SOLUTION_FIT_STATUSES,
        'solution_fit.status',
      ),

      rationale:
        requireNullableString(
          solutionFit,
          'rationale',
          'solution_fit',
        ),

      evidence_message_ids:
        normalizeEvidenceIds(
          solutionFit.evidence_message_ids,
          'solution_fit.evidence_message_ids',
          availableMessageIds,
          false,
        ),
    },

    guidance: {
      intervention_required:
        requireBoolean(
          guidance.intervention_required,
          'guidance.intervention_required',
        ),

      next_move:
        requireNullableString(
          guidance,
          'next_move',
          'guidance',
        ),

      recommended_question:
        requireNullableString(
          guidance,
          'recommended_question',
          'guidance',
        ),

      suggested_message:
        requireNullableString(
          guidance,
          'suggested_message',
          'guidance',
        ),
    },

    crm_suggestion: {
      should_change_crm_stage:
        requireBoolean(
          crmSuggestion
            .should_change_crm_stage,
          'crm_suggestion.should_change_crm_stage',
        ),

      recommended_status:
        normalizeNullableLeadStatus(
          crmSuggestion,
          'recommended_status',
          'crm_suggestion',
        ),

      next_action_required:
        requireBoolean(
          crmSuggestion
            .next_action_required,
          'crm_suggestion.next_action_required',
        ),

      expected_next_action_at:
        expectedNextActionAt === null
          ? null
          : new Date(
              expectedNextActionAt,
            ).toISOString(),

      prohibited_statuses:
        normalizeLeadStatusArray(
          crmSuggestion
            .prohibited_statuses,
          'crm_suggestion.prohibited_statuses',
        ),

      requires_human_confirmation:
        requireBoolean(
          crmSuggestion
            .requires_human_confirmation,
          'crm_suggestion.requires_human_confirmation',
        ) as true,
    },

    evidence_message_ids:
      normalizeEvidenceIds(
        root.evidence_message_ids,
        'evidence_message_ids',
        availableMessageIds,
        false,
      ),
  }

  validateAnalysisState(diagnostic)
  validateMethod(diagnostic)
  validateSolutionFit(diagnostic)
  validateGuidance(diagnostic)
  validateBlockedAnalysis(diagnostic)

  validateCrmSuggestion(
    diagnostic,
    context,
    referenceTimestamp,
  )

  return diagnostic
}
