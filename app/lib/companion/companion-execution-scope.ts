// R10 — escopo explícito de execução da análise do Companion.
//
// HOMOLOG (Vercel Preview) e PRODUÇÃO usam o MESMO banco. Dados-fonte
// (mensagens, leads, ciclos, configuração comercial) são compartilhados e só
// lidos pela análise. Os RESULTADOS DERIVADOS (job de análise, estado
// comercial, Commercial Reading/eventos, etapa do método) pertencem a um
// escopo: cada escopo lê e escreve só o próprio armazenamento, então um job,
// uma recuperação de órfão, um lease ou um resultado de um ambiente nunca
// alcança o outro.
//
// O escopo vem do ambiente do deployment (VERCEL_ENV), nunca do commit: dois
// previews de commits diferentes são o mesmo HOMOLOG, e a produção é uma só.
// Registro legado (sem escopo) é produção — o homolog nunca o reivindica,
// porque nem enxerga o armazenamento de produção.

export const COMPANION_EXECUTION_SCOPES = [
  'production',
  'homolog',
] as const

export type CompanionExecutionScope =
  (typeof COMPANION_EXECUTION_SCOPES)[number]

export function isCompanionExecutionScope(
  value: unknown,
): value is CompanionExecutionScope {
  return (
    typeof value === 'string' &&
    COMPANION_EXECUTION_SCOPES.includes(
      value as CompanionExecutionScope,
    )
  )
}

type ExecutionScopeEnvironment = {
  VERCEL_ENV?: string | undefined
  COMPANION_EXECUTION_SCOPE?: string | undefined
  NODE_ENV?: string | undefined
}

// Vercel: production → produção; preview → homolog (a variável de override
// não vale aqui, para um preview nunca ser configurado como produção).
// Fora da Vercel: override explícito; senão `next dev` local é homolog (não
// pode escrever no que a produção lê) e o resto (testes, scripts) produção.
export function resolveCompanionExecutionScope(
  env: ExecutionScopeEnvironment = process.env,
): CompanionExecutionScope {
  const vercelEnvironment = String(env.VERCEL_ENV ?? '').trim()

  if (vercelEnvironment === 'production') {
    return 'production'
  }

  if (vercelEnvironment === 'preview') {
    return 'homolog'
  }

  const override = String(env.COMPANION_EXECUTION_SCOPE ?? '').trim()

  if (isCompanionExecutionScope(override)) {
    return override
  }

  return env.NODE_ENV === 'development' ? 'homolog' : 'production'
}

// Armazenamento derivado por escopo. Produção continua nas tabelas canônicas
// (o que a main já lê); homolog tem tabelas próprias com as mesmas
// constraints, índices únicos e one-running-per-conversation.
export const COMPANION_DERIVED_STORAGE = {
  analysis_jobs: 'companion_background_analysis_jobs',
  commercial_states: 'companion_commercial_states',
  commercial_state_events: 'companion_commercial_state_events',
  method_stage_state: 'companion_method_stage_state',
} as const

export type CompanionDerivedStorage = keyof typeof COMPANION_DERIVED_STORAGE

export function companionDerivedTable(
  storage: CompanionDerivedStorage,
  scope: CompanionExecutionScope,
): string {
  const table = COMPANION_DERIVED_STORAGE[storage]

  return scope === 'homolog' ? `${table}_homolog` : table
}

export const COMPANION_STATE_PERSISTENCE_RPC = {
  production: 'rpc_persist_stateful_copilot_state',
  homolog: 'rpc_persist_stateful_copilot_state_homolog',
} as const satisfies Record<CompanionExecutionScope, string>

export function companionStatePersistenceRpc(
  scope: CompanionExecutionScope,
): string {
  return COMPANION_STATE_PERSISTENCE_RPC[scope]
}

// Escopo gravado numa linha derivada. Sem coluna/valor = legado = produção.
// Valor desconhecido não é de nenhum escopo (null): quem lê recusa.
export function companionRowExecutionScope(
  row: unknown,
): CompanionExecutionScope | null {
  if (!row || typeof row !== 'object') {
    return null
  }

  const value = (row as Record<string, unknown>).execution_scope

  if (value === undefined || value === null) {
    return 'production'
  }

  return isCompanionExecutionScope(value) ? value : null
}
