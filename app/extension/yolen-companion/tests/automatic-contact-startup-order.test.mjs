import assert from 'node:assert/strict'
import test from 'node:test'
import { readWhatsAppCompositionSource } from './support/whatsapp-composition-source.mjs'

const contentScript = readWhatsAppCompositionSource()

// FASE 7 (§10.4): a evidência que libera a resolução no startup é telefone
// confiável OU identidade externa segura — nunca nenhuma das duas.
test(
  'startup resolve o lead somente depois de obter evidência de contato',
  () => {
    const start = contentScript.indexOf(
      'if (options.resolveLeadAfterLoad === true && !state.isSelfConversation) {',
    )
    const end = contentScript.indexOf(
      '} catch (error) {',
      start,
    )

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    const block = contentScript.slice(
      start,
      end,
    )

    const phoneGate = block.indexOf(
      'if (hasCurrentContactEvidence()) {',
    )
    const resolve = block.indexOf(
      'resolveCurrentLead()',
    )
    const lookup = block.indexOf(
      'runAutomaticContactLookup(',
    )

    assert.ok(phoneGate >= 0)
    assert.ok(resolve > phoneGate)
    assert.ok(lookup > phoneGate)

    const beforePhoneGate = block.slice(
      0,
      phoneGate,
    )

    assert.doesNotMatch(
      beforePhoneGate,
      /resolveCurrentLead\(\)/,
    )

    assert.match(
      block,
      /else if \(state\.conversationKey\)/,
    )

    const helperStart = contentScript.indexOf(
      'function hasCurrentContactEvidence() {',
    )
    assert.notEqual(helperStart, -1)
    const helper = contentScript.slice(
      helperStart,
      contentScript.indexOf('\n  }', helperStart),
    )
    assert.match(helper, /state\.conversationPhone/)
    assert.match(helper, /state\.conversationExternalIdentity/)
  },
)
