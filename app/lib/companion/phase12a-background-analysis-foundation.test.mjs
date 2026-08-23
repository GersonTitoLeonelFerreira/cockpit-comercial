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

const deadlineSource =
  readFileSync(
    new URL(
      './stateful-copilot-cycle-deadline.ts',
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

const responseTypeSource =
  readFileSync(
    new URL(
      '../../types/ai-sales.ts',
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
  '12A mantém 25s como guardrail legado e dá 120s somente ao V2 background',
  () => {
    assert.match(
      deadlineSource,
      /DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS\s*=\s*25_000/,
    )

    assert.match(
      backgroundJobSource,
      /STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS\s*=\s*120_000/,
    )

    assert.match(
      routeSource,
      /runStatefulCopilotBackgroundRuntime\s*=\s*createStatefulCopilotServerRuntimeOrchestrator\(\{[\s\S]*cycle_deadline_ms:\s*STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS/,
    )
  },
)

test(
  'active não aguarda V2 antes de responder ao vendedor',
  () => {
    const v1 =
      routeSource.indexOf(
        'const result = await analyzeConversationWithCopilotDetailed({',
      )

    const background =
      routeSource.indexOf(
        'runStatefulCopilotBackgroundRuntime({',
      )

    assert.ok(
      v1 >=
        0,
    )

    assert.ok(
      background >
        v1,
    )

    assert.match(
      routeSource,
      /statefulActiveBackgroundRequested\s*=\s*statefulRouteMode ===\s*'active'/,
    )

    assert.match(
      routeSource,
      /after\(async \(\) => \{[\s\S]*runStatefulCopilotBackgroundRuntime/,
    )

    assert.doesNotMatch(
      routeSource,
      /buildStatefulActiveResponseData/,
    )
  },
)

test(
  'first value active limita V1 a 8s e evita segunda IA de coaching',
  () => {
    assert.match(
      routeSource,
      /providerTimeoutMs:\s*statefulActiveBackgroundRequested\s*\?\s*8_000\s*:\s*undefined/,
    )

    assert.match(
      routeSource,
      /const coaching =\s*statefulActiveBackgroundRequested\s*\?\s*buildCompanionCoaching/,
    )
  },
)

test(
  'job fica isolado por company cycle conversation e watermark',
  () => {
    assert.match(
      routeSource,
      /company_id:\s*tokenPayload\.company_id/,
    )

    assert.match(
      routeSource,
      /cycle_id:\s*cycleId/,
    )

    assert.match(
      routeSource,
      /conversation_key:\s*conversationKey/,
    )

    assert.match(
      routeSource,
      /message_watermark:\s*messageSnapshotHash\s*\|\|\s*conversationHash/,
    )

    assert.match(
      migrationSource,
      /unique\s*\(\s*company_id,\s*cycle_id,\s*conversation_key,\s*message_watermark\s*\)/,
    )
  },
)

test(
  'background nunca autoriza escrita automática em CRM ou Agenda',
  () => {
    assert.match(
      migrationSource,
      /automatic_crm_write = false[\s\S]*automatic_agenda_write = false/,
    )

    assert.match(
      routeSource,
      /automatic_crm_write:\s*statefulResult\s*\.automatic_crm_write/,
    )

    assert.match(
      routeSource,
      /automatic_agenda_write:\s*statefulResult\s*\.automatic_agenda_write/,
    )
  },
)

test(
  'job server-side não fica acessível para anon ou authenticated',
  () => {
    assert.match(
      migrationSource,
      /to anon, authenticated[\s\S]*using\s*\(false\)[\s\S]*with check\s*\(false\)/,
    )

    assert.match(
      migrationSource,
      /grant[\s\S]*select,[\s\S]*insert,[\s\S]*update[\s\S]*to service_role/,
    )
  },
)

test(
  'resposta transporta somente identidade e status do job',
  () => {
    assert.match(
      responseTypeSource,
      /deep_analysis\?:\s*\{[\s\S]*analysis_job_id: string[\s\S]*message_watermark: string/,
    )

    assert.doesNotMatch(
      responseTypeSource,
      /deep_analysis\?:\s*\{[\s\S]*conversation_text/,
    )
  },
)
