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
      '../../api/queues/companion-deep-analysis-v3/route.ts',
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
  // Fase 12A — V2 como único motor: toda chamada do Companion publica na
  // Queue do V2 — não existe mais nenhuma chamada V1
  // (analyzeConversationWithCopilotDetailed/generateSalesCoaching), nem
  // gate de modo ('v1'/'shadow'/'active') decidindo entre os dois. Se o
  // job não puder ser criado, a resposta é um erro explícito — sem
  // fallback para V1.
  'toda chamada publica V2 na Queue sem nunca chamar V1',
  () => {
    assert.match(
      routeSource,
      /await send\(/,
    )

    assert.match(
      routeSource,
      /STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC/,
    )

    assert.doesNotMatch(
      routeSource,
      /analyzeConversationWithCopilotDetailed/,
    )

    assert.doesNotMatch(
      routeSource,
      /generateSalesCoaching/,
    )

    assert.doesNotMatch(
      routeSource,
      /statefulRouteMode/,
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
      /"topic":\s*"companion-deep-analysis-v3"/,
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
