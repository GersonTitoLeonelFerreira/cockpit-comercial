'use client'

import * as React from 'react'

import CommercialConfigClient from './CommercialConfigClient'
import CommercialMethodBuilder from './CommercialMethodBuilder'

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
  radius: 8,
  radiusContainer: 10,
} as const

type ExperienceMode = 'choose' | 'assisted' | 'advanced'

function ChoiceCard({
  title,
  description,
  primary,
  onClick,
}: {
  title: string
  description: string
  primary?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: primary
          ? 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(20,23,34,0.98))'
          : DS.cardBg,
        border: `1px solid ${
          primary ? 'rgba(96,165,250,0.42)' : DS.border
        }`,
        borderRadius: DS.radiusContainer,
        cursor: 'pointer',
        minHeight: 170,
        padding: 20,
        textAlign: 'left',
        width: '100%',
      }}
    >
      <div
        style={{
          color: primary ? DS.blueSoft : DS.textPrimary,
          fontSize: 15,
          fontWeight: 900,
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: DS.textSecondary,
          fontSize: 12,
          lineHeight: 1.65,
          marginTop: 10,
        }}
      >
        {description}
      </div>
      <div
        style={{
          color: primary ? DS.blueSoft : DS.textMuted,
          fontSize: 11,
          fontWeight: 800,
          marginTop: 18,
        }}
      >
        Continuar →
      </div>
    </button>
  )
}

export default function CommercialConfigExperience() {
  const [mode, setMode] = React.useState<ExperienceMode>('choose')

  if (mode === 'advanced') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setMode('choose')}
          style={{
            background: DS.surfaceBg,
            border: `1px solid ${DS.borderStrong}`,
            borderRadius: DS.radius,
            color: DS.textSecondary,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 750,
            marginBottom: 14,
            padding: '9px 12px',
          }}
        >
          ← Voltar às opções de criação
        </button>
        <CommercialConfigClient />
      </div>
    )
  }

  if (mode === 'assisted') {
    return (
      <CommercialMethodBuilder
        onBack={() => setMode('choose')}
      />
    )
  }

  return (
    <div
      style={{
        margin: '0 auto',
        maxWidth: 980,
        width: '100%',
      }}
    >
      <div
        style={{
          background: DS.cardBg,
          border: `1px solid ${DS.border}`,
          borderRadius: DS.radiusContainer,
          padding: '28px 28px 24px',
        }}
      >
        <div
          style={{
            color: DS.blueSoft,
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Método Comercial
        </div>
        <h1
          style={{
            color: DS.textPrimary,
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: '-0.035em',
            margin: '9px 0 0',
          }}
        >
          Crie seu processo comercial
        </h1>
        <p
          style={{
            color: DS.textSecondary,
            fontSize: 13,
            lineHeight: 1.7,
            margin: '12px 0 0',
            maxWidth: 720,
          }}
        >
          A Yolen vai ajudar você a organizar como sua empresa vende hoje
          antes de transformar isso em um método para sua equipe.
          Não é necessário conhecer metodologias de vendas para começar.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 14,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          marginTop: 16,
        }}
      >
        <ChoiceCard
          primary
          title="Começar com ajuda da Yolen"
          description="Mapeie sua operação, regras comerciais e processo atual em um fluxo guiado. Você pode salvar e continuar depois."
          onClick={() => setMode('assisted')}
        />
        <ChoiceCard
          title="Já sei como quero estruturar"
          description="Abra o editor avançado existente para editar diretamente método, produtos, fatos, objeções e diretrizes comerciais."
          onClick={() => setMode('advanced')}
        />
      </div>
    </div>
  )
}
