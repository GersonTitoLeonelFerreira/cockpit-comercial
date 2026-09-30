import 'server-only'

import {
  createHash,
} from 'crypto'

import {
  isCompanionExecutionScope,
  type CompanionExecutionScope,
} from '@/app/lib/companion/companion-execution-scope'

export const STATEFUL_COPILOT_BACKGROUND_JOB_VERSION =
  'phase12a-background-job-v2' as const

export const STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC =
  'companion-deep-analysis-v3' as const

export const STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS =
  120_000

export const STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS =
  5

export const STATEFUL_COPILOT_BACKGROUND_RUNNING_LEASE_MS =
  210_000

// Redelivery de falha retryable. Sem diretiva explícita a Vercel Queue só
// reentrega quando a visibilidade (180 s) expira — cada nova tentativa de
// uma primeira análise custava 3+ minutos e a extensão desistia antes
// (R9). A espera cresce, mas cabe inteira na janela de acompanhamento.
export const STATEFUL_COPILOT_BACKGROUND_RETRY_BACKOFF_SECONDS =
  [3, 10, 20, 30] as const

// Outra entrega/job da mesma conversa está rodando: espera ela terminar.
export const STATEFUL_COPILOT_BACKGROUND_CONTENTION_RETRY_SECONDS =
  15

// Um job `queued` sem nenhum sinal de execução (claim, requeue ou retry
// atualizam updated_at) além disto não tem mais entrega viva: pode ser
// reaberto e republicado com segurança (CAS em updated_at).
export const STATEFUL_COPILOT_BACKGROUND_QUEUED_STALE_MS =
  5 * 60_000

const CONTENTION_RETRY_CODES: ReadonlySet<string> = new Set([
  'BACKGROUND_JOB_ALREADY_RUNNING',
  'BACKGROUND_CONVERSATION_BUSY',
])

export type StatefulCopilotBackgroundRetryDirective =
  | { afterSeconds: number }
  | { acknowledge: true }

// Diretiva da fila para uma entrega que lançou erro. Erro não retryable
// (mensagem inválida) nunca vai dar certo: ack. Depois do teto de entregas
// (+ margem), o job fica com a recuperação do produtor (stale).
export function resolveStatefulCopilotBackgroundRetryDirective({
  retryable,
  code,
  delivery_count,
}: {
  retryable: boolean
  code: string | null
  delivery_count: number
}): StatefulCopilotBackgroundRetryDirective {
  if (
    !retryable ||
    !Number.isSafeInteger(delivery_count) ||
    delivery_count < 1 ||
    delivery_count >= STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS + 2
  ) {
    return { acknowledge: true }
  }

  if (code && CONTENTION_RETRY_CODES.has(code)) {
    return { afterSeconds: STATEFUL_COPILOT_BACKGROUND_CONTENTION_RETRY_SECONDS }
  }

  const backoff = STATEFUL_COPILOT_BACKGROUND_RETRY_BACKOFF_SECONDS

  return {
    afterSeconds: backoff[Math.min(delivery_count - 1, backoff.length - 1)],
  }
}

export type StatefulCopilotBackgroundJobStaleness =
  | 'fresh'
  | 'stale_queued'
  | 'stale_running'

// Órfão determinístico: `queued` sem sinal de execução há mais que o limite
// ou `running` com lease vencido (o worker tem maxDuration 180 s < lease
// 210 s, então o dono já morreu).
export function classifyStatefulCopilotBackgroundJobStaleness({
  status,
  updated_at,
  started_at,
  now_ms,
}: {
  status: unknown
  updated_at: unknown
  started_at: unknown
  now_ms: number
}): StatefulCopilotBackgroundJobStaleness {
  const parse = (value: unknown) =>
    typeof value === 'string' ? Date.parse(value) : Number.NaN

  if (status === 'queued') {
    const updatedAt = parse(updated_at)

    return Number.isFinite(updatedAt) &&
      now_ms - updatedAt >= STATEFUL_COPILOT_BACKGROUND_QUEUED_STALE_MS
      ? 'stale_queued'
      : 'fresh'
  }

  if (status === 'running') {
    const startedAt = parse(started_at)

    return Number.isFinite(startedAt) &&
      now_ms - startedAt >= STATEFUL_COPILOT_BACKGROUND_RUNNING_LEASE_MS
      ? 'stale_running'
      : 'fresh'
  }

  return 'fresh'
}

export const STATEFUL_COPILOT_BACKGROUND_JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'superseded',
] as const

