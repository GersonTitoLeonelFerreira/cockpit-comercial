// Leitura completa — rota de execução manual, SOMENTE em preview.
//
// GET /api/companion/full-reading/run
//   ?token=<COMPANION_FULL_READING_RUN_TOKEN>
//   &company_id=<uuid>
//   &conversation_key=<chave>
//   [&cycle_id=<uuid>]          (padrão: ciclo mais recente da conversa)
//   [&reference_time=<ISO>]     (padrão: agora)
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
} from '@/app/lib/server/full-reading-runner'

import {
  FULL_READING_PROMPT_VERSION,
} from '@/app/lib/companion/full-reading/prompt'

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

  const conversationKey =
    (url.searchParams.get('conversation_key') ?? '').trim()

  const cycleParam =
    (url.searchParams.get('cycle_id') ?? '').trim()

  const referenceParam =
    (url.searchParams.get('reference_time') ?? '').trim()

  if (!UUID_PATTERN.test(companyId)) {
    return badRequest('INVALID_COMPANY_ID')
  }

  if (
    conversationKey.length === 0 ||
    conversationKey.length > MAX_CONVERSATION_KEY_LENGTH
  ) {
    return badRequest('INVALID_CONVERSATION_KEY')
  }

  if (cycleParam.length > 0 && !UUID_PATTERN.test(cycleParam)) {
    return badRequest('INVALID_CYCLE_ID')
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

  const runId =
    randomUUID()

  const model =
    resolveFullReadingModel()

  const effort =
    resolveFullReadingEffort()

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
        prompt_version: FULL_READING_PROMPT_VERSION,
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
    })
  })

  return NextResponse.json({
    run_id: runId,
    status: 'queued',
    model,
    effort,
    prompt_version: FULL_READING_PROMPT_VERSION,
  })
}
