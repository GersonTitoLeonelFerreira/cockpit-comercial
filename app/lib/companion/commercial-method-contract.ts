// ============================================================================
// Yolen — Inteligência Comercial
// Contrato semântico do método comercial
//
// O método orienta o raciocínio comercial. Ele NÃO define um roteiro mecânico
// de mensagens nem obriga o vendedor a executar perguntas em sequência.
// ============================================================================

export const COMMERCIAL_METHOD_CONTRACT_VERSION =
  'commercial-method-v2' as const

export const COMMERCIAL_METHOD_STAGE_REQUIREMENTS = [
  'required',
  'conditional',
  'optional',
] as const

export type CommercialMethodStageRequirement =
  (typeof COMMERCIAL_METHOD_STAGE_REQUIREMENTS)[number]

export type CommercialMethodDimension = {
  key: string
  name: string
  objective: string
  evidence_criteria: string[]
}

export type CommercialMethodStageDefinition = {
  key: string
  display_order: number

  name: string
  objective: string

  requirement:
    CommercialMethodStageRequirement

  /**
   * Evidências que permitem considerar a etapa suficientemente concluída.
   * Não significa que todas precisem surgir por meio de perguntas do vendedor.
   */
  completion_criteria: string[]

  /**
   * Evidências que demonstram progresso real, mas ainda não permitem
   * considerar a etapa suficientemente compreendida.
   */
  partial_completion_criteria: string[]

  /**
   * Condições comerciais nas quais uma etapa condicional pode ser pulada.
   * Uma etapa "required" não pode possuir skip_conditions.
   */
  skip_conditions: string[]

  /**
   * Perguntas possíveis. São referências, nunca checklist obrigatório.
   */
  recommended_questions: string[]

  /**
   * Erros que descaracterizam ou prejudicam a aplicação da etapa.
   */
  common_mistakes: string[]

  /**
   * Situações que justificam aprofundar a compreensão antes de avançar.
   */
  deepen_when: string[]

  /**
   * Condições que indicam que já existe informação suficiente.
   * Serve para impedir interrogatório e descoberta infinita.
   */
  sufficient_when: string[]

  /**
   * Condições nas quais faz sentido avançar comercialmente.
   */
  advance_when: string[]

  /**
   * Condições nas quais esperar é uma decisão comercial válida.
   */
  wait_when: string[]

  /**
   * Condições nas quais novas perguntas deixariam de acrescentar valor.
   */
  stop_asking_when: string[]

  /**
   * Subestrutura interna sem transformar a etapa em uma sequência rígida.
   *
   * Exemplo: TOUR pode observar contexto, necessidade, impacto e critérios
   * de decisão como dimensões do diagnóstico, sem exigir pergunta 1 -> 2 -> 3.
   */
  dimensions: CommercialMethodDimension[]
}

export type CommercialMethodDefinition = {
  contract_version:
    typeof COMMERCIAL_METHOD_CONTRACT_VERSION

  name: string
  description: string

  /**
   * Princípios vinculantes do método.
   */
  principles: string[]

  /**
   * A ordem é apenas uma referência de leitura e progressão.
   * As etapas podem sobrepor-se, ser satisfeitas por evidências já existentes
   * ou ser puladas quando o próprio contrato permitir.
   */
  stages: CommercialMethodStageDefinition[]
}

export type CommercialMethodValidationIssue = {
  path: string
  code:
    | 'INVALID_VALUE'
    | 'DUPLICATE_KEY'
    | 'DUPLICATE_ORDER'
    | 'REQUIRED_STAGE_CANNOT_BE_SKIPPED'
    | 'CONDITIONAL_STAGE_REQUIRES_SKIP_CONDITION'
  message: string
}

export type CommercialMethodValidationResult = {
  valid: boolean
  issues: CommercialMethodValidationIssue[]
}

const KEY_PATTERN =
  /^[a-z0-9]+(?:_[a-z0-9]+)*$/

function hasText(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    Boolean(value.trim())
  )
}

