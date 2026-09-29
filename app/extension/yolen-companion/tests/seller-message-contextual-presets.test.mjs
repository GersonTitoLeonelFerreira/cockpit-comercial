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

const analysisRuntime = readFileSync(
  new URL(
    '../src/companion-analysis-controller.js',
    import.meta.url,
  ),
  'utf8',
)

const coreRuntime = readFileSync(
  new URL(
    '../src/companion-core.js',
    import.meta.url,
  ),
  'utf8',
)

test('atalhos priorizam coaching canônico e preservam seller_intents como fallback', () => {
  const coachingStart =
    sellerRuntime.indexOf(
      'function getCoachingPresets',
    )
  const presetsStart =
    sellerRuntime.indexOf(
      'function getPresets(',
    )
  const end =
    sellerRuntime.indexOf(
      'function shortPresetLabel',
      presetsStart,
    )
  const coachingBlock =
    sellerRuntime.slice(
      coachingStart,
      presetsStart,
    )
  const presetsBlock =
    sellerRuntime.slice(
      presetsStart,
      end,
    )

  assert.notEqual(coachingStart, -1)
  assert.notEqual(presetsStart, -1)
  assert.match(
    coachingBlock,
    /coaching_diagnosis/,
  )
  assert.match(
    coachingBlock,
    /technique\.contextual_reengagement/,
  )
  assert.match(
    coachingBlock,
    /microcompromisso/i,
  )
  assert.match(
    coachingBlock,
    /technique\.guided_choice/,
  )
  assert.match(
    presetsBlock,
    /getCoachingPresets/,
  )
  assert.match(
    presetsBlock,
    /guidance\?\.seller_intents/,
  )
  assert.match(
    presetsBlock,
    /\.slice\(0, 3\)/,
  )
  assert.match(
    presetsBlock,
    /if \(coaching\.length > 0\)/,
  )
  assert.match(
    presetsBlock,
    /if \(contextual\.length > 0\)/,
  )
  assert.doesNotMatch(
    presetsBlock,
    /stage\.includes\(/,
  )
})


test('ANÁLISE canônica alimenta MENSAGEM sem criar uma segunda decisão comercial', () => {
  assert.match(
    sellerRuntime,
    /function syncAnalysisViewModel/,
  )
  assert.match(
    sellerRuntime,
    /syncAnalysisViewModel,/,
  )
  assert.match(
    analysisRuntime,
    /ctx\.messageController[\s\S]*syncAnalysisViewModel/,
  )
  assert.match(
    coreRuntime,
    /get messageController\(\)[\s\S]*return messageController/,
  )
})
