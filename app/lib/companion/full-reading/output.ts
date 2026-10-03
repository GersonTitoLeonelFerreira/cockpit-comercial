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
//
// v6 (rodada 9): revisar_em/revisar_motivo (a partir de quando o próximo
// passo pode ter mudado só pelo tempo) e precisa_ler_inteira/
// precisa_ler_inteira_motivo (a leitura de continuação pede a conversa
// inteira). Rodadas v5 gravadas não têm esses campos e continuam válidas.
//
// v7 (rodada 10): limites de itens por campo, os mais importantes primeiro
// (applyFullReadingLimits corta o excesso sem falhar). O formato da
// decisão é o mesmo da v6.

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

// Rodada 10 (D1): limites da v7.
export const FULL_READING_V7_LIMITS = {
  linha_do_tempo: 8,
  pendencias: 4,
  oportunidades: 3,
  afirmacoes_a_confirmar: 5,
  contradicoes_cadastro: 4,
  cliente_sabemos: 5,
  cliente_inferimos: 3,
  cliente_a_confirmar: 3,
  conducao_acertos: 3,
  conducao_ajustes: 3,
  como_conduzir_passos: 3,
  como_conduzir_evitar: 2,
  para_o_gestor: 2,
} as const

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
  // v6 (ausentes nas rodadas v5 gravadas).
  revisar_em?: string
  revisar_motivo?: string
  precisa_ler_inteira?: boolean
  precisa_ler_inteira_motivo?: string
  // v8 (rodada 11): arquivo não incluído que pode mudar a decisão.
  arquivos_sugeridos?: FullReadingSuggestedAttachment[]
}

export type FullReadingSuggestedAttachment = {
  ref: string
  motivo: string
}

export const FULL_READING_SUGGESTED_ATTACHMENTS_MAX =
  2

export type FullReadingOutput = {
  // v5: null (o modelo não escreve mais a análise em texto).
  analise_markdown: string | null
  decisao: FullReadingDecision
}

export type FullReadingOutputFormat =
  | 'v4'
  | 'v5'
  | 'v6'
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
//
// Rodada 8: a v5 com todos os enums passou do tamanho de gramática que a
// API compila ("The compiled grammar is too large"). Ficam como enum só os
// campos que decidem (fase, venda, vez, ação e etapa); códigos de
// pagamento, status de oportunidade, dono da pendência e confiança vão
// como texto com os valores na descrição, e o parser v5 lê com tolerância.
const codeText = (
  values: readonly string[],
  description: string,
) => ({
  type: 'string',
  description: `${description} Valores: ${values.map((value) => (value ? value : '"" (vazio)')).join(', ')}.`,
})

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
    forma_pagamento_codigo: codeText(
      FULL_READING_PAYMENT_METHOD_CODES,
      'debito só quando a conversa disser cartão de débito; cobrança mensal no cartão de crédito é credito; na dúvida, texto vazio.',
    ),
    tipo_pagamento_codigo: codeText(
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
      'O que o cliente disse ou fez. Até 5, os mais importantes primeiro.',
    ),
    inferimos: stringArray(
      'Interpretações, com o motivo. Até 3, as mais importantes primeiro.',
    ),
    a_confirmar: stringArray(
      'O que ainda falta confirmar. Até 3, o mais importante primeiro.',
    ),
  },
} as const

const OPPORTUNITIES_SCHEMA = {
  type: 'array',
  description:
    'Oportunidades novas (adicionais, upgrades, indicações, retenção) com o status real. Até 3, as mais importantes primeiro.',
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
      status: codeText(
        FULL_READING_OPPORTUNITY_STATUSES,
        'Status real da oportunidade.',
      ),
    },
  },
} as const

