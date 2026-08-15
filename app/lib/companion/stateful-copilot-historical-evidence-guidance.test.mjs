import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL(
    './stateful-copilot-execution-plan.ts',
    import.meta.url,
  ),
  'utf8',
)

test(
  'prompt contextual preserva memoria sem reutilizar evidencia historica como atual',
  () => {
    assert.match(
      source,
      /phase-5\.2-stateful-prompt-v5/,
    )

    assert.match(
      source,
      /quando uma conclusão continuar válida por causa de previous_state, cite os memory_ids correspondentes/,
    )

    assert.match(
      source,
      /Nunca copie evidence_message_ids históricos guardados dentro da memória para evidence_message_ids da saída/,
    )

    assert.match(
      source,
      /Se não houver sustentação na sessão temporal atual, evidence_message_ids deve ficar vazio nesse bloco/,
    )
  },
)
