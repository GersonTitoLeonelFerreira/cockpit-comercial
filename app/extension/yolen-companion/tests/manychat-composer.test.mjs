import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const composer = require('../src/manychat-composer.js')

function buildDom(bodyHtml) {
  return new JSDOM(
    `<!doctype html><html><body>${bodyHtml}</body></html>`,
  )
}

const CONVERSATION_ANCHOR = '<div data-test-id="chat-messages-list"></div>'

test('sem a âncora de conversa, composer é indisponível (fail closed)', () => {
  const dom = buildDom('<textarea></textarea>')
  const result = composer.resolveManyChatComposer({ document: dom.window.document })

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'conversation_anchor_missing')
  assert.equal(result.node, null)
})

test('âncora presente mas nenhum textarea: composer indisponível', () => {
  const dom = buildDom(CONVERSATION_ANCHOR)
  const result = composer.resolveManyChatComposer({ document: dom.window.document })

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'composer_not_found')
})

test('mais de um textarea elegível: composer ambíguo, nunca escolhe um por acidente', () => {
  const dom = buildDom(`${CONVERSATION_ANCHOR}<textarea></textarea><textarea></textarea>`)
  const result = composer.resolveManyChatComposer({ document: dom.window.document })

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'composer_ambiguous')
})

// STEP 2B.5-D1 (Blocker B): o seller message engine compartilhado
// (companion-seller-message-engine.js) renderiza seu próprio campo de
// intenção como <textarea data-yolen-seller-message-intent> DENTRO do
// painel da Yolen (#yolen-companion-panel) — achado real ao escrever o
// teste de integração cross-channel (tests/companion-cross-channel-
// integration.test.mjs), que expôs este bug ANTES desta correção: com o
// composer da MENSAGEM aberto, o documento tinha 2 <textarea> (o da
// conversa real + o do próprio Companion) e resolveManyChatComposer()
// devolvia composer_ambiguous, quebrando "Inserir no ManyChat" sempre
// que o painel estivesse aberto.
test('textarea do próprio painel da Yolen (#yolen-companion-panel) nunca conta como candidato ao composer real', () => {
  const dom = buildDom(
    `${CONVERSATION_ANCHOR}<textarea></textarea><aside id="yolen-companion-panel"><textarea data-yolen-seller-message-intent></textarea></aside>`,
  )
  const result = composer.resolveManyChatComposer({ document: dom.window.document })

  assert.equal(result.ready, true)
  assert.equal(result.node.hasAttribute('data-yolen-seller-message-intent'), false)
})

test('textarea desabilitado não conta como candidato elegível', () => {
  const dom = buildDom(`${CONVERSATION_ANCHOR}<textarea disabled></textarea>`)
  const result = composer.resolveManyChatComposer({ document: dom.window.document })

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'composer_not_found')
})

test('textarea readonly não conta como candidato elegível', () => {
  const dom = buildDom(`${CONVERSATION_ANCHOR}<textarea readonly></textarea>`)
  const result = composer.resolveManyChatComposer({ document: dom.window.document })

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'composer_not_found')
})

test('textarea com display:none não conta como candidato elegível', () => {
  const dom = buildDom(
    `${CONVERSATION_ANCHOR}<textarea style="display:none"></textarea><textarea></textarea>`,
  )
  const result = composer.resolveManyChatComposer({ document: dom.window.document })

  assert.equal(result.ready, true)
  assert.notEqual(result.node, null)
})

test('exatamente um textarea elegível: composer pronto, resolvido por estrutura (nunca por classe)', () => {
  const dom = buildDom(
    `${CONVERSATION_ANCHOR}<textarea class="_input_11502_1" placeholder="Escreva aqui..."></textarea>`,
  )
  const result = composer.resolveManyChatComposer({ document: dom.window.document })

  assert.equal(result.ready, true)
  assert.equal(result.node.tagName, 'TEXTAREA')
})

