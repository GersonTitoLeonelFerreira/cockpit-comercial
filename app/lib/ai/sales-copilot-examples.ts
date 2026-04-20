import type { LeadStatus } from '@/app/types/sales_cycles'
import { getSalesCycleLabel } from '@/app/lib/sales-cycle-status'

export type SalesCopilotStageExample = {
  id: string
  recommended_status: LeadStatus
  conversation_excerpt: string
  expected_next_action: string | null
  reason: string
}

export const SALES_COPILOT_STAGE_EXAMPLES: SalesCopilotStageExample[] = [
  {
    id: 'contato-1',
    recommended_status: 'contato',
    conversation_excerpt: 'Enviei mensagem no WhatsApp, mas ela visualizou e não respondeu.',
    expected_next_action: 'Nova tentativa de contato',
    reason: 'Houve tentativa de contato, mas ainda sem continuidade concreta do lead.',
  },
  {
    id: 'contato-2',
    recommended_status: 'contato',
    conversation_excerpt: 'Liguei duas vezes e não atendeu. Também mandei mensagem e ficou sem resposta.',
    expected_next_action: 'Nova tentativa de contato',
    reason: 'Existe esforço de contato registrado, porém sem resposta real.',
  },
  {
    id: 'agenda-1',
    recommended_status: 'respondeu',
    conversation_excerpt: 'Cliente respondeu e pediu para eu retornar amanhã às 14h para continuar a conversa.',
    expected_next_action: 'Confirmar agenda / próximo passo',
    reason: 'No sistema, respondeu é o nome interno da etapa visual AGENDA. Houve resposta com próximo passo concreto.',
  },
  {
    id: 'agenda-2',
    recommended_status: 'respondeu',
    conversation_excerpt: 'Ela pediu os horários disponíveis e falou que quer passar aqui quarta-feira.',
    expected_next_action: 'Confirmar agenda / próximo passo',
    reason: 'Existe resposta real do lead com continuidade objetiva e possível visita/agendamento.',
  },
  {
    id: 'agenda-3',
    recommended_status: 'respondeu',
    conversation_excerpt: 'O cliente demonstrou interesse e pediu mais informações para eu mandar ainda hoje.',
    expected_next_action: 'Confirmar agenda / próximo passo',
    reason: 'Houve resposta com continuidade concreta, mas ainda sem entrar em negociação comercial.',
  },
  {
    id: 'negociacao-1',
    recommended_status: 'negociacao',
    conversation_excerpt: 'Cliente achou caro e pediu desconto para fechar ainda hoje.',
    expected_next_action: 'Retornar negociação',
    reason: 'Entrou em objeção de preço e condição comercial.',
  },
  {
    id: 'negociacao-2',
    recommended_status: 'negociacao',
    conversation_excerpt: 'Ele pediu nova proposta com parcelamento e quer comparar com a academia concorrente.',
    expected_next_action: 'Retornar negociação',
    reason: 'Já existe proposta, condição comercial e comparação concorrencial.',
  },
  {
    id: 'negociacao-3',
    recommended_status: 'negociacao',
    conversation_excerpt: 'A cliente pediu o valor do plano, perguntou sobre fidelidade e disse que vai pensar até sexta.',
    expected_next_action: 'Retornar negociação',
    reason: 'A conversa já entrou em preço, condição e prazo de decisão.',
  },
  {
    id: 'ganho-1',
    recommended_status: 'ganho',
    conversation_excerpt: 'Cliente confirmou pagamento e disse que já pode fazer o cadastro.',
    expected_next_action: null,
    reason: 'Há evidência explícita de fechamento.',
  },
  {
    id: 'ganho-2',
    recommended_status: 'ganho',
    conversation_excerpt: 'Contrato assinado e matrícula confirmada.',
    expected_next_action: null,
    reason: 'Há evidência explícita de fechamento concluído.',
  },
  {
    id: 'perdido-1',
    recommended_status: 'perdido',
    conversation_excerpt: 'Cliente disse que fechou com concorrente.',
    expected_next_action: null,
    reason: 'Há evidência explícita de perda.',
  },
  {
    id: 'perdido-2',
    recommended_status: 'perdido',
    conversation_excerpt: 'Ela falou que não tem interesse e pediu para não entrar mais em contato.',
    expected_next_action: null,
    reason: 'Há desinteresse definitivo e encerramento negativo claro.',
  },
]

export function getSalesCopilotExamplesByStatus(status: LeadStatus): SalesCopilotStageExample[] {
  return SALES_COPILOT_STAGE_EXAMPLES.filter((example) => example.recommended_status === status)
}

export function buildSalesCopilotExamplesGuide(): string {
  return [
    'Exemplos reais de classificação operacional:',
    ...SALES_COPILOT_STAGE_EXAMPLES.map((example) => {
      const visualLabel = getSalesCycleLabel(example.recommended_status)
      return [
        `[${visualLabel}]`,
        `Exemplo: "${example.conversation_excerpt}"`,
        `Motivo: ${example.reason}`,
        example.expected_next_action ? `Próxima ação esperada: ${example.expected_next_action}` : '',
      ]
        .filter(Boolean)
        .join(' ')
    }),
  ].join(' ')
}