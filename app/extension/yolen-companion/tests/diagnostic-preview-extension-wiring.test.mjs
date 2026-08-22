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
  'Final Release remove a API paralela de Preview V2',
  () => {
    assert.doesNotMatch(
      yolenApi,
      /async function diagnosticPreview\(payload\)/,
    )

    assert.doesNotMatch(
      yolenApi,
      /DIAGNOSTIC_PREVIEW_V2/,
    )

    assert.doesNotMatch(
      yolenApi,
      /diagnosticPreview,/,
    )

    assert.match(
      yolenApi,
      /async function analyzeConversation\(payload\)/,
    )

    assert.match(
      yolenApi,
      /ANALYZE_CONVERSATION/,
    )
  },
)

test(
  'Final Release remove o roteamento paralelo de Preview V2 do background',
  () => {
    assert.doesNotMatch(
      background,
      /DIAGNOSTIC_PREVIEW_V2/,
    )

    assert.doesNotMatch(
      background,
      /\/api\/companion\/v2\/diagnostic-preview/,
    )

    assert.match(
      background,
      /ANALYZE_CONVERSATION/,
    )

    assert.match(
      background,
      /\/api\/companion\/analyze-conversation/,
    )
  },
)

test(
  'Final Release exibe somente a experiência principal do Yolen Companion',
  () => {
    assert.match(
      contentScript,
      /getCompanionAgoraTabHtml\(\)/,
    )

    assert.match(
      contentScript,
      /<div class="yolen-section-label">\s*Yolen Companion\s*<\/div>/,
    )

    assert.doesNotMatch(
      contentScript,
      /\$\{getDiagnosticPreviewCardHtml\(\)\}/,
    )

    assert.doesNotMatch(
      contentScript,
      /data-yolen-action="diagnostic-preview-v2"/,
    )

    assert.doesNotMatch(
      contentScript,
      /Diagnóstico V2 · somente leitura/,
    )

    assert.doesNotMatch(
      contentScript,
      /<div class="yolen-section-label">Regras preservadas<\/div>/,
    )
  },
)
