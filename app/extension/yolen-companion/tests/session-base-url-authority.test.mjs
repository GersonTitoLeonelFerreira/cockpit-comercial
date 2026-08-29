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
  'origem assinada da sessão prevalece entre origens finais autorizadas',
  () => {
    assert.doesNotMatch(
      yolenApi,
      /PHASE_5_2_PREVIEW_BASE_URL/,
    )

    assert.doesNotMatch(
      yolenApi,
      /TEMP_TEST_BASE_URL/,
    )

    assert.doesNotMatch(
      yolenApi,
      /cockpit-comercial-vocn-git-/,
    )

    assert.match(
      yolenApi,
      /const DEFAULT_BASE_URL/,
    )

    assert.match(
      yolenApi,
      /const LOCAL_BASE_URL/,
    )

    assert.match(
      yolenApi,
      /let sessionBaseUrl = null/,
    )

    const allowlistStart =
      yolenApi.indexOf(
        'function getAllowedSessionBaseUrl',
      )

    const allowlistEnd =
      yolenApi.indexOf(
        'function rememberSessionBaseUrl',
        allowlistStart,
      )

    assert.notEqual(
      allowlistStart,
      -1,
    )

    assert.notEqual(
      allowlistEnd,
      -1,
    )

    const allowlistBlock =
      yolenApi.slice(
        allowlistStart,
        allowlistEnd,
      )

    assert.match(
      allowlistBlock,
      /DEFAULT_BASE_URL/,
    )

    assert.match(
      allowlistBlock,
      /LOCAL_BASE_URL/,
    )

    assert.doesNotMatch(
      allowlistBlock,
      /PHASE_5_2/,
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
      yolenApi.slice(
        start,
        end,
      )

    assert.match(
      getBaseUrlBlock,
      /sessionBaseUrl/,
    )

    assert.match(
      getBaseUrlBlock,
      /DEFAULT_BASE_URL/,
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
