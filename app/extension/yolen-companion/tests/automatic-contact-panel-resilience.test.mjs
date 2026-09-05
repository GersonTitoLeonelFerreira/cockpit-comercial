import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript =
  readFileSync(
    new URL(
      '../src/content-script.js',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'telefone do contato possui fallback visual limitado a area do perfil',
  () => {
    const start =
      contentScript.indexOf(
        'function getContactPanelPhone()',
      )

    const end =
      contentScript.indexOf(
        'function isSelfConversationTitle(',
        start,
      )

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    const block =
      contentScript.slice(
        start,
        end,
      )

    assert.match(
      block,
      /findContactInfoHeader\(\)/,
    )

    assert.match(
      block,
      /isVisibleDomElement\(/,
    )

    assert.match(
      block,
      /headerRect\.left - 24/,
    )

    assert.match(
      block,
      /rightBoundary/,
    )

    assert.match(
      block,
      /PANEL_ID/,
    )

    assert.match(
      block,
      /findPhoneInContactCandidates\(/,
    )
  },
)

test(
  'fechamento do perfil prioriza click nativo no controle X',
  () => {
    const start =
      contentScript.indexOf(
        'function activateContactInfoCloseControl(',
      )

    const end =
      contentScript.indexOf(
        'function closeContactInfoPanel()',
        start,
      )

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    const block =
      contentScript.slice(
        start,
        end,
      )

    assert.match(
      block,
      /typeof element\.click ===/,
    )

    assert.match(
      block,
      /element\.click\(\)/,
    )

    assert.match(
      block,
      /return clickElement\(element\)/,
    )
  },
)

test(
  'fechamento automatico nunca usa Escape para navegar no WhatsApp',
  () => {
    assert.doesNotMatch(
      contentScript,
      /function dispatchContactInfoEscape\(/,
    )

    const closeStart =
      contentScript.indexOf(
        'function closeContactInfoPanel()',
      )

    const closeEnd =
      contentScript.indexOf(
        'async function waitForContactInfoPanelClosed(',
        closeStart,
      )

    assert.notEqual(closeStart, -1)
    assert.notEqual(closeEnd, -1)

    const closeBlock =
      contentScript.slice(
        closeStart,
        closeEnd,
      )

    assert.doesNotMatch(
      closeBlock,
      /KeyboardEvent/,
    )

    assert.doesNotMatch(
      closeBlock,
      /Escape/,
    )

    const waitStart =
      contentScript.indexOf(
        'async function closeContactInfoPanelAndWait()',
      )

    const waitEnd =
      contentScript.indexOf(
        'async function waitForContactPanelPhone(',
        waitStart,
      )

    assert.notEqual(waitStart, -1)
    assert.notEqual(waitEnd, -1)

    const waitBlock =
      contentScript.slice(
        waitStart,
        waitEnd,
      )

    assert.doesNotMatch(
      waitBlock,
      /Escape/,
    )

    const waits =
      waitBlock.match(
        /waitForContactInfoPanelClosed\(/g,
      ) || []

    assert.equal(
      waits.length,
      1,
      'o fechamento deve tentar somente o controle X e confirmar o resultado',
    )
  },
)
