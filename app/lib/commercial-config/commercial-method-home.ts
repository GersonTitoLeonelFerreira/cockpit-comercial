import type { CommercialConfigWorkspace } from '@/app/types/commercial-config'
import type { CommercialMethodBuilderDraftRecord } from '@/app/types/commercial-method-builder'
import type { CommercialMethodConstructionRecord } from '@/app/types/commercial-method-construction'
import type { CommercialMethodDefinition } from '@/app/lib/companion/commercial-method-contract'

export type CommercialMethodNextAction =
  | 'start_diagnosis'
  | 'continue_diagnosis'
  | 'start_construction'
  | 'continue_construction'
  | 'review_method'
  | 'publish_changes'
  | 'up_to_date'

export interface CommercialMethodHomeState {
  published: {
    exists: boolean
    name: string | null
    version: number | null
    published_at: string | null
    companion_using: boolean
    definition: CommercialMethodDefinition | null
  }
  draft: {
    exists: boolean
    updated_at: string | null
    status: 'none' | 'diagnosis' | 'construction' | 'review_ready'
    has_unpublished_changes: boolean
  }
  progress: {
    label: string
    step: number
    total: number
  }
  next_action: {
    key: CommercialMethodNextAction
    label: string
    description: string
  }
}

function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true

  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }

    return a.every((item, index) => deepEqualJson(item, b[index]))
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>
    const right = b as Record<string, unknown>
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)

    if (leftKeys.length !== rightKeys.length) return false

    return leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        deepEqualJson(left[key], right[key]),
    )
  }

  return false
}

export function deriveCommercialMethodHomeState({
  builder,
  construction,
  workspace,
}: {
  builder: CommercialMethodBuilderDraftRecord | null
  construction: CommercialMethodConstructionRecord | null
  workspace: CommercialConfigWorkspace
}): CommercialMethodHomeState {
  const publishedVersion = workspace.published?.version ?? null
  const publishedDefinition =
    publishedVersion?.commercial_method_definition ?? null

  const companionUsing =
    publishedVersion?.status === 'published' &&
    publishedVersion.commercial_method_contract_version ===
      'commercial-method-v2' &&
    publishedDefinition?.contract_version === 'commercial-method-v2'

  const reviewMatchesPublished =
    construction?.status === 'review_ready' &&
    !!construction.method_definition &&
    !!publishedDefinition &&
    deepEqualJson(construction.method_definition, publishedDefinition)

  const constructionStep =
    construction?.construction?.construction_step ?? null

  let nextAction: CommercialMethodHomeState['next_action']
  let draftStatus: CommercialMethodHomeState['draft']['status'] = 'none'
  let progress = {
    label: 'Ainda não iniciado',
    step: 0,
    total: 5,
  }

  if (!builder) {
    nextAction = {
      key: 'start_diagnosis',
      label: 'Mapear minha operação',
      description:
        'Comece pelo diagnóstico guiado. A Yolen só sugere um método depois de entender como sua empresa vende.',
    }
  } else if (!builder.ready_for_method) {
    draftStatus = 'diagnosis'
    progress = {
      label: 'Mapeando a operação',
      step: 1,
      total: 5,
    }
    nextAction = {
      key: 'continue_diagnosis',
      label: 'Continuar diagnóstico',
      description:
        'Retome exatamente de onde parou. As respostas já salvas permanecem no rascunho.',
    }
  } else if (!construction?.construction || construction.status === 'not_started') {
    draftStatus = 'diagnosis'
    progress = {
      label: 'Diagnóstico concluído',
      step: 2,
      total: 5,
    }
    nextAction = {
      key: 'start_construction',
      label: 'Construir método sugerido',
      description:
        'Transforme o diagnóstico em uma estrutura proporcional à forma como seus clientes decidem.',
    }
  } else if (
    construction.status === 'editing' &&
    constructionStep === 'review'
  ) {
    draftStatus = 'construction'
    progress = {
      label: 'Revisão do método',
      step: 4,
      total: 5,
    }
    nextAction = {
      key: 'review_method',
      label: 'Revisar método',
      description:
        'Revise a estrutura final e os critérios antes de liberar a publicação.',
    }
  } else if (construction.status === 'editing') {
    draftStatus = 'construction'
    progress = {
      label: 'Construindo o método',
      step: 3,
      total: 5,
    }
    nextAction = {
      key: 'continue_construction',
      label: 'Continuar construção',
      description:
        'Continue ajustando etapas, critérios, perguntas e princípios do método.',
    }
  } else if (construction.status === 'review_ready' && !reviewMatchesPublished) {
    draftStatus = 'review_ready'
    progress = {
      label: 'Pronto para publicação',
      step: 5,
      total: 5,
    }
    nextAction = {
      key: 'publish_changes',
      label: publishedVersion ? 'Publicar alterações' : 'Publicar método',
      description: publishedVersion
        ? 'A versão ativa não muda até você confirmar explicitamente a nova publicação.'
        : 'A publicação exige sua confirmação e tornará este o primeiro método ativo da empresa.',
    }
  } else {
    draftStatus = construction?.status === 'review_ready'
      ? 'review_ready'
      : 'construction'
    progress = {
      label: 'Método atualizado',
      step: 5,
      total: 5,
    }
    nextAction = {
      key: 'up_to_date',
      label: 'Método atualizado — nenhuma ação necessária',
      description:
        'O método publicado está alinhado ao rascunho revisado. Você pode consultar ou iniciar uma nova evolução quando necessário.',
    }
  }

  const hasUnpublishedChanges =
    construction?.status === 'editing' ||
    (construction?.status === 'review_ready' && !reviewMatchesPublished)

  return {
    published: {
      exists: Boolean(publishedVersion),
      name: publishedVersion?.commercial_method_name || null,
      version: publishedVersion?.version_number ?? null,
      published_at: publishedVersion?.published_at ?? null,
      companion_using: companionUsing,
      definition:
        companionUsing && publishedDefinition
          ? publishedDefinition
          : null,
    },
    draft: {
      exists: Boolean(builder || construction?.construction),
      updated_at:
        construction?.method_updated_at ??
        builder?.updated_at ??
        null,
      status: draftStatus,
      has_unpublished_changes: hasUnpublishedChanges,
    },
    progress,
    next_action: nextAction,
  }
}
