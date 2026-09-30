import type {
  CompanionDiagnosticInput,
  DiagnosticInputMessage,
} from './diagnostic-input'

export const SELLER_EXECUTION_TRACE_VERSION =
  'seller-execution-trace-v1' as const

export const SELLER_EXECUTION_ACTION_TYPES = [
  'rapport_opening',
  'discovery_question',
  'qualification_question',
  'clarification_question',
  'factual_response',
  'value_explanation',
  'product_presentation',
  'price_presentation',
  'objection_probe',
  'objection_response',
  'factual_proof',
  'commitment_request',
  'scheduling_open_question',
  'scheduling_guided_choice',
  'follow_up',
  'reengagement',
  'close_request',
  'confirmation',
  'stage_jump_unrelated_offer',
  'pressure_or_false_urgency',
  'unknown',
] as const

export type SellerExecutionActionType =
  (typeof SELLER_EXECUTION_ACTION_TYPES)[number]

export type SellerExecutionConfidence =
  'low' | 'medium' | 'high'

export type SellerExecutionLevel =
  'low' | 'medium' | 'high' | 'unknown'

export type SellerExecutionQuestionQuality =
  | 'guided_choice'
  | 'open'
  | 'closed'
  | 'none'
  | 'unknown'

export type SellerExecutionObservedOutcome =
  | 'customer_replied'
  | 'customer_rejected_options'
  | 'customer_accepted'
  | 'customer_silent_before_next_seller_action'
  | 'no_outcome_observed'

export type SellerExecutionCustomerIntentKind =
  | 'scheduling'
  | 'close'
  | 'payment_objection'
  | 'objection'
  | 'pricing'
  | 'product_interest'
  | 'third_party_interest'
  | 'general_interest'
  | 'deferral'
  | 'disengaged'
  | 'unknown'

export type SellerExecutionSignal =
  | 'seller_already_asked_open_question'
  | 'guided_choice_used'
  | 'sequence_break'
  | 'premature_product_offer'
  | 'duplicate_followup'
  | 'customer_intent_hot'
  | 'microcommitment_available'
  | 'seller_message_overloaded'
  | 'client_sparse_seller_rich'
  | 'late_discovery_after_close_intent'
  | 'generic_response_candidate'
  | 'customer_rejected_options'
  | 'request_not_addressed'

export type SellerExecutionCustomerIntent = {
  kind: SellerExecutionCustomerIntentKind
  confidence: SellerExecutionConfidence
  evidence_message_id: string
}

// Referência temporal explícita dita pelo cliente ("hoje", "amanhã",
// "sexta"). É evidência textual, não cálculo: o módulo temporal decide se
// essa janela já passou em relação ao instante avaliado.
export type SellerExecutionTimeReference =
  | 'same_day'
  | 'next_day'
  | 'this_week'
  | null

export type SellerExecutionCustomerSignal = {
  message_id: string
  occurred_at: string
  kind: SellerExecutionCustomerIntentKind
  confidence: SellerExecutionConfidence
  time_reference: SellerExecutionTimeReference
  // Marcadores textuais de entusiasmo realmente escritos pelo cliente.
  // Só eles autorizam recuperação emocional numa retomada — nunca um
  // interesse neutro ("quero saber sobre X").
  expressed_enthusiasm: boolean
  // O cliente pediu para não receber mais contato (opt-out): nenhuma nova
  // mensagem é permitida, nem de encerramento.
  no_contact_requested: boolean
}

// Turno do vendedor: sequência contígua de mensagens humanas outgoing sem
// resposta do cliente entre elas e com intervalo curto (rajada). Uma oferta
// enviada em várias bolhas (texto, planos, links, CTA) é UMA ação comercial;
// julgar só a última bolha fazia elogio e crítica apontarem para IDs
// diferentes da mesma ação.
export type SellerExecutionTurn = {
  turn_id: string
  message_ids: string[]
  started_at: string
  ended_at: string
  action_types: SellerExecutionActionType[]
  dominant_action_type: SellerExecutionActionType
  // Mensagens do cliente que este turno respondeu (rajada do cliente
  // imediatamente anterior). Vazio quando o turno é follow-up sem resposta
  // do cliente entre turnos.
  responds_to_customer_message_ids: string[]
  // Intenção mais forte presente na rajada do cliente respondida.
  pending_customer_intent:
    SellerExecutionCustomerIntent | null
  // null = não havia pedido comercial pendente para endereçar.
  addresses_customer_request: boolean | null
  // Latência desde a primeira mensagem ainda não respondida do cliente.
  response_latency_ms: number | null
  negative_signals: SellerExecutionSignal[]
  breaks_active_customer_goal: boolean
  observed_outcome:
    SellerExecutionObservedOutcome
}

export type SellerExecutionEvent = {
  message_id: string
  occurred_at: string
  action_type: SellerExecutionActionType
  commercial_objective: string
  method_stage: null
  target_commitment: string | null
  content_summary: string
  customer_intent_before_action:
    SellerExecutionCustomerIntent | null

  quality: {
    relevance: SellerExecutionLevel
    specificity: SellerExecutionLevel
    question_quality:
      SellerExecutionQuestionQuality
    persuasion_quality: 'unknown'
    friction: SellerExecutionLevel
    pressure_risk: SellerExecutionLevel
  }

  sequence: {
    follows_previous_context:
      boolean | null
    repeats_prior_action: boolean
    advances_stage: boolean
    skips_required_step: null
    breaks_active_customer_goal: boolean
  }

  observed_outcome:
    SellerExecutionObservedOutcome

  signals: SellerExecutionSignal[]
  evidence_message_ids: string[]

  turn_id: string
  timing: {
    // Primeira mensagem do cliente ainda sem resposta quando esta ação
    // aconteceu (null quando a ação não responde a nenhuma fala nova).
    responds_to_customer_message_id: string | null
    response_latency_ms: number | null
    previous_message_gap_ms: number | null
  }
}

export type SellerExecutionTrace = {
  contract_version:
    typeof SELLER_EXECUTION_TRACE_VERSION

  summary: {
    seller_message_count: number
    classified_message_count: number
    client_context_confidence:
      SellerExecutionConfidence
    seller_execution_confidence:
      SellerExecutionConfidence
    active_customer_intent:
      SellerExecutionCustomerIntent | null
    sequence_break_detected: boolean
    evidence_message_ids: string[]
  }

  events: SellerExecutionEvent[]
  turns: SellerExecutionTurn[]
  customer_signals: SellerExecutionCustomerSignal[]
}

function normalizeText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function messageText(
  message: DiagnosticInputMessage,
): string {
  return (
    message.text_content ??
    message.audio_transcription ??
    ''
  ).trim()
}

function wordCount(
  value: string,
): number {
  const normalized =
    value.trim()

  return normalized
    ? normalized.split(/\s+/).length
    : 0
}

function unique<T>(
  values: T[],
): T[] {
  return Array.from(
    new Set(values),
  )
}

function includesAny(
  value: string,
  patterns: string[],
): boolean {
  return patterns.some(
    pattern =>
      value.includes(pattern),
  )
}

// ---------------------------------------------------------------------------
// Postura do cliente em relação À OPORTUNIDADE (não a um atributo dela).
//
// REJEIÇÃO DA OPORTUNIDADE: o cliente resolveu/comprou em outro lugar, ou
// nega continuar a própria oportunidade ("não tenho mais interesse", "não
// quero mais falar sobre isso", "desisti", "não quero mais contratar").
//
// NEGAÇÃO/MUDANÇA DENTRO DA OPORTUNIDADE: a negação recai sobre uma opção,
// atributo ou processo — trocar de plano, deixar de precisar esperar,
// recusar um item específico — e/ou vem acompanhada de continuação positiva
// ("quero o premium", "quero fechar agora"). Isso é oportunidade ATIVA.
//
// A decisão é por cláusula: primeiro identifica cláusulas de rejeição e o
// ESCOPO do que foi negado; depois procura continuação comercial positiva no
// restante da mensagem. Só há encerramento quando existe rejeição de escopo
// "oportunidade" (ou resolução externa) e nenhuma continuação positiva.
// ---------------------------------------------------------------------------

export type CustomerOpportunityStance =
  | 'rejects_opportunity'
  | 'changes_within_opportunity'
  | 'none'

// Resolução fora desta venda: a necessidade foi atendida por outro caminho.
const EXTERNAL_RESOLUTION_PATTERNS: readonly RegExp[] = [
  /\b(fechei|comprei|contratei|assinei|matriculei|escolhi|optei)\b.{0,30}\b(outr[oa]s?|outro lugar|concorrente)\b/,
  /\bfiz (a )?(matricula|inscricao|compra|contratacao)\b.{0,30}\boutr[oa]s?\b/,
  /\b(resolvi|consegui resolver|encontrei|achei)\b.{0,20}\b(com outr[oa]s?|em outr[oa]s?|outro lugar|por conta propria|por conta|sozinh[oa])\b/,
  /\bvou ficar com (a |o )?outr[oa]\b/,
  /\bja (comprei|contratei|resolvi|fechei)\b\s*$/,
]

// Pedido explícito para NÃO receber mais contato (opt-out). Diferente de um
// encerramento comum ("já comprei em outro lugar"): depois dele nenhuma nova
// mensagem é permitida — nem agradecimento nem "porta aberta".
//
// OPT-OUT ≠ PREFERÊNCIA DE COMUNICAÇÃO. O cliente só rejeita o CONTATO
// quando recusa o próprio contato ("não me mande mais mensagem", "não quero
// mais receber contato", "pare de me chamar", "me tira da lista"). Restringir
// FORMATO ("mensagem de áudio"), CANAL ("não me liga"), QUANTIDADE ou
// CONTEÚDO ("mais detalhes", "informações") mantém a oportunidade ativa — e
// um canal alternativo ("prefiro texto", "fala comigo pelo WhatsApp") ou uma
// continuação comercial ("quero contratar o básico", "já quero fechar") na
// mesma mensagem prova que o cliente quer continuar a conversa.

// Remoção/recusa do contato em si: o objeto é sempre o contato.
const CONTACT_REMOVAL_PATTERNS: readonly RegExp[] = [
  // "Pode (me) tirar" só é opt-out com alvo de contato ou sozinho no fim da
  // frase — "pode tirar uma dúvida?" é pedido ativo, nunca opt-out.
  /\bpode (me )?tirar\b(?=\s*((d[aoe]s?|desse|dessa|deste|desta) (sua |essa |dessa )?(lista|grupo|contatos?|cadastro|base|envios?|mailing)\b|(o )?meu (numero|contato|cadastro|nome|telefone)\b|daqui\b|[.!]*\s*$))/,
  /\b(tira|tire|tirem|remove|remova|removam|exclui|exclua|excluam)\b\s+(me |o meu |meu |o )?(numero |contato |cadastro |nome |telefone )?(d[aoe]s?|desse|dessa|deste|desta)\s+(sua |essa |dessa )?(lista|grupo|contatos|cadastro|base|envios?|mailing)\b/,
  /\b(tira|tire|tirem|remove|remova|removam|exclui|exclua|excluam)\b\s+(o )?meu (numero|contato|cadastro|telefone)\b/,
  /\bdescadastr\w*/,
  /\b(sair|me tirar|me remover) d[aeo]s? (lista|grupo|contatos|envios)\b/,
  /\bnao (quero|desejo) (mais )?(ser (contatad[oa]|chamad[oa]|procurad[oa])|(nenhum )?contato)\b/,
  /\bnao entr[ea]m? mais em contato\b/,
  /^\s*(stop|sair|parar|cancelar inscricao|descadastrar)\s*[.!]*\s*$/,
]

