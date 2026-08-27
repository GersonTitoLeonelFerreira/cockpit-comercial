'use client'

import * as React from 'react'

import type { CommercialMethodDefinition } from '@/app/lib/companion/commercial-method-contract'

const DS = {
  cardBg: '#141722',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderStrong: '#252a3d',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  greenSoft: '#86efac',
  yellowSoft: '#fcd34d',
  redSoft: '#fca5a5',
  radius: 8,
  radiusContainer: 10,
} as const

export interface PublishedMethodInfo {
  method_name: string
  version_number: number
  published_at: string | null
  contract_version: string
  definition: CommercialMethodDefinition | null
}

type PublishBuilderMethodResponse =
  | { ok: true; result: { method_name: string; version_number: number } }
  | { ok: false; error: string; code?: string }

interface Props {
  methodName: string
  methodDefinition: CommercialMethodDefinition
  published: PublishedMethodInfo | null
  publishedLoading: boolean
  onPublished: () => void
}

// Comparação estrutural insensível à ordem de chaves — jsonb não garante
// preservar a ordem de inserção ao voltar do banco. É apenas para decidir
// o rótulo exibido; a fonte de verdade real é o servidor (ver seção 14).
function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true

  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }
    return a.every((item, index) => deepEqualJson(item, b[index]))
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aRecord = a as Record<string, unknown>
    const bRecord = b as Record<string, unknown>
    const aKeys = Object.keys(aRecord)
    const bKeys = Object.keys(bRecord)

    if (aKeys.length !== bKeys.length) return false

    return aKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(bRecord, key) &&
        deepEqualJson(aRecord[key], bRecord[key]),
    )
  }

  return false
}

export function isMethodPublishedUpToDate(
  published: PublishedMethodInfo | null,
  methodDefinition: CommercialMethodDefinition,
): boolean {
  return (
    !!published &&
    published.contract_version === 'commercial-method-v2' &&
    deepEqualJson(published.definition, methodDefinition)
  )
}

function formatDate(value: string | null): string {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return value
  }
}