test('aplicar sugestão vazia é recusado', () => {
  const dom = buildDom(`${CONVERSATION_ANCHOR}<textarea></textarea>`)
  const result = composer.applyManyChatComposerSuggestion({
    document: dom.window.document,
    window: dom.window,
    text: '   ',
  })

  assert.equal(result.applied, false)
  assert.equal(result.reason, 'suggestion_empty')
})

test('aplicar sugestão sem composer resolvido propaga o motivo', () => {
  const dom = buildDom('<textarea></textarea>')
  const result = composer.applyManyChatComposerSuggestion({
    document: dom.window.document,
    window: dom.window,
    text: 'Olá! Posso te ajudar.',
  })

  assert.equal(result.applied, false)
  assert.equal(result.reason, 'conversation_anchor_missing')
})

test('aplicar sugestão nunca sobrescreve texto já digitado pelo vendedor', () => {
  const dom = buildDom(`${CONVERSATION_ANCHOR}<textarea>Já estou digitando algo</textarea>`)
  const result = composer.applyManyChatComposerSuggestion({
    document: dom.window.document,
    window: dom.window,
    text: 'Mensagem sugerida pela Yolen',
  })

  assert.equal(result.applied, false)
  assert.equal(result.reason, 'composer_not_empty')

  const textarea = dom.window.document.querySelector('textarea')
  assert.equal(textarea.value, 'Já estou digitando algo')
})

test('aplicar sugestão com sucesso preenche o valor e dispara input/change para o React', () => {
  const dom = buildDom(`${CONVERSATION_ANCHOR}<textarea></textarea>`)
  const textarea = dom.window.document.querySelector('textarea')

  let inputEventCount = 0
  let changeEventCount = 0
  textarea.addEventListener('input', () => {
    inputEventCount += 1
  })
  textarea.addEventListener('change', () => {
    changeEventCount += 1
  })

  const result = composer.applyManyChatComposerSuggestion({
    document: dom.window.document,
    window: dom.window,
    text: '  Posso te explicar as opções.  ',
  })

  assert.equal(result.applied, true)
  assert.equal(result.reason, null)
  assert.equal(textarea.value, 'Posso te explicar as opções.')
  assert.equal(inputEventCount, 1)
  assert.equal(changeEventCount, 1)
  assert.equal(dom.window.document.activeElement, textarea)
})

test('aplicar sugestão nunca dispara envio nem mexe em qualquer botão da página', () => {
  const dom = buildDom(
    `${CONVERSATION_ANCHOR}<textarea></textarea><button id="send">Enviar</button>`,
  )
  const sendButton = dom.window.document.getElementById('send')

  let sendClicked = false
  sendButton.addEventListener('click', () => {
    sendClicked = true
  })

  const result = composer.applyManyChatComposerSuggestion({
    document: dom.window.document,
    window: dom.window,
    text: 'Vou te orientar sobre os próximos passos.',
  })

  assert.equal(result.applied, true)
  assert.equal(sendClicked, false)
})

test('falha na verificação final (valor não bate) reporta apply_verification_failed sem lançar exceção', () => {
  const dom = buildDom(`${CONVERSATION_ANCHOR}<textarea></textarea>`)
  const textarea = dom.window.document.querySelector('textarea')

  // Simula um composer que rejeita a escrita (ex.: React controlado
  // sobrescrevendo o valor de volta) definindo um setter que ignora o
  // novo valor.
  Object.defineProperty(textarea, 'value', {
    configurable: true,
    get() {
      return ''
    },
    set() {
      // ignora a escrita, como um campo controlado que a rejeitou
    },
  })

  const result = composer.applyManyChatComposerSuggestion({
    document: dom.window.document,
    window: dom.window,
    text: 'Isto não deveria entrar.',
  })

  assert.equal(result.applied, false)
  assert.equal(result.reason, 'apply_verification_failed')
})
