import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import {
  classifyLeadMethodApplicability,
  type LeadMethodCurrentInteractionMessage,
} from '../../../lib/companion/lead-method-applicability'

import {
  normalizePublishedCommercialMethod,
} from '../../../lib/companion/lead-method-guidance'

import {
  composeSellerFacingGuidance,
} from '../../../lib/companion/lead-seller-guidance'

import {
  composeSellerMessage,
  type SellerMessageGuidance,
} from '../../../lib/companion/lead-seller-message'

import {
  createStatefulCopilotOpenAIProvider,
} from '../../../lib/companion/stateful-copilot-openai-provider'

import {
  CompanionConversationRegistrationError,
  loadCanonicalMessages,
  toCanonicalMessagePromptText,
  type CanonicalConversationMessage,
} from '../../../lib/server/companion-conversation-registration-loader'

import {
  CompanionLeadSummaryError,
  resolveCompanionLeadIdentity,
} from '../../../lib/server/companion-lead-summary-store'

import { verifyCompanionRequestToken } from '../../../lib/server/companion-token'

import {
  CompanionMethodStageStoreError,
  loadCompanionMethodStage,
  saveCompanionMethodStage,
} from '../../../lib/server/companion-method-stage-store'

type MethodGuidanceBody = {
  cycle_id?: unknown
  conversation_key?: unknown
  working_summary?: unknown
  operation?: unknown
  seller_intent?: unknown
  guidance_status?: unknown
  guidance_stage_name?: unknown
  guidance_next_step?: unknown
}

const CURRENT_INTERACTION_GAP_MS =
  4 * 60 * 60 * 1000
const CURRENT_INTERACTION_LIMIT = 40
const MAX_SELLER_INTENT_LENGTH = 1000

