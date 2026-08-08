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
  'busca automática prioriza identidade do contato antes de botão genérico do cabeçalho',
  () => {
    const start =
      contentScript.indexOf(
        'function getClickableHeaderTarget(title = null)',
      )

    const end =
      contentScript.indexOf(
        'function clickElement(element)',
        start,
      )

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    const block =
      contentScript.slice(
        start,
        end,
      )

    const titleIndex =
      block.indexOf(
        'const titleElement =',
      )

    const avatarIndex =
      block.indexOf(
        'const avatar =',
      )

    const genericRoleButtonIndex =
      block.indexOf(
        'const roleButton =',
      )

    assert.ok(titleIndex >= 0)
    assert.ok(avatarIndex > titleIndex)
    assert.ok(
      genericRoleButtonIndex >
        avatarIndex,
    )

    assert.match(
      block,
      /elementTitle === expectedTitle/,
    )

    assert.match(
      block,
      /elementText === expectedTitle/,
    )

    assert.match(
      contentScript,
      /getClickableHeaderTarget\(\s*lookupTitle,?\s*\)/,
    )

    assert.match(
      contentScript,
      /informações do contato/,
    )

    assert.match(
      contentScript,
      /contact information/,
    )
  },
)

test(
  'busca automática permanece estável durante mutações do painel de contato',
  () => {
    assert.match(
      contentScript,
      /function getMainHeaderStableIdentity\(\)/,
    )

    const keyStart =
      contentScript.indexOf(
        'function getConversationKey(title)',
      )

    const keyEnd =
      contentScript.indexOf(
        'function findContactInfoPanel()',
        keyStart,
      )

    const keyBlock =
      contentScript.slice(
        keyStart,
        keyEnd,
      )

    assert.match(
      keyBlock,
      /getMainHeaderStableIdentity\(\)/,
    )

    assert.ok(
      keyBlock.indexOf(
        'getMainHeaderStableIdentity()',
      ) <
        keyBlock.indexOf(
          'getSelectedChatStableIdentity()',
        ),
    )

    const clickStart =
      contentScript.indexOf(
        'function clickElement(element)',
      )

    const clickEnd =
      contentScript.indexOf(
        'function closeContactInfoPanel()',
        clickStart,
      )

    const clickBlock =
      contentScript.slice(
        clickStart,
        clickEnd,
      )

    assert.match(
      clickBlock,
      /element\.click\(\)/,
    )

    const lookupStart =
      contentScript.indexOf(
        'async function runAutomaticContactLookup(conversationKey)',
      )

    const lookupEnd =
      contentScript.indexOf(
        'function clearLeadStateForNewConversation()',
        lookupStart,
      )

    const lookupBlock =
      contentScript.slice(
        lookupStart,
        lookupEnd,
      )

    assert.match(
      lookupBlock,
      /state\.conversationTitle !==\s*lookupTitle/,
    )

    assert.doesNotMatch(
      lookupBlock,
      /state\.conversationKey !== conversationKey \|\| state\.conversationTitle !== lookupTitle/,
    )

    assert.match(
      lookupBlock,
      /cachedPhonesByConversationKey\.set\(\s*state\.conversationKey,\s*phone/,
    )
  },
)
