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
//
// v5: o modelo não escreve mais analise_markdown (o painel só usava a
// "Mensagem sugerida" dele, e o texto custava ~10 s por rodada). A decisão
// traz a mensagem pronta (mensagem_sugerida + mensagem_observacao), como
// conduzir o momento (técnica, como, exemplo), o que o gestor precisa
// saber, as contradições com o cadastro e a fase nao_comercial. Rodadas v4
// gravadas continuam válidas: o parser aceita os dois formatos.

export const FULL_READING_RELATIONSHIP_PHASES = [
  'primeiro_contato',
  'descoberta',
  'apresentacao',
  'negociacao',
  'decisao',
  'formalizacao',
  'cliente_ativo',
  'perdido',
  // v5: conversa sem oportunidade de venda (suporte, cancelamento,
  // reclamação, engano, fornecedor, candidato a vaga).
  'nao_comercial',
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

// Etapas do kanban que a leitura pode sugerir (nomes internos). Cancelado
// é encerramento administrativo e nunca é sugerido.
export const FULL_READING_KANBAN_STAGES = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'pausado',
  'ganho',
  'perdido',
] as const

export type FullReadingKanbanStage =
  (typeof FULL_READING_KANBAN_STAGES)[number]

// Códigos do modal de ganho do Yolen. Texto vazio = não ficou claro na
// conversa (o vendedor preenche).
export const FULL_READING_PAYMENT_METHOD_CODES = [
  'pix',
  'credito',
  'debito',
  'boleto',
  'dinheiro',
  'transferencia',
  'misto',
  'outro',
  '',
] as const

export const FULL_READING_PAYMENT_TYPE_CODES = [
  'avista',
  'entrada_parcelas',
  'parcelado_sem_entrada',
  'recorrente',
  'outro',
  '',
] as const

export type FullReadingClosingData = {
  produto: string
  valor: string
  forma_pagamento: string
  motivo_perda: string
  valor_total: string
  forma_pagamento_codigo: (typeof FULL_READING_PAYMENT_METHOD_CODES)[number]
  tipo_pagamento_codigo: (typeof FULL_READING_PAYMENT_TYPE_CODES)[number]
}

export type FullReadingCustomer = {
  sabemos: string[]
  inferimos: string[]
  a_confirmar: string[]
}

// v4: campos estruturados para o painel (a tela nunca interpreta o
// markdown). Todos obrigatórios, sem união.
export const FULL_READING_PENDING_OWNERS = [
  'vendedor',
  'cliente',
  'nenhum',
] as const

export const FULL_READING_TIMELINE_MAX_ITEMS =
  10

export type FullReadingTimelineItem = {
  dia: string
  hora: string
  texto: string
}

export type FullReadingPendingItem = {
  de: (typeof FULL_READING_PENDING_OWNERS)[number]
  texto: string
}

// v5: cada ajuste diz o que houve e como seria melhor. Rodadas v4 trazem
// só o texto.
export type FullReadingAdjustment = {
  houve: string
  melhor: string
}

export type FullReadingCoaching = {
  acertos: string[]
  ajustes: (string | FullReadingAdjustment)[]
}

// v5: como um especialista conduz este momento.
export const FULL_READING_CONDUCT_MAX_STEPS =
  3

export const FULL_READING_CONDUCT_MAX_AVOID =
  2

export const FULL_READING_MANAGER_MAX_NOTES =
  2

export type FullReadingConductStep = {
  tecnica: string
  como: string
  exemplo: string
}

export type FullReadingConduct = {
  leitura_do_momento: string
  passos: FullReadingConductStep[]
  evitar: string[]
}

// v5 (F1): afirmação da conversa comparada com o cadastro.
export type FullReadingRegistryContradiction = {
  dito: string
  cadastro: string
  muda_o_que_o_cliente_paga_ou_recebe: boolean
}

