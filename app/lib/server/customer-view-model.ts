import 'server-only'

import type {
  CommercialReadingCommunicationObservation,
  CommercialReadingCustomer,
  CommercialReadingCustomerCompetitor,
  CommercialReadingCustomerProduct,
  CommercialReadingEvidenceItem,
} from '@/app/lib/companion/commercial-reading-contract'

import type {
  CanonicalCommercialReadingSource,
} from './canonical-commercial-reading-source'

// ---------------------------------------------------------------------------
// FASE 16.7 — CLIENTE seller-facing view model.
//
// Único ponto de tradução entre a leitura comercial canônica atual
// (Commercial Reading, FASE 16.3B) e a apresentação seller-facing da aba
// CLIENTE. Responde "o que sabemos e ainda precisamos descobrir sobre
// esta pessoa?" (mandato FASE 16.7 §2) — nunca "o que fazer agora?"
// (AGORA), "como está esta venda?" (ANÁLISE) nem "como comunicar?"
// (MENSAGEM).
//
// Fronteira PERSON vs CYCLE (mandato §4, safety-critical) — decisão de
// escopo documentada (não existe, em lugar nenhum da base, um marcador
// por item de durabilidade: `CommercialReadingEvidenceItem` é sempre
// `{summary, evidence_message_ids, memory_ids}`, sem `kind`/`category`/
// `durable` que distinga "traço da pessoa" de "fato deste ciclo" —
// confirmado por auditoria completa do contrato antes de implementar,
// mandato §5). Sem esse marcador, a classificação só pode ser feita por
// CAMPO (qual pergunta aquele campo responde por natureza), nunca por
// item individual — nunca inventamos um classificador semântico novo
// aqui, o que seria uma segunda IA de interpretação (proibido, mandato
// §6/§29). A escolha de quais campos entram em qual grupo foi validada
// com o Controle Mestre (opção "Balanceado", FASE 16.7):
//
// - `preferences` + `communication.patterns`: candidatos a traço da
//   pessoa (canal, formato, estilo — mandato §12 dá exatamente estes
//   exemplos) — seção primária ("como prefere interagir"), mas o copy
//   nunca afirma "isto é permanente": é sempre "observado nesta
//   conversa", porque não existe memória cross-cycle que prove
//   recorrência (ver nota "SEM MEMÓRIA DURÁVEL" abaixo).
// - `missing_discovery` (mais `open_questions`/`uncertainties` como
//   fallback só quando `missing_discovery` estiver vazio): lacunas de
//   conhecimento — seção primária, já vem evidenciada e específica pelo
//   próprio contrato, nunca lacuna genérica (mandato §22/§23).
// - `objectives`/`needs`/`interests`/`problems`/`impacts`/
//   `decision_criteria`/`discussed_products`/`primary_product_interest`/
//   `competitors`/`communication.events`: claramente sobre a
//   OPORTUNIDADE atual (mandato §13 dá "needs" como exemplo do próprio
//   campo podendo ser pessoa OU ciclo dependendo do conteúdo — sem
//   marcador para decidir por item, tratamos o campo inteiro como ciclo,
//   a leitura conservadora) — seção secundária/subordinada
//   ("contexto desta oportunidade"), nunca oferecida como fato durável
//   da pessoa, nunca dominando a aba (mandato §7).
// - `objections` e `commitments`: REMOVIDOS do CLIENTE (mandato §17/§18
//   — objeção e estado de compromisso são conteúdo de ANÁLISE, que já
//   os mostra via `risks.customer_objections`/Cycle Memory desde a FASE
//   16.6; mantê-los aqui também duplicaria exatamente o que o mandato
//   pede para eliminar, mandato §6).
// - `resolved_information`/`superseded_information`: não viram seção
//   própria (não fazem parte da hierarquia do mandato §37) — usados
//   apenas internamente para filtrar `missing_discovery` já resolvido
//   (mesma lógica de `getActiveMissingDiscovery`, agora movida para cá).
//
// SEM MEMÓRIA DURÁVEL (mandato §8): não existe, em nenhum lugar da base,
// uma fonte canônica de memória de pessoa cross-cycle — confirmado por
// auditoria (`canonical-communication-context-source.ts` já declara
// `person_memory_availability: 'NOT_AVAILABLE'` como constante fixa).
// Este módulo NÃO finge que essa fonte existe: cada campo devolvido aqui
// vem só da leitura comercial ATUAL (um único cycle/conversation), nunca
// agregado entre ciclos. O isolamento cross-cycle (mandato §20/§34) é
// garantido no cliente pelo mesmo snapshot com identidade que CLIENTE
// já usava antes desta fase (`getLastKnownClientCommercialReading`,
// 4 vias: company/cycle/conversation/fingerprint) — este presenter não
// muda essa garantia, só traduz o conteúdo de dentro dela.
//
// RELACIONAMENTO (mandato §11) não é responsabilidade deste módulo — já
// existe um presenter equivalente e testado (`companion-client-context-
// loader.ts` + `companion-client-context-view.js`, contrato
// `companion-client-context-v1`), carregado por um pipeline canônico
// próprio, puramente determinístico/DB (nunca IA). Mandato §29/§31:
// reusar/adaptar em vez de criar um segundo Customer Context paralelo —
// CLIENTE compõe os dois na renderização (content-script.js), sem este
// módulo precisar carregar nem duplicar client-context.
// ---------------------------------------------------------------------------

