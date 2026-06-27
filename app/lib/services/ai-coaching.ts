import type {
    AICoachingHistoryResponse,
    GenerateAICoachingRequest,
    GenerateAICoachingResponse,
    SaveAICoachingRequest,
    SaveAICoachingResponse,
  } from '@/app/types/ai-coaching'
  
  export async function generateAICoaching(
    payload: GenerateAICoachingRequest
  ): Promise<NonNullable<GenerateAICoachingResponse['data']>> {
    const res = await fetch('/api/ai/generate-coaching', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  
    const rawText = await res.text()
  
    let json: GenerateAICoachingResponse | null = null
  
    try {
      json = JSON.parse(rawText) as GenerateAICoachingResponse
    } catch {
      throw new Error(
        `A rota /api/ai/generate-coaching não retornou JSON válido. Status: ${res.status}.`
      )
    }
  
    if (!res.ok || !json.ok || !json.data) {
      throw new Error(
        json?.error ||
          'Falha ao gerar leitura comercial.'
      )
    }
  
    return json.data
  }
  
  export async function saveAICoaching(
    payload: SaveAICoachingRequest
  ): Promise<NonNullable<SaveAICoachingResponse['data']>> {
    const res = await fetch('/api/ai/save-coaching', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  
    const rawText = await res.text()
  
    let json: SaveAICoachingResponse | null = null
  
    try {
      json = JSON.parse(rawText) as SaveAICoachingResponse
    } catch {
      throw new Error(
        `A rota /api/ai/save-coaching não retornou JSON válido. Status: ${res.status}.`
      )
    }
  
    if (!res.ok || !json.ok || !json.data) {
      throw new Error(
        json?.error ||
          'Falha ao salvar leitura comercial.'
      )
    }
  
    return json.data
  }
  
  export async function getAICoachingHistory(
    cycleId: string
  ): Promise<
    NonNullable<AICoachingHistoryResponse['data']>
  > {
    const res = await fetch(
      `/api/ai/coaching-history?cycle_id=${encodeURIComponent(cycleId)}`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    )
  
    const rawText = await res.text()
  
    let json: AICoachingHistoryResponse | null = null
  
    try {
      json = JSON.parse(rawText) as AICoachingHistoryResponse
    } catch {
      throw new Error(
        `A rota /api/ai/coaching-history não retornou JSON válido. Status: ${res.status}.`
      )
    }
  
    if (!res.ok || !json.ok || !json.data) {
      throw new Error(
        json?.error ||
          'Falha ao buscar orientações salvas.'
      )
    }
  
    return json.data
  }