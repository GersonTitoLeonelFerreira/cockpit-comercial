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

type JsonRecord =
  Record<string, unknown>

const NUMERIC_TOKEN_PATTERN =
  /R\$\s*\d+(?:[.,]\d+)?|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{1,2}:\d{2}\b|\b\d+(?:[.,]\d+)?\s*%|\b\d+(?:[.,]\d+)?\s*h\b|\b\d+(?:[.,]\d+)?\b/gi

const OPERATIONAL_CONFIRMATION_PATTERN =
  /\b(?:confirmad[oa]s?|agendad[oa]s?|reservad[oa]s?|temos\s+vaga|h[aá]\s+vaga|vaga\s+dispon[ií]vel)\b/i

const OPERATIONAL_UNKNOWN_PATTERN =
  /\b(?:disponibilidade|vaga|agendamento|agenda|hor[aá]rio)\b/i

const RELATIVE_TIME_PATTERN =
  /\b(?:hoje|amanh[aã]|depois\s+de\s+amanh[aã]|pr[oó]xim[oa]\s+(?:segunda(?:-feira)?|ter[cç]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[aá]bado|domingo))\b/gi

const IDENTIFIER_KEY_PATTERN =
  /(?:^id$|_id$|_ids$|_key$|version$|contract_version$|input_version$|output_contract_version$)/i

function normalizeToken(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(
      /\s+/g,
      '',
    )
    .replace(
      /,/g,
      '.',
    )
}

function normalizeSearchText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLowerCase()
}

function extractNumericTokens(
  value: string,
): string[] {
  return [
    ...value.matchAll(
      NUMERIC_TOKEN_PATTERN,
    ),
  ].map(
    match =>
      normalizeToken(
        match[0],
      ),
  )
}

function collectGroundingFragments(
  value: unknown,
  key: string | null = null,
): string[] {
  if (
    key &&
    IDENTIFIER_KEY_PATTERN.test(
      key,
    )
  ) {
    return []
  }

  if (
    typeof value === 'string'
  ) {
    return [
      value,
    ]
  }

  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return [
      String(value),
    ]
  }

  if (
    !value ||
    typeof value !== 'object'
  ) {
    return []
  }

  if (
    Array.isArray(value)
  ) {
    return value.flatMap(
      item =>
        collectGroundingFragments(
          item,
          key,
        ),
    )
  }

  return Object.entries(
    value as JsonRecord,
  ).flatMap(
    ([childKey, childValue]) =>
      collectGroundingFragments(
        childValue,
        childKey,
      ),
  )
}

function buildAllowedEvidenceIds(
  input: StatefulCopilotInput,
): Set<string> {
  const ids =
    new Set<string>()

  for (
    const message of
    input
      .diagnostic_input
      .conversation
      .messages
  ) {
    ids.add(
      message.id,
    )
  }

  const previousState =
    input
      .state_context
      .previous_state

  if (!previousState) {
    return ids
  }

  for (
    const id of
    previousState
      .last_analyzed_message_ids
  ) {
    ids.add(id)
  }

  for (
    const id of
    previousState
      .last_evidence_message_ids
  ) {
    ids.add(id)
  }

  for (
    const id of
    previousState
      .current_moment
      .evidence_message_ids
  ) {
    ids.add(id)
  }

  for (
    const id of
    previousState
      .current_priority
      .evidence_message_ids
  ) {
    ids.add(id)
  }

  const collections = [
    previousState.facts,
    previousState.needs,
    previousState.open_loops,
    previousState.objections,
    previousState.commitments,
    previousState.signals,
    previousState.uncertainties,
  ]

  for (
    const collection of
    collections
  ) {
    for (
      const memory of
      collection
    ) {
      for (
        const id of
        memory.evidence_message_ids
      ) {
        ids.add(id)
      }
    }
  }

  return ids
}

