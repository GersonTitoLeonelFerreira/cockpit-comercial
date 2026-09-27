import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const core = await readFile(
  new URL('../src/companion-core.js', import.meta.url),
  'utf8',
)

const styles = await readFile(
  new URL('../src/styles.css', import.meta.url),
  'utf8',
)

test('header fechado prioriza o nome do usuário em vez do nome da empresa', () => {
  const start = core.indexOf(
    'function getPanelHeaderHtml()',
  )
  const end = core.indexOf(
    'function getContactCardHtml()',
    start,
  )
  const block = core.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(
    block,
    /state\.userName/,
  )
  assert.match(
    block,
    /toggle-account-menu/,
  )
  assert.doesNotMatch(
    block,
    /state\.companyName\s*\|\|\s*'Empresa não carregada'/,
    'empresa não deve voltar a ser a identidade principal do header fechado',
  )
})

test('menu aberto mostra usuário completo, empresa completa, perfil e sessão', () => {
  const start = core.indexOf(
    'function getAccountMenuHtml()',
  )
  const end = core.indexOf(
    'function getPanelHeaderHtml()',
    start,
  )
  const block = core.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(block, /state\.userName/)
  assert.match(block, /state\.companyName/)
  assert.match(block, /getCompanyRoleLabel\(\)/)
  assert.match(block, /getCompactConnectionLabel\(\)/)
  assert.match(block, /Usuário do sistema/)
  assert.match(block, />Empresa</)
  assert.match(block, />Perfil</)
  assert.match(block, />Sessão</)
})

test('nome completo e empresa podem quebrar linha dentro do menu', () => {
  assert.match(
    styles,
    /\.yolen-account-menu-name\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/,
  )

  assert.match(
    styles,
    /\.yolen-account-detail-value\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/,
  )
})

test('menu pode ser fechado por Escape, clique externo e recolhimento do Companion', () => {
  assert.match(
    core,
    /event\.key !== 'Escape'/,
  )
  assert.match(
    core,
    /\[data-yolen-account-menu\]/,
  )
  assert.match(
    core,
    /if \(panelCollapsed\) \{\s*accountMenuOpen = false/,
  )
})