const TIMELINE_SCHEMA = {
  type: 'array',
  description:
    'Até 8 marcos da conversa em ordem, cada um em até ~12 palavras, sem códigos.',
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
    'Pendências em frases curtas, até 4, as mais importantes primeiro. de: vendedor (o vendedor deve algo), cliente (o cliente deve algo) ou nenhum (registro de que algo está resolvido, ex.: nenhuma pergunta sem resposta).',
  items: {
    type: 'object',
    additionalProperties: false,
    required: [
      'de',
      'texto',
    ],
    properties: {
      de: codeText(
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
    'Afirmações do vendedor ou do cadastro que precisam de confirmação oficial. Até 5, as mais importantes primeiro.',
  ),
  alertas_de_captura: stringArray(
    'Somente problemas da captura (ordem, autoria, mídia ausente) que podem afetar a leitura. Nada sobre o kanban ou a criação do lead.',
  ),
  linha_do_tempo: TIMELINE_SCHEMA,
  confianca_geral: codeText(
    FULL_READING_CONFIDENCE_LEVELS,
    'Confiança geral na leitura.',
  ),
  revisar_em: {
    type: 'string',
    description:
      'Data e hora (ISO 8601 com o fuso de Brasília, ex.: 2026-10-02T18:00:00-03:00) a partir da qual o próximo passo pode ter mudado só pela passagem do tempo (horário de visita, reunião ou consulta, prazo prometido, "retomar amanhã"). Texto vazio quando o passo não depende de horário.',
  },
  revisar_motivo: {
    type: 'string',
    description:
      'O que acontece nesse horário, em poucas palavras (ex.: "o horário da visita"). Texto vazio quando revisar_em é vazio.',
  },
  precisa_ler_inteira: {
    type: 'boolean',
    description:
      'Só na leitura de continuação: true quando o contexto recebido não basta para decidir com segurança. Na leitura da conversa inteira, false.',
  },
  precisa_ler_inteira_motivo: {
    type: 'string',
    description:
      'Por que precisa ler a conversa inteira, em uma frase; texto vazio quando não precisa.',
  },
  arquivos_sugeridos: {
    type: 'array',
    description:
      'Até 2 arquivos não incluídos cujo conteúdo pode mudar a decisão. Lista vazia quando nenhum.',
    items: {
      type: 'object',
      additionalProperties: false,
      required: [
        'ref',
        'motivo',
      ],
      properties: {
        ref: {
          type: 'string',
          description:
            'A referência do arquivo, como aparece em "(ref: ...)".',
        },
        motivo: {
          type: 'string',
          description:
            'Por que incluir, em uma frase curta.',
        },
      },
    },
  },
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
      'Cada afirmação da conversa sobre preço ou sobre o que o plano inclui comparada com o cadastro (nome e descrição do catálogo, preço, fatos oficiais). Até 4, as que mudam o que o cliente paga ou recebe primeiro. Lista vazia quando nada diverge.',
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
        'O que o vendedor fez bem, com evidência curta. Até 3.',
      ),
      ajustes: {
        type: 'array',
        description:
          'O que o vendedor deve ajustar: o que houve e como seria melhor, uma frase curta cada. Até 3, os mais importantes primeiro.',
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

// v5: campos de código que vão como texto no esquema. Valor fora da lista
// vira o padrão (nunca derruba a leitura inteira).
function readLenientCode<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
  path: string,
): T {
  const raw =
    readString(record, key, path, { allowEmpty: true })
      .toLowerCase()

  return allowed.find((value) => value.toLowerCase() === raw) ?? fallback
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
  // v5: os códigos secundários vêm como texto (esquema menor) e são lidos
  // com tolerância; v4 continua estrito como sempre foi.
  const lenient =
    adjustments === 'objects'

  const oportunidades =
    readRecordList(decisionRaw, 'oportunidades', path)
      .map((item, index) => ({
        descricao: readString(item, 'descricao', `${path}.oportunidades[${index}]`),
        status: lenient
          ? readLenientCode(item, 'status', FULL_READING_OPPORTUNITY_STATUSES, 'em_aberto', `${path}.oportunidades[${index}]`)
          : readEnum(
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
      // Rodada 10 (D3): a linha do tempo é cronológica; o que passa do
      // limite sai do começo (os marcos mais recentes ficam).
      .slice(-FULL_READING_TIMELINE_MAX_ITEMS)

  const pendencias =
    readRecordList(decisionRaw, 'pendencias', path)
      .map((item, index) => ({
        de: lenient
          ? readLenientCode(item, 'de', FULL_READING_PENDING_OWNERS, 'nenhum', `${path}.pendencias[${index}]`)
          : readEnum(
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
      forma_pagamento_codigo: lenient
        ? readLenientCode(closingRaw, 'forma_pagamento_codigo', FULL_READING_PAYMENT_METHOD_CODES, '', `${path}.fechamento`)
        : readOptionalCode(
            closingRaw,
            'forma_pagamento_codigo',
            FULL_READING_PAYMENT_METHOD_CODES,
            `${path}.fechamento`,
          ),
      tipo_pagamento_codigo: lenient
        ? readLenientCode(closingRaw, 'tipo_pagamento_codigo', FULL_READING_PAYMENT_TYPE_CODES, '', `${path}.fechamento`)
        : readOptionalCode(
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
    confianca_geral: lenient
      ? readLenientCode(decisionRaw, 'confianca_geral', FULL_READING_CONFIDENCE_LEVELS, 'media', path)
      : readEnum(
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

// Fuso fixo de Brasília (sem horário de verão desde 2019).
const BRASILIA_OFFSET =
  '-03:00'

const BRASILIA_OFFSET_MS =
  3 * 60 * 60 * 1000

function pad2(
  value: number,
): string {
  return String(value).padStart(2, '0')
}

// revisar_em em ISO no horário de Brasília. Sem fuso, vale Brasília; data
// inválida vira texto vazio (nunca derruba a leitura).
export function normalizeReviewAt(
  value: unknown,
): string {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed =
    value.trim()

  if (trimmed.length === 0) {
    return ''
  }

  const withZone =
    /(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed) || !/t\d{2}:\d{2}/i.test(trimmed)
      ? trimmed
      : `${trimmed}${BRASILIA_OFFSET}`

  const time =
    Date.parse(withZone)

  if (Number.isNaN(time) || !/t\d{2}:\d{2}/i.test(trimmed)) {
    return ''
  }

  const local =
    new Date(time - BRASILIA_OFFSET_MS)

  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}T${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}:00${BRASILIA_OFFSET}`
}

function readOptionalText(
  record: Record<string, unknown>,
  key: string,
): string {
  const value =
    record[key]

  return typeof value === 'string'
    ? value.trim()
    : ''
}

// Campos novos da v6. Ausentes ou fora do formato: vazios (nunca derrubam
// a leitura).
// v8: lista de arquivos sugeridos; formato fora do esperado vira vazio.
function readSuggestedAttachments(
  decisionRaw: Record<string, unknown>,
): FullReadingSuggestedAttachment[] {
  const value =
    decisionRaw.arquivos_sugeridos

  if (!Array.isArray(value)) {
    return []
  }

  const seen =
    new Set<string>()

  const items: FullReadingSuggestedAttachment[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const ref =
      typeof (item as { ref?: unknown }).ref === 'string'
        ? ((item as { ref: string }).ref).trim().toLowerCase()
        : ''

    const motivo =
      typeof (item as { motivo?: unknown }).motivo === 'string'
        ? ((item as { motivo: string }).motivo).replace(/\s+/g, ' ').trim()
        : ''

    if (!/^arq-[0-9a-z]{6,8}$/.test(ref) || seen.has(ref)) {
      continue
    }

    seen.add(ref)
    items.push({ ref, motivo: motivo.slice(0, 200) })
  }

  return items.slice(0, FULL_READING_SUGGESTED_ATTACHMENTS_MAX)
}

function parseDecisionV6Extras(
  decisionRaw: Record<string, unknown>,
): Required<Pick<
  FullReadingDecision,
  | 'revisar_em'
  | 'revisar_motivo'
  | 'precisa_ler_inteira'
  | 'precisa_ler_inteira_motivo'
  | 'arquivos_sugeridos'
>> {
  const revisarEm =
    normalizeReviewAt(decisionRaw.revisar_em)

  const precisa =
    decisionRaw.precisa_ler_inteira === true ||
    (typeof decisionRaw.precisa_ler_inteira === 'string' &&
      decisionRaw.precisa_ler_inteira.trim().toLowerCase() === 'true')

  return {
    revisar_em: revisarEm,
    revisar_motivo:
      revisarEm
        ? readOptionalText(decisionRaw, 'revisar_motivo')
        : '',
    precisa_ler_inteira: precisa,
    precisa_ler_inteira_motivo:
      precisa
        ? readOptionalText(decisionRaw, 'precisa_ler_inteira_motivo')
        : '',
    arquivos_sugeridos:
      readSuggestedAttachments(decisionRaw),
  }
}

// format 'v6'/'v5' (a leitura atual e a anterior: mesma decisão, a v6 com
// os campos de tempo e de continuação), 'v4' (rodadas antigas:
// analise_markdown + decisão v4) ou 'auto' (decide pela presença de
// analise_markdown).
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
      resolved === 'v4' ? 'text' : 'objects',
    )

  if (resolved === 'v4') {
    return {
      analise_markdown: analysis,
      decisao: common,
    }
  }

  const hasV6Fields =
    resolved === 'v6' ||
    'revisar_em' in decisionRaw ||
    'precisa_ler_inteira' in decisionRaw

  return {
    analise_markdown: analysis,
    decisao: {
      ...common,
      ...parseDecisionV5Extras(decisionRaw, path),
      ...(hasV6Fields ? parseDecisionV6Extras(decisionRaw) : {}),
    },
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
  // Rodada 9 (E3/D5): como a leitura foi feita.
  modo?: FullReadingMode
  leitura_base?: string | null
  motivo?: string[]
  // Leituras de continuação seguidas até esta (0 numa completa).
  continuacoes_seguidas?: number
  // Ciclos lidos (o ciclo e, numa oportunidade nova, os de origem).
  cadeia?: string[]
  // A continuação pediu a conversa inteira (e a completa rodou em seguida).
  continuacao_pediu_inteira?: string | null
  // Leitura de atendimento de um ciclo encerrado (rodada 9, J).
  ciclo_encerrado?: string | null
  uso?: FullReadingUsage
  // Rodada 10 (C1): estimativa de entrada e o modo escolhido.
  estimativa?: {
    completa: number
    continuacao: number | null
    proporcao: number | null
    escolha: FullReadingMode
  } | null
  // Rodada 10 (D3): itens cortados por campo.
  cortes?: Record<string, number> | null
}

export type FullReadingMode =
  | 'completa'
  | 'continuacao'

export type FullReadingUsage = {
  chamadas: number
  entrada: number | null
  saida: number | null
  cache_lido: number | null
  cache_gravado: number | null
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

// Ciclo encerrado (rodada 9, F6): a etapa sugerida é sempre a atual.
const CLOSED_CYCLE_STATUSES =
  new Set(['ganho', 'perdido', 'cancelado'])

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
  if (
    currentStatus &&
    CLOSED_CYCLE_STATUSES.has(currentStatus) &&
    decision.etapa_kanban_sugerida !== currentStatus
  ) {
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
          motivo: 'ciclo encerrado: a etapa sugerida é a atual',
        },
      ],
    }
  }

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


// ---------------------------------------------------------------------------
// Limites da v7 (rodada 10, D3)
// ---------------------------------------------------------------------------
//
// Corta o que passar do limite, sem falhar: fica o começo da lista (o
// modelo põe o mais importante primeiro); na linha do tempo, em ordem
// cronológica, ficam os marcos mais recentes. Devolve quanto foi cortado
// de cada campo, para o log.

function cutList<T>(
  values: T[] | undefined,
  limit: number,
  field: string,
  cuts: Record<string, number>,
  keep: 'first' | 'last' = 'first',
): T[] | undefined {
  if (!Array.isArray(values) || values.length <= limit) {
    return values
  }

  cuts[field] = values.length - limit

  return keep === 'last'
    ? values.slice(values.length - limit)
    : values.slice(0, limit)
}

// Quanto a resposta crua do modelo passou de cada limite (o parser já
// cortava alguns campos sem registrar). Resposta ilegível: nada.
export function countFullReadingOverflow(
  text: string,
  limits: typeof FULL_READING_V7_LIMITS = FULL_READING_V7_LIMITS,
): Record<string, number> {
  let decision: Record<string, unknown> | null = null

  try {
    const parsed =
      extractJsonObject(text)

    decision =
      isRecord(parsed) && isRecord(parsed.decisao)
        ? parsed.decisao
        : null
  } catch {
    decision = null
  }

  if (!decision) {
    return {}
  }

  const nested = (key: string): Record<string, unknown> =>
    isRecord(decision?.[key]) ? (decision?.[key] as Record<string, unknown>) : {}

  const lengths: Record<string, unknown> = {
    linha_do_tempo: decision.linha_do_tempo,
    pendencias: decision.pendencias,
    oportunidades: decision.oportunidades,
    afirmacoes_a_confirmar: decision.afirmacoes_a_confirmar,
    contradicoes_cadastro: decision.contradicoes_cadastro,
    'cliente.sabemos': nested('cliente').sabemos,
    'cliente.inferimos': nested('cliente').inferimos,
    'cliente.a_confirmar': nested('cliente').a_confirmar,
    'conducao.acertos': nested('conducao').acertos,
    'conducao.ajustes': nested('conducao').ajustes,
    'como_conduzir.passos': nested('como_conduzir').passos,
    'como_conduzir.evitar': nested('como_conduzir').evitar,
    para_o_gestor: decision.para_o_gestor,
  }

  const limitOf: Record<string, number> = {
    linha_do_tempo: limits.linha_do_tempo,
    pendencias: limits.pendencias,
    oportunidades: limits.oportunidades,
    afirmacoes_a_confirmar: limits.afirmacoes_a_confirmar,
    contradicoes_cadastro: limits.contradicoes_cadastro,
    'cliente.sabemos': limits.cliente_sabemos,
    'cliente.inferimos': limits.cliente_inferimos,
    'cliente.a_confirmar': limits.cliente_a_confirmar,
    'conducao.acertos': limits.conducao_acertos,
    'conducao.ajustes': limits.conducao_ajustes,
    'como_conduzir.passos': limits.como_conduzir_passos,
    'como_conduzir.evitar': limits.como_conduzir_evitar,
    para_o_gestor: limits.para_o_gestor,
  }

  const overflow: Record<string, number> = {}

  for (const [field, value] of Object.entries(lengths)) {
    if (Array.isArray(value) && value.length > limitOf[field]) {
      overflow[field] = value.length - limitOf[field]
    }
  }

  return overflow
}

export function applyFullReadingLimits(
  decision: FullReadingDecision,
  limits: typeof FULL_READING_V7_LIMITS = FULL_READING_V7_LIMITS,
): {
  decision: FullReadingDecision
  cuts: Record<string, number>
} {
  const cuts: Record<string, number> = {}

  const next: FullReadingDecision = {
    ...decision,
    linha_do_tempo:
      cutList(decision.linha_do_tempo, limits.linha_do_tempo, 'linha_do_tempo', cuts, 'last') ?? [],
    pendencias:
      cutList(decision.pendencias, limits.pendencias, 'pendencias', cuts) ?? [],
    oportunidades:
      cutList(decision.oportunidades, limits.oportunidades, 'oportunidades', cuts) ?? [],
    afirmacoes_a_confirmar:
      cutList(decision.afirmacoes_a_confirmar, limits.afirmacoes_a_confirmar, 'afirmacoes_a_confirmar', cuts) ?? [],
    contradicoes_cadastro:
      cutList(decision.contradicoes_cadastro, limits.contradicoes_cadastro, 'contradicoes_cadastro', cuts),
    cliente: decision.cliente
      ? {
          ...decision.cliente,
          sabemos: cutList(decision.cliente.sabemos, limits.cliente_sabemos, 'cliente.sabemos', cuts) ?? [],
          inferimos: cutList(decision.cliente.inferimos, limits.cliente_inferimos, 'cliente.inferimos', cuts) ?? [],
          a_confirmar: cutList(decision.cliente.a_confirmar, limits.cliente_a_confirmar, 'cliente.a_confirmar', cuts) ?? [],
        }
      : decision.cliente,
    conducao: decision.conducao
      ? {
          ...decision.conducao,
          acertos: cutList(decision.conducao.acertos, limits.conducao_acertos, 'conducao.acertos', cuts) ?? [],
          ajustes: cutList(decision.conducao.ajustes, limits.conducao_ajustes, 'conducao.ajustes', cuts) ?? [],
        }
      : decision.conducao,
    como_conduzir: decision.como_conduzir
      ? {
          ...decision.como_conduzir,
          passos: cutList(decision.como_conduzir.passos, limits.como_conduzir_passos, 'como_conduzir.passos', cuts) ?? [],
          evitar: cutList(decision.como_conduzir.evitar, limits.como_conduzir_evitar, 'como_conduzir.evitar', cuts) ?? [],
        }
      : decision.como_conduzir,
    para_o_gestor:
      cutList(decision.para_o_gestor, limits.para_o_gestor, 'para_o_gestor', cuts),
  }

  return {
    decision: next,
    cuts,
  }
}
