import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [
  experience,
  journey,
  construction,
  builderRoute,
  methodRoute,
  publication,
] = await Promise.all([
  readFile(
    'app/admin/configuracao-comercial/CommercialConfigExperience.tsx',
    'utf8',
  ),
  readFile(
    'app/admin/configuracao-comercial/guided-journey/GuidedMethodJourney.tsx',
    'utf8',
  ),
  readFile(
    'app/admin/configuracao-comercial/AssistedMethodConstruction.tsx',
    'utf8',
  ),
  readFile(
    'app/api/admin/commercial-method-builder/route.ts',
    'utf8',
  ),
  readFile(
    'app/api/admin/commercial-method-builder/method/route.ts',
    'utf8',
  ),
  readFile(
    'app/admin/configuracao-comercial/MethodPublicationPanel.tsx',
    'utf8',
  ),
])

test('home do método usa lifecycle real e não polling periódico', () => {
  assert.doesNotMatch(experience, /setInterval\s*\(/)
  assert.match(experience, /\/api\/admin\/commercial-method-builder/)
  assert.match(
    experience,
    /\/api\/admin\/commercial-method-builder\/method/,
  )
  assert.match(experience, /\/api\/admin\/commercial-config/)
})

test('home explicita ativo, rascunho, próxima ação e Companion', () => {
  assert.match(experience, /Ativo na Yolen/)
  assert.match(experience, /Rascunho/)
  assert.match(experience, /Próxima ação/)
  assert.match(experience, /Em uso pelo Yolen Companion/)
  assert.match(experience, /Configuração avançada/)
  assert.match(experience, /Visão executiva/)
})

test('transição do diagnóstico depende de save confirmado', () => {
  assert.match(
    journey,
    /const persisted = await save\(\)[\s\S]*if \(persisted\) onReadyForConstruction\(\)/,
  )
  assert.match(
    journey,
    /const persisted = dirty \? await save\(\) : true[\s\S]*if \(persisted\) onBack\(\)/,
  )
})

test('diagnóstico e construção enviam versão esperada e APIs expõem conflito 409', () => {
  assert.match(journey, /x-yolen-builder-updated-at/)
  assert.match(construction, /x-yolen-method-updated-at/)
  assert.match(builderRoute, /STALE_BUILDER_DRAFT/)
  assert.match(builderRoute, /status: 409/)
  assert.match(methodRoute, /STALE_METHOD_CONSTRUCTION/)
  assert.match(methodRoute, /status: 409/)
})

test('recompile aplica somente ao rascunho e publicação mantém ação separada', () => {
  assert.match(construction, /Versão atual → proposta nova/)
  assert.match(construction, /Manter método atual/)
  assert.match(construction, /Aplicar ao rascunho/)
  assert.doesNotMatch(construction, /Atualizar e publicar/)

  assert.match(publication, /Atualmente ativo/)
  assert.match(publication, /O que será publicado/)
  assert.match(publication, /Publicar agora/)
  assert.match(publication, /permanece ativo até a publicação concluir/)
})
