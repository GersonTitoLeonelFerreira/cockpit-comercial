import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// STEP 2B.5-D1: getPresets() foi extraído de seller-message-runtime.js
// para o engine compartilhado companion-seller-message-engine.js (usado
// tanto por WhatsApp quanto por ManyChat) — a asserção passou a checar o
// arquivo onde a função realmente mora agora, preservando a MESMA
// garantia semântica de antes.
const sellerMessageEngine = readFileSync(
  new URL(
    '../src/companion-seller-message-engine.js',
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
  const start = sellerMessageEngine.indexOf(
    'function getPresets(guidance)',
  )
  const end = sellerMessageEngine.indexOf(
    'function shortPresetLabel',
    start,
  )
  const block = sellerMessageEngine.slice(start, end)

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
