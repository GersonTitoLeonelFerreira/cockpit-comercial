import type {
  LeadMethodCurrentInteractionMessage,
} from './lead-method-applicability'

import type {
  PublishedCommercialMethod,
} from './lead-method-guidance'

import type {
  StatefulCopilotProvider,
} from './stateful-copilot-executor'

export type SellerFacingGuidance = {
  status: 'ready' | 'not_applicable' | 'no_summary' | 'error'
  method_name: string | null
  method_config_version_id: string | null
  stage_key: string | null
  stage_name: string | null
  stage_reason: string | null
  next_step: string | null
  seller_intents: string[]
  error: string | null
}

const PROMPT_VERSION =
  'lead-seller-guidance-v1-context-quality'
const OUTPUT_CONTRACT_VERSION =
  'lead-seller-guidance-v1-context-quality'
const MAX_NEXT_STEP_LENGTH = 500
const MAX_SELLER_INTENT_LENGTH = 260

const CONTEXT_STOPWORDS = new Set([
  'agora',
  'ainda',
  'atendimento',
  'atual',
  'cliente',
  'com',
  'como',
  'contexto',
  'conversa',
  'depois',
  'duvida',
  'entender',
  'fazer',
  'informacao',
  'informacoes',
  'melhor',
  'momento',
  'para',
  'pessoa',
  'precisa',
  'precisou',
  'pergunta',
  'perguntou',
  'questao',
  'responder',
  'retorno',
  'situacao',
  'sobre',
  'vendedor',
  'verificar',
])

const SHORT_CONTEXT_ANCHORS = new Set([
  'app',
  'cpf',
  'cnpj',
  'pix',
])

type GroundedConcept = {
  label: string
  output: RegExp
  evidence: RegExp
}

const GROUNDED_CONCEPTS: GroundedConcept[] = [
  {
    label: 'matrícula/inscrição',
    output: /\b(matricul|inscri)\w*/,
    evidence: /\b(matricul|inscri)\w*/,
  },
  {
    label: 'cadastro',
    output: /\bcadastr\w*/,
    evidence: /\bcadastr\w*/,
  },
  {
    label: 'contrato',
    output: /\bcontrat\w*/,
    evidence: /\bcontrat\w*/,
  },
  {
    label: 'documento/CPF/CNPJ',
    output: /\b(document\w*|cpf|cnpj)\b/,
    evidence: /\b(document\w*|cpf|cnpj)\b/,
  },
  {
    label: 'Gympass/Wellhub/check-in/aplicativo',
    output: /\b(gympass|wellhub|check\s*in|aplicativo|app)\b/,
    evidence: /\b(gympass|wellhub|check\s*in|aplicativo|app)\b/,
  },
  {
    label: 'proposta/orçamento',
    output: /\b(proposta|orcamento)\w*/,
    evidence: /\b(proposta|orcamento)\w*/,
  },
  {
    label: 'pagamento/parcelamento',
    output: /\b(pagament|pagar|parcela|parcelament|cartao|pix|boleto|finance)\w*/,
    evidence: /\b(pagament|pagar|parcela|parcelament|cartao|pix|boleto|finance)\w*/,
  },
  {
    label: 'compra/fechamento',
    output: /\b(compra|comprar|adquir|fechar|fechamento|efetivar|concluir a compra)\w*/,
    evidence: /\b(compra|comprar|adquir|fechar|fechamento|efetivar|concluir a compra)\w*/,
  },
  {
    label: 'preço/investimento/desconto',
    output: /\b(preco|valor|investimento|desconto)\w*/,
    evidence: /\b(preco|valor|investimento|desconto)\w*/,
  },
  {
    label: 'objeção',
    output: /\b(objecao|resistencia)\w*/,
    evidence: /\b(objecao|resistencia)\w*/,
  },
  {
    label: 'cancelamento',
    output: /\b(cancelar|cancelamento|cancelado)\w*/,
    evidence: /\b(cancelar|cancelamento|cancelado)\w*/,
  },
  {
    label: 'agendamento/reunião/ligação',
    output: /\b(agendar|marcar|reuniao|ligacao|telefonar)\w*/,
    evidence: /\b(agendar|marcar|reuniao|ligacao|telefonar)\w*/,
  },
]

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  return value.replace(/\s+/g, ' ').trim() || null
}

function comparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSpecificAnchors(value: string): string[] {
  const unique = new Set<string>()

  comparable(value)
    .split(' ')
    .filter(Boolean)
    .forEach((token) => {
      if (
        (token.length >= 4 || SHORT_CONTEXT_ANCHORS.has(token)) &&
        !CONTEXT_STOPWORDS.has(token) &&
        !/^\d+$/.test(token)
      ) {
        unique.add(token)
      }
    })

  return [...unique]
}

