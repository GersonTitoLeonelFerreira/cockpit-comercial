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


test('clear escopado invalida a copy mas preserva CoachingDiagnosis canônico da conversa', () => {
  const start =
    sellerRuntime.indexOf(
      'function clearContext(payload)',
    )
  const end =
    sellerRuntime.indexOf(
      'function getState(context)',
      start,
    )
  const block =
    sellerRuntime.slice(
      start,
      end,
    )

  assert.notEqual(start, -1)
  assert.match(
    block,
    /stateByConversation\.delete\(requestKey\)/,
  )
  assert.doesNotMatch(
    block,
    /analysisViewModelByConversation\.delete\(requestKey\)/,
  )
  assert.match(
    block,
    /analysisViewModelByConversation\.clear\(\)/,
  )
})


test('geração em voo é descartada por revisão monotônica quando CoachingDiagnosis muda', () => {
  const start =
    sellerRuntime.indexOf(
      'async function requestGeneration()',
    )
  const end =
    sellerRuntime.indexOf(
      'const INSERT_FEEDBACK',
      start,
    )
  const block =
    sellerRuntime.slice(
      start,
      end,
    )

  assert.notEqual(start, -1)
  assert.match(
    block,
    /coachingRevisionAtStart/,
  )
  assert.match(
    block,
    /analysisViewModelByConversation[\s\S]*revision/,
  )
  assert.match(
    block,
    /=== coachingRevisionAtStart/,
  )
})


test('primeiro CoachingDiagnosis real invalida geração legada, mas baseline nulo não', () => {
  const start =
    sellerRuntime.indexOf(
      'function syncAnalysisViewModel(',
    )
  const end =
    sellerRuntime.indexOf(
      "document.addEventListener(\n    'input'",
      start,
    )
  const block =
    sellerRuntime.slice(
      start,
      end,
    )

  assert.notEqual(start, -1)
  assert.match(
    block,
    /coachingDiagnosis === null\s*\? null/,
  )
  assert.match(
    block,
    /const coachingChanged =\s*previous\s*\?/,
  )
  assert.match(
    block,
    /previous\.signature !==\s*signature/,
  )
  assert.match(
    block,
    /: signature !== null/,
  )
  assert.match(
    block,
    /status: 'idle'/,
  )
  assert.match(
    block,
    /message: null/,
  )
})


test('troca de empresa limpa caches seller-facing da MENSAGEM antes do novo render', () => {
  const start =
    coreRuntime.indexOf(
      'if (companyChanged) {',
    )
  const end =
    coreRuntime.indexOf(
      'state = {',
      start,
    )
  const block =
    coreRuntime.slice(
      start,
      end,
    )

  assert.notEqual(start, -1)
  assert.match(
    block,
    /messageController\.clear\(\)/,
  )
  assert.match(
    block,
    /conversationBoundary\.advanceBoundary/,
  )
})


test('perda de sessão e troca de vendedor limpam e recarregam o contexto privado da MENSAGEM', () => {
  const sessionStart =
    coreRuntime.indexOf(
      'async function loadYolenSession(options = {})',
    )
  const sessionEnd =
    coreRuntime.indexOf(
      'async function resolveCurrentLead',
      sessionStart,
    )
  const block =
    coreRuntime.slice(
      sessionStart,
      sessionEnd,
    )

  assert.notEqual(
    sessionStart,
    -1,
  )

  const lostSessionStart =
    block.indexOf(
      'if (!result?.ok || !result.payload?.ok) {',
    )
  const lostSessionEnd =
    block.indexOf(
      'const previousCompanyId',
      lostSessionStart,
    )
  const lostSessionBlock =
    block.slice(
      lostSessionStart,
      lostSessionEnd,
    )

  assert.match(
    lostSessionBlock,
    /messageController\.clear\(\)/,
  )

  const userChangeStart =
    block.indexOf(
      'const sessionUserChanged =',
    )
  const userChangeEnd =
    block.indexOf(
      'lastSessionUserId = nextUserId',
      userChangeStart,
    )
  const userChangeBlock =
    block.slice(
      userChangeStart,
      userChangeEnd,
    )

  assert.match(
    userChangeBlock,
    /messageController\.clear\(\)/,
  )

  const resolveAfterSessionStart =
    block.indexOf(
      'if (options.resolveLeadAfterLoad === true',
    )
  const resolveAfterSessionBlock =
    block.slice(
      resolveAfterSessionStart,
    )

  assert.match(
    resolveAfterSessionBlock,
    /companyChanged \|\|\s*sessionUserChanged \|\|\s*!wasConnected/,
  )
  assert.match(
    resolveAfterSessionBlock,
    /resolveCurrentLead\(\)/,
  )
  assert.match(
    resolveAfterSessionBlock,
    /runAutomaticContactLookup/,
  )
})


