import type {
  StatefulCopilotProvider,
} from './stateful-copilot-executor'

export type LeadMethodGuidanceStatus =
  | 'ready'
  | 'missing_method'
  | 'invalid_method'
  | 'no_summary'
  | 'error'

export type LeadMethodGuidance = {
  status: LeadMethodGuidanceStatus
  method_name: string | null
  method_config_version_id: string | null
  stage_key: string | null
  stage_name: string | null
  stage_reason: string | null
  next_step: string | null
  error: string | null
}

export type PublishedCommercialMethodStage = {
  key: string
  name: string
  display_order: number
  objective: string | null
  completion_criteria: string[]
  partial_completion_criteria: string[]
  deepen_when: string[]
  sufficient_when: string[]
  advance_when: string[]
  wait_when: string[]
  stop_asking_when: string[]
  recommended_questions: string[]
  common_mistakes: string[]
}

export type PublishedCommercialMethod = {
  id: string
  version_number: number | null
  source_contract_version: string | null
  name: string
  description: string
  structure_source:
    | 'structured_definition'
    | 'declared_description'
    | 'legacy_steps'
    | 'description_only'
  principles: string[]
  stages: PublishedCommercialMethodStage[]
  business_context: {
    business_description: string | null
    target_audience: string | null
    value_proposition: string | null
  }
  seller_rules: {
    communication_tone: string | null
    required_behaviors: string[]
    prohibited_behaviors: string[]
  }
}

const PROMPT_VERSION = 'lead-method-guidance-v4-grounded'
const OUTPUT_CONTRACT_VERSION = 'lead-method-guidance-v4-grounded'
const MAX_NEXT_STEP_LENGTH = 1400

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value.replace(/\s+/g, ' ').trim() || null
}

function texts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(text)
    .filter((item): item is string => Boolean(item))
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

function key(value: unknown, fallback: string): string {
  const normalized = text(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized || fallback
}

function declaredStageNames(value: unknown): string[] {
  if (typeof value !== 'string') return []

  const lines = value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) =>
      line.replace(/^\s*[-*•\d.)]+\s*/, '').trim(),
    )
    .filter(Boolean)

  if (lines.length < 3) return []

  const candidates = lines
    .slice(1)
    .filter((line) =>
      line.length <= 60 &&
      !line.includes(':') &&
      !/[.!?;]$/.test(line),
    )

  if (
    candidates.length < 2 ||
    candidates.length > 10 ||
    candidates.length !== lines.length - 1
  ) {
    return []
  }

  const unique = new Map<string, string>()
  candidates.forEach((candidate) => {
    const normalized = comparable(candidate)
    if (normalized && !unique.has(normalized)) {
      unique.set(normalized, candidate)
    }
  })

  return [...unique.values()]
}

function emptyStage(
  name: string,
  displayOrder: number,
  stageKey: string,
): PublishedCommercialMethodStage {
  return {
    key: stageKey,
    name,
    display_order: displayOrder,
    objective: null,
    completion_criteria: [],
    partial_completion_criteria: [],
    deepen_when: [],
    sufficient_when: [],
    advance_when: [],
    wait_when: [],
    stop_asking_when: [],
    recommended_questions: [],
    common_mistakes: [],
  }
}

function structuredStages(value: unknown): PublishedCommercialMethodStage[] {
  if (!isRecord(value) || !Array.isArray(value.stages)) return []

  const stages: PublishedCommercialMethodStage[] = []

  value.stages.forEach((rawStage, index) => {
    if (!isRecord(rawStage)) return
    const name = text(rawStage.name)
    if (!name) return

    const stage = emptyStage(
      name,
      typeof rawStage.display_order === 'number' &&
        Number.isFinite(rawStage.display_order)
        ? rawStage.display_order
        : index + 1,
      key(rawStage.key, `stage_${index + 1}`),
    )

    stage.objective = text(rawStage.objective)
    stage.completion_criteria = texts(rawStage.completion_criteria)
    stage.partial_completion_criteria = texts(
      rawStage.partial_completion_criteria,
    )
    stage.deepen_when = texts(rawStage.deepen_when)
    stage.sufficient_when = texts(rawStage.sufficient_when)
    stage.advance_when = texts(rawStage.advance_when)
    stage.wait_when = texts(rawStage.wait_when)
    stage.stop_asking_when = texts(rawStage.stop_asking_when)
    stage.recommended_questions = texts(rawStage.recommended_questions)
    stage.common_mistakes = texts(rawStage.common_mistakes)
    stages.push(stage)
  })

  return stages.sort((left, right) =>
    left.display_order - right.display_order,
  )
}

