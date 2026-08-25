import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)

const view = require('../src/companion-lead-summary-view.js')

test('estado loading renderiza mensagem de carregamento', () => {
  const html = view.renderLeadSummarySection({ status: 'loading' })

  assert.match(html, /Carregando resumo salvo na Yolen/)
})

test('estado error renderiza a mensagem de erro escapada', () => {
  const html = view.renderLeadSummarySection({
    status: 'error',
    error: '<script>alert(1)</script>',
  })

  assert.match(html, /yolen-lead-summary--error/)
  assert.doesNotMatch(html, /<script>/)
})

test('estado ready sem resumo mostra o vazio correto, nunca copy de análise', () => {
  const html = view.renderLeadSummarySection({
    status: 'ready',
    data: { summary: null },
  })

  assert.match(html, /Ainda não existe resumo salvo para este lead\./)
  assert.doesNotMatch(html, /sem evidência comercial/i)
})

test('estado ready com resumo mostra texto, versão e botão de salvar', () => {
  const html = view.renderLeadSummarySection({
    status: 'ready',
    data: {
      summary: {
        summary: 'Larissa perde oportunidades por falta de follow-up.',
        version: 2,
        updated_at: '2026-08-25T12:00:00.000Z',
      },
    },
  })

  assert.match(html, /Larissa perde oportunidades por falta de follow-up\./)
  assert.match(html, /Versão 2/)
  assert.match(html, /data-yolen-action="save-lead-summary"/)
  assert.match(html, /data-yolen-textarea="lead-summary"/)
})

test('textarea escapa conteúdo do resumo (sem quebrar o HTML)', () => {
  const html = view.renderLeadSummarySection({
    status: 'ready',
    data: {
      summary: {
        summary: '</textarea><img src=x onerror=alert(1)>',
        version: 1,
        updated_at: null,
      },
    },
  })

  assert.doesNotMatch(html, /<img src=x/)
})

test('feedback de conflito de versão aparece quando saveStatus é conflict', () => {
  const html = view.renderLeadSummarySection({
    status: 'ready',
    data: { summary: null },
    saveStatus: 'conflict',
  })

  assert.match(html, /yolen-lead-summary-feedback--conflict/)
  assert.match(html, /Recarregue antes de salvar novamente/)
})

test('botão de salvar fica desabilitado enquanto saveStatus é saving', () => {
  const html = view.renderLeadSummarySection({
    status: 'ready',
    data: { summary: null },
    saveStatus: 'saving',
  })

  assert.match(html, /Salvando…/)
  assert.match(html, /yolen-lead-summary-save-button.*disabled/s)
})