function getCorsHeaders(request: Request) {
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

function buildCurrentInteraction(
  messages: readonly CanonicalConversationMessage[],
): LeadMethodCurrentInteractionMessage[] {
  const usable = messages
    .filter((message) => {
      if (message.is_deleted) {
        return false
      }

      if (message.content_type === 'audio') {
        return true
      }

      return typeof message.text === 'string' && Boolean(message.text.trim())
    })
    .map((message) => ({
      direction: message.direction,
      occurred_at: message.occurred_at,
      text: toCanonicalMessagePromptText(message) || '',
    }))

  if (usable.length === 0) {
    return []
  }

  let startIndex = usable.length - 1

  while (startIndex > 0) {
    const previousAt = Date.parse(
      usable[startIndex - 1].occurred_at,
    )
    const currentAt = Date.parse(
      usable[startIndex].occurred_at,
    )

    if (
      Number.isFinite(previousAt) &&
      Number.isFinite(currentAt) &&
      currentAt - previousAt >
        CURRENT_INTERACTION_GAP_MS
    ) {
      break
    }

    startIndex -= 1
  }

  return usable.slice(
    Math.max(
      startIndex,
      usable.length - CURRENT_INTERACTION_LIMIT,
    ),
  )
}

function buildClientGuidance(
  body: MethodGuidanceBody,
  methodName: string,
): SellerMessageGuidance | null {
  const status =
    typeof body.guidance_status === 'string'
      ? body.guidance_status
      : null

  if (status === 'not_applicable') {
    return {
      status: 'not_applicable',
      method_name: methodName,
      stage_name: null,
      next_step: null,
    }
  }

  if (status !== 'ready') {
    return null
  }

  const stageName =
    typeof body.guidance_stage_name === 'string'
      ? body.guidance_stage_name.trim() || null
      : null
  const nextStep =
    typeof body.guidance_next_step === 'string'
      ? body.guidance_next_step.trim() || null
      : null

  if (!nextStep) {
    return null
  }

  return {
    status: 'ready',
    method_name: methodName,
    stage_name: stageName,
    next_step: nextStep,
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request)
  const token = verifyCompanionRequestToken(request)

  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        code: 'INVALID_COMPANION_SESSION',
        error: 'Sessão do Companion inválida ou expirada.',
      },
      {
        status: 401,
        headers: corsHeaders,
      },
    )
  }

  const body = (await request.json().catch(() => ({}))) as MethodGuidanceBody
  const workingSummary =
    typeof body.working_summary === 'string'
      ? body.working_summary.trim()
      : ''
  const operation =
    body.operation === 'generate_message'
      ? 'generate_message'
      : 'guidance'
  const sellerIntent =
    typeof body.seller_intent === 'string'
      ? body.seller_intent.trim()
      : ''

  if (
    operation === 'generate_message' &&
    (
      !sellerIntent ||
      sellerIntent.length > MAX_SELLER_INTENT_LENGTH
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        code: 'INVALID_SELLER_INTENT',
        error:
          sellerIntent.length > MAX_SELLER_INTENT_LENGTH
            ? 'A intenção do vendedor ficou longa demais.'
            : 'Diga primeiro o que você quer fazer agora.',
      },
      {
        status: 400,
        headers: corsHeaders,
      },
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        ok: false,
        code: 'METHOD_GUIDANCE_SERVER_NOT_CONFIGURED',
        error: 'Servidor da orientação comercial não está configurado.',
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  try {
    const identity = await resolveCompanionLeadIdentity({
      admin,
      token,
      cycle_id: body.cycle_id,
      conversation_key: body.conversation_key,
    })

    const { data: publishedConfigRow, error: methodError } = await admin
      .from('company_commercial_config_versions')
      .select(`
        id,
        version_number,
        commercial_method_name,
        commercial_method_description,
        commercial_method_contract_version,
        commercial_method_definition,
        business_description,
        target_audience,
        value_proposition,
        communication_tone,
        required_behaviors,
        prohibited_behaviors
      `)
      .eq('company_id', identity.company_id)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (methodError) {
      return NextResponse.json(
        {
          ok: false,
          code: 'METHOD_GUIDANCE_CONFIG_LOAD_FAILED',
          error: 'Não foi possível carregar o método comercial publicado.',
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      )
    }

    // O Companion só pode tratar commercial-method-v2 publicado e válido
    // como método operacional. company_commercial_method_steps e
    // commercial_method_description deixaram de ser fonte ativa: uma
    // configuração publicada sem V2 válido não usa mais nenhuma delas
    // como rede de segurança (ver ONDA 8 / FRENTE 2).
    const methodResult = normalizePublishedCommercialMethod(
      publishedConfigRow,
    )

    if (methodResult.status === 'invalid') {
      console.error(
        '[METHOD_GUIDANCE_API] commercial method invalid',
        {
          company_id: identity.company_id,
          config_version_id:
            typeof publishedConfigRow?.id === 'string'
              ? publishedConfigRow.id
              : null,
          reason: methodResult.reason,
        },
      )

      return NextResponse.json(
        {
          ok: true,
          data: {
            status: 'invalid_method',
            method_name:
              typeof publishedConfigRow?.commercial_method_name === 'string'
                ? publishedConfigRow.commercial_method_name
                : null,
            method_config_version_id:
              typeof publishedConfigRow?.id === 'string'
                ? publishedConfigRow.id
                : null,
            stage_key: null,
            stage_name: null,
            stage_reason: null,
            next_step: null,
            error: 'O método comercial publicado está inválido e não pode orientar a conversa agora.',
          },
        },
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    if (methodResult.status === 'not_configured') {
      return NextResponse.json(
        {
          ok: true,
          data: {
            status: 'missing_method',
            method_name: null,
            method_config_version_id: null,
            stage_key: null,
            stage_name: null,
            stage_reason: null,
            next_step: null,
            error: null,
          },
        },
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    const method = methodResult.method

    const provider = createStatefulCopilotOpenAIProvider({
      timeout_ms: 45_000,
      max_output_tokens: 900,
    })

    if (operation === 'generate_message') {
      const canonicalMessages =
        await loadCanonicalMessages({
          admin,
          companyId: identity.company_id,
          cycleId: identity.cycle_id,
          conversationKey:
            identity.conversation_key,
        })

      const generation = await composeSellerMessage({
        workingSummary: workingSummary || null,
        currentInteraction:
          buildCurrentInteraction(
            canonicalMessages,
          ),
        sellerIntent,
        method,
        guidance: buildClientGuidance(
          body,
          method.name,
        ),
        provider,
      })

      return NextResponse.json(
        {
          ok: true,
          data: generation,
        },
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    const canonicalMessages = await loadCanonicalMessages({
      admin,
      companyId: identity.company_id,
      cycleId: identity.cycle_id,
      conversationKey: identity.conversation_key,
    })

    const currentInteraction =
      buildCurrentInteraction(canonicalMessages)

    const applicability =
      await classifyLeadMethodApplicability({
        workingSummary: workingSummary || null,
        currentInteraction,
        provider,
      })

    if (applicability.status === 'error') {
      return NextResponse.json(
        {
          ok: true,
          data: {
            status: 'error',
            method_name: method.name,
            method_config_version_id: method.id,
            stage_key: null,
            stage_name: null,
            stage_reason: null,
            next_step: null,
            seller_intents: [],
            error: applicability.reason,
          },
        },
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    const guidanceMode =
      applicability.status === 'no_commercial_action'
        ? 'operational'
        : 'commercial'

    // Fase 12A, Frente 2B — Blocker 3: carrega a última etapa válida
    // conhecida para este escopo (company_id, cycle_id, conversation_key)
    // ANTES de chamar o modelo, para alimentar o gate determinístico
    // anti-regressão dentro de composeSellerFacingGuidance.
    const previousStage =
      guidanceMode === 'commercial'
        ? await loadCompanionMethodStage({
            admin,
            companyId: identity.company_id,
            cycleId: identity.cycle_id,
            conversationKey: identity.conversation_key,
          })
        : null

    const guidance = await composeSellerFacingGuidance({
      mode: guidanceMode,
      workingSummary: workingSummary || null,
      currentInteraction,
      method,
      provider,
      previousStage,
    })

    // Persiste a etapa aceita (já passada pelo gate) para a PRÓXIMA
    // chamada poder comparar contra ela. Só grava quando há um estágio
    // real (mode commercial + status ready) — silêncio/erro/operacional
    // não alteram o estágio persistido.
    if (
      guidanceMode === 'commercial' &&
      guidance.status === 'ready' &&
      guidance.stage_key &&
      guidance.stage_name
    ) {
      const stageDefinition = method.stages.find(
        (stage) => stage.key === guidance.stage_key,
      )

      if (stageDefinition) {
        await saveCompanionMethodStage({
          admin,
          companyId: identity.company_id,
          cycleId: identity.cycle_id,
          conversationKey: identity.conversation_key,
          methodConfigVersionId: method.id,
          stageKey: stageDefinition.key,
          stageName: stageDefinition.name,
          stageDisplayOrder: stageDefinition.display_order,
          stageReason: guidance.stage_reason,
        })
      }
    }

    return NextResponse.json(
      {
        ok: true,
        data: guidance,
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    )
  } catch (error) {
    if (error instanceof CompanionLeadSummaryError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          error: error.message,
          retryable: error.retryable,
        },
        {
          status: error.status_code,
          headers: corsHeaders,
        },
      )
    }

    if (error instanceof CompanionMethodStageStoreError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          error: error.message,
          retryable: error.retryable,
        },
        {
          status: error.status_code,
          headers: corsHeaders,
        },
      )
    }

    if (
      error instanceof
      CompanionConversationRegistrationError
    ) {
      return NextResponse.json(
        {
          ok: false,
          code:
            'METHOD_GUIDANCE_CURRENT_INTERACTION_LOAD_FAILED',
          error:
            'Não foi possível carregar a conversa atual para definir o próximo passo.',
          retryable: error.retryable,
        },
        {
          status: error.status_code,
          headers: corsHeaders,
        },
      )
    }

    console.error(
      '[METHOD_GUIDANCE_API] unexpected error',
      error instanceof Error ? error.name : 'unknown',
    )

    return NextResponse.json(
      {
        ok: false,
        code: 'METHOD_GUIDANCE_UNEXPECTED_ERROR',
        error: 'Não foi possível definir o próximo passo agora.',
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }
}
