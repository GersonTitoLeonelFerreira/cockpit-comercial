// Leitura completa no painel (HML): só existe com
// COMPANION_FULL_READING_PANEL=on E VERCEL_ENV=preview. Módulo leve, sem
// dependência do resto da leitura, para rotas que só precisam saber se a
// flag está ligada (ex.: resolve-lead, successor-opportunity).

export type FullReadingFlagEnv =
  Record<string, string | undefined>

// Regra global (só preview), sem usuário. Continua igual para os pontos que
// ainda não recebem o usuário e para as filas; em produção é sempre falsa.
export function isFullReadingPanelEnabled(
  env: FullReadingFlagEnv = process.env,
): boolean {
  return (
    env.COMPANION_FULL_READING_PANEL === 'on' &&
    env.VERCEL_ENV === 'preview'
  )
}

// Rodada 15: botão de produção por usuário.
// - preview: COMPANION_FULL_READING_PANEL=on liga para qualquer usuário
//   (igual à regra global);
// - production: liga só com a flag on E o usuário na lista
//   COMPANION_FULL_READING_SELLER_IDS (UUIDs separados por vírgula);
// - qualquer outro ambiente: desligado.
const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function normalizeUserId(
  value: unknown,
): string | null {
  const id =
    typeof value === 'string' ? value.trim().toLowerCase() : ''

  return USER_ID_PATTERN.test(id) ? id : null
}

// Lista vazia ou ausente: ninguém. Entrada que não é UUID é ignorada.
export function parseFullReadingSellerIds(
  raw: string | undefined,
): Set<string> {
  const ids =
    new Set<string>()

  for (const entry of String(raw ?? '').split(',')) {
    const id =
      normalizeUserId(entry)

    if (id) {
      ids.add(id)
    }
  }

  return ids
}

export function isFullReadingEnabledForUser({
  env = process.env,
  userId,
}: {
  env?: FullReadingFlagEnv
  userId: unknown
}): boolean {
  if (env.COMPANION_FULL_READING_PANEL !== 'on') {
    return false
  }

  if (env.VERCEL_ENV === 'preview') {
    return true
  }

  if (env.VERCEL_ENV !== 'production') {
    return false
  }

  const id =
    normalizeUserId(userId)

  return id !== null &&
    parseFullReadingSellerIds(env.COMPANION_FULL_READING_SELLER_IDS).has(id)
}

// Economia de créditos (rodada 7): com a leitura completa ligada, as quatro
// abas usam só a leitura completa. O caminho antigo que chamava a IA em
// segundo plano (análise stateful da fila companion-deep-analysis-v3,
// resumo do lead, method-guidance e o Message Intelligence que ele
// enfileira, prévia de "Registrar conversa", prévia do diagnóstico V2) não
// roda: a rota responde sem chamar a IA e o consumidor da fila reconhece a
// mensagem sem processar. Captura, Relacionamento, SLA e kanban não usam IA
// e continuam. Com a flag desligada, nada disso muda.
// Regra global (só preview), como isFullReadingPanelEnabled: as rotas
// antigas e as filas ainda não recebem o usuário.
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
