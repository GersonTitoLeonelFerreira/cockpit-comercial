import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const yolenApi =
  readFileSync(
    new URL(
      '../src/yolen-api.js',
      import.meta.url,
    ),
    'utf8',
  )

const background =
  readFileSync(
    new URL(
      '../src/background.js',
      import.meta.url,
    ),
    'utf8',
  )

const contentScript =
  readFileSync(
    new URL(
      '../src/content-script.js',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'API da extensão expõe a prévia V2',
  () => {
    assert.match(
      yolenApi,
      /async function diagnosticPreview\(payload\)/,
    )

    assert.match(
      yolenApi,
      /DIAGNOSTIC_PREVIEW_V2/,
    )

    assert.match(
      yolenApi,
      /diagnosticPreview,/,
    )
  },
)

test(
  'background encaminha a prévia para a rota V2',
  () => {
    assert.match(
      background,
      /message\.action ===\s*'DIAGNOSTIC_PREVIEW_V2'/,
    )

    assert.match(
      background,
      /\/api\/companion\/v2\/diagnostic-preview/,
    )
  },
)

test(
  'cartão V2 permanece paralelo e somente leitura',
  () => {
    const previewStart =
      contentScript.indexOf(
        '  async function runDiagnosticPreview()',
      )

    const previewEnd =
      contentScript.indexOf(
        '\n  function formatDiagnosticPreviewValue(',
        previewStart,
      )

    assert.notEqual(
      previewStart,
      -1,
    )

    assert.notEqual(
      previewEnd,
      -1,
    )

    const previewBlock =
      contentScript.slice(
        previewStart,
        previewEnd,
      )

    assert.match(
      previewBlock,
      /\.diagnosticPreview\(\{/,
    )

    assert.match(
      previewBlock,
      /cycle_id:/,
    )

    assert.match(
      previewBlock,
      /conversation_key:/,
    )

    assert.match(
      previewBlock,
      /previewControls\?\.read_only !==\s*true/,
    )

    assert.match(
      previewBlock,
      /previewControls\?\.persisted !==\s*false/,
    )

    assert.match(
      previewBlock,
      /previewControls\?\.crm_changed !==\s*false/,
    )

    assert.match(
      previewBlock,
      /previewControls\?\.cursor_advanced !==\s*false/,
    )

    assert.doesNotMatch(
      previewBlock,
      /applySuggestion/,
    )

    assert.match(
      contentScript,
      /\$\{getAnalysisCardHtml\(\)\}[\s\S]*\$\{getDiagnosticPreviewCardHtml\(\)\}/,
    )

    assert.match(
      contentScript,
      /data-yolen-action="diagnostic-preview-v2"/,
    )

    assert.match(
      contentScript,
      /Diagnóstico V2 · somente leitura/,
    )
  },
)
