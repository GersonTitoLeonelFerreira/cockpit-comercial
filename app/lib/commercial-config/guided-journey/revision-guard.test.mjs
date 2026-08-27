import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applySaveResult,
  beginSave,
  bumpRevision,
  createRevisionGuardState,
  isStale,
} from './revision-guard.ts'

test('save sem edição concorrente é aplicado normalmente', () => {
  let state = createRevisionGuardState({ text: '' })
  state = bumpRevision(state, { text: 'Acesso' })
  const sentRevision = beginSave(state)

  const result = applySaveResult(state, sentRevision, { text: 'Acesso (normalizado pelo servidor)' })

  assert.equal(result.applied, true)
  assert.equal(result.state.data.text, 'Acesso (normalizado pelo servidor)')
})

test('latest local edit wins: resposta de save antigo (stale) é descartada', () => {
  let state = createRevisionGuardState({ text: '' })
  state = bumpRevision(state, { text: 'Acesso liv' })
  const sentRevision = beginSave(state) // revisão N inicia o save

  // Usuário continua digitando enquanto o request está em voo → revisão N+1
  state = bumpRevision(state, { text: 'Acesso livre' })

  assert.equal(isStale(state, sentRevision), true)

  // Resposta do save N chega — não deve sobrescrever a edição N+1
  const result = applySaveResult(state, sentRevision, { text: 'Acesso liv' })

  assert.equal(result.applied, false)
  assert.equal(result.state.data.text, 'Acesso livre')
  assert.equal(result.state.revision, state.revision)
})

test('múltiplas edições rápidas: apenas a última resposta consistente é aplicada', () => {
  let state = createRevisionGuardState({ text: 'a' })
  state = bumpRevision(state, { text: 'ab' })
  const firstSave = beginSave(state)
  state = bumpRevision(state, { text: 'abc' })
  const secondSave = beginSave(state)

  // Resposta do primeiro save chega tarde — descartada.
  let result = applySaveResult(state, firstSave, { text: 'ab' })
  assert.equal(result.applied, false)
  state = result.state
  assert.equal(state.data.text, 'abc')

  // Resposta do segundo save chega e é a mais recente — aplicada.
  result = applySaveResult(state, secondSave, { text: 'abc' })
  assert.equal(result.applied, true)
  assert.equal(result.state.data.text, 'abc')
})
