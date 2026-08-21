import {
  extractManagerialEvidence,
  type ExtractManagerialEvidenceArgs,
  type ManagerialEvidenceExtraction,
} from './managerial-evidence-extractor'
import {
  assembleManagerialIntelligence,
  type ManagerialIntelligenceAssemblyScope,
} from './managerial-intelligence-assembler'
import type { ManagerialIntelligence } from './managerial-intelligence-contract'

export type BuildHardenedManagerialIntelligenceArgs = ExtractManagerialEvidenceArgs & {
  scope: ManagerialIntelligenceAssemblyScope
  reference_time: unknown
}

export class ManagerialIntelligenceHardeningError extends Error {
  readonly code: string
  readonly path: string

  constructor(code: string, path: string, message: string) {
    super(message)
    this.name = 'ManagerialIntelligenceHardeningError'
    this.code = code
    this.path = path
  }
}

function fail(code: string, path: string, message: string): never {
  throw new ManagerialIntelligenceHardeningError(code, path, message)
}

const RFC3339_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/

function canonicalInstant(value: unknown, path: string) {
  if (typeof value !== 'string' || !RFC3339_INSTANT.test(value.trim())) {
    fail(
      'NON_CANONICAL_TIME',
      path,
      `${path} precisa ser um instante RFC3339 com timezone explícito.`,
    )
  }

  const normalized = value.trim()
  const epoch = Date.parse(normalized)
  if (!Number.isFinite(epoch)) {
    fail('INVALID_TIME', path, `${path} possui horário inválido.`)
  }

  return {
    canonical: new Date(epoch).toISOString(),
    epoch_ms: epoch,
    source_date: normalized.slice(0, 10),
  }
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort()
}