export type FullReadingDecision = {
  fase_relacao: (typeof FULL_READING_RELATIONSHIP_PHASES)[number]
  etapa_metodo_atual: string
  venda_concluida: (typeof FULL_READING_SALE_STATUSES)[number]
  vez_de: (typeof FULL_READING_TURN_OWNERS)[number]
  pendencia_do_vendedor: boolean
  situacao_resumo: string
  acao_agora: (typeof FULL_READING_ACTIONS)[number]
  acao_resumo: string
  por_que: string
  etapa_kanban_sugerida: FullReadingKanbanStage
  motivo_etapa: string
  fechamento: FullReadingClosingData
  cliente: FullReadingCustomer
  oportunidades: {
    descricao: string
    status: (typeof FULL_READING_OPPORTUNITY_STATUSES)[number]
  }[]
  afirmacoes_a_confirmar: string[]
  alertas_de_captura: string[]
  confianca_geral: (typeof FULL_READING_CONFIDENCE_LEVELS)[number]
  proximo_passo_titulo: string
  proximo_passo_complemento: string
  linha_do_tempo: FullReadingTimelineItem[]
  pendencias: FullReadingPendingItem[]
  conducao: FullReadingCoaching
  // v5 (ausentes nas rodadas v4 gravadas).
  contradicoes_cadastro?: FullReadingRegistryContradiction[]
  como_conduzir?: FullReadingConduct | null
  mensagem_sugerida?: string
  mensagem_observacao?: string
  para_o_gestor?: string[]
}

export type FullReadingOutput = {
  // v5: null (o modelo não escreve mais a análise em texto).
  analise_markdown: string | null
  decisao: FullReadingDecision
}

export type FullReadingOutputFormat =
  | 'v4'
  | 'v5'
  | 'auto'

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
// precisa de additionalProperties: false. Sem uniões nem campos opcionais;
// os limites de quantidade ficam na descrição e no parser.
const CLOSING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  description:
    'Dados de fechamento ditos na conversa. Texto vazio quando não foram ditos; nunca inventar.',
  required: [
    'produto',
    'valor',
    'forma_pagamento',
    'motivo_perda',
    'valor_total',
    'forma_pagamento_codigo',
    'tipo_pagamento_codigo',
  ],
  properties: {
    produto: {
      type: 'string',
      description:
        'Produto ou plano fechado, como dito na conversa.',
    },
    valor: {
      type: 'string',
      description:
        'Valor fechado, como dito na conversa.',
    },
    forma_pagamento: {
      type: 'string',
      description:
        'Forma de pagamento, como dita na conversa.',
    },
    motivo_perda: {
      type: 'string',
      description:
        'Motivo da perda, como dito na conversa.',
    },
    valor_total: {
      type: 'string',
      description:
        'Só o número do total combinado (ex.: "1.250,00"), ou texto vazio se não houver um total claro.',
    },
    forma_pagamento_codigo: stringEnum(
      FULL_READING_PAYMENT_METHOD_CODES,
      'debito só quando a conversa disser cartão de débito; cobrança mensal no cartão de crédito é credito; na dúvida, texto vazio.',
    ),
    tipo_pagamento_codigo: stringEnum(
      FULL_READING_PAYMENT_TYPE_CODES,
      'Tipo de pagamento combinado; mensalidade ou assinatura é recorrente; na dúvida, texto vazio.',
    ),
  },
} as const

const CUSTOMER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  description:
    'O cliente em frases curtas, com data quando houver.',
  required: [
    'sabemos',
    'inferimos',
    'a_confirmar',
  ],
  properties: {
    sabemos: stringArray(
      'O que o cliente disse ou fez.',
    ),
    inferimos: stringArray(
      'Interpretações, com o motivo.',
    ),
    a_confirmar: stringArray(
      'O que ainda falta confirmar.',
    ),
  },
} as const

const OPPORTUNITIES_SCHEMA = {
  type: 'array',
  description:
    'Oportunidades novas (adicionais, upgrades, indicações, retenção) com o status real.',
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
} as const

const TIMELINE_SCHEMA = {
  type: 'array',
  description:
    'Até 10 marcos da conversa em ordem, cada um em até ~12 palavras, sem códigos.',
  items: {
    type: 'object',
    additionalProperties: false,
    required: [
      'dia',
      'hora',
      'texto',
    ],
    properties: {
      dia: {
        type: 'string',
        description:
          'Dia no formato dd/mm.',
      },
      hora: {
        type: 'string',
        description:
          'Hora no formato hh:mm, ou texto vazio quando não houver.',
      },
      texto: {
        type: 'string',
        description:
          'O que aconteceu, em frase curta.',
      },
    },
  },
} as const

