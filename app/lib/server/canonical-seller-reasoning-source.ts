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
 * - Recuperação do especialista comercial: o raciocínio é avaliado no
 *   instante atual do vendedor (reference_time), não no instante em que o
 *   snapshot foi persistido — tempo decorrido muda a decisão.
 */
export type CanonicalSellerReasoningBundle = {
  reasoning: CommercialReasoning | null
  diagnostic_input:
    Awaited<
      ReturnType<
        typeof loadCompanionDiagnosticSnapshot
      >
    >['input'] | null
}

export async function loadCanonicalSellerReasoningBundle({
  admin,
  context,
}: {
  admin: SupabaseClient
  context: CanonicalSellerCommercialContext
}): Promise<CanonicalSellerReasoningBundle> {
  if (
    !context.current_reading ||
    context.state_read.mode !== 'found'
  ) {
    return {
      reasoning: null,
      diagnostic_input: null,
    }
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
    return {
      reasoning: null,
      diagnostic_input: null,
    }
  }

  // O snapshot comercial representa o instante da última análise; o
  // vendedor olha a venda AGORA. O silêncio entre os dois é evidência
  // comercial (Commercial Temporal Context), e os fatos operacionais que a
  // aba CLIENTE já mostra (relacionamento, SLA configurado) chegam ao
  // raciocínio canônico em vez de ficarem só na interface.
  const rawReasoning =
    buildCommercialReasoning({
      reading:
        context.current_reading.reading,
      cycle_state:
        context.state_read.state,
      diagnostic_input:
        snapshot.input,
      evaluated_at:
        context.reference_time,
      operational_context: {
        relationship:
          context.client_context
            .relationship,
        sla:
          context.client_context.sla,
      },
    })

  const reasoning =
    reconcileReasoningWithCommercialResponsibility({
      reasoning:
        rawReasoning,
      clientContext:
        context.client_context,
      referenceTime:
        context.reference_time,
    })

  return {
    reasoning,
    diagnostic_input:
      snapshot.input,
  }
}

export async function loadCanonicalSellerReasoning({
  admin,
  context,
}: {
  admin: SupabaseClient
  context: CanonicalSellerCommercialContext
}): Promise<CommercialReasoning | null> {
  const bundle =
    await loadCanonicalSellerReasoningBundle({
      admin,
      context,
    })

  return bundle.reasoning
}
