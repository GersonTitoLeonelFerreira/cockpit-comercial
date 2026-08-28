import type {
    CommercialConfigBundle,
    CommercialConfigProductOption,
    CommercialConfigSectionKey,
    CommercialConfigValidationIssue,
    CommercialConfigValidationResult,
  } from '@/app/types/commercial-config'

  import { validateCommercialMethodDefinition } from '../companion/commercial-method-contract'

  function hasText(value: string): boolean {
    return value.trim().length > 0
  }

  function hasTextItems(items: string[]): boolean {
    return (
      items.length > 0 &&
      items.every((item) => hasText(item))
    )
  }

  function factIdentity(
    category: string,
    factKey: string,
  ): string {
    return `${category.trim().toLocaleLowerCase(
      'pt-BR',
    )}::${factKey
      .trim()
      .toLocaleLowerCase('pt-BR')}`
  }

  function addIssue(
    issues: CommercialConfigValidationIssue[],
    section: CommercialConfigSectionKey,
    field: string,
    message: string,
  ) {
    issues.push({
      section,
      field,
      message,
    })
  }

  export function validateCommercialConfigForPublish(
    bundle: CommercialConfigBundle,
    products: CommercialConfigProductOption[],
  ): CommercialConfigValidationResult {
    const issues: CommercialConfigValidationIssue[] = []
    const { version } = bundle

    if (!hasText(version.business_description)) {
      addIssue(
        issues,
        'company_context',
        'business_description',
        'Preencha a descrição da empresa.',
      )
    }

    if (!hasText(version.target_audience)) {
      addIssue(
        issues,
        'company_context',
        'target_audience',
        'Preencha o público-alvo.',
      )
    }

    if (!hasText(version.value_proposition)) {
      addIssue(
        issues,
        'company_context',
        'value_proposition',
        'Preencha a proposta de valor.',
      )
    }

    if (!hasText(version.communication_tone)) {
      addIssue(
        issues,
        'seller_guidelines',
        'communication_tone',
        'Preencha o tom de comunicação.',
      )
    }

    if (!hasTextItems(version.required_behaviors)) {
      addIssue(
        issues,
        'seller_guidelines',
        'required_behaviors',
        'Informe pelo menos um comportamento obrigatório.',
      )
    }

    if (!hasTextItems(version.prohibited_behaviors)) {
      addIssue(
        issues,
        'seller_guidelines',
        'prohibited_behaviors',
        'Informe pelo menos um comportamento proibido.',
      )
    }

    if (!hasText(version.commercial_method_name)) {
      addIssue(
        issues,
        'commercial_method',
        'commercial_method_name',
        'Preencha o nome do método comercial.',
      )
    }

    if (
      !hasText(
        version.commercial_method_description,
      )
    ) {
      addIssue(
        issues,
        'commercial_method',
        'commercial_method_description',
        'Preencha a descrição do método comercial.',
      )
    }

    if (
      version.commercial_method_contract_version ===
      'commercial-method-v2'
    ) {
      if (!version.commercial_method_definition) {
        addIssue(
          issues,
          'commercial_method',
          'commercial_method_definition',
          'O modo estruturado (V2) está ativo, mas a definição do método está vazia.',
        )
      } else {
        const definitionResult =
          validateCommercialMethodDefinition(
            version.commercial_method_definition,
          )

        definitionResult.issues.forEach((issue) => {
          addIssue(
            issues,
            'commercial_method',
            `commercial_method_definition.${issue.path}`,
            issue.message,
          )
        })
      }
    } else {
      if (bundle.method_steps.length === 0) {
        addIssue(
          issues,
          'commercial_method',
          'method_steps',
          'Cadastre pelo menos uma etapa do método.',
        )
      }

      bundle.method_steps.forEach((step, index) => {
        const stepLabel = `Etapa ${index + 1}`

        if (!hasText(step.name)) {
          addIssue(
            issues,
            'commercial_method',
            `method_steps.${index}.name`,
            `${stepLabel}: preencha o nome.`,
          )
        }

        if (!hasText(step.objective)) {
          addIssue(
            issues,
            'commercial_method',
            `method_steps.${index}.objective`,
            `${stepLabel}: preencha o objetivo.`,
          )
        }

        if (
          !hasTextItems(step.completion_criteria)
        ) {
          addIssue(
            issues,
            'commercial_method',
            `method_steps.${index}.completion_criteria`,
            `${stepLabel}: informe pelo menos um critério de conclusão.`,
          )
        }

        if (
          step.recommended_questions.some(
            (question) => !hasText(question),
          )
        ) {
          addIssue(
            issues,
            'commercial_method',
            `method_steps.${index}.recommended_questions`,
            `${stepLabel}: remova perguntas vazias.`,
          )
        }
      })
    }

    const profileCountByProductId =
      new Map<string, number>()

    bundle.product_profiles.forEach((profile) => {
      profileCountByProductId.set(
        profile.product_id,
        (profileCountByProductId.get(
          profile.product_id,
        ) ?? 0) + 1,
      )
    })

    profileCountByProductId.forEach(
      (count, productId) => {
        if (count > 1) {
          addIssue(
            issues,
            'product_profiles',
            `product_profiles.${productId}`,
            'Existe mais de um perfil para o mesmo produto.',
          )
        }
      },
    )

    products
      .filter((product) => product.active)
      .forEach((product) => {
        const profile =
          bundle.product_profiles.find(
            (item) =>
              item.product_id === product.id,
          )

        if (!profile) {
          addIssue(
            issues,
            'product_profiles',
            `product_profiles.${product.id}`,
            `O produto ativo “${product.name}” ainda não possui perfil comercial.`,
          )
        }
      })

    bundle.product_profiles.forEach(
      (profile, index) => {
        const product = products.find(
          (item) =>
            item.id === profile.product_id,
        )

        const productLabel =
          product?.name ??
          `Perfil de produto ${index + 1}`

        if (
          !hasTextItems(profile.needs_addressed)
        ) {
          addIssue(
            issues,
            'product_profiles',
            `product_profiles.${index}.needs_addressed`,
            `${productLabel}: informe pelo menos uma necessidade atendida.`,
          )
        }

        if (!hasTextItems(profile.benefits)) {
          addIssue(
            issues,
            'product_profiles',
            `product_profiles.${index}.benefits`,
            `${productLabel}: informe pelo menos um benefício.`,
          )
        }

        const optionalLists = [
          profile.indicated_audiences,
          profile.verified_differentiators,
          profile.limitations,
          profile.contract_conditions,
          profile.payment_conditions,
          profile.allowed_claims,
          profile.forbidden_claims,
        ]

        if (
          optionalLists.some((items) =>
            items.some(
              (item) => !hasText(item),
            ),
          )
        ) {
          addIssue(
            issues,
            'product_profiles',
            `product_profiles.${index}`,
            `${productLabel}: remova itens vazios do perfil.`,
          )
        }
      },
    )

    const factIdentities = new Set<string>()

    bundle.facts.forEach((fact, index) => {
      if (!hasText(fact.category)) {
        addIssue(
          issues,
          'official_facts',
          `facts.${index}.category`,
          `Fato ${index + 1}: preencha a categoria.`,
        )
      }

      if (!hasText(fact.fact_key)) {
        addIssue(
          issues,
          'official_facts',
          `facts.${index}.fact_key`,
          `Fato ${index + 1}: preencha a chave interna.`,
        )
      }

      if (!hasText(fact.fact_value)) {
        addIssue(
          issues,
          'official_facts',
          `facts.${index}.fact_value`,
          `Fato ${index + 1}: preencha o valor oficial.`,
        )
      }

      if (
        hasText(fact.category) &&
        hasText(fact.fact_key)
      ) {
        const identity = factIdentity(
          fact.category,
          fact.fact_key,
        )

        if (factIdentities.has(identity)) {
          addIssue(
            issues,
            'official_facts',
            `facts.${index}`,
            `Fato ${index + 1}: a combinação de categoria e chave está duplicada.`,
          )
        }

        factIdentities.add(identity)
      }
    })

    bundle.objection_guides.forEach(
      (guide, index) => {
        if (!hasText(guide.objection)) {
          addIssue(
            issues,
            'objection_guides',
            `objection_guides.${index}.objection`,
            `Guia ${index + 1}: preencha a objeção.`,
          )
        }

        if (
          !hasText(
            guide.recommended_approach,
          )
        ) {
          addIssue(
            issues,
            'objection_guides',
            `objection_guides.${index}.recommended_approach`,
            `Guia ${index + 1}: preencha a abordagem recomendada.`,
          )
        }

        const optionalLists = [
          guide.signals,
          guide.discovery_questions,
          guide.response_limits,
        ]

        if (
          optionalLists.some((items) =>
            items.some(
              (item) => !hasText(item),
            ),
          )
        ) {
          addIssue(
            issues,
            'objection_guides',
            `objection_guides.${index}`,
            `Guia ${index + 1}: remova itens vazios.`,
          )
        }
      },
    )

    return {
      valid: issues.length === 0,
      issues,
    }
  }