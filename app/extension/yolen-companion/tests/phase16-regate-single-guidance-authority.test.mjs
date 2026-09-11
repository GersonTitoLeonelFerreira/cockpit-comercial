import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const extensionRoot = path.resolve(here, '..')
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(extensionRoot, 'manifest.json'),
    'utf8',
  ),
)

function whatsappRuntimeScripts() {
  return manifest.content_scripts
    .filter((entry) =>
      Array.isArray(entry.matches) &&
      entry.matches.includes('https://web.whatsapp.com/*') &&
      !entry.world,
    )
    .flatMap((entry) => entry.js || [])
}

test(
  '16.9 regressão: runtime real não carrega orientação legada concorrente',
  () => {
    const scripts = whatsappRuntimeScripts()

    assert.ok(
      scripts.includes('src/companion-reasoning-view.js'),
      'o reasoning canônico precisa estar no runtime seller-facing',
    )

    assert.equal(
      scripts.includes('src/lead-method-guidance-runtime.js'),
      false,
      'o guidance legado não pode competir com o reasoning canônico',
    )
  },
)
