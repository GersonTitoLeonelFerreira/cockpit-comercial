import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveCommercialMethodHomeState } from './commercial-method-home.ts'

function workspace(published = null) {
  return {
    draft: null,
    published,
    archived_versions: [],
    products: [],
  }
}

function builder(overrides = {}) {
  return {
    id: 'builder-1',
    company_id: 'company-1',
    contract_version: 'commercial-method-builder-v1',
    current_step: 1,
    completed_steps: [],
    ready_for_method: false,
    data: {},
    created_by: 'user-1',
    updated_by: 'user-1',
    created_at: '2026-08-27T00:00:00.000Z',
    updated_at: '2026-08-27T01:00:00.000Z',
    ...overrides,
  }
}

function methodDefinition() {
  return {
    contract_version: 'commercial-method-v2',
    name: 'AVANÇAR',
    description: 'Método da empresa',
    principles: ['Confirmar entendimento'],
    stages: [],
  }
}

function construction(overrides = {}) {
  return {
    company_id: 'company-1',
    ready_for_method: true,
    diagnosis: {},
    status: 'editing',
    construction: {
      contract_version: 'commercial-method-construction-v1',
      synthesis_version: 'v2',
      construction_step: 'structure',
      method_name: 'AVANÇAR',
      method_description: 'Método da empresa',
      stages: [],
      principles: [],
      active_stage_id: null,
    },
    method_definition: null,
    method_started_at: '2026-08-27T01:30:00.000Z',
    method_updated_at: '2026-08-27T02:00:00.000Z',
    method_synthesis_version: 'v2',
    updated_at: '2026-08-27T02:00:00.000Z',
    ...overrides,
  }
}

function publishedBundle(definition = methodDefinition()) {
  return {
    version: {
      id: 'version-4',
      company_id: 'company-1',
      version_number: 4,
      contract_version: 'commercial-config-v1',
      status: 'published',
      business_description: '',
      target_audience: '',
      value_proposition: '',
      commercial_method_name: 'AVANÇAR',
      commercial_method_description: 'Método da empresa',
      commercial_method_contract_version: 'commercial-method-v2',
      commercial_method_definition: definition,
      communication_tone: '',
      required_behaviors: [],
      prohibited_behaviors: [],
      created_by: 'user-1',
      published_by: 'user-1',
      archived_by: null,
      created_at: '2026-08-27T01:00:00.000Z',
      updated_at: '2026-08-27T02:00:00.000Z',
      published_at: '2026-08-27T02:00:00.000Z',
      archived_at: null,
    },
    method_steps: [],
    product_profiles: [],
    facts: [],
    objection_guides: [],
  }
}

test('home inicia pela jornada guiada quando não existe diagnóstico', () => {
  const state = deriveCommercialMethodHomeState({
    builder: null,
    construction: null,
    workspace: workspace(),
  })

  assert.equal(state.next_action.key, 'start_diagnosis')
  assert.equal(state.published.exists, false)
  assert.equal(state.draft.exists, false)
})

test('home retoma diagnóstico incompleto sem pular para construção', () => {
  const state = deriveCommercialMethodHomeState({
    builder: builder(),
    construction: null,
    workspace: workspace(),
  })

  assert.equal(state.next_action.key, 'continue_diagnosis')
  assert.equal(state.draft.status, 'diagnosis')
})

test('review_ready diferente da versão ativa exige publicação explícita', () => {
  const current = methodDefinition()
  const proposed = {
    ...current,
    name: 'AVANÇAR 2',
  }

  const state = deriveCommercialMethodHomeState({
    builder: builder({ ready_for_method: true }),
    construction: construction({
      status: 'review_ready',
      method_definition: proposed,
    }),
    workspace: workspace(publishedBundle(current)),
  })

  assert.equal(state.next_action.key, 'publish_changes')
  assert.equal(state.draft.has_unpublished_changes, true)
  assert.equal(state.published.companion_using, true)
})

test('versão publicada igual ao método revisado fica sem ação pendente', () => {
  const current = methodDefinition()

  const state = deriveCommercialMethodHomeState({
    builder: builder({ ready_for_method: true }),
    construction: construction({
      status: 'review_ready',
      method_definition: current,
    }),
    workspace: workspace(publishedBundle(current)),
  })

  assert.equal(state.next_action.key, 'up_to_date')
  assert.equal(state.draft.has_unpublished_changes, false)
  assert.equal(state.published.version, 4)
  assert.equal(state.published.companion_using, true)
})
