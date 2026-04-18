import type { LeadStatus } from '@/app/types/sales_cycles'

export const OPEN_SALES_CYCLE_STATUSES: LeadStatus[] = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'pausado',
]

export const TERMINAL_SALES_CYCLE_STATUSES: LeadStatus[] = [
  'ganho',
  'perdido',
  'cancelado',
]

export const SALES_CYCLE_VISUAL_LABELS: Record<LeadStatus, string> = {
  novo: 'NOVO',
  contato: 'CONTATO',
  respondeu: 'AGENDA',
  negociacao: 'NEGOCIAÇÃO',
  pausado: 'PAUSADO',
  ganho: 'GANHO',
  perdido: 'PERDIDO',
  cancelado: 'CANCELADO',
}

export const SALES_CYCLE_OPERATIONAL_MEANINGS: Record<LeadStatus, string> = {
  novo:
    'Lead ainda sem avanço real. Pode ter acabado de entrar ou ainda não houve tentativa concreta registrada.',
  contato:
    'Houve tentativa de contato, mas ainda sem continuidade concreta do lead. Exemplo: mensagem enviada, ligação sem resposta, visualizou e não respondeu.',
  respondeu:
    'Nome interno da etapa visual AGENDA. Use quando o lead respondeu e existe continuidade objetiva. Exemplo: pediu informações, confirmou interesse, pediu retorno, marcou visita, alinhou horário ou existe próximo passo concreto.',
  negociacao:
    'Use quando a conversa entrou em discussão comercial. Exemplo: preço, plano, proposta, objeção, desconto, condição, parcelamento, comparação com concorrente ou prazo para decidir.',
  pausado:
    'Ciclo temporariamente congelado por motivo operacional ou estratégico. Não é ganho nem perdido.',
  ganho:
    'Fechamento concluído com evidência explícita.',
  perdido:
    'Perda concluída com evidência explícita.',
  cancelado:
    'Ciclo encerrado administrativamente.',
}

export function getSalesCycleLabel(status: LeadStatus): string {
  return SALES_CYCLE_VISUAL_LABELS[status] ?? status.toUpperCase()
}

export function getSalesCycleOperationalMeaning(status: LeadStatus): string {
  return SALES_CYCLE_OPERATIONAL_MEANINGS[status] ?? status
}

export function buildSalesCycleAIGuide(): string {
  return [
    'Guia operacional do funil:',
    `- ${getSalesCycleLabel('novo')}: ${getSalesCycleOperationalMeaning('novo')}`,
    `- ${getSalesCycleLabel('contato')}: ${getSalesCycleOperationalMeaning('contato')}`,
    `- ${getSalesCycleLabel('respondeu')} (nome interno: respondeu): ${getSalesCycleOperationalMeaning('respondeu')}`,
    `- ${getSalesCycleLabel('negociacao')}: ${getSalesCycleOperationalMeaning('negociacao')}`,
    `- ${getSalesCycleLabel('pausado')}: ${getSalesCycleOperationalMeaning('pausado')}`,
    `- ${getSalesCycleLabel('ganho')}: ${getSalesCycleOperationalMeaning('ganho')}`,
    `- ${getSalesCycleLabel('perdido')}: ${getSalesCycleOperationalMeaning('perdido')}`,
    'Regra crítica: no sistema, o nome interno "respondeu" é mostrado ao usuário como "AGENDA".',
    'Se houve resposta do lead com próximo passo concreto, retorno combinado, visita alinhada, pedido de horários ou continuidade objetiva, normalmente a etapa correta é respondeu/AGENDA.',
    'Se a conversa já entrou em preço, proposta, condição comercial, objeção, desconto, concorrente ou prazo de decisão, normalmente a etapa correta é negociacao.',
    'Não use ganho ou perdido sem evidência explícita.',
  ].join(' ')
}