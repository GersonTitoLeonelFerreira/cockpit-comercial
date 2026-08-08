import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const yolenApi =
  readFileSync(
    new URL(
      '../src/yolen-api.js',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'origem assinada da sessão prevalece e localhost antigo não controla a navegação',
  () => {
    assert.match(
      yolenApi,
      /const PHASE_5_2_PREVIEW_BASE_URL/,
    )

    assert.match(
      yolenApi,
      /let sessionBaseUrl = null/,
    )

    const start =
      yolenApi.indexOf(
        'function getBaseUrl()',
      )

    const end =
      yolenApi.indexOf(
        'async function sendToBackground',
        start,
      )

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    const getBaseUrlBlock =
      yolenApi.slice(start, end)

    assert.match(
      getBaseUrlBlock,
      /sessionBaseUrl/,
    )

    assert.match(
      getBaseUrlBlock,
      /PHASE_5_2_PREVIEW_BASE_URL/,
    )

    assert.doesNotMatch(
      getBaseUrlBlock,
      /localStorage/,
    )

    assert.doesNotMatch(
      getBaseUrlBlock,
      /savedUrl/,
    )

    assert.match(
      yolenApi,
      /rememberSessionBaseUrl\(\s*result\.origin,?\s*\)/,
    )

    assert.match(
      yolenApi,
      /rememberSessionBaseUrl\(\s*session\?\.origin,?\s*\)/,
    )

    assert.match(
      yolenApi,
      /CLEAR_SESSION[\s\S]*sessionBaseUrl = null/,
    )
  },
)
