import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const connectPage =
  readFileSync(
    new URL(
      '../../../companion/connect/page.tsx',
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

test(
  'página de conexão publica apenas origem final autorizada',
  () => {
    assert.match(
      connectPage,
      /const companionBaseUrl =\s*await getCompanionBaseUrl\(\)/,
    )

    assert.match(
      connectPage,
      /origin:\s*companionBaseUrl/,
    )

    assert.doesNotMatch(
      connectPage,
      /origin:\s*['"]yolen-connect-page['"]/,
    )

    assert.match(
      connectPage,
      /http:\/\/localhost:3000/,
    )

    assert.match(
      connectPage,
      /https:\/\/cockpit-comercial-vocn\.vercel\.app/,
    )

    assert.doesNotMatch(
      connectPage,
      /TEMP_TEST_/,
    )

    assert.doesNotMatch(
      connectPage,
      /cockpit-comercial-vocn-git-/,
    )
  },
)

test(
  'background envia o token para a origem autorizada da sessão sem override de preview',
  () => {
    const requestStart =
      background.indexOf(
        'async function requestYolenWithToken(',
      )

    const requestEnd =
      background.indexOf(
        '\nasync function handleCaptureIngestion(',
        requestStart,
      )

    assert.notEqual(
      requestStart,
      -1,
    )

    assert.notEqual(
      requestEnd,
      -1,
    )

    const requestBlock =
      background.slice(
        requestStart,
        requestEnd,
      )

    assert.match(
      requestBlock,
      /const sessionBaseUrl =/,
    )

    assert.match(
      requestBlock,
      /cachedSession\.origin/,
    )

    assert.doesNotMatch(
      requestBlock,
      /TEMP_TEST_BASE_URL/,
    )

    assert.match(
      requestBlock,
      /sessionBaseUrl \|\|\s*message\.baseUrl \|\|\s*DEFAULT_BASE_URL/,
    )

    assert.ok(
      requestBlock.indexOf(
        'sessionBaseUrl ||',
      ) <
        requestBlock.indexOf(
          'message.baseUrl ||',
        ),
    )
  },
)