export type StatefulCopilotBackgroundJobStatus =
  (typeof STATEFUL_COPILOT_BACKGROUND_JOB_STATUSES)[number]

export type StatefulCopilotBackgroundJobDescriptor = {
  job_version:
    typeof STATEFUL_COPILOT_BACKGROUND_JOB_VERSION

  analysis_job_id:
    string

  execution_scope:
    CompanionExecutionScope

  company_id:
    string

  cycle_id:
    string

  conversation_key:
    string

  message_watermark:
    string

  requested_at:
    string
}

export type StatefulCopilotBackgroundJobMessage =
  StatefulCopilotBackgroundJobDescriptor & {
    device_key:
      string
  }

function isRecord(
  value:
    unknown,
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
  )
}

function requireText(
  value:
    unknown,
  path:
    string,
  maximumLength:
    number,
): string {
  if (
    typeof value !==
    'string'
  ) {
    throw new Error(
      `${path} precisa ser texto.`,
    )
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized.length >
      maximumLength
  ) {
    throw new Error(
      `${path} é inválido.`,
    )
  }

  return normalized
}

function requireDateTime(
  value:
    unknown,
): string {
  const normalized =
    requireText(
      value,
      'requested_at',
      80,
    )

  const timestamp =
    Date.parse(
      normalized,
    )

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    throw new Error(
      'requested_at precisa ser uma data válida.',
    )
  }

  return new Date(
    timestamp,
  ).toISOString()
}

export function isStatefulCopilotBackgroundJobStatus(
  value:
    unknown,
): value is StatefulCopilotBackgroundJobStatus {
  return (
    typeof value ===
      'string' &&
    STATEFUL_COPILOT_BACKGROUND_JOB_STATUSES
      .includes(
        value as StatefulCopilotBackgroundJobStatus,
      )
  )
}

function hashJobIdentity(
  parts:
    readonly string[],
): string {
  return createHash(
    'sha256',
  )
    .update(
      JSON.stringify([
        STATEFUL_COPILOT_BACKGROUND_JOB_VERSION,
        ...parts,
      ]),
    )
    .digest(
      'hex',
    )
}

function requireExecutionScope(
  value:
    unknown,
): CompanionExecutionScope {
  if (
    !isCompanionExecutionScope(
      value,
    )
  ) {
    throw new Error(
      'execution_scope é inválido.',
    )
  }

  return value
}

// R10: o escopo de execução faz parte da identidade do job. O mesmo
// contexto/watermark gera um job de produção e um job de homolog
// DIFERENTES — nenhum dos dois reaproveita, reabre ou conclui o outro.
// Ids anteriores ao escopo (hash sem ele) são jobs legados de produção:
// aceitos só como produção, nunca por homolog.
export function buildStatefulCopilotBackgroundJobDescriptor({
  execution_scope,
  company_id,
  cycle_id,
  conversation_key,
  message_watermark,
  requested_at,
  analysis_job_id,
}: {
  execution_scope:
    unknown

  company_id:
    unknown

  cycle_id:
    unknown

  conversation_key:
    unknown

  message_watermark:
    unknown

  requested_at:
    unknown

  // Id já existente (mensagem da fila, linha do banco) a conferir contra
  // o escopo do job. Ausente = job novo.
  analysis_job_id?:
    unknown
}): StatefulCopilotBackgroundJobDescriptor {
  const executionScope =
    requireExecutionScope(
      execution_scope,
    )

  const companyId =
    requireText(
      company_id,
      'company_id',
      100,
    )

  const cycleId =
    requireText(
      cycle_id,
      'cycle_id',
      100,
    )

  const conversationKey =
    requireText(
      conversation_key,
      'conversation_key',
      500,
    )

  const messageWatermark =
    requireText(
      message_watermark,
      'message_watermark',
      200,
    )

  const requestedAt =
    requireDateTime(
      requested_at,
    )

  const scopedJobId =
    hashJobIdentity([
      executionScope,
      companyId,
      cycleId,
      conversationKey,
      messageWatermark,
    ])

  let analysisJobId =
    scopedJobId

  if (
    analysis_job_id !==
    undefined
  ) {
    const legacyProductionJobId =
      executionScope ===
        'production'
        ? hashJobIdentity([
            companyId,
            cycleId,
            conversationKey,
            messageWatermark,
          ])
        : null

    if (
      analysis_job_id !==
        scopedJobId &&
      (
        legacyProductionJobId ===
          null ||
        analysis_job_id !==
          legacyProductionJobId
      )
    ) {
      throw new Error(
        'analysis_job_id não corresponde ao escopo do job.',
      )
    }

    analysisJobId =
      analysis_job_id
  }

  return Object.freeze({
    job_version:
      STATEFUL_COPILOT_BACKGROUND_JOB_VERSION,

    analysis_job_id:
      analysisJobId,

    execution_scope:
      executionScope,

    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    message_watermark:
      messageWatermark,

    requested_at:
      requestedAt,
  })
}

