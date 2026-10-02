// Leitura completa — prompt do "Gerar mensagem" da aba MENSAGEM (HML).
//
// O Claude redige UMA mensagem a partir da conversa, da leitura completa
// já feita, do kanban, do cadastro e do objetivo do vendedor. A leitura é
// a referência: a mensagem não pode contradizê-la. Regras genéricas, sem
// dicas de casos específicos.

import {
  buildCommercialContextSection,
  buildKanbanSection,
  type FullReadingCommercialContext,
  type FullReadingKanbanContext,
} from './prompt'

import {
  formatTranscriptTimestamp,
} from './transcript'

export const FULL_READING_MESSAGE_PROMPT_VERSION =
  'full-reading-message-v1'

const SYSTEM_PROMPT = `Você redige mensagens de WhatsApp para vendedores no Yolen Companion. Já existe uma leitura completa desta conversa, feita por quem leu tudo do começo ao fim. Sua tarefa é escrever UMA mensagem que o vendedor possa enviar agora, a partir do objetivo dele.

## Regras
1. A leitura completa é a referência e você não pode contradizê-la. Respeite a fase da relação que ela identificou: cliente ativo não é lead frio, então não trate como prospecção nem pergunte se o interesse continua.
2. Não repita pergunta que o cliente já respondeu na conversa, nem peça informação que ele já deu.
3. O que está em "afirmações a confirmar" não é regra oficial: não apresente como certo preço, condição, regra de cobrança ou o que o plano inclui que esteja nessa lista.
4. Siga o objetivo do vendedor quando ele for compatível com a leitura. Se não for, escreva a versão compatível mais próxima.
5. Nunca invente preços, horários, condições, nomes ou fatos. Use só o que está na conversa, na leitura e no cadastro.
6. Uma mensagem curta, no tom do WhatsApp, em português, sem assinatura, sem aspas e sem comentários para o vendedor.
7. Quando a leitura traz como_conduzir, a mensagem aplica a técnica indicada e respeita o que ela diz para evitar.
8. Nunca repita CPF, documento, cartão ou dados bancários.

## Resposta
Responda com um único objeto JSON com o campo "mensagem" (o texto pronto para enviar).`

export const FULL_READING_MESSAGE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mensagem'],
  properties: {
    mensagem: {
      type: 'string',
      description:
        'A mensagem pronta para o vendedor enviar no WhatsApp.',
    },
  },
} as const

export function buildFullReadingMessageSystemPrompt(): string {
  return SYSTEM_PROMPT
}

export function buildFullReadingMessageUserPrompt({
  transcriptText,
  referenceTime,
  commercialContext,
  kanban,
  analysisMarkdown,
  decision,
  sellerIntent,
}: {
  transcriptText: string
  referenceTime: string
  commercialContext: FullReadingCommercialContext | null
  kanban: FullReadingKanbanContext | null
  // v5: null (a leitura é só a decisão).
  analysisMarkdown: string | null
  decision: Record<string, unknown>
  sellerIntent: string
}): string {
  const analysis =
    typeof analysisMarkdown === 'string'
      ? analysisMarkdown.trim()
      : ''

  return [
    `Data e hora de referência (agora): ${formatTranscriptTimestamp(referenceTime)}, horário de Brasília.`,
    '',
    '<cadastro_da_empresa>',
    buildCommercialContextSection(commercialContext),
    '</cadastro_da_empresa>',
    '',
    '<kanban_do_yolen>',
    buildKanbanSection(kanban),
    '</kanban_do_yolen>',
    '',
    '<leitura_completa>',
    ...(analysis ? [analysis, ''] : []),
    'Decisão da leitura (campos fixos):',
    JSON.stringify(decision, null, 2),
    '</leitura_completa>',
    '',
    '<conversa>',
    transcriptText,
    '</conversa>',
    '',
    '<objetivo_do_vendedor>',
    sellerIntent.trim(),
    '</objetivo_do_vendedor>',
  ].join('\n')
}

export class FullReadingMessageOutputError extends Error {
  readonly code = 'INVALID_MESSAGE_OUTPUT'

  constructor(message: string) {
    super(message)
    this.name = 'FullReadingMessageOutputError'
  }
}

export function parseFullReadingMessageOutput(
  text: string,
): string {
  const trimmed =
    text.trim()

  let parsed: unknown = null

  try {
    parsed = JSON.parse(trimmed)
  } catch {
    const start =
      trimmed.indexOf('{')

    const end =
      trimmed.lastIndexOf('}')

    if (start !== -1 && end > start) {
      try {
        parsed = JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        parsed = null
      }
    }
  }

  const message =
    parsed &&
    typeof parsed === 'object' &&
    typeof (parsed as { mensagem?: unknown }).mensagem === 'string'
      ? (parsed as { mensagem: string }).mensagem.trim()
      : ''

  if (!message) {
    throw new FullReadingMessageOutputError(
      'A resposta não trouxe uma mensagem.',
    )
  }

  return message
}
