import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript = readFileSync(
  new URL(
    '../src/content-script.js',
    import.meta.url,
  ),
  'utf8',
)

test('funções de ingestão permanecem no escopo principal do content script', () => {
  const structuredMessagesIndex =
    contentScript.indexOf(
      '  function getStructuredMessagesForAnalysis(',
    )

  const clearTimerIndex =
    contentScript.indexOf(
      '  function clearCaptureIngestionTimer()',
    )

  const runIngestionIndex =
    contentScript.indexOf(
      '  async function runCaptureIngestion()',
    )

  const scheduleIngestionIndex =
    contentScript.indexOf(
      '  function scheduleCaptureIngestion(',
    )

  const conversationTextIndex =
    contentScript.indexOf(
      '  function buildConversationTextFromMessages(',
    )

  assert.notEqual(
    structuredMessagesIndex,
    -1,
  )

  assert.notEqual(
    clearTimerIndex,
    -1,
  )

  assert.notEqual(
    runIngestionIndex,
    -1,
  )

  assert.notEqual(
    scheduleIngestionIndex,
    -1,
  )

  assert.notEqual(
    conversationTextIndex,
    -1,
  )

  assert.ok(
    structuredMessagesIndex <
      clearTimerIndex,
  )

  assert.ok(
    clearTimerIndex <
      runIngestionIndex,
  )

  assert.ok(
    runIngestionIndex <
      scheduleIngestionIndex,
  )

  assert.ok(
    scheduleIngestionIndex <
      conversationTextIndex,
  )

  const structuredFunctionEnding =
    contentScript.slice(
      structuredMessagesIndex,
      clearTimerIndex,
    )

  assert.match(
    structuredFunctionEnding,
    /\n  }\n\n$/,
  )

  assert.equal(
    contentScript.includes(
      '\n    function clearCaptureIngestionTimer()',
    ),
    false,
  )
})

test('limita o texto somente ao preparar mensagens para análise', () => {
    const structuredMessagesStart =
      contentScript.indexOf(
        '  function getStructuredMessagesForAnalysis(',
      )

    const structuredMessagesEnd =
      contentScript.indexOf(
        '\n  function clearCaptureIngestionTimer()',
        structuredMessagesStart,
      )

    assert.notEqual(
      structuredMessagesStart,
      -1,
    )

    assert.notEqual(
      structuredMessagesEnd,
      -1,
    )

    const structuredMessagesBlock =
      contentScript.slice(
        structuredMessagesStart,
        structuredMessagesEnd,
      )

    assert.match(
      structuredMessagesBlock,
      /prepareCapturedMessageTextForAnalysis/,
    )

    assert.doesNotMatch(
      structuredMessagesBlock,
      /text:\s*message\.text,/,
    )
  })

  test('materializa o instante da observação antes do retry', () => {
    const buildPlanStart =
      contentScript.indexOf(
        '  function buildCurrentCapturePlan()',
      )

    const buildPlanEnd =
      contentScript.indexOf(
        '\n  function rememberSuccessfulCapture(',
        buildPlanStart,
      )

    assert.notEqual(
      buildPlanStart,
      -1,
    )

    assert.notEqual(
      buildPlanEnd,
      -1,
    )

    const buildPlanBlock =
      contentScript.slice(
        buildPlanStart,
        buildPlanEnd,
      )

    assert.match(
      buildPlanBlock,
      /observedAt:\s*new Date\(\)\.toISOString\(\)/,
    )

    const runIngestionStart =
      contentScript.indexOf(
        '  async function runCaptureIngestion()',
      )

    const runIngestionEnd =
      contentScript.indexOf(
        '\n  function schedulePendingCaptureIngestion(',
        runIngestionStart,
      )

    const retryBlock =
      contentScript.slice(
        runIngestionStart,
        runIngestionEnd,
      )

    assert.doesNotMatch(
      retryBlock,
      /observedAt:\s*new Date/,
    )
  })

