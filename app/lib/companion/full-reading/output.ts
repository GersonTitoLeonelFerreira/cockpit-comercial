// Leitura completa — formato da resposta do modelo.
//
// O modelo devolve um único objeto JSON com:
// - analise_markdown: a análise completa, escrita para o vendedor e o
//   gestor (é o texto "igual ao do ChatGPT");
// - decisao: os mesmos pontos-chave em campos fixos, para o sistema.
//
// As decisões saem do MESMO modelo que leu a conversa, na mesma chamada.
// Um segundo modelo só para "organizar" provou que muda o sentido
// (transformou venda "provável" em "confirmada"), por isso não existe
// etapa de reinterpretação aqui.

export const FULL_READING_RELATIONSHIP_PHASES = [
  'primeiro_contato',
  'descoberta',
  'apresentacao',
  'negociacao',
  'decisao',
  'formalizacao',
  'cliente_ativo',
  'perdido',
  'indeterminada',
] as const

export const FULL_READING_SALE_STATUSES = [
  'confirmada',
  'provavel',
  'nao',
  'indeterminado',
] as const

export const FULL_READING_TURN_OWNERS = [
  'vendedor',
  'cliente',
  'ninguem',
] as const

export const FULL_READING_ACTIONS = [
  'nao_intervir',
  'responder',
  'retomar',
  'follow_up',
  'verificacao_interna',
] as const

export const FULL_READING_OPPORTUNITY_STATUSES = [
  'aceita',
  'recusada',
  'adiada',
  'sem_resposta',
  'em_aberto',
] as const

export const FULL_READING_CONFIDENCE_LEVELS = [
  'alta',
  'media',
  'baixa',
] as const

export type FullReadingDecision = {
  fase_relacao: (typeof FULL_READING_RELATIONSHIP_PHASES)[number]
  etapa_metodo_atual: string
  venda_concluida: (typeof FULL_READING_SALE_STATUSES)[number]
  vez_de: (typeof FULL_READING_TURN_OWNERS)[number]
  pendencia_do_vendedor: boolean
  acao_agora: (typeof FULL_READING_ACTIONS)[number]
  acao_resumo: string
  por_que: string
  oportunidades: {
    descricao: string
    status: (typeof FULL_READING_OPPORTUNITY_STATUSES)[number]
  }[]
  afirmacoes_a_confirmar: string[]
  alertas_de_captura: string[]
  confianca_geral: (typeof FULL_READING_CONFIDENCE_LEVELS)[number]
}

export type FullReadingOutput = {
  analise_markdown: string
  decisao: FullReadingDecision
}

const stringEnum = (
  values: readonly string[],
  description: string,
) => ({
  type: 'string',
  enum: [...values],
  description,
})

const stringArray = (
  description: string,
) => ({
  type: 'array',
  items: { type: 'string' },
  description,
})

// JSON Schema usado na saída estruturada da API do Claude. Todo objeto
// precisa de additionalProperties: false.
export const FULL_READING_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'analise_markdown',
    'decisao',
  ],
  properties: {
    analise_markdown: {
      type: 'string',
      description:
        'A análise completa, em português, em markdown, exatamente no formato de seções pedido nas instruções.',
    },
    decisao: {
      type: 'object',
      additionalProperties: false,
      required: [
        'fase_relacao',
        'etapa_metodo_atual',
        'venda_concluida',
        'vez_de',
        'pendencia_do_vendedor',
        'acao_agora',
        'acao_resumo',
        'por_que',
        'oportunidades',
        'afirmacoes_a_confirmar',
        'alertas_de_captura',
        'confianca_geral',
      ],
      properties: {
        fase_relacao: stringEnum(
          FULL_READING_RELATIONSHIP_PHASES,
          'Fase real da relação no momento de referência.',
        ),
        etapa_metodo_atual: {
          type: 'string',
          description:
            'Nome exato da etapa atual do método comercial da empresa, ou texto vazio se não houver método cadastrado.',
        },
        venda_concluida: stringEnum(
          FULL_READING_SALE_STATUSES,
          'confirmada só com evidência direta na conversa; provavel quando é inferência forte; nao; indeterminado.',
        ),
        vez_de: stringEnum(
          FULL_READING_TURN_OWNERS,
          'De quem é a vez de agir na conversa.',
        ),
        pendencia_do_vendedor: {
          type: 'boolean',
          description:
            'true se existe pergunta ou pedido do cliente que o vendedor ainda não respondeu.',
        },
        acao_agora: stringEnum(
          FULL_READING_ACTIONS,
          'Ação PRINCIPAL do vendedor em relação ao cliente agora. Use verificacao_interna só quando a ação principal for interna.',
        ),
        acao_resumo: {
          type: 'string',
          description:
            'A ação principal em uma frase curta.',
        },
        por_que: {
          type: 'string',
          description:
            'Justificativa curta da ação.',
        },
        oportunidades: {
          type: 'array',
          description:
            'Oportunidades novas (adicionais, upgrades, indicações) com o status real.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'descricao',
              'status',
            ],
            properties: {
              descricao: {
                type: 'string',
              },
              status: stringEnum(
                FULL_READING_OPPORTUNITY_STATUSES,
                'Status real da oportunidade.',
              ),
            },
          },
        },
        afirmacoes_a_confirmar: stringArray(
          'Afirmações do vendedor ou do cadastro que precisam de confirmação oficial.',
        ),
        alertas_de_captura: stringArray(
          'Somente problemas da captura (ordem, autoria, mídia ausente) que podem afetar a leitura.',
        ),
        confianca_geral: stringEnum(
          FULL_READING_CONFIDENCE_LEVELS,
          'Confiança geral na leitura.',
        ),
      },
    },
  },
} as const