const PENDING_SCHEMA = {
  type: 'array',
  description:
    'Pendências em frases curtas. de: vendedor (o vendedor deve algo), cliente (o cliente deve algo) ou nenhum (registro de que algo está resolvido, ex.: nenhuma pergunta sem resposta).',
  items: {
    type: 'object',
    additionalProperties: false,
    required: [
      'de',
      'texto',
    ],
    properties: {
      de: stringEnum(
        FULL_READING_PENDING_OWNERS,
        'De quem é a pendência.',
      ),
      texto: {
        type: 'string',
      },
    },
  },
} as const

// Campos da decisão que existem desde a v4, na ordem em que o modelo os
// escreve.
const DECISION_HEAD_PROPERTIES = {
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
  situacao_resumo: {
    type: 'string',
    description:
      'A situação atual em 1 a 2 frases.',
  },
} as const

const ACTION_PROPERTIES = {
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
  proximo_passo_titulo: {
    type: 'string',
    description:
      'O próximo passo do vendedor em até ~8 palavras, no imperativo, sem códigos (ex.: "Confirmar o horário da visita").',
  },
  proximo_passo_complemento: {
    type: 'string',
    description:
      'Uma frase curta que completa o próximo passo (o que fazer em seguida, ou o cuidado principal).',
  },
} as const

const TAIL_PROPERTIES = {
  etapa_kanban_sugerida: stringEnum(
    FULL_READING_KANBAN_STAGES,
    'Etapa do kanban que a conversa indica (nome interno). Pode ser igual à etapa atual.',
  ),
  motivo_etapa: {
    type: 'string',
    description:
      'Frase curta com a evidência da etapa sugerida: trecho curto e data.',
  },
  fechamento: CLOSING_SCHEMA,
  oportunidades: OPPORTUNITIES_SCHEMA,
  afirmacoes_a_confirmar: stringArray(
    'Afirmações do vendedor ou do cadastro que precisam de confirmação oficial.',
  ),
  alertas_de_captura: stringArray(
    'Somente problemas da captura (ordem, autoria, mídia ausente) que podem afetar a leitura. Nada sobre o kanban ou a criação do lead.',
  ),
  linha_do_tempo: TIMELINE_SCHEMA,
  confianca_geral: stringEnum(
    FULL_READING_CONFIDENCE_LEVELS,
    'Confiança geral na leitura.',
  ),
} as const

// v5: o modelo entende antes de decidir — situação → cliente → pendências
// → contradições com o cadastro → como conduzir → ação e próximo passo →
// mensagem → condução → para o gestor → o resto.
const DECISION_V5_PROPERTIES = {
  ...DECISION_HEAD_PROPERTIES,
  cliente: CUSTOMER_SCHEMA,
  pendencias: PENDING_SCHEMA,
  contradicoes_cadastro: {
    type: 'array',
    description:
      'Cada afirmação da conversa sobre preço ou sobre o que o plano inclui comparada com o cadastro (nome e descrição do catálogo, preço, fatos oficiais). Lista vazia quando nada diverge.',
    items: {
      type: 'object',
      additionalProperties: false,
      required: [
        'dito',
        'cadastro',
        'muda_o_que_o_cliente_paga_ou_recebe',
      ],
      properties: {
        dito: {
          type: 'string',
          description:
            'O que foi dito na conversa, em frase curta, com a data.',
        },
        cadastro: {
          type: 'string',
          description:
            'O que o cadastro diz sobre o mesmo ponto.',
        },
        muda_o_que_o_cliente_paga_ou_recebe: {
          type: 'boolean',
          description:
            'true quando a divergência muda o que o cliente paga ou recebe.',
        },
      },
    },
  },
  como_conduzir: {
    type: 'object',
    additionalProperties: false,
    description:
      'A melhor forma de conduzir este momento, como faria um especialista em vendas e atendimento.',
    required: [
      'leitura_do_momento',
      'passos',
      'evitar',
    ],
    properties: {
      leitura_do_momento: {
        type: 'string',
        description:
          'Uma frase: como o cliente está e do que precisa agora.',
      },
      passos: {
        type: 'array',
        description:
          '1 a 3 passos, só o que o momento pede.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'tecnica',
            'como',
            'exemplo',
          ],
          properties: {
            tecnica: {
              type: 'string',
              description:
                'Nome curto da técnica, em português simples.',
            },
            como: {
              type: 'string',
              description:
                'O que fazer nesta conversa, em até ~20 palavras.',
            },
            exemplo: {
              type: 'string',
              description:
                'Uma frase curta pronta para usar, ou texto vazio.',
            },
          },
        },
      },
      evitar: stringArray(
        '0 a 2 frases curtas: o que não fazer neste momento.',
      ),
    },
  },
  ...ACTION_PROPERTIES,
  mensagem_sugerida: {
    type: 'string',
    description:
      'Texto pronto para o vendedor enviar agora, no tom do WhatsApp, sem aspas e sem comentários; texto vazio quando não é para enviar nada.',
  },
  mensagem_observacao: {
    type: 'string',
    description:
      'Uma frase: por que não enviar nada agora, ou o que revisar antes de enviar. Texto vazio quando não há o que dizer.',
  },
  conducao: {
    type: 'object',
    additionalProperties: false,
    description:
      'Condução do vendedor em frases curtas.',
    required: [
      'acertos',
      'ajustes',
    ],
    properties: {
      acertos: stringArray(
        'O que o vendedor fez bem, com evidência curta.',
      ),
      ajustes: {
        type: 'array',
        description:
          'O que o vendedor deve ajustar: o que houve e como seria melhor, cada um em frase curta.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'houve',
            'melhor',
          ],
          properties: {
            houve: {
              type: 'string',
            },
            melhor: {
              type: 'string',
            },
          },
        },
      },
    },
  },
  para_o_gestor: stringArray(
    '0 a 2 frases: risco (jurídico, de reputação, de perder o cliente) ou falha de processo que a conversa mostra.',
  ),
  ...TAIL_PROPERTIES,
} as const

