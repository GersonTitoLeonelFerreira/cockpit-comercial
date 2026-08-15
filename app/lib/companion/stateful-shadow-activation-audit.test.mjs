import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const routeSource = readFileSync(
  new URL(
    '../../api/companion/analyze-conversation/route.ts',
    import.meta.url,
  ),
  'utf8',
)

test(
  'analise operacional salva a decisao de ativacao do motor contextual para auditoria',
  () => {
    assert.match(
      routeSource,
      /resolveStatefulCopilotActivationGate/,
    )

    assert.match(
      routeSource,
      /stateful_activation:\s*getStatefulActivationAudit/,
    )

    assert.match(
      routeSource,
      /companyId:\s*tokenPayload\.company_id/,
    )
  },
)
