import {
  ActionEventContractError,
  COMPANION_ACTION_TYPES,
  getActionEventRpcErrorHttpStatus,
  normalizeOptionalActionEventUuidParam,
  normalizeRegisterActionEventBody,
} from './action-events-contract.ts'

type ActionEventsTokenPayload = {
  sub: string
  company_id: string
  role: 'admin' | 'manager' | 'member'
}

type ActionEventsRouteError = {
  message: string
}

type ActionEventsQueryResult = {
  data: Record<string, unknown> | null
  error: ActionEventsRouteError | null
}

type ActionEventsQueryBuilder = {
  select: (columns: string) => ActionEventsQueryBuilder
  eq: (column: string, value: unknown) => ActionEventsQueryBuilder
  maybeSingle: () => Promise<ActionEventsQueryResult>
}

type ActionEventsRpcResult = {
  data: unknown
  error: ActionEventsRouteError | null
}

type ActionEventsAdminClient = {
  from: (table: string) => ActionEventsQueryBuilder
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<ActionEventsRpcResult>
}

export type ActionEventsRouteDependencies = {
  verifyRequestToken: (request: Request) => ActionEventsTokenPayload | null
  getAdminClient: () => unknown
}

export function getActionEventsCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''

  const allowedOrigins = [
    'https://web.whatsapp.com',
    'https://cockpit-comercial-vocn.vercel.app',
    'http://localhost:3000',
  ]

  const isExtensionOrigin =
    origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')

  const allowOrigin =
    allowedOrigins.includes(origin) || isExtensionOrigin
      ? origin
      : 'https://cockpit-comercial-vocn.vercel.app'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

function contractErrorResponse({
  error,
  status,
  corsHeaders,
}: {
  error: ActionEventContractError
  status: string
  corsHeaders: ReturnType<typeof getActionEventsCorsHeaders>
}) {
  return Response.json(
    {
      ok: false,
      status,
      error: error.message,
      validation: { code: error.code, path: error.path },
    },
    { status: 400, headers: corsHeaders },
  )
}

