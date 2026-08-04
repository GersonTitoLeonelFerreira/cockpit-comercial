import {
  CompanionDiagnosticModelError,
} from '../companion/diagnostic-model'

export type SafeCompanionDiagnosticErrorDetails = {
  contract_error_code:
    string | null

  contract_error_path:
    string | null
}

function normalizeSafeString(
  value: unknown,
  maximumLength: number,
): string | null {
  if (
    typeof value !== 'string'
  ) {
    return null
  }

  const normalized =
    value.trim()

  if (!normalized) {
    return null
  }

  return normalized.slice(
    0,
    maximumLength,
  )
}

export function getSafeCompanionDiagnosticErrorDetails(
  error: unknown,
): SafeCompanionDiagnosticErrorDetails | null {
  if (
    !(error instanceof
      CompanionDiagnosticModelError) ||
    !error.details
  ) {
    return null
  }

  const contractErrorCode =
    normalizeSafeString(
      error.details
        .contract_error_code,
      200,
    )

  const contractErrorPath =
    normalizeSafeString(
      error.details
        .contract_error_path,
      500,
    )

  if (
    !contractErrorCode &&
    !contractErrorPath
  ) {
    return null
  }

  return {
    contract_error_code:
      contractErrorCode,

    contract_error_path:
      contractErrorPath,
  }
}
