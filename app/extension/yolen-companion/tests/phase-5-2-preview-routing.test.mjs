import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const productionBaseUrl =
  'https://cockpit-comercial-vocn.vercel.app'

const localBaseUrl =
  'http://localhost:3000'

const retiredPreviewBaseUrl =
  'https://cockpit-comercial-vocn-git-feature-companion-v2-ph-b75689-yolen.vercel.app'

const productionPattern =
  `${productionBaseUrl}/*`

const localPattern =
  `${localBaseUrl}/*`

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

const yolenApi =
  readFileSync(
    new URL(
      '../src/yolen-api.js',
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
  'Final Release autoriza somente produção e desenvolvimento local',
  () => {
    assert.ok(
      connectPage.includes(
        productionBaseUrl,
      ),
    )

    assert.ok(
      connectPage.includes(
        localBaseUrl,
      ),
    )

    assert.ok(
      background.includes(
        productionBaseUrl,
      ),
    )

    assert.ok(
      background.includes(
        localBaseUrl,
      ),
    )

    assert.ok(
      yolenApi.includes(
        productionBaseUrl,
      ),
    )

    assert.ok(
      yolenApi.includes(
        localBaseUrl,
      ),
    )

    assert.equal(
      connectPage.includes(
        retiredPreviewBaseUrl,
      ),
      false,
    )

    assert.equal(
      background.includes(
        retiredPreviewBaseUrl,
      ),
      false,
    )

    assert.equal(
      yolenApi.includes(
        retiredPreviewBaseUrl,
      ),
      false,
    )

    assert.ok(
      manifest.host_permissions.includes(
        productionPattern,
      ),
    )

    assert.ok(
      manifest.host_permissions.includes(
        localPattern,
      ),
    )

    assert.equal(
      manifest.host_permissions.some(
        value =>
          value.includes(
            'feature-companion-v2-ph-b75689',
          ),
      ),
      false,
    )

    const bridge =
      manifest.content_scripts.find(
        entry =>
          entry.js?.includes(
            'src/yolen-bridge.js',
          ),
      )

    assert.ok(
      bridge?.matches?.includes(
        productionPattern,
      ),
    )

    assert.ok(
      bridge?.matches?.includes(
        localPattern,
      ),
    )

    assert.equal(
      bridge?.matches?.some(
        value =>
          value.includes(
            'feature-companion-v2-ph-b75689',
          ),
      ),
      false,
    )

    const pageBridge =
      manifest.web_accessible_resources.find(
        entry =>
          entry.resources?.includes(
            'src/yolen-page-bridge.js',
          ),
      )

    assert.ok(
      pageBridge?.matches?.includes(
        productionPattern,
      ),
    )

    assert.ok(
      pageBridge?.matches?.includes(
        localPattern,
      ),
    )

    assert.equal(
      pageBridge?.matches?.some(
        value =>
          value.includes(
            'feature-companion-v2-ph-b75689',
          ),
      ),
      false,
    )

    assert.equal(
      manifest.host_permissions.includes(
        'https://*.vercel.app/*',
      ),
      false,
    )
  },
)
