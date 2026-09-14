import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
require('../src/platform-contract.js')
const surface = require('../src/manychat-surface.js')
const evidence = require('../src/manychat-evidence-probe.js')

function element(tagName, attributes = {}, parentElement = null, extra = {}) {
  return {
    tagName,
    parentElement,
    textContent: extra.textContent ?? 'CONTEUDO QUE NAO DEVE SER COLETADO',
    value: extra.value ?? 'VALOR QUE NAO DEVE SER COLETADO',
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name)
        ? attributes[name]
        : null
    },
  }
}

function documentWith(nodes, onQuery = null) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, '*')
      if (onQuery) onQuery()
      return nodes
    },
  }
}

test('probe coleta somente estrutura e atributos, sem textContent ou value', () => {
  const parent = element('DIV', { role: 'main', class: 'inbox-shell' })
  const node = element(
    'DIV',
    {
      role: 'button',
      'data-testid': 'conversation-message',
      'aria-label': 'Abrir mensagem',
      class: 'message bubble',
    },
    parent,
    {
      textContent: 'Cliente quer pagar R$ 4.000 hoje',
      value: 'segredo',
    },
  )

  const probe = evidence.createManyChatEvidenceProbe({
    document: documentWith([node]),
    surfaceApi: surface,
    now: () => '2026-09-14T17:30:00.000Z',
  })

  const result = probe.run(
    'https://app.manychat.com/fb871594/chat/1443150072',
  )

  assert.equal(result.supported, true)
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].tag, 'div')
  assert.equal(
    result.candidates[0].attributes['data-testid'],
    'conversation-message',
  )
  assert.equal(result.candidates[0].ancestors[0].attributes.role, 'main')

  const serialized = JSON.stringify(result)
  assert.doesNotMatch(serialized, /Cliente quer pagar/)
  assert.doesNotMatch(serialized, /segredo/)
  assert.equal(result.privacy.text_content_collected, false)
  assert.equal(result.privacy.input_values_collected, false)
  assert.equal(result.privacy.network_sent, false)
  assert.equal(result.privacy.persisted, false)
})

test('probe registra apenas presença de data-title estrutural sem coletar seus valores', () => {
  const root = element('DIV', { 'data-test-id': 'chat-messages-list' })
  const lane = element('DIV', {}, root)
  const message = element(
    'DIV',
    {
      'data-title-at': 'cliente-privado-123456789',
      'data-title-offset-bottom': '12',
      'data-title': 'CONTEUDO PRIVADO DA MENSAGEM',
    },
    lane,
  )

  const probe = evidence.createManyChatEvidenceProbe({
    document: documentWith([root, lane, message]),
    surfaceApi: surface,
  })

  const result = probe.run(
    'https://app.manychat.com/fb871594/chat/1443150072',
  )

  const structural = result.candidates.find((candidate) =>
    candidate.attribute_presence?.includes('data-title-at'),
  )

  assert.ok(structural)
  assert.deepEqual(structural.attribute_presence, [
    'data-title-at',
    'data-title-offset-bottom',
    'data-title',
  ])
  assert.equal(structural.ancestors[0].tag, 'div')
  assert.equal(
    structural.ancestors[1].attributes['data-test-id'],
    'chat-messages-list',
  )

  const serialized = JSON.stringify(result)
  assert.doesNotMatch(serialized, /cliente-privado/)
  assert.doesNotMatch(serialized, /CONTEUDO PRIVADO DA MENSAGEM/)
})

test('probe redige e-mail, telefone e identificadores numéricos longos', () => {
  assert.equal(
    evidence.sanitizeAttributeValue('contato joao@example.com'),
    'contato [redacted-email]',
  )
  assert.equal(
    evidence.sanitizeAttributeValue('WhatsApp +55 47 99999-0001'),
    'WhatsApp [redacted-number]',
  )
  assert.equal(
    evidence.sanitizeAttributeValue('contact-1443150072'),
    'contact-[redacted-id]',
  )
})

test('rota não suportada falha fechada e não varre o DOM', () => {
  let queried = false
  const probe = evidence.createManyChatEvidenceProbe({
    document: documentWith([], () => {
      queried = true
    }),
    surfaceApi: surface,
    now: () => '2026-09-14T17:30:00.000Z',
  })

  const result = probe.run(
    'https://app.manychat.com/fb871594/dashboard',
  )

  assert.equal(result.supported, false)
  assert.equal(result.reason, 'unsupported_route')
  assert.equal(result.candidates.length, 0)
  assert.equal(queried, false)
})

test('probe respeita limite de candidatos para evitar snapshot explosivo', () => {
  const nodes = Array.from({ length: 12 }, (_, index) =>
    element('DIV', { role: 'button', 'data-testid': `message-${index}` }),
  )

  const probe = evidence.createManyChatEvidenceProbe({
    document: documentWith(nodes),
    surfaceApi: surface,
    maxCandidates: 3,
  })

  const result = probe.run(
    'https://app.manychat.com/fb871594/chat/1443150072',
  )

  assert.equal(result.candidates.length, 3)
  assert.equal(result.summary.candidate_count, 3)
})

test('elementos sem qualquer sinal semântico são ignorados', () => {
  const nodes = [
    element('DIV', {}),
    element('SPAN', { class: 'layout-wrapper' }),
    element('DIV', { class: 'conversation-thread' }),
  ]

  const probe = evidence.createManyChatEvidenceProbe({
    document: documentWith(nodes),
    surfaceApi: surface,
  })

  const result = probe.run(
    'https://app.manychat.com/fb871594/chat/1443150072',
  )

  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].attributes.class, 'conversation-thread')
})

test('input e textarea entram como candidatos, mas seus valores nunca entram', () => {
  const nodes = [
    element('INPUT', { type: 'text', placeholder: 'Digite uma mensagem' }, null, {
      value: 'mensagem privada',
    }),
    element('TEXTAREA', {}, null, { value: 'outro segredo' }),
  ]

  const probe = evidence.createManyChatEvidenceProbe({
    document: documentWith(nodes),
    surfaceApi: surface,
  })

  const result = probe.run(
    'https://app.manychat.com/fb871594/chat/1443150072',
  )

  assert.equal(result.candidates.length, 2)
  const serialized = JSON.stringify(result)
  assert.doesNotMatch(serialized, /mensagem privada/)
  assert.doesNotMatch(serialized, /outro segredo/)
})

test('toJson produz snapshot serializável e mantém a identidade canônica da rota', () => {
  const probe = evidence.createManyChatEvidenceProbe({
    document: documentWith([]),
    surfaceApi: surface,
    now: () => '2026-09-14T17:30:00.000Z',
  })

  const json = probe.toJson(
    'https://app.manychat.com/fb3937244/chat/166708683?tab=info#latest',
  )
  const parsed = JSON.parse(json)

  assert.equal(parsed.schema_version, 'yolen-manychat-evidence-v1')
  assert.equal(parsed.surface.external_contact_id, '166708683')
  assert.equal(
    parsed.surface.conversation_key,
    surface.parseManyChatConversationUrl(
      'https://app.manychat.com/fb3937244/chat/166708683',
    ).conversation_key,
  )
})