// Substantivos de comunicação: o contato em si, canais/formatos e
// conteúdos/quantidade de informação.
const COMMUNICATION_NOUN =
  '(?:mensage\\w*|msgs?|audios?|voz|ligac\\w*|telefonem\\w*|e-?mails?|sms|detalhes?|informac\\w*|infos?|explicac\\w*|materia(?:l|is)|catalogos?|fotos?|videos?|imagens?|links?|arquivos?|documentos?|pdfs?|textos?|propaganda\\w*|promoc\\w*|ofertas?|novidades?|contatos?)'

const COMMUNICATION_OBJECT_PREFIX =
  '(?:de\\s+)?(?:(?:receber|ver|ler|ouvir|ter)\\s+)?(?:(?:mais|tant[oa]s?|ess[ae]s?|as|os|a|o)\\s+)*'

// "Não quero/preciso (mais) <comunicação>": recusa sem verbo de envio.
const NEGATED_COMMUNICATION_NOUN =
  new RegExp(
    `\\bnao (?:quero|preciso|precisa|desejo)(?: mais)?\\s+(${COMMUNICATION_OBJECT_PREFIX}${COMMUNICATION_NOUN}\\b.*)$`,
  )

// Restrição de comunicação: se é opt-out depende do OBJETO restrito.
const COMMUNICATION_RESTRICTION_PATTERNS: readonly RegExp[] = [
  NEGATED_COMMUNICATION_NOUN,
  /\b(nao|para de|pare de|parem de|chega de) (me )?(mande|mandar|mandem|envie|enviar|enviem)\b.{0,20}\b(mais|mensage\w*|msg|nada)\b/,
  /\b(para|pare|parem|chega) de (me )?(mandar|enviar|chamar|ligar|contatar|procurar|incomodar|perturbar)\b/,
  /\bnao (me )?(chame|chamem|ligue|liguem|contate|contatem|procure|procurem|incomode|incomodem|perturbe)\b.{0,15}\bmais\b/,
  /\bnao (quero|desejo) (mais )?receber\b/,
]

// Verbos de comunicação restringidos. Contato ("chamar", "procurar",
// "incomodar") é o próprio contato; ligar/telefonar é um CANAL; mandar,
// enviar e receber dependem do objeto.
const RESTRICTED_COMMUNICATION_VERB =
  /\b(cham(?:e|ar|em|a)|contat(?:e|ar|em)|procur(?:e|ar|em)|incomod(?:e|ar|em)|perturb(?:e|ar|em)|lig(?:ue|ar|uem|a)|telefon(?:e|ar|em)|mand(?:e|ar|em|a)|envi(?:e|ar|em|a)|receb(?:er|o))\b/g

type CommunicationObject =
  | 'contact'
  | 'channel'
  | 'content'

// O que está sendo recusado: o contato em si, um canal/formato, ou um
// conteúdo/quantidade de informação.
function classifyCommunicationObject(
  tail: string,
): CommunicationObject {
  const object =
    tail
      .replace(/^[\s,]+/, '')
      .replace(
        /^(?:(?:me|mais|nenhum\w*|ess[ae]s?|est[ae]s?|a|as|o|os|um|uma|de|do|da|dos|das|pra|para|mim)\s+)+/,
        '',
      )
      .trim()

  if (
    !object ||
    /^(mais|nada|nenhum\w*)$/.test(object)
  ) {
    return 'contact'
  }

  if (
    /^(tant[oa]s?|muit[oa]s?|excesso|toda hora|todo (dia|tempo)|o tempo todo|a toda hora)\b/.test(object) ||
    /^(mensage\w*|msgs?)\s+(tod[oa]s?|toda hora|a toda hora|o tempo todo|tantas|demais|longas?|grandes?)\b/.test(object)
  ) {
    return 'content'
  }

  if (
    /^(mensage\w*|msgs?|recados?)\s+(de|por|em|com)\s+(audio|voz|video|texto)\b/.test(object) ||
    /^(audios?|voz|gravac\w*|ligac\w*|telefonem\w*|chamadas?|videochamadas?|e-?mails?|sms|whats\w*|zap|direct|dm)\b/.test(object)
  ) {
    return 'channel'
  }

  if (
    /^(mensage\w*|msgs?|recados?|nada|contatos?|propaganda\w*|promoc\w*|ofertas?|publicidade|spam|marketing|novidades?|lembretes?)\b/.test(object)
  ) {
    return 'contact'
  }

  return 'content'
}

// Recusa o CONTATO (e não só um canal, formato ou conteúdo)?
function restrictionRejectsContact(
  clause: string,
): boolean {
  if (
    matchesAny(
      clause,
      CONTACT_REMOVAL_PATTERNS,
    )
  ) {
    return true
  }

  const verbs = [
    ...clause.matchAll(
      RESTRICTED_COMMUNICATION_VERB,
    ),
  ]

  const noun =
    clause.match(
      NEGATED_COMMUNICATION_NOUN,
    )

  if (
    noun &&
    communicationScopeObject(
      noun[1],
    ) === 'contact'
  ) {
    return true
  }

  return verbs.some(
    (verb, index) => {
      const lemma =
        verb[1]

      if (
        /^(cham|contat|procur|incomod|perturb)/.test(
          lemma,
        )
      ) {
        return true
      }

      if (
        /^(lig|telefon)/.test(
          lemma,
        )
      ) {
        return false
      }

      const tailEnd =
        verbs[index + 1]?.index ??
        clause.length

      return (
        classifyCommunicationObject(
          clause.slice(
            (verb.index ?? 0) +
              verb[0].length,
            tailEnd,
          ),
        ) === 'contact'
      )
    },
  )
}

function isCommunicationRestriction(
  clause: string,
): boolean {
  return (
    matchesAny(
      clause,
      CONTACT_REMOVAL_PATTERNS,
    ) ||
    matchesAny(
      clause,
      COMMUNICATION_RESTRICTION_PATTERNS,
    )
  )
}

// Canal/formato alternativo pedido pelo cliente ("prefiro texto", "pode
// falar comigo pelo WhatsApp", "manda por escrito").
const ALTERNATIVE_CHANNEL =
  /\b(prefiro|preferencia|melhor|so (por|pelo|pela|via|no|na)|pode (ser|falar|me chamar|chamar|mandar|me mandar|enviar|me enviar|escrever|me escrever|responder|ligar|me ligar)|(fala|fale|escreve|escreva) comigo|me (chama|chame|manda|mande|envia|envie|escreve|escreva|liga|ligue|responde|responda)|manda|mande|envia|envie)\b|^(por|pelo|pela|via|no|na) (texto|escrito|mensage\w*|whats\w*|zap|e-?mail|chat|aqui)\b/

// Pergunta comercial em outra cláusula: a conversa continua.
const COMMERCIAL_QUESTION =
  /\b(quanto (custa|fica|e|sai)|qual (e )?(o )?(valor|preco)|como (faco|funciona|pago|contrato)|tem (vaga|horario|desconto|disponibilidade)|aceita\w* (cartao|pix)|parcel\w*)\b/

// Cláusulas para a análise de restrição de comunicação. Além de pontuação
// e conectivos, "e" + imperativo afirmativo abre um pedido NOVO: "pare de
// me ligar e me mande mensagem" recusa um canal e pede outro — já "pare de
// me ligar e de me mandar mensagem" continua a mesma recusa.
function communicationClausesOf(
  normalized: string,
): string[] {
  return clausesOf(normalized).flatMap(
    clause =>
      clause
        .split(
          /\s+e\s+(?=(?:me\s+)?(?:mande|manda|envie|envia|chame|chama|ligue|liga|fale|fala|escreva|escreve|pode|prefiro|quero)\b)/,
        )
        .map(
          part =>
            part.trim(),
        )
        .filter(Boolean),
  )
}

export type CommunicationRestriction =
  | 'contact_opt_out'
  | 'communication_preference'
  | 'none'

export function classifyCommunicationRestriction(
  text: string,
): CommunicationRestriction {
  const clauses =
    communicationClausesOf(
      normalizeText(text),
    )

  const restrictions =
    clauses.filter(
      isCommunicationRestriction,
    )

  if (restrictions.length === 0) {
    return 'none'
  }

  // Canal alternativo ou continuação comercial em outra cláusula (não
  // negada): o cliente quer continuar a conversa.
  const conversationContinues =
    clauses
      .filter(
        clause =>
          !restrictions.includes(
            clause,
          ) &&
          !/\b(nao|nem)\b/.test(clause),
      )
      .some(
        clause =>
          ALTERNATIVE_CHANNEL.test(
            clause,
          ) ||
          POSITIVE_CONTINUATION.test(
            clause,
          ) ||
          COMMERCIAL_QUESTION.test(
            clause,
          ),
      )

  return !conversationContinues &&
    restrictions.some(
      restrictionRejectsContact,
    )
    ? 'contact_opt_out'
    : 'communication_preference'
}

export function requestsNoContact(
  text: string,
): boolean {
  return (
    classifyCommunicationRestriction(
      text,
    ) === 'contact_opt_out'
  )
}

// Escopo de uma negação ("não quero mais ...") que é comunicação: canal,
// formato ou conteúdo recusado é preferência, não rejeição da oportunidade.
const COMMUNICATION_SCOPE =
  new RegExp(
    `^\\s*${COMMUNICATION_OBJECT_PREFIX}${COMMUNICATION_NOUN}\\b`,
  )

function communicationScopeObject(
  scope: string,
): CommunicationObject | null {
  if (!COMMUNICATION_SCOPE.test(scope)) {
    return null
  }

  return classifyCommunicationObject(
    scope.replace(
      /^\s*(?:de\s+)?(?:(?:receber|ver|ler|ouvir|ter)\s+)?/,
      '',
    ),
  )
}

// Núcleos de negação de continuidade. O ESCOPO é o que vem depois.
const REJECTION_CORE =
  /\b(nao (quero|preciso|vou (querer|precisar)) mais|nao tenho (mais )?interesse|perdi o interesse|nao faz mais sentido|desisti|pode cancelar|nao (quero|preciso) mais nada)\b(.*)$/

