// Rodada 11 (HML), item C1: página do lead no Yolen web. Com a flag ligada,
// o quadro "Orientações da IA" não aparece (as orientações já estão na
// Leitura do Companion); com a flag desligada, a página fica como hoje.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const toggle = readFileSync(new URL('../../sales-cycles/[id]/components/CopilotTogglePanel.tsx', import.meta.url), 'utf8')
const page = readFileSync(new URL('../../leads/[id]/page.tsx', import.meta.url), 'utf8')
const history = readFileSync(new URL('../../sales-cycles/[id]/components/AICoachingHistory.tsx', import.meta.url), 'utf8')

const branchStart =
  toggle.indexOf('if (companionReadingHref) {')

const defaultStart =
  toggle.indexOf('return (\n    <>\n      <div\n        style={{\n          background', branchStart + 30)

const companionBranch =
  toggle.slice(branchStart, defaultStart)

const defaultBranch =
  toggle.slice(defaultStart)

test('C1: com a flag (HML), sem o quadro "Orientações da IA" — só a Leitura do Companion', () => {
  assert.notEqual(branchStart, -1)
  assert.notEqual(defaultStart, -1)

  assert.match(history, /Orientações da IA/)
  assert.doesNotMatch(companionBranch, /<AICoachingHistory/)
  assert.match(companionBranch, /Ver a leitura do Companion/)

  // A página do lead só passa o link com a flag ligada.
  assert.match(page, /companionReadingHref=\{\s*isFullReadingPanelEnabled\(process\.env\)\s*\?\s*'#leitura-do-companion'\s*:\s*null\s*\}/)
})

test('C1: sem a flag, a página fica como hoje (Copiloto e "Orientações da IA")', () => {
  assert.match(defaultBranch, /<ConversationCopilot cycle=\{cycle\} \/>/)
  assert.match(defaultBranch, /<AICoachingHistory cycleId=\{cycle\.id\} \/>/)
})
