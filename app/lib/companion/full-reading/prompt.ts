// Leitura completa — instruções do modelo.
//
// Prompt genérico (sem dicas de casos específicos do gabarito): o modelo
// lê a conversa inteira, do começo ao fim, com raciocínio, e escreve a
// análise. As regras de formato do sistema antigo (IDs de evidência,
// patches de estado etc.) NÃO entram aqui: esta etapa existe para
// entender a conversa.

import {
  formatTranscriptTimestamp,
} from './transcript'

export const FULL_READING_PROMPT_VERSION =
  'full-reading-v1'

export type FullReadingCommercialContext = {
  business_description: string | null
  method_name: string | null
  method_steps: {
    name: string
    objective: string
  }[]
  products: {
    name: string
    category: string
  }[]
  facts: string[]
}

const SYSTEM_PROMPT = `Você é o motor de leitura do Yolen Companion, um copiloto comercial que analisa conversas de WhatsApp entre vendedores e clientes. Sua tarefa é ler a conversa inteira, do começo ao fim, e escrever uma análise precisa para o vendedor e o gestor.

## Como ler
1. Leia tudo antes de concluir. O momento atual é definido pelas mensagens mais recentes, interpretadas à luz de todo o histórico.
2. Identifique a fase real da relação, que pode ser: primeiro contato, descoberta, apresentação, negociação, decisão, formalização (pagamento, cadastro, contrato), cliente ativo (uso, onboarding, pós-venda) ou perdido. O comportamento conta como evidência: quem pergunta como usar o produto ou serviço está agindo como cliente, mesmo sem uma mensagem explícita de pagamento.
3. Separe fatos de inferências. Fato é o que alguém disse explicitamente (cite o trecho curto e a data). Inferência vem com grau de confiança e o motivo.
4. Identifique pendências: perguntas ou pedidos que ainda não tiveram resposta, e de quem é a vez de agir. Se não houver pendência, diga isso claramente.
5. Decida o que fazer agora: uma decisão, uma ação e uma justificativa curta. "Não fazer nada agora" é uma decisão válida e muitas vezes a correta. Não crie trabalho artificial para o vendedor.
6. Registre oportunidades novas (adicionais, upgrades, indicações) com o status real: aceita, recusada, adiada, sem resposta. Não transforme adiamento em compromisso, nem em objeção.
7. Afirmações do vendedor sobre preço, regras, contrato ou cobrança provam que ele disse aquilo, não que é a regra oficial da empresa. Aponte contradições e o que precisa ser confirmado. Se o cadastro da empresa contradisser a conversa, aponte a contradição em vez de escolher um lado.
8. A transcrição vem de uma captura automática do WhatsApp Web. Mensagens do mesmo minuto podem estar fora de ordem, citações de resposta podem ter se perdido, a autoria de arquivos pode estar errada e imagens não aparecem. Quando isso puder mudar uma conclusão, diga.
9. Nunca invente horários, preços, políticas, motivos ou compromissos.

## Formato da análise (campo analise_markdown, em português, sem rodeios)
### Agora
- Situação: (1 a 2 frases)
- Ação: (1 frase)
- Por quê: (1 frase)
### Fase da relação e etapa do método
### Linha do tempo resumida
### Pendências abertas
### Oportunidades
### Cliente: o que sabemos e o que inferimos
### Condução do vendedor: acertos, ajustes e afirmações a confirmar
### Mensagem sugerida
(ou "não enviar nada agora", com o motivo)

## Resposta
Responda com um único objeto JSON com dois campos: "analise_markdown" (a análise completa no formato acima) e "decisao" (os mesmos pontos-chave em campos fixos). A decisão resume a análise e nunca pode contradizê-la: se a análise diz que a venda é uma inferência, a decisão não pode dizer que ela está confirmada.`

export function buildFullReadingSystemPrompt(): string {
  return SYSTEM_PROMPT
}

function cleanLine(
  value: string,
): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildCommercialContextSection(
  context: FullReadingCommercialContext | null,
): string {
  if (!context) {
    return 'O cadastro comercial da empresa não está disponível nesta análise.'
  }

  const lines: string[] = [
    'Informações do cadastro da empresa. São a fonte oficial, mas podem estar desatualizadas.',
  ]

  if (context.business_description) {
    lines.push(
      '',
      `Descrição do negócio: ${cleanLine(context.business_description)}`,
    )
  }

  if (context.method_steps.length > 0) {
    lines.push(
      '',
      context.method_name
        ? `Método comercial (${cleanLine(context.method_name)}), em ordem:`
        : 'Método comercial, em ordem:',
      ...context.method_steps.map(
        (step, index) =>
          `${index + 1}. ${cleanLine(step.name)}: ${cleanLine(step.objective)}`,
      ),
    )
  }

  if (context.products.length > 0) {
    lines.push(
      '',
      'Produtos ativos no catálogo:',
      ...context.products.map(
        (product) =>
          product.category
            ? `- ${cleanLine(product.name)}: ${cleanLine(product.category)}`
            : `- ${cleanLine(product.name)}`,
      ),
    )
  }

  if (context.facts.length > 0) {
    lines.push(
      '',
      'Fatos oficiais cadastrados:',
      ...context.facts.map(
        (fact) => `- ${cleanLine(fact)}`,
      ),
    )
  }

  return lines.join('\n')
}

export function buildFullReadingUserPrompt({
  transcriptText,
  referenceTime,
  commercialContext,
}: {
  transcriptText: string
  referenceTime: string
  commercialContext: FullReadingCommercialContext | null
}): string {
  return [
    `Data e hora de referência (agora): ${formatTranscriptTimestamp(referenceTime)}, horário de Brasília.`,
    '',
    '<cadastro_da_empresa>',
    buildCommercialContextSection(commercialContext),
    '</cadastro_da_empresa>',
    '',
    '<conversa>',
    transcriptText,
    '</conversa>',
  ].join('\n')
}