export default function MethodPublicationPanel({
  methodName,
  methodDefinition,
  published,
  publishedLoading,
  onPublished,
}: Props) {
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [publishing, setPublishing] = React.useState(false)
  const [publishError, setPublishError] = React.useState<string | null>(null)

  const upToDate = isMethodPublishedUpToDate(published, methodDefinition)

  async function confirmPublish() {
    setPublishing(true)
    setPublishError(null)
    try {
      const response = await fetch(
        '/api/admin/commercial-method-builder/publish',
        { method: 'POST' },
      )
      const json = (await response.json()) as PublishBuilderMethodResponse
      if (!response.ok || !json.ok) {
        throw new Error(json.ok ? 'Erro ao publicar o método.' : json.error)
      }
      setConfirmOpen(false)
      onPublished()
    } catch (error: unknown) {
      setPublishError(
        error instanceof Error ? error.message : 'Erro ao publicar o método.',
      )
    } finally {
      setPublishing(false)
    }
  }

  if (publishedLoading) {
    return (
      <div
        style={{
          background: DS.cardBg,
          border: `1px solid ${DS.border}`,
          borderRadius: DS.radiusContainer,
          color: DS.textSecondary,
          fontSize: 11,
          padding: 16,
        }}
      >
        Verificando o status de publicação...
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {upToDate ? (
        <div
          style={{
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(134,239,172,0.25)',
            borderRadius: DS.radiusContainer,
            padding: 16,
          }}
        >
          <strong style={{ color: DS.greenSoft, fontSize: 12 }}>
            Método ativo e atualizado
          </strong>
          <div style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.55, marginTop: 5 }}>
            Esta é a mesma versão publicada que o Yolen Companion usa como método operacional.
          </div>
        </div>
      ) : (
        <div
          style={{
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(252,211,77,0.25)',
            borderRadius: DS.radiusContainer,
            padding: 16,
          }}
        >
          <strong style={{ color: DS.yellowSoft, fontSize: 12 }}>
            Alterações aguardando publicação
          </strong>
          <div style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.55, marginTop: 5 }}>
            O rascunho não altera a operação sozinho. O Yolen Companion continua
            usando {published ? `“${published.method_name}” · V${published.version_number}` : 'nenhum método estruturado'}
            até sua confirmação explícita de publicação.
          </div>
        </div>
      )}

      <div
        style={{
          background: DS.cardBg,
          border: `1px solid ${DS.border}`,
          borderRadius: DS.radiusContainer,
          display: 'grid',
          gap: 14,
          padding: 18,
        }}
      >
        <div>
          <div style={{ color: DS.blueSoft, fontSize: 10, fontWeight: 850, textTransform: 'uppercase' }}>
            Atualmente ativo
          </div>
          {published ? (
            <div style={{ color: DS.textPrimary, fontSize: 13, marginTop: 6 }}>
              {published.method_name} · Versão {published.version_number}
              <div style={{ color: DS.textMuted, fontSize: 10, marginTop: 3 }}>
                Publicado em {formatDate(published.published_at)}
              </div>
            </div>
          ) : (
            <div style={{ color: DS.textMuted, fontSize: 12, marginTop: 6 }}>
              Nenhum método publicado ainda.
            </div>
          )}
        </div>

        <div style={{ background: DS.border, height: 1, width: '100%' }} />

        <div>
          <div style={{ color: DS.blueSoft, fontSize: 10, fontWeight: 850, textTransform: 'uppercase' }}>
            O que será publicado
          </div>
          <div style={{ color: DS.textPrimary, fontSize: 13, marginTop: 6 }}>
            {methodName || 'Método ainda sem nome'}
            <div style={{ color: DS.textMuted, fontSize: 10, marginTop: 3 }}>
              {upToDate ? 'Já publicado' : 'Pronto para publicação'}
            </div>
          </div>
        </div>

        {!upToDate && (
          <button
            type="button"
            disabled={publishing}
            onClick={() => {
              setPublishError(null)
              setConfirmOpen(true)
            }}
            style={{
              background: DS.blue,
              border: 0,
              borderRadius: DS.radius,
              color: '#fff',
              cursor: publishing ? 'wait' : 'pointer',
              fontSize: 12,
              fontWeight: 850,
              justifySelf: 'start',
              padding: '11px 18px',
            }}
          >
            Publicar método
          </button>
        )}

        {publishError && (
          <div
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: DS.radius,
              color: DS.redSoft,
              fontSize: 11,
              lineHeight: 1.55,
              padding: 12,
            }}
          >
            <strong>Falha ao publicar.</strong> {publishError}
            <div style={{ color: DS.textSecondary, marginTop: 4 }}>
              {published
                ? `O método “${published.method_name}” continua ativo. Nenhuma troca foi concluída.`
                : 'Nenhum método foi publicado ainda. Nenhuma troca foi concluída.'}
            </div>
            <button
              type="button"
              onClick={() => void confirmPublish()}
              disabled={publishing}
              style={{
                background: 'transparent',
                border: `1px solid ${DS.borderStrong}`,
                borderRadius: DS.radius,
                color: DS.blueSoft,
                cursor: publishing ? 'wait' : 'pointer',
                fontSize: 11,
                fontWeight: 750,
                marginTop: 10,
                padding: '8px 12px',
              }}
            >
              Tentar publicar novamente
            </button>
          </div>
        )}
      </div>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar publicação do método"
          aria-describedby="commercial-method-publish-description"
          style={{
            alignItems: 'center',
            background: 'rgba(4,6,12,0.72)',
            display: 'flex',
            inset: 0,
            justifyContent: 'center',
            padding: 20,
            position: 'fixed',
            zIndex: 60,
          }}
        >
          <div
            style={{
              background: DS.cardBg,
              border: `1px solid ${DS.borderStrong}`,
              borderRadius: DS.radiusContainer,
              maxWidth: 440,
              padding: 22,
            }}
          >
            <h3 style={{ color: DS.textPrimary, fontSize: 16, margin: 0 }}>
              Publicar método
            </h3>
            <p
              id="commercial-method-publish-description"
              style={{ color: DS.textSecondary, fontSize: 12, lineHeight: 1.65, marginTop: 12 }}
            >
              Você está confirmando a troca da versão operacional. Somente depois
              desta ação o novo método passará a ser usado pelo Yolen Companion.
              {published
                ? ` “${published.method_name}” · V${published.version_number} permanece ativo até a publicação concluir e será preservado no histórico.`
                : ' Até a publicação concluir, nenhum método estruturado será ativado.'}
            </p>
            {publishing && (
              <div style={{ color: DS.blueSoft, fontSize: 11, marginTop: 10 }}>
                Publicando método...
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmOpen(false)}
                disabled={publishing}
                style={{
                  background: 'transparent',
                  border: `1px solid ${DS.borderStrong}`,
                  borderRadius: DS.radius,
                  color: DS.textSecondary,
                  cursor: publishing ? 'wait' : 'pointer',
                  fontSize: 12,
                  fontWeight: 750,
                  padding: '10px 16px',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmPublish()}
                disabled={publishing}
                style={{
                  background: DS.blue,
                  border: 0,
                  borderRadius: DS.radius,
                  color: '#fff',
                  cursor: publishing ? 'wait' : 'pointer',
                  fontSize: 12,
                  fontWeight: 850,
                  padding: '10px 16px',
                }}
              >
                {publishing ? 'Publicando...' : 'Publicar agora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