function legacyStages(value: unknown): PublishedCommercialMethodStage[] {
  if (!Array.isArray(value)) return []

  const stages: PublishedCommercialMethodStage[] = []

  value.forEach((rawStage, index) => {
    if (!isRecord(rawStage)) return
    const name = text(rawStage.name)
    if (!name) return

    const displayOrder =
      typeof rawStage.step_order === 'number' &&
      Number.isFinite(rawStage.step_order)
        ? rawStage.step_order
        : index + 1

    const stage = emptyStage(
      name,
      displayOrder,
      key(rawStage.key, `legacy_step_${displayOrder}`),
    )

    stage.objective = text(rawStage.objective)
    stage.completion_criteria = texts(rawStage.completion_criteria)
    stage.recommended_questions = texts(rawStage.recommended_questions)
    stages.push(stage)
  })

  return stages.sort((left, right) =>
    left.display_order - right.display_order,
  )
}

export function normalizePublishedCommercialMethod(
  value: unknown,
  legacyStepsValue: unknown = [],
): PublishedCommercialMethod | null {
  if (!isRecord(value)) return null

  const id = text(value.id)
  const name = text(value.commercial_method_name)
  const description = text(value.commercial_method_description)

  if (!id || !name || !description) return null

  const definition = value.commercial_method_definition
  const fromDefinition = structuredStages(definition)
  const fromDescription = declaredStageNames(
    value.commercial_method_description,
  )
  const fromLegacy = legacyStages(legacyStepsValue)

  let structureSource: PublishedCommercialMethod['structure_source'] =
    'description_only'
  let stages: PublishedCommercialMethodStage[] = []

  if (fromDefinition.length > 0) {
    structureSource = 'structured_definition'
    stages = fromDefinition
  } else if (fromDescription.length > 0) {
    structureSource = 'declared_description'
    stages = fromDescription.map((stageName, index) =>
      emptyStage(
        stageName,
        index + 1,
        key(stageName, `declared_stage_${index + 1}`),
      ),
    )
  } else if (fromLegacy.length > 0) {
    structureSource = 'legacy_steps'
    stages = fromLegacy
  }

  return {
    id,
    version_number:
      typeof value.version_number === 'number' &&
      Number.isFinite(value.version_number)
        ? value.version_number
        : null,
    source_contract_version:
      text(value.commercial_method_contract_version),
    name,
    description,
    structure_source: structureSource,
    principles: isRecord(definition)
      ? texts(definition.principles)
      : [],
    stages,
    business_context: {
      business_description: text(value.business_description),
      target_audience: text(value.target_audience),
      value_proposition: text(value.value_proposition),
    },
    seller_rules: {
      communication_tone: text(value.communication_tone),
      required_behaviors: texts(value.required_behaviors),
      prohibited_behaviors: texts(value.prohibited_behaviors),
    },
  }
}

function emptyGuidance(
  status: LeadMethodGuidanceStatus,
  method?: PublishedCommercialMethod | null,
  error?: string | null,
): LeadMethodGuidance {
  return {
    status,
    method_name: method?.name ?? null,
    method_config_version_id: method?.id ?? null,
    stage_key: null,
    stage_name: null,
    stage_reason: null,
    next_step: null,
    error: error ?? null,
  }
}

function looksGeneric(nextStep: string): boolean {
  const generic = new Set([
    'retomar a negociacao',
    'acompanhar o lead',
    'fazer follow up',
    'realizar follow up',
    'avancar a negociacao',
    'entrar em contato com o cliente',
    'aguardar retorno',
  ])

  return generic.has(comparable(nextStep))
}

type GroundedConcept = {
  label: string
  output: RegExp
  evidence: RegExp
}

const GROUNDED_CONCEPTS: GroundedConcept[] = [
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
    output: /\b(compra|comprar|adquir|fechar|fechamento|efetivar)\w*/,
    evidence: /\b(compra|comprar|adquir|fechar|fechamento|efetivar)\w*/,
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

function findUnsupportedGroundedConcept(
  output: string,
  summary: string,
): string | null {
  const normalizedOutput = comparable(output)
  const normalizedSummary = comparable(summary)

  for (const concept of GROUNDED_CONCEPTS) {
    if (
      concept.output.test(normalizedOutput) &&
      !concept.evidence.test(normalizedSummary)
    ) {
      return concept.label
    }
  }

  return null
}

function structuredOutputFormat(method: PublishedCommercialMethod) {
  const stageNames = method.stages.map((stage) => stage.name)

  return {
    type: 'json_schema',
    name: 'yolen_lead_method_guidance_v4_grounded',
    description:
      'Aplicação estritamente ancorada do método comercial publicado ao resumo atual do lead.',
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
      },
      required: ['stage_name', 'stage_reason', 'next_step'],
    },
  }
}

type GuidanceAttempt = {
  guidance: LeadMethodGuidance | null
  failure: string | null
}

