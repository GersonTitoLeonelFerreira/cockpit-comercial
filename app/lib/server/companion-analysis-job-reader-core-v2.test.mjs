import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CompanionAnalysisJobReadError,
  loadCompanionAnalysisJobStatus,
} from './companion-analysis-job-reader.ts'

const IDS = {
  company:
    'aaaaaaaa-0000-4000-8000-000000000001',

  user:
    'aaaaaaaa-0000-4000-8000-0000000000a1',

  cycle:
    'aaaaaaaa-0000-4000-8000-0000000000d1',
}

const ANALYSIS_JOB_ID =
  'a'.repeat(
    64,
  )

const CONVERSATION_KEY =
  'conversation-core-v2-test'

function matchesFilters(
  row,
  filters,
) {
  return filters.every(
    filter =>
      row[
        filter.column
      ] ===
      filter.value,
  )
}

function createFakeAdmin(
  tables,
) {
  class Query {
    constructor(
      table,
    ) {
      this.table =
        table

      this.filters =
        []

      this.maxRows =
        null
    }

    select() {
      return this
    }

    eq(
      column,
      value,
    ) {
      this.filters.push({
        column,
        value,
      })

      return this
    }

    limit(
      count,
    ) {
      this.maxRows =
        count

      return this
    }

    resolveRows() {
      const rows =
        (
          tables[
            this.table
          ] ??
          []
        ).filter(
          row =>
            matchesFilters(
              row,
              this.filters,
            ),
        )

      return this.maxRows ===
        null
        ? rows
        : rows.slice(
            0,
            this.maxRows,
          )
    }

    maybeSingle() {
      const rows =
        this.resolveRows()

      return Promise.resolve({
        data:
          rows[0] ??
          null,

        error:
          null,
      })
    }

    then(
      resolve,
      reject,
    ) {
      return Promise.resolve({
        data:
          this.resolveRows(),

        error:
          null,
      }).then(
        resolve,
        reject,
      )
    }
  }

  return {
    from(
      table,
    ) {
      return new Query(
        table,
      )
    },
  }
}

function commercialReading() {
  return {
    contract_version:
      'commercial-reading-v1',

    commercial_role:
      'buyer',

    commercial_relevance:
      'commercial',
  }
}

function corePersistedOutput({
  sellerRole =
    'buyer',

  coreRole =
    'buyer',
} = {}) {
  return {
    contract_version:
      'commercial-reasoning-core-v2',

    runtime_version:
      'commercial-reasoning-core-v2-runtime-v1',

    core_output: {
      contract_version:
        'commercial-reasoning-core-v2',

      commercial_role:
        coreRole,

      commercial_relevance:
        'commercial',
    },

    seller_projection: {
      adapter_version:
        'commercial-reasoning-core-v2-seller-adapter-v1',

      engine_source:
        'commercial_reasoning_core_v2',

      seller_actionable:
        true,

      commercial_role:
        sellerRole,

      commercial_relevance:
        'commercial',

      summary:
        'Cliente escolheu Pilates para duas pessoas e pediu sexta às 18h.',

      decision:
        'set_commitment',

      recommended_next_approach:
        'Confirmar a disponibilidade para duas pessoas na sexta às 18h.',

      reason:
        'O cliente já avançou para confirmação operacional.',

      intervention_needed:
        true,

      recommended_question:
        null,

      suggested_message:
        'Vou confirmar a disponibilidade para duas pessoas na sexta às 18h e já te retorno.',

      evidence_message_ids: [
        'm3',
      ],
    },

    commercial_reading:
      commercialReading(),

    commercial_reading_report: {
      adapter_version:
        'commercial-reasoning-core-v2-commercial-reading-adapter-v1',
    },

    factual_guard: {
      adjusted:
        false,
    },
  }
}

