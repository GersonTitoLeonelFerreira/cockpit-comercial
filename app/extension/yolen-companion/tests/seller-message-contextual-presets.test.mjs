import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// FASE 5: o runtime de mensagem virou o controller de MENSAGEM do Core.
// Os testes do runtime legado de orientação (lead-method-guidance-runtime.js,
// ausente de qualquer manifest desde a FASE 16.9 e removido na FASE 5)
// saíram junto com o módulo.
const sellerRuntime = readFileSync(
  new URL(
    '../src/companion-message-controller.js',
    import.meta.url,
  ),
  'utf8',
)

test('atalhos priorizam seller_intents contextuais e limitam a três opções', () => {
  const start = sellerRuntime.indexOf(
    'function getPresets(guidance)',
  )
  const end = sellerRuntime.indexOf(
    'function shortPresetLabel',
    start,
  )
  const block = sellerRuntime.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(block, /guidance\?\.seller_intents/)
  assert.match(block, /\.slice\(0, 3\)/)
  assert.match(block, /if \(contextual\.length > 0\)/)
  assert.doesNotMatch(block, /stage\.includes\(/)
  assert.doesNotMatch(block, /avançar para uma proposta/i)
  assert.doesNotMatch(block, /principal dúvida ou objeção/i)
})
