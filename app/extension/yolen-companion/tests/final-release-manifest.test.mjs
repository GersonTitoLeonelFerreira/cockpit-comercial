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
      'Assistente comercial da Yolen para canais de conversa.',
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
        'src/manychat-audio-background-transport.js',
        'src/manychat-safe-identity-background.js',
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

    const manyChatAudioIndex =
      serviceWorker.indexOf(
        "'manychat-audio-background-transport.js'",
      )

    const safeIdentityIndex =
      serviceWorker.indexOf(
        "'manychat-safe-identity-background.js'",
      )

    const backgroundIndex =
      serviceWorker.indexOf(
        "'background.js'",
      )

    assert.ok(
      captureIndex >= 0,
    )

    assert.ok(
      manyChatAudioIndex >
        captureIndex,
    )

    assert.ok(
      safeIdentityIndex >
        manyChatAudioIndex,
    )

    assert.ok(
      backgroundIndex >
        safeIdentityIndex,
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
        'https://app.manychat.com/*',
        'https://manybot-files.manychat.io/*',
        'https://cockpit-comercial-vocn.vercel.app/*',
        'http://localhost/*',
      ],
    )

    assert.deepEqual(
      manifest.permissions,
      [
        'storage',
        'scripting',
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

test(
  'ManyChat separa MAIN, bootstrap isolated precoce e runtime document_idle',
  () => {
    const manyChatBlocks = manifest.content_scripts.filter((block) =>
      block.matches?.includes('https://app.manychat.com/*'),
    )

    assert.equal(manyChatBlocks.length, 3)

    const mainWorldBlock = manyChatBlocks.find((block) => block.world === 'MAIN')
    const earlyIsolatedBlock = manyChatBlocks.find(
      (block) =>
        block.world === undefined &&
        block.run_at === 'document_start',
    )
    const idleIsolatedBlock = manyChatBlocks.find(
      (block) =>
        block.world === undefined &&
        block.run_at === 'document_idle',
    )

    assert.ok(mainWorldBlock)
    assert.deepEqual(mainWorldBlock.js, [
      'src/manychat-mainworld-identity-probe.js',
      'src/manychat-identity-namespace.js',
      'src/manychat-safe-identity-main.js',
      'src/manychat-mainworld-probe-bootstrap.js',
      'src/manychat-mainworld-report-export.js',
    ])
    assert.equal(mainWorldBlock.run_at, 'document_start')
    assert.equal(mainWorldBlock.css, undefined)

    assert.ok(earlyIsolatedBlock)
    assert.deepEqual(earlyIsolatedBlock.js, [
      'src/manychat-safe-identity-bridge.js',
    ])
    assert.equal(earlyIsolatedBlock.css, undefined)

    assert.ok(idleIsolatedBlock)
    assert.deepEqual(idleIsolatedBlock.js, [
      'src/platform-contract.js',
      'src/manychat-surface.js',
      'src/manychat-context-evidence-probe.js',
      'src/manychat-message-semantics.js',
      'src/manychat-message-identity.js',
      'src/manychat-message-content.js',
      'src/manychat-audio-source.js',
      'src/manychat-audio-dispatch-runtime.js',
    ])
    assert.equal(idleIsolatedBlock.css, undefined)
  },
)
