import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)

const view = require('../src/companion-lead-summary-view.js')

test('estado loading mostra atualização automática do resumo', () => {
  const html = view.renderLeadSummarySection({ status: 'loading' })

  assert.match(html, /Resumo atual/i)
  assert.match(html, /Atualizando resumo/)
  assert.doesNotMatch(html, /Escreva ou ajuste/i)
})

test('estado error renderiza a mensagem escapada e oferece nova tentativa', () => {
  const html = view.renderLeadSummarySection({
    status: 'error',
    error: '<script>alert(1)</script>',
  })

  assert.match(html, /yolen-lead-summary--error/)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /data-yolen-action="refresh"/)
})

test('working summary vindo do histórico antigo aparece mesmo sem resumo canônico', () => {
  const html = view.renderLeadSummarySection({
    status: 'ready',
    data: {
      summary: null,
      working_summary:
        'Larissa já conhece a proposta da Yolen e apresentou objeção de investimento.',
      working_summary_source: 'legacy_history',
      has_unsaved_changes: true,
    },
  })

  assert.match(html, /Larissa já conhece a proposta da Yolen/)
  assert.match(html, /Histórico já salvo na Yolen/)
  assert.match(html, /Salvar resumo na Yolen/)
  assert.doesNotMatch(html, /Ainda não existe resumo salvo/)
})

test('não existe textarea ou campo manual visível; compatibilidade usa input hidden', () => {
  const html = view.renderLeadSummarySection({
    status: 'ready',
    data: {
      summary: null,
      working_summary: 'Resumo criado automaticamente pela Yolen.',
      working_summary_source: 'conversation_only',
      has_unsaved_changes: true,
    },
  })

  assert.doesNotMatch(html, /<textarea/i)
  assert.doesNotMatch(html, /Escreva ou ajuste/i)
  assert.match(html, /<input type="hidden" data-yolen-textarea="lead-summary"/)
})

test('resumo longo fica compacto e oferece expansão do conteúdo completo', () => {
  const longSummary =
    'Larissa já conhece a proposta da Yolen e relatou perda de oportunidades por falta de follow-up. ' +
    'Foram discutidos organização dos leads, acompanhamento da equipe, funcionamento da solução e investimento. ' +
    'Também houve objeção relacionada ao preço, necessidade de avaliação interna e dúvidas sobre a aplicação prática. ' +
    'A conversa mais recente foi informal e não alterou o contexto comercial já construído.'

  const html = view.renderLeadSummarySection({
    status: 'ready',
    data: {
      summary: null,
      working_summary: longSummary,
      working_summary_source: 'legacy_history_plus_conversation',
      has_unsaved_changes: true,
    },
  })

  assert.match(html, /class="yolen-lead-summary-details"/)
  assert.match(html, /data-yolen-preserve-details="lead-summary-full"/)
  assert.match(html, /class="yolen-lead-summary-preview"/)
  assert.match(html, /Ver resumo completo/)
  assert.match(html, /Ocultar resumo/)
  assert.match(html, /class="yolen-lead-summary-full-text"/)
})

test('resumo curto permanece direto sem controle de expansão desnecessário', () => {
  const html = view.renderLeadSummarySection({
    status: 'ready',
    data: {
      summary: null,
      working_summary: 'Cliente pediu retorno amanhã sobre a proposta enviada.',
      working_summary_source: 'conversation_only',
      has_unsaved_changes: true,
    },
  })

  assert.match(html, /yolen-lead-summary-text/)
  assert.doesNotMatch(html, /Ver resumo completo/)
  assert.doesNotMatch(html, /class="yolen-lead-summary-details"/)
})

test('resumo canônico sem mudanças mostra estado salvo e não oferece novo save', () => {
  const html = view.renderLeadSummarySection({
    status: 'ready',
    data: {
      summary: {
        summary: 'Resumo consolidado já salvo.',
        version: 2,
        updated_at: '2026-08-25T12:00:00.000Z',
      },
      working_summary: 'Resumo consolidado já salvo.',
      working_summary_source: 'canonical',
      has_unsaved_changes: false,
    },
  })

  assert.match(html, /Resumo consolidado já salvo\./)
  assert.match(html, /Versão 2/)
  assert.match(html, /Resumo salvo na Yolen\./)
  assert.doesNotMatch(html, /data-yolen-action="save-lead-summary"/)
})

test('working summary com conteúdo HTML é escapado no texto e no input hidden', () => {
  const html = view.renderLeadSummarySection({
    status: 'ready',
    data: {
      summary: null,
      working_summary: '</input><img src=x onerror=alert(1)>',
      working_summary_source: 'conversation_only',
      has_unsaved_changes: true,
    },
  })

  assert.doesNotMatch(html, /<img src=x/)
})

test('feedback de conflito continua visível', () => {
  const html = view.renderLeadSummarySection({
    status: 'ready',
    data: {
      summary: null,
      working_summary: 'Resumo automático.',
      working_summary_source: 'conversation_only',
      has_unsaved_changes: true,
    },
    saveStatus: 'conflict',
  })

  assert.match(html, /yolen-lead-summary-feedback--conflict/)
  assert.match(html, /Atualize antes de salvar novamente/)
})

test('botão de salvar fica desabilitado enquanto saveStatus é saving', () => {
  const html = view.renderLeadSummarySection({
    status: 'ready',
    data: {
      summary: null,
      working_summary: 'Resumo automático.',
      working_summary_source: 'conversation_only',
      has_unsaved_changes: true,
    },
    saveStatus: 'saving',
  })

  assert.match(html, /Salvando…/)
  assert.match(html, /yolen-lead-summary-save-button.*disabled/s)
})