function mentionsAnyAnchor(
  value: string,
  anchors: readonly string[],
) {
  const tokens = new Set(
    comparable(value).split(' ').filter(Boolean),
  )

  return anchors.some((anchor) => tokens.has(anchor))
}

function normalizeInteraction(
  value: readonly LeadMethodCurrentInteractionMessage[],
): LeadMethodCurrentInteractionMessage[] {
  return value
    .map((message) => ({
      direction: message.direction,
      occurred_at: message.occurred_at,
      text: text(message.text) || '',
    }))
    .filter((message) => Boolean(message.text))
}

function buildFactualContext(
  summary: string,
  interaction: readonly LeadMethodCurrentInteractionMessage[],
) {
  return [
    summary,
    ...interaction.map((entry) => entry.text),
  ].join('\n')
}

function findUnsupportedGroundedConcept(
  output: string,
  factualContext: string,
): string | null {
  const normalizedOutput = comparable(output)
  const normalizedContext = comparable(factualContext)

  for (const concept of GROUNDED_CONCEPTS) {
    if (
      concept.output.test(normalizedOutput) &&
      !concept.evidence.test(normalizedContext)
    ) {
      return concept.label
    }
  }

  return null
}

function normalizeSellerIntents(
  value: unknown,
): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const normalized = value
    .map(text)
    .filter((item): item is string => Boolean(item))

  if (
    normalized.length < 1 ||
    normalized.length > 3 ||
    normalized.some(
      (item) => item.length > MAX_SELLER_INTENT_LENGTH,
    )
  ) {
    return null
  }

  const unique = new Set(
    normalized.map(comparable),
  )

  return unique.size === normalized.length
    ? normalized
    : null
}

function buildCommercialOutputFormat(
  method: PublishedCommercialMethod,
) {
  const stageNames =
    method.stages.map((stage) => stage.name)

  return {
    type: 'json_schema',
    name: 'yolen_lead_seller_guidance_commercial_v1',
    description:
      'Orientação comercial seller-facing, específica e ancorada no contexto atual.',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        stage_name:
          stageNames.length > 0
            ? { type: 'string', enum: stageNames }
            : { type: 'string' },
        stage_reason: { type: 'string' },
        next_step: { type: 'string' },
        seller_intents: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: { type: 'string' },
        },
      },
      required: [
        'stage_name',
        'stage_reason',
        'next_step',
        'seller_intents',
      ],
    },
  } as const
}

const OPERATIONAL_OUTPUT_FORMAT = {
  type: 'json_schema',
  name: 'yolen_lead_seller_guidance_operational_v1',
  description:
    'Orientação operacional seller-facing para conversa sem ação comercial aplicável.',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      next_step: { type: 'string' },
      seller_intents: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: { type: 'string' },
      },
    },
    required: ['next_step', 'seller_intents'],
  },
} as const

type GuidanceAttempt = {
  guidance: SellerFacingGuidance | null
  failure: string | null
}

function validateContextualQuality({
  nextStep,
  sellerIntents,
  factualContext,
}: {
  nextStep: string
  sellerIntents: readonly string[]
  factualContext: string
}): string | null {
  if (nextStep.length > MAX_NEXT_STEP_LENGTH) {
    return 'A orientação ficou longa demais.'
  }

  const unsupportedConcept =
    findUnsupportedGroundedConcept(
      [nextStep, ...sellerIntents].join('\n'),
      factualContext,
    )

  if (unsupportedConcept) {
    return (
      `A orientação introduziu ${unsupportedConcept} sem evidência no contexto. ` +
      'Permaneça apenas no problema, pendência ou avanço realmente descritos.'
    )
  }

  const contextAnchors =
    getSpecificAnchors(factualContext)

  if (contextAnchors.length < 2) {
    return null
  }

  if (!mentionsAnyAnchor(nextStep, contextAnchors)) {
    return (
      'O contexto é rico, mas o próximo passo ficou genérico e intercambiável entre clientes. ' +
      `Use naturalmente um elemento concreto pertinente, como: ${contextAnchors.slice(0, 5).join(', ')}.`
    )
  }

  if (
    !sellerIntents.some(
      (intent) =>
        mentionsAnyAnchor(intent, contextAnchors),
    )
  ) {
    return (
      'Os atalhos ficaram genéricos apesar de haver fatos específicos. ' +
      `Pelo menos um atalho deve se ligar diretamente a: ${contextAnchors.slice(0, 5).join(', ')}.`
    )
  }

  return null
}