// Verbos de processo: negar "esperar", "pensar", "parcelar" muda COMO a
// venda acontece, não SE ela acontece.
const PROCESS_OBJECT =
  /^\s*(de )?(esperar|aguardar|pensar|ver|avaliar|analisar|perguntar|parcelar|pagar a vista|dividir|negociar|comparar|visitar outr\w*|pesquisar)\b/

// Objeto que É a própria oportunidade/conversa.
const OPPORTUNITY_OBJECT =
  /^\s*(,|\.|!|$|nada|isso|disso|nisso|obrigad\w*|valeu|falar\b|conversar\b|receber\b|ser contatad\w*|contato|mensage\w*|seguir\b|continuar\b|prosseguir\b|comprar\b|contratar\b|fechar\b|assinar\b|fazer\b|o servico\b\s*$|o produto\b\s*$|a proposta\b\s*$|no assunto|nesse assunto|neste assunto|em nada|em continuar|em seguir|por enquanto)/

// Continuação comercial positiva (não negada) em outra cláusula.
const POSITIVE_CONTINUATION =
  /(^|\s)(quero|queria|prefiro|vou querer|vou (de|com|ficar com)|pode ser|bora|vamos|fecha|me (manda|envia|passa)|manda|quero fechar|quero contratar|quero seguir|tenho interesse)\b/

function clausesOf(
  normalized: string,
): string[] {
  return normalized
    .split(
      /[,.;!?]+|\b(?:mas|porem|so que|porque|pois|entao)\b/,
    )
    .map(
      clause =>
        clause.trim(),
    )
    .filter(Boolean)
}

export function assessCustomerOpportunityStance(
  text: string,
): {
  stance: CustomerOpportunityStance
  continuation_text: string | null
  negated_scope: 'option' | 'process' | null
  // Rejeição que também proíbe novo contato (opt-out).
  no_contact: boolean
} {
  const normalized =
    normalizeText(text)

  if (
    classifyCommunicationRestriction(
      normalized,
    ) === 'contact_opt_out'
  ) {
    return {
      stance:
        'rejects_opportunity',
      continuation_text: null,
      negated_scope: null,
      no_contact: true,
    }
  }

  // "Desisti de cancelar" é o oposto de desistir da oportunidade.
  const sanitized =
    normalized.replace(
      /\bdesisti\s+de\s+(cancel|desist)\w*/g,
      ' ',
    )

  const clauses =
    clausesOf(sanitized)

  let opportunityRejection = false
  let scopedNegation = false
  let negatedScope:
    'option' | 'process' | null =
      null

  const nonRejectionClauses: string[] = []

  for (const clause of clauses) {
    // Restrição de canal, formato ou conteúdo (ou uma recusa de contato que
    // a própria mensagem desmente com canal alternativo/continuação): não
    // decide a postura em relação à oportunidade.
    if (
      isCommunicationRestriction(
        clause,
      )
    ) {
      continue
    }

    const external =
      matchesAny(
        clause,
        EXTERNAL_RESOLUTION_PATTERNS,
      )

    const rejection =
      clause.match(
        REJECTION_CORE,
      )

    if (external) {
      opportunityRejection = true
      continue
    }

    if (!rejection) {
      nonRejectionClauses.push(
        clause,
      )
      continue
    }

    const scope =
      rejection[rejection.length - 1] ??
      ''

    // "Não quero mais informações/detalhes/ligação": recusa um conteúdo ou
    // canal, não a oportunidade — nem uma opção dela.
    const communicationObject =
      communicationScopeObject(
        scope,
      )

    if (
      communicationObject ===
        'channel' ||
      communicationObject ===
        'content'
    ) {
      continue
    }

    if (
      PROCESS_OBJECT.test(scope)
    ) {
      scopedNegation = true
      negatedScope =
        negatedScope ?? 'process'
      continue
    }

    if (
      OPPORTUNITY_OBJECT.test(scope) ||
      /^\s*(nada|de nada)?\s*$/.test(scope)
    ) {
      opportunityRejection = true
      continue
    }

    // Objeto específico (uma opção, item ou atributo): negação dentro da
    // oportunidade.
    scopedNegation = true
    negatedScope = 'option'
  }

  const continuation =
    nonRejectionClauses.filter(
      clause =>
        POSITIVE_CONTINUATION.test(
          clause,
        ) &&
        !/\bnao\s+(quero|queria|prefiro|vou|tenho)\b/.test(
          clause,
        ),
    )

  if (continuation.length > 0) {
    return {
      stance:
        opportunityRejection ||
        scopedNegation
          ? 'changes_within_opportunity'
          : 'none',
      continuation_text:
        continuation.join(' '),
      negated_scope:
        negatedScope,
      no_contact: false,
    }
  }

  if (opportunityRejection) {
    return {
      stance:
        'rejects_opportunity',
      continuation_text: null,
      negated_scope: null,
      no_contact: false,
    }
  }

  return {
    stance:
      scopedNegation
        ? 'changes_within_opportunity'
        : 'none',
    continuation_text: null,
    negated_scope:
      negatedScope,
    no_contact: false,
  }
}

// Adiamento explícito com horizonte ("mês que vem", "te aviso", "vou
// pensar"). Não é objeção nem encerramento: muda a expectativa de tempo de
// resposta e, portanto, a leitura de silêncio.
const DEFERRAL_HORIZON =
  '(amanha|depois de amanha|daqui a|daqui|(em|dentro de) (\\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta) (dia|dias|semana|semanas|mes|meses)|(semana|mes|ano) que vem|proxim[oa] (semana|mes|ano)|segunda|terca|quarta|quinta|sexta|sabado|domingo|mais tarde|outro dia|depois|mais (pra|para) frente|(inicio|comeco|fim|final) do mes|depois d[ao]s? \\w+)'

// Pedido para o VENDEDOR retomar o contato num momento indicado ("me chama
// amanhã", "me liga daqui a 10 dias", "me procura ano que vem"): é um
// adiamento combinado, mesmo quando menciona o próximo passo.
const SELLER_CONTACT_DEFERRAL =
  new RegExp(
    `\\b(me (chama|chame|procura|procure|liga|ligue|contata|contate|aciona|cobra|cobre|lembra|lembre)|me (manda|mande) (uma )?(mensagem|msg)|fala comigo|pode me chamar|entra em contato|entre em contato|retoma comigo|retome comigo)\\b.{0,30}\\b${DEFERRAL_HORIZON}\\b`,
  )

const DEFERRAL_PATTERNS: readonly RegExp[] = [
  SELLER_CONTACT_DEFERRAL,
  /\b(falamos|conversamos|decido|te respondo|retomamos|voltamos a falar|a gente se fala|a gente conversa)\b.{0,30}\b(amanha|daqui a|em \d+ dias|semana que vem|mes que vem|ano que vem|proxim[oa] (semana|mes|ano))\b/,
  /\bvou pensar\b/,
  /\b(te|lhe) (aviso|falo|retorno|chamo)\b/,
  /\b(depois|mais tarde) (te|eu) (aviso|falo|retorno|chamo|vejo)\b/,
]

// Horizonte futuro SOZINHO não é adiamento: "O preço muda no mês que vem?"
// e "Tem vaga na próxima semana?" são perguntas de compra. O horizonte só
// vira adiamento com linguagem de adiar/retomar na mesma mensagem ("deixa
// pra semana que vem", "agora não, só mês que vem", "mais pra frente eu
// vejo", "depois das férias a gente conversa").
const DEFERRAL_HORIZON_ONLY: readonly RegExp[] = [
  /\b(mes|semana|ano) que vem\b/,
  /\bproxim[oa] (mes|semana|ano)\b/,
  /\bdepois d[ao]s? (ferias|festas|pagamento|viagem)\b/,
  /\bmais (pra|para) frente\b/,
  /\b(fim|final) do mes\b/,
]

const POSTPONEMENT_LANGUAGE =
  /\b(deixa|deixar|deixo|deixamos|fica|ficar|fico|vamos ver|vou ver|a gente ve|a gente conversa|a gente fala|volto|voltamos|retomo|retomamos|eu vejo|vejo isso|vemos isso|decido|decidimos|resolvo|resolvemos|falo|falamos|conversamos|penso|pensar|aviso|avisar|agora nao|no momento nao|por enquanto nao|so (no|na|em|depois|mais|a partir|o|a|la)|somente|apenas|adiar|adia|adiamos|remarcar|nao (consigo|da|posso|vai dar)( agora)?|sem tempo|estou ocupad[oa]|to ocupad[oa]|viajando|de ferias)\b/

function expressesPostponement(
  text: string,
): boolean {
  return (
    matchesAny(
      text,
      DEFERRAL_PATTERNS,
    ) ||
    (
      matchesAny(
        text,
        DEFERRAL_HORIZON_ONLY,
      ) &&
      POSTPONEMENT_LANGUAGE.test(text)
    )
  )
}

function matchesAny(
  value: string,
  patterns: readonly RegExp[],
): boolean {
  return patterns.some(
    pattern =>
      pattern.test(value),
  )
}

// ---------------------------------------------------------------------------
// Referência de tempo que GOVERNA a ação do cliente.
//
// Um horizonte NEGADO ("não consigo hoje", "hoje não dá", "nem amanhã")
// nunca governa. Governa o horizonte AFIRMADO ligado à ação pretendida:
// "não consigo hoje; quero fechar amanhã" é fechar amanhã. Com mais de um
// horizonte afirmado ("quero fechar amanhã, mas hoje só consigo mandar os
// documentos"), vence o da cláusula que carrega a intenção da mensagem
// (fechamento amanhã; o envio de documentos de hoje é secundário) — nunca
// uma prioridade fixa entre tokens.
// ---------------------------------------------------------------------------
const TIME_MENTION =
  /\b(ainda hoje|hoje a noite|hoje|hj|agora|daqui a pouco|nesta tarde|nesta manha|essa tarde|essa noite|amanha|amanh|(?:proxim[oa] )?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:(?:-| )feira)?(?: que vem)?|essa semana|esta semana|nesta semana|nessa semana|fim de semana|final de semana)\b/g

// Negação que alcança o horizonte: até três palavras antes ("não consigo
// hoje", "não dá pra amanhã", "nem sexta") ou logo depois ("hoje não dá",
// "amanhã eu não consigo").
const TIME_NEGATION_BEFORE =
  /\b(nao|nem)\b(?:\s+\S+){0,3}\s*$/

const TIME_NEGATION_AFTER =
  /^\s*(?:(?:eu|a gente|nos)\s+)?(?:nao|nem)\b/

// Ação de compromisso na cláusula (desempate sem intenção conhecida).
const TIME_COMMITMENT_ACTION =
  /\b(fechar|fecho|fechamos|contratar|contrato|comprar|compro|assinar|assino|pagar|matricular|agendar|marcar|ir|vou|vamos|visitar|comecar|iniciar|conversar|falar|reuniao|decidir|decido|passar|aparecer|pode ser|podemos)\b/

