/**
 * Microfeedback pedagógico (seção 12) e resumos de capítulo (seção 13) da
 * Jornada Guiada. Todo texto aqui é derivado exclusivamente de fatos já
 * respondidos — nada é inventado.
 */

import { getBuyerDecisionProfile } from '@/app/lib/commercial-config/buyer-decision-architecture'
import type { CommercialMethodBuilderData } from '@/app/types/commercial-method-builder'
import type { CommercialBuyerDecisionDraft } from '@/app/types/commercial-method-buyer-decision'

function clean(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean)
}

function labelList(values: string[], empty = 'não informado'): string {
  const items = clean(values)
  return items.length > 0 ? items.join(', ') : empty
}

/**
 * Microfeedback disparado por combinações de fatos do diagnóstico
 * (capítulos 1-3). Chamado depois de cada resposta relevante; retorna no
 * máximo os itens que ainda não foram vistos pelo chamador (o shell decide
 * o que já mostrou).
 */
export function buildDiagnosisMicrofeedback(data: CommercialMethodBuilderData): string[] {
  const feedback: string[] = []
  const buyer = data.company_profile.buyer_behavior

  if (buyer?.contact_is_decision_maker === 'yes' && buyer.closes_on_first_contact === true) {
    feedback.push(
      'Entendi uma coisa importante: o próprio cliente geralmente decide e a venda costuma acontecer no mesmo atendimento. Seu método provavelmente não precisa de várias etapas de aprovação.',
    )
  }

  const problemContext = data.current_sales_process.problem_context
  const discoveryDepth = data.current_sales_process.discovery_depth
  if (problemContext?.objective_matters === true && (discoveryDepth?.changes_recommendation.length ?? 0) > 0) {
    feedback.push(
      `Bom ponto: o objetivo do cliente muda qual plano deve ser recomendado (${labelList(discoveryDepth?.changes_recommendation ?? [])}). Isso significa que seu método precisa garantir alguma descoberta antes da apresentação.`,
    )
  }

  if (data.company_profile.offer.purchase_frequency === 'recurring' || data.company_profile.offer.purchase_frequency === 'both') {
    feedback.push('Como existe recorrência, vamos incluir perguntas sobre renovação mais adiante.')
  }

  if (buyer?.workload_pattern === 'high_volume_short' && buyer.closes_on_first_contact === true) {
    feedback.push('Sua venda tende a ser curta e direta. Isso normalmente pede um método com poucas etapas.')
  }

  if (buyer?.workload_pattern === 'few_complex') {
    feedback.push('Sua venda exige mais alinhamento porque envolve oportunidades mais complexas e com menos volume.')
  }

  return feedback
}

/**
 * Microfeedback do Capítulo 4 (arquitetura de decisão) — usa a mesma lógica
 * de "enviar proposta não é evidência" descrita na seção 12.
 */
export function buildBuyerDecisionMicrofeedback(
  diagnosis: CommercialMethodBuilderData,
  decision: CommercialBuyerDecisionDraft,
): string[] {
  const feedback: string[] = []
  const formalParticipants = clean([...decision.participant_roles, ...decision.formal_process_steps])
  const blockingAreas = formalParticipants.filter((role) =>
    ['TI', 'Jurídico', 'Compras'].includes(role),
  )

  if (blockingAreas.length > 0) {
    feedback.push(
      `Isso muda bastante o processo: você informou que ${blockingAreas.join(', ')} podem participar. Então "enviar proposta" não é evidência suficiente de que a venda avançou.`,
    )
  }

  if (decision.real_urgency === 'yes' && decision.urgency_drivers.length > 0) {
    feedback.push(
      `Você informou um prazo real (${labelList(decision.urgency_drivers)}). Use isso com cuidado: prazo real ajuda a priorizar, mas não deve virar pressão artificial sobre o cliente.`,
    )
  }

  return feedback
}

/**
 * Explicação em linguagem simples da profundidade calculada (seção 11).
 * Nunca retorna um score — apenas uma frase.
 */
