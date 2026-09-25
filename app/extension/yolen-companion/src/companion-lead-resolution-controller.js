;(function initYolenCompanionLeadResolutionController(root) {
  'use strict'

  const DOMAIN_ERROR_STATUSES = Object.freeze([
    'LEAD_WITHOUT_CYCLE',
    'SOFT_DELETED',
    'MULTIPLE_MATCHES',
    'DOMAIN_ERROR',
    'RESOLUTION_ERROR',
  ])

  const COMMERCIAL_STATUSES = Object.freeze([
    'OWNED_BY_ME',
    'IN_POOL',
    'OWNED_BY_OTHER',
    'CLOSED_CYCLE',
  ])

  function isPlainObject(value) {
    return Boolean(value) &&
      typeof value === 'object' &&
      !Array.isArray(value)
  }

  function normalizeOptionalString(value) {
    if (typeof value !== 'string') {
      return null
    }

    const normalized = value.trim()

    return normalized.length > 0
      ? normalized
      : null
  }

  function normalizeOptionalIdentifier(value) {
    if (
      typeof value === 'string' &&
      value.trim().length > 0
    ) {
      return value.trim()
    }

    if (
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      return value
    }

    return null
  }

  function readBoolean(
    canonicalSource,
    canonicalKey,
    legacySource,
    legacyKey = canonicalKey,
  ) {
    if (
      isPlainObject(canonicalSource) &&
      typeof canonicalSource[canonicalKey] ===
        'boolean'
    ) {
      return canonicalSource[canonicalKey]
    }

    if (
      isPlainObject(legacySource) &&
      typeof legacySource[legacyKey] ===
        'boolean'
    ) {
      return legacySource[legacyKey]
    }

    return false
  }

  // Compatibilidade com payload legacy (backend sem `capabilities`):
  // capability canônica booleana SEMPRE vence; só na ausência dela a
  // capability de ação reproduz o comportamento legacy comprovado
  // (presenter por status + open_yolen_url = lead && cycle).
  function readActionCapability(
    canonicalSource,
    canonicalKey,
    legacyValue,
  ) {
    if (
      isPlainObject(canonicalSource) &&
      typeof canonicalSource[canonicalKey] ===
        'boolean'
    ) {
      return canonicalSource[canonicalKey]
    }

    return legacyValue === true
  }

  function createDomainResolutionViewModel(
    payload,
  ) {
    if (!isPlainObject(payload)) {
      return null
    }

    const canonicalCapabilities =
      isPlainObject(payload.capabilities)
        ? payload.capabilities
        : null

    const legacyActions =
      isPlainObject(payload.actions)
        ? payload.actions
        : null

    const rawCycle =
      isPlainObject(payload.cycle)
        ? payload.cycle
        : null

    const rawLeadDisplay =
      isPlainObject(payload.lead_display)
        ? payload.lead_display
        : null

    const rawLegacyLead =
      isPlainObject(payload.lead)
        ? payload.lead
        : null

    const rawOwnershipDisplay =
      isPlainObject(
        payload.ownership_display,
      )
        ? payload.ownership_display
        : null

    const rawFlags =
      isPlainObject(payload.flags)
        ? payload.flags
        : null

    const cycleId =
      normalizeOptionalIdentifier(
        rawCycle?.id,
      )

    const cycleStatus =
      normalizeOptionalString(
        rawCycle?.status,
      )

    const leadName =
      normalizeOptionalString(
        rawLeadDisplay?.name ??
          rawLegacyLead?.name,
      )

    const ownerName =
      normalizeOptionalString(
        rawOwnershipDisplay?.owner_name ??
          rawCycle?.owner_name,
      )

    const rawStatus =
      normalizeOptionalString(
        payload.status,
      )

    const cycle =
      cycleId !== null ||
      cycleStatus !== null
        ? Object.freeze({
            id: cycleId,
            status: cycleStatus,
          })
        : null

    const leadDisplay =
      Object.freeze({
        name: leadName,
      })

    const ownershipDisplay =
      Object.freeze({
        owner_name: ownerName,
      })

    const capabilities =
      Object.freeze({
        can_create_lead:
          readActionCapability(
            canonicalCapabilities,
            'can_create_lead',
            legacyActions
              ?.can_create_lead_inside_extension ===
              true ||
              rawStatus === 'NOT_FOUND',
          ),

        can_analyze_conversation:
          readBoolean(
            canonicalCapabilities,
            'can_analyze_conversation',
            legacyActions,
          ),

        can_apply_suggestion:
          readBoolean(
            canonicalCapabilities,
            'can_apply_suggestion',
            legacyActions,
          ),

        can_open_pool:
          readActionCapability(
            canonicalCapabilities,
            'can_open_pool',
            rawStatus === 'IN_POOL',
          ),

        can_open_cycle:
          readActionCapability(
            canonicalCapabilities,
            'can_open_cycle',
            Boolean(
              rawLegacyLead &&
              rawCycle,
            ),
          ),

        can_register_conversation:
          readBoolean(
            canonicalCapabilities,
            'can_register_conversation',
            legacyActions,
          ),

        can_enrich_lead:
          readBoolean(
            canonicalCapabilities,
            'can_enrich_lead',
            legacyActions,
          ),
      })

    const flags =
      Object.freeze({
        is_closed:
          rawFlags?.is_closed === true,

        is_owned_by_me:
          rawFlags?.is_owned_by_me ===
          true,

        is_pool:
          rawFlags?.is_pool === true,
      })

    return Object.freeze({
      status: rawStatus,

      user_message:
        normalizeOptionalString(
          payload.user_message,
        ),

      cycle,
      lead_display: leadDisplay,
      ownership_display:
        ownershipDisplay,
      capabilities,
      flags,
    })
  }

  function canOpenWorkspace(
    resolution,
  ) {
    return Boolean(
      resolution?.cycle?.id,
    ) &&
      resolution
        ?.capabilities
        ?.can_analyze_conversation ===
        true &&
      resolution
        ?.flags
        ?.is_closed !== true
  }

  function createResolutionOutcome(
    state,
    {
      requiresPhoneFallback = false,
      workspaceReady = false,
    } = {},
  ) {
    return Object.freeze({
      state,
      requires_phone_fallback:
        requiresPhoneFallback,
      workspace_ready:
        workspaceReady,
    })
  }

  function deriveCanonicalResolutionOutcome(
    resolution,
    {
      hasTrustedPhone = false,
    } = {},
  ) {
    const status =
      resolution?.status ?? null

    if (
      status ===
      'CONTACT_NOT_LINKED'
    ) {
      if (hasTrustedPhone) {
        return createResolutionOutcome(
          'RESOLVING',
          {
            requiresPhoneFallback:
              true,
          },
        )
      }

      return createResolutionOutcome(
        'NO_CONTACT_EVIDENCE',
      )
    }

    if (
      status === 'NO_PHONE_DETECTED' ||
      status ===
        'PHONE_EVIDENCE_UNAVAILABLE' ||
      status ===
        'PHONE_EVIDENCE_AMBIGUOUS'
    ) {
      return createResolutionOutcome(
        'NO_CONTACT_EVIDENCE',
      )
    }

    if (status === 'NOT_FOUND') {
      return createResolutionOutcome(
        hasTrustedPhone
          ? 'NOT_FOUND'
          : 'NO_CONTACT_EVIDENCE',
      )
    }

    if (
      DOMAIN_ERROR_STATUSES.includes(
        status,
      )
    ) {
      return createResolutionOutcome(
        'RESOLUTION_ERROR',
      )
    }

    if (
      status === 'NETWORK_ERROR'
    ) {
      return createResolutionOutcome(
        'NETWORK_ERROR',
      )
    }

    if (
      status === 'BACKEND_ERROR'
    ) {
      return createResolutionOutcome(
        'BACKEND_ERROR',
      )
    }

    if (status === 'AUTH_ERROR') {
      return createResolutionOutcome(
        'NO_SESSION',
      )
    }

    if (
      COMMERCIAL_STATUSES.includes(
        status,
      )
    ) {
      return createResolutionOutcome(
        status,
        {
          workspaceReady:
            canOpenWorkspace(
              resolution,
            ),
        },
      )
    }

    return createResolutionOutcome(
      'RESOLUTION_ERROR',
    )
  }

  const api = Object.freeze({
    DOMAIN_ERROR_STATUSES,
    COMMERCIAL_STATUSES,
    createDomainResolutionViewModel,
    canOpenWorkspace,
    deriveCanonicalResolutionOutcome,
  })

  root.YolenCompanionLeadResolutionController =
    api

  if (
    typeof module !== 'undefined' &&
    module.exports
  ) {
    module.exports = api
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : this,
)
