import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = process.cwd()
const loginPath = path.join(repoRoot, 'app/login/page.tsx')
const loginSource = fs.readFileSync(loginPath, 'utf8')

function includesAll(source, fragments) {
  for (const fragment of fragments) {
    assert.ok(
      source.includes(fragment),
      `Esperava encontrar no login: ${fragment}`,
    )
  }
}

test('preserva o posicionamento comercial e os assets da pagina de login', () => {
  includesAll(loginSource, [
    'Pare de perder lead na operação.',
    'O Yolen organiza sua operação, orienta a próxima ação e conecta a rotina da equipe com a meta.',
    'IA que orienta a próxima ação',
    'SLA e follow-up sob controle',
    'Meta conectada à execução',
    'Menos lead parado',
    'Mais controle gerencial',
    'Mais previsibilidade',
    '/branding/yolen-logo-principal.png',
    '/branding/login-kanban.png',
  ])

  assert.equal(
    fs.existsSync(path.join(repoRoot, 'public/branding/yolen-logo-principal.png')),
    true,
    'Logo principal da pagina de login precisa continuar versionada.',
  )

  assert.equal(
    fs.existsSync(path.join(repoRoot, 'public/branding/login-kanban.png')),
    true,
    'Imagem comercial do Kanban precisa continuar versionada.',
  )
})

test('preserva login, demonstracao e recuperacao de senha', () => {
  includesAll(loginSource, [
    "useState<'login' | 'demo'>('login')",
    "setAuthMode('login')",
    "setAuthMode('demo')",
    'Entrar no Yolen',
    'Solicitar demonstração',
    '/esqueci-senha',
  ])
})

test('preserva o fluxo atual de autenticacao multiempresa', () => {
  includesAll(loginSource, [
    "fetch('/api/session/company'",
    "fetch('/api/me'",
    "router.replace('/select-company')",
    "router.replace('/dashboard')",
  ])
})
