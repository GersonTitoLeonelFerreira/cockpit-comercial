// Leitura completa — instruções do modelo.
//
// Prompt genérico (sem dicas de casos específicos do gabarito): o modelo
// lê a conversa inteira, do começo ao fim, com raciocínio, e escreve a
// análise. As regras de formato do sistema antigo (IDs de evidência,
// patches de estado etc.) NÃO entram aqui: esta etapa existe para
// entender a conversa.
//
// v2: o modelo também recebe a etapa do kanban do Yolen (o que a equipe
// registrou) e devolve a etapa que a conversa indica. Ganho e perdido são
// só sugestões: o fechamento continua no Yolen, com confirmação do
// vendedor.
//
// v3: contradição entre o vendedor e o cadastro oficial que muda o que o
// cliente paga ou recebe entra na Ação; a decisão traz o cliente em fatos,
// inferências e pontos a confirmar, e o fechamento ganha campos
// codificados (valor total, forma e tipo de pagamento) para o modal de
// ganho, sem interpretar texto livre.

import {
  formatTranscriptTimestamp,
} from './transcript'

export const FULL_READING_PROMPT_VERSION =
  'full-reading-v3'

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

// Etapa do ciclo no kanban do Yolen, como a equipe registrou. Só traz o
// que existe na tabela; campos de fechamento só quando a etapa é aquela.
export type FullReadingKanbanContext = {
  status: string
  label: string
  stage_entered_at: string | null
  next_action: string | null
  next_action_date: string | null
  won: {
    won_at: string | null
    won_total: number | null
    product_name: string | null
    payment_method: string | null
    payment_type: string | null
    installments_count: number | null
  } | null
  lost: {
    lost_at: string | null
    lost_reason: string | null
  } | null
  paused: {
    paused_reason: string | null
  } | null
  canceled: {
    canceled_at: string | null
    canceled_reason: string | null
  } | null
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
10. Quando uma afirmação do vendedor contradiz o cadastro oficial e muda o que o cliente paga ou recebe (preço, o que o plano inclui, regra de cobrança), essa verificação interna entra na Ação principal: diga o que verificar e use acao_agora "verificacao_interna" quando ela for a ação principal. Se o cadastro estiver certo, corrigir a informação com o cliente é o próximo passo, e a Ação diz isso.

## Kanban do Yolen
A seção <kanban_do_yolen> traz a etapa em que a equipe registrou esta oportunidade. Etapas possíveis (rótulo e nome interno): NOVO (novo), CONTATO (contato), AGENDA (respondeu), NEGOCIAÇÃO (negociacao), PAUSADO (pausado), GANHO (ganho), PERDIDO (perdido). CANCELADO (cancelado) é um encerramento administrativo e nunca é sugerido.
1. O kanban é o que a equipe registrou e pode estar atrasado ou errado. Compare com a conversa. Se divergirem, diga isso na análise e sugira a etapa certa; se estiver certo, repita a etapa atual.
2. Kanban em GANHO é venda confirmada pela equipe: venda_concluida é "confirmada" e a relação está no pós-venda. Nunca sugira retomar a negociação do que já foi vendido; adicionais e upgrades continuam como oportunidades.
3. PERDIDO ou CANCELADO é oportunidade encerrada. Só sugira reabrir se o cliente escreveu depois do encerramento com interesse novo; sem isso, não proponha ação comercial.
4. AGENDA só quando existe um compromisso futuro concreto, com data e hora, aceito pelos dois lados.
5. GANHO só quando a venda está confirmada ou é provável pela conversa; PERDIDO só quando a relação está perdida. Quem registra o fechamento no Yolen é o vendedor, depois de confirmar.
6. Nunca invente valor, plano ou forma de pagamento. Os dados de fechamento só levam o que foi dito na conversa; o que não foi dito fica vazio.

## Formato da análise (campo analise_markdown, em português, sem rodeios)
### Agora
- Situação: (1 a 2 frases)
- Ação: (1 frase)
- Por quê: (1 frase)
### Fase da relação e etapa do método
(inclua a comparação com o kanban: a etapa registrada está certa, atrasada ou errada, e por quê)
### Linha do tempo resumida
### Pendências abertas
### Oportunidades
### Cliente: o que sabemos e o que inferimos
### Condução do vendedor: acertos e ajustes
(as afirmações a confirmar vão só no campo afirmacoes_a_confirmar da decisão, não repita a lista aqui)
### Mensagem sugerida
(somente o texto pronto para o vendedor enviar, no tom do WhatsApp, sem aspas e sem comentários; ou "Não enviar nada agora." seguido do motivo)

## Resposta
Responda com um único objeto JSON com dois campos: "analise_markdown" (a análise completa no formato acima) e "decisao" (os mesmos pontos-chave em campos fixos). A decisão resume a análise e nunca pode contradizê-la: se a análise diz que a venda é uma inferência, a decisão não pode dizer que ela está confirmada.
Na decisão: situacao_resumo é a Situação da seção Agora (1 a 2 frases); etapa_kanban_sugerida é a etapa que a conversa indica (pode ser igual à atual); motivo_etapa é uma frase curta com a evidência (trecho curto e data); fechamento traz produto, valor, forma de pagamento e motivo da perda só quando ditos na conversa, e texto vazio quando não.
cliente separa, em frases curtas e com data quando houver: sabemos (o que o cliente disse ou fez), inferimos (interpretação, com o motivo) e a_confirmar (o que falta confirmar).
Campos codificados do fechamento, para o vendedor conferir no Yolen: valor_total é só o número do total combinado (ex.: "1.250,00"), ou texto vazio se não houver um total claro; forma_pagamento_codigo é "debito" só quando a conversa disser cartão de débito, cobrança mensal no cartão de crédito é "credito", e na dúvida é texto vazio; tipo_pagamento_codigo segue a mesma regra (mensalidade ou assinatura é "recorrente"). Os textos livres do fechamento continuam como dica para o vendedor.`

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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  credito: 'cartão de crédito',
  debito: 'cartão de débito',
  dinheiro: 'dinheiro',
  boleto: 'boleto',
  transferencia: 'transferência',
  misto: 'misto (mais de um meio)',
  outro: 'outro',
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  avista: 'à vista',
  entrada_parcelas: 'entrada + parcelas',
  parcelado_sem_entrada: 'parcelado sem entrada',
  recorrente: 'recorrente / mensalidade',
  outro: 'outro',
}

function formatKanbanDate(
  value: string | null,
): string | null {
  if (!value || Number.isNaN(Date.parse(value))) {
    return null
  }

  return formatTranscriptTimestamp(value)
}

function formatMoney(
  value: number | null,
): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function cleanOptional(
  value: string | null,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const clean =
    cleanLine(value)

  return clean.length > 0
    ? clean
    : null
}

export function buildKanbanSection(
  kanban: FullReadingKanbanContext | null,
): string {
  if (!kanban) {
    return 'A etapa do kanban não está disponível nesta análise.'
  }

  const lines: string[] = [
    'Registro da equipe no kanban do Yolen. Pode estar atrasado ou errado: compare com a conversa.',
    '',
    `Etapa atual: ${kanban.label} (nome interno: ${kanban.status})`,
  ]

  const enteredAt =
    formatKanbanDate(kanban.stage_entered_at)

  if (enteredAt) {
    lines.push(`Nessa etapa desde: ${enteredAt}`)
  }

  const nextAction =
    cleanOptional(kanban.next_action)

  if (nextAction) {
    const nextActionDate =
      formatKanbanDate(kanban.next_action_date)

    lines.push(
      nextActionDate
        ? `Próxima ação registrada: ${nextAction} (para ${nextActionDate})`
        : `Próxima ação registrada: ${nextAction}`,
    )
  } else {
    lines.push('Próxima ação registrada: nenhuma')
  }

  if (kanban.won) {
    const details = [
      formatKanbanDate(kanban.won.won_at)
        ? `registrada em ${formatKanbanDate(kanban.won.won_at)}`
        : null,
      formatMoney(kanban.won.won_total)
        ? `valor ${formatMoney(kanban.won.won_total)}`
        : null,
      cleanOptional(kanban.won.product_name)
        ? `produto ${cleanOptional(kanban.won.product_name)}`
        : null,
      kanban.won.payment_method
        ? `forma de pagamento ${PAYMENT_METHOD_LABELS[kanban.won.payment_method] ?? kanban.won.payment_method}`
        : null,
      kanban.won.payment_type
        ? `tipo de pagamento ${PAYMENT_TYPE_LABELS[kanban.won.payment_type] ?? kanban.won.payment_type}`
        : null,
      typeof kanban.won.installments_count === 'number'
        ? `${kanban.won.installments_count} parcela(s)`
        : null,
    ].filter((item): item is string => item !== null)

    lines.push(
      details.length > 0
        ? `Venda registrada pela equipe: ${details.join(', ')}.`
        : 'Venda registrada pela equipe, sem detalhes de fechamento.',
    )
  }

  if (kanban.lost) {
    const lostAt =
      formatKanbanDate(kanban.lost.lost_at)

    const reason =
      cleanOptional(kanban.lost.lost_reason)

    lines.push(
      [
        lostAt
          ? `Perda registrada em ${lostAt}.`
          : 'Perda registrada.',
        reason
          ? `Motivo: ${reason}.`
          : 'Motivo não informado.',
      ].join(' '),
    )
  }

  if (kanban.paused) {
    const reason =
      cleanOptional(kanban.paused.paused_reason)

    lines.push(
      reason
        ? `Motivo da pausa: ${reason}.`
        : 'Motivo da pausa não informado.',
    )
  }

  if (kanban.canceled) {
    const canceledAt =
      formatKanbanDate(kanban.canceled.canceled_at)

    const reason =
      cleanOptional(kanban.canceled.canceled_reason)

    lines.push(
      [
        canceledAt
          ? `Cancelado em ${canceledAt}.`
          : 'Cancelado.',
        reason
          ? `Motivo: ${reason}.`
          : 'Motivo não informado.',
      ].join(' '),
    )
  }

  return lines.join('\n')
}

export function buildFullReadingUserPrompt({
  transcriptText,
  referenceTime,
  commercialContext,
  kanban = null,
}: {
  transcriptText: string
  referenceTime: string
  commercialContext: FullReadingCommercialContext | null
  kanban?: FullReadingKanbanContext | null
}): string {
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
    '<conversa>',
    transcriptText,
    '</conversa>',
  ].join('\n')
}
