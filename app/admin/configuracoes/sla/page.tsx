'use client'

import React, { useEffect, useState, useCallback } from 'react'

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
type Status = 'novo' | 'contato' | 'respondeu' | 'negociacao' | 'ganho' | 'perdido'

type SLARule = {
  id: string
  status: Status
  target_minutes: number
  warning_minutes: number
  danger_minutes: number
}

const DEFAULT_RULES: Record<Status, Omit<SLARule, 'id'>> = {
  novo: { status: 'novo', target_minutes: 1440, warning_minutes: 1440, danger_minutes: 2880 },
  contato: { status: 'contato', target_minutes: 2880, warning_minutes: 2880, danger_minutes: 4320 },
  respondeu: { status: 'respondeu', target_minutes: 1440, warning_minutes: 1440, danger_minutes: 2880 },
  negociacao: { status: 'negociacao', target_minutes: 4320, warning_minutes: 4320, danger_minutes: 7200 },
  ganho: { status: 'ganho', target_minutes: 999999, warning_minutes: 999999, danger_minutes: 999999 },
  perdido: { status: 'perdido', target_minutes: 999999, warning_minutes: 999999, danger_minutes: 999999 },
}

const STATUSES: Status[] = ['novo', 'contato', 'respondeu', 'negociacao', 'ganho', 'perdido']

export default function SLAConfigPage() {
  const supabase = supabaseBrowser()
  const [rules, setRules] = useState<SLARule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const loadRules = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: err } = await supabase.rpc('rpc_get_company_sla_rules')

      if (err) throw err

      // Se não houver regras, usar defaults
      if (!data || data.length === 0) {
        setRules(
          STATUSES.map((status) => ({
            id: `${status}-default`,
            ...DEFAULT_RULES[status],
          }))
        )
      } else {
        setRules(data)
      }
    } catch (e: any) {
      console.error('Erro ao carregar SLA:', e)
      setError(e?.message ?? 'Erro ao carregar configurações')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    void loadRules()
  }, [loadRules])

  const handleChangeRule = (status: Status, field: keyof Omit<SLARule, 'id' | 'status'>, value: number) => {
    setRules((prev) =>
      prev.map((rule) => (rule.status === status ? { ...rule, [field]: value } : rule))
    )
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      setSuccess(false)

      // Preparar payload (sem IDs default)
      const payload = rules
        .filter((r) => !r.id.endsWith('-default'))
        .map((r) => ({
          status: r.status,
          target_minutes: r.target_minutes,
          warning_minutes: r.warning_minutes,
          danger_minutes: r.danger_minutes,
        }))
        .concat(
          rules
            .filter((r) => r.id.endsWith('-default'))
            .map((r) => ({
              status: r.status,
              target_minutes: r.target_minutes,
              warning_minutes: r.warning_minutes,
              danger_minutes: r.danger_minutes,
            }))
        )

      const { data, error: err } = await supabase.rpc('rpc_upsert_company_sla_rules', {
        p_rules: payload,
      })

      if (err) throw err
      if (!data?.success) throw new Error('Falha ao salvar regras')

      setSuccess(true)
      await loadRules()

      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      console.error('Erro ao salvar SLA:', e)
      setError(e?.message ?? 'Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  const minutesToDisplay = (minutes: number): string => {
    if (minutes >= 1440) {
      const days = Math.floor(minutes / 1440)
      return `${days}d`
    }
    return `${minutes}m`
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', opacity: 0.7 }}>
        Carregando configurações...
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', background: '#0b0b0b', minHeight: '100vh', color: 'white' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '24px' }}>Configurar SLA por Etapa</h1>

        {error && (
          <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div style={{ background: '#065f46', color: '#d1fae5', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
            ✓ Configurações salvas com sucesso!
          </div>
        )}

        <div style={{ display: 'grid', gap: '16px', marginBottom: '24px' }}>
          {rules.map((rule) => (
            <div
              key={rule.status}
              style={{
                border: '1px solid #222',
                borderRadius: '8px',
                padding: '16px',
                background: '#111',
              }}
            >
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, marginBottom: '6px', opacity: 0.7 }}>
                    Etapa
                  </label>
                  <div style={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase' }}>
                    {rule.status}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, marginBottom: '6px', opacity: 0.7 }}>
                    Target (OK) - {minutesToDisplay(rule.target_minutes)}
                  </label>
                  <input
                    type="number"
                    value={rule.target_minutes}
                    onChange={(e) => handleChangeRule(rule.status, 'target_minutes', parseInt(e.target.value) || 0)}
                    disabled={rule.status === 'ganho' || rule.status === 'perdido'}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #2a2a2a',
                      background: '#222',
                      color: 'white',
                      fontSize: '12px',
                    }}
                  />
                  <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px' }}>minutos</div>
                </div>

                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, marginBottom: '6px', opacity: 0.7 }}>
                    Aviso (🟡) - {minutesToDisplay(rule.warning_minutes)}
                  </label>
                  <input
                    type="number"
                    value={rule.warning_minutes}
                    onChange={(e) => handleChangeRule(rule.status, 'warning_minutes', parseInt(e.target.value) || 0)}
                    disabled={rule.status === 'ganho' || rule.status === 'perdido'}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #2a2a2a',
                      background: '#222',
                      color: 'white',
                      fontSize: '12px',
                    }}
                  />
                  <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px' }}>minutos</div>
                </div>

                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, marginBottom: '6px', opacity: 0.7 }}>
                    Crítico (🔴) - {minutesToDisplay(rule.danger_minutes)}
                  </label>
                  <input
                    type="number"
                    value={rule.danger_minutes}
                    onChange={(e) => handleChangeRule(rule.status, 'danger_minutes', parseInt(e.target.value) || 0)}
                    disabled={rule.status === 'ganho' || rule.status === 'perdido'}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #2a2a2a',
                      background: '#222',
                      color: 'white',
                      fontSize: '12px',
                    }}
                  />
                  <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px' }}>minutos</div>
                </div>
              </div>

              {(rule.status === 'ganho' || rule.status === 'perdido') && (
                <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '8px', fontStyle: 'italic' }}>
                  Etapas finais não têm SLA
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            border: 'none',
            background: !saving ? '#10b981' : '#1f2937',
            color: 'white',
            cursor: !saving ? 'pointer' : 'not-allowed',
            fontWeight: 900,
            fontSize: '14px',
            opacity: !saving ? 1 : 0.5,
          }}
        >
          {saving ? 'Salvando…' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  )
}