export const FULL_READING_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'decisao',
  ],
  properties: {
    decisao: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(DECISION_V5_PROPERTIES),
      properties: DECISION_V5_PROPERTIES,
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

// Enum que aceita texto vazio ("não ficou claro na conversa").
function readOptionalCode<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  path: string,
): T {
  const raw =
    readString(record, key, path, { allowEmpty: true })
      .toLowerCase()

  const match =
    allowed.find(
      (value) => value.toLowerCase() === raw,
    )

  if (match === undefined) {
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

function readRecordList(
  record: Record<string, unknown>,
  key: string,
  path: string,
): Record<string, unknown>[] {
  const value =
    record[key]

  if (!Array.isArray(value)) {
    fail(`${path}.${key}`, 'deveria ser uma lista')
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      fail(`${path}.${key}[${index}]`, 'deveria ser um objeto')
    }

    return item
  })
}

function readRecord(
  record: Record<string, unknown>,
  key: string,
  path: string,
): Record<string, unknown> {
  const value =
    record[key]

  if (!isRecord(value)) {
    fail(`${path}.${key}`, 'deveria ser um objeto')
  }

  return value
}

// Campos da decisão comuns à v4 e à v5. Os ajustes da condução mudam de
// forma: texto (v4) ou { houve, melhor } (v5).
function parseDecisionCommon(
  decisionRaw: Record<string, unknown>,
  path: string,
  adjustments: 'text' | 'objects',
): FullReadingDecision {
  const oportunidades =
    readRecordList(decisionRaw, 'oportunidades', path)
      .map((item, index) => ({
        descricao: readString(item, 'descricao', `${path}.oportunidades[${index}]`),
        status: readEnum(
          item,
          'status',
          FULL_READING_OPPORTUNITY_STATUSES,
          `${path}.oportunidades[${index}]`,
        ),
      }))

  if (typeof decisionRaw.pendencia_do_vendedor !== 'boolean') {
    fail(`${path}.pendencia_do_vendedor`, 'deveria ser verdadeiro ou falso')
  }

  const closingRaw =
    readRecord(decisionRaw, 'fechamento', path)

  const customerRaw =
    readRecord(decisionRaw, 'cliente', path)

  const linha_do_tempo =
    readRecordList(decisionRaw, 'linha_do_tempo', path)
      .map((item, index) => ({
        dia: readString(item, 'dia', `${path}.linha_do_tempo[${index}]`, { allowEmpty: true }),
        hora: readString(item, 'hora', `${path}.linha_do_tempo[${index}]`, { allowEmpty: true }),
        texto: readString(item, 'texto', `${path}.linha_do_tempo[${index}]`, { allowEmpty: true }),
      }))
      .filter((item) => item.texto.length > 0)
      .slice(0, FULL_READING_TIMELINE_MAX_ITEMS)

  const pendencias =
    readRecordList(decisionRaw, 'pendencias', path)
      .map((item, index) => ({
        de: readEnum(
          item,
          'de',
          FULL_READING_PENDING_OWNERS,
          `${path}.pendencias[${index}]`,
        ),
        texto: readString(item, 'texto', `${path}.pendencias[${index}]`, { allowEmpty: true }),
      }))
      .filter((item) => item.texto.length > 0)

  const coachingRaw =
    readRecord(decisionRaw, 'conducao', path)

  const ajustes: FullReadingCoaching['ajustes'] =
    adjustments === 'objects'
      ? readRecordList(coachingRaw, 'ajustes', `${path}.conducao`)
          .map((item, index) => ({
            houve: readString(item, 'houve', `${path}.conducao.ajustes[${index}]`, { allowEmpty: true }),
            melhor: readString(item, 'melhor', `${path}.conducao.ajustes[${index}]`, { allowEmpty: true }),
          }))
          .filter((item) => item.houve.length > 0 || item.melhor.length > 0)
      : readStringArray(coachingRaw, 'ajustes', `${path}.conducao`)

  return {
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
    situacao_resumo: readString(decisionRaw, 'situacao_resumo', path),
    acao_agora: readEnum(
      decisionRaw,
      'acao_agora',
      FULL_READING_ACTIONS,
      path,
    ),
    acao_resumo: readString(decisionRaw, 'acao_resumo', path),
    por_que: readString(decisionRaw, 'por_que', path),
    etapa_kanban_sugerida: readEnum(
      decisionRaw,
      'etapa_kanban_sugerida',
      FULL_READING_KANBAN_STAGES,
      path,
    ),
    motivo_etapa: readString(
      decisionRaw,
      'motivo_etapa',
      path,
      { allowEmpty: true },
    ),
    fechamento: {
      produto: readString(closingRaw, 'produto', `${path}.fechamento`, { allowEmpty: true }),
      valor: readString(closingRaw, 'valor', `${path}.fechamento`, { allowEmpty: true }),
      forma_pagamento: readString(closingRaw, 'forma_pagamento', `${path}.fechamento`, { allowEmpty: true }),
      motivo_perda: readString(closingRaw, 'motivo_perda', `${path}.fechamento`, { allowEmpty: true }),
      valor_total: readString(closingRaw, 'valor_total', `${path}.fechamento`, { allowEmpty: true }),
      forma_pagamento_codigo: readOptionalCode(
        closingRaw,
        'forma_pagamento_codigo',
        FULL_READING_PAYMENT_METHOD_CODES,
        `${path}.fechamento`,
      ),
      tipo_pagamento_codigo: readOptionalCode(
        closingRaw,
        'tipo_pagamento_codigo',
        FULL_READING_PAYMENT_TYPE_CODES,
        `${path}.fechamento`,
      ),
    },
    cliente: {
      sabemos: readStringArray(customerRaw, 'sabemos', `${path}.cliente`),
      inferimos: readStringArray(customerRaw, 'inferimos', `${path}.cliente`),
      a_confirmar: readStringArray(customerRaw, 'a_confirmar', `${path}.cliente`),
    },
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
    proximo_passo_titulo: readString(decisionRaw, 'proximo_passo_titulo', path),
    proximo_passo_complemento: readString(
      decisionRaw,
      'proximo_passo_complemento',
      path,
      { allowEmpty: true },
    ),
    linha_do_tempo,
    pendencias,
    conducao: {
      acertos: readStringArray(coachingRaw, 'acertos', `${path}.conducao`),
      ajustes,
    },
  }
}

