import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const previewBaseUrl =
  'https://cockpit-comercial-vocn-git-feature-companion-v2-ph-b75689-yolen.vercel.app'

const previewPattern =
  `${previewBaseUrl}/*`

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

const manifest =
  JSON.parse(
    readFileSync(
      new URL(
        '../manifest.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )

test(
  'Fase 5.2 autoriza somente o Preview explícito usado pelo shadow',
  () => {
    assert.ok(
      connectPage.includes(
        previewBaseUrl,
      ),
    )

    assert.ok(
      background.includes(
        previewBaseUrl,
      ),
    )

    assert.ok(
      manifest.host_permissions.includes(
        previewPattern,
      ),
    )

    const bridge =
      manifest.content_scripts.find(
        (entry) =>
          entry.js?.includes(
            'src/yolen-bridge.js',
          ),
      )

    assert.ok(
      bridge?.matches?.includes(
        previewPattern,
      ),
    )

    const pageBridge =
      manifest.web_accessible_resources.find(
        (entry) =>
          entry.resources?.includes(
            'src/yolen-page-bridge.js',
          ),
      )

    assert.ok(
      pageBridge?.matches?.includes(
        previewPattern,
      ),
    )

    assert.equal(
      manifest.host_permissions.includes(
        'https://*.vercel.app/*',
      ),
      false,
    )

    assert.equal(
      background.includes(
        'https://*.vercel.app',
      ),
      false,
    )
  },
)
