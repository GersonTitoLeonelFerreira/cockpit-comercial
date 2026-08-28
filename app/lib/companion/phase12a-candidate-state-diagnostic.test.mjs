import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const runtime =
  fs.readFileSync(
    new URL(
      '../server/stateful-copilot-runtime-orchestrator.ts',
      import.meta.url,
    ),
    'utf8',
  )

const worker =
  fs.readFileSync(
    new URL(
      '../server/stateful-copilot-background-worker.ts',
      import.meta.url,
    ),
    'utf8',
  )

// FASE 13 Frente 1 — a leitura de state_failure_path/state_failure_invariant
// saiu do corpo do worker e passou para
// resolveStatefulCopilotBackgroundFailureOutcome (stateful-copilot-
// background-job.ts), a única função que agora decide o desfecho
// (failure_code/retryable) de um resultado stateful não-'active'. O worker
// continua consumindo esse diagnóstico — só não lê mais os campos
// diretamente, delega para essa função. Ver
// stateful-copilot-background-job.test.mjs para a cobertura de
// comportamento real desta função (inclusive o caso que este arquivo não
// cobria: `failure` null por conflito de persistência, que antes virava
// falha genérica não-retryable). Esse defeito é compatível com a assinatura
// genérica observada historicamente, mas os logs antigos não permitem
// atribuir retrospectivamente um incidente específico ao conflito de CAS.
const backgroundJob =
  fs.readFileSync(
    new URL(
      '../server/stateful-copilot-background-job.ts',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'candidate state preserva diagnóstico seguro até o background job',
  () => {
    assert.match(
      runtime,
      /state_failure_path\?:/,
    )

    assert.match(
      runtime,
      /state_failure_invariant\?:/,
    )

    assert.match(
      runtime,
      /details\s*\?\.state_failure_path/,
    )

    assert.match(
      runtime,
      /details\s*\?\.state_failure_invariant/,
    )

    assert.match(
      backgroundJob,
      /failure\.state_failure_path/,
    )

    assert.match(
      backgroundJob,
      /failure\.state_failure_invariant/,
    )

    assert.match(
      worker,
      /resolveStatefulCopilotBackgroundFailureOutcome/,
    )
  },
)
