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
        'function dispatchContactInfoEscape()',
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
  'se o click do X nao fechar o perfil o fluxo usa Escape e confirma o fechamento',
  () => {
    const start =
      contentScript.indexOf(
        'async function closeContactInfoPanelAndWait()',
      )

    const end =
      contentScript.indexOf(
        'async function waitForContactPanelPhone(',
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
      /waitForContactInfoPanelClosed\(/,
    )

    assert.match(
      block,
      /dispatchContactInfoEscape\(\)/,
    )

    const firstWait =
      block.indexOf(
        'waitForContactInfoPanelClosed(',
      )

    const escape =
      block.indexOf(
        'dispatchContactInfoEscape()',
      )

    assert.ok(
      firstWait >= 0,
    )

    assert.ok(
      escape > firstWait,
    )
  },
)
