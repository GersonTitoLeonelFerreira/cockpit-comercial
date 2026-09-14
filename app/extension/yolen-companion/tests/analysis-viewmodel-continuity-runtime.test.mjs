import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL(
    '../src/phase16-9-runtime-guard.js',
    import.meta.url,
  ),
  'utf8',
)

test(
  'falha de refresh não mascara último AnalysisViewModel canônico válido',
  () => {
    assert.match(
      source,
      /function installAnalysisViewModelContinuity\(\)/,
    )
    assert.match(
      source,
      /api\.loadAnalysisViewModel\s*=\s*\n?\s*loadAnalysisViewModelWithContinuity/,
    )
    assert.match(
      source,
      /result\?\.ok === true[\s\S]*result\?\.payload\?\.ok === true[\s\S]*cachedAnalysisView =/,
    )
    assert.match(
      source,
      /data-yolen-analysis-refresh-warning/,
    )
    assert.match(
      source,
      /Exibindo a última leitura comercial válida\./,
    )
    assert.match(
      source,
      /reconcileAnalysisViewModelContinuity\(\)/,
    )
  },
)

test(
  'continuidade é isolada por ciclo e conversa e não reintroduz wrapper de retry',
  () => {
    assert.match(
      source,
      /return `\$\{cycleId\}::\$\{conversationKey\}`/,
    )
    assert.match(
      source,
      /cachedAnalysisView\.key !==\s*\n?\s*latestAnalysisViewRequestKey/,
    )
    assert.doesNotMatch(
      source,
      /api\.analyzeConversation\s*=/,
    )
    assert.doesNotMatch(
      source,
      /api\.getAnalysisJobStatus\s*=/,
    )
  },
)
