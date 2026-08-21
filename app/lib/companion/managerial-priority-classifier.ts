import type {
  ManagerialSignalClassification,
} from './managerial-signal-classifier'

import type {
  ManagerialIntelligenceDecision,
  ManagerialIntelligencePriority,
  ManagerialIntelligenceSignal,
  ManagerialIntelligenceSignalSeverity,
} from './managerial-intelligence-contract'

export type ManagerialPriorityClassification = {
  company_id: string

  decision:
    ManagerialIntelligenceDecision
}

export class ManagerialPriorityClassifierError
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
      'ManagerialPriorityClassifierError'

    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new ManagerialPriorityClassifierError(
    code,
    path,
    message,
  )
}

const severityRank:
  Record<
    ManagerialIntelligenceSignalSeverity,
    number
  > = {
    informational: 1,
    attention: 2,
    critical: 3,
  }

function uniqueSorted(
  values: string[],
): string[] {
  return Array.from(
    new Set(values),
  ).sort()
}

function validateSignals(
  signals:
    ManagerialIntelligenceSignal[],
): void {
  const usedKeys =
    new Set<string>()

  signals.forEach(
    (signal, index) => {
      const path =
        'signals[' +
        index +
        ']'

      if (
        !signal ||
        typeof signal !== 'object'
      ) {
        fail(
          'INVALID_SIGNAL',
          path,
          'Todo sinal precisa ser um objeto.',
        )
      }

      if (
        typeof signal.signal_key !==
          'string' ||
        !signal.signal_key.trim()
      ) {
        fail(
          'INVALID_SIGNAL_KEY',
          path +
            '.signal_key',
          'signal_key é obrigatório.',
        )
      }

      const key =
        signal.signal_key.trim()

      if (usedKeys.has(key)) {
        fail(
          'DUPLICATE_SIGNAL_KEY',
          path +
            '.signal_key',
          'Existe sinal duplicado: ' +
            key,
        )
      }

      usedKeys.add(key)

      if (
        !Object.prototype
          .hasOwnProperty.call(
            severityRank,
            signal.severity,
          )
      ) {
        fail(
          'INVALID_SEVERITY',
          path +
            '.severity',
          'Severidade gerencial inválida.',
        )
      }

      if (
        signal
          .requires_human_review !==
        true
      ) {
        fail(
          'HUMAN_REVIEW_REQUIRED',
          path +
            '.requires_human_review',
          'Todo sinal gerencial precisa preservar revisão humana.',
        )
      }
    },
  )
}

function highestSeverity(
  signals:
    ManagerialIntelligenceSignal[],
): ManagerialIntelligenceSignalSeverity | null {
  let highest:
    ManagerialIntelligenceSignalSeverity | null =
      null

  for (const signal of signals) {
    if (
      highest === null ||
      severityRank[
        signal.severity
      ] >
        severityRank[
          highest
        ]
    ) {
      highest =
        signal.severity
    }
  }

  return highest
}

function priorityForSeverity(
  severity:
    ManagerialIntelligenceSignalSeverity | null,
): ManagerialIntelligencePriority {
  if (severity === null) {
    return 'none'
  }

  return severity
}

function reasonForPriority(
  priority:
    ManagerialIntelligencePriority,
  signalCount: number,
): string {
  if (priority === 'none') {
    return 'Nenhum sinal gerencial comprovado exige prioridade no escopo analisado.'
  }

  if (
    priority ===
    'informational'
  ) {
    return (
      'Existem ' +
      signalCount +
      ' sinais informativos comprovados, sem necessidade de intervenção gerencial.'
    )
  }

  if (
    priority ===
    'attention'
  ) {
    return (
      'Existem ' +
      signalCount +
      ' sinais de atenção comprovados que exigem revisão humana gerencial.'
    )
  }

  return (
    'Existem ' +
    signalCount +
    ' sinais críticos comprovados que exigem revisão humana gerencial prioritária.'
  )
}

export function classifyManagerialPriority(
  classification:
    ManagerialSignalClassification,
): ManagerialPriorityClassification {
  if (
    typeof classification
      .company_id !==
      'string' ||
    !classification
      .company_id
      .trim()
  ) {
    fail(
      'INVALID_COMPANY',
      'company_id',
      'company_id é obrigatório.',
    )
  }

  if (
    !Array.isArray(
      classification.signals,
    )
  ) {
    fail(
      'INVALID_SIGNALS',
      'signals',
      'signals precisa ser uma lista.',
    )
  }

  validateSignals(
    classification.signals,
  )

  const severity =
    highestSeverity(
      classification.signals,
    )

  const priority =
    priorityForSeverity(
      severity,
    )

  const supportingSignals =
    severity === null
      ? []
      : classification
          .signals
          .filter(
            signal =>
              signal.severity ===
              severity,
          )

  const signalKeys =
    uniqueSorted(
      supportingSignals
        .map(
          signal =>
            signal.signal_key,
        ),
    )

  const interventionNeeded =
    priority === 'attention' ||
    priority === 'critical'

  return {
    company_id:
      classification
        .company_id
        .trim(),

    decision: {
      priority,

      intervention_needed:
        interventionNeeded,

      reason:
        reasonForPriority(
          priority,
          signalKeys.length,
        ),

      signal_keys:
        signalKeys,

      requires_human_judgment:
        true,
    },
  }
}
