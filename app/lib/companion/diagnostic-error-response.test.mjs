import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CompanionDiagnosticModelError,
} from './diagnostic-model.ts'

import {
  getSafeCompanionDiagnosticErrorDetails,
} from '../server/companion-diagnostic-error-response.ts'

test(
  'expõe somente código e caminho seguros da violação contratual',
  () => {
    const error =
      new CompanionDiagnosticModelError({
        code:
          'INVALID_MODEL_OUTPUT',

        message:
          'Diagnóstico inválido.',

        status_code:
          502,

        retryable:
          false,

        details: {
          contract_error_code:
            'INVALID_EVIDENCE',

          contract_error_path:
            'customer_intent.evidence_message_ids[0]',

          provider_response:
            'conteúdo que não pode ser exposto',

          api_key:
            'segredo que não pode ser exposto',
        },
      })

    const details =
      getSafeCompanionDiagnosticErrorDetails(
        error,
      )

    assert.deepEqual(
      details,
      {
        contract_error_code:
          'INVALID_EVIDENCE',

        contract_error_path:
          'customer_intent.evidence_message_ids[0]',
      },
    )

    assert.equal(
      JSON.stringify(
        details,
      ).includes(
        'conteúdo que não pode ser exposto',
      ),
      false,
    )

    assert.equal(
      JSON.stringify(
        details,
      ).includes(
        'segredo que não pode ser exposto',
      ),
      false,
    )
  },
)

test(
  'não expõe detalhes genéricos do provedor',
  () => {
    const error =
      new CompanionDiagnosticModelError({
        code:
          'MODEL_RATE_LIMITED',

        message:
          'Limite atingido.',

        status_code:
          429,

        retryable:
          true,

        details: {
          provider_status:
            429,

          provider_message:
            'mensagem interna',
        },
      })

    assert.equal(
      getSafeCompanionDiagnosticErrorDetails(
        error,
      ),
      null,
    )
  },
)

test(
  'não expõe detalhes de erros desconhecidos',
  () => {
    assert.equal(
      getSafeCompanionDiagnosticErrorDetails(
        new Error(
          'erro desconhecido',
        ),
      ),
      null,
    )
  },
)

test(
  'normaliza e limita os campos seguros',
  () => {
    const error =
      new CompanionDiagnosticModelError({
        code:
          'INVALID_MODEL_OUTPUT',

        message:
          'Diagnóstico inválido.',

        status_code:
          502,

        retryable:
          false,

        details: {
          contract_error_code:
            `  ${'A'.repeat(300)}  `,

          contract_error_path:
            `  ${'B'.repeat(700)}  `,
        },
      })

    const details =
      getSafeCompanionDiagnosticErrorDetails(
        error,
      )

    assert.equal(
      details
        .contract_error_code
        .length,
      200,
    )

    assert.equal(
      details
        .contract_error_path
        .length,
      500,
    )
  },
)
