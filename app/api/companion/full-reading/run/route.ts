// Leitura completa — rota de execução manual, SOMENTE em preview.
//
// GET /api/companion/full-reading/run
//   ?token=<COMPANION_FULL_READING_RUN_TOKEN>
//   &company_id=<uuid>
//   &conversation_key=<chave>   (opcional quando cycle_id vem: a chave
//                                sai do ledger do ciclo)
//   [&cycle_id=<uuid>]          (padrão: ciclo mais recente da conversa)
//   [&reference_time=<ISO>]     (padrão: agora)
//   [&require_structured_output=1]  (modo estrito: recusa do formato
//                                    fixo vira falha, sem repetir sem ele)
//   [&effort=low|medium|high]   (padrão: o esforço configurado)
//   [&eval=1]                   (medição: grava com prompt_version
//                                "<versão>-eval", que o painel nunca usa)
//   [&modo=completa|continuacao] (rodada 9, medição: continuação usa a
//                                última leitura boa do ciclo como base)
//
// Cria uma rodada em companion_full_reading_runs e executa a leitura
// depois de responder (after). A resposta NÃO devolve conteúdo da
// conversa: só o identificador da rodada. O resultado é lido no banco.
//
// Segurança: em produção a rota não existe (404). Em preview exige um
// token longo, comparado em tempo constante; qualquer falha de token
// também responde 404, sem revelar que a rota existe.

import {
  createHash,
  randomUUID,
  timingSafeEqual,
} from 'crypto'

import {
  after,
  NextResponse,
} from 'next/server'

import {
  FULL_READING_RUNS_TABLE,
  createFullReadingAdminClient,
  executeFullReadingRun,
  resolveFullReadingEffort,
  resolveFullReadingModel,
  type FullReadingBaseRun,
} from '@/app/lib/server/full-reading-runner'

import {
  FULL_READING_COMPATIBLE_PROMPT_VERSIONS,
  FULL_READING_EVAL_PROMPT_VERSION,
  FULL_READING_PROMPT_VERSION,
} from '@/app/lib/companion/full-reading/prompt'

import {
  CLAUDE_EFFORT_LEVELS,
} from '@/app/lib/companion/full-reading/anthropic-client'

export const maxDuration =
  300

export const dynamic =
  'force-dynamic'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MIN_TOKEN_LENGTH =
  32

const MAX_CONVERSATION_KEY_LENGTH =
  512

function notFound(): NextResponse {
  return new NextResponse(
    'Not Found',
    { status: 404 },
  )
}

function badRequest(
  code: string,
): NextResponse {
  return NextResponse.json(
    { error: code },
    { status: 400 },
  )
}

function tokensMatch(
  provided: string,
  expected: string,
): boolean {
  const left =
    createHash('sha256').update(provided).digest()

  const right =
    createHash('sha256').update(expected).digest()

  return timingSafeEqual(left, right)
}

function isPreviewRuntime(): boolean {
  if (process.env.VERCEL_ENV === 'production') {
    return false
  }

  return (
    process.env.VERCEL_ENV === 'preview' ||
    process.env.NODE_ENV === 'development'
  )
}

