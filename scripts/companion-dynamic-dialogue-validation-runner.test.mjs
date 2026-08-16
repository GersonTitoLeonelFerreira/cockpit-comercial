import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const runnerSource =
  await readFile(
    new URL(
      './companion-dynamic-dialogue-validation-runner.mjs',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'juiz respeita alternativas permitidas pelo cenário',
  () => {
    assert.match(
      runnerSource,
      /scenario\.expected_behavior como o envelope normativo/,
    )

    assert.match(
      runnerSource,
      /hard gate tiver valor null, ele não impõe uma escolha específica/,
    )

    assert.match(
      runnerSource,
      /Não reprove um comportamento que scenario\.expected_behavior declare explicitamente como aceitável/,
    )
  },
)
