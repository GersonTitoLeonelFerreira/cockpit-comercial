// FASE 8 — dono único da comparação de enriquecimento cadastral
// (contrato §19.3/§19.4): a MESMA função decide missing/same/different no
// content do WhatsApp e no background do canal sanitizado.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { areEquivalentPhones } = require('../src/lead-enrichment.js')
const comparison = require('../src/companion-enrichment-comparison.js')

const tools = { areEquivalentPhones }

test('valor atual por campo segue o mapeamento cadastral (lead + perfil)', () => {
  const lead = { email: 'lead@example.com', cpf_cnpj: '123.456.789-01', phone: '5547999990001' }
  const profile = { cnpj: null, cep: '89200-000', address_street: 'Rua A', address_number: '10', address_city: 'Joinville' }

  assert.equal(comparison.readCurrentEnrichmentValue('email', lead, profile), 'lead@example.com')
  assert.equal(comparison.readCurrentEnrichmentValue('cpf', lead, profile), '12345678901')
  assert.equal(comparison.readCurrentEnrichmentValue('cnpj', lead, profile), null)
  assert.equal(comparison.readCurrentEnrichmentValue('cep', lead, profile), '89200-000')
  assert.equal(comparison.readCurrentEnrichmentValue('address_raw', lead, profile), 'Rua A, 10, Joinville')
  assert.equal(comparison.readCurrentEnrichmentValue('campo_desconhecido', lead, profile), null)
})

test('missing / same / different com normalização por campo', () => {
  const context = { lead: { email: 'Cliente@Example.com', cpf_cnpj: '12345678901' }, profile: { cep: '89200000' } }
  const compare = (field, value) => comparison.compareEnrichmentCandidate({ field, normalized_value: value }, context, tools)

  assert.equal(compare('email', 'cliente@example.com'), 'same')
  assert.equal(compare('email', 'outro@example.com'), 'different')
  assert.equal(compare('cpf', '123.456.789-01'), 'same')
  assert.equal(compare('cep', '89200-000'), 'same')
  assert.equal(compare('profession', 'Engenheira'), 'missing')
})

test('telefone principal do lead (ou o da conversa, sem lead) nunca é telefone adicional', () => {
  const compare = (context, value) => comparison.compareEnrichmentCandidate({ field: 'phone_mobile', normalized_value: value }, context, tools)

  assert.equal(compare({ lead: { phone: '5547988887777' } }, '(47) 98888-7777'), 'same')
  assert.equal(compare({ lead: null, conversationPhone: '5547988887777' }, '47 98888-7777'), 'same')
  assert.equal(compare({ lead: { phone: '5547988887777' } }, '(47) 97777-6666'), 'missing')
  assert.equal(compare({ lead: { phone: '5547988887777' }, profile: { phone_mobile: '5547966665555' } }, '(47) 97777-6666'), 'different')
})

test('módulo puro: sem DOM, sem rede, sem conhecimento de canal', () => {
  const source = require('node:fs').readFileSync(new URL('../src/companion-enrichment-comparison.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /document|window\.|fetch\(|chrome\.|manychat|whatsapp/i)
})