// Só `no_reading` existe aqui (ao contrário de AGORA/ANÁLISE, que também
// têm `no_context`): este presenter recebe a leitura comercial já
// resolvida (ou `null`) diretamente, sem um wrapper de "contexto
// integrado" que possa faltar por conta própria — qualquer falha de
// autenticação/autorização/ledger acontece antes, no loader, e vira erro
// HTTP (mesma disciplina de `analysis-view-model-loader.ts`), nunca um
// `CustomerViewModel` com `available: false`.
export const CUSTOMER_VIEW_MODEL_UNAVAILABLE_REASONS = [
  'no_reading',
] as const

export type CustomerViewModelUnavailableReason =
  (typeof CUSTOMER_VIEW_MODEL_UNAVAILABLE_REASONS)[number]

const MAX_PREFERENCES = 5
const MAX_COMMUNICATION_PATTERNS = 5
const MAX_KNOWLEDGE_GAPS = 3
const MAX_OPPORTUNITY_CONTEXT_ITEMS = 5

export type CustomerViewModelGap = {
  summary: string
  topic: string | null

  evidence_message_ids: string[]
  memory_ids: string[]
}

export type CustomerViewModelOpportunityContext = {
  objectives: CommercialReadingEvidenceItem[]
  needs: CommercialReadingEvidenceItem[]
  interests: CommercialReadingEvidenceItem[]
  problems: CommercialReadingEvidenceItem[]
  impacts: CommercialReadingEvidenceItem[]
  decision_criteria: CommercialReadingEvidenceItem[]

  discussed_products: CommercialReadingCustomerProduct[]
  primary_product_interest: CommercialReadingCustomerProduct | null
  competitors: CommercialReadingCustomerCompetitor[]

  communication_events: CommercialReadingCommunicationObservation[]
}

export type CustomerViewModelProvenance = {
  reference_time: string | null
  state_record_id: string | null
  state_version: number | null
  state_updated_at: string | null
}

export type CustomerViewModel = {
  available: boolean
  unavailable_reason: CustomerViewModelUnavailableReason | null

  // "Como prefere interagir" (mandato §37/§12) — sempre observado na
  // leitura atual, nunca afirmado como padrão confirmado entre ciclos
  // (não temos como provar recorrência sem memória durável).
  preferences: CommercialReadingEvidenceItem[]
  communication_patterns: CommercialReadingCommunicationObservation[]

  // "O que ainda falta descobrir" (mandato §22/§23) — máx. 1 principal +
  // 2 secundárias, sempre específico, nunca genérico.
  knowledge_gaps: CustomerViewModelGap[]

  // "Contexto desta oportunidade" — secundário, subordinado, nunca
  // afirmado como traço durável da pessoa (mandato §7, opção
  // "Balanceado" do Controle Mestre).
  opportunity_context: CustomerViewModelOpportunityContext

  provenance: CustomerViewModelProvenance
}

function hasSharedMemoryId(
  item: { memory_ids: string[] },
  historyItems: Array<{ category: string, memory_ids: string[] }>,
): boolean {
  const memoryIds = item.memory_ids.filter(Boolean)

  if (memoryIds.length === 0) {
    return false
  }

  return historyItems.some(
    (history) =>
      history.category === 'missing_discovery' &&
      history.memory_ids.some(
        (id) => memoryIds.includes(id),
      ),
  )
}

