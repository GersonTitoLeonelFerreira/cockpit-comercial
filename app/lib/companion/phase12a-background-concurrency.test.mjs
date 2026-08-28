import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const routeSource =
  readFileSync(
    new URL(
      '../../api/companion/analyze-conversation/route.ts',
      import.meta.url,
    ),
    'utf8',
  )

const workerSource =
  readFileSync(
    new URL(
      '../server/stateful-copilot-background-worker.ts',
      import.meta.url,
    ),
    'utf8',
  )

const jobSource =
  readFileSync(
    new URL(
      '../server/stateful-copilot-background-job.ts',
      import.meta.url,
    ),
    'utf8',
  )

const migrationSource =
  readFileSync(
    new URL(
      '../../../supabase/migrations/20260823001500_create_companion_background_analysis_jobs.sql',
      import.meta.url,
    ),
    'utf8',
  )

test(
  // Fase 12A — V2 como único motor: não existe mais chamada V1 nesta
  // rota. O snapshot de tempo (analysisRequestedAt) é capturado logo no
  // início do handler, antes de qualquer lookup, e usado como
  // requested_at do job em segundo plano do V2.
  'snapshot de tempo é capturado no início do handler, antes do job do V2',
  () => {
    const requestTime =
      routeSource.indexOf(
        'const analysisRequestedAt =',
      )

    const jobDescriptor =
      routeSource.indexOf(
        'buildStatefulCopilotBackgroundJobDescriptor({',
      )

    assert.ok(
      requestTime >= 0,
    )

    assert.ok(
      jobDescriptor >= 0,
    )

    assert.ok(
      requestTime < jobDescriptor,
    )

    assert.match(
      routeSource,
      /requested_at:\s*analysisRequestedAt/,
    )

    assert.doesNotMatch(
      routeSource,
      /analyzeConversationWithCopilotDetailed/,
    )
  },
)

test(
  'somente um job pode estar running por conversa',
  () => {
    assert.match(
      migrationSource,
      /create unique index\s+companion_background_analysis_jobs_one_running_per_conversation_idx[\s\S]*company_id,[\s\S]*cycle_id,[\s\S]*conversation_key[\s\S]*where\s+status = 'running'/,
    )
  },
)

test(
  'claim normal exige queued',
  () => {
    assert.match(
      workerSource,
      /claimQuery[\s\S]*\.eq\(\s*'status',\s*'queued'/,
    )
  },
)

test(
  'job running recente não pode executar outra vez',
  () => {
    assert.match(
      jobSource,
      /STATEFUL_COPILOT_BACKGROUND_RUNNING_LEASE_MS\s*=\s*210_000/,
    )

    assert.match(
      workerSource,
      /BACKGROUND_JOB_ALREADY_RUNNING/,
    )
  },
)

test(
  'job running abandonado pode ser reclamado pelo started_at exato',
  () => {
    assert.match(
      workerSource,
      /runningLeaseExpired/,
    )

    assert.match(
      workerSource,
      /\.eq\(\s*'started_at',\s*previousStartedAt/,
    )
  },
)

test(
  'conversa ocupada produz retry em vez de execução concorrente',
  () => {
    assert.match(
      workerSource,
      /claimJobError[\s\S]*23505[\s\S]*BACKGROUND_CONVERSATION_BUSY/,
    )
  },
)

test(
  'failed é terminal para redelivery duplicada',
  () => {
    assert.match(
      workerSource,
      /currentJob\.status ===\s*'failed'/,
    )
  },
)

test(
  'updates posteriores ao runtime pertencem ao claim atual',
  () => {
    const afterRuntime =
      workerSource.slice(
        workerSource.indexOf(
          'const runtimeStartedAt =',
        ),
      )

    const statusGuards =
      afterRuntime.match(
        /\.eq\(\s*'status',\s*'running'/g,
      ) ?? []

    const leaseGuards =
      afterRuntime.match(
        /\.eq\(\s*'started_at',\s*startedAt/g,
      ) ?? []

    assert.ok(
      statusGuards.length >= 5,
    )

    assert.equal(
      leaseGuards.length,
      statusGuards.length,
    )
  },
)

test(
  // A checagem de "newer job" original só roda ANTES de chamar o
  // modelo (runRuntime, injetável desde a FASE 13 Frente 1 — ver
  // StatefulCopilotBackgroundWorkerDependencies — mas sempre
  // runStatefulCopilotBackgroundRuntime em produção), que pode levar até
  // o cycle deadline. Sem uma revalidação entre o fim da chamada ao
  // modelo e a escrita de 'succeeded', um job A já obsoleto (um job B
  // mais novo foi enfileirado enquanto A rodava) poderia gravar
  // 'succeeded' e avançar candidate_state_version com uma interpretação
  // ultrapassada. Esta checagem precisa existir DEPOIS da chamada ao
  // runtime e ANTES da escrita 'succeeded'.
  'reexecuta a checagem de newer job entre o runtime e a escrita succeeded',
  () => {
    const runtimeCallIndex =
      workerSource.indexOf(
        'await runRuntime(',
      )

    const succeededWriteIndex =
      workerSource.indexOf(
        "status:\n              'succeeded',",
      )

    assert.ok(
      runtimeCallIndex >= 0,
    )

    assert.ok(
      succeededWriteIndex >= 0,
    )

    assert.ok(
      runtimeCallIndex <
        succeededWriteIndex,
    )

    const betweenRuntimeAndSuccess =
      workerSource.slice(
        runtimeCallIndex,
        succeededWriteIndex,
      )

    assert.match(
      betweenRuntimeAndSuccess,
      /newerJobBeforeSuccess/,
    )

    assert.match(
      betweenRuntimeAndSuccess,
      /\.gt\(\s*'requested_at',\s*job\.requested_at/,
    )

    assert.match(
      betweenRuntimeAndSuccess,
      /status:\s*\n?\s*'superseded'/,
    )
  },
)
