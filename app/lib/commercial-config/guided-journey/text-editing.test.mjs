import assert from 'node:assert/strict'
import test from 'node:test'

import {
  editingTextToLines,
  linesToEditingText,
  normalizeLinesForFinalization,
} from './text-editing.ts'

test('edição lossless: espaço à direita não é removido durante a digitação', () => {
  assert.deepEqual(editingTextToLines('Acesso '), ['Acesso '])
})

test('edição lossless: linha vazia intermediária (Enter duplo) é preservada', () => {
  assert.deepEqual(editingTextToLines('Acesso livre\n\nAvaliação física'), [
    'Acesso livre',
    '',
    'Avaliação física',
  ])
})

test('edição lossless: acentos e caracteres especiais são preservados', () => {
  const value = 'Aulas coletivas incluídas\nAvaliação física inicial'
  assert.deepEqual(editingTextToLines(value), ['Aulas coletivas incluídas', 'Avaliação física inicial'])
})

test('round-trip split/join nunca perde ou altera caracteres', () => {
  const original = 'Acesso \n\nItem com  espaços duplos\nÚltimo item '
  const lines = editingTextToLines(original)
  assert.equal(linesToEditingText(lines), original)
})

test('normalização só acontece na cópia de finalização, nunca durante a edição', () => {
  const editing = editingTextToLines('Acesso \n \nBenefício 2')
  assert.deepEqual(editing, ['Acesso ', ' ', 'Benefício 2'])

  const finalized = normalizeLinesForFinalization(editing)
  assert.deepEqual(finalized, ['Acesso', 'Benefício 2'])
})