export function explainComplexityDepth(
  diagnosis: CommercialMethodBuilderData,
  decision: CommercialBuyerDecisionDraft,
): string {
  const profile = getBuyerDecisionProfile(diagnosis, decision)

  if (profile.depth === 'light') {
    return 'Sua venda tende a ser curta e direta.'
  }

  if (profile.depth === 'moderate') {
    return 'Sua venda tem alguma complexidade: vale a pena garantir descoberta e critérios claros antes de apresentar preço.'
  }

  return 'Sua venda exige mais alinhamento porque várias pessoas e processos participam da decisão.'
}

export interface ChapterSummaryBlock {
  key: string
  title: string
  items: string[]
}

function yesNo(value: boolean | null | undefined, empty = 'não informado'): string {
  if (value === true) return 'sim'
  if (value === false) return 'não'
  return empty
}

export function buildChapterSummary(chapterId: string, data: CommercialMethodBuilderData): ChapterSummaryBlock[] {
  const profile = data.company_profile
  const process = data.current_sales_process
  const rules = data.commercial_rules

  if (chapterId === 'company') {
    return [
      {
        key: 'offer',
        title: 'O que você vende',
        items: [
          `Formato: ${profile.offer.type || 'não informado'}`,
          `Principais ofertas: ${labelList(profile.offer.main_offerings)}`,
          `Recorrência: ${profile.offer.purchase_frequency === 'recurring' ? 'compra recorrente' : profile.offer.purchase_frequency === 'both' ? 'compra única e recorrente' : profile.offer.purchase_frequency === 'one_time' ? 'compra única' : 'não informado'}`,
          `Planos ou pacotes: ${yesNo(profile.offer.has_plans_or_packages)}`,
        ],
      },
      {
        key: 'base_comercial',
        title: 'Base comercial',
        items: [
          `Formas de pagamento: ${labelList(rules.payment.methods)}`,
          `Desconto: ${rules.discounts.policy || 'não informado'}`,
          `Contrato: ${yesNo(rules.contracts.uses_contract)}`,
        ],
      },
    ]
  }

  if (chapterId === 'buyers') {
    return [
      {
        key: 'buyers',
        title: 'Como seus clientes compram',
        items: [
          `Cliente: ${profile.customer.buyer_type || 'não informado'}`,
          `Canais: ${labelList([...profile.channels, ...profile.other_channels])}`,
          `Tempo típico até a decisão: ${profile.complexity.typical_timing || 'não informado'}`,
          `Quem decide costuma ser quem conversa com o vendedor: ${profile.buyer_behavior?.contact_is_decision_maker || 'não informado'}`,
        ],
      },
    ]
  }

  if (chapterId === 'sales_today') {
    return [
      {
        key: 'sales_today',
        title: 'Como sua equipe vende hoje',
        items: [
          `Precisa entender o cliente antes de recomendar: ${process.discovery_depth?.needs_understanding_before_recommending === true ? 'sim' : process.discovery_depth?.needs_understanding_before_recommending === false ? 'não' : 'não informado'}`,
          `Momentos antes da decisão: ${labelList(profile.complexity.sales_events)}`,
          `Quando o preço é apresentado: ${process.pricing_flow?.timing || 'não informado'}`,
          `Objeções que bloqueiam a venda: ${labelList(process.objections?.blocking_objections ?? [])}`,
        ],
      },
    ]
  }

  if (chapterId === 'decision') {
    return [
      {
        key: 'decision',
        title: 'Como seus clientes decidem',
        items: [
          `Fato que mostra decisão real: ${process.decision_evidence?.real_decision_fact || 'não informado'}`,
          `Formalização: ${labelList(process.formalization?.steps ?? [])}`,
          `Existe follow-up: ${yesNo(process.follow_up.happens)}`,
          `Motivos comuns de perda: ${labelList(process.losses)}`,
        ],
      },
    ]
  }

  return []
}