test('AnalysisViewModel ready ressincroniza CoachingDiagnosis com MENSAGEM após limpeza de boundary', () => {
  const start =
    analysisRuntime.indexOf(
      'const alreadyReady =',
    )
  const end =
    analysisRuntime.indexOf(
      'ctx.state = {',
      start,
    )
  const block =
    analysisRuntime.slice(
      start,
      end,
    )

  assert.notEqual(
    start,
    -1,
  )
  assert.match(
    block,
    /if \(alreadyReady && !force\)/,
  )
  assert.match(
    block,
    /ctx\.messageController[\s\S]*syncAnalysisViewModel/,
  )
  assert.match(
    block,
    /ctx\.state\.analysisViewModel\.data/,
  )
})


test('diagnóstico nulo preserva a assinatura baseline da geração em voo', () => {
  const start =
    sellerRuntime.indexOf(
      'async function requestGeneration()',
    )
  const end =
    sellerRuntime.indexOf(
      'const INSERT_FEEDBACK',
      start,
    )
  const generationBlock =
    sellerRuntime.slice(
      start,
      end,
    )

  const syncStart =
    sellerRuntime.indexOf(
      'function syncAnalysisViewModel(',
    )
  const syncEnd =
    sellerRuntime.indexOf(
      "document.addEventListener(\n    'input'",
      syncStart,
    )
  const syncBlock =
    sellerRuntime.slice(
      syncStart,
      syncEnd,
    )

  assert.match(
    generationBlock,
    /\?\.revision \?\? 0/,
  )
  assert.match(
    syncBlock,
    /coachingDiagnosis === null\s*\? null/,
  )
  assert.match(
    syncBlock,
    /signature !== null/,
  )
})


test('diagnóstico existente que desaparece invalida copy e loading anteriores', () => {
  const start =
    sellerRuntime.indexOf(
      'function syncAnalysisViewModel(',
    )
  const end =
    sellerRuntime.indexOf(
      "document.addEventListener(\n    'input'",
      start,
    )
  const block =
    sellerRuntime.slice(
      start,
      end,
    )

  assert.notEqual(
    start,
    -1,
  )
  assert.match(
    block,
    /previous\s*\? previous\.signature !==\s*signature\s*: signature !== null/,
  )
  assert.match(
    block,
    /status: 'idle'/,
  )
  assert.match(
    block,
    /message: null/,
  )
})


test('mudança A→B→A incrementa revisão e não revalida geração antiga', () => {
  const start =
    sellerRuntime.indexOf(
      'function syncAnalysisViewModel(',
    )
  const end =
    sellerRuntime.indexOf(
      "document.addEventListener(\n    'input'",
      start,
    )
  const block =
    sellerRuntime.slice(
      start,
      end,
    )

  assert.notEqual(
    start,
    -1,
  )
  assert.match(
    block,
    /const revision =\s*coachingChanged\s*\? \(previous\?\.revision \?\? 0\) \+ 1\s*: previous\?\.revision \?\? 0/,
  )
  assert.match(
    block,
    /revision,/,
  )
})


test('commitment_wait vira estado canônico sem mensagem e bloqueia fallback legado', () => {
  const helperStart =
    sellerRuntime.indexOf(
      'function isCanonicalNoMessageState(',
    )
  const presetsStart =
    sellerRuntime.indexOf(
      'function getPresets(',
    )
  const requestStart =
    sellerRuntime.indexOf(
      'async function requestGeneration()',
    )
  const renderStart =
    sellerRuntime.indexOf(
      'function renderComposer()',
    )

  assert.notEqual(
    helperStart,
    -1,
  )
  assert.match(
    sellerRuntime.slice(
      helperStart,
      presetsStart,
    ),
    /technique\.commitment_wait/,
  )

  const presetsBlock =
    sellerRuntime.slice(
      presetsStart,
      requestStart,
    )

  assert.match(
    presetsBlock,
    /isCanonicalNoMessageState/,
  )
  assert.match(
    presetsBlock,
    /return \[\]/,
  )

  const requestBlock =
    sellerRuntime.slice(
      requestStart,
      sellerRuntime.indexOf(
        'const INSERT_FEEDBACK',
        requestStart,
      ),
    )

  assert.match(
    requestBlock,
    /isCanonicalNoMessageState/,
  )
  assert.match(
    requestBlock,
    /status = 'no_message'/,
  )

  const renderBlock =
    sellerRuntime.slice(
      renderStart,
      sellerRuntime.indexOf(
        'const INTENT_FIELD_SELECTOR',
        renderStart,
      ),
    )

  assert.match(
    renderBlock,
    /canonicalNoMessage/,
  )
  assert.match(
    renderBlock,
    /A Yolen recomenda aguardar a resposta do cliente/,
  )
  assert.match(
    renderBlock,
    /A decisão comercial atual é aguardar/,
  )
})
