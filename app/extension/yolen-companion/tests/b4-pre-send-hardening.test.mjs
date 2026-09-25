import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readWhatsAppCompositionSource,
  sliceCoreWithChannelEvent,
} from './support/whatsapp-composition-source.mjs'

const contentScript = readWhatsAppCompositionSource()

function getBlock(
  startText,
  endText,
) {
  const start =
    contentScript.indexOf(startText)

  const end =
    contentScript.indexOf(
      endText,
      start,
    )

  assert.ok(
    start >= 0,
    `Início não encontrado: ${startText}`,
  )

  assert.ok(
    end > start,
    `Fim não encontrado: ${endText}`,
  )

  return contentScript.slice(
    start,
    end,
  )
}

const gateSource =
  getBlock(
    '// B4_PRE_SEND_GATE_START',
    '// B4_PRE_SEND_GATE_END',
  )

test(
  'botão Enviar fica restrito à conversa atual',
  () => {
    const block =
      getBlock(
        'function isWhatsAppSendButtonTarget',
        'function isComposerEnterTarget',
      )

    assert.match(
      block,
      /getMainConversationRoot\(\)/,
    )

    assert.match(
      block,
      /!main\.contains\(button\)/,
    )

    assert.match(
      block,
      /!footer\.contains\(button\)/,
    )
  },
)

