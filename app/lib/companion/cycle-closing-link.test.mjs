// Pedido de fechamento vindo do Companion (?fechar=ganho|perdido): a tela
// do ciclo só abre o modal de sempre, pré-preenchido com o que a conversa
// disse. Nada aqui grava; valores ambíguos ficam em branco.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCycleClosingQuery,
  closingAmountToDecimal,
  hasCycleClosingParams,
  matchProductByName,
  readCycleClosingRequest,
  stripCycleClosingParams,
} from '../cycle-closing-link.ts'

test('só ganho ou perdido abrem o modal; o resto é ignorado', () => {
  const read = (values) => readCycleClosingRequest((key) => values[key])

  assert.equal(read({}), null)
  assert.equal(read({ fechar: 'negociacao' }), null)
  assert.deepEqual(
    read({
      fechar: 'ganho',
      produto: ' Plano  Sintético ',
      valor: 'R$ 149,90 para os dois (R$ 74,95 cada)',
      pagamento: 'Cartão, com débito mês a mês',
      valor_total: '149,90',
      pagamento_codigo: 'credito',
      tipo_codigo: 'recorrente',
      motivo: 'x',
    }),
    {
      close: 'ganho',
      produto: 'Plano Sintético',
      valor: 'R$ 149,90 para os dois (R$ 74,95 cada)',
      pagamento: 'Cartão, com débito mês a mês',
      motivo: '',
      valor_total: '149,90',
      pagamento_codigo: 'credito',
      tipo_codigo: 'recorrente',
    },
  )
  assert.deepEqual(read({ fechar: 'perdido', motivo: 'Preço', produto: 'x', pagamento_codigo: 'pix' }), {
    close: 'perdido',
    produto: '',
    valor: '',
    pagamento: '',
    motivo: 'Preço',
    valor_total: '',
    pagamento_codigo: '',
    tipo_codigo: '',
  })
  assert.equal(read({ fechar: 'ganho', produto: 'x'.repeat(500) }).produto.length, 200)
})

test('códigos fora da lista e valor que não é número ficam vazios (o vendedor preenche)', () => {
  const read = (values) => readCycleClosingRequest((key) => values[key])
  const request = read({ fechar: 'ganho', valor_total: '149,90 para os dois', pagamento_codigo: 'cartao', tipo_codigo: 'mensal' })

  assert.equal(request.valor_total, '')
  assert.equal(request.pagamento_codigo, '')
  assert.equal(request.tipo_codigo, '')
})

test('o redirecionamento /sales-cycles/{id} repassa só os parâmetros permitidos', () => {
  assert.equal(buildCycleClosingQuery({}), '')
  assert.equal(
    buildCycleClosingQuery({ fechar: 'ganho', produto: 'Plano', redirect: 'https://evil.example', valor: ['10', '20'], valor_total: '10,00', pagamento_codigo: 'pix', tipo_codigo: 'avista' }),
    'fechar=ganho&produto=Plano&valor=10&valor_total=10%2C00&pagamento_codigo=pix&tipo_codigo=avista',
  )
  assert.equal(buildCycleClosingQuery({ fechar: 'apagar' }), '')
})

test('depois de abrir, a URL perde os parâmetros (recarregar não reabre o modal)', () => {
  assert.equal(hasCycleClosingParams('?opportunity=1&fechar=ganho'), true)
  assert.equal(stripCycleClosingParams('?opportunity=1&fechar=ganho&valor=10&pagamento=pix&valor_total=10&pagamento_codigo=pix&tipo_codigo=avista'), '?opportunity=1')
  assert.equal(stripCycleClosingParams('?fechar=perdido&motivo=x'), '')
})

test('valor_total vira número do formulário sem interpretar texto', () => {
  assert.equal(closingAmountToDecimal('149,90'), '149.90')
  assert.equal(closingAmountToDecimal('1.234,56'), '1234.56')
  assert.equal(closingAmountToDecimal('1.234'), '1234')
  assert.equal(closingAmountToDecimal('149.90'), '149.90')
  assert.equal(closingAmountToDecimal('R$ 149,90'), '')
  assert.equal(closingAmountToDecimal('149,90 para os dois'), '')
})

test('produto só é escolhido com um candidato único', () => {
  const products = [
    { id: 'p1', name: 'Plano Duo' },
    { id: 'p2', name: 'Plano Solo' },
  ]

  assert.equal(matchProductByName('plano duo', products)?.id, 'p1')
  assert.equal(matchProductByName('Quer o Plano Solo anual', products)?.id, 'p2')
  assert.equal(matchProductByName('Plano', products), null)
  assert.equal(matchProductByName('', products), null)
})

test('o modal de ganho preenche pelos códigos, nunca por regex no texto livre', async () => {
  const { readFileSync } = await import('node:fs')
  const modal = readFileSync(new URL('../../components/leads/WinDealModal.tsx', import.meta.url), 'utf8')

  assert.match(modal, /prefill\.pagamentoCodigo/)
  assert.match(modal, /prefill\.tipoCodigo/)
  assert.match(modal, /closingAmountToDecimal\(prefill\.valorTotal\)/)
  assert.doesNotMatch(modal, /matchPaymentMethod|parseClosingAmount/)
})