function parseGuidance(
  content: unknown,
  method: PublishedCommercialMethod,
  summary: string,
): GuidanceAttempt {
  if (typeof content !== 'string') {
    return { guidance: null, failure: 'A IA não retornou orientação pelo método.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { guidance: null, failure: 'A IA retornou orientação em formato inválido.' }
  }

  if (!isRecord(parsed)) {
    return { guidance: null, failure: 'A IA retornou orientação em formato inválido.' }
  }

  const stageName = text(parsed.stage_name)
  const stageReason = text(parsed.stage_reason)
  const nextStep = text(parsed.next_step)

  if (!stageName || !stageReason || !nextStep) {
    return { guidance: null, failure: 'A orientação veio incompleta.' }
  }

  const matchedStage = method.stages.find(
    (stage) => comparable(stage.name) === comparable(stageName),
  ) ?? null

  if (method.stages.length > 0 && !matchedStage) {
    return {
      guidance: null,
      failure: 'A orientação escolheu uma etapa que não existe no método publicado.',
    }
  }

  if (nextStep.length > MAX_NEXT_STEP_LENGTH) {
    return { guidance: null, failure: 'A orientação excedeu o tamanho permitido.' }
  }

  if (looksGeneric(nextStep)) {
    return { guidance: null, failure: 'A orientação ficou genérica demais.' }
  }

  const unsupportedConcept = findUnsupportedGroundedConcept(
    `${stageReason} ${nextStep}`,
    summary,
  )

  if (unsupportedConcept) {
    return {
      guidance: null,
      failure:
        `A orientação introduziu ${unsupportedConcept} sem evidência no resumo. ` +
        'Permaneça no problema, pendência ou confirmação realmente descritos.',
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
      error: null,
    },
    failure: null,
  }
}

async function runAttempt({
  summary,
  method,
  provider,
  correctionReason,
}: {
  summary: string
  method: PublishedCommercialMethod
  provider: StatefulCopilotProvider
  correctionReason?: string | null
}): Promise<GuidanceAttempt> {
  const correction = correctionReason
    ? [
        'A tentativa anterior não passou pela validação.',
        `Motivo: ${correctionReason}`,
        'Corrija sem relaxar o contrato.',
      ]
    : []

  try {
    const response = await provider({
      prompt_version: PROMPT_VERSION,
      output_contract_version: OUTPUT_CONTRACT_VERSION,
      system_prompt: [
        'Você é o motor V2 de orientação por método comercial do Yolen Companion.',
        'Receba o contrato canônico da configuração PUBLICADA e o resumo do lead.',
        'O método publicado é a autoridade. Não invente outro funil e não use a etapa do CRM como substituto.',
        'Quando existirem stages, escolha exatamente uma etapa fornecida.',
        'Campos vazios significam que a empresa não detalhou aquela regra; não complete por suposição.',
        'O working_summary é a ÚNICA fonte autorizada de fatos sobre este cliente e esta situação.',
        'O contexto da empresa e regras do vendedor são limites operacionais, nunca evidência de que algo aconteceu com o cliente.',
        'A orientação deve resolver ou avançar a pendência factual mais imediata descrita no resumo antes de sugerir um passo comercial posterior.',
        'Se o resumo diz que falta verificar contrato, cadastro, documento, condição operacional ou outra informação, oriente primeiro essa verificação e o retorno ao cliente.',
        'NUNCA introduza proposta, orçamento, pagamento, parcelamento, preço, desconto, compra, fechamento, objeção, cancelamento, reunião ou ligação se esse conceito não estiver explicitamente sustentado no working_summary.',
        'Não presuma intenção de compra a partir de uma dúvida operacional ou de atendimento.',
        'Não transforme atendimento contratual, suporte ou verificação cadastral em fechamento de venda.',
        'Quando a estrutura do método trouxer somente nomes de etapas e campos semânticos vazios, não invente o significado detalhado da etapa; use o método apenas como enquadramento e mantenha a ação ancorada no resumo.',
        'Defina uma única ação específica e executável e diga qual informação, confirmação ou resultado o vendedor deve obter.',
        'Não responda apenas com retomar negociação, fazer follow-up, acompanhar ou aguardar retorno.',
        'Não invente fatos, datas, valores, compromissos, objeções ou regras.',
        'Não escreva mensagem pronta para o cliente.',
        ...correction,
      ].join('\n'),
      user_prompt: JSON.stringify({
        working_summary: summary,
        published_commercial_context: {
          config_version_id: method.id,
          source_contract_version: method.source_contract_version,
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
      structured_output_format: structuredOutputFormat(method),
    })

    return parseGuidance(response.content, method, summary)
  } catch {
    return {
      guidance: null,
      failure: 'Falha transitória ao gerar a orientação pelo método.',
    }
  }
}

export async function composeLeadMethodGuidance({
  workingSummary,
  method,
  provider,
}: {
  workingSummary: string | null
  method: PublishedCommercialMethod | null
  provider: StatefulCopilotProvider
}): Promise<LeadMethodGuidance> {
  const summary = text(workingSummary)

  if (!summary) return emptyGuidance('no_summary', method)
  if (!method) return emptyGuidance('missing_method')

  const first = await runAttempt({ summary, method, provider })
  if (first.guidance) return first.guidance

  const corrected = await runAttempt({
    summary,
    method,
    provider,
    correctionReason:
      first.failure || 'A primeira saída não passou pela validação.',
  })

  if (corrected.guidance) return corrected.guidance

  return emptyGuidance(
    'error',
    method,
    corrected.failure ||
      first.failure ||
      'Não foi possível definir um próximo passo específico.',
  )
}
