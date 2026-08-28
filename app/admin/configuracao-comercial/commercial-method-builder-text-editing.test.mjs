import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  editingLinesToText,
  editingTextToLines,
  isLatestEditRevision,
  normalizeTextListsForPersistence,
} from '@/app/lib/commercial-config/text-editing'

test('edição multiline preserva espaços, acentos, pontuação e Enter durante a digitação', () => {
  for (const value of [
    'Acesso livre à musculação',
    'Acesso ',
    'Aulas coletivas incluídas no plano',
    'Preço mensal de R$ 149,90 no cartão.',
    'Até 10% de desconto sem aprovação do gestor.',
    'Linha um\nLinha dois\n',
  ]) {
    assert.equal(editingLinesToText(editingTextToLines(value)), value)
  }
})

test('normalização altera somente o snapshot persistido', () => {
  const editing = { benefits: ['Acesso livre  ', '', ' Aulas coletivas '] }
  const persisted = normalizeTextListsForPersistence(editing)
  assert.deepEqual(persisted.benefits, ['Acesso livre', 'Aulas coletivas'])
  assert.deepEqual(editing.benefits, ['Acesso livre  ', '', ' Aulas coletivas '])
})

test('latest local edit vence resposta stale', () => {
  assert.equal(isLatestEditRevision(1, 2), false)
  assert.equal(isLatestEditRevision(2, 2), true)
})

test('componentes não normalizam destrutivamente no onChange', async () => {
  const files = await Promise.all([
    readFile('app/admin/configuracao-comercial/CommercialMethodBuilder.tsx', 'utf8'),
    readFile('app/admin/configuracao-comercial/BuyerDecisionArchitecture.tsx', 'utf8'),
    readFile('app/admin/configuracao-comercial/AssistedMethodConstruction.tsx', 'utf8'),
  ])
  const combined = files.join('\n')
  for (const source of files) assert.match(source, /EditableLinesTextarea/)
  assert.doesNotMatch(combined, /function (?:cleanLines|linesToArray)/)
})