type TimeMention = {
  reference: Exclude<
    SellerExecutionTimeReference,
    null
  >
  clause: string
  negated: boolean
}

function timeReferenceOfMention(
  mention: string,
): Exclude<
  SellerExecutionTimeReference,
  null
> {
  if (/\bamanh/.test(mention)) {
    return 'next_day'
  }

  if (
    /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo|semana)\b/.test(
      mention,
    )
  ) {
    return 'this_week'
  }

  return 'same_day'
}

function clauseTimeMentions(
  clause: string,
): {
  probe: string
  mentions: Array<{
    reference: Exclude<
      SellerExecutionTimeReference,
      null
    >
    start: number
    end: number
    after: string
    negated: boolean
  }>
} {
  // Expressão de entusiasmo, não negação ("não vejo a hora de fechar
  // amanhã").
  const probe =
    clause.replace(
      /\bnao vejo a hora\b/g,
      'ansioso',
    )

  const matches = [
    ...probe.matchAll(
      TIME_MENTION,
    ),
  ]

  const clauseMentions =
    matches.map(
      (match, index) => {
        const start =
          match.index ?? 0

        const previous =
          matches[index - 1]

        const before =
          probe.slice(
            previous
              ? (previous.index ?? 0) +
                  previous[0].length
              : 0,
            start,
          )

        const after =
          probe.slice(
            start + match[0].length,
            matches[index + 1]?.index ??
              probe.length,
          )

        return {
          reference:
            timeReferenceOfMention(
              match[0],
            ),
          start,
          end:
            start + match[0].length,
          after,
          negated:
            TIME_NEGATION_BEFORE.test(
              before,
            ) ||
            TIME_NEGATION_AFTER.test(
              after,
            ),
        }
      },
    )

  // "Hoje e amanhã não consigo": a negação alcança os horizontes
  // coordenados.
  for (
    let index = clauseMentions.length - 2;
    index >= 0;
    index -= 1
  ) {
    if (
      clauseMentions[index + 1].negated &&
      /^\s*(e|ou|nem)\s*$/.test(
        clauseMentions[index].after,
      )
    ) {
      clauseMentions[index].negated = true
    }
  }

  return {
    probe,
    mentions:
      clauseMentions,
  }
}

function timeMentionsOf(
  text: string,
): TimeMention[] {
  return clausesOf(
    normalizeText(text),
  ).flatMap(
    clause =>
      clauseTimeMentions(
        clause,
      ).mentions.map(
        ({ reference, negated }) => ({
          reference,
          clause,
          negated,
        }),
      ),
  )
}

// Texto só com os horizontes AFIRMADOS: horizontes negados ("sexta não
// consigo") são apagados antes de interpretar um prazo combinado.
export function affirmedTimeText(
  text: string,
): string {
  return clausesOf(
    normalizeText(text),
  )
    .map(
      clause => {
        const { probe, mentions } =
          clauseTimeMentions(clause)

        return mentions
          .filter(
            mention =>
              mention.negated,
          )
          .reverse()
          .reduce(
            (current, mention) =>
              `${current.slice(0, mention.start)} ${current.slice(mention.end)}`,
            probe,
          )
      },
    )
    .join(', ')
}

export function resolveGoverningTimeReference(
  text: string,
  {
    intentKind = null,
  }: {
    intentKind?:
      | SellerExecutionCustomerIntentKind
      | null
  } = {},
): {
  reference: SellerExecutionTimeReference
  clause: string | null
} {
  const affirmed =
    timeMentionsOf(text).filter(
      mention =>
        !mention.negated,
    )

  if (affirmed.length === 0) {
    return {
      reference: null,
      clause: null,
    }
  }

  const governing =
    affirmed.length === 1
      ? affirmed[0]
      : (
          (
            intentKind &&
            intentKind !== 'unknown'
              ? affirmed.find(
                  mention =>
                    inferCustomerIntentFromText(
                      mention.clause,
                      'time-clause',
                    ).kind === intentKind,
                )
              : undefined
          ) ??
          affirmed.find(
            mention =>
              TIME_COMMITMENT_ACTION.test(
                mention.clause,
              ),
          ) ??
          affirmed[0]
        )

  return {
    reference:
      governing.reference,
    clause:
      governing.clause,
  }
}

export function detectCustomerTimeReference(
  text: string,
  options: {
    intentKind?:
      | SellerExecutionCustomerIntentKind
      | null
  } = {},
): SellerExecutionTimeReference {
  return resolveGoverningTimeReference(
    text,
    options,
  ).reference
}

function expressesEnthusiasm(
  text: string,
): boolean {
  const normalized =
    normalizeText(text)

  return (
    /\b(amei|adorei|adoraria|animad[oa]|empolgad[oa]|ansios[oa]|quero muito|to doid[oa]|estou doid[oa]|nao vejo a hora|perfeito demais|maravilh)\w*/.test(
      normalized,
    ) ||
    /!{2,}/.test(text)
  )
}

export function inferCustomerIntentFromText(
  text: string,
  messageId: string,
): SellerExecutionCustomerIntent {
  return inferCustomerIntent({
    id: messageId,
    text_content: text,
    audio_transcription: null,
  } as DiagnosticInputMessage)
}