function parseCommercialGuidance({
  content,
  method,
  factualContext,
}: {
  content: unknown
  method: PublishedCommercialMethod
  factualContext: string
}): GuidanceAttempt {
  if (typeof content !== 'string') {
    return {
      guidance: null,
      failure: 'A IA não retornou orientação comercial estruturada.',
    }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(content)
  } catch {
    return {
      guidance: null,
      failure: 'A IA retornou orientação comercial em formato inválido.',
    }
  }

  if (!isRecord(parsed)) {
    return {
      guidance: null,
      failure: 'A IA retornou orientação comercial em formato inválido.',
    }
  }

  const stageName = text(parsed.stage_name)
  const stageReason = text(parsed.stage_reason)
  const nextStep = text(parsed.next_step)
  const sellerIntents =
    normalizeSellerIntents(parsed.seller_intents)

  if (
    !stageName ||
    !stageReason ||
    !nextStep ||
    !sellerIntents
  ) {
    return {
      guidance: null,
      failure: 'A orientação comercial veio incompleta.',
    }
  }

  const matchedStage = method.stages.find(
    (stage) =>
      comparable(stage.name) === comparable(stageName),
  ) ?? null

  if (method.stages.length > 0 && !matchedStage) {
    return {
      guidance: null,
      failure:
        'A orientação escolheu uma etapa inexistente no método publicado.',
    }
  }

  const qualityFailure = validateContextualQuality({
    nextStep,
    sellerIntents,
    factualContext,
  })

  if (qualityFailure) {
    return {
      guidance: null,
      failure: qualityFailure,
    }
  }

  return {
    guidance: {
      status: 'ready',
      method_name: method.name,
      method_config_version_id: method.id,
      stage_key: matchedStage?.key ?? null,
      stage_name: matchedStage?.name ?? stageName,
      stage_reason: stageReason,
      next_step: nextStep,
      seller_intents: sellerIntents,
      error: null,
    },
    failure: null,
  }
}

function parseOperationalGuidance({
  content,
  method,
  factualContext,
}: {
  content: unknown
  method: PublishedCommercialMethod
  factualContext: string
}): GuidanceAttempt {
  if (typeof content !== 'string') {
    return {
      guidance: null,
      failure: 'A IA não retornou orientação operacional estruturada.',
    }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(content)
  } catch {
    return {
      guidance: null,
      failure: 'A IA retornou orientação operacional em formato inválido.',
    }
  }

  if (!isRecord(parsed)) {
    return {
      guidance: null,
      failure: 'A IA retornou orientação operacional em formato inválido.',
    }
  }

  const nextStep = text(parsed.next_step)
  const sellerIntents =
    normalizeSellerIntents(parsed.seller_intents)

  if (!nextStep || !sellerIntents) {
    return {
      guidance: null,
      failure: 'A orientação operacional veio incompleta.',
    }
  }

  const qualityFailure = validateContextualQuality({
    nextStep,
    sellerIntents,
    factualContext,
  })

  if (qualityFailure) {
    return {
      guidance: null,
      failure: qualityFailure,
    }
  }

  return {
    guidance: {
      status: 'not_applicable',
      method_name: method.name,
      method_config_version_id: method.id,
      stage_key: null,
      stage_name: null,
      stage_reason: null,
      next_step: nextStep,
      seller_intents: sellerIntents,
      error: null,
    },
    failure: null,
  }
}