export class FullReadingOutputError extends Error {
  readonly code: string

  constructor(
    code: string,
    message: string,
  ) {
    super(message)
    this.name = 'FullReadingOutputError'
    this.code = code
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function fail(
  path: string,
  problem: string,
): never {
  throw new FullReadingOutputError(
    'INVALID_MODEL_OUTPUT',
    `${path}: ${problem}`,
  )
}

function readString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  options: { allowEmpty?: boolean } = {},
): string {
  const value =
    record[key]

  if (typeof value !== 'string') {
    fail(`${path}.${key}`, 'deveria ser texto')
  }

  const trimmed =
    value.trim()

  if (!options.allowEmpty && trimmed.length === 0) {
    fail(`${path}.${key}`, 'está vazio')
  }

  return trimmed
}

// A API não garante a caixa dos valores de enum: compara sem diferenciar
// maiúsculas e minúsculas e devolve o valor canônico.
function readEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  path: string,
): T {
  const raw =
    readString(record, key, path)
      .toLowerCase()

  const match =
    allowed.find(
      (value) => value.toLowerCase() === raw,
    )

  if (!match) {
    fail(`${path}.${key}`, `valor fora do permitido: ${raw}`)
  }

  return match
}

function readStringArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string[] {
  const value =
    record[key]

  if (!Array.isArray(value)) {
    fail(`${path}.${key}`, 'deveria ser uma lista')
  }

  return value.map((item, index) => {
    if (typeof item !== 'string') {
      fail(`${path}.${key}[${index}]`, 'deveria ser texto')
    }

    return item.trim()
  }).filter((item) => item.length > 0)
}

// Aceita o JSON puro (saída estruturada) ou, no modo de contingência sem
// saída estruturada, um JSON cercado por texto ou bloco de código.
export function extractJsonObject(
  text: string,
): unknown {
  const trimmed =
    text.trim()

  try {
    return JSON.parse(trimmed)
  } catch {
    // segue para a extração tolerante
  }

  const start =
    trimmed.indexOf('{')

  const end =
    trimmed.lastIndexOf('}')

  if (start === -1 || end <= start) {
    throw new FullReadingOutputError(
      'INVALID_MODEL_OUTPUT',
      'a resposta não contém um objeto JSON',
    )
  }

  try {
    return JSON.parse(
      trimmed.slice(start, end + 1),
    )
  } catch {
    throw new FullReadingOutputError(
      'INVALID_MODEL_OUTPUT',
      'o JSON da resposta é inválido',
    )
  }
}

export function parseFullReadingOutput(
  text: string,
): FullReadingOutput {
  const parsed =
    extractJsonObject(text)

  if (!isRecord(parsed)) {
    fail('resposta', 'deveria ser um objeto')
  }

  const analysis =
    readString(parsed, 'analise_markdown', 'resposta')

  const decisionRaw =
    parsed.decisao

  if (!isRecord(decisionRaw)) {
    fail('resposta.decisao', 'deveria ser um objeto')
  }

  const path =
    'resposta.decisao'

  const opportunitiesRaw =
    decisionRaw.oportunidades

  if (!Array.isArray(opportunitiesRaw)) {
    fail(`${path}.oportunidades`, 'deveria ser uma lista')
  }

  const oportunidades =
    opportunitiesRaw.map((item, index) => {
      if (!isRecord(item)) {
        fail(`${path}.oportunidades[${index}]`, 'deveria ser um objeto')
      }

      return {
        descricao: readString(item, 'descricao', `${path}.oportunidades[${index}]`),
        status: readEnum(
          item,
          'status',
          FULL_READING_OPPORTUNITY_STATUSES,
          `${path}.oportunidades[${index}]`,
        ),
      }
    })

  if (typeof decisionRaw.pendencia_do_vendedor !== 'boolean') {
    fail(`${path}.pendencia_do_vendedor`, 'deveria ser verdadeiro ou falso')
  }

  return {
    analise_markdown: analysis,
    decisao: {
      fase_relacao: readEnum(
        decisionRaw,
        'fase_relacao',
        FULL_READING_RELATIONSHIP_PHASES,
        path,
      ),
      etapa_metodo_atual: readString(
        decisionRaw,
        'etapa_metodo_atual',
        path,
        { allowEmpty: true },
      ),
      venda_concluida: readEnum(
        decisionRaw,
        'venda_concluida',
        FULL_READING_SALE_STATUSES,
        path,
      ),
      vez_de: readEnum(
        decisionRaw,
        'vez_de',
        FULL_READING_TURN_OWNERS,
        path,
      ),
      pendencia_do_vendedor:
        decisionRaw.pendencia_do_vendedor,
      acao_agora: readEnum(
        decisionRaw,
        'acao_agora',
        FULL_READING_ACTIONS,
        path,
      ),
      acao_resumo: readString(decisionRaw, 'acao_resumo', path),
      por_que: readString(decisionRaw, 'por_que', path),
      oportunidades,
      afirmacoes_a_confirmar: readStringArray(
        decisionRaw,
        'afirmacoes_a_confirmar',
        path,
      ),
      alertas_de_captura: readStringArray(
        decisionRaw,
        'alertas_de_captura',
        path,
      ),
      confianca_geral: readEnum(
        decisionRaw,
        'confianca_geral',
        FULL_READING_CONFIDENCE_LEVELS,
        path,
      ),
    },
  }
}