export function buildStatefulCopilotBackgroundJobMessage({
  descriptor,
  device_key,
}: {
  descriptor:
    StatefulCopilotBackgroundJobDescriptor

  device_key:
    unknown
}): StatefulCopilotBackgroundJobMessage {
  return Object.freeze({
    ...descriptor,

    device_key:
      requireText(
        device_key,
        'device_key',
        100,
      ),
  })
}

export function parseStatefulCopilotBackgroundJobMessage(
  value:
    unknown,
): StatefulCopilotBackgroundJobMessage {
  if (
    !isRecord(
      value,
    )
  ) {
    throw new Error(
      'Mensagem do job background inválida.',
    )
  }

  if (
    value.job_version !==
    STATEFUL_COPILOT_BACKGROUND_JOB_VERSION
  ) {
    throw new Error(
      'Versão do job background incompatível.',
    )
  }

  // Mensagem publicada antes do escopo existir só pode ser de produção.
  const descriptor =
    buildStatefulCopilotBackgroundJobDescriptor({
      execution_scope:
        value.execution_scope ===
        undefined
          ? 'production'
          : value.execution_scope,

      company_id:
        value.company_id,

      cycle_id:
        value.cycle_id,

      conversation_key:
        value.conversation_key,

      message_watermark:
        value.message_watermark,

      requested_at:
        value.requested_at,

      analysis_job_id:
        typeof value.analysis_job_id ===
        'string'
          ? value.analysis_job_id
          : null,
    })

  return buildStatefulCopilotBackgroundJobMessage({
    descriptor,

    device_key:
      value.device_key,
  })
}

export type StatefulCopilotBackgroundFailureInput = {
  code?: string
  retryable?: boolean

  communication_failure_path?:
    string

  diagnostic_failure_path?:
    string

  state_failure_path?:
    string

  communication_failure_invariant?:
    string

  diagnostic_failure_invariant?:
    string

  state_failure_invariant?:
    string

  communication_attempts?:
    1 | 2
}

export type StatefulCopilotBackgroundExecutionInput = {
  engine_mode?:
    string

  persistence_mode?:
    string

  communication_attempts?:
    1 | 2 | null
}

export type StatefulCopilotBackgroundFailureOutcome = {
  failure_code:
    string

  failure_path:
    string | null

  failure_invariant:
    string | null

  communication_attempts:
    1 | 2 | null

  retryable:
    boolean
}

function safeStatefulCopilotBackgroundFailureCode(
  value:
    unknown,
  fallback:
    string,
): string {
  if (
    typeof value ===
      'string' &&
    /^[A-Z0-9_]+$/.test(
      value,
    ) &&
    value.length <=
      120
  ) {
    return value
  }

  return fallback
}

/*
 * Traduz o resultado do orquestrador stateful (que ainda expressa, na sua
 * forma de tipos, semântica herdada de um fallback para V1 — ver
 * `active_fallback_v1` em stateful-copilot-runtime-orchestrator.ts) para o
 * vocabulário real do worker background V2-only, que não tem nenhum V1
 * para cair. Quando `failure` vem null do orquestrador, isso NÃO significa
 * "sem causa conhecida" — a causa está em `execution` (engine_mode/
 * persistence_mode) e precisa ser lida de lá, em vez de virar o código
 * genérico STATEFUL_BACKGROUND_FAILED sem path/invariant e sem chance de
 * retry.
 */
