import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  buildCommercialReasoning,
} from '@/app/lib/companion/commercial-reasoning-engine'

import type {
  CommercialReasoning,
} from '@/app/lib/companion/commercial-reasoning-contract'

import {
  loadCompanionDiagnosticSnapshot,
} from './companion-diagnostic-snapshot'

import {
  reconcileReasoningWithCommercialResponsibility,
} from './canonical-commercial-responsibility'

import type {
  CanonicalSellerCommercialContext,
} from './canonical-seller-commercial-context-loader'

/**
 * FASE 16-R6 — ponte única entre a fotografia comercial canônica da R1 e
 * o Commercial Reasoning Engine da R4.
 *
 * Regras:
 * - não recalcula Commercial Reading;
 * - não escolhe outro estado comercial;
 * - não lê DOM/viewport;
 * - só produz reasoning quando leitura e state pertencem ao mesmo snapshot;
 * - Company Knowledge vem do mesmo Diagnostic Snapshot versionado já usado
 *   pelo Companion, nunca de regras paralelas no presenter;
 * - FASE 16.9: responsabilidade operacional determinística (quem está
 *   aguardando quem) reconcilia a decisão final para impedir que um gap de
 *   descoberta mande o vendedor repetir uma ação que já foi executada.
 */
export async function loadCanonicalSellerReasoning({
  admin,
  context,
}: {
  admin: SupabaseClient
  context: CanonicalSellerCommercialContext
}): Promise<CommercialReasoning | null> {
  if (
    !context.current_reading ||
    context.state_read.mode !== 'found'
  ) {
    return null
  }

  const snapshot =
    await loadCompanionDiagnosticSnapshot({
      admin,
      company_id:
        context.company_id,
      cycle_id:
        context.cycle_id,
      conversation_key:
        context.conversation_key,
      reference_time:
        context.ledger_reference_time,
    })

  if (
    snapshot.source.company_id !==
      context.company_id ||
    snapshot.source.cycle_id !==
      context.cycle_id ||
    snapshot.source.conversation_key !==
      context.conversation_key
  ) {
    return null
  }

  const reasoning =
    buildCommercialReasoning({
      reading:
        context.current_reading.reading,
      cycle_state:
        context.state_read.state,
      diagnostic_input:
        snapshot.input,
    })

  return reconcileReasoningWithCommercialResponsibility({
    reasoning,
    clientContext:
      context.client_context,
    referenceTime:
      context.reference_time,
  })
}
