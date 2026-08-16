import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript = readFileSync(
  new URL('../src/content-script.js', import.meta.url),
  'utf8',
)

test(
  'startup resolve o lead somente depois de obter o telefone',
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
      'if (state.conversationPhone) {',
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
  },
)