function sanitizeEvidenceIds(
  ids: string[],
  allowedIds: Set<string>,
): {
  ids: string[]
  changed: boolean
} {
  const sanitized =
    [
      ...new Set(
        ids.filter(
          id =>
            allowedIds.has(id),
        ),
      ),
    ]

  return {
    ids:
      sanitized,

    changed:
      sanitized.length !==
      ids.length ||
      sanitized.some(
        (id, index) =>
          id !== ids[index],
      ),
  }
}

function sanitizeOutputEvidence(
  output:
    CommercialReasoningCoreV2Output,
  allowedIds:
    Set<string>,
): {
  output:
    CommercialReasoningCoreV2Output
  changed:
    boolean
} {
  let changed =
    false

  const sanitize =
    (
      ids:
        string[],
    ) => {
      const result =
        sanitizeEvidenceIds(
          ids,
          allowedIds,
        )

      if (result.changed) {
        changed =
          true
      }

      return result.ids
    }

  const sanitizedOutput: CommercialReasoningCoreV2Output = {
    ...output,

    situation: {
      ...output.situation,
      evidence_message_ids:
        sanitize(
          output
            .situation
            .evidence_message_ids,
        ),
    },

    responsibility: {
      ...output.responsibility,
      evidence_message_ids:
        sanitize(
          output
            .responsibility
            .evidence_message_ids,
        ),
    },

    decision: {
      ...output.decision,
      evidence_message_ids:
        sanitize(
          output
            .decision
            .evidence_message_ids,
        ),
    },

    coaching: {
      strengths:
        output
          .coaching
          .strengths
          .map(
            item => ({
              ...item,
              evidence_message_ids:
                sanitize(
                  item
                    .evidence_message_ids,
                ),
            }),
          ),

      improvement_points:
        output
          .coaching
          .improvement_points
          .map(
            item => ({
              ...item,
              evidence_message_ids:
                sanitize(
                  item
                    .evidence_message_ids,
                ),
            }),
          ),
    },

    method: {
      ...output.method,
      evidence_message_ids:
        sanitize(
          output
            .method
            .evidence_message_ids,
        ),
    },

    factuality: {
      ...output.factuality,

      facts_used:
        output
          .factuality
          .facts_used
          .map(
            fact => ({
              ...fact,
              evidence_message_ids:
                sanitize(
                  fact
                    .evidence_message_ids,
                ),
            }),
          ),
    },

    evidence_message_ids:
      sanitize(
        output
          .evidence_message_ids,
      ),
  }

  return {
    changed,
    output:
      sanitizedOutput,
  }
}

function unsupportedNumericTokens({
  text,
  groundedTokens,
}: {
  text:
    string | null
  groundedTokens:
    Set<string>
}): string[] {
  if (!text) {
    return []
  }

  return [
    ...new Set(
      extractNumericTokens(
        text,
      ).filter(
        token =>
          !groundedTokens.has(
            token,
          ),
      ),
    ),
  ]
}

function hasUnsupportedRelativeTimeAssertion({
  text,
  groundingText,
}: {
  text:
    string | null
  groundingText:
    string
}): boolean {
  if (
    !text ||
    text.includes('?')
  ) {
    return false
  }

  const normalizedGrounding =
    normalizeSearchText(
      groundingText,
    )

  const matches =
    [
      ...text.matchAll(
        RELATIVE_TIME_PATTERN,
      ),
    ]

  return matches.some(
    match =>
      !normalizedGrounding.includes(
        normalizeSearchText(
          match[0],
        ),
      ),
  )
}

function sanitizeUnverifiedRecipientGreeting(
  text: string | null,
): {
  text: string | null
  changed: boolean
} {
  if (!text) {
    return {
      text,
      changed: false,
    }
  }

  const greetingMatch =
    text.match(
      /^(oi|olá|ola|bom dia|boa tarde|boa noite),?\s+/i,
    )

  if (!greetingMatch) {
    return {
      text,
      changed: false,
    }
  }

  const remainder =
    text.slice(
      greetingMatch[0].length,
    )

  const namePattern =
    "[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÖØ-öø-ÿ'’-]{1,39}"

  const recipientPattern =
    new RegExp(
      `^(${namePattern})(?:\\s+(?:e|&)\\s+(${namePattern}))?!\\s*`,
    )

  const recipientMatch =
    remainder.match(
      recipientPattern,
    )

  if (!recipientMatch) {
    return {
      text,
      changed: false,
    }
  }

  const greeting =
    greetingMatch[1]

  const rest =
    remainder.slice(
      recipientMatch[0].length,
    )

  return {
    text:
      `${greeting}! ${rest}`,

    changed:
      true,
  }
}

