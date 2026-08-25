import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const view = require('../src/companion-lead-summary-view.js')

function buildState(methodGuidance) {
  return {
    status: 'ready',
    data: {
      summary: null,
      working_summary:
        'Larissa conhece a proposta da Yolen, relatou perda de follow-ups e apresentou objeção de investimento.',
      working_summary_source: 'legacy_history_plus_conversation',
      has_unsaved_changes: true,
      method_guidance: methodGuidance,
    },
  }
}

test('resumo aparece enquanto o próximo passo ainda está sendo definido', () => {
  const html = view.renderLeadSummarySection(
    buildState({
      status: 'loading',
      method_name: null,
      method_config_version_id: null,
      stage_key: null,
      stage_name: null,
      stage_reason: null,
      next_step: null,
      error: null,
    }),
  )

  assert.match(html, /Larissa conhece a proposta da Yolen/)
  assert.match(html, /Definindo próximo passo pelo método/)
  assert.match(html, /data-yolen-method-guidance-slot/)
})

test('mostra próximo passo específico com método e etapa', () => {
  const html = view.renderLeadSummarySection(
    buildState({
      status: 'ready',
      method_name: 'Método Yolen',
      method_config_version_id: 'config-1',
      stage_key: 'diagnostico',
      stage_name: 'Diagnóstico',
      stage_reason: 'Ainda falta quantificar o impacto.',
      next_step:
        'Confirme se a perda de follow-ups ainda é uma prioridade e obtenha um exemplo concreto de oportunidade perdida antes de retomar a proposta.',
      error: null,
    }),
  )

  assert.match(html, /Próximo passo/)
  assert.match(html, /Confirme se a perda de follow-ups ainda é uma prioridade/)
  assert.match(html, /Método: Método Yolen/)
  assert.match(html, /Etapa: Diagnóstico/)
  assert.doesNotMatch(html, /Copiar mensagem/)
  assert.doesNotMatch(html, /Inserir mensagem/)
})

test('método ausente não quebra nem esconde o resumo', () => {
  const html = view.renderLeadSummarySection(
    buildState({
      status: 'missing_method',
      method_name: null,
      method_config_version_id: null,
      stage_key: null,
      stage_name: null,
      stage_reason: null,
      next_step: null,
      error: null,
    }),
  )

  assert.match(html, /Larissa conhece a proposta da Yolen/)
  assert.match(html, /Método comercial ainda não publicado/)
})

test('falha da orientação preserva resumo, mostra causa e permite retry', () => {
  const html = view.renderLeadSummarySection(
    buildState({
      status: 'error',
      method_name: 'Método Yolen',
      method_config_version_id: 'config-1',
      stage_key: null,
      stage_name: null,
      stage_reason: null,
      next_step: null,
      error: 'A orientação não ficou específica o suficiente para ser exibida.',
    }),
  )

  assert.match(html, /Larissa conhece a proposta da Yolen/)
  assert.match(html, /Não foi possível definir o próximo passo agora/)
  assert.match(html, /A orientação não ficou específica o suficiente/)
  assert.match(html, /data-yolen-action="retry-method-guidance"/)
  assert.match(html, /Tentar novamente/)
})
