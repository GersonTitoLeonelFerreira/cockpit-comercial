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
  'identidade da conversa prioriza cabeçalho e não aceita filtro global como chat selecionado',
  () => {
    const selectedStart =
      contentScript.indexOf(
        'function getSelectedChatElement()',
      )

    const selectedEnd =
      contentScript.indexOf(
        'function getSelectedChatTitle()',
        selectedStart,
      )

    assert.notEqual(
      selectedStart,
      -1,
    )

    assert.notEqual(
      selectedEnd,
      -1,
    )

    const selectedBlock =
      contentScript.slice(
        selectedStart,
        selectedEnd,
      )

    assert.match(
      selectedBlock,
      /querySelectorAll\(\s*['"]\[aria-selected="true"\]['"]/,
    )

    assert.match(
      selectedBlock,
      /img\[src\], \[data-id\]/,
    )

    assert.doesNotMatch(
      selectedBlock,
      /return document\.querySelector\(\s*['"]\[aria-selected="true"\]/,
    )

    const titleStart =
      contentScript.indexOf(
        'function getConversationTitle()',
      )

    const titleEnd =
      contentScript.indexOf(
        'function getConversationPhone(',
        titleStart,
      )

    assert.notEqual(
      titleStart,
      -1,
    )

    assert.notEqual(
      titleEnd,
      -1,
    )

    const titleBlock =
      contentScript.slice(
        titleStart,
        titleEnd,
      )

    const headerIndex =
      titleBlock.indexOf(
        'getMainHeaderTextCandidates()',
      )

    const selectedIndex =
      titleBlock.indexOf(
        'getSelectedChatTitle()',
      )

    assert.ok(
      headerIndex >= 0,
    )

    assert.ok(
      selectedIndex > headerIndex,
    )

    const headerStart =
      contentScript.indexOf(
        'function getMainHeader()',
      )

    const headerEnd =
      contentScript.indexOf(
        'function getMainHeaderTextCandidates()',
        headerStart,
      )

    const headerBlock =
      contentScript.slice(
        headerStart,
        headerEnd,
      )

    assert.match(
      headerBlock,
      /document\.querySelectorAll\(\s*['"]header['"]/,
    )

    assert.match(
      headerBlock,
      /img\[src\]/,
    )
  },
)
