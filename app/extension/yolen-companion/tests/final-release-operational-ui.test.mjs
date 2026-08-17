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

test(
  'V2 stateful pode oferecer atualização operacional com confirmação humana',
  () => {
    assert.match(
      contentScript,
      /engine_source[\s\S]*stateful/,
    )

    assert.match(
      contentScript,
      /can_apply_suggestion[\s\S]*true/,
    )

    assert.match(
      contentScript,
      /hasOperationalSuggestionChange\(\)/,
    )

    assert.match(
      contentScript,
      /saved_coaching[\s\S]*isStatefulConversationAnalysis/,
    )

    assert.match(
      contentScript,
      /Confirmar atualização na Yolen/,
    )

    assert.match(
      contentScript,
      /Nada será alterado sem sua confirmação/,
    )
  },
)

test(
  'experiência principal prioriza decisão comercial em vez de termos técnicos',
  () => {
    assert.match(
      contentScript,
      /Momento atual/,
    )

    assert.match(
      contentScript,
      /Próximo passo/,
    )

    assert.match(
      contentScript,
      /Atualização na Yolen/,
    )

    assert.match(
      contentScript,
      /Mensagem sugerida/,
    )

    assert.match(
      contentScript,
      /Inserir no WhatsApp/,
    )

    assert.doesNotMatch(
      contentScript,
      />\s*Analisar conversa com IA\s*</,
    )
  },
)

test(
  'painel possui hierarquia visual da experiência de decisão',
  () => {
    assert.match(
      styles,
      /\.yolen-decision-card/,
    )

    assert.match(
      styles,
      /\.yolen-decision-badge/,
    )

    assert.match(
      styles,
      /\.yolen-operational-suggestion/,
    )

    assert.match(
      styles,
      /\.yolen-suggested-message/,
    )
  },
)
