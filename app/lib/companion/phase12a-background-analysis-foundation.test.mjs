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

const queueRouteSource =
  readFileSync(
    new URL(
      '../../api/queues/companion-deep-analysis/route.ts',
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

const backgroundJobSource =
  readFileSync(
    new URL(
      '../server/stateful-copilot-background-job.ts',
      import.meta.url,
    ),
    'utf8',
  )

const loaderSource =
  readFileSync(
    new URL(
      './stateful-copilot-real-context-loader.ts',
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

const vercelSource =
  readFileSync(
    new URL(
      '../../../vercel.json',
      import.meta.url,
    ),
    'utf8',
  )

const packageSource =
  readFileSync(
    new URL(
      '../../../package.json',
      import.meta.url,
    ),
    'utf8',
  )

test(
  // Fase 12A — V2 como único motor: o branch 'active' (empresa exposta ao
  // motor stateful) retorna a resposta e publica na Queue SEM nunca
  // alcançar a chamada V1 — não existe mais "V1 primeiro, V2 depois" nem
  // promoção de um resultado sobre o outro. O caminho v1/shadow (não
  // exposto) continua chamando V1 normalmente, mais abaixo no arquivo.
  'active publica V2 na Queue sem depender ou chamar o V1',
  () => {
    const activeBranchStart =
      routeSource.indexOf(
        'if (statefulActiveBackgroundRequested) {',
      )

    const v1 =
      routeSource.indexOf(
        'const result = await analyzeConversationWithCopilotDetailed({',
      )

    const publish =
      routeSource.indexOf(
        'await send(',
      )

    assert.ok(
      activeBranchStart >= 0,
    )

    assert.ok(
      v1 >= 0,
    )

    assert.ok(
      publish >= 0,
    )

    assert.ok(
      activeBranchStart < v1,
    )

    assert.ok(
      publish < v1,
    )

    assert.match(
      routeSource,
      /STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC/,
    )

    assert.doesNotMatch(
      routeSource,
      /runStatefulCopilotBackgroundRuntime/,
    )
  },
)

test(
  'Queue possui consumer push separado da request',
  () => {
    assert.match(
      packageSource,
      /"@vercel\/queue":\s*"0\.5\.0"/,
    )

    assert.match(
      queueRouteSource,
      /handleCallback/,
    )

    assert.match(
      vercelSource,
      /"type":\s*"queue\/v2beta"/,
    )

    assert.match(
      vercelSource,
      /"topic":\s*"companion-deep-analysis-v1"/,
    )
  },
)

test(
  'consumer possui 180s e V2 interno possui 120s',
  () => {
    assert.match(
      queueRouteSource,
      /maxDuration\s*=\s*180/,
    )

    assert.match(
      backgroundJobSource,
      /STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS\s*=\s*120_000/,
    )

    assert.match(
      workerSource,
      /cycle_deadline_ms:\s*STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS/,
    )
  },
)

test(
  'fotografia stateful é congelada pelo observed_at',
  () => {
    assert.match(
      workerSource,
      /reference_time:\s*job\.requested_at/,
    )

    assert.match(
      loaderSource,
      /\.lte\(\s*'observed_at',\s*referenceTime/,
    )
  },
)

test(
  'job antigo pode ser superseded',
  () => {
    assert.match(
      workerSource,
      /\.gt\(\s*'requested_at',\s*job\.requested_at/,
    )

    assert.match(
      workerSource,
      /status:\s*'superseded'/,
    )
  },
)

test(
  'publicação usa idempotency key e retention',
  () => {
    assert.match(
      routeSource,
      /idempotencyKey:\s*backgroundJob\s*\.analysis_job_id/,
    )

    assert.match(
      routeSource,
      /retentionSeconds:/,
    )
  },
)

test(
  'background permanece fail closed para CRM e Agenda',
  () => {
    assert.match(
      migrationSource,
      /automatic_crm_write = false[\s\S]*automatic_agenda_write = false/,
    )

    assert.match(
      workerSource,
      /AUTOMATIC_WRITE_SAFETY_VIOLATION/,
    )
  },
)

test(
  'job e Queue não transportam conteúdo da conversa',
  () => {
    assert.doesNotMatch(
      backgroundJobSource,
      /conversation_text/,
    )

    assert.doesNotMatch(
      backgroundJobSource,
      /suggested_message/,
    )

    assert.doesNotMatch(
      migrationSource,
      /conversation_text/,
    )
  },
)
