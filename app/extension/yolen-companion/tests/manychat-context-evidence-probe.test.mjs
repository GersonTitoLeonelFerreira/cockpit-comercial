import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const probe = require('../src/manychat-context-evidence-probe.js')

function node({
  textContent = '',
  attrs = {},
  children = [],
  parentElement = null,
} = {}) {
  const item = {
    textContent,
    parentElement,
    children,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name)
        ? attrs[name]
        : null
    },
    querySelectorAll() {
      const out = []
      const walk = (current) => {
        for (const child of current.children ?? []) {
          out.push(child)
          walk(child)
        }
      }
      walk(item)
      return out
    },
    contains(target) {
      if (target === item) return true
      let current = target?.parentElement ?? null
      while (current) {
        if (current === item) return true
        current = current.parentElement ?? null
      }
      return false
    },
  }

  for (const child of children) {
    child.parentElement = item
  }

  return item
}

function evidence({
  workspace = 'workspace-a',
  conversation = 'conversation-a',
  channel = 'whatsapp',
  contactKeys = ['structured_attribute|data-contact-id|secret-a'],
} = {}) {
  return {
    ready: true,
    secret: {
      workspace_token: workspace,
      conversation_key: conversation,
      levels: [
        {
          depth: 2,
          channel: {
            ready: Boolean(channel),
            channels: channel ? [channel] : [],
          },
          contact_secret_keys: [...contactKeys],
        },
      ],
    },
  }
}

test('reconhece canal somente por enum conhecido', () => {
  assert.equal(probe.channelFromValue('WhatsApp', { exactText: true }), 'whatsapp')
  assert.equal(probe.channelFromValue('Instagram', { exactText: true }), 'instagram')
  assert.equal(probe.channelFromValue('Facebook Messenger', { exactText: true }), 'messenger')
  assert.equal(probe.channelFromValue('Telegram', { exactText: true }), 'telegram')
  assert.equal(probe.channelFromValue('Cliente escreveu WhatsApp', { exactText: true }), null)
})

test('atributo semântico pode sinalizar canal sem expor o valor bruto', () => {
  const scope = node({
    children: [node({ attrs: { 'data-test-id': 'channel-whatsapp-pill' } })],
  })

  const result = probe.detectChannelSignals(scope, null)

  assert.equal(result.ready, true)
  assert.deepEqual(result.channels, ['whatsapp'])
  assert.equal(result.signal_count, 1)
})

test('múltiplos canais no mesmo escopo ficam ambíguos', () => {
  const scope = node({
    children: [
      node({ textContent: 'WhatsApp' }),
      node({ attrs: { 'aria-label': 'Instagram' } }),
    ],
  })

  const result = probe.detectChannelSignals(scope, null)

  assert.equal(result.ready, false)
  assert.equal(result.ambiguous, true)
  assert.deepEqual(result.channels, ['instagram', 'whatsapp'])
})

test('mensagens são excluídas da detecção de canal', () => {
  const message = node({ textContent: 'WhatsApp' })
  const messageRoot = node({ children: [message] })
  const scope = node({ children: [messageRoot] })

  const result = probe.detectChannelSignals(scope, messageRoot)

  assert.equal(result.ready, false)
  assert.deepEqual(result.channels, [])
})

test('coleta somente atributos estruturados explicitamente permitidos', () => {
  const scope = node({
    children: [
      node({
        attrs: {
          'data-contact-id': 'contact-secret-1',
          'data-random-id': 'nao-deve-entrar',
        },
      }),
    ],
  })

  const result = probe.collectStructuredContactCandidates(scope, null)

  assert.equal(result.safe.candidate_count, 1)
  assert.deepEqual(result.safe.sources, [
    {
      source_kind: 'structured_attribute',
      attribute_name: 'data-contact-id',
      count: 1,
    },
  ])

  const serialized = JSON.stringify(result.safe)
  assert.doesNotMatch(serialized, /contact-secret-1/)
  assert.doesNotMatch(serialized, /nao-deve-entrar/)
})

test('href tel e wa.me viram candidatos sem expor telefone', () => {
  const tel = probe.hrefIdentity('tel:+55 47 99999-0001')
  const wa = probe.hrefIdentity('https://wa.me/5547999990001')

  assert.equal(tel.source_kind, 'tel_href')
  assert.equal(wa.source_kind, 'whatsapp_href')
  assert.equal(tel.attribute_name, 'href')
  assert.equal(wa.attribute_name, 'href')
})

test('A → B → A prova identidade estruturada somente se candidato muda e retorna', () => {
  const baseline = evidence({
    conversation: 'conversation-a',
    contactKeys: ['structured_attribute|data-contact-id|secret-a'],
  })
  const distinct = evidence({
    conversation: 'conversation-b',
    contactKeys: ['structured_attribute|data-contact-id|secret-b'],
  })
  const current = evidence({
    conversation: 'conversation-a',
    contactKeys: ['structured_attribute|data-contact-id|secret-a'],
  })

  const result = probe.evaluateReturnToBaseline(baseline, distinct, current)

  assert.equal(result.pass, true)
  assert.deepEqual(result.safe.structured_contact_identity_depths, [2])
  assert.deepEqual(result.safe.stable_channel_depths, [2])
  assert.equal(result.safe.structured_contact_identity_ready, true)
})

test('candidato igual em A e B não prova identidade do contato', () => {
  const baseline = evidence({ conversation: 'conversation-a' })
  const distinct = evidence({ conversation: 'conversation-b' })
  const current = evidence({ conversation: 'conversation-a' })

  const result = probe.evaluateReturnToBaseline(baseline, distinct, current)

  assert.equal(result.pass, false)
  assert.equal(result.safe.structured_contact_identity_ready, false)
})

test('mudança de workspace falha fechado', () => {
  const baseline = evidence({ workspace: 'workspace-a', conversation: 'conversation-a' })
  const distinct = evidence({ workspace: 'workspace-b', conversation: 'conversation-b' })
  const current = evidence({ workspace: 'workspace-a', conversation: 'conversation-a' })

  const result = probe.evaluateReturnToBaseline(baseline, distinct, current)

  assert.equal(result.pass, false)
  assert.equal(result.safe.same_workspace, false)
})

test('relatório seguro nunca contém valor bruto, hash ou token de rota', () => {
  const baseline = evidence({
    workspace: 'workspace-super-secreto',
    conversation: 'conversation-super-secreta-a',
    contactKeys: ['structured_attribute|data-contact-id|contact-super-secreto-a'],
  })
  const distinct = evidence({
    workspace: 'workspace-super-secreto',
    conversation: 'conversation-super-secreta-b',
    contactKeys: ['structured_attribute|data-contact-id|contact-super-secreto-b'],
  })
  const current = evidence({
    workspace: 'workspace-super-secreto',
    conversation: 'conversation-super-secreta-a',
    contactKeys: ['structured_attribute|data-contact-id|contact-super-secreto-a'],
  })

  const result = probe.evaluateReturnToBaseline(baseline, distinct, current)
  const serialized = JSON.stringify(result.safe)

  assert.doesNotMatch(serialized, /workspace-super-secreto/)
  assert.doesNotMatch(serialized, /conversation-super-secreta/)
  assert.doesNotMatch(serialized, /contact-super-secreto/)
  assert.equal(result.safe.privacy.raw_contact_value_exposed, false)
  assert.equal(result.safe.privacy.hashes_exposed, false)
  assert.equal(result.safe.privacy.network_sent, false)
  assert.equal(result.safe.privacy.persisted, false)
})