// Campos novos da v5.
function parseDecisionV5Extras(
  decisionRaw: Record<string, unknown>,
  path: string,
): Required<Pick<
  FullReadingDecision,
  | 'contradicoes_cadastro'
  | 'como_conduzir'
  | 'mensagem_sugerida'
  | 'mensagem_observacao'
  | 'para_o_gestor'
>> {
  const contradicoes_cadastro =
    readRecordList(decisionRaw, 'contradicoes_cadastro', path)
      .map((item, index) => {
        const itemPath =
          `${path}.contradicoes_cadastro[${index}]`

        if (typeof item.muda_o_que_o_cliente_paga_ou_recebe !== 'boolean') {
          fail(`${itemPath}.muda_o_que_o_cliente_paga_ou_recebe`, 'deveria ser verdadeiro ou falso')
        }

        return {
          dito: readString(item, 'dito', itemPath, { allowEmpty: true }),
          cadastro: readString(item, 'cadastro', itemPath, { allowEmpty: true }),
          muda_o_que_o_cliente_paga_ou_recebe:
            item.muda_o_que_o_cliente_paga_ou_recebe,
        }
      })
      .filter((item) => item.dito.length > 0 || item.cadastro.length > 0)

  const conductRaw =
    readRecord(decisionRaw, 'como_conduzir', path)

  const conductPath =
    `${path}.como_conduzir`

  const passos =
    readRecordList(conductRaw, 'passos', conductPath)
      .map((item, index) => ({
        tecnica: readString(item, 'tecnica', `${conductPath}.passos[${index}]`, { allowEmpty: true }),
        como: readString(item, 'como', `${conductPath}.passos[${index}]`, { allowEmpty: true }),
        exemplo: readString(item, 'exemplo', `${conductPath}.passos[${index}]`, { allowEmpty: true }),
      }))
      .filter((item) => item.tecnica.length > 0 || item.como.length > 0)
      .slice(0, FULL_READING_CONDUCT_MAX_STEPS)

  return {
    contradicoes_cadastro,
    como_conduzir: {
      leitura_do_momento: readString(conductRaw, 'leitura_do_momento', conductPath, { allowEmpty: true }),
      passos,
      evitar: readStringArray(conductRaw, 'evitar', conductPath)
        .slice(0, FULL_READING_CONDUCT_MAX_AVOID),
    },
    mensagem_sugerida: readString(decisionRaw, 'mensagem_sugerida', path, { allowEmpty: true }),
    mensagem_observacao: readString(decisionRaw, 'mensagem_observacao', path, { allowEmpty: true }),
    para_o_gestor: readStringArray(decisionRaw, 'para_o_gestor', path)
      .slice(0, FULL_READING_MANAGER_MAX_NOTES),
  }
}

