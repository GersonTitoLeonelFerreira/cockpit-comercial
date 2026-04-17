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

  const rawText = await res.text()

  let json: AnalyzeConversationResponse | null = null

  try {
    json = JSON.parse(rawText) as AnalyzeConversationResponse
  } catch {
    throw new Error(
      `A rota /api/ai/analyze-conversation não retornou JSON válido. Status: ${res.status}. Resposta: ${rawText.slice(0, 300)}`
    )
  }

  if (!res.ok || !json.ok || !json.data) {
    throw new Error(json.error || 'Falha ao analisar conversa com IA.')
  }

  return json.data
}