import type {
    AnalyzeConversationRequest,
    AnalyzeConversationResponse,
    AISalesSuggestion,
    AISalesContext,
  } from '@/app/types/ai-sales'
  
  export async function analyzeConversation(
    payload: AnalyzeConversationRequest
  ): Promise<{
    context: AISalesContext
    suggestion: AISalesSuggestion
  }> {
    const res = await fetch('/api/ai/analyze-conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  
    const json = (await res.json()) as AnalyzeConversationResponse
  
    if (!res.ok || !json.ok || !json.data) {
      throw new Error(json.error || 'Falha ao analisar conversa com IA.')
    }
  
    return json.data
  }