export async function GET(
  request: Request,
): Promise<NextResponse> {
  if (!isPreviewRuntime()) {
    return notFound()
  }

  const expectedToken =
    process.env.COMPANION_FULL_READING_RUN_TOKEN ?? ''

  if (expectedToken.length < MIN_TOKEN_LENGTH) {
    return notFound()
  }

  const url =
    new URL(request.url)

  if (!tokensMatch(url.searchParams.get('token') ?? '', expectedToken)) {
    return notFound()
  }

  const companyId =
    (url.searchParams.get('company_id') ?? '').trim()

  let conversationKey =
    (url.searchParams.get('conversation_key') ?? '').trim()

  const cycleParam =
    (url.searchParams.get('cycle_id') ?? '').trim()

  const referenceParam =
    (url.searchParams.get('reference_time') ?? '').trim()

  const requireStructuredOutput =
    url.searchParams.get('require_structured_output') === '1'

  const evalRun =
    url.searchParams.get('eval') === '1'

  const effortParam =
    (url.searchParams.get('effort') ?? '').trim().toLowerCase()

  const modeParam =
    (url.searchParams.get('modo') ?? '').trim().toLowerCase()

  if (
    modeParam.length > 0 &&
    modeParam !== 'completa' &&
    modeParam !== 'continuacao'
  ) {
    return badRequest('INVALID_MODE')
  }

  if (
    effortParam.length > 0 &&
    !CLAUDE_EFFORT_LEVELS.some((level) => level === effortParam)
  ) {
    return badRequest('INVALID_EFFORT')
  }

  if (!UUID_PATTERN.test(companyId)) {
    return badRequest('INVALID_COMPANY_ID')
  }

  if (cycleParam.length > 0 && !UUID_PATTERN.test(cycleParam)) {
    return badRequest('INVALID_CYCLE_ID')
  }

  if (
    (conversationKey.length === 0 && cycleParam.length === 0) ||
    conversationKey.length > MAX_CONVERSATION_KEY_LENGTH
  ) {
    return badRequest('INVALID_CONVERSATION_KEY')
  }

  let referenceTime =
    new Date().toISOString()

  if (referenceParam.length > 0) {
    const parsed =
      new Date(referenceParam)

    if (Number.isNaN(parsed.getTime())) {
      return badRequest('INVALID_REFERENCE_TIME')
    }

    referenceTime =
      parsed.toISOString()
  }

  const apiKey =
    process.env.ANTHROPIC_API_KEY ?? ''

  if (apiKey.length === 0) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY_MISSING' },
      { status: 503 },
    )
  }

  const admin =
    createFullReadingAdminClient()

  if (!admin) {
    return NextResponse.json(
      { error: 'SUPABASE_CONFIGURATION_UNAVAILABLE' },
      { status: 503 },
    )
  }

  let cycleId =
    cycleParam

  // Só cycle_id: a conversa sai do ledger do ciclo (assim o pedido não
  // precisa carregar o telefone do cliente).
  if (conversationKey.length === 0) {
    const { data, error } =
      await admin
        .from('conversation_messages')
        .select('conversation_key')
        .eq('company_id', companyId)
        .eq('cycle_id', cycleId)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: 'CONVERSATION_LOOKUP_FAILED' },
        { status: 502 },
      )
    }

    const found =
      data && typeof data.conversation_key === 'string'
        ? data.conversation_key.trim()
        : ''

    if (found.length === 0 || found.length > MAX_CONVERSATION_KEY_LENGTH) {
      return NextResponse.json(
        { error: 'CONVERSATION_NOT_FOUND' },
        { status: 404 },
      )
    }

    conversationKey = found
  }

  if (cycleId.length === 0) {
    const { data, error } =
      await admin
        .from('conversation_messages')
        .select('cycle_id')
        .eq('company_id', companyId)
        .eq('conversation_key', conversationKey)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: 'CYCLE_LOOKUP_FAILED' },
        { status: 502 },
      )
    }

    const found =
      data && typeof data.cycle_id === 'string'
        ? data.cycle_id
        : ''

    if (!UUID_PATTERN.test(found)) {
      return NextResponse.json(
        { error: 'CONVERSATION_NOT_FOUND' },
        { status: 404 },
      )
    }

    cycleId = found
  }

  // modo=continuacao: a última leitura boa do ciclo (mesma versão do
  // prompt; na medição, a de medição ou, sem ela, a do painel).
  let baseRun: FullReadingBaseRun | null =
    null

  if (modeParam === 'continuacao') {
    const versions =
      evalRun
        ? [FULL_READING_EVAL_PROMPT_VERSION, ...FULL_READING_COMPATIBLE_PROMPT_VERSIONS]
        : [...FULL_READING_COMPATIBLE_PROMPT_VERSIONS]

    for (const version of versions) {
      const { data, error } =
        await admin
          .from(FULL_READING_RUNS_TABLE)
          .select('run_id, reference_time, completed_at, decision')
          .eq('company_id', companyId)
          .eq('cycle_id', cycleId)
          .eq('prompt_version', version)
          .eq('status', 'succeeded')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

      if (error) {
        return NextResponse.json(
          { error: 'BASE_READING_LOOKUP_FAILED' },
          { status: 502 },
        )
      }

      const row =
        data as {
          run_id?: unknown
          reference_time?: unknown
          completed_at?: unknown
          decision?: unknown
        } | null

      if (
        row &&
        typeof row.run_id === 'string' &&
        typeof row.reference_time === 'string' &&
        row.decision &&
        typeof row.decision === 'object'
      ) {
        baseRun = {
          run_id: row.run_id,
          reference_time: row.reference_time,
          completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
          decision: row.decision as Record<string, unknown>,
        }
        break
      }
    }

    if (!baseRun) {
      return badRequest('NO_BASE_READING')
    }
  }

  const runId =
    randomUUID()

  const model =
    resolveFullReadingModel()

  const effort =
    CLAUDE_EFFORT_LEVELS.find((level) => level === effortParam) ??
    resolveFullReadingEffort()

  const promptVersion =
    evalRun
      ? FULL_READING_EVAL_PROMPT_VERSION
      : FULL_READING_PROMPT_VERSION

  const { error: insertError } =
    await admin
      .from(FULL_READING_RUNS_TABLE)
      .insert({
        run_id: runId,
        company_id: companyId,
        cycle_id: cycleId,
        conversation_key: conversationKey,
        reference_time: referenceTime,
        trigger_source: 'manual_preview',
        vercel_env: process.env.VERCEL_ENV ?? null,
        deployment_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        prompt_version: promptVersion,
        model,
        effort,
        status: 'queued',
      })

  if (insertError) {
    return NextResponse.json(
      {
        error: 'RUN_INSERT_FAILED',
        database_code: insertError.code ?? null,
      },
      { status: 502 },
    )
  }

  after(async () => {
    await executeFullReadingRun({
      admin,
      runId,
      companyId,
      cycleId,
      conversationKey,
      referenceTime,
      model,
      effort,
      apiKey,
      requireStructuredOutput,
      triggerRoute: '/api/companion/full-reading/run',
      baseRun,
      mode:
        modeParam === 'continuacao'
          ? 'continuacao'
          : 'completa',
      reasons: ['rota_de_teste'],
    })
  })

  return NextResponse.json({
    run_id: runId,
    status: 'queued',
    model,
    effort,
    prompt_version: promptVersion,
    require_structured_output: requireStructuredOutput,
    mode: modeParam === 'continuacao' ? 'continuacao' : 'completa',
    base_run_id: baseRun?.run_id ?? null,
  })
}