function sameStrings(left: string[], right: string[]) {
  const a = uniqueSorted(left)
  const b = uniqueSorted(right)
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function ensureNotFuture(canonical: string, referenceEpoch: number, path: string) {
  if (Date.parse(canonical) > referenceEpoch) {
    fail(
      'FUTURE_EVIDENCE',
      path,
      `${path} não pode estar no futuro em relação a reference_time.`,
    )
  }
}

function ensureUniqueIds(values: string[], path: string) {
  if (new Set(values).size !== values.length) {
    fail('DUPLICATE_EVIDENCE_ID', path, `${path} possui identificadores duplicados.`)
  }
}

function ensureDeclaredIdsMatch(declared: string[], actual: string[], path: string) {
  if (!sameStrings(declared, actual)) {
    fail(
      'DECLARED_PROVENANCE_MISMATCH',
      path,
      `${path} diverge dos identificadores realmente presentes no handoff.`,
    )
  }
}

function ensureCoverageCounters(extraction: ManagerialEvidenceExtraction) {
  const expected = {
    analysis_events_received:
      extraction.commercial_reading_coverage.length +
      extraction.excluded_analysis_events.length,
    commercial_reading_events_compatible: extraction.commercial_reading_coverage.length,
    commercial_reading_events_excluded: extraction.excluded_analysis_events.length,
    seller_attributed_commercial_reading_events: extraction.commercial_reading_coverage.filter(
      item => item.seller_user_id !== null,
    ).length,
    action_events: extraction.action_facts.length,
    cycle_events: extraction.cycle_facts.length,
    cycle_snapshots: extraction.cycle_snapshots.length,
  }

  if (
    extraction.coverage.analysis_events_received !== expected.analysis_events_received ||
    extraction.coverage.commercial_reading_events_compatible !==
      expected.commercial_reading_events_compatible ||
    extraction.coverage.commercial_reading_events_excluded !==
      expected.commercial_reading_events_excluded ||
    extraction.coverage.seller_attributed_commercial_reading_events !==
      expected.seller_attributed_commercial_reading_events ||
    extraction.coverage.action_events !== expected.action_events ||
    extraction.coverage.cycle_events !== expected.cycle_events ||
    extraction.coverage.cycle_snapshots !== expected.cycle_snapshots
  ) {
    fail(
      'COVERAGE_COUNTER_MISMATCH',
      'extraction.coverage',
      'Contadores de cobertura divergem das fontes preservadas.',
    )
  }
}

export function hardenManagerialEvidenceExtraction(
  extraction: ManagerialEvidenceExtraction,
  referenceTime: unknown,
): ManagerialEvidenceExtraction {
  const reference = canonicalInstant(referenceTime, 'reference_time')

  const coverage = extraction.commercial_reading_coverage
    .map((item, index) => {
      const path = `extraction.commercial_reading_coverage[${index}].occurred_at`
      const occurred = canonicalInstant(item.occurred_at, path)
      ensureNotFuture(occurred.canonical, reference.epoch_ms, path)
      return {
        ...item,
        occurred_at: occurred.canonical,
        analysis_limitations: uniqueSorted([...item.analysis_limitations]),
      }
    })
    .sort((a, b) => a.analysis_event_id.localeCompare(b.analysis_event_id))

  ensureUniqueIds(
    coverage.map(item => item.analysis_event_id),
    'extraction.commercial_reading_coverage',
  )
  const coverageById = new Map(coverage.map(item => [item.analysis_event_id, item] as const))

  const semanticEvidence = extraction.semantic_evidence
    .map((item, index) => {
      const path = `extraction.semantic_evidence[${index}]`
      const occurred = canonicalInstant(item.occurred_at, `${path}.occurred_at`)
      ensureNotFuture(occurred.canonical, reference.epoch_ms, `${path}.occurred_at`)
      const source = coverageById.get(item.analysis_event_id)

      if (!source) {
        fail(
          'SEMANTIC_PROVENANCE_MISSING',
          `${path}.analysis_event_id`,
          'Evidência semântica sem cobertura A4 correspondente.',
        )
      }

      if (
        item.cycle_id !== source.cycle_id ||
        item.seller_user_id !== source.seller_user_id ||
        occurred.canonical !== source.occurred_at ||
        item.analysis_status !== source.analysis_status ||
        !sameStrings(item.analysis_limitations, source.analysis_limitations)
      ) {
        fail(
          'SEMANTIC_PROVENANCE_MISMATCH',
          path,
          'Evidência semântica diverge da leitura A4 que declara como origem.',
        )
      }

      return {
        ...item,
        occurred_at: occurred.canonical,
        analysis_limitations: uniqueSorted([...item.analysis_limitations]),
        evidence_message_ids: uniqueSorted([...item.evidence_message_ids]),
        memory_ids: uniqueSorted([...item.memory_ids]),
      }
    })
    .sort(
      (a, b) =>
        a.semantic_key.localeCompare(b.semantic_key) ||
        a.cycle_id.localeCompare(b.cycle_id) ||
        a.analysis_event_id.localeCompare(b.analysis_event_id),
    )

  const actionFacts = extraction.action_facts
    .map((item, index) => {
      const path = `extraction.action_facts[${index}].occurred_at`
      const occurred = canonicalInstant(item.occurred_at, path)
      ensureNotFuture(occurred.canonical, reference.epoch_ms, path)
      return { ...item, occurred_at: occurred.canonical }
    })
    .sort((a, b) => a.action_event_id.localeCompare(b.action_event_id))
  ensureUniqueIds(
    actionFacts.map(item => item.action_event_id),
    'extraction.action_facts',
  )

  const cycleFacts = extraction.cycle_facts
    .map((item, index) => {
      const path = `extraction.cycle_facts[${index}].occurred_at`
      const occurred = canonicalInstant(item.occurred_at, path)
      ensureNotFuture(occurred.canonical, reference.epoch_ms, path)
      return { ...item, occurred_at: occurred.canonical }
    })
    .sort((a, b) => a.cycle_event_id.localeCompare(b.cycle_event_id))
  ensureUniqueIds(
    cycleFacts.map(item => item.cycle_event_id),
    'extraction.cycle_facts',
  )

  const cycleSnapshots = extraction.cycle_snapshots
    .map((item, index) => {
      const path = `extraction.cycle_snapshots[${index}].updated_at`
      const updated = canonicalInstant(item.updated_at, path)
      ensureNotFuture(updated.canonical, reference.epoch_ms, path)
      return { ...item, updated_at: updated.canonical }
    })
    .sort((a, b) => a.cycle_id.localeCompare(b.cycle_id))
  ensureUniqueIds(
    cycleSnapshots.map(item => item.cycle_id),
    'extraction.cycle_snapshots',
  )

  const exclusions = extraction.excluded_analysis_events
    .map(item => ({ ...item }))
    .sort((a, b) => a.analysis_event_id.localeCompare(b.analysis_event_id))
  ensureUniqueIds(
    exclusions.map(item => item.analysis_event_id),
    'extraction.excluded_analysis_events',
  )
  for (const item of exclusions) {
    if (coverageById.has(item.analysis_event_id)) {
      fail(
        'ANALYSIS_PROVENANCE_CONFLICT',
        'extraction.excluded_analysis_events',
        `${item.analysis_event_id} não pode ser simultaneamente cobertura válida e exclusão.`,
      )
    }
  }

  const sourceLimitations = extraction.source_limitations
    .map((item, index) => {
      const source = coverageById.get(item.analysis_event_id)
      if (!source || item.cycle_id !== source.cycle_id || source.seller_user_id !== null) {
        fail(
          'SOURCE_LIMITATION_PROVENANCE_MISMATCH',
          `extraction.source_limitations[${index}]`,
          'Limitação de fonte não corresponde à cobertura A4 declarada.',
        )
      }
      return {
        ...item,
        skipped_dimensions: uniqueSorted([...item.skipped_dimensions]) as typeof item.skipped_dimensions,
      }
    })
    .sort((a, b) => a.analysis_event_id.localeCompare(b.analysis_event_id))
  ensureUniqueIds(
    sourceLimitations.map(item => item.analysis_event_id),
    'extraction.source_limitations',
  )

  const hardened: ManagerialEvidenceExtraction = {
    ...extraction,
    coverage: { ...extraction.coverage },
    commercial_reading_coverage: coverage,
    semantic_evidence: semanticEvidence,
    action_facts: actionFacts,
    cycle_facts: cycleFacts,
    cycle_snapshots: cycleSnapshots,
    excluded_analysis_events: exclusions,
    source_limitations: sourceLimitations,
    analysis_event_ids: uniqueSorted([...extraction.analysis_event_ids]),
    action_event_ids: uniqueSorted([...extraction.action_event_ids]),
    cycle_event_ids: uniqueSorted([...extraction.cycle_event_ids]),
    commercial_reading_cycle_ids: uniqueSorted([...extraction.commercial_reading_cycle_ids]),
    commercial_reading_seller_user_ids: uniqueSorted([
      ...extraction.commercial_reading_seller_user_ids,
    ]),
    cycle_ids: uniqueSorted([...extraction.cycle_ids]),
    seller_user_ids: uniqueSorted([...extraction.seller_user_ids]),
  }

  ensureCoverageCounters(hardened)
  ensureDeclaredIdsMatch(
    hardened.analysis_event_ids,
    coverage.map(item => item.analysis_event_id),
    'extraction.analysis_event_ids',
  )
  ensureDeclaredIdsMatch(
    hardened.action_event_ids,
    actionFacts.map(item => item.action_event_id),
    'extraction.action_event_ids',
  )
  ensureDeclaredIdsMatch(
    hardened.cycle_event_ids,
    cycleFacts.map(item => item.cycle_event_id),
    'extraction.cycle_event_ids',
  )
  ensureDeclaredIdsMatch(
    hardened.commercial_reading_cycle_ids,
    coverage.map(item => item.cycle_id),
    'extraction.commercial_reading_cycle_ids',
  )
  ensureDeclaredIdsMatch(
    hardened.commercial_reading_seller_user_ids,
    coverage.flatMap(item => (item.seller_user_id ? [item.seller_user_id] : [])),
    'extraction.commercial_reading_seller_user_ids',
  )

  return hardened
}

export function buildHardenedManagerialIntelligence(
  args: BuildHardenedManagerialIntelligenceArgs,
): ManagerialIntelligence {
  const reference = canonicalInstant(args.reference_time, 'reference_time')

  if (typeof args.scope?.period_end === 'string' && args.scope.period_end > reference.source_date) {
    fail(
      'PERIOD_IN_FUTURE',
      'scope.period_end',
      'O período não pode avançar além da data local declarada em reference_time.',
    )
  }

  const extraction = extractManagerialEvidence({
    expected_company_id: args.expected_company_id,
    commercial_reading_events: args.commercial_reading_events,
    action_events: args.action_events,
    cycle_events: args.cycle_events,
    cycle_snapshots: args.cycle_snapshots,
  })

  return assembleManagerialIntelligence({
    extraction: hardenManagerialEvidenceExtraction(extraction, reference.canonical),
    scope: args.scope,
    reference_time: reference.canonical,
  })
}