function inferCustomerIntent(
  message: DiagnosticInputMessage,
): SellerExecutionCustomerIntent {
  const text =
    normalizeText(
      messageText(message),
    )

  // Preferência de canal, formato ou conteúdo ("não me mande áudio,
  // prefiro texto"; "não me mande mais detalhes, quero contratar o
  // básico"): a intenção vem do RESTO da mensagem, nunca da restrição —
  // recusar um formato não é objeção nem abandono.
  if (
    classifyCommunicationRestriction(
      text,
    ) === 'communication_preference'
  ) {
    const rest =
      communicationClausesOf(text)
        .filter(
          clause =>
            !isCommunicationRestriction(
              clause,
            ),
        )
        .join(', ')

    return rest
      ? inferCustomerIntentFromText(
          `${rest}${messageText(message).includes('?') ? '?' : ''}`,
          message.id,
        )
      : {
          kind: 'unknown',
          confidence: 'low',
          evidence_message_id:
            message.id,
        }
  }

  const stance =
    assessCustomerOpportunityStance(
      text,
    )

  if (
    stance.stance ===
      'rejects_opportunity'
  ) {
    return {
      kind: 'disengaged',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  // Troca/negação dentro da oportunidade ("não quero mais o básico, quero o
  // premium"; "não preciso mais esperar, quero fechar"): a intenção vem da
  // continuação positiva, nunca da negação — não é objeção nem abandono.
  if (
    stance.stance ===
      'changes_within_opportunity'
  ) {
    const continuation =
      stance.continuation_text
        ? inferCustomerIntentFromText(
            stance.continuation_text,
            message.id,
          )
        : null

    if (
      continuation &&
      continuation.kind !== 'unknown' &&
      continuation.kind !== 'objection' &&
      continuation.kind !== 'disengaged'
    ) {
      return continuation
    }

    // Com continuação ("quero o premium"): escolha de opção. Sem
    // continuação, recusar uma opção é resistência dentro da oportunidade;
    // deixar de precisar de um processo ("esperar") é neutro.
    return stance.continuation_text
      ? {
          kind: 'product_interest',
          confidence: 'medium',
          evidence_message_id:
            message.id,
        }
      : stance.negated_scope ===
          'option'
        ? {
            kind: 'objection',
            confidence: 'medium',
            evidence_message_id:
              message.id,
          }
        : {
            kind: 'unknown',
            confidence: 'low',
            evidence_message_id:
              message.id,
          }
  }

  // Continuar o processo de compra ("quero seguir com a contratação",
  // "vamos dar andamento ao pedido") é intenção de fechamento em qualquer
  // vertical.
  if (
    CLOSE_CONTINUATION.test(text) &&
    !/\bnao (quero|vou|vamos|pretendo|posso)\b/.test(text)
  ) {
    return {
      kind: 'close',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'quero fechar',
        'vou fechar',
        'quero contratar',
        'vamos contratar',
        'quero comprar',
        'quero assinar',
        'quero aderir',
        'quero avancar',
        'quero avançar',
        'como faco o pagamento',
        'como faço o pagamento',
        'link de pagamento',
        'matricula',
        'matrícula',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'close',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  // Pedido explícito para o vendedor retomar num momento indicado vale
  // antes das palavras de agenda ("me chama amanhã pra agendar" é prazo
  // combinado, não pedido de horário agora). Intenção explícita de
  // fechamento (acima) continua vencendo.
  if (
    SELLER_CONTACT_DEFERRAL.test(
      text,
    )
  ) {
    return {
      kind: 'deferral',
      confidence: 'medium',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'experimental',
        'agendar',
        'agendamento',
        'marcar',
        'horario',
        'horário',
        'reuniao',
        'reunião',
        'visita',
        'demonstracao',
        'demonstração',
        'consulta',
        'apresentacao',
        'apresentação',
        'que horas',
        'quando posso ir',
        'quando consigo ir',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'scheduling',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  // Pedido com referência de tempo explícita ("consigo trazer amanhã
  // cedo?", "dá pra ir hoje?") é pedido de agenda em qualquer vertical,
  // mesmo sem as palavras "agendar/marcar".
  if (
    messageText(message).includes('?') &&
    (
      detectCustomerTimeReference(
        text,
      ) !== null ||
      /\b((semana|mes) que vem|proxim[oa] (semana|mes))\b/.test(
        text,
      )
    ) &&
    /\b(consigo|posso|podemos|pode ser|da pra|da para|tem como|daria|seria possivel|vou poder|voces conseguem|conseguem|atendem|tem (vaga|vagas|horario|horarios|agenda|disponibilidade))\b/.test(
      text,
    )
  ) {
    return {
      kind: 'scheduling',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  if (
    expressesPostponement(text)
  ) {
    return {
      kind: 'deferral',
      confidence: 'medium',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'sem limite',
        'sem cartao',
        'sem cartão',
        'nao tenho cartao',
        'não tenho cartão',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'payment_objection',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'muito caro',
        'caro',
        'nao consigo',
        'não consigo',
        'nao serve',
        'não serve',
        'nao quero',
        'não quero',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'objection',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'preco',
        'preço',
        'valor',
        'quanto custa',
        'quanto e',
        'quanto fica',
        'quanto sai',
        'qual o investimento',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'pricing',
      confidence: 'medium',
      evidence_message_id:
        message.id,
    }
  }

  if (
    /\b(?:minha|meu)\s+(?:irma|irmã|irmao|irmão|esposa|marido|amiga|amigo)\b/.test(
      text,
    ) &&
    includesAny(
      text,
      [
        'quer',
        'interesse',
        'comecar',
        'começar',
        'contratar',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'third_party_interest',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'plano',
        'produto',
        'servico',
        'serviço',
        'solucao',
        'solução',
        'oferta',
        'proposta',
        'pacote',
        'licenca',
        'licença',
        'assinatura',
        'consultoria',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'product_interest',
      confidence: 'medium',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'interesse',
        'como funciona',
        'queria saber',
        'quero saber',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'general_interest',
      confidence: 'low',
      evidence_message_id:
        message.id,
    }
  }

  return {
    kind: 'unknown',
    confidence: 'low',
    evidence_message_id:
      message.id,
  }
}

function hasQuestion(
  value: string,
): boolean {
  return value.includes('?')
}

function containsSchedulingLanguage(
  value: string,
): boolean {
  return includesAny(
    value,
    [
      'experimental',
      'agendar',
      'agendamento',
      'marcar',
      'horario',
      'horário',
      'reuniao',
      'reunião',
      'visita',
      'demonstracao',
      'demonstração',
      'consulta',
      'apresentacao',
      'apresentação',
      'amanha',
      'amanhã',
      'terça',
      'terca',
      'quarta',
      'quinta',
      'sexta',
      'sabado',
      'sábado',
      'domingo',
    ].map(normalizeText),
  )
}

function containsReengagementLanguage(
  value: string,
): boolean {
  return includesAny(
    value,
    [
      'ainda faz sentido',
      'ainda quer',
      'ainda tem interesse',
      'ainda têm interesse',
      'segue interessado',
      'segue interessada',
      'continua interessado',
      'continua interessada',
      'quer seguir',
      'podemos retomar',
      'retomar',
      'retomamos',
      'retomarmos',
      'continuar',
      'continuamos',
      'seguimos',
      'ficou em aberto',
      'deixamos em aberto',
      // Retomada por mudança de estado / recuperação de contexto: a
      // pergunta se ancora no que aconteceu antes e pergunta pelo estado
      // atual, em vez de repetir o pedido operacional.
      'como ficou',
      'chegou a',
      'desde entao',
      'desde a ultima',
      'da ultima vez',
      'quando conversamos',
      'quando falamos',
      'ficou pendente',
      'ficou parado',
      'voltar a falar',
      'retomando',
      'passando para saber',
      'passando pra saber',
      'nesse periodo',
      'nesse meio tempo',
      'faz um tempo',
      'faz algum tempo',
      'ainda pretende',
      'ainda esta pensando',
      'ainda pensa em',
      'ainda e prioridade',
      'continua sendo prioridade',
      'algo mudou',
      'mudou alguma coisa',
      'conseguiu resolver',
      'ainda esta avaliando',
      'segue avaliando',
      'continua avaliando',
    ].map(normalizeText),
  )
}

// Palavras de saudação e fórmulas fáticas ("tudo bem", "como vai").
const GREETING_OPENERS =
  new Set([
    'oi',
    'oii',
    'oie',
    'ola',
    'opa',
    'bom',
    'boa',
    'hey',
    'hello',
    'eai',
  ])

const PHATIC_TOKENS =
  new Set([
    'bom',
    'boa',
    'dia',
    'tarde',
    'noite',
    'tudo',
    'bem',
    'e',
    'ai',
    'como',
    'vai',
    'voce',
    'vc',
    'esta',
    'td',
    'blz',
    'beleza',
    'prazer',
    'tranquilo',
    'ok',
  ])

// Partículas de nome próprio ("João da Silva").
const NAME_PARTICLES =
  new Set([
    'da',
    'de',
    'do',
    'dos',
    'das',
  ])

// Palavras que NUNCA são vocativo: pronomes, artigos, verbos de ação
// comercial, disponibilidade, oferta, proposta, agenda, preço. Uma saudação
// seguida de qualquer uma delas é uma resposta com conteúdo, não rapport.
const NON_VOCATIVE_WORDS =
  new Set([
    'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
    'eu', 'nos', 'ele', 'ela', 'eles', 'elas', 'voces', 'vcs', 'senhor', 'senhora',
    'me', 'te', 'se', 'lhe', 'meu', 'minha', 'seu', 'sua', 'nosso', 'nossa',
    'aqui', 'ali', 'la', 'ja', 'sim', 'nao', 'so', 'mais', 'muito', 'pouco',
    'que', 'qual', 'quais', 'quando', 'onde', 'quanto', 'quanta', 'porque', 'pois',
    'para', 'pra', 'pro', 'com', 'sem', 'sobre', 'em', 'no', 'na', 'nos', 'nas', 'por', 'ate',
    'hoje', 'amanha', 'agora', 'depois', 'ontem', 'semana', 'mes', 'horario', 'horarios',
    'hora', 'horas', 'vaga', 'vagas', 'agenda', 'data', 'datas', 'turno', 'turma', 'turmas',
    'temos', 'tenho', 'tem', 'ha', 'segue', 'seguem', 'sigo', 'envio', 'enviei', 'mando', 'mandei',
    'posso', 'podemos', 'pode', 'podem', 'consigo', 'conseguimos', 'consegue',
    'quer', 'quero', 'queria', 'gostaria', 'vamos', 'vou', 'vai', 'faz', 'fazemos', 'fica', 'ficou',
    'agendar', 'marcar', 'reservar', 'confirmar', 'confirmado', 'confirmada', 'combinado', 'combinada',
    'proposta', 'orcamento', 'valor', 'valores', 'preco', 'precos', 'plano', 'planos', 'pacote', 'pacotes',
    'link', 'catalogo', 'tabela', 'oferta', 'ofertas', 'promocao', 'desconto', 'condicao', 'condicoes',
    'disponivel', 'disponiveis', 'disponibilidade', 'livre', 'aberto', 'aberta',
    'obrigado', 'obrigada', 'claro', 'certo', 'perfeito', 'perfeita', 'otimo', 'otima', 'entao',
    'desculpa', 'desculpe', 'perdao', 'retorno', 'retornando', 'passando', 'tudo',
  ])

const VERB_LIKE_SUFFIX =
  /(ar|er|ir|amos|emos|imos|ando|endo|indo|ado|ido|ei|ou|am|em)$/

// Vocativo plausível: nome próprio (inicial maiúscula no texto original)
// ou palavra minúscula que não é função gramatical, verbo nem vocabulário
// comercial ("oi maria" é saudação; "oi temos" não).
function isVocativeToken(
  normalizedToken: string,
  originalToken: string,
): boolean {
  if (
    !/^[a-z]{2,}$/.test(
      normalizedToken,
    ) ||
    NON_VOCATIVE_WORDS.has(
      normalizedToken,
    )
  ) {
    return false
  }

  const capitalized =
    /^\p{Lu}/u.test(
      originalToken,
    )

  return (
    capitalized ||
    !VERB_LIKE_SUFFIX.test(
      normalizedToken,
    )
  )
}

// Saudação pura ("Olá", "Oi, Lorena!", "Bom dia, tudo bem?", "Olá, João
// Silva"). Não é resposta factual nem pivô de objetivo: é abertura/rapport.
// Só vale quando, além da saudação e das fórmulas fáticas, sobra no máximo
// um vocativo plausível — nunca verbo, oferta, disponibilidade, agenda ou
// pergunta não fática. "Oi, temos horários", "Olá, segue proposta" e "Oi,
// posso agendar?" são respostas com conteúdo.
function isPureGreeting(
  value: string,
): boolean {
  const originalTokens =
    value
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)

  const tokens =
    originalTokens.map(
      token =>
        normalizeText(token),
    )

  if (
    tokens.length === 0 ||
    tokens.length > 8 ||
    !GREETING_OPENERS.has(
      tokens[0],
    )
  ) {
    return false
  }

  const remaining =
    tokens
      .map((token, index) => ({
        token,
        original:
          originalTokens[index],
      }))
      .slice(1)
      .filter(
        ({ token }) =>
          !PHATIC_TOKENS.has(
            token,
          ),
      )

  const vocative =
    remaining.filter(
      ({ token }) =>
        !NAME_PARTICLES.has(
          token,
        ),
    )

  if (
    vocative.length > 3 ||
    !vocative.every(
      ({ token, original }) =>
        isVocativeToken(
          token,
          original,
        ),
    )
  ) {
    return false
  }

  // Pergunta só é aceitável quando é fática ("tudo bem?", "como vai?").
  if (value.includes('?')) {
    const questionPart =
      normalizeText(
        value.slice(
          0,
          value.lastIndexOf('?'),
        ),
      )

    if (
      !/(tudo bem|tudo bom|como vai|como (voce|vc) esta|td bem|blz|e ai)\s*$/.test(
        questionPart
          .replace(/[^a-z\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
    ) {
      return false
    }
  }

  return true
}

const CLOSE_CONTINUATION =
  /\b(seguir|prosseguir|continuar|avancar|dar andamento|dar continuidade|finalizar)\s+(com|a|ao|na|no)\s+(a |o )?(contratacao|compra|assinatura|adesao|matricula|inscricao|fechamento|pedido|pagamento|reserva)\b/

// Fala do cliente sem conteúdo comercial: saudação, agradecimento,
// reconhecimento, riso, emoji. Nunca prova que uma intenção antiga continua
// atual ("Bom dia." seis dias depois de "Quero contratar." não reconfirma
// nada).
const CUSTOMER_PHATIC_TOKENS =
  new Set([
    ...GREETING_OPENERS,
    ...PHATIC_TOKENS,
    'obrigado', 'obrigada', 'obg', 'brigado', 'brigada', 'agradeco', 'valeu', 'vlw',
    'certo', 'entendi', 'entendido', 'perfeito', 'perfeita', 'otimo', 'otima', 'show',
    'top', 'legal', 'massa', 'joia', 'ta', 'tah', 'okay', 'okk', 'igualmente', 'tambem',
    'tb', 'tbm', 'pra', 'para', 'muito', 'mto', 'kk', 'kkk', 'kkkk', 'haha', 'hehe', 'rs',
    'rsrs', 'nada', 'de', 'disponha', 'tchau', 'ate', 'mais', 'abraco', 'abs', 'bjs', 'eh',
  ])

export function isCustomerPhaticMessage(
  value: string,
): boolean {
  const trimmed =
    value.trim()

  if (!trimmed) {
    return true
  }

  if (isPureGreeting(trimmed)) {
    return true
  }

  const originalTokens =
    trimmed
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)

  if (originalTokens.length === 0) {
    // Só emoji/pontuação.
    return true
  }

  if (originalTokens.length > 10) {
    return false
  }

  if (
    trimmed.includes('?') &&
    !/(tudo bem|tudo bom|como vai|como (voce|vc) esta|td bem|blz|e ai|e voce|e vc)\s*\?/.test(
      normalizeText(trimmed),
    )
  ) {
    return false
  }

  const content =
    originalTokens.filter(
      token =>
        !CUSTOMER_PHATIC_TOKENS.has(
          normalizeText(token),
        ),
    )

  return (
    content.length === 0 ||
    (
      content.length <= 2 &&
      originalTokens.length > content.length &&
      content.every(
        token =>
          !NAME_PARTICLES.has(
            normalizeText(token),
          ) &&
          isVocativeToken(
            normalizeText(token),
            token,
          ),
      )
    )
  )
}

// Reconfirmação afirmativa de continuidade escrita pelo cliente ("Sim,
// quero seguir", "Ainda tenho interesse", "Vamos continuar"). Negada na
// mesma cláusula não conta.
const AFFIRMATIVE_CONTINUATION =
  /\b(ainda (quero|tenho interesse|estou interessad[oa]|to interessad[oa]|faz sentido|penso nisso|pretendo)|continuo interessad[oa]|sigo interessad[oa]|(quero|queremos|vamos|podemos|pode|bora|gostaria de) (sim )?(seguir|continuar|prosseguir|retomar|dar andamento|dar continuidade|avancar|fechar)|tenho interesse sim|faz sentido sim|segue fazendo sentido|quero sim|tenho sim|continua de pe|esta de pe|ta de pe)\b/

export function expressesAffirmativeContinuation(
  value: string,
): boolean {
  return clausesOf(
    normalizeText(value),
  ).some(
    clause =>
      AFFIRMATIVE_CONTINUATION.test(
        clause,
      ) &&
      !/\bnao\b/.test(
        clause,
      ),
  )
}

function isShortAcknowledgement(
  value: string,
): boolean {
  const normalized =
    normalizeText(value)
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  if (
    !normalized ||
    wordCount(normalized) > 8
  ) {
    return false
  }

  return /^(que (otimo|bom|legal|maravilha|show)|otimo|otima|show|beleza|maravilha|legal|certo|ok|okay|excelente|top|boa|perfeito|perfeita|entendi|entendido|claro|combinado|sem problemas?)\b/.test(
    normalized,
  )
}

function containsChoiceStructure(
  value: string,
): boolean {
  return (
    /\bou\b/.test(value) &&
    (
      /\b\d{1,2}(?::|h)\d{0,2}\b/.test(
        value,
      ) ||
      includesAny(
        value,
        [
          'manha',
          'manhã',
          'tarde',
          'noite',
          'terça',
          'terca',
          'quarta',
          'quinta',
          'sexta',
          'sabado',
          'sábado',
          'domingo',
        ].map(normalizeText),
      )
    )
  )
}

function classifySellerAction(
  text: string,
): SellerExecutionActionType {
  const normalized =
    normalizeText(text)

  if (!normalized) {
    return 'unknown'
  }

  const question =
    hasQuestion(text)

  if (
    isPureGreeting(
      text,
    )
  ) {
    return 'rapport_opening'
  }

  if (
    containsReengagementLanguage(
      normalized,
    )
  ) {
    return 'reengagement'
  }

  if (
    question &&
    containsSchedulingLanguage(
      normalized,
    ) &&
    containsChoiceStructure(
      normalized,
    )
  ) {
    return 'scheduling_guided_choice'
  }

  if (
    question &&
    containsSchedulingLanguage(
      normalized,
    )
  ) {
    return 'scheduling_open_question'
  }

  if (
    question &&
    includesAny(
      normalized,
      [
        'bloqueio',
        'limite',
        'cartao',
        'cartão',
        'objecao',
        'objeção',
        'impede',
        'dificulta',
        'o que pesa',
        'pesa mais',
        'te preocupa',
        'preocupacao',
        'preocupação',
        'o que falta para',
        'o que faltaria',
      ].map(normalizeText),
    )
  ) {
    return 'objection_probe'
  }

  if (
    question &&
    includesAny(
      normalized,
      [
        'principal objetivo',
        'principal desafio',
        'principal problema',
        'principal necessidade',
        'objetivo',
        'desafio que',
        'problema que',
        'necessidade que',
        'quantas vezes',
        'o que voce busca',
        'o que você busca',
        'o que procura',
        'qual sua prioridade',
        'qual é sua prioridade',
        'qual problema',
        'qual desafio',
        'qual necessidade',
        'o que precisa',
        'como faz hoje',
        'como voce faz hoje',
        'como você faz hoje',
      ].map(normalizeText),
    )
  ) {
    return 'discovery_question'
  }

  if (
    includesAny(
      normalized,
      [
        'ultima chance',
        'última chance',
        'so hoje',
        'só hoje',
        'agora ou perde',
      ].map(normalizeText),
    )
  ) {
    return 'pressure_or_false_urgency'
  }

  if (
    /r\$\s*\d/i.test(text) ||
    includesAny(
      normalized,
      [
        'preco',
        'preço',
        'valor',
        'custa',
        'investimento',
        'mensalidade',
        'orcamento',
        'orçamento',
        'desconto',
        'promocao',
        'promoção',
        'condicao especial',
        'condição especial',
      ].map(normalizeText),
    )
  ) {
    return 'price_presentation'
  }

  if (
    includesAny(
      normalized,
      [
        'plano',
        'produto',
        'servico',
        'serviço',
        'solucao',
        'solução',
        'oferta',
        'proposta',
        'pacote',
        'licenca',
        'licença',
        'assinatura',
        'consultoria',
        'opcoes',
        'opções',
        'beneficios',
        'benefícios',
      ].map(normalizeText),
    )
  ) {
    return 'product_presentation'
  }

  if (
    question &&
    includesAny(
      normalized,
      [
        'fechar',
        'pagamento',
        'matricula',
        'matrícula',
        'contratar',
        'comprar',
        'assinar',
        'aderir',
        'aprovar',
        'avancar',
        'avançar',
      ].map(normalizeText),
    )
  ) {
    return 'close_request'
  }

  if (
    question
  ) {
    return 'clarification_question'
  }

  if (
    (
      includesAny(
        normalized,
        [
          'perfeito',
          'entendi',
          'claro',
          'combinado',
        ].map(normalizeText),
      ) &&
      wordCount(text) <= 14
    ) ||
    isShortAcknowledgement(
      text,
    )
  ) {
    return 'confirmation'
  }

  return 'factual_response'
}

export function classifySellerActionText(
  text: string,
): SellerExecutionActionType {
  return classifySellerAction(
    text,
  )
}

function objectiveForAction(
  action:
    SellerExecutionActionType,
): string {
  switch (action) {
    case 'scheduling_open_question':
    case 'scheduling_guided_choice':
      return 'schedule'
    case 'discovery_question':
    case 'qualification_question':
      return 'discover'
    case 'clarification_question':
      return 'clarify'
    case 'price_presentation':
      return 'present_price'
    case 'product_presentation':
    case 'value_explanation':
      return 'present_solution'
    case 'objection_probe':
      return 'diagnose_objection'
    case 'objection_response':
      return 'resolve_objection'
    case 'commitment_request':
      return 'advance_commitment'
    case 'close_request':
      return 'close'
    case 'follow_up':
      return 'follow_up'
    case 'reengagement':
      return 'reengage'
    case 'confirmation':
      return 'confirm'
    case 'pressure_or_false_urgency':
      return 'pressure'
    default:
      return 'inform'
  }
}

function targetCommitmentForAction(
  action:
    SellerExecutionActionType,
): string | null {
  switch (action) {
    case 'scheduling_open_question':
    case 'scheduling_guided_choice':
      return 'schedule'
    case 'close_request':
      return 'purchase_decision'
    case 'objection_probe':
    case 'discovery_question':
    case 'clarification_question':
    case 'reengagement':
      return 'customer_answer'
    case 'commitment_request':
      return 'next_step'
    default:
      return null
  }
}

function questionQuality(
  action:
    SellerExecutionActionType,
  text: string,
): SellerExecutionQuestionQuality {
  if (
    action ===
      'scheduling_guided_choice'
  ) {
    return 'guided_choice'
  }

  if (
    action ===
      'scheduling_open_question'
  ) {
    return 'open'
  }

  if (!hasQuestion(text)) {
    return 'none'
  }

  if (
    /\b(?:sim|nao|não)\b/.test(
      normalizeText(text),
    )
  ) {
    return 'closed'
  }

  return 'open'
}

function specificityLevel(
  text: string,
): SellerExecutionLevel {
  const normalized =
    normalizeText(text)

  if (
    /r\$\s*\d/i.test(text) ||
    /\b\d{1,2}(?::|h)\d{0,2}\b/.test(
      normalized,
    ) ||
    containsChoiceStructure(
      normalized,
    )
  ) {
    return 'high'
  }

  if (wordCount(text) >= 10) {
    return 'medium'
  }

  return 'low'
}

function frictionLevel({
  action,
  text,
}: {
  action:
    SellerExecutionActionType
  text: string
}): SellerExecutionLevel {
  const words =
    wordCount(text)

  const questions =
    (text.match(/\?/g) ?? [])
      .length

  if (
    action ===
      'scheduling_open_question' ||
    words >= 55 ||
    questions >= 3
  ) {
    return 'high'
  }

  if (
    action ===
      'scheduling_guided_choice'
  ) {
    return 'low'
  }

  if (
    words >= 28 ||
    questions === 2
  ) {
    return 'medium'
  }

  return 'low'
}

function pressureRisk(
  text: string,
): SellerExecutionLevel {
  const normalized =
    normalizeText(text)

  if (
    includesAny(
      normalized,
      [
        'ultima chance',
        'última chance',
        'so hoje',
        'só hoje',
        'agora ou perde',
      ].map(normalizeText),
    )
  ) {
    return 'high'
  }

  if (
    includesAny(
      normalized,
      [
        'urgente',
        'corre',
        'nao perde',
        'não perde',
      ].map(normalizeText),
    )
  ) {
    return 'medium'
  }

  return 'low'
}

// Resposta afirmativa de disponibilidade/agenda sem pergunta ("temos
// horários", "pode vir às 18h", "consigo te encaixar amanhã").
function answersSchedulingRequest(
  text: string,
): boolean {
  const normalized =
    normalizeText(text)

  return (
    containsSchedulingLanguage(
      normalized,
    ) ||
    /\b(temos|tenho|ha) (horario|horarios|vaga|vagas|disponibilidade|agenda)\b|\b(pode vir|consigo te encaixar|te encaixo|esta disponivel|estamos disponiveis|as \d{1,2}(h|:\d{2})?)\b/.test(
      normalized,
    )
  )
}

function actionFollowsIntent({
  action,
  intent,
  text = '',
}: {
  action:
    SellerExecutionActionType
  intent:
    SellerExecutionCustomerIntent | null
  text?: string
}): boolean | null {
  if (
    !intent ||
    intent.kind === 'unknown'
  ) {
    return null
  }

  if (
    action === 'reengagement'
  ) {
    return true
  }

  if (
    intent.kind === 'scheduling' &&
    action === 'factual_response' &&
    answersSchedulingRequest(text)
  ) {
    return true
  }

  const allowed:
    Record<
      SellerExecutionCustomerIntentKind,
      SellerExecutionActionType[]
    > = {
      scheduling: [
        'scheduling_open_question',
        'scheduling_guided_choice',
        'clarification_question',
        'commitment_request',
        'confirmation',
      ],
      close: [
        'close_request',
        'factual_response',
        'price_presentation',
        'product_presentation',
        'objection_probe',
        'objection_response',
        'confirmation',
      ],
      payment_objection: [
        'objection_probe',
        'objection_response',
        'clarification_question',
        'factual_response',
        'confirmation',
      ],
      objection: [
        'objection_probe',
        'objection_response',
        'clarification_question',
        'factual_response',
        'confirmation',
      ],
      pricing: [
        'price_presentation',
        'factual_response',
        'clarification_question',
      ],
      product_interest: [
        'product_presentation',
        'value_explanation',
        'discovery_question',
        'clarification_question',
        'factual_response',
      ],
      third_party_interest: [
        'clarification_question',
        'factual_response',
        'commitment_request',
        'scheduling_open_question',
        'scheduling_guided_choice',
      ],
      general_interest: [
        'discovery_question',
        'clarification_question',
        'factual_response',
      ],
      deferral: [
        'confirmation',
        'factual_response',
        'clarification_question',
        'objection_probe',
        'follow_up',
        'reengagement',
      ],
      disengaged: [
        'confirmation',
        'factual_response',
        'clarification_question',
        'reengagement',
      ],
      unknown: [],
    }

  return allowed[intent.kind]
    .includes(action)
}

function advancesStage(
  action:
    SellerExecutionActionType,
): boolean {
  return [
    'product_presentation',
    'price_presentation',
    'commitment_request',
    'scheduling_open_question',
    'scheduling_guided_choice',
    'close_request',
  ].includes(action)
}

function isGenericResponseCandidate({
  action,
  text,
}: {
  action:
    SellerExecutionActionType
  text: string
}): boolean {
  if (
    ![
      'confirmation',
      'factual_response',
    ].includes(action)
  ) {
    return false
  }

  const normalized =
    normalizeText(text)

  if (
    wordCount(text) > 14
  ) {
    return false
  }

  return includesAny(
    normalized,
    [
      'claro',
      'podemos verificar',
      'vou verificar',
      'te ajudo',
      'posso ajudar',
      'sem problema',
    ].map(normalizeText),
  )
}

function outcomeAfterSellerMessage({
  messages,
  sellerIndex,
}: {
  messages: DiagnosticInputMessage[]
  sellerIndex: number
}): {
  outcome:
    SellerExecutionObservedOutcome
  evidence_message_id: string | null
} {
  for (
    let index =
      sellerIndex + 1;
    index < messages.length;
    index += 1
  ) {
    const message =
      messages[index]

    if (
      message.direction ===
        'outgoing' &&
      message.author_kind ===
        'human_agent'
    ) {
      return {
        outcome:
          'customer_silent_before_next_seller_action',
        evidence_message_id:
          message.id,
      }
    }

    if (
      message.direction !==
        'incoming' ||
      message.author_kind !==
        'customer'
    ) {
      continue
    }

    const normalized =
      normalizeText(
        messageText(message),
      )

    if (
      includesAny(
        normalized,
        [
          'nenhum',
          'nao consigo',
          'não consigo',
          'nao serve',
          'não serve',
          'nao da',
          'não dá',
        ].map(normalizeText),
      )
    ) {
      return {
        outcome:
          'customer_rejected_options',
        evidence_message_id:
          message.id,
      }
    }

    if (
      includesAny(
        normalized,
        [
          'pode ser',
          'fechado',
          'combinado',
          'esse serve',
          'quero esse',
        ].map(normalizeText),
      )
    ) {
      return {
        outcome:
          'customer_accepted',
        evidence_message_id:
          message.id,
      }
    }

    return {
      outcome:
        'customer_replied',
      evidence_message_id:
        message.id,
    }
  }

  return {
    outcome:
      'no_outcome_observed',
    evidence_message_id:
      null,
  }
}

function orderedMessages(
  input: CompanionDiagnosticInput,
): DiagnosticInputMessage[] {
  return [
    ...input.conversation.messages,
  ].sort(
    (left, right) =>
      left.sequence -
        right.sequence ||
      left.occurred_at.localeCompare(
        right.occurred_at,
      ) ||
      left.id.localeCompare(
        right.id,
      ),
  )
}

// Intervalo máximo entre bolhas do vendedor para que ainda sejam a mesma
// ação (rajada). Ofertas em várias mensagens costumam sair em segundos ou
// poucos minutos; um novo envio depois disso é um novo turno/follow-up.
export const SELLER_TURN_BURST_GAP_MS =
  10 * 60 * 1000

function timestampOf(
  message: Pick<
    DiagnosticInputMessage,
    'occurred_at'
  >,
): number | null {
  const parsed =
    Date.parse(
      message.occurred_at,
    )

  return Number.isFinite(parsed)
    ? parsed
    : null
}

function comparableTokens(
  value: string,
): string[] {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      token =>
        token.length >= 3,
    )
}

function nearlySameText(
  left: string,
  right: string,
): boolean {
  const leftTokens =
    comparableTokens(left)

  const rightTokens =
    comparableTokens(right)

  if (
    leftTokens.length === 0 ||
    rightTokens.length === 0
  ) {
    return (
      normalizeText(left) ===
      normalizeText(right)
    )
  }

  const rightSet =
    new Set(rightTokens)

  const shared =
    leftTokens.filter(
      token =>
        rightSet.has(token),
    ).length

  return (
    shared /
      Math.max(
        leftTokens.length,
        rightTokens.length,
      ) >=
    0.8
  )
}

const DOMINANT_ACTION_PRIORITY:
  readonly SellerExecutionActionType[] = [
    'close_request',
    'price_presentation',
    'product_presentation',
    'stage_jump_unrelated_offer',
    'pressure_or_false_urgency',
    'scheduling_guided_choice',
    'scheduling_open_question',
    'objection_probe',
    'objection_response',
    'discovery_question',
    'qualification_question',
    'reengagement',
    'follow_up',
    'commitment_request',
    'value_explanation',
    'factual_proof',
    'clarification_question',
    'factual_response',
    'confirmation',
    'rapport_opening',
    'unknown',
  ]

const CONFIDENCE_RANK:
  Record<
    SellerExecutionConfidence,
    number
  > = {
    high: 3,
    medium: 2,
    low: 1,
  }

function strongestIntent(
  intents:
    readonly SellerExecutionCustomerIntent[],
): SellerExecutionCustomerIntent | null {
  return [...intents]
    .filter(
      intent =>
        intent.kind !== 'unknown',
    )
    .sort(
      (left, right) =>
        CONFIDENCE_RANK[
          right.confidence
        ] -
        CONFIDENCE_RANK[
          left.confidence
        ],
    )[0] ?? null
}

const TURN_NEGATIVE_SIGNALS:
  readonly SellerExecutionSignal[] = [
    'sequence_break',
    'premature_product_offer',
    'duplicate_followup',
    'late_discovery_after_close_intent',
  ]

function buildSellerTurns({
  events,
  drafts,
}: {
  events: SellerExecutionEvent[]
  drafts: Array<{
    event_indexes: number[]
    responds_to: DiagnosticInputMessage[]
    pending_intents: SellerExecutionCustomerIntent[]
  }>
}): SellerExecutionTurn[] {
  return drafts
    .filter(
      draft =>
        draft.event_indexes.length > 0,
    )
    .map((draft, index) => {
      const turnEvents =
        draft.event_indexes.map(
          eventIndex =>
            events[eventIndex],
        )

      const actionTypes =
        unique(
          turnEvents.map(
            event =>
              event.action_type,
          ),
        )

      const dominant =
        DOMINANT_ACTION_PRIORITY.find(
          action =>
            actionTypes.includes(
              action,
            ),
        ) ?? 'unknown'

      const pendingIntent =
        strongestIntent(
          draft.pending_intents,
        )

      // Um turno endereça o pedido quando pelo menos uma ação dele segue a
      // intenção pendente com conteúdo (não só saudação/confirmação).
      const addressesRequest =
        !pendingIntent ||
        pendingIntent.kind ===
          'disengaged'
          ? null
          : turnEvents.some(
              event =>
                event.sequence
                  .follows_previous_context ===
                  true &&
                event.action_type !==
                  'rapport_opening' &&
                event.action_type !==
                  'confirmation',
            )

      const negativeSignals =
        unique([
          ...turnEvents.flatMap(
            event =>
              event.signals.filter(
                signal =>
                  TURN_NEGATIVE_SIGNALS.includes(
                    signal,
                  ),
              ),
          ),
          ...(
            addressesRequest === false &&
            pendingIntent &&
            pendingIntent.confidence !==
              'low'
              ? [
                  'request_not_addressed' as const,
                ]
              : []
          ),
        ])

      if (
        negativeSignals.includes(
          'request_not_addressed',
        )
      ) {
        const lastEvent =
          turnEvents[
            turnEvents.length - 1
          ]

        if (
          !lastEvent.signals.includes(
            'request_not_addressed',
          )
        ) {
          lastEvent.signals.push(
            'request_not_addressed',
          )
        }
      }

      const firstEvent =
        turnEvents[0]

      const lastEvent =
        turnEvents[
          turnEvents.length - 1
        ]

      return {
        turn_id:
          `turn-${index + 1}`,
        message_ids:
          turnEvents.map(
            event =>
              event.message_id,
          ),
        started_at:
          firstEvent.occurred_at,
        ended_at:
          lastEvent.occurred_at,
        action_types:
          actionTypes,
        dominant_action_type:
          dominant,
        responds_to_customer_message_ids:
          draft.responds_to.map(
            message =>
              message.id,
          ),
        pending_customer_intent:
          pendingIntent,
        addresses_customer_request:
          addressesRequest,
        response_latency_ms:
          firstEvent.timing
            .response_latency_ms,
        negative_signals:
          negativeSignals,
        breaks_active_customer_goal:
          turnEvents.some(
            event =>
              event.sequence
                .breaks_active_customer_goal,
          ),
        observed_outcome:
          lastEvent.observed_outcome,
      }
    })
}

export function buildSellerExecutionTrace({
  diagnostic_input,
}: {
  diagnostic_input:
    CompanionDiagnosticInput
}): SellerExecutionTrace {
  const messages =
    orderedMessages(
      diagnostic_input,
    )

  let activeCustomerIntent:
    SellerExecutionCustomerIntent | null =
      null

  let lastSellerAction:
    SellerExecutionActionType | null =
      null

  let customerMessageSinceLastSeller =
    true

  let latestCustomerText = ''

  let lastSellerText = ''

  let lastSellerOccurredAt:
    number | null =
      null

  let previousMessageOccurredAt:
    number | null =
      null

  let pendingCustomerMessages:
    DiagnosticInputMessage[] = []

  let pendingCustomerIntents:
    SellerExecutionCustomerIntent[] = []

  let currentTurnIndex = -1

  const events:
    SellerExecutionEvent[] = []

  const customerSignals:
    SellerExecutionCustomerSignal[] = []

  const turnDrafts: Array<{
    event_indexes: number[]
    responds_to: DiagnosticInputMessage[]
    pending_intents: SellerExecutionCustomerIntent[]
  }> = []

  for (
    let index = 0;
    index < messages.length;
    index += 1
  ) {
    const message =
      messages[index]

    if (
      message.direction ===
        'incoming' &&
      message.author_kind ===
        'customer'
    ) {
      const inferredCustomerIntent =
        inferCustomerIntent(
          message,
        )

      if (
        inferredCustomerIntent.kind !==
          'unknown' ||
        !activeCustomerIntent
      ) {
        activeCustomerIntent =
          inferredCustomerIntent
      }

      latestCustomerText =
        messageText(message)

      const timeReference =
        detectCustomerTimeReference(
          latestCustomerText,
          {
            intentKind:
              inferredCustomerIntent.kind,
          },
        )

      const enthusiasm =
        expressesEnthusiasm(
          latestCustomerText,
        )

      if (
        inferredCustomerIntent.kind !==
          'unknown' ||
        timeReference !== null ||
        enthusiasm
      ) {
        customerSignals.push({
          message_id:
            message.id,
          occurred_at:
            message.occurred_at,
          kind:
            inferredCustomerIntent.kind,
          confidence:
            inferredCustomerIntent.confidence,
          time_reference:
            timeReference,
          expressed_enthusiasm:
            enthusiasm,
          no_contact_requested:
            inferredCustomerIntent.kind ===
              'disengaged' &&
            requestsNoContact(
              latestCustomerText,
            ),
        })
      }

      if (
        !customerMessageSinceLastSeller
      ) {
        pendingCustomerMessages = []
        pendingCustomerIntents = []
      }

      pendingCustomerMessages.push(
        message,
      )

      if (
        inferredCustomerIntent.kind !==
          'unknown'
      ) {
        pendingCustomerIntents.push(
          inferredCustomerIntent,
        )
      }

      customerMessageSinceLastSeller =
        true

      previousMessageOccurredAt =
        timestampOf(message)

      continue
    }

    if (
      message.direction !==
        'outgoing' ||
      message.author_kind !==
        'human_agent'
    ) {
      continue
    }

    const text =
      messageText(message)

    const action =
      classifySellerAction(
        text,
      )

    const occurredAt =
      timestampOf(message)

    // Mesma rajada = mensagens contíguas do vendedor, sem fala do cliente
    // entre elas e com intervalo curto. Bolhas de uma mesma oferta formam
    // UMA ação; follow-up em outro momento é um turno novo.
    const sameBurst =
      !customerMessageSinceLastSeller &&
      lastSellerOccurredAt !== null &&
      occurredAt !== null &&
      occurredAt - lastSellerOccurredAt <=
        SELLER_TURN_BURST_GAP_MS

    if (
      !sameBurst ||
      currentTurnIndex < 0
    ) {
      turnDrafts.push({
        event_indexes: [],
        responds_to:
          customerMessageSinceLastSeller
            ? [
                ...pendingCustomerMessages,
              ]
            : [],
        pending_intents:
          customerMessageSinceLastSeller
            ? [
                ...pendingCustomerIntents,
              ]
            : [],
      })

      currentTurnIndex =
        turnDrafts.length - 1
    }

    const firstPendingCustomerMessage =
      customerMessageSinceLastSeller
        ? pendingCustomerMessages[0] ??
          null
        : null

    const firstPendingAt =
      firstPendingCustomerMessage
        ? timestampOf(
            firstPendingCustomerMessage,
          )
        : null

    const followsContext =
      actionFollowsIntent({
        action,
        intent:
          activeCustomerIntent,
        text,
      })

    // Repetição = mesma ação comercial sem resposta do cliente entre as
    // tentativas. Dentro da mesma rajada só conta quando o conteúdo é
    // praticamente o mesmo; partes diferentes de uma mesma oferta (planos,
    // links, CTA) não são "follow-up duplicado".
    const repeatsPriorAction =
      !customerMessageSinceLastSeller &&
      lastSellerAction === action &&
      (
        !sameBurst ||
        nearlySameText(
          lastSellerText,
          text,
        )
      )

    // Saudação e reconhecimento curto não mudam o objetivo da conversa;
    // quando são tudo o que o vendedor respondeu a um pedido, o problema
    // é "pedido não endereçado" (avaliado por turno), não quebra de
    // sequência. Depois de encerramento explícito do cliente também não
    // existe mais objetivo ativo a ser "quebrado".
    const acknowledgementOnly =
      action === 'rapport_opening' ||
      action === 'confirmation'

    const sequenceBreakFromIntent =
      followsContext === false &&
      !acknowledgementOnly &&
      activeCustomerIntent?.kind !==
        'disengaged' &&
      activeCustomerIntent?.confidence ===
        'high'

    const sequenceBreakFromAbandonment =
      !customerMessageSinceLastSeller &&
      (
        lastSellerAction ===
          'scheduling_open_question' ||
        lastSellerAction ===
          'scheduling_guided_choice'
      ) &&
      (
        action ===
          'product_presentation' ||
        action ===
          'price_presentation'
      )

    const breaksActiveCustomerGoal =
      sequenceBreakFromIntent ||
      sequenceBreakFromAbandonment

    const outcome =
      outcomeAfterSellerMessage({
        messages,
        sellerIndex:
          index,
      })

    const signals:
      SellerExecutionSignal[] = []

    if (
      action ===
        'scheduling_open_question'
    ) {
      signals.push(
        'seller_already_asked_open_question',
      )
    }

    if (
      action ===
        'scheduling_guided_choice'
    ) {
      signals.push(
        'guided_choice_used',
      )
    }

    if (
      breaksActiveCustomerGoal
    ) {
      signals.push(
        'sequence_break',
      )
    }

    if (
      (
        activeCustomerIntent?.kind ===
          'general_interest' &&
        (
          action ===
            'product_presentation' ||
          action ===
            'price_presentation'
        )
      ) ||
      sequenceBreakFromAbandonment
    ) {
      signals.push(
        'premature_product_offer',
      )
    }

    if (repeatsPriorAction) {
      signals.push(
        'duplicate_followup',
      )
    }

    if (
      activeCustomerIntent?.confidence ===
        'high' &&
      [
        'scheduling',
        'close',
      ].includes(
        activeCustomerIntent.kind,
      )
    ) {
      signals.push(
        'customer_intent_hot',
        'microcommitment_available',
      )
    }

    if (
      wordCount(text) >= 55
    ) {
      signals.push(
        'seller_message_overloaded',
      )
    }

    if (
      wordCount(
        latestCustomerText,
      ) <= 4 &&
      wordCount(text) >= 12
    ) {
      signals.push(
        'client_sparse_seller_rich',
      )
    }

    if (
      activeCustomerIntent?.kind ===
        'close' &&
      action ===
        'discovery_question'
    ) {
      signals.push(
        'late_discovery_after_close_intent',
      )
    }

    if (
      isGenericResponseCandidate({
        action,
        text,
      })
    ) {
      signals.push(
        'generic_response_candidate',
      )
    }

    if (
      outcome.outcome ===
        'customer_rejected_options'
    ) {
      signals.push(
        'customer_rejected_options',
      )
    }

    const evidenceMessageIds =
      unique(
        [
          activeCustomerIntent
            ?.evidence_message_id,
          message.id,
          outcome
            .evidence_message_id,
        ].filter(
          (
            value,
          ): value is string =>
            Boolean(value),
        ),
      )

    events.push({
      message_id:
        message.id,
      occurred_at:
        message.occurred_at,
      action_type:
        action,
      commercial_objective:
        objectiveForAction(
          action,
        ),
      method_stage:
        null,
      target_commitment:
        targetCommitmentForAction(
          action,
        ),
      content_summary:
        text.length <= 180
          ? text
          : `${text.slice(0, 177)}...`,
      customer_intent_before_action:
        activeCustomerIntent,
      quality: {
        relevance:
          followsContext === null
            ? 'unknown'
            : followsContext
              ? 'high'
              : 'low',
        specificity:
          specificityLevel(
            text,
          ),
        question_quality:
          questionQuality(
            action,
            text,
          ),
        persuasion_quality:
          'unknown',
        friction:
          frictionLevel({
            action,
            text,
          }),
        pressure_risk:
          pressureRisk(
            text,
          ),
      },
      sequence: {
        follows_previous_context:
          followsContext,
        repeats_prior_action:
          repeatsPriorAction,
        advances_stage:
          advancesStage(
            action,
          ),
        skips_required_step:
          null,
        breaks_active_customer_goal:
          breaksActiveCustomerGoal,
      },
      observed_outcome:
        outcome.outcome,
      signals:
        unique(
          signals,
        ),
      evidence_message_ids:
        evidenceMessageIds,
      turn_id:
        `turn-${currentTurnIndex + 1}`,
      timing: {
        responds_to_customer_message_id:
          firstPendingCustomerMessage
            ?.id ??
          null,
        response_latency_ms:
          firstPendingAt !== null &&
          occurredAt !== null
            ? Math.max(
                0,
                occurredAt -
                  firstPendingAt,
              )
            : null,
        previous_message_gap_ms:
          previousMessageOccurredAt !==
            null &&
          occurredAt !== null
            ? Math.max(
                0,
                occurredAt -
                  previousMessageOccurredAt,
              )
            : null,
      },
    })

    turnDrafts[
      currentTurnIndex
    ].event_indexes.push(
      events.length - 1,
    )

    lastSellerAction =
      action

    lastSellerText =
      text

    lastSellerOccurredAt =
      occurredAt

    previousMessageOccurredAt =
      occurredAt

    customerMessageSinceLastSeller =
      false
  }

  const turns =
    buildSellerTurns({
      events,
      drafts:
        turnDrafts,
    })

  const classifiedMessageCount =
    events.filter(
      event =>
        event.action_type !==
          'unknown',
    ).length

  const sellerExecutionConfidence:
    SellerExecutionConfidence =
      events.length === 0
        ? 'low'
        : classifiedMessageCount ===
            events.length
          ? 'high'
          : 'medium'

  const clientContextConfidence:
    SellerExecutionConfidence =
      activeCustomerIntent
        ?.confidence ??
      'low'

  return {
    contract_version:
      SELLER_EXECUTION_TRACE_VERSION,
    summary: {
      seller_message_count:
        events.length,
      classified_message_count:
        classifiedMessageCount,
      client_context_confidence:
        clientContextConfidence,
      seller_execution_confidence:
        sellerExecutionConfidence,
      active_customer_intent:
        activeCustomerIntent,
      sequence_break_detected:
        events.some(
          event =>
            event.sequence
              .breaks_active_customer_goal,
        ),
      evidence_message_ids:
        unique(
          events.flatMap(
            event =>
              event.evidence_message_ids,
          ),
        ),
    },
    events,
    turns,
    customer_signals:
      customerSignals,
  }
}
