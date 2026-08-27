import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sellerRuntime = readFileSync(
  new URL(
    '../src/seller-message-runtime.js',
    import.meta.url,
  ),
  'utf8',
)

const guidanceRuntime = readFileSync(
  new URL(
    '../src/lead-method-guidance-runtime.js',
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

test('orientação assíncrona concluída força rerender dos atalhos', () => {
  assert.match(
    guidanceRuntime,
    /YolenCompanionSellerMessageRuntime[\s\S]*?\.render\?\.\(\)/,
  )
})

test('not_applicable com próximo passo operacional usa renderer existente sem expor etapa comercial', () => {
  assert.match(
    guidanceRuntime,
    /guidance\?\.status === 'not_applicable'/,
  )
  assert.match(
    guidanceRuntime,
    /status: 'ready'/,
  )
  assert.match(
    guidanceRuntime,
    /method_name: null/,
  )
  assert.match(
    guidanceRuntime,
    /stage_name: null/,
  )
})