// Mesma regra de `getActiveMissingDiscovery` (companion-seller-
// information-view.js, pré-FASE-16.7) — movida para o presenter
// canônico para deixar de existir em duplicata no cliente (mandato §6).
// Uma lacuna cujo `memory_ids` já foi resolvida/substituída (histórico
// da própria leitura) não é mais uma lacuna ATIVA.
function buildKnowledgeGaps(
  customer: CommercialReadingCustomer,
): CustomerViewModelGap[] {
  const history = [
    ...customer.resolved_information,
    ...customer.superseded_information,
  ]

  const activeMissingDiscovery =
    customer.missing_discovery.filter(
      (item) => !hasSharedMemoryId(item, history),
    )

  if (activeMissingDiscovery.length > 0) {
    return activeMissingDiscovery
      .slice(0, MAX_KNOWLEDGE_GAPS)
      .map((item) => ({
        summary: item.summary,
        topic: item.topic,
        evidence_message_ids: item.evidence_message_ids,
        memory_ids: item.memory_ids,
      }))
  }

  // Fallback (mandato §22): sem lacuna específica de descoberta,
  // perguntas em aberto/incertezas da leitura atual ainda podem apontar
  // uma lacuna concreta — nunca inventamos um texto genérico
  // ("conheça melhor o cliente") quando nenhuma das duas fontes tem
  // conteúdo (mandato §23); nesse caso `knowledge_gaps` fica vazio.
  return [
    ...customer.open_questions,
    ...customer.uncertainties,
  ]
    .slice(0, MAX_KNOWLEDGE_GAPS)
    .map((item) => ({
      summary: item.summary,
      topic: null,
      evidence_message_ids: item.evidence_message_ids,
      memory_ids: item.memory_ids,
    }))
}

export function buildCustomerViewModel(
  currentReading: CanonicalCommercialReadingSource | null,
): CustomerViewModel {
  const emptyOpportunityContext: CustomerViewModelOpportunityContext = {
    objectives: [],
    needs: [],
    interests: [],
    problems: [],
    impacts: [],
    decision_criteria: [],
    discussed_products: [],
    primary_product_interest: null,
    competitors: [],
    communication_events: [],
  }

  if (!currentReading) {
    return {
      available: true,
      unavailable_reason: 'no_reading',

      preferences: [],
      communication_patterns: [],
      knowledge_gaps: [],
      opportunity_context: emptyOpportunityContext,

      provenance: {
        reference_time: null,
        state_record_id: null,
        state_version: null,
        state_updated_at: null,
      },
    }
  }

  const customer =
    currentReading.reading.customer

  // Mandato §19 (regra não-negociável): CLIENTE nunca aplica o mesmo
  // gate de neutralidade de AGORA/ANÁLISE (`commercial_relevance`/
  // `commercial_role`) — uma sessão pessoal pode ENRIQUECER o que
  // sabemos da pessoa, e uma sessão comercial nunca apaga o que já
  // sabemos. Por isso, ao contrário de `agora-view-model.ts`/
  // `analysis-view-model.ts`, este presenter não tem branch `neutral`:
  // mostra o que a leitura atual trouxer em `customer.*`,
  // independentemente de `commercial_relevance`.
  return {
    available: true,
    unavailable_reason: null,

    preferences:
      customer.preferences.slice(0, MAX_PREFERENCES),

    communication_patterns:
      customer.communication.patterns.slice(
        0,
        MAX_COMMUNICATION_PATTERNS,
      ),

    knowledge_gaps: buildKnowledgeGaps(customer),

    opportunity_context: {
      objectives:
        customer.objectives.slice(
          0,
          MAX_OPPORTUNITY_CONTEXT_ITEMS,
        ),

      needs:
        customer.needs.slice(
          0,
          MAX_OPPORTUNITY_CONTEXT_ITEMS,
        ),

      interests:
        customer.interests.slice(
          0,
          MAX_OPPORTUNITY_CONTEXT_ITEMS,
        ),

      problems:
        customer.problems.slice(
          0,
          MAX_OPPORTUNITY_CONTEXT_ITEMS,
        ),

      impacts:
        customer.impacts.slice(
          0,
          MAX_OPPORTUNITY_CONTEXT_ITEMS,
        ),

      decision_criteria:
        customer.decision_criteria.slice(
          0,
          MAX_OPPORTUNITY_CONTEXT_ITEMS,
        ),

      discussed_products:
        customer.discussed_products.slice(
          0,
          MAX_OPPORTUNITY_CONTEXT_ITEMS,
        ),

      primary_product_interest:
        customer.primary_product_interest,

      competitors:
        customer.competitors.slice(
          0,
          MAX_OPPORTUNITY_CONTEXT_ITEMS,
        ),

      communication_events:
        customer.communication.events.slice(
          0,
          MAX_OPPORTUNITY_CONTEXT_ITEMS,
        ),
    },

    provenance: {
      reference_time: currentReading.generated_at,
      state_record_id: currentReading.state_record_id,
      state_version: currentReading.state_version,
      state_updated_at: currentReading.state_updated_at,
    },
  }
}