export function resolveStatefulCopilotBackgroundFailureOutcome({
  failure,
  execution,
}: {
  failure:
    StatefulCopilotBackgroundFailureInput | null

  execution:
    StatefulCopilotBackgroundExecutionInput | null
}): StatefulCopilotBackgroundFailureOutcome {
  if (failure) {
    return {
      failure_code:
        safeStatefulCopilotBackgroundFailureCode(
          failure.code,
          'STATEFUL_BACKGROUND_FAILED',
        ),

      failure_path:
        failure.communication_failure_path ??
        failure.diagnostic_failure_path ??
        failure.state_failure_path ??
        null,

      failure_invariant:
        failure.communication_failure_invariant ??
        failure.diagnostic_failure_invariant ??
        failure.state_failure_invariant ??
        null,

      communication_attempts:
        execution?.communication_attempts ??
        failure.communication_attempts ??
        null,

      // LIVE-03 (FASE 10): citar áudio sem transcrição é determinístico
      // para a mesma conversa — reenfileirar só repetia a mesma pergunta
      // (~14 min até `failed`) enquanto o vendedor esperava. Terminal
      // imediato; uma transcrição nova gera watermark/job novos.
      retryable:
        failure.retryable === true &&
        (
          failure.communication_failure_invariant ??
          failure.diagnostic_failure_invariant ??
          failure.state_failure_invariant ??
          null
        ) !==
          'AUDIO_EVIDENCE_NOT_TRANSCRIBED',
    }
  }

  // O orquestrador só devolve `stateful_failure: null` em dois casos: o
  // motor não produziu saída de modelo (`engine_mode: 'blocked'` — sem
  // conteúdo utilizável na conversa, precondição determinística, não é um
  // bug) ou a persistência recusou a escrita por conflito de versão
  // (`persistence_mode: 'conflict'` — outra execução já avançou o CAS
  // desta mesma conversa). O conflito de escrita é, por construção,
  // transitório: uma nova tentativa relê o estado atual e escreve sobre a
  // versão certa. Tratá-lo como falha terminal não retryable (como o
  // código genérico fazia) descarta essa recuperação sem motivo.
  if (
    execution?.persistence_mode ===
    'conflict'
  ) {
    return {
      failure_code:
        'STATEFUL_STATE_WRITE_CONFLICT',

      failure_path:
        null,

      failure_invariant:
        null,

      communication_attempts:
        execution.communication_attempts ??
        null,

      retryable:
        true,
    }
  }

  if (
    execution?.engine_mode ===
    'blocked'
  ) {
    return {
      failure_code:
        'ANALYSIS_PRECONDITION_BLOCKED',

      failure_path:
        null,

      failure_invariant:
        null,

      communication_attempts:
        null,

      retryable:
        false,
    }
  }

  // R1.2 (revisão): segunda violação do Commercial Truth Guard, já
  // depois do reparo (`engine_mode: 'guard_exhausted'` — ver
  // stateful-copilot-orchestrator.ts). O motor já garante, antes deste
  // ponto, que nada foi persistido e que previous_state permanece
  // exatamente o último estado válido — este código só precisa tornar
  // essa causa diagnosticável em vez de cair no genérico
  // STATEFUL_BACKGROUND_FAILED (que um operador não conseguiria
  // distinguir de um crash técnico real).
  //
  // retryable: false, deliberadamente — e não por omissão, como o
  // genérico. Diferente de um conflito de CAS (transitório, a mesma
  // conversa relida e regravada resolve) ou de um erro de provider
  // (pode ser um blip de rede), aqui o motor já tentou uma vez, recebeu
  // uma instrução de reparo explícita e violou o guard de novo com a
  // MESMA conversa. Reenfileirar repetiria a mesma pergunta ao modelo
  // sem nenhuma informação nova — na melhor hipótese não muda nada, na
  // pior queima chamadas de modelo reais tentando "convencer" um guard
  // que já teve sua chance de reparo. O gatilho correto para uma nova
  // tentativa é uma mensagem nova de verdade, que já cria um
  // message_watermark e um analysis_job_id novos por conta própria —
  // não este job.
  if (
    execution?.engine_mode ===
    'guard_exhausted'
  ) {
    return {
      failure_code:
        'COMMERCIAL_TRUTH_GUARD_EXHAUSTED',

      failure_path:
        null,

      failure_invariant:
        null,

      communication_attempts:
        null,

      retryable:
        false,
    }
  }

  return {
    failure_code:
      'STATEFUL_BACKGROUND_FAILED',

    failure_path:
      null,

    failure_invariant:
      null,

    communication_attempts:
      execution?.communication_attempts ??
      null,

    retryable:
      false,
  }
}

export function shouldRetryStatefulCopilotBackgroundFailure({
  retryable,
  delivery_count,
}: {
  retryable:
    unknown

  delivery_count:
    unknown
}): boolean {
  if (
    retryable !== true ||
    typeof delivery_count !==
      'number' ||
    !Number.isSafeInteger(
      delivery_count,
    ) ||
    delivery_count < 1
  ) {
    return false
  }

  return (
    delivery_count <
    STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS
  )
}