async function runAttempt({
  mode,
  summary,
  interaction,
  method,
  provider,
  correctionReason,
}: {
  mode: 'commercial' | 'operational'
  summary: string
  interaction: readonly LeadMethodCurrentInteractionMessage[]
  method: PublishedCommercialMethod
  provider: StatefulCopilotProvider
  correctionReason?: string | null
}): Promise<GuidanceAttempt> {
  const factualContext =
    buildFactualContext(summary, interaction)
  const contextAnchors =
    getSpecificAnchors(factualContext)
  const correction = correctionReason
    ? [
        'A tentativa anterior não passou pela validação seller-facing.',
        `Motivo: ${correctionReason}`,
        'Corrija sem relaxar grounding, gate comercial ou especificidade.',
      ]
    : []

  const commonPrompt = [
    'Você é o motor seller-facing do Yolen Companion.',
    'working_summary e current_interaction são as únicas fontes de fatos sobre este cliente e esta situação.',
    'O contexto da empresa, o método e as regras do vendedor orientam comportamento, mas não provam fatos do cliente.',
    'Uma pergunta ou hipótese do cliente não prova que a resposta sugerida dentro dela seja verdadeira.',
    'Não invente valores, datas, horários, compromisso, disponibilidade, matrícula, cadastro, documentos, condição contratual, proposta, pagamento, objeção ou qualquer outro fato.',
    'A orientação deve ser curta, concreta, operacional e ligada à interação atual.',
    'Evite frases abstratas como avançar a negociação buscando compreender, retomar contato, fazer follow-up, responder naturalmente ou marcar uma conversa sem motivo contextual.',
    'Quando houver fatos específicos, use naturalmente os relevantes. Se trocar o cliente e a orientação continuar servindo para dezenas de casos, ela está genérica demais.',
    'Gere no máximo 3 seller_intents. Eles são atalhos de intenção que o vendedor poderá escolher antes de pedir uma mensagem; não são mensagens prontas.',
    'Os atalhos devem preferir ações específicas do contexto. Um atalho neutro de encerramento pode existir como opção secundária, mas não deve substituir atalhos contextuais.',
  ]

  const modePrompt = mode === 'commercial'
    ? [
        'A classificação anterior confirmou que existe ação comercial legítima nesta interação.',
        'Aplique somente o método PUBLICADO; não invente etapas e não use a etapa do CRM como substituto.',
        'Quando existirem stages, escolha exatamente uma etapa fornecida.',
        'Defina um único próximo passo comercial legítimo, sustentado pelo contexto atual.',
        'Não introduza fechamento, proposta, pagamento, preço ou objeção se esses conceitos não estiverem sustentados.',
      ]
    : [
        'A classificação anterior confirmou que NÃO há ação comercial legítima nesta interação.',
        'Não aplique etapa do método e não tente converter suporte, contrato, pós-venda, dúvida operacional, contratação, administrativo ou assunto pessoal em venda.',
        'Ainda assim, ajude o vendedor com um próximo passo OPERACIONAL específico para resolver o assunto atual.',
        'Não crie proposta, fechamento, pagamento, objeção ou intenção de compra.',
      ]

  try {
    const response = await provider({
      prompt_version: `${PROMPT_VERSION}-${mode}`,
      output_contract_version:
        OUTPUT_CONTRACT_VERSION,
      system_prompt: [
        ...commonPrompt,
        ...modePrompt,
        ...correction,
      ].join('\n'),
      user_prompt: JSON.stringify({
        mode,
        working_summary: summary,
        current_interaction: interaction,
        context_specificity_anchors:
          contextAnchors.slice(0, 12),
        published_commercial_context: {
          config_version_id: method.id,
          source_contract_version:
            method.source_contract_version,
          business_context: method.business_context,
          method: {
            name: method.name,
            description: method.description,
            structure_source: method.structure_source,
            principles: method.principles,
            stages: method.stages,
          },
          seller_rules: method.seller_rules,
        },
      }),
      structured_output_format:
        mode === 'commercial'
          ? buildCommercialOutputFormat(method)
          : OPERATIONAL_OUTPUT_FORMAT,
    })

    return mode === 'commercial'
      ? parseCommercialGuidance({
          content: response.content,
          method,
          factualContext,
        })
      : parseOperationalGuidance({
          content: response.content,
          method,
          factualContext,
        })
  } catch {
    return {
      guidance: null,
      failure:
        'Falha transitória ao gerar a orientação seller-facing.',
    }
  }
}

export async function composeSellerFacingGuidance({
  mode,
  workingSummary,
  currentInteraction = [],
  method,
  provider,
}: {
  mode: 'commercial' | 'operational'
  workingSummary: string | null
  currentInteraction?: readonly LeadMethodCurrentInteractionMessage[]
  method: PublishedCommercialMethod
  provider: StatefulCopilotProvider
}): Promise<SellerFacingGuidance> {
  const summary = text(workingSummary)
  const interaction =
    normalizeInteraction(currentInteraction)

  if (!summary) {
    return {
      status: 'no_summary',
      method_name: method.name,
      method_config_version_id: method.id,
      stage_key: null,
      stage_name: null,
      stage_reason: null,
      next_step: null,
      seller_intents: [],
      error: null,
    }
  }

  const first = await runAttempt({
    mode,
    summary,
    interaction,
    method,
    provider,
  })

  if (first.guidance) {
    return first.guidance
  }

  const corrected = await runAttempt({
    mode,
    summary,
    interaction,
    method,
    provider,
    correctionReason:
      first.failure ||
      'A primeira saída não passou pela validação.',
  })

  if (corrected.guidance) {
    return corrected.guidance
  }

  return {
    status: 'error',
    method_name: method.name,
    method_config_version_id: method.id,
    stage_key: null,
    stage_name: null,
    stage_reason: null,
    next_step: null,
    seller_intents: [],
    error:
      corrected.failure ||
      first.failure ||
      'Não foi possível definir um próximo passo específico.',
  }
}