export function createActionEventsRouteHandlers(
  dependencies: ActionEventsRouteDependencies,
) {
  const { verifyRequestToken, getAdminClient } = dependencies

  async function post(request: Request) {
    const corsHeaders = getActionEventsCorsHeaders(request)

    try {
      const tokenPayload = verifyRequestToken(request)

      if (!tokenPayload) {
        return Response.json(
          {
            ok: false,
            status: 'INVALID_COMPANION_TOKEN',
            error: 'Sessão do Companion inválida ou expirada.',
          },
          { status: 401, headers: corsHeaders },
        )
      }

      const rawBody = await request.json().catch(() => undefined)
      const envelope = normalizeRegisterActionEventBody(rawBody)

      const admin = getAdminClient() as ActionEventsAdminClient | null

      if (!admin) {
        return Response.json(
          {
            ok: false,
            status: 'ENV_MISSING',
            error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
          },
          { status: 500, headers: corsHeaders },
        )
      }

      const { data: membership, error: membershipError } = await admin
        .from('company_memberships')
        .select('company_id, user_id, role, is_active')
        .eq('company_id', tokenPayload.company_id)
        .eq('user_id', tokenPayload.sub)
        .eq('is_active', true)
        .maybeSingle()

      if (membershipError) {
        return Response.json(
          { ok: false, status: 'MEMBERSHIP_LOOKUP_FAILED', error: membershipError.message },
          { status: 400, headers: corsHeaders },
        )
      }

      if (!membership?.company_id) {
        return Response.json(
          {
            ok: false,
            status: 'NO_ACTIVE_MEMBERSHIP',
            error: 'Usuário sem vínculo ativo com a empresa do Companion.',
          },
          { status: 403, headers: corsHeaders },
        )
      }

      const { data: cycle, error: cycleError } = await admin
        .from('sales_cycles')
        .select('id, company_id, owner_user_id')
        .eq('id', envelope.cycle_id)
        .eq('company_id', tokenPayload.company_id)
        .maybeSingle()

      if (cycleError) {
        return Response.json(
          { ok: false, status: 'CYCLE_LOOKUP_FAILED', error: cycleError.message },
          { status: 400, headers: corsHeaders },
        )
      }

      if (!cycle?.id) {
        return Response.json(
          {
            ok: false,
            status: 'CYCLE_NOT_FOUND',
            error: 'Ciclo não encontrado ou sem permissão.',
          },
          { status: 404, headers: corsHeaders },
        )
      }

      const isAdminOrManager =
        membership.role === 'admin' || membership.role === 'manager'

      if (!isAdminOrManager && cycle.owner_user_id !== tokenPayload.sub) {
        return Response.json(
          {
            ok: false,
            status: 'CYCLE_NOT_OWNED',
            error: 'Este ciclo não pertence à sua carteira.',
          },
          { status: 403, headers: corsHeaders },
        )
      }

      const { data, error } = await admin.rpc('rpc_record_companion_action_event', {
        p_company_id: tokenPayload.company_id,
        p_cycle_id: envelope.cycle_id,
        p_seller_user_id: tokenPayload.sub,
        p_action_type: envelope.action_type,
        p_idempotency_key: envelope.idempotency_key,
        p_coaching_note_id: envelope.coaching_note_id,
        p_conversation_key: envelope.conversation_key,
        p_metadata: envelope.metadata,
      })

      if (error) {
        return Response.json(
          { ok: false, status: 'ACTION_EVENT_REJECTED', error: error.message },
          { status: getActionEventRpcErrorHttpStatus(error), headers: corsHeaders },
        )
      }

      const rows = Array.isArray(data) ? data : data ? [data] : []
      const result = rows[0] as
        | { event_id?: unknown; occurred_at?: unknown; already_registered?: unknown }
        | undefined

      if (!result?.event_id || typeof result.occurred_at !== 'string') {
        return Response.json(
          {
            ok: false,
            status: 'EMPTY_ACTION_EVENT_RESULT',
            error: 'O registro não retornou confirmação do banco.',
          },
          { status: 500, headers: corsHeaders },
        )
      }

      return Response.json(
        {
          ok: true,
          status: 'ACTION_EVENT_REGISTERED',
          data: {
            event_id: String(result.event_id),
            action_type: envelope.action_type,
            occurred_at: result.occurred_at,
            already_registered: result.already_registered === true,
          },
        },
        { status: 200, headers: corsHeaders },
      )
    } catch (error) {
      if (error instanceof ActionEventContractError) {
        return contractErrorResponse({
          error,
          status: 'INVALID_ACTION_EVENT_PAYLOAD',
          corsHeaders,
        })
      }

      return Response.json(
        {
          ok: false,
          status: 'ACTION_EVENT_ERROR',
          error:
            error instanceof Error && error.message
              ? error.message
              : 'Não foi possível registrar a ação do Companion.',
        },
        { status: 500, headers: corsHeaders },
      )
    }
  }

  async function get(request: Request) {
    const corsHeaders = getActionEventsCorsHeaders(request)

    try {
      const tokenPayload = verifyRequestToken(request)

      if (!tokenPayload) {
        return Response.json(
          {
            ok: false,
            status: 'INVALID_COMPANION_TOKEN',
            error: 'Sessão do Companion inválida ou expirada.',
          },
          { status: 401, headers: corsHeaders },
        )
      }

      const admin = getAdminClient() as ActionEventsAdminClient | null

      if (!admin) {
        return Response.json(
          {
            ok: false,
            status: 'ENV_MISSING',
            error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
          },
          { status: 500, headers: corsHeaders },
        )
      }

      const { data: membership, error: membershipError } = await admin
        .from('company_memberships')
        .select('company_id, user_id, role, is_active')
        .eq('company_id', tokenPayload.company_id)
        .eq('user_id', tokenPayload.sub)
        .eq('is_active', true)
        .maybeSingle()

      if (membershipError) {
        return Response.json(
          { ok: false, status: 'MEMBERSHIP_LOOKUP_FAILED', error: membershipError.message },
          { status: 400, headers: corsHeaders },
        )
      }

      if (!membership?.company_id) {
        return Response.json(
          {
            ok: false,
            status: 'NO_ACTIVE_MEMBERSHIP',
            error: 'Usuário sem vínculo ativo com a empresa do Companion.',
          },
          { status: 403, headers: corsHeaders },
        )
      }

      const url = new URL(request.url)
      const cycleIdParam = normalizeOptionalActionEventUuidParam(
        url.searchParams.get('cycle_id'),
        'cycle_id',
      )
      const leadIdParam = normalizeOptionalActionEventUuidParam(
        url.searchParams.get('lead_id'),
        'lead_id',
      )
      const actionTypeParam = url.searchParams.get('action_type')
      const sinceParam = url.searchParams.get('since')
      const untilParam = url.searchParams.get('until')
      const limitParam = url.searchParams.get('limit')

      if (
        actionTypeParam &&
        !(COMPANION_ACTION_TYPES as readonly string[]).includes(actionTypeParam)
      ) {
        return Response.json(
          {
            ok: false,
            status: 'INVALID_ACTION_TYPE',
            error: `action_type deve ser um dos valores suportados: ${COMPANION_ACTION_TYPES.join(', ')}.`,
          },
          { status: 400, headers: corsHeaders },
        )
      }

      const isAdminOrManager =
        membership.role === 'admin' || membership.role === 'manager'
      const limit = limitParam ? Number(limitParam) : 100

      const { data, error } = await admin.rpc('rpc_list_companion_action_events', {
        p_company_id: tokenPayload.company_id,
        p_requesting_user_id: tokenPayload.sub,
        p_is_admin_or_manager: isAdminOrManager,
        p_cycle_id: cycleIdParam,
        p_lead_id: leadIdParam,
        p_action_type: actionTypeParam,
        p_since: sinceParam,
        p_until: untilParam,
        p_limit: Number.isFinite(limit) ? limit : 100,
      })

      if (error) {
        return Response.json(
          { ok: false, status: 'ACTION_EVENTS_QUERY_REJECTED', error: error.message },
          { status: getActionEventRpcErrorHttpStatus(error), headers: corsHeaders },
        )
      }

      return Response.json(
        {
          ok: true,
          status: 'ACTION_EVENTS_LISTED',
          data: Array.isArray(data) ? data : [],
        },
        { status: 200, headers: corsHeaders },
      )
    } catch (error) {
      if (error instanceof ActionEventContractError) {
        return contractErrorResponse({
          error,
          status: 'INVALID_ACTION_EVENT_QUERY',
          corsHeaders,
        })
      }

      return Response.json(
        {
          ok: false,
          status: 'ACTION_EVENTS_QUERY_ERROR',
          error:
            error instanceof Error && error.message
              ? error.message
              : 'Não foi possível consultar as ações do Companion.',
        },
        { status: 500, headers: corsHeaders },
      )
    }
  }

  return { POST: post, GET: get }
}
