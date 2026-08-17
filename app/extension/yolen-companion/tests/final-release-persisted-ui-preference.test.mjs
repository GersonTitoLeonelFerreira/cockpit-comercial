import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const contentScript =
  readFileSync(
    new URL(
      '../src/content-script.js',
      import.meta.url,
    ),
    'utf8',
  )

const gitignore =
  readFileSync(
    new URL(
      '../../../../.gitignore',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'Companion persiste e restaura a preferência de painel minimizado',
  () => {
    assert.match(
      contentScript,
      /yolen_companion_panel_collapsed/,
    )

    assert.match(
      contentScript,
      /loadPanelCollapsedPreference/,
    )

    assert.match(
      contentScript,
      /persistPanelCollapsedPreference/,
    )

    assert.match(
      contentScript,
      /storage\.get/,
    )

    assert.match(
      contentScript,
      /storage\.set/,
    )
  },
)

test(
  'preferência visual é carregada antes da primeira renderização',
  () => {
    const startIndex =
      contentScript.indexOf(
        'async function start()',
      )

    const loadIndex =
      contentScript.indexOf(
        'await loadPanelCollapsedPreference()',
        startIndex,
      )

    const renderIndex =
      contentScript.indexOf(
        'renderPanel()',
        startIndex,
      )

    assert.ok(
      startIndex >= 0,
    )

    assert.ok(
      loadIndex > startIndex,
    )

    assert.ok(
      renderIndex > loadIndex,
    )

    assert.match(
      gitignore,
      /^\/dist\/$/m,
    )
  },
)
