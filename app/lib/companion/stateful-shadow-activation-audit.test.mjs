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
  // Fase 12A — V2 stateful como único motor: a auditoria de qual modo de
  // ativação gerou uma decisão só existia porque V1 salvava seu resultado
  // em ai_coaching_notes e precisava registrar sob qual gate isso
  // aconteceu. Sem V1 nesta rota, não existe mais essa gravação nem esse
  // gate decidindo o motor — o Companion sempre cria o job do V2.
  'Companion não tem mais gate de ativação decidindo o motor, nem grava decisão V1 para auditoria',
  () => {
    assert.doesNotMatch(
      routeSource,
      /resolveStatefulCopilotActivationGate/,
    )

    assert.doesNotMatch(
      routeSource,
      /getStatefulActivationAudit/,
    )

    assert.doesNotMatch(
      routeSource,
      /ai_coaching_notes/,
    )

    assert.match(
      routeSource,
      /buildStatefulCopilotBackgroundJobDescriptor/,
    )
  },
)
