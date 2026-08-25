import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(
    new URL(
      '../src/seller-message-runtime.js',
      import.meta.url,
    ),
  ),
  'utf8',
)

test('mensagem só é gerada por ação explícita depois de uma intenção', () => {
  assert.match(
    source,
    /data-yolen-seller-message-action=\\?"generate\\?"/,
  )
  assert.match(source, /seller_intent:/)
  assert.match(source, /operation: 'generate_message'/)
  assert.match(source, /!state\.intent\.trim\(\)/)
})

test('atalhos apenas preenchem intenção e não disparam geração automática', () => {
  const presetBlock = source.slice(
    source.indexOf("if (presetButton)"),
    source.indexOf("const actionButton =", source.indexOf("if (presetButton)")),
  )

  assert.match(presetBlock, /state\.intent = presets\[index\]/)
  assert.doesNotMatch(presetBlock, /requestGeneration/)
})

test('resultado oferece incluir e copiar sem envio automático', () => {
  assert.match(source, /Incluir no WhatsApp/)
  assert.match(source, />Copiar</)
  assert.match(source, /navigator\.clipboard\.writeText/)
  assert.doesNotMatch(source, /sendButton\.click\(/)
  assert.doesNotMatch(source, /composer\.dispatchEvent\([^)]*submit/)
})

test('inserção protege rascunho já existente no WhatsApp', () => {
  assert.match(
    source,
    /O campo do WhatsApp já contém texto\./,
  )
  assert.match(source, /normalize\(composer\.textContent\)/)
})
