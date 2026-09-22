import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const phoneEvidence = require('../src/manychat-phone-evidence.js')

// STEP 2B.5-C1 — cobre EXATAMENTE a regra provada ao vivo no ManyChat real
// (drawer "Exibir contato" fechado): candidato = elemento cujo texto PRÓPRIO
// (só nós de texto filhos diretos) é só dígitos/formatação; exclui
// [data-test-id="details-subscriber-id"]; exige ancestral (até 8 níveis)
// cujo texto contenha "WhatsApp"; aceita só 55-prefixado com 12/13 dígitos;
// dedup por valor normalizado; exatamente 1 = trusted, 0 = unavailable,
// >1 = ambiguous. Nunca usa manychat-mainworld-identity-probe.js (React
// fiber/MAIN world) nem classes CSS geradas como seletor — as fixtures usam
// deliberadamente nomes de classe "gerados" (ex.: userColumnContent_98f7a)
// só para provar que eles nunca participam da regra.
function createFixture(bodyHtml) {
  return new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`)
}

function documentOf(bodyHtml) {
  return createFixture(bodyHtml).window.document
}

test('A: candidato sob [data-test-id="details-subscriber-id"] é excluído mesmo em contexto WhatsApp válido', () => {
  const documentRef = documentOf(`
    <section class="userColumnContent_98f7a">
      <span>WhatsApp</span>
      <div data-test-id="details-subscriber-id">
        <span class="contentRow_44b2">5547999990001</span>
      </div>
    </section>
  `)

  const result = phoneEvidence.resolveTrustedPhone(documentRef)

  assert.deepEqual(result, { ready: false, reason: 'phone_unavailable' })
})

test('B: único candidato 55-prefixado de 12 dígitos em contexto WhatsApp é trusted', () => {
  const documentRef = documentOf(`
    <section class="userColumnContent_1">
      <span>Conversa via WhatsApp</span>
      <div class="mainContent_1">554799990001</div>
    </section>
  `)

  const result = phoneEvidence.resolveTrustedPhone(documentRef)

  assert.equal(result.ready, true)
  assert.equal(result.phone, '554799990001')
  assert.deepEqual(result.evidence, {
    source: 'manychat_dom_whatsapp_context_v1',
    candidate_count: 1,
  })
  assert.equal('phone' in result.evidence, false)
})

test('C: candidato 55-prefixado de 13 dígitos, formatado, normaliza e resolve trusted', () => {
  const documentRef = documentOf(`
    <div class="userColumnContent_2">
      <span>WhatsApp</span>
      <div class="mainContent_2">+55 (47) 99999-0001</div>
    </div>
  `)

  const result = phoneEvidence.resolveTrustedPhone(documentRef)

  assert.equal(result.ready, true)
  assert.equal(result.phone, '5547999990001')
  assert.equal(result.evidence.candidate_count, 1)
})

test('D: nenhum candidato válido resolve phone_unavailable', () => {
  const documentRef = documentOf(`
    <div class="userColumnContent_3">
      <span>WhatsApp</span>
      <div class="mainContent_3">Sem telefone disponível</div>
    </div>
  `)

  const result = phoneEvidence.resolveTrustedPhone(documentRef)

  assert.deepEqual(result, { ready: false, reason: 'phone_unavailable' })
})

test('E: dois candidatos distintos em contexto WhatsApp resolvem phone_ambiguous (fail-closed, nunca escolhe o primeiro)', () => {
  const documentRef = documentOf(`
    <div class="userColumnContent_4">
      <span>WhatsApp</span>
      <div class="mainContent_4a">554799990001</div>
      <div class="mainContent_4b">554788880002</div>
    </div>
  `)

  const result = phoneEvidence.resolveTrustedPhone(documentRef)

  assert.deepEqual(result, { ready: false, reason: 'phone_ambiguous' })
})

test('F: o mesmo valor repetido em dois nós é deduplicado e resolve trusted', () => {
  const documentRef = documentOf(`
    <div class="userColumnContent_5">
      <span>WhatsApp</span>
      <div class="mainContent_5a">554799990001</div>
      <div class="mainContent_5b">554799990001</div>
    </div>
  `)

  const result = phoneEvidence.resolveTrustedPhone(documentRef)

  assert.equal(result.ready, true)
  assert.equal(result.phone, '554799990001')
  assert.equal(result.evidence.candidate_count, 1)
})

test('G: candidato 55-prefixado válido fora de qualquer contexto WhatsApp é rejeitado', () => {
  const documentRef = documentOf(`
    <div class="userColumnContent_6">
      <span>Perfil do contato</span>
      <div class="mainContent_6">554799990001</div>
    </div>
  `)

  const result = phoneEvidence.resolveTrustedPhone(documentRef)

  assert.deepEqual(result, { ready: false, reason: 'phone_unavailable' })
})

test('H: valor de 10 dígitos (curto demais) em contexto WhatsApp é rejeitado', () => {
  const documentRef = documentOf(`
    <div class="userColumnContent_7">
      <span>WhatsApp</span>
      <div class="mainContent_7">5512345678</div>
    </div>
  `)

  const result = phoneEvidence.resolveTrustedPhone(documentRef)

  assert.deepEqual(result, { ready: false, reason: 'phone_unavailable' })
})

test('I: valor de 14 dígitos (longo demais) em contexto WhatsApp é rejeitado', () => {
  const documentRef = documentOf(`
    <div class="userColumnContent_8">
      <span>WhatsApp</span>
      <div class="mainContent_8">55123456789012</div>
    </div>
  `)

  const result = phoneEvidence.resolveTrustedPhone(documentRef)

  assert.deepEqual(result, { ready: false, reason: 'phone_unavailable' })
})

test('J: classes CSS geradas nunca participam da regra — texto misto com rótulo é excluído pelo próprio texto, não pela classe', () => {
  const documentRef = documentOf(`
    <div class="userColumnContentXYZ99_random">
      <span>WhatsApp</span>
      <div class="contentRow_ab12">Tel: 554799990001</div>
      <div class="mainContent_random55">554799990002</div>
    </div>
  `)

  const result = phoneEvidence.resolveTrustedPhone(documentRef)

  assert.equal(result.ready, true)
  assert.equal(result.phone, '554799990002')
})

// Seção 13 — reprodução do achado ao vivo: Contato A -> exatamente 1
// candidato; Contato B -> exatamente 1 candidato, diferente de A; volta a A
// -> exatamente 1 candidato, igual ao A original, diferente de B. O módulo
// não tem estado (sem cache/memoização) — esta reprodução prova que
// chamadas independentes nunca vazam um resultado para a outra.
test('A->B->A: contatos diferentes resolvem candidatos únicos e distintos, sem vazamento entre chamadas', () => {
  const documentA = documentOf(`
    <div class="userColumnContent_a">
      <span>WhatsApp</span>
      <div class="mainContent_a">554799990001</div>
    </div>
  `)
  const documentB = documentOf(`
    <div class="userColumnContent_b">
      <span>WhatsApp</span>
      <div class="mainContent_b">554788880002</div>
    </div>
  `)

  const resultA1 = phoneEvidence.resolveTrustedPhone(documentA)
  assert.equal(resultA1.ready, true)
  assert.equal(resultA1.phone, '554799990001')

  const resultB = phoneEvidence.resolveTrustedPhone(documentB)
  assert.equal(resultB.ready, true)
  assert.equal(resultB.phone, '554788880002')
  assert.notEqual(resultB.phone, resultA1.phone)

  const resultA2 = phoneEvidence.resolveTrustedPhone(documentA)
  assert.equal(resultA2.ready, true)
  assert.equal(resultA2.phone, resultA1.phone)
  assert.notEqual(resultA2.phone, resultB.phone)
})

test('resolveTrustedPhone nunca usa manychat-mainworld-identity-probe.js', () => {
  assert.equal(typeof phoneEvidence.resolveTrustedPhone, 'function')
  assert.equal('YolenManyChatMainWorldIdentityProbe' in phoneEvidence, false)
})