test(
  'listener de envio é instalado uma única vez',
  () => {
    const block =
      // FASE 5: listeners de envio vivem no adapter (onSendAttempt).
      sliceCoreWithChannelEvent(
        contentScript,
        getBlock(
          'function observeManualChannelSend',
          'function reviewCurrentPreSendDraft',
        ),
        'function onSendAttempt(',
      )

    assert.match(
      block,
      /__yolenCompanionManualSendObserverInstalled/,
    )

    assert.match(
      block,
      /globalThis\[observerKey\] === true/,
    )

    const listeners =
      block.match(
        /window\.addEventListener\(/g,
      ) || []

    assert.equal(
      listeners.length,
      2,
    )
  },
)

test(
  'Enter durante composição IME não entra no gate',
  () => {
    const block =
      // FASE 5: listeners de envio vivem no adapter (onSendAttempt).
      sliceCoreWithChannelEvent(
        contentScript,
        getBlock(
          'function observeManualChannelSend',
          'function reviewCurrentPreSendDraft',
        ),
        'function onSendAttempt(',
      )

    assert.match(
      block,
      /event\.isComposing/,
    )

    assert.match(
      block,
      /event\.keyCode === 229/,
    )
  },
)

test(
  'Shift Enter e modificadores continuam fora do gate',
  () => {
    const block =
      // FASE 5: listeners de envio vivem no adapter (onSendAttempt).
      sliceCoreWithChannelEvent(
        contentScript,
        getBlock(
          'function observeManualChannelSend',
          'function reviewCurrentPreSendDraft',
        ),
        'function onSendAttempt(',
      )

    assert.match(block, /event\.shiftKey/)
    assert.match(block, /event\.altKey/)
    assert.match(block, /event\.ctrlKey/)
    assert.match(block, /event\.metaKey/)
  },
)

test(
  'listener do draft pré-envio não duplica',
  () => {
    const block =
      getBlock(
        'function observeComposerDraftForPreSend',
        'function normalizeOperationalText',
      )

    assert.match(
      block,
      /__yolenCompanionPreSendDraftObserverInstalled/,
    )

    assert.match(
      block,
      /globalThis\[observerKey\] === true/,
    )
  },
)

test(
  'listener das ações do gate não duplica e fica limitado ao painel',
  () => {
    const block =
      getBlock(
        'function observePreSendGateActions',
        '// B4_PRE_SEND_GATE_END',
      )

    assert.match(
      block,
      /__yolenCompanionPreSendGateActionsObserverInstalled/,
    )

    assert.match(
      block,
      /globalThis\[observerKey\] === true/,
    )

    assert.match(
      block,
      /actionElement\.closest\(/,
    )

    assert.match(
      block,
      /PANEL_ID/,
    )
  },
)

test(
  'troca de conversa revoga todo o estado pré-envio',
  () => {
    const block =
      getBlock(
        'function hardResetConversationWorkspace',
        'function refreshConversationSnapshot',
      )

    for (
      const expected of [
        'preSendAssessment: null',
        'preSendAssessmentConversationKey: null',
        'preSendAssessmentFingerprint: null',
        "preSendDraft: ''",
        'preSendGateOpen: false',
        'preSendBypassKey: null',
      ]
    ) {
      assert.equal(
        block.includes(expected),
        true,
        expected,
      )
    }
  },
)

test(
  'assessment desconhecido ou malformado permanece fail-open',
  () => {
    const block =
      getBlock(
        'function getCurrentPreSendGateKey',
        'function interceptPreSendAttempt',
      )

    for (
      const kind of [
        'wait_pressure',
        'sensitive_condition',
        'pending_issue',
        'method_premature_close',
        'agenda_conflict',
      ]
    ) {
      assert.equal(
        block.includes(
          `'${kind}'`,
        ),
        true,
        kind,
      )
    }

    assert.match(
      block,
      /!supportedKinds\.has/,
    )

    assert.match(
      block,
      /typeof assessment\.reason !== 'string'/,
    )

    assert.match(
      block,
      /!assessment\.reason\.trim\(\)/,
    )
  },
)

test(
  'Enviar mesmo assim não deixa bypass armado sem botão',
  () => {
    const block =
      getBlock(
        'function sendCurrentPreSendDraftAnyway',
        'async function useCurrentPreSendSuggestion',
      )

    // FASE 5 (contrato §7): "existe botão Enviar" e "clicar" são
    // capacidades técnicas do adapter; o Core continua desarmando o
    // bypass quando elas falham.
    assert.match(
      block,
      /if \(!channelAdapter\.hasSendControl\(\)\)[\s\S]*preSendBypassKey:\s*null/,
    )

    assert.match(
      block,
      /if \(!sendResult\.sent\)[\s\S]*preSendBypassKey:\s*null/,
    )

    const triggerSendBlock =
      getBlock(
        'function triggerSend() {',
        '\n  }\n',
      )

    assert.match(
      triggerSendBlock,
      /if \(!sendButton\?\.click\)[\s\S]*sent: false/,
    )

    assert.match(
      triggerSendBlock,
      /try \{\s*sendButton\.click\(\)\s*\} catch \{[\s\S]*sent: false/,
    )
  },
)

test(
  'bypass é revalidado contra gate exato antes do clique',
  () => {
    const block =
      getBlock(
        'function sendCurrentPreSendDraftAnyway',
        'async function useCurrentPreSendSuggestion',
      )

    assert.match(
      block,
      /state\.preSendBypassKey !== gateKey/,
    )

    assert.match(
      block,
      /getCurrentPreSendGateKey\(\) !== gateKey/,
    )
  },
)

test(
  'bypass residual é revogado após tentativa programática',
  () => {
    const block =
      getBlock(
        'function sendCurrentPreSendDraftAnyway',
        'async function useCurrentPreSendSuggestion',
      )

    assert.match(
      block,
      /250/,
    )

    assert.match(
      block,
      /preSendBypassKey:\s*null/,
    )
  },
)

test(
  'recolher o Companion revoga gate e bypass pendentes',
  () => {
    const block =
      getBlock(
        'function setPanelCollapsed',
        'function renderPanel',
      )

    assert.match(
      block,
      /state\.preSendGateOpen/,
    )

    assert.match(
      block,
      /preSendGateOpen:\s*false/,
    )

    assert.match(
      block,
      /preSendBypassKey:\s*null/,
    )
  },
)

test(
  'hardening mantém o gate isolado de IA API CRM Agenda e telemetria',
  () => {
    for (
      const forbidden of [
        'fetch(',
        'analyzeConversation(',
        'registerActionEvent(',
        'fireCompanionActionTelemetry(',
        'applyCurrentSuggestion(',
        'crm_accepted',
        'crm_rejected',
        'agenda_accepted',
        'agenda_rejected',
      ]
    ) {
      assert.equal(
        gateSource.includes(
          forbidden,
        ),
        false,
        forbidden,
      )
    }
  },
)

test(
  'não existem funções duplicadas do pré-envio',
  () => {
    for (
      const functionName of [
        'getWhatsAppSendButton',
        'observeManualChannelSend',
        'observePreSendGateActions',
        'observeComposerDraftForPreSend',
      ]
    ) {
      const matches =
        contentScript.match(
          new RegExp(
            `function ${functionName}\\(`,
            'g',
          ),
        ) || []

      assert.equal(
        matches.length,
        1,
        functionName,
      )
    }
  },
)
