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
  'Companion pode recolher e expandir como o Shell da Yolen',
  () => {
    assert.match(
      contentScript,
      /let panelCollapsed = false/,
    )

    assert.match(
      contentScript,
      /setPanelCollapsed\(collapsed\)/,
    )

    assert.match(
      contentScript,
      /data-yolen-action="collapse-companion"/,
    )

    assert.match(
      contentScript,
      /data-yolen-action="expand-companion"/,
    )

    assert.match(
      contentScript,
      /yolen-companion-collapsed/,
    )
  },
)

test(
  'modo recolhido devolve a largura do WhatsApp e mantém rail de 64px',
  () => {
    assert.match(
      styles,
      /html\.yolen-companion-collapsed/,
    )

    assert.match(
      styles,
      /--yolen-companion-panel-width:[\s\S]*64px/,
    )

    assert.match(
      styles,
      /\.yolen-collapsed-shell[\s\S]*width: 64px/,
    )

    assert.match(
      styles,
      /html\.yolen-companion-collapsed #app[\s\S]*100vw[\s\S]*64px/,
    )
  },
)

test(
  'Companion utiliza o mesmo logo oficial da Yolen empacotado na extensão',
  () => {
    assert.match(
      contentScript,
      /assets\/yolen-mark\.png/,
    )

    const whatsappResources =
      manifest
        .web_accessible_resources
        ?.find(
          entry =>
            entry
              .matches
              ?.includes(
                'https://web.whatsapp.com/*',
              ),
        )

    assert.ok(
      whatsappResources,
    )

    assert.ok(
      whatsappResources
        .resources
        .includes(
          'assets/yolen-mark.png',
        ),
    )
  },
)