function validateTextArray({
  value,
  path,
  required = false,
  issues,
}: {
  value: unknown
  path: string
  required?: boolean
  issues: CommercialMethodValidationIssue[]
}) {
  if (!Array.isArray(value)) {
    issues.push({
      path,
      code: 'INVALID_VALUE',
      message:
        `${path} precisa ser uma lista de textos.`,
    })
    return
  }

  if (
    required &&
    value.length === 0
  ) {
    issues.push({
      path,
      code: 'INVALID_VALUE',
      message:
        `${path} precisa possuir ao menos um item.`,
    })
    return
  }

  value.forEach((item, index) => {
    if (!hasText(item)) {
      issues.push({
        path:
          `${path}[${index}]`,
        code: 'INVALID_VALUE',
        message:
          `${path}[${index}] precisa possuir texto válido.`,
      })
    }
  })
}

function validateDimension({
  dimension,
  stagePath,
  dimensionIndex,
  dimensionKeys,
  issues,
}: {
  dimension: CommercialMethodDimension
  stagePath: string
  dimensionIndex: number
  dimensionKeys: Set<string>
  issues: CommercialMethodValidationIssue[]
}) {
  const path =
    `${stagePath}.dimensions[${dimensionIndex}]`

  if (
    !hasText(dimension.key) ||
    !KEY_PATTERN.test(dimension.key)
  ) {
    issues.push({
      path: `${path}.key`,
      code: 'INVALID_VALUE',
      message:
        'A chave da dimensão deve usar letras minúsculas, números e underscore.',
    })
  } else if (
    dimensionKeys.has(dimension.key)
  ) {
    issues.push({
      path: `${path}.key`,
      code: 'DUPLICATE_KEY',
      message:
        `A dimensão ${dimension.key} aparece mais de uma vez na etapa.`,
    })
  } else {
    dimensionKeys.add(
      dimension.key,
    )
  }

  if (!hasText(dimension.name)) {
    issues.push({
      path: `${path}.name`,
      code: 'INVALID_VALUE',
      message:
        'Toda dimensão precisa possuir um nome.',
    })
  }

  if (!hasText(dimension.objective)) {
    issues.push({
      path: `${path}.objective`,
      code: 'INVALID_VALUE',
      message:
        'Toda dimensão precisa possuir um objetivo.',
    })
  }

  validateTextArray({
    value:
      dimension.evidence_criteria,
    path:
      `${path}.evidence_criteria`,
    required:
      true,
    issues,
  })
}

