import 'server-only'

// Leitura completa — "Gerar mensagem" da aba MENSAGEM (HML, flag
// COMPANION_FULL_READING_PANEL).
//
// Uma chamada ao Claude com a transcrição, a leitura completa mais recente
// do ciclo (analise_markdown + decisao), o kanban, o cadastro e o objetivo
// do vendedor. Mesmo modelo da leitura, com esforço menor para responder
// rápido. Só lê o banco: nenhuma telemetria, nenhuma escrita. A mensagem
// nunca é enviada sozinha; a extensão só oferece Incluir/Copiar.

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  CLAUDE_EFFORT_LEVELS,
  callClaudeReading,
  type ClaudeEffort,
} from '../companion/full-reading/anthropic-client'

import {
  FULL_READING_PROMPT_VERSION,
  type FullReadingCommercialContext,
  type FullReadingKanbanContext,
} from '../companion/full-reading/prompt'

import {
  FULL_READING_MESSAGE_JSON_SCHEMA,
  buildFullReadingMessageSystemPrompt,
  buildFullReadingMessageUserPrompt,
  parseFullReadingMessageOutput,
} from '../companion/full-reading/message-prompt'

import {
  buildFullReadingTranscript,
} from '../companion/full-reading/transcript'

import type {
  NormalizedLedgerMessage,
} from '../companion/stateful-copilot-real-context-loader'

import {
  FULL_READING_RUNS_TABLE,
  buildCommercialContextFromConfig,
  loadFullReadingConfig,
  loadFullReadingKanban,
  loadFullReadingMessages,
  resolveFullReadingModel,
} from './full-reading-runner'

export const DEFAULT_FULL_READING_MESSAGE_EFFORT: ClaudeEffort =
  'low'

export const FULL_READING_MESSAGE_MAX_TOKENS =
  4_000

export const FULL_READING_MESSAGE_TIMEOUT_MS =
  60_000

export const MAX_SELLER_INTENT_LENGTH =
  1_000

type EnvLike =
  Record<string, string | undefined>

export function resolveFullReadingMessageEffort(
  env: EnvLike = process.env,
): ClaudeEffort {
  const configured =
    env.COMPANION_FULL_READING_MESSAGE_EFFORT?.trim().toLowerCase()

  return (
    CLAUDE_EFFORT_LEVELS.find((level) => level === configured) ??
    DEFAULT_FULL_READING_MESSAGE_EFFORT
  )
}

export class FullReadingMessageError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'FullReadingMessageError'
    this.code = code
    this.status = status
  }
}

export type FullReadingMessageScope = {
  company_id: string
  cycle_id: string
  conversation_key: string
}

type StoredReading = {
  run_id: string
  analysis_markdown: string
  decision: Record<string, unknown>
}

export async function loadLatestFullReading({
  admin,
  scope,
}: {
  admin: SupabaseClient
  scope: FullReadingMessageScope
}): Promise<StoredReading | null> {
  const { data, error } =
    await admin
      .from(FULL_READING_RUNS_TABLE)
      .select('run_id, analysis_markdown, decision')
      .eq('company_id', scope.company_id)
      .eq('cycle_id', scope.cycle_id)
      .eq('conversation_key', scope.conversation_key)
      .eq('status', 'succeeded')
      .eq('prompt_version', FULL_READING_PROMPT_VERSION)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

  if (error) {
    throw new FullReadingMessageError(
      'FULL_READING_READ_FAILED',
      'Não foi possível ler a leitura completa.',
      502,
    )
  }

  const row =
    data as { run_id?: unknown; analysis_markdown?: unknown; decision?: unknown } | null

  if (
    !row ||
    typeof row.run_id !== 'string' ||
    typeof row.analysis_markdown !== 'string' ||
    !row.decision ||
    typeof row.decision !== 'object'
  ) {
    return null
  }

  return {
    run_id: row.run_id,
    analysis_markdown: row.analysis_markdown,
    decision: row.decision as Record<string, unknown>,
  }
}

