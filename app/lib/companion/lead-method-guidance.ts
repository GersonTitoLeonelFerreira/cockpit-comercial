import type {
  StatefulCopilotProvider,
} from './stateful-copilot-executor'

import {
  validateCommercialMethodDefinition,
  type CommercialMethodDefinition,
} from './commercial-method-contract'

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

export type PublishedCommercialMethodDimension = {
  key: string
  name: string
  objective: string | null
  evidence_criteria: string[]
}

export type PublishedCommercialMethodStage = {
  key: string
  name: string
  display_order: number
  objective: string | null
  requirement: string | null
  completion_criteria: string[]
  partial_completion_criteria: string[]
  skip_conditions: string[]
  deepen_when: string[]
  sufficient_when: string[]
  advance_when: string[]
  wait_when: string[]
  stop_asking_when: string[]
  recommended_questions: string[]
  common_mistakes: string[]
  dimensions: PublishedCommercialMethodDimension[]
}

export type PublishedCommercialMethod = {
  id: string
  version_number: number | null
  source_contract_version: string | null
  name: string
  description: string
  structure_source: 'structured_definition'
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

export type NormalizePublishedCommercialMethodResult =
  | { status: 'active'; method: PublishedCommercialMethod }
  | { status: 'not_configured' }
  | { status: 'invalid'; reason: string }

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

// O único caminho operacional é uma versão publicada declarando
// commercial-method-v2 com commercial_method_definition válido pelo
// contrato semântico (commercial-method-contract.ts). Não existe mais
// parsing de commercial_method_description nem uso de
// company_commercial_method_steps como estrutura do método: ambos
// deixaram de ser fonte ativa. Ver ONDA 8 / FRENTE 2.
function toPublishedStage(
  stage: CommercialMethodDefinition['stages'][number],
): PublishedCommercialMethodStage {
  return {
    key: stage.key,
    name: stage.name,
    display_order: stage.display_order,
    objective: text(stage.objective),
    requirement: stage.requirement,
    completion_criteria: texts(stage.completion_criteria),
    partial_completion_criteria: texts(stage.partial_completion_criteria),
    skip_conditions: texts(stage.skip_conditions),
    deepen_when: texts(stage.deepen_when),
    sufficient_when: texts(stage.sufficient_when),
    advance_when: texts(stage.advance_when),
    wait_when: texts(stage.wait_when),
    stop_asking_when: texts(stage.stop_asking_when),
    recommended_questions: texts(stage.recommended_questions),
    common_mistakes: texts(stage.common_mistakes),
    dimensions: stage.dimensions.map((dimension) => ({
      key: dimension.key,
      name: dimension.name,
      objective: text(dimension.objective),
      evidence_criteria: texts(dimension.evidence_criteria),
    })),
  }
}

export function normalizePublishedCommercialMethod(
  value: unknown,
): NormalizePublishedCommercialMethodResult {
  if (!isRecord(value)) return { status: 'not_configured' }

  const contractVersion = text(
    value.commercial_method_contract_version,
  )

  if (contractVersion !== 'commercial-method-v2') {
    return { status: 'not_configured' }
  }

  const id = text(value.id)

  if (!id) {
    return {
      status: 'invalid',
      reason:
        'A configuração comercial publicada não possui identificador.',
    }
  }

  const definitionValue = value.commercial_method_definition

  if (!isRecord(definitionValue)) {
    return {
      status: 'invalid',
      reason:
        'O método V2 publicado precisa possuir uma definição semântica.',
    }
  }

  const definition =
    definitionValue as unknown as CommercialMethodDefinition

  let validation

  try {
    validation = validateCommercialMethodDefinition(definition)
  } catch {
    return {
      status: 'invalid',
      reason:
        'A definição semântica publicada do método comercial é inválida.',
    }
  }

  if (!validation.valid) {
    return {
      status: 'invalid',
      reason:
        'A definição semântica publicada do método comercial não respeita o contrato V2: ' +
        validation.issues
          .map((issue) => `${issue.path} (${issue.code})`)
          .join('; '),
    }
  }

  const stages = [...definition.stages]
    .sort((left, right) => left.display_order - right.display_order)
    .map(toPublishedStage)

  return {
    status: 'active',
    method: {
      id,
      version_number:
        typeof value.version_number === 'number' &&
        Number.isFinite(value.version_number)
          ? value.version_number
          : null,
      source_contract_version: contractVersion,
      name: definition.name,
      description: definition.description,
      structure_source: 'structured_definition',
      principles: texts(definition.principles),
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
        'stages[].skip_conditions descreve quando uma etapa condicional pode ser pulada; nunca use para pular uma etapa obrigatória.',
        'stages[].dimensions são lentes internas para compreender uma etapa, não uma sequência obrigatória de perguntas; cada dimension.evidence_criteria indica que evidência é relevante, não uma pergunta a ser feita.',
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
