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
  'lead-seller-guidance-v2-context-quality'
const OUTPUT_CONTRACT_VERSION =
  'lead-seller-guidance-v1-context-quality'
const MAX_NEXT_STEP_LENGTH = 500
const MAX_SELLER_INTENT_LENGTH = 260

const CONTEXT_STOPWORDS = new Set([
  'acao',
  'agora',
  'ainda',
  'atendimento',
  'assunto',
  'atual',
  'cliente',
  'comercial',
  'com',
  'como',
  'contexto',
  'conversa',
  'depois',
  'duvida',
  'entender',
  'existe',
  'fazer',
  'informacao',
  'informacoes',
  'melhor',
  'momento',
  'natural',
  'para',
  'pessoal',
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

function isQuestionLikeHypothesis(value: string): boolean {
  const normalized = comparable(value)

  return (
    value.includes('?') ||
    /\b(perguntou|pergunta|quer saber|duvida)\s+(se|como)\b/.test(
      normalized,
    )
  )
}

function looksLikeUnsupportedQuestionAffirmation(value: string): boolean {
  const normalized = comparable(value)

  return (
    /\b(confirmar que|confirme que|explicar que|explique que|informar que|informe que|dizer que|diga que)\b/.test(
      normalized,
    ) ||
    /\b(e so|basta)\b/.test(normalized)
  )
}

function summaryHasDeclarativeSupport(summary: string): boolean {
  return /\b(confirmad|regra|funciona|deve|e feito|e necessario|orientacao oficial|foi informado)\b/.test(
    comparable(summary),
  )
}

function validateQuestionHypothesisGuidance({
  guidance,
  summary,
  interaction,
}: {
  guidance: SellerFacingGuidance
  summary: string
  interaction: readonly LeadMethodCurrentInteractionMessage[]
}): string | null {
  const latest = interaction[interaction.length - 1] ?? null

  if (
    latest?.direction !== 'incoming' ||
    !isQuestionLikeHypothesis(latest.text) ||
    summaryHasDeclarativeSupport(summary)
  ) {
    return null
  }

  const output = [
    guidance.next_step || '',
    ...guidance.seller_intents,
  ].join('\n')

  if (looksLikeUnsupportedQuestionAffirmation(output)) {
    return (
      'A orientação tratou como fato uma hipótese que aparece apenas como pergunta do cliente. ' +
      'Não confirme nem explique como verdadeiro algo que ainda não possui apoio declarativo no contexto.'
    )
  }

  return null
}

function endsWithUnansweredOutgoingQuestion(
  interaction: readonly LeadMethodCurrentInteractionMessage[],
): boolean {
  const latest = interaction[interaction.length - 1] ?? null

  return (
    latest?.direction === 'outgoing' &&
    latest.text.trim().endsWith('?')
  )
}

function nextStepRequestsNewQuestion(value: string): boolean {
  const normalized = comparable(value)

  if (/\b(aguard|espera|esperar)\w*/.test(normalized)) {
    // Uma orientação fundamentalmente de espera pode mencionar
    // "perguntar"/"cobrar" apenas para dizer o que NÃO fazer ainda
    // (ex.: "aguarde antes de fazer nova cobrança"). Tratar essas
    // menções como pedido de nova pergunta produziria falso positivo
    // exatamente no cenário que este gate deveria proteger.
    return false
  }

  return /\b(pergunt|questione|indague)\w*/.test(normalized)
}

function validateAlreadyExecutedActionGuidance({
  guidance,
  interaction,
}: {
  guidance: SellerFacingGuidance
  interaction: readonly LeadMethodCurrentInteractionMessage[]
}): string | null {
  if (!endsWithUnansweredOutgoingQuestion(interaction)) {
    return null
  }

  const output = [
    guidance.next_step || '',
    ...guidance.seller_intents,
  ].join('\n')

  if (!nextStepRequestsNewQuestion(output)) {
    return null
  }

  return (
    'A última mensagem outgoing já é uma pergunta sem resposta do cliente. ' +
    'Essa ação já foi executada: não recomende perguntar de novo, oriente aguardar a resposta.'
  )
}

// Fase 12A, Frente 2B — Blocker 3: gate determinístico anti-regressão de
// etapa. O modelo recalcula a etapa do zero a cada chamada; sem este
// gate, nada impede uma regressão silenciosa (ex.: Formalização ->
// Descoberta) sem evidência real. Regressão continua sendo PERMITIDA
// quando há evidência de que algo realmente mudou (desistência,
// cancelamento, reabertura de objeção encerrada, pedido explícito de
// recomeçar) — a ausência de avanço NÃO é motivo para regredir.
//
// Re-auditoria do Controle Mestre: a saída do próprio modelo (stage_reason)
// NUNCA pode autorizar o gate — um modelo que escolha regredir poderia
// simplesmente escrever "cliente desistiu" no seu próprio stage_reason e
// desbloquear a própria regressão. A única fonte de evidência aceita é
// current_interaction com direction="incoming" (o texto real do
// cliente nesta rodada) — nunca stage_reason, nunca working_summary
// (também gerado por modelo em turnos anteriores), nunca mensagens
// outgoing do vendedor. Silêncio/ausência de resposta ("parou de
// responder", "sumiu", "desapareceu") NUNCA justifica regressão — isso é
// waiting/follow-up, não mudança comercial.
export type PreviousMethodStage = {
  method_config_version_id: string
  stage_key: string
  stage_display_order: number
  stage_reason: string | null
}

// Re-auditoria do Controle Mestre (3ª rodada): "palavra-chave presente +
// nenhum filtro disparou" ainda é permissivo demais — "quero saber como
// cancelar", "talvez eu cancele", "meu marido cancelou" e "não quero mais
// receber mensagens" contêm as palavras-chave sem representar nenhuma
// regressão comercial real. A estratégia muda de KEYWORD + BLACKLIST DE
// EXCEÇÕES para ALLOWLIST: a frase só é aceita quando casa com um padrão
// AFIRMATIVO explícito de mudança comercial em primeira pessoa
// (AFFIRMATIVE_REGRESSION_PATTERN). Os filtros de pergunta/condicional/
// incerteza/terceiro/negação continuam existindo como defesa adicional
// (e são necessários: "quero cancelar" aparece como substring dentro de
// "não quero cancelar" e de "não tenho certeza se quero cancelar", então
// esses filtros têm que rodar ANTES do allowlist decidir). Na dúvida, não
// regride (fail-closed) — nenhum modelo novo, só normalização + regex.
//
// MENÇÃO A CANCELAMENTO ≠ CANCELAMENTO. PERGUNTA ≠ FATO. HIPÓTESE ≠ FATO.
// NEGAÇÃO DE REGRESSÃO ≠ REGRESSÃO. TERCEIRO ≠ O PRÓPRIO CLIENTE.
// "não quero mais" sozinho não basta: precisa estar ligado a um verbo de
// continuidade da negociação (continuar/seguir/fechar/contratar/comprar)
// — "não quero mais receber mensagens/ligação/promoção" é opt-out de
// comunicação, não desistência comercial.
const AFFIRMATIVE_REGRESSION_PATTERN =
  /\b((eu )?desisti|(eu )?(quero|vou|decidi) desistir|(eu )?(quero|vou|decidi) cancelar|(eu )?mudei de ideia|voltei atras|(eu )?(quero|vou) recomecar|quero comecar de novo|nao quero mais (continuar|seguir|fechar|contratar|comprar|prosseguir|avancar))\b/

// (A) Pergunta — com "?" literal ou com marcador interrogativo/de busca
// de informação, já que mensagens de WhatsApp frequentemente chegam sem
// pontuação ("Como faço para cancelar", "Quero saber como cancelar").
const QUESTION_MARKER_PATTERN =
  /\b(posso|poderia|poderiam|consigo|conseguiria|seria possivel|da pra|tem como|o que acontece se|quanto custa|e se eu|como faco|quero saber|quando posso)\b/

// (B) Condicional/hipótese — a frase descreve um cenário futuro/hipotético,
// não uma decisão já tomada.
const CONDITIONAL_MARKER_PATTERN =
  /\b(se eu|se for|se acontecer|caso eu|hipoteticamente|na hipotese|imagina se|supondo que)\b/

// Incerteza — "talvez", "estou pensando em", "não tenho certeza": o
// cliente está cogitando, não afirmando um fato já decidido.
const UNCERTAINTY_MARKER_PATTERN =
  /\b(talvez|pode ser que|estou pensando em|estou considerando|nao tenho certeza|nao sei se|sera que|quem sabe|penso em cancelar|penso em desistir)\b/

// (D) Referência a terceiro/regra — outra pessoa, ou a política da
// empresa/contrato, não a decisão do próprio cliente.
const THIRD_PARTY_REFERENCE_PATTERN =
  /\b(contrato|regra|regulamento|politica|termos|clausula|condicoes gerais|meu marido|minha esposa|meu socio|minha socia|meu amigo|minha amiga|um amigo meu|uma amiga minha|ele cancelou|ela cancelou|ele desistiu|ela desistiu|a academia cancelou|meu cartao)\b/

// (C) Negação da própria regressão — "não quero cancelar", "não vou
// desistir", "não pretendo recomeçar". Deliberadamente NÃO cobre "nao
// quero mais" seguido de verbo de continuidade, que é o próprio idioma
// afirmativo de desistência (ver AFFIRMATIVE_REGRESSION_PATTERN).
const NEGATED_KEYWORD_PATTERN =
  /\bnao\s+(\w+\s+){0,3}(desist\w*|cancel\w*|reconsiderar\w*|recomecar\w*|voltar atras|reabri\w*|mudei de ideia|mudou de ideia)\b/

function splitIntoSentences(value: string): string[] {
  const sentences: string[] = []
  let current = ''

  for (const char of value) {
    current += char

    if (char === '.' || char === '!' || char === '?' || char === '\n') {
      if (current.trim()) {
        sentences.push(current)
      }
      current = ''
    }
  }

  if (current.trim()) {
    sentences.push(current)
  }

  return sentences
}

function sentenceAffirmsCommercialRegression(
  rawSentence: string,
): boolean {
  const normalized = comparable(rawSentence)

  // Filtros de exclusão rodam PRIMEIRO: "quero cancelar" aparece como
  // substring literal dentro de "não quero cancelar" e de "não tenho
  // certeza se quero cancelar" — sem esses filtros antes do allowlist,
  // a frase negada/incerta seria aprovada por engano.
  if (rawSentence.includes('?')) {
    return false
  }

  if (QUESTION_MARKER_PATTERN.test(normalized)) {
    return false
  }

  if (CONDITIONAL_MARKER_PATTERN.test(normalized)) {
    return false
  }

  if (UNCERTAINTY_MARKER_PATTERN.test(normalized)) {
    return false
  }

  if (THIRD_PARTY_REFERENCE_PATTERN.test(normalized)) {
    return false
  }

  if (NEGATED_KEYWORD_PATTERN.test(normalized)) {
    return false
  }

  // A decisão final depende exclusivamente de um padrão AFIRMATIVO
  // explícito — nunca apenas da presença da palavra "cancelar"/"desistir".
  return AFFIRMATIVE_REGRESSION_PATTERN.test(normalized)
}

function stageRegressionJustified(value: string): boolean {
  return splitIntoSentences(value).some(
    sentenceAffirmsCommercialRegression,
  )
}

function buildIncomingEvidence(
  interaction: readonly LeadMethodCurrentInteractionMessage[],
): string {
  return interaction
    .filter((entry) => entry.direction === 'incoming')
    .map((entry) => entry.text)
    .join('\n')
}

function validateStageContinuity({
  candidateStage,
  previousStage,
  incomingEvidence,
}: {
  candidateStage: {
    key: string
    display_order: number
  }
  previousStage: PreviousMethodStage | null
  incomingEvidence: string
}): string | null {
  if (!previousStage) {
    return null
  }

  if (
    candidateStage.display_order >=
    previousStage.stage_display_order
  ) {
    return null
  }

  if (candidateStage.key === previousStage.stage_key) {
    return null
  }

  // A ÚNICA evidência aceita é a fala real do cliente nesta interação
  // (current_interaction incoming) — nunca a saída do próprio modelo
  // (stage_reason) nem o working_summary.
  if (stageRegressionJustified(incomingEvidence)) {
    return null
  }

  return (
    `A etapa anterior confirmada tinha ordem ${previousStage.stage_display_order}; a nova escolha tem ordem ${candidateStage.display_order}, uma regressão. ` +
    'Regressão de etapa só é permitida com evidência explícita do cliente na interação atual (desistência, cancelamento, reabertura de objeção encerrada ou pedido de recomeçar) — nunca com base na própria justificativa do modelo. ' +
    'Ausência de avanço, silêncio ou o cliente ter parado de responder não justificam regressão: mantenha a etapa anterior quando não houver essa evidência.'
  )
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
  stageRegressionBlocked?: boolean
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
  previousStage,
}: {
  mode: 'commercial' | 'operational'
  summary: string
  interaction: readonly LeadMethodCurrentInteractionMessage[]
  method: PublishedCommercialMethod
  provider: StatefulCopilotProvider
  correctionReason?: string | null
  previousStage?: PreviousMethodStage | null
}): Promise<GuidanceAttempt> {
  const factualContext =
    buildFactualContext(summary, interaction)
  const incomingEvidence =
    buildIncomingEvidence(interaction)
  const contextAnchors =
    getSpecificAnchors(factualContext)
  const correction = correctionReason
    ? [
        'A tentativa anterior não passou pela validação seller-facing.',
        `Motivo: ${correctionReason}`,
        'Corrija sem relaxar grounding, gate comercial ou especificidade.',
      ]
    : []

  const activePreviousStage =
    previousStage &&
    previousStage.method_config_version_id === method.id
      ? previousStage
      : null

  const stageContinuityPrompt =
    mode === 'commercial' && activePreviousStage
      ? [
          `A etapa confirmada na última interação foi "${activePreviousStage.stage_key}" (ordem ${activePreviousStage.stage_display_order}).`,
          'Só escolha uma etapa de ordem menor que essa se o próprio cliente disser, nesta interação (mensagens incoming), algo que indique mudança comercial real (desistência, cancelamento, reabertura de objeção encerrada ou pedido de recomeçar). Uma verificação automática após esta resposta só aceita essa evidência vindo da fala do cliente — nunca da sua própria justificativa.',
          'Ausência de avanço, silêncio ou o cliente ter parado de responder NÃO são motivo para regredir — nesse caso, repita a mesma etapa.',
        ]
      : []

  const commonPrompt = [
    'Você é o motor seller-facing do Yolen Companion.',
    'working_summary e current_interaction são as únicas fontes de fatos sobre este cliente e esta situação.',
    'Mensagens de current_interaction com direction="outgoing" já foram enviadas pelo vendedor e contam como ações já executadas.',
    'Se a última mensagem outgoing já perguntou, confirmou, explicou ou cobrou exatamente o próximo passo, NÃO recomende repetir a mesma ação enquanto não existir nova mensagem incoming que justifique isso.',
    'O contexto da empresa, o método e as regras do vendedor orientam comportamento, mas não provam fatos do cliente.',
    'Uma pergunta ou hipótese do cliente não prova que a resposta sugerida dentro dela seja verdadeira.',
    'Uma mensagem marcada como "[mensagem de áudio deste participante ainda sem transcrição disponível]" é um áudio real cujo conteúdo é desconhecido. Nunca infira o que foi dito nele; se o áudio for necessário para decidir o próximo passo, aguarde ou obtenha a transcrição.',
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
        ...stageContinuityPrompt,
        ...correction,
      ].join('\n'),
      user_prompt: JSON.stringify({
        mode,
        working_summary: summary,
        current_interaction: interaction,
        context_specificity_anchors:
          contextAnchors.slice(0, 12),
        previous_stage:
          activePreviousStage
            ? {
                stage_key:
                  activePreviousStage.stage_key,
                stage_display_order:
                  activePreviousStage.stage_display_order,
              }
            : null,
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

    const parsed =
      mode === 'commercial'
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

    if (parsed.guidance) {
      const hypothesisFailure =
        validateQuestionHypothesisGuidance({
          guidance: parsed.guidance,
          summary,
          interaction,
        })

      if (hypothesisFailure) {
        return {
          guidance: null,
          failure: hypothesisFailure,
        }
      }

      const alreadyExecutedFailure =
        validateAlreadyExecutedActionGuidance({
          guidance: parsed.guidance,
          interaction,
        })

      if (alreadyExecutedFailure) {
        return {
          guidance: null,
          failure: alreadyExecutedFailure,
        }
      }

      if (mode === 'commercial' && parsed.guidance.stage_key) {
        const candidateStageDefinition =
          method.stages.find(
            (stage) => stage.key === parsed.guidance!.stage_key,
          )

        const stageContinuityFailure =
          candidateStageDefinition
            ? validateStageContinuity({
                candidateStage: {
                  key: candidateStageDefinition.key,
                  display_order:
                    candidateStageDefinition.display_order,
                },
                previousStage: activePreviousStage,
                incomingEvidence,
              })
            : null

        if (stageContinuityFailure) {
          return {
            guidance: null,
            failure: stageContinuityFailure,
            stageRegressionBlocked: true,
          }
        }
      }
    }

    return parsed
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
  previousStage = null,
}: {
  mode: 'commercial' | 'operational'
  workingSummary: string | null
  currentInteraction?: readonly LeadMethodCurrentInteractionMessage[]
  method: PublishedCommercialMethod
  provider: StatefulCopilotProvider
  previousStage?: PreviousMethodStage | null
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
    previousStage,
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
    previousStage,
    correctionReason:
      first.failure ||
      'A primeira saída não passou pela validação.',
  })

  if (corrected.guidance) {
    return corrected.guidance
  }

  // Re-auditoria do Controle Mestre (2ª rodada): regressão de etapa sem
  // evidência, em ambas as tentativas. A saída rejeitada (next_step,
  // seller_intents) foi produzida pelo modelo para a etapa REGRESSIVA
  // candidata — nunca pode ser reaproveitada como se pertencesse à etapa
  // anterior (ex.: mostrar "Formalização" com uma ação de "Descoberta").
  // A opção mais segura é um status de erro controlado: nenhum next_step
  // incorreto é exibido e, como status !== 'ready', o gate de
  // persistência do caller (method-guidance/route.ts) nunca sobrescreve
  // o estágio já persistido — o stage persistido permanece intacto.
  const fallbackAttempt =
    corrected.stageRegressionBlocked
      ? corrected
      : first.stageRegressionBlocked
        ? first
        : null

  if (fallbackAttempt) {
    const activePreviousStage =
      previousStage &&
      previousStage.method_config_version_id === method.id
        ? previousStage
        : null

    const previousStageDefinition =
      activePreviousStage
        ? method.stages.find(
            (stage) => stage.key === activePreviousStage.stage_key,
          )
        : undefined

    return {
      status: 'error',
      method_name: method.name,
      method_config_version_id: method.id,
      stage_key:
        activePreviousStage?.stage_key ?? null,
      stage_name:
        previousStageDefinition?.name ?? null,
      stage_reason:
        activePreviousStage?.stage_reason ?? null,
      next_step: null,
      seller_intents: [],
      error:
        fallbackAttempt.failure ||
        'A nova sugestão regrediria a etapa sem evidência de mudança real na conversa; a etapa anterior permanece sem uma nova orientação nesta rodada.',
    }
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