// A decisão vai ao modelo sem os campos de controle do sistema.
export function decisionForMessagePrompt(
  decision: Record<string, unknown>,
): Record<string, unknown> {
  const copy =
    { ...decision }

  delete copy.sistema

  return copy
}

export async function generateFullReadingMessage({
  admin,
  scope,
  sellerIntent,
  apiKey,
  now = new Date().toISOString(),
  env = process.env,
  fetchImpl,
  loadReading = loadLatestFullReading,
  loadMessages = loadFullReadingMessages,
  loadKanban = loadFullReadingKanban,
  loadConfig = loadFullReadingConfig,
}: {
  admin: SupabaseClient
  scope: FullReadingMessageScope
  sellerIntent: string
  apiKey: string
  now?: string
  env?: EnvLike
  fetchImpl?: typeof fetch
  loadReading?: typeof loadLatestFullReading
  loadMessages?: (args: {
    admin: SupabaseClient
    companyId: string
    cycleId: string
    conversationKey: string
    referenceTime: string
  }) => Promise<NormalizedLedgerMessage[]>
  loadKanban?: (args: {
    admin: SupabaseClient
    companyId: string
    cycleId: string
  }) => Promise<FullReadingKanbanContext | null>
  loadConfig?: typeof loadFullReadingConfig
}): Promise<{ message: string; run_id: string }> {
  const intent =
    sellerIntent.trim()

  if (!intent || intent.length > MAX_SELLER_INTENT_LENGTH) {
    throw new FullReadingMessageError(
      'INVALID_SELLER_INTENT',
      intent
        ? 'O objetivo ficou longo demais.'
        : 'Diga primeiro o que você quer comunicar.',
      400,
    )
  }

  if (!apiKey) {
    throw new FullReadingMessageError(
      'ANTHROPIC_API_KEY_MISSING',
      'A geração de mensagem não está configurada.',
      503,
    )
  }

  const reading =
    await loadReading({ admin, scope })

  if (!reading) {
    throw new FullReadingMessageError(
      'FULL_READING_NOT_READY',
      'A leitura completa desta conversa ainda não terminou.',
      409,
    )
  }

  const messages =
    await loadMessages({
      admin,
      companyId: scope.company_id,
      cycleId: scope.cycle_id,
      conversationKey: scope.conversation_key,
      referenceTime: now,
    })

  const transcript =
    buildFullReadingTranscript(messages)

  let kanban: FullReadingKanbanContext | null =
    null

  try {
    kanban =
      await loadKanban({
        admin,
        companyId: scope.company_id,
        cycleId: scope.cycle_id,
      })
  } catch {
    kanban = null
  }

  let commercialContext: FullReadingCommercialContext | null =
    null

  try {
    commercialContext =
      buildCommercialContextFromConfig(
        await loadConfig({
          admin,
          companyId: scope.company_id,
        }),
      )
  } catch {
    commercialContext = null
  }

  const response =
    await callClaudeReading({
      apiKey,
      model: resolveFullReadingModel(env),
      system: buildFullReadingMessageSystemPrompt(),
      userText: buildFullReadingMessageUserPrompt({
        transcriptText: transcript.text,
        referenceTime: now,
        commercialContext,
        kanban,
        analysisMarkdown: reading.analysis_markdown,
        decision: decisionForMessagePrompt(reading.decision),
        sellerIntent: intent,
      }),
      maxTokens: FULL_READING_MESSAGE_MAX_TOKENS,
      effort: resolveFullReadingMessageEffort(env),
      outputSchema:
        FULL_READING_MESSAGE_JSON_SCHEMA as unknown as Record<string, unknown>,
      timeoutMs: FULL_READING_MESSAGE_TIMEOUT_MS,
      fetchImpl,
    })

  return {
    message: parseFullReadingMessageOutput(response.text),
    run_id: reading.run_id,
  }
}
