// Pedido de fechamento vindo do Companion (?fechar=ganho|perdido): a tela
// do ciclo só abre o modal de sempre, pré-preenchido com o que a conversa
// disse. Nada aqui grava; valores ambíguos ficam em branco.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCycleClosingQuery,
  hasCycleClosingParams,
  matchPaymentMethod,
  matchProductByName,
  parseClosingAmount,
  readCycleClosingRequest,
  stripCycleClosingParams,
} from '../cycle-closing-link.ts'

test('só ganho ou perdido abrem o modal; o resto é ignorado', () => {
  const read = (values) => readCycleClosingRequest((key) => values[key])

  assert.equal(read({}), null)
  assert.equal(read({ fechar: 'negociacao' }), null)
  assert.deepEqual(read({ fechar: 'ganho', produto: ' Plano  Sintético ', valor: 'R$ 199,90', pagamento: 'pix', motivo: 'x' }), {
    close: 'ganho',
    produto: 'Plano Sintético',
    valor: 'R$ 199,90',
    pagamento: 'pix',
    motivo: '',
  })
  assert.deepEqual(read({ fechar: 'perdido', motivo: 'Preço', produto: 'x' }), {
    close: 'perdido',
    produto: '',
    valor: '',
    pagamento: '',
    motivo: 'Preço',
  })
  assert.equal(read({ fechar: 'ganho', produto: 'x'.repeat(500) }).produto.length, 200)
})

test('o redirecionamento /sales-cycles/{id} repassa só os parâmetros permitidos', () => {
  assert.equal(buildCycleClosingQuery({}), '')
  assert.equal(
    buildCycleClosingQuery({ fechar: 'ganho', produto: 'Plano', redirect: 'https://evil.example', valor: ['10', '20'] }),
    'fechar=ganho&produto=Plano&valor=10',
  )
  assert.equal(buildCycleClosingQuery({ fechar: 'apagar' }), '')
})

test('depois de abrir, a URL perde os parâmetros (recarregar não reabre o modal)', () => {
  assert.equal(hasCycleClosingParams('?opportunity=1&fechar=ganho'), true)
  assert.equal(stripCycleClosingParams('?opportunity=1&fechar=ganho&valor=10&pagamento=pix'), '?opportunity=1')
  assert.equal(stripCycleClosingParams('?fechar=perdido&motivo=x'), '')
})

test('pré-preenchimento só com valor e forma de pagamento inequívocos', () => {
  assert.equal(parseClosingAmount('R$ 1.234,56'), 1234.56)
  assert.equal(parseClosingAmount('199,90 por mês'), 199.9)
  assert.equal(parseClosingAmount('1.234'), 1234)
  assert.equal(parseClosingAmount('2x de 100'), null)
  assert.equal(parseClosingAmount('a combinar'), null)

  assert.equal(matchPaymentMethod('pagou no PIX'), 'pix')
  assert.equal(matchPaymentMethod('cartão de crédito em 3x'), 'credito')
  assert.equal(matchPaymentMethod('pix ou boleto'), null)
  assert.equal(matchPaymentMethod('ainda vai ver'), null)

  const products = [
    { id: 'p1', name: 'Plano Duo' },
    { id: 'p2', name: 'Plano Solo' },
  ]

  assert.equal(matchProductByName('plano duo', products)?.id, 'p1')
  assert.equal(matchProductByName('Quer o Plano Solo anual', products)?.id, 'p2')
  assert.equal(matchProductByName('Plano', products), null)
  assert.equal(matchProductByName('', products), null)
})
