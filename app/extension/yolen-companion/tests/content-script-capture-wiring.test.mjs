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

  test('materializa o instante quando cada mensagem é observada no DOM', () => {
    const synchronizeStart =
      contentScript.indexOf(
        '  function synchronizeConversationMessageLedger()',
      )

    const synchronizeEnd =
      contentScript.indexOf(
        '\n  function getSortedLedgerMessages()',
        synchronizeStart,
      )

    assert.notEqual(
      synchronizeStart,
      -1,
    )

    assert.notEqual(
      synchronizeEnd,
      -1,
    )

    const synchronizeBlock =
      contentScript.slice(
        synchronizeStart,
        synchronizeEnd,
      )

    assert.match(
      synchronizeBlock,
      /const observedAt =\s*new Date\(\)\.toISOString\(\)/,
    )

    assert.match(
      synchronizeBlock,
      /buildReliableMessageFromNode\(\s*node,\s*observedAt,\s*\)/,
    )

    assert.match(
      synchronizeBlock,
      /buildDeletedMessageSnapshotFromNode\(\s*node,\s*previousMessage,\s*observedAt,\s*\)/,
    )

    const buildPlanStart =
      contentScript.indexOf(
        '  function buildCurrentCapturePlan()',
      )

    const buildPlanEnd =
      contentScript.indexOf(
        '\n  function rememberSuccessfulCapture(',
        buildPlanStart,
      )

    const buildPlanBlock =
      contentScript.slice(
        buildPlanStart,
        buildPlanEnd,
      )

    assert.doesNotMatch(
      buildPlanBlock,
      /observedAt:\s*new Date/,
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

  test('mensagem inalterada preserva o instante observado anteriormente', () => {
    const synchronizeStart =
      contentScript.indexOf(
        '  function synchronizeConversationMessageLedger()',
      )

    const synchronizeEnd =
      contentScript.indexOf(
        '\n  function getSortedLedgerMessages()',
        synchronizeStart,
      )

    const synchronizeBlock =
      contentScript.slice(
        synchronizeStart,
        synchronizeEnd,
      )

    assert.match(
      synchronizeBlock,
      /observedAt:\s*currentMessage\.observedAt/,
    )

    assert.match(
      synchronizeBlock,
      /messageWasAlreadyDeleted\s*&&\s*previousDeletedSnapshot/,
    )
  })

  test('mutações confirmadas são removidas somente do plano atual', () => {
    const helperStart =
      contentScript.indexOf(
        '  function forgetCapturedMutationKeys(',
      )

    const helperEnd =
      contentScript.indexOf(
        '\n  async function runCaptureIngestion()',
        helperStart,
      )

    assert.notEqual(
      helperStart,
      -1,
    )

    assert.notEqual(
      helperEnd,
      -1,
    )

    const helperBlock =
      contentScript.slice(
        helperStart,
        helperEnd,
      )

    assert.match(
      helperBlock,
      /currentPlan\?\.snapshotKey\s*!==\s*plan\.snapshotKey/,
    )

    assert.match(
      helperBlock,
      /currentPlan\?\.observedAt\s*!==\s*plan\.observedAt/,
    )

    assert.match(
      helperBlock,
      /pendingCaptureMutationIds\.delete/,
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
      /forgetCapturedMutationKeys\(\s*contextKey,\s*plan,\s*\)/,
    )
  })

  test('retém capturas pré-resolução por conversa até a resolução correspondente', () => {
    const helperStart =
      contentScript.indexOf(
        '  function rememberCurrentPreResolutionCapture()',
      )

    const helperEnd =
      contentScript.indexOf(
        '\n  function buildCurrentCapturePlan()',
        helperStart,
      )

    assert.notEqual(
      helperStart,
      -1,
    )

    assert.notEqual(
      helperEnd,
      -1,
    )

    const helperBlock =
      contentScript.slice(
        helperStart,
        helperEnd,
      )

    assert.match(
      helperBlock,
      /retainedPreResolutionCaptures\.set/,
    )

    assert.match(
      helperBlock,
      /activeMessages/,
    )

    assert.match(
      helperBlock,
      /deletedMessages/,
    )

    assert.match(
      helperBlock,
      /pendingMutationKeys/,
    )

    assert.match(
      helperBlock,
      /transcriptionsByKey/,
    )

    assert.match(
      helperBlock,
      /MAX_RETAINED_PRE_RESOLUTION_CAPTURES/,
    )

    const refreshStart =
      contentScript.indexOf(
        '  function refreshConversationSnapshot()',
      )

    const refreshEnd =
      contentScript.indexOf(
        '\n  function getConnectionLabel()',
        refreshStart,
      )

    const refreshBlock =
      contentScript.slice(
        refreshStart,
        refreshEnd,
      )

    const conversationChangedIndex =
      refreshBlock.indexOf(
        'if (conversationChanged)',
      )

    const rememberBeforeResetIndex =
      refreshBlock.indexOf(
        'rememberCurrentPreResolutionCapture()',
        conversationChangedIndex,
      )

    const resetIndex =
      refreshBlock.indexOf(
        'resetConversationMessageLedger(',
        conversationChangedIndex,
      )

    assert.notEqual(
      rememberBeforeResetIndex,
      -1,
    )

    assert.notEqual(
      resetIndex,
      -1,
    )

    assert.ok(
      rememberBeforeResetIndex <
        resetIndex,
    )

    assert.match(
      refreshBlock,
      /synchronizeConversationMessageLedger\(\)[\s\S]*rememberCurrentPreResolutionCapture\(\)/,
    )

    const resolveStart =
      contentScript.indexOf(
        '  async function resolveCurrentLead()',
      )

    const resolveEnd =
      contentScript.indexOf(
        '\n  async function analyzeCurrentConversation(',
        resolveStart,
      )

    const resolveBlock =
      contentScript.slice(
        resolveStart,
        resolveEnd,
      )

    assert.match(
      resolveBlock,
      /leadResolutionInFlightKeys\.has/,
    )

    assert.match(
      resolveBlock,
      /leadResolutionInFlightKeys\.add/,
    )

    assert.match(
      resolveBlock,
      /leadResolutionInFlightKeys\.delete/,
    )

    const enqueueIndex =
      resolveBlock.indexOf(
        'enqueueRetainedPreResolutionCapture(',
      )

    const currentConversationGuardIndex =
      resolveBlock.indexOf(
        'if (!requestStillCurrent())',
        enqueueIndex,
      )

    assert.notEqual(
      enqueueIndex,
      -1,
    )

    assert.notEqual(
      currentConversationGuardIndex,
      -1,
    )

    assert.ok(
      enqueueIndex <
        currentConversationGuardIndex,
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

    const capturePlanStart =
      contentScript.indexOf(
        '  function buildCurrentCapturePlan()',
      )

    assert.notEqual(
      capturePlanStart,
      -1,
    )

    const nextFunctionIndexes = [
      contentScript.indexOf(
        '\n  function ',
        capturePlanStart + 1,
      ),

      contentScript.indexOf(
        '\n  async function ',
        capturePlanStart + 1,
      ),
    ].filter(
      (index) =>
        index >
        capturePlanStart,
    )

    assert.ok(
      nextFunctionIndexes.length >
        0,
    )

    const capturePlanEnd =
      Math.min(
        ...nextFunctionIndexes,
      )

    const capturePlanBlock =
      contentScript.slice(
        capturePlanStart,
        capturePlanEnd,
      )

    const stableConversationKeyUses =
      capturePlanBlock.match(
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

test('detecta desaparecimento do DOM com proteção contra rolagem', () => {
  const synchronizeStart =
    contentScript.indexOf(
      '  function synchronizeConversationMessageLedger()',
    )

  const synchronizeEnd =
    contentScript.indexOf(
      '\n  function getSortedLedgerMessages()',
      synchronizeStart,
    )

  assert.notEqual(
    synchronizeStart,
    -1,
  )

  assert.notEqual(
    synchronizeEnd,
    -1,
  )

  const synchronizeBlock =
    contentScript.slice(
      synchronizeStart,
      synchronizeEnd,
    )

  assert.match(
    synchronizeBlock,
    /findSafeDisappearedMessageIds/,
  )

  assert.match(
    synchronizeBlock,
    /lastVisibleMessageSnapshots/,
  )

  assert.match(
    synchronizeBlock,
    /recentConversationScroll/,
  )

  assert.match(
    synchronizeBlock,
    /deletedMessageSnapshots\.set/,
  )

  assert.match(
    synchronizeBlock,
    /rememberPendingCaptureMutation/,
  )

  assert.match(
    contentScript,
    /function observeConversationScrollActivity\(\)/,
  )

  assert.match(
    contentScript,
    /DISAPPEARED_MESSAGE_SCROLL_GUARD_MS/,
  )
})
