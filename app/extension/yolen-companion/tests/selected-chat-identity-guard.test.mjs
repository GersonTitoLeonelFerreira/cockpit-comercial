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

function loadSelectedChatResolver(
  document,
) {
  const start =
    contentScript.indexOf(
      'function getSelectedChatElement()',
    )

  const end =
    contentScript.indexOf(
      'function getSelectedChatTitle()',
      start,
    )

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)

  const functionSource =
    contentScript.slice(
      start,
      end,
    )

  return new Function(
    'document',
    'PANEL_ID',
    `${functionSource}
return getSelectedChatElement()`,
  )(
    document,
    'yolen-companion-panel',
  )
}

function makeElement({
  matches = [],
  closest = {},
  query = {},
} = {}) {
  return {
    matches(selector) {
      return matches.includes(selector)
    },
    closest(selector) {
      return closest[selector] || null
    },
    querySelector(selector) {
      return query[selector] || null
    },
  }
}

test(
  'filtro Tudo selecionado nunca e tratado como conversa',
  () => {
    const filterTudo =
      makeElement()

    const yolenTab =
      makeElement({
        closest: {
          '#yolen-companion-panel': {},
        },
      })

    const chatTitle = {}

    const chatRow =
      makeElement({
        matches: [
          '[data-testid="cell-frame-container"], [role="row"], [role="listitem"], [data-id]',
        ],
        query: {
          '[data-testid="cell-frame-title"], span[title], [dir="auto"][title]':
            chatTitle,
        },
      })

    const document = {
      querySelectorAll(selector) {
        assert.equal(
          selector,
          '[aria-selected="true"]',
        )

        return [
          filterTudo,
          yolenTab,
          chatRow,
        ]
      },
    }

    const selected =
      loadSelectedChatResolver(
        document,
      )

    assert.equal(
      selected,
      chatRow,
      'a linha real da conversa deve vencer o filtro Tudo e as abas da Yolen',
    )
  },
)

test(
  'sem linha de conversa nenhum aria-selected global vira contato',
  () => {
    const filterTudo =
      makeElement()

    const yolenTab =
      makeElement({
        closest: {
          '#yolen-companion-panel': {},
        },
      })

    const document = {
      querySelectorAll() {
        return [
          filterTudo,
          yolenTab,
        ]
      },
    }

    assert.equal(
      loadSelectedChatResolver(
        document,
      ),
      null,
    )
  },
)
