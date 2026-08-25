import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

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

const routeSource =
  readFileSync(
    new URL(
      '../../api/companion/analyze-conversation/route.ts',
      import.meta.url,
    ),
    'utf8',
  )

const salesCopilotSource =
  readFileSync(
    new URL(
      '../ai/sales-copilot.ts',
      import.meta.url,
    ),
    'utf8',
  )

const salesCoachingSource =
  readFileSync(
    new URL(
      '../ai/sales-coaching.ts',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'guardrail stateful padrão permanece em 25s',
  () => {
    assert.match(
      deadlineSource,
      /DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS\s*=\s*25_000/,
    )
  },
)

test(
  'background profundo possui orçamento separado de 120s',
  () => {
    assert.match(
      backgroundJobSource,
      /STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS\s*=\s*120_000/,
    )
  },
)

test(
  // Fase 12A — V2 como único motor: 'active' não chama mais V1 (nem com
  // teto de 8s, nem de nenhuma outra forma) — o branch retorna antes de
  // alcançar a chamada V1. O teto de 8s que existia só para o caminho
  // rápido V1 dentro do modo active não existe mais.
  'V1 nunca é chamado no branch active — retorna antes de alcançar analyzeConversationWithCopilotDetailed',
  () => {
    const activeBranchStart =
      routeSource.indexOf(
        'if (statefulActiveBackgroundRequested) {',
      )

    const v1Call =
      routeSource.indexOf(
        'const result = await analyzeConversationWithCopilotDetailed({',
      )

    assert.ok(
      activeBranchStart >= 0,
    )

    assert.ok(
      v1Call >= 0,
    )

    assert.ok(
      activeBranchStart < v1Call,
    )

    assert.doesNotMatch(
      routeSource,
      /providerTimeoutMs:\s*8_000/,
    )

    assert.match(
      salesCopilotSource,
      /AbortSignal\.timeout\(\s*providerTimeoutMs/,
    )
  },
)

test(
  'V1 fora do modo active também tem teto — as duas chamadas de IA sequenciais não ficam sem limite',
  () => {
    assert.match(
      routeSource,
      /const V1_COMPANION_AI_CALL_TIMEOUT_MS\s*=\s*25_000/,
    )

    assert.match(
      salesCoachingSource,
      /AbortSignal\.timeout\(\s*providerTimeoutMs/,
    )
  },
)

test(
  // Antes, 'active' pulava a segunda chamada de IA (coaching) só para o
  // caminho rápido V1. Agora 'active' não faz nenhuma chamada de IA
  // síncrona — a pergunta não é mais "pula qual chamada", é "V1 sequer
  // roda" (coberto pelo teste acima).
  'branch active não referencia mais o desvio de coaching específico do V1 rápido',
  () => {
    assert.doesNotMatch(
      routeSource,
      /statefulActiveBackgroundRequested\s*\?\s*buildCompanionCoaching/,
    )
  },
)

test(
  'request seller-facing não executa runtime V2 profundo',
  () => {
    assert.doesNotMatch(
      routeSource,
      /runStatefulCopilotBackgroundRuntime/,
    )

    assert.match(
      routeSource,
      /await send\(/,
    )
  },
)