function sanitizeUnverifiedRecipientRelation(
  text: string | null,
): {
  text: string | null
  changed: boolean
} {
  if (!text) {
    return {
      text,
      changed: false,
    }
  }

  const namePattern =
    "[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÖØ-öø-ÿ'’-]{1,39}"

  const relationPattern =
    new RegExp(
      `\\bpara\\s+você\\s+e\\s+(?:a\\s+|o\\s+)?${namePattern}\\b`,
      'g',
    )

  const sanitized =
    text.replace(
      relationPattern,
      'para duas pessoas',
    )

  return {
    text:
      sanitized,

    changed:
      sanitized !== text,
  }
}

export function applyCommercialReasoningCoreV2FactualGuard({
  input,
  output,
}: {
  input: StatefulCopilotInput
  output: CommercialReasoningCoreV2Output
}): CommercialReasoningCoreV2FactualGuardResult {
  const codes:
    string[] = []

  const unknowns =
    [
      ...output
        .factuality
        .unknowns,
    ]

  const messages =
    input
      .diagnostic_input
      .conversation
      .messages

  const methodConfig =
    input
      .diagnostic_input
      .commercial_context
      .sales_method

  const allowedEvidenceIds =
    buildAllowedEvidenceIds(
      input,
    )

  const evidenceGuard =
    sanitizeOutputEvidence(
      output,
      allowedEvidenceIds,
    )

  let guardedOutput =
    evidenceGuard.output

  if (
    evidenceGuard.changed
  ) {
    codes.push(
      'EVIDENCE_IDS_SANITIZED',
    )
  }

  if (
    messages.some(
      message =>
        message.content_type ===
          'audio' &&
        !message
          .audio_transcription
          ?.trim(),
    )
  ) {
    unknowns.push(
      'Existe áudio sem transcrição disponível; seu conteúdo não foi tratado como fato.',
    )

    codes.push(
      'PENDING_AUDIO_DECLARED_AS_UNKNOWN',
    )
  }

  if (
    messages.some(
      message => {
        const text =
          message
            .text_content
            ?.toLowerCase() ??
          ''

        return (
          text.includes(
            '[arquivo:',
          ) ||
          text.includes(
            '[anexo:',
          )
        )
      },
    )
  ) {
    unknowns.push(
      'Existe anexo registrado, mas o conteúdo interno do arquivo não está disponível nesta fotografia.',
    )

    codes.push(
      'ATTACHMENT_CONTENT_DECLARED_AS_UNKNOWN',
    )
  }

  const method =
    methodConfig.configured
      ? {
          ...guardedOutput.method,
          configured:
            true,
          name:
            methodConfig.name ??
            guardedOutput
              .method
              .name,
        }
      : {
          configured:
            false as const,
          name:
            null,
          current_stage:
            null,
          adherence:
            'not_configured' as const,
          deviation:
            null,
          recovery_move:
            null,
          evidence_message_ids:
            [],
        }

  if (
    !methodConfig.configured &&
    guardedOutput
      .method
      .configured
  ) {
    codes.push(
      'METHOD_CONFIGURATION_RECONCILED',
    )
  }

  let communication =
    guardedOutput
      .communication
      .intervention_needed
      ? {
          ...guardedOutput
            .communication,
        }
      : {
          intervention_needed:
            false,
          recommended_question:
            null,
          suggested_message:
            null,
        }

  if (
    !guardedOutput
      .communication
      .intervention_needed &&
    (
      guardedOutput
        .communication
        .recommended_question ||
      guardedOutput
        .communication
        .suggested_message
    )
  ) {
    codes.push(
      'SILENT_COMMUNICATION_NORMALIZED',
    )
  }

  const groundingText =
    collectGroundingFragments({
      diagnostic_input:
        input
          .diagnostic_input,

      previous_state:
        input
          .state_context
          .previous_state,
    }).join(
      '\n',
    )

  const groundedNumericTokens =
    new Set(
      extractNumericTokens(
        groundingText,
      ),
    )

  const unsupportedQuestionTokens =
    unsupportedNumericTokens({
      text:
        communication
          .recommended_question,

      groundedTokens:
        groundedNumericTokens,
    })

  if (
    unsupportedQuestionTokens
      .length > 0
  ) {
    communication = {
      ...communication,
      recommended_question:
        null,
    }

    unknowns.push(
      `A pergunta sugerida continha dado numérico, preço, data ou horário sem suporte explícito no contexto: ${unsupportedQuestionTokens.join(', ')}.`,
    )

    codes.push(
      'UNSUPPORTED_NUMERIC_COMMUNICATION_BLOCKED',
    )
  }

  const unsupportedMessageTokens =
    unsupportedNumericTokens({
      text:
        communication
          .suggested_message,

      groundedTokens:
        groundedNumericTokens,
    })

  if (
    unsupportedMessageTokens
      .length > 0
  ) {
    communication = {
      ...communication,
      suggested_message:
        null,
    }

    unknowns.push(
      `A mensagem sugerida continha dado numérico, preço, data ou horário sem suporte explícito no contexto: ${unsupportedMessageTokens.join(', ')}.`,
    )

    codes.push(
      'UNSUPPORTED_NUMERIC_COMMUNICATION_BLOCKED',
    )
  }

  const unknownText =
    normalizeSearchText(
      unknowns.join(
        '\n',
      ),
    )

  if (
    communication
      .suggested_message &&
    OPERATIONAL_CONFIRMATION_PATTERN
      .test(
        communication
          .suggested_message,
      ) &&
    OPERATIONAL_UNKNOWN_PATTERN
      .test(
        unknownText,
      )
  ) {
    communication = {
      ...communication,
      suggested_message:
        null,
    }

    codes.push(
      'UNVERIFIED_OPERATIONAL_CONFIRMATION_BLOCKED',
    )
  }

  if (
    communication
      .suggested_message &&
    hasUnsupportedRelativeTimeAssertion({
      text:
        communication
          .suggested_message,

      groundingText,
    })
  ) {
    communication = {
      ...communication,
      suggested_message:
        null,
    }

    unknowns.push(
      'A mensagem sugerida continha uma referência temporal relativa não confirmada diretamente pelo contexto.',
    )

    codes.push(
      'UNSUPPORTED_TEMPORAL_COMMUNICATION_BLOCKED',
    )
  }

  const recipientGreetingGuard =
    sanitizeUnverifiedRecipientGreeting(
      communication
        .suggested_message,
    )

  if (
    recipientGreetingGuard
      .changed
  ) {
    communication = {
      ...communication,

      suggested_message:
        recipientGreetingGuard
          .text,
    }

    codes.push(
      'UNVERIFIED_RECIPIENT_GREETING_SANITIZED',
    )
  }

  const recipientRelationGuard =
    sanitizeUnverifiedRecipientRelation(
      communication
        .suggested_message,
    )

  if (
    recipientRelationGuard
      .changed
  ) {
    communication = {
      ...communication,

      suggested_message:
        recipientRelationGuard
          .text,
    }

    codes.push(
      'UNVERIFIED_RECIPIENT_RELATION_SANITIZED',
    )
  }

  guardedOutput = {
    ...guardedOutput,

    method,

    communication,

    factuality: {
      ...guardedOutput
        .factuality,

      unknowns:
        [
          ...new Set(
            unknowns,
          ),
        ],
    },
  }

  const adjustmentCodes =
    [
      ...new Set(
        codes,
      ),
    ]

  return {
    output:
      guardedOutput,

    report: {
      adjusted:
        adjustmentCodes
          .length > 0,

      adjustment_codes:
        adjustmentCodes,
    },
  }
}
