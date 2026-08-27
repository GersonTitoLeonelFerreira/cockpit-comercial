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
  'página de conexão publica a origem que assinou a sessão',
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
  },
)

test(
  'background envia o token para a origem da própria sessão',
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

    assert.match(
      requestBlock,
      /TEMP_TEST_BASE_URL \|\|\s*sessionBaseUrl \|\|\s*message\.baseUrl/,
    )

    assert.ok(
      requestBlock.indexOf(
        'TEMP_TEST_BASE_URL ||',
      ) <
        requestBlock.indexOf(
          'sessionBaseUrl ||',
        ),
    )
  },
)
