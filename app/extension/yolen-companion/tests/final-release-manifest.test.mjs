import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

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

const serviceWorker =
  readFileSync(
    new URL(
      '../src/background-service-worker.js',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'Release Candidate usa identidade final da extensão',
  () => {
    assert.equal(
      manifest.manifest_version,
      3,
    )

    assert.equal(
      manifest.name,
      'Yolen Companion',
    )

    assert.equal(
      manifest.version,
      '1.0.0',
    )

    assert.equal(
      manifest.description,
      'Assistente comercial da Yolen para WhatsApp Web.',
    )
  },
)

test(
  'Release Candidate possui background compatível com Firefox e Chrome MV3',
  () => {
    assert.deepEqual(
      manifest.background.scripts,
      [
        'src/capture-transport.js',
        'src/background.js',
      ],
    )

    assert.equal(
      manifest.background.service_worker,
      'src/background-service-worker.js',
    )

    assert.match(
      serviceWorker,
      /importScripts/,
    )

    const captureIndex =
      serviceWorker.indexOf(
        "'capture-transport.js'",
      )

    const backgroundIndex =
      serviceWorker.indexOf(
        "'background.js'",
      )

    assert.ok(
      captureIndex >= 0,
    )

    assert.ok(
      backgroundIndex >
        captureIndex,
    )
  },
)

test(
  'Release Candidate mantém somente origens finais autorizadas',
  () => {
    assert.deepEqual(
      manifest.host_permissions,
      [
        'https://web.whatsapp.com/*',
        'https://cockpit-comercial-vocn.vercel.app/*',
        'http://localhost:3000/*',
      ],
    )

    const serialized =
      JSON.stringify(manifest)

    assert.doesNotMatch(
      serialized,
      /feature-companion-v2/,
    )

    assert.doesNotMatch(
      serialized,
      /diagnostic-preview/,
    )
  },
)
