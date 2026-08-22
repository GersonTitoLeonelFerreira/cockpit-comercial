import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const contentScript =
  readFileSync(
    new URL(
      '../src/content-script.js',
      import.meta.url,
    ),
    'utf8',
  )

const styles =
  readFileSync(
    new URL(
      '../src/styles.css',
      import.meta.url,
    ),
    'utf8',
  )

function getRenderPanelBlock() {
  const start =
    contentScript.indexOf(
      'function renderPanel()',
    )

  const end =
    contentScript.indexOf(
      'function escapeHtml',
      start,
    )

  assert.notEqual(
    start,
    -1,
  )

  assert.notEqual(
    end,
    -1,
  )

  return contentScript.slice(
    start,
    end,
  )
}

test(
  'painel principal remove métricas técnicas da superfície diária',
  () => {
    const renderPanel =
      getRenderPanelBlock()

    assert.doesNotMatch(
      renderPanel,
      /Telefone detectado/,
    )

    assert.doesNotMatch(
      renderPanel,
      /mensagens da conversa atual/,
    )

    assert.doesNotMatch(
      renderPanel,
      /áudios da conversa atual/,
    )

    assert.doesNotMatch(
      renderPanel,
      /getConnectionDescription/,
    )

    assert.doesNotMatch(
      renderPanel,
      /getConnectionLabel/,
    )
  },
)

test(
  'painel diário prioriza conversa contexto e decisão comercial',
  () => {
    const renderPanel =
      getRenderPanelBlock()

    assert.match(
      renderPanel,
      /getCompactConversationName/,
    )

    assert.match(
      renderPanel,
      /getCompactContextChipsHtml/,
    )

    assert.match(
      renderPanel,
      /getSellerInformationArchitectureHtml/,
    )

    assert.match(
      renderPanel,
      /yolen-connection-pill/,
    )

    assert.match(
      renderPanel,
      /'Conversa'/,
    )
  },
)

test(
  'status de conexão permanece visível sem ocupar um cartão inteiro',
  () => {
    assert.match(
      contentScript,
      /getCompactConnectionLabel/,
    )

    assert.match(
      contentScript,
      /getCompactConnectionClass/,
    )

    assert.match(
      styles,
      /\.yolen-connection-pill/,
    )

    assert.match(
      styles,
      /\.yolen-connection-online/,
    )
  },
)
