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
