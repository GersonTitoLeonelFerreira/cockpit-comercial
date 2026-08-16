import assert from 'node:assert/strict'
import test from 'node:test'
import { buildShadowReport } from '../../../scripts/companion-shadow-report.mjs'

test('relatório shadow mede comparação, tokens, retry, latência e segurança', () => {
  const report = buildShadowReport({
    state_events: [
      {
        cycle_id: 'a',
        generated_at: '2026-08-07T20:00:02Z',
        persisted_at: '2026-08-07T20:00:05Z',
        automatic_crm_write: false,
        automatic_agenda_write: false,
        execution: { model: 'gpt-test', attempts: 1, recovered_after_retry: false, usage: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500 } },
        normalized_output: { operational_suggestions: { crm: { recommended_status: 'negociacao' } } },
      },
      {
        cycle_id: 'b',
        generated_at: '2026-08-07T20:10:03Z',
        persisted_at: '2026-08-07T20:10:09Z',
        automatic_crm_write: false,
        automatic_agenda_write: false,
        execution: { model: 'gpt-test', attempts: 2, recovered_after_retry: true, usage: { input_tokens: 2000, output_tokens: 1000, total_tokens: 3000 } },
        normalized_output: { operational_suggestions: { crm: { recommended_status: 'respondeu' } } },
      },
    ],
    v1_notes: [
      { cycle_id: 'a', created_at: '2026-08-07T20:00:00Z', yolen_decision: { recommended_status: 'negociacao' } },
      { cycle_id: 'b', created_at: '2026-08-07T20:10:00Z', yolen_decision: { recommended_status: 'negociacao' } },
      { cycle_id: 'c', created_at: '2026-08-07T20:20:00Z', yolen_decision: { recommended_status: 'novo' } },
    ],
    input_usd_per_1m: 1,
    output_usd_per_1m: 2,
  })

  assert.deepEqual(report.totals, {
    v1_analyses: 3,
    v2_persisted_analyses: 2,
    paired_analyses: 2,
    v1_without_persisted_v2: 1,
    v2_without_matching_v1: 0,
  })
  assert.deepEqual(report.tokens, {
    input_tokens: 3000,
    output_tokens: 1500,
    total_tokens: 4500,
    measured_events: 2,
  })
  assert.equal(report.estimated_cost_usd, 0.006)
  assert.equal(report.persistence_latency_ms.average, 4500)
  assert.equal(report.persistence_latency_ms.p95, 6000)
  assert.deepEqual(report.retries, { retried_events: 1, recovered_events: 1 })
  assert.equal(report.crm_status_comparison.agreement_rate, 0.5)
  assert.equal(report.safety.passed, true)
})

test('relatório vazio não inventa métricas', () => {
  const report = buildShadowReport()
  assert.equal(report.totals.paired_analyses, 0)
  assert.equal(report.persistence_latency_ms.average, null)
  assert.equal(report.crm_status_comparison.agreement_rate, null)
  assert.equal(report.estimated_cost_usd, null)
})

test('relatório soma diagnóstico e comunicação sem perder a separação por camada', () => {
  const report = buildShadowReport({
    state_events: [
      {
        cycle_id: 'a',
        generated_at: '2026-08-07T20:00:02Z',
        persisted_at: '2026-08-07T20:00:05Z',
        automatic_crm_write: false,
        automatic_agenda_write: false,
        execution: {
          diagnostic: {
            model: 'gpt-diagnostic',
            attempts: 1,
            recovered_after_retry: false,
            usage: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500 },
          },
          communication: {
            model: 'gpt-communication',
            attempts: 2,
            recovered_after_retry: true,
            usage: { input_tokens: 300, output_tokens: 100, total_tokens: 400 },
          },
        },
        normalized_output: { operational_suggestions: { crm: { recommended_status: 'negociacao' } } },
      },
    ],
  })

  assert.deepEqual(report.tokens, {
    input_tokens: 1300,
    output_tokens: 600,
    total_tokens: 1900,
    measured_events: 1,
  })
  assert.deepEqual(report.layer_tokens.diagnostic, {
    input_tokens: 1000,
    output_tokens: 500,
    total_tokens: 1500,
    measured_events: 1,
  })
  assert.deepEqual(report.layer_tokens.communication, {
    input_tokens: 300,
    output_tokens: 100,
    total_tokens: 400,
    measured_events: 1,
  })
  assert.equal(report.models['diagnostic:gpt-diagnostic'], 1)
  assert.equal(report.models['communication:gpt-communication'], 1)
  assert.deepEqual(report.retries, { retried_events: 1, recovered_events: 1 })
})