function validateStage({
  stage,
  stageIndex,
  stageKeys,
  stageOrders,
  issues,
}: {
  stage: CommercialMethodStageDefinition
  stageIndex: number
  stageKeys: Set<string>
  stageOrders: Set<number>
  issues: CommercialMethodValidationIssue[]
}) {
  const path =
    `stages[${stageIndex}]`

  if (
    !hasText(stage.key) ||
    !KEY_PATTERN.test(stage.key)
  ) {
    issues.push({
      path: `${path}.key`,
      code: 'INVALID_VALUE',
      message:
        'A chave da etapa deve usar letras minúsculas, números e underscore.',
    })
  } else if (
    stageKeys.has(stage.key)
  ) {
    issues.push({
      path: `${path}.key`,
      code: 'DUPLICATE_KEY',
      message:
        `A etapa ${stage.key} aparece mais de uma vez.`,
    })
  } else {
    stageKeys.add(
      stage.key,
    )
  }

  if (
    !Number.isSafeInteger(
      stage.display_order,
    ) ||
    stage.display_order <= 0
  ) {
    issues.push({
      path:
        `${path}.display_order`,
      code: 'INVALID_VALUE',
      message:
        'A ordem de apresentação precisa ser um inteiro positivo.',
    })
  } else if (
    stageOrders.has(
      stage.display_order,
    )
  ) {
    issues.push({
      path:
        `${path}.display_order`,
      code: 'DUPLICATE_ORDER',
      message:
        `A ordem ${stage.display_order} aparece mais de uma vez.`,
    })
  } else {
    stageOrders.add(
      stage.display_order,
    )
  }

  if (!hasText(stage.name)) {
    issues.push({
      path: `${path}.name`,
      code: 'INVALID_VALUE',
      message:
        'Toda etapa precisa possuir um nome.',
    })
  }

  if (!hasText(stage.objective)) {
    issues.push({
      path:
        `${path}.objective`,
      code: 'INVALID_VALUE',
      message:
        'Toda etapa precisa possuir um objetivo.',
    })
  }

  if (
    !COMMERCIAL_METHOD_STAGE_REQUIREMENTS
      .includes(
        stage.requirement,
      )
  ) {
    issues.push({
      path:
        `${path}.requirement`,
      code: 'INVALID_VALUE',
      message:
        'A obrigatoriedade da etapa é inválida.',
    })
  }

  validateTextArray({
    value:
      stage.completion_criteria,
    path:
      `${path}.completion_criteria`,
    required:
      true,
    issues,
  })

  validateTextArray({
    value:
      stage.partial_completion_criteria,
    path:
      `${path}.partial_completion_criteria`,
    issues,
  })

  validateTextArray({
    value:
      stage.skip_conditions,
    path:
      `${path}.skip_conditions`,
    issues,
  })

  validateTextArray({
    value:
      stage.recommended_questions,
    path:
      `${path}.recommended_questions`,
    issues,
  })

  validateTextArray({
    value:
      stage.common_mistakes,
    path:
      `${path}.common_mistakes`,
    issues,
  })

  validateTextArray({
    value:
      stage.deepen_when,
    path:
      `${path}.deepen_when`,
    issues,
  })

  validateTextArray({
    value:
      stage.sufficient_when,
    path:
      `${path}.sufficient_when`,
    required:
      true,
    issues,
  })

  validateTextArray({
    value:
      stage.advance_when,
    path:
      `${path}.advance_when`,
    issues,
  })

  validateTextArray({
    value:
      stage.wait_when,
    path:
      `${path}.wait_when`,
    issues,
  })

  validateTextArray({
    value:
      stage.stop_asking_when,
    path:
      `${path}.stop_asking_when`,
    required:
      true,
    issues,
  })

  if (
    stage.requirement ===
      'required' &&
    stage.skip_conditions.length > 0
  ) {
    issues.push({
      path:
        `${path}.skip_conditions`,
      code:
        'REQUIRED_STAGE_CANNOT_BE_SKIPPED',
      message:
        'Uma etapa obrigatória não pode declarar condições para ser pulada.',
    })
  }

  if (
    stage.requirement ===
      'conditional' &&
    stage.skip_conditions.length === 0
  ) {
    issues.push({
      path:
        `${path}.skip_conditions`,
      code:
        'CONDITIONAL_STAGE_REQUIRES_SKIP_CONDITION',
      message:
        'Uma etapa condicional precisa explicar quando pode ser pulada.',
    })
  }

  if (!Array.isArray(stage.dimensions)) {
    issues.push({
      path:
        `${path}.dimensions`,
      code: 'INVALID_VALUE',
      message:
        'As dimensões internas precisam formar uma lista.',
    })
    return
  }

  const dimensionKeys =
    new Set<string>()

  stage.dimensions.forEach(
    (dimension, dimensionIndex) => {
      validateDimension({
        dimension,
        stagePath:
          path,
        dimensionIndex,
        dimensionKeys,
        issues,
      })
    },
  )
}

export function validateCommercialMethodDefinition(
  value: CommercialMethodDefinition,
): CommercialMethodValidationResult {
  const issues:
    CommercialMethodValidationIssue[] = []

  if (
    value.contract_version !==
    COMMERCIAL_METHOD_CONTRACT_VERSION
  ) {
    issues.push({
      path:
        'contract_version',
      code:
        'INVALID_VALUE',
      message:
        'A versão do contrato do método comercial é incompatível.',
    })
  }

  if (!hasText(value.name)) {
    issues.push({
      path: 'name',
      code: 'INVALID_VALUE',
      message:
        'O método comercial precisa possuir um nome.',
    })
  }

  if (!hasText(value.description)) {
    issues.push({
      path:
        'description',
      code:
        'INVALID_VALUE',
      message:
        'O método comercial precisa possuir uma descrição.',
    })
  }

  validateTextArray({
    value:
      value.principles,
    path:
      'principles',
    required:
      true,
    issues,
  })

  if (
    !Array.isArray(value.stages) ||
    value.stages.length === 0
  ) {
    issues.push({
      path: 'stages',
      code: 'INVALID_VALUE',
      message:
        'O método comercial precisa possuir ao menos uma etapa.',
    })

    return {
      valid: false,
      issues,
    }
  }

  const stageKeys =
    new Set<string>()

  const stageOrders =
    new Set<number>()

  value.stages.forEach(
    (stage, stageIndex) => {
      validateStage({
        stage,
        stageIndex,
        stageKeys,
        stageOrders,
        issues,
      })
    },
  )

  return {
    valid:
      issues.length === 0,
    issues,
  }
}
