import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const styles =
  readFileSync(
    new URL(
      '../src/styles.css',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'Companion reserva espaço próprio e não cobre o WhatsApp',
  () => {
    assert.match(
      styles,
      /--yolen-companion-panel-width/,
    )

    assert.match(
      styles,
      /#yolen-companion-panel[\s\S]*var\([\s\S]*--yolen-companion-panel-width/,
    )

    assert.match(
      styles,
      /#app[\s\S]*100vw[\s\S]*--yolen-companion-panel-width/,
    )
  },
)

test(
  'largura do Companion permanece responsiva',
  () => {
    assert.match(
      styles,
      /clamp\(320px, 28vw, 370px\)/,
    )

    assert.match(
      styles,
      /@media \(max-width: 1100px\)/,
    )
  },
)