test('observador agenda a ingestão depois de atualizar o ledger', () => {
  const observerStart =
    contentScript.indexOf(
      '  function observeWhatsAppChanges()',
    )

  const observerEnd =
    contentScript.indexOf(
      '\n  observeWhatsAppChanges.timeoutId = 0',
      observerStart,
    )

  assert.notEqual(
    observerStart,
    -1,
  )

  assert.notEqual(
    observerEnd,
    -1,
  )

  const observerBlock =
    contentScript.slice(
      observerStart,
      observerEnd,
    )

  const refreshIndex =
    observerBlock.indexOf(
      'refreshConversationSnapshot()',
    )

  const pendingMessageIndex =
    observerBlock.indexOf(
      'checkPendingSuggestedMessageSentFromConversation()',
    )

  const ingestionIndex =
    observerBlock.indexOf(
      'scheduleCaptureIngestion()',
    )

  assert.notEqual(
    refreshIndex,
    -1,
  )

  assert.notEqual(
    pendingMessageIndex,
    -1,
  )

  assert.notEqual(
    ingestionIndex,
    -1,
  )

  assert.ok(
    refreshIndex <
      pendingMessageIndex,
  )

  assert.ok(
    pendingMessageIndex <
      ingestionIndex,
  )
})

test('captura usa corpo selecionável e chave estável', () => {
    const reliableMessageStart =
      contentScript.indexOf(
        '  function buildReliableMessageFromNode(',
      )

    const deletedMessageStart =
      contentScript.indexOf(
        '  function buildDeletedMessageSnapshotFromNode(',
        reliableMessageStart,
      )

    assert.notEqual(
      reliableMessageStart,
      -1,
    )

    assert.notEqual(
      deletedMessageStart,
      -1,
    )

    const reliableMessageBlock =
      contentScript.slice(
        reliableMessageStart,
        deletedMessageStart,
      )

    assert.match(
      reliableMessageBlock,
      /getCapturedMessageBodyText\(\s*node,\s*\)/,
    )

    assert.doesNotMatch(
      reliableMessageBlock,
      /node\.textContent/,
    )

    assert.match(
      contentScript,
      /buildStableCaptureConversationKey/,
    )

    const stableConversationKeyUses =
      contentScript.match(
        /const conversationKey =\s*getCaptureConversationKey\(\)/g,
      ) || []

      assert.equal(
        stableConversationKeyUses.length,
        1,
      )
  })

  test('direção usa o contêiner visual atual do WhatsApp', () => {
    const directionStart =
      contentScript.indexOf(
        '  function isOutgoingMessageNode(',
      )

    const directionEnd =
      contentScript.indexOf(
        '\n  function getLatestOutgoingVisibleMessageText(',
        directionStart,
      )

    assert.notEqual(
      directionStart,
      -1,
    )

    assert.notEqual(
      directionEnd,
      -1,
    )

    const directionBlock =
      contentScript.slice(
        directionStart,
        directionEnd,
      )

    assert.match(
      directionBlock,
      /\[data-testid="msg-container"\]/,
    )

    assert.match(
      directionBlock,
      /getBoundingClientRect/,
    )

    assert.match(
      directionBlock,
      /inferCapturedMessageDirection/,
    )
  })

  test('restauração de transcrições agenda ingestão no escopo correto', () => {
    const restoreStart =
      contentScript.indexOf(
        '  async function loadSavedAudioTranscriptionsForCurrentCycle()',
      )

    const restoreEnd =
      contentScript.indexOf(
        '\n  async function resolveCurrentLead()',
        restoreStart,
      )

    const manualSendStart =
      contentScript.indexOf(
        '  async function registerManualSuggestedMessageSend(',
      )

    const manualSendEnd =
      contentScript.indexOf(
        '\n  function checkPendingSuggestedMessageSentFromConversation()',
        manualSendStart,
      )

    assert.notEqual(
      restoreStart,
      -1,
    )

    assert.notEqual(
      restoreEnd,
      -1,
    )

    assert.notEqual(
      manualSendStart,
      -1,
    )

    assert.notEqual(
      manualSendEnd,
      -1,
    )

    const restoreBlock =
      contentScript.slice(
        restoreStart,
        restoreEnd,
      )

    const manualSendBlock =
      contentScript.slice(
        manualSendStart,
        manualSendEnd,
      )

    assert.match(
      restoreBlock,
      /if \(restoredCount > 0\)/,
    )

    assert.doesNotMatch(
      manualSendBlock,
      /restoredCount/,
    )
  })

  test('ingestão preserva mutações pendentes de datas anteriores', () => {
    const captureWindowStart =
      contentScript.indexOf(
        '  function getCurrentCaptureWindow()',
      )

    const captureWindowEnd =
      contentScript.indexOf(
        '\n  function buildCurrentCapturePlan()',
        captureWindowStart,
      )

    assert.notEqual(
      captureWindowStart,
      -1,
    )

    assert.notEqual(
      captureWindowEnd,
      -1,
    )

    const captureWindowBlock =
      contentScript.slice(
        captureWindowStart,
        captureWindowEnd,
      )

    assert.match(
      captureWindowBlock,
      /selectCaptureWindow/,
    )

    assert.match(
      captureWindowBlock,
      /pendingMutationKeys:\s*pendingCaptureMutationIds/,
    )

    const observerStart =
      contentScript.indexOf(
        '  function observeWhatsAppChanges()',
      )

    const observerEnd =
      contentScript.indexOf(
        '\n  observeWhatsAppChanges.timeoutId = 0',
        observerStart,
      )

    const observerBlock =
      contentScript.slice(
        observerStart,
        observerEnd,
      )

    assert.match(
      observerBlock,
      /if \(messageMutationDetected\) \{\s*scheduleCaptureIngestion\(0\)/,
    )
  })

  test('captura consulta a elegibilidade do ciclo antes da ingestão', () => {
    const eligibilityStart =
      contentScript.indexOf(
        '  function canIngestCurrentCapture()',
      )

    const eligibilityEnd =
      contentScript.indexOf(
        '\n  function getCurrentCaptureWindow()',
        eligibilityStart,
      )

    assert.notEqual(
      eligibilityStart,
      -1,
    )

    assert.notEqual(
      eligibilityEnd,
      -1,
    )

    const eligibilityBlock =
      contentScript.slice(
        eligibilityStart,
        eligibilityEnd,
      )

    assert.match(
      eligibilityBlock,
      /isCaptureResolutionEligible\(\s*state\.leadResolution,\s*\)/,
    )

    assert.match(
      eligibilityBlock,
      /resolutionIsEligible/,
    )
  })

  test('troca de conversa preserva o plano de captura já materializado', () => {
    const resetStart =
      contentScript.indexOf(
        '  function resetConversationMessageLedger(',
      )

    const resetEnd =
      contentScript.indexOf(
        '\n  function rememberPendingCaptureMutation(',
        resetStart,
      )

    assert.notEqual(
      resetStart,
      -1,
    )

    assert.notEqual(
      resetEnd,
      -1,
    )

    const resetBlock =
      contentScript.slice(
        resetStart,
        resetEnd,
      )

    assert.doesNotMatch(
      resetBlock,
      /clearCaptureIngestionTimer/,
    )

    assert.doesNotMatch(
      resetBlock,
      /captureIngestionRetryAttempt/,
    )

    const scheduleStart =
      contentScript.indexOf(
        '  function scheduleCaptureIngestion(',
      )

    const scheduleEnd =
      contentScript.indexOf(
        '\n  function buildConversationTextFromMessages(',
        scheduleStart,
      )

    const scheduleBlock =
      contentScript.slice(
        scheduleStart,
        scheduleEnd,
      )

    assert.match(
      scheduleBlock,
      /buildCurrentCapturePlan\(\)/,
    )

    assert.match(
      scheduleBlock,
      /pendingCaptureIngestionPlans\.set\(/,
    )

    assert.match(
      scheduleBlock,
      /schedulePendingCaptureIngestion/,
    )

    const runStart =
      contentScript.indexOf(
        '  async function runCaptureIngestion()',
      )

    const runEnd =
      contentScript.indexOf(
        '\n  function schedulePendingCaptureIngestion(',
        runStart,
      )

    const runBlock =
      contentScript.slice(
        runStart,
        runEnd,
      )

    assert.match(
      runBlock,
      /pendingCaptureIngestionPlans\s*\.entries\(\)/,
    )

    assert.match(
      runBlock,
      /forgetPendingCapturePlan/,
    )
  })

  test('captura usa texto renderizado para preservar elementos br', () => {
    const bodyStart =
      contentScript.indexOf(
        '  function getCapturedMessageBodyText(',
      )

    const bodyEnd =
      contentScript.indexOf(
        '\n  function isDeletedMessageNode(',
        bodyStart,
      )

    assert.notEqual(
      bodyStart,
      -1,
    )

    assert.notEqual(
      bodyEnd,
      -1,
    )

    const bodyBlock =
      contentScript.slice(
        bodyStart,
        bodyEnd,
      )

    assert.match(
      bodyBlock,
      /readCapturedElementText/,
    )

    assert.doesNotMatch(
      bodyBlock,
      /element\.textContent/,
    )
  })