// format 'v5' (a leitura atual), 'v4' (rodadas antigas: analise_markdown +
// decisão v4) ou 'auto' (decide pela presença de analise_markdown).
export function parseFullReadingOutput(
  text: string,
  {
    format = 'auto',
  }: {
    format?: FullReadingOutputFormat
  } = {},
): FullReadingOutput {
  const parsed =
    extractJsonObject(text)

  if (!isRecord(parsed)) {
    fail('resposta', 'deveria ser um objeto')
  }

  const resolved =
    format === 'auto'
      ? ('analise_markdown' in parsed ? 'v4' : 'v5')
      : format

  const analysis =
    resolved === 'v4'
      ? readString(parsed, 'analise_markdown', 'resposta')
      : null

  const decisionRaw =
    readRecord(parsed, 'decisao', 'resposta')

  const path =
    'resposta.decisao'

  const common =
    parseDecisionCommon(
      decisionRaw,
      path,
      resolved === 'v5' ? 'objects' : 'text',
    )

  return {
    analise_markdown: analysis,
    decisao:
      resolved === 'v5'
        ? {
            ...common,
            ...parseDecisionV5Extras(decisionRaw, path),
          }
        : common,
  }
}


// ---------------------------------------------------------------------------
// Coerência da etapa sugerida (v2)
// ---------------------------------------------------------------------------
//
// A etapa sugerida precisa concordar com a própria leitura. Ganho sem
// venda confirmada ou provável, ou perdido fora das fases perdido e
// nao_comercial (v5), não derruba a leitura: vira "manter a etapa atual" e
// fica registrado como alerta na rodada. Ganho e perdido nunca são
// aplicados por aqui; são só sugestões que o vendedor confirma no Yolen.
//
// v5: Perdido também não vale com o kanban em Ganho, nem numa conversa sem
// venda (nao_comercial) com o cliente ainda esperando resposta.