function fixtures({
  outputContractVersion =
    'commercial-reasoning-core-v2',

  normalizedOutput =
    corePersistedOutput(),
} = {}) {
  return {
    company_memberships: [
      {
        company_id:
          IDS.company,

        user_id:
          IDS.user,

        role:
          'member',

        is_active:
          true,
      },
    ],

    sales_cycles: [
      {
        id:
          IDS.cycle,

        company_id:
          IDS.company,

        owner_user_id:
          IDS.user,
      },
    ],

    companion_background_analysis_jobs: [
      {
        analysis_job_id:
          ANALYSIS_JOB_ID,

        status:
          'succeeded',

        company_id:
          IDS.company,

        cycle_id:
          IDS.cycle,

        conversation_key:
          CONVERSATION_KEY,

        message_watermark:
          'watermark-core-v2',

        candidate_state_version:
          5,

        failure_code:
          null,
      },
    ],

    companion_commercial_state_events: [
      {
        company_id:
          IDS.company,

        cycle_id:
          IDS.cycle,

        conversation_key:
          CONVERSATION_KEY,

        candidate_state_version:
          5,

        output_contract_version:
          outputContractVersion,

        generated_at:
          '2026-09-14T03:10:00.000Z',

        normalized_output:
          normalizedOutput,
      },
    ],
  }
}

function token() {
  return {
    company_id:
      IDS.company,

    sub:
      IDS.user,
  }
}

test(
  'job succeeded do Core V2 vira o mesmo DTO seller-facing consumido pela extensão',
  async () => {
    const result =
      await loadCompanionAnalysisJobStatus({
        admin:
          createFakeAdmin(
            fixtures(),
          ),

        token:
          token(),

        analysis_job_id:
          ANALYSIS_JOB_ID,
      })

    assert.equal(
      result.status,
      'succeeded',
    )

    assert.equal(
      result.candidate_state_version,
      5,
    )

    assert.equal(
      result.result.contract_version,
      'phase12a-deep-seller-v1',
    )

    assert.equal(
      result.result.engine_source,
      'commercial_reasoning_core_v2',
    )

    assert.equal(
      result.result.summary,
      'Cliente escolheu Pilates para duas pessoas e pediu sexta às 18h.',
    )

    assert.equal(
      result.result.recommended_next_approach,
      'Confirmar a disponibilidade para duas pessoas na sexta às 18h.',
    )

    assert.equal(
      result.result.suggested_message,
      'Vou confirmar a disponibilidade para duas pessoas na sexta às 18h e já te retorno.',
    )

    assert.equal(
      result.result.commercial_reading.contract_version,
      'commercial-reading-v1',
    )

    assert.equal(
      result.result.core_output,
      undefined,
    )

    assert.equal(
      result.result.factual_guard,
      undefined,
    )
  },
)

test(
  'contrato histórico não suportado continua falhando fechado',
  async () => {
    await assert.rejects(
      () =>
        loadCompanionAnalysisJobStatus({
          admin:
            createFakeAdmin(
              fixtures({
                outputContractVersion:
                  'phase-5.2-stateful-copilot-v3',

                normalizedOutput: {
                  contract_version:
                    'phase-5.2-stateful-copilot-v3',
                },
              }),
            ),

          token:
            token(),

          analysis_job_id:
            ANALYSIS_JOB_ID,
        }),
      error => {
        assert.ok(
          error instanceof
            CompanionAnalysisJobReadError,
        )

        assert.equal(
          error.code,
          'DEEP_RESULT_INTEGRITY_ERROR',
        )

        return true
      },
    )
  },
)

test(
  'mismatch entre Core output e seller projection falha fechado',
  async () => {
    await assert.rejects(
      () =>
        loadCompanionAnalysisJobStatus({
          admin:
            createFakeAdmin(
              fixtures({
                normalizedOutput:
                  corePersistedOutput({
                    sellerRole:
                      'buyer',

                    coreRole:
                      'provider',
                  }),
              }),
            ),

          token:
            token(),

          analysis_job_id:
            ANALYSIS_JOB_ID,
        }),
      error => {
        assert.ok(
          error instanceof
            CompanionAnalysisJobReadError,
        )

        assert.equal(
          error.code,
          'DEEP_RESULT_INTEGRITY_ERROR',
        )

        return true
      },
    )
  },
)
