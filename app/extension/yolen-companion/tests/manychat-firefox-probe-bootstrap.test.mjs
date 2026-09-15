import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL(
    '../src/manychat-audio-dispatch-runtime.js',
    import.meta.url,
  ),
  'utf8',
)

test(
  'bootstrap ManyChat não exige window === globalThis no Firefox',
  () => {
    assert.doesNotMatch(
      source,
      /root\.window\s*===\s*root/,
    )

    assert.match(
      source,
      /const runtimeWindow = root\.window \?\? root/,
    )

    assert.match(
      source,
      /window: runtimeWindow/,
    )

    assert.match(
      source,
      /document: runtimeDocument/,
    )

    assert.match(
      source,
      /addEventListener\(\s*'hashchange'/,
    )
  },
)
