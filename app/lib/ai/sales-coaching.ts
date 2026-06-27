import type {
    AISalesContext,
    AISalesSuggestion,
  } from '@/app/types/ai-sales'
  import type { AICoaching } from '@/app/types/ai-coaching'
  
  type GenerateSalesCoachingInput = {
    context: AISalesContext
    conversationText: string
    suggestion: AISalesSuggestion
  }
  
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  
  const OPENAI_COACHING_MODEL =
    process.env.OPENAI_COACHING_MODEL ||
    process.env.OPENAI_MODEL ||
    'gpt-5.4-mini'
  
  function normalizeText(
    value: unknown,
    maxLength = 900
  ): string | null {
    if (typeof value !== 'string') {
      return null
    }
  
    const normalized = value.replace(/\s+/g, ' ').trim()
  
    if (!normalized) {
      return null
    }
  
    return normalized.slice(0, maxLength)
  }
  
  function normalizeList(
    value: unknown,
    maxItems = 6
  ): string[] {
    if (!Array.isArray(value)) {
      return []
    }
  
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, maxItems)
  }
  
  function normalizeForCompare(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  
  function isGenericSuggestedMessage(
    value: string | null
  ): boolean {
    if (!value) {
      return false
    }
  
    const normalized = normalizeForCompare(value)
  
    const genericPatterns = [
      'fico a disposicao',
      'qualquer duvida',
      'estou aqui para ajudar',
      'melhor decisao',
      'tomarem a melhor decisao',
      'me chama quando quiser',
      'me avise se precisar',
    ]
  
    return genericPatterns.some((pattern) =>
      normalized.includes(pattern)
    )
  }
  
  function sanitizeCoaching(raw: unknown): AICoaching | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null
    }
  
    const data = raw as Record<string, unknown>
  
    const conversationSummary = normalizeText(
      data.conversation_summary,
      1400
    )
  
    if (!conversationSummary) {
      return null
    }
  
    const suggestedMessage = normalizeText(
      data.suggested_message,
      900
    )
  
    return {
      conversation_summary: conversationSummary,
      customer_interests: normalizeList(
        data.customer_interests
      ),
      objections: normalizeList(data.objections),
      what_went_well: normalizeList(data.what_went_well),
      what_to_improve: normalizeList(data.what_to_improve),
      recommended_next_approach: normalizeText(
        data.recommended_next_approach,
        800
      ),
      suggested_message: isGenericSuggestedMessage(
        suggestedMessage
      )
        ? null
        : suggestedMessage,
    }
  }
  
  function buildSystemPrompt(): string {
    return [
      'Você é um consultor comercial experiente.',
      'Analise uma conversa completa entre vendedor e cliente.',
      'Retorne somente JSON válido.',
      'Nunca escreva texto fora do JSON.',
      'Você não decide estágio do funil.',
      'A decisão final do Yolen será enviada como contexto e deve ser respeitada.',
      'Não invente descontos, produtos, promessas, datas, condições ou fatos.',
      'Não critique o vendedor de forma pessoal.',
      'Não use frases genéricas de coaching.',
      'Não recomende pressionar, manipular ou constranger o cliente.',
      '',
      'A conversa pode ser longa.',
      'Você deve analisar a evolução inteira, mas dar peso maior ao terço final.',
      'O resumo precisa explicar como a conversa começou, os avanços concretos e qual é a situação comercial atual.',
      'Priorize acontecimentos que alteraram a probabilidade de venda, como visita, aula experimental, proposta, comparação, negociação de valor, contrato, decisão com outra pessoa e pedido final do cliente.',
      '',
      'Use valores, produtos, prazos, formatos de pagamento, visitas e experiências somente quando estiverem explicitamente mencionados.',
      'Não transforme objeções antigas em objeções ativas se elas já foram resolvidas ou perderam relevância.',
      'Objeções ativas são apenas os pontos que ainda impedem a decisão no final da conversa.',
      '',
      'Retorne obrigatoriamente os campos:',
      'conversation_summary, customer_interests, objections, what_went_well, what_to_improve, recommended_next_approach, suggested_message.',
      '',
      'conversation_summary:',
      'Escreva entre quatro e seis frases curtas.',
      'Inclua contexto inicial, evolução, ações concretas realizadas, proposta atual e desfecho pendente.',
      'Explique claramente o que o cliente pediu ou decidiu por último.',
      '',
      'customer_interests:',
      'Liste de três a seis critérios reais que influenciam a compra agora.',
      'Priorize necessidades, rotina, formato de treino, acompanhamento, localização, flexibilidade e faixa de valor quando mencionados.',
      '',
      'objections:',
      'Liste apenas objeções ainda ativas no final da conversa.',
      'Inclua preço, timing financeiro, contrato, comparação, decisão com cônjuge ou medo de adesão apenas quando ainda forem relevantes.',
      '',
      'what_went_well:',
      'Liste ações concretas do vendedor e o efeito que elas tiveram.',
      'Evite frases vagas como “fez boas perguntas”.',
      'Exemplo de qualidade: “A visita presencial reduziu a objeção de acesso porque a cliente percebeu que consegue ir direto do trabalho.”',
      '',
      'what_to_improve:',
      'Liste somente oportunidades de melhoria realmente comprovadas pela conversa.',
      'Nunca recomende algo que o vendedor já executou.',
      'Evite frases vagas como “ser mais proativo” ou “reforçar benefícios”.',
      'Se não houver melhoria concreta, retorne uma lista vazia.',
      '',
      'recommended_next_approach:',
      'Informe a melhor ação comercial imediata, baseada na última solicitação do cliente.',
      'Se o vendedor prometeu enviar proposta, comparação ou documento e ainda não entregou na conversa, a orientação deve ser entregar esse material.',
      'Se não houver ação pendente do vendedor e o cliente disse que vai retornar, a orientação deve ser aguardar sem criar pressão.',
      '',
      'suggested_message:',
      'Retorne uma mensagem curta, natural e específica para a ação imediata.',
      'Ela precisa mencionar o assunto exato que ficou pendente.',
      'Nunca escreva mensagens genéricas como “fico à disposição”, “qualquer dúvida” ou “me chama quando quiser”.',
      'Se a melhor conduta for aguardar porque o cliente disse que retornará, retorne null.',
      'Se o ciclo estiver em GANHO ou PERDIDO, retorne null.',
    ].join(' ')
  }
  
  export async function generateSalesCoaching(
    input: GenerateSalesCoachingInput
  ): Promise<AICoaching> {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY ausente.')
    }
  
    const safeContext = {
      cycle_id: input.context.cycle_id,
      current_status: input.context.current_status,
      lead_name: input.context.lead_name ?? null,
      current_group_name:
        input.context.current_group_name ?? null,
      current_next_action:
        input.context.current_next_action ?? null,
      current_next_action_date:
        input.context.current_next_action_date ?? null,
      recent_events: (
        input.context.recent_events ?? []
      ).map((event) => ({
        event_type: event.event_type,
        occurred_at: event.occurred_at,
        from_status: event.from_status ?? null,
        to_status: event.to_status ?? null,
        action_result: event.action_result ?? null,
        result_detail: event.result_detail ?? null,
        next_action: event.next_action ?? null,
        next_action_date: event.next_action_date ?? null,
        lost_reason: event.lost_reason ?? null,
      })),
    }
  
    const yolenDecision = {
      recommended_status: input.suggestion.recommended_status,
      confidence: input.suggestion.confidence,
      action_result: input.suggestion.action_result,
      result_detail: input.suggestion.result_detail,
      next_action: input.suggestion.next_action,
      next_action_date: input.suggestion.next_action_date,
      summary: input.suggestion.summary,
      tags: input.suggestion.tags,
      reason_for_recommendation:
        input.suggestion.reason_for_recommendation,
    }
  
    const response = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_COACHING_MODEL,
          temperature: 0.2,
          response_format: {
            type: 'json_object',
          },
          messages: [
            {
              role: 'system',
              content: buildSystemPrompt(),
            },
            {
              role: 'user',
              content: JSON.stringify({
                yolen_decision: yolenDecision,
                context: safeContext,
                conversation_text: input.conversationText,
              }),
            },
          ],
        }),
      }
    )
  
    if (!response.ok) {
      throw new Error(`openai_http_${response.status}`)
    }
  
    const data = await response.json()
  
    const content = data?.choices?.[0]?.message?.content
  
    if (!content || typeof content !== 'string') {
      throw new Error('openai_empty_content')
    }
  
    let parsed: unknown
  
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new Error('openai_invalid_json')
    }
  
    const coaching = sanitizeCoaching(parsed)
  
    if (!coaching) {
      throw new Error('openai_invalid_coaching')
    }
  
    if (
      input.suggestion.recommended_status === 'ganho' ||
      input.suggestion.recommended_status === 'perdido'
    ) {
      coaching.suggested_message = null
    }
  
    return coaching
  }