export type FullReadingCoherenceAlert = {
  campo: 'etapa_kanban_sugerida' | 'acao_agora'
  valor_do_modelo: string
  valor_aplicado: string
  motivo: string
}

// Campos que o sistema acrescenta à decisão gravada na rodada. Não fazem
// parte da resposta do modelo.
export type FullReadingSystemRecord = {
  kanban_lido: {
    status: string | null
    stage_entered_at: string | null
  }
  alertas: FullReadingCoherenceAlert[]
  saida_estruturada: boolean | null
}

export type FullReadingStoredDecision =
  FullReadingDecision & {
    sistema: FullReadingSystemRecord
  }

export function isFullReadingKanbanStage(
  value: unknown,
): value is FullReadingKanbanStage {
  return (
    typeof value === 'string' &&
    (FULL_READING_KANBAN_STAGES as readonly string[]).includes(value)
  )
}

// Fases em que a etapa Perdido faz sentido.
const LOST_STAGE_PHASES =
  new Set(['perdido', 'nao_comercial'])

export function findStageCoherenceProblem(
  decision: Pick<
    FullReadingDecision,
    'etapa_kanban_sugerida' | 'venda_concluida' | 'fase_relacao'
  > & Partial<Pick<FullReadingDecision, 'pendencia_do_vendedor'>>,
  {
    currentStatus = null,
  }: {
    currentStatus?: string | null
  } = {},
): string | null {
  if (
    decision.etapa_kanban_sugerida === 'ganho' &&
    decision.venda_concluida !== 'confirmada' &&
    decision.venda_concluida !== 'provavel'
  ) {
    return 'ganho sugerido sem venda confirmada ou provável'
  }

  if (decision.etapa_kanban_sugerida === 'perdido') {
    if (!LOST_STAGE_PHASES.has(decision.fase_relacao)) {
      return 'perdido sugerido com a relação fora das fases perdido e não é venda'
    }

    if (currentStatus === 'ganho') {
      return 'perdido sugerido com o kanban em ganho'
    }

    if (
      decision.fase_relacao === 'nao_comercial' &&
      decision.pendencia_do_vendedor === true
    ) {
      return 'perdido sugerido com o cliente esperando resposta'
    }
  }

  return null
}

// F2 (v5): contradição com o cadastro que muda o que o cliente paga ou
// recebe pede verificação interna como ação principal (regra 10). Sem
// isso, a rodada ganha um alerta (e o log), sem mudar nenhum texto.
export function findRegistryContradictionAlerts(
  decision: Pick<FullReadingDecision, 'acao_agora' | 'contradicoes_cadastro'>,
): FullReadingCoherenceAlert[] {
  const material =
    (decision.contradicoes_cadastro ?? []).filter(
      (item) => item.muda_o_que_o_cliente_paga_ou_recebe === true,
    )

  if (
    material.length === 0 ||
    decision.acao_agora === 'verificacao_interna'
  ) {
    return []
  }

  return [
    {
      campo: 'acao_agora',
      valor_do_modelo: decision.acao_agora,
      valor_aplicado: decision.acao_agora,
      motivo: 'contradição com o cadastro que muda o que o cliente paga ou recebe sem verificação interna como ação principal',
    },
  ]
}

export function applyFullReadingCoherence(
  decision: FullReadingDecision,
  {
    currentStatus,
  }: {
    currentStatus: string | null
  },
): {
  decision: FullReadingDecision
  alerts: FullReadingCoherenceAlert[]
} {
  const problem =
    findStageCoherenceProblem(decision, { currentStatus })

  if (!problem) {
    return {
      decision,
      alerts: [],
    }
  }

  const keep =
    isFullReadingKanbanStage(currentStatus)
      ? currentStatus
      : null

  return {
    decision: keep
      ? {
          ...decision,
          etapa_kanban_sugerida: keep,
        }
      : decision,
    alerts: [
      {
        campo: 'etapa_kanban_sugerida',
        valor_do_modelo: decision.etapa_kanban_sugerida,
        valor_aplicado: keep ?? 'manter_etapa_atual',
        motivo: problem,
      },
    ],
  }
}
