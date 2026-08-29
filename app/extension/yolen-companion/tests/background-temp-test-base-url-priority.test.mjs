import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  createFakeFetchQueue,
  jsonResponse,
  loadBackgroundScript,
} from './e2-test-support/load-background-script.mjs'

const backgroundSource = readFileSync(
  new URL('../src/background.js', import.meta.url),
  'utf8',
)

const PRODUCTION_BASE_URL =
  'https://cockpit-comercial-vocn.vercel.app'

const STALE_PREVIEW_BASE_URL =
  'https://cockpit-comercial-vocn-git-chatgpt-companion-ux-fi-09f56e-yolen.vercel.app'

const SESSION_KEY =
  'yolen_companion_session'

function futureIso(secondsFromNow) {
  return new Date(
    Date.now() +
      secondsFromNow * 1000,
  ).toISOString()
}

function sessionCapturedAt(origin) {
  return {
    ok: true,
    statusCode: 200,
    origin,
    capturedAt:
      new Date().toISOString(),
    payload: {
      ok: true,
      companion_token:
        'fake.token.value',
      expires_at:
        futureIso(
          6 * 60 * 60,
        ),
    },
  }
}

test(
  'Final Release não contém override TEMP_TEST_BASE_URL nem alias git-* de preview',
  () => {
    assert.doesNotMatch(
      backgroundSource,
      /TEMP_TEST_BASE_URL/,
    )

    assert.doesNotMatch(
      backgroundSource,
      /cockpit-comercial-vocn-git-/,
    )

    assert.equal(
      backgroundSource.includes(
        STALE_PREVIEW_BASE_URL,
      ),
      false,
    )
  },
)

test(
  'sessão capturada em produção mantém todo o tráfego autenticado em produção',
  async () => {
    const {
      fetchFn,
      calls,
    } =
      createFakeFetchQueue([
        () =>
          jsonResponse(
            200,
            {
              ok: true,
              data: {
                identity: {},
                summary: null,
              },
            },
          ),
      ])

    const bg =
      loadBackgroundScript({
        fetchFn,
        initialStorage: {
          [SESSION_KEY]:
            sessionCapturedAt(
              PRODUCTION_BASE_URL,
            ),
        },
      })

    const response =
      await bg.sendMessage({
        source:
          'YOLEN_COMPANION',
        action:
          'LOAD_LEAD_SUMMARY',
        baseUrl:
          STALE_PREVIEW_BASE_URL,
        payload: {
          cycle_id:
            'cycle-1',
          conversation_key:
            'whatsapp:+5511999990000',
        },
      })

    assert.equal(
      calls.length,
      1,
    )

    assert.ok(
      calls[0].url.startsWith(
        PRODUCTION_BASE_URL,
      ),
    )

    assert.ok(
      !calls[0].url.startsWith(
        STALE_PREVIEW_BASE_URL,
      ),
    )

    assert.equal(
      response.ok,
      true,
    )
  },
)

test(
  'origem antiga de preview armazenada na sessão não é autorizada e cai para produção',
  async () => {
    const {
      fetchFn,
      calls,
    } =
      createFakeFetchQueue([
        () =>
          jsonResponse(
            200,
            {
              ok: true,
            },
          ),
      ])

    const bg =
      loadBackgroundScript({
        fetchFn,
        initialStorage: {
          [SESSION_KEY]:
            sessionCapturedAt(
              STALE_PREVIEW_BASE_URL,
            ),
        },
      })

    await bg.sendMessage({
      source:
        'YOLEN_COMPANION',
      action:
        'RESOLVE_LEAD',
      baseUrl:
        STALE_PREVIEW_BASE_URL,
      payload: {
        phone:
          '5511999990000',
      },
    })

    assert.equal(
      calls.length,
      1,
    )

    assert.equal(
      calls[0].url,
      PRODUCTION_BASE_URL +
        '/api/companion/resolve-lead',
    )
  },
)
