// Leitura completa no painel (HML): só existe com
// COMPANION_FULL_READING_PANEL=on E VERCEL_ENV=preview. Módulo leve, sem
// dependência do resto da leitura, para rotas que só precisam saber se a
// flag está ligada (ex.: resolve-lead, successor-opportunity).

export type FullReadingFlagEnv =
  Record<string, string | undefined>

export function isFullReadingPanelEnabled(
  env: FullReadingFlagEnv = process.env,
): boolean {
  return (
    env.COMPANION_FULL_READING_PANEL === 'on' &&
    env.VERCEL_ENV === 'preview'
  )
}

// Economia de créditos (rodada 7): com a leitura completa ligada, as quatro
// abas usam só a leitura completa. O caminho antigo que chamava a IA em
// segundo plano (análise stateful da fila companion-deep-analysis-v3,
// resumo do lead, method-guidance e o Message Intelligence que ele
// enfileira, prévia de "Registrar conversa", prévia do diagnóstico V2) não
// roda: a rota responde sem chamar a IA e o consumidor da fila reconhece a
// mensagem sem processar. Captura, Relacionamento, SLA e kanban não usam IA
// e continuam. Com a flag desligada, nada disso muda.
export const LEGACY_AI_DISABLED_CODE =
  'LEGACY_AI_DISABLED'

export const LEGACY_AI_DISABLED_MESSAGE =
  'Esta função antiga está desligada: o painel usa a leitura completa.'

export function isLegacyCompanionAiDisabled(
  env: FullReadingFlagEnv = process.env,
): boolean {
  return isFullReadingPanelEnabled(env)
}

// Só o nome da rota: nenhum dado de conversa.
export function logLegacyAiSkipped(
  route: string,
): void {
  console.info(
    'YOLEN_LEGACY_AI_SKIPPED',
    JSON.stringify({ route }),
  )
}

export function legacyAiDisabledBody(): {
  ok: false
  code: typeof LEGACY_AI_DISABLED_CODE
  error: string
} {
  return {
    ok: false,
    code: LEGACY_AI_DISABLED_CODE,
    error: LEGACY_AI_DISABLED_MESSAGE,
  }
}
