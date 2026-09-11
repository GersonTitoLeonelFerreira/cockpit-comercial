import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import {
  COMMERCIAL_INTELLIGENCE_CONTRACT_VERSION,
  validateCommercialIntelligenceEntry,
  type CommercialIntelligenceEntry,
  type CommercialIntelligenceQuery,
  type RankedCommercialIntelligenceEntry,
} from './commercial-intelligence-contract'

function unique(
  values: string[],
): string[] {
  return Array.from(
    new Set(
      values
        .map(value => value.trim())
        .filter(Boolean),
    ),
  )
}

function generalEntry(
  entry: Omit<
    CommercialIntelligenceEntry,
    'contract_version' | 'scope' | 'provenance'
  >,
): CommercialIntelligenceEntry {
  return validateCommercialIntelligenceEntry({
    ...entry,
    contract_version:
      COMMERCIAL_INTELLIGENCE_CONTRACT_VERSION,
    scope:
      'general',
    provenance: {
      source_type:
        'general_library',
      source_id:
        entry.id,
      company_id: null,
      product_id: null,
      config_version_id: null,
    },
  })
}

export const GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY:
  readonly CommercialIntelligenceEntry[] = [
  generalEntry({
    id: 'technique.guided_choice',
    kind: 'technique',
    title: 'Escolha guiada',
    objective:
      'Reduzir fricção de decisão quando o cliente precisa escolher entre poucas alternativas já válidas.',
    description:
      'Organiza opções reais em uma decisão simples sem fabricar urgência nem esconder critérios relevantes.',
    situations: [
      'scheduling_choice',
      'product_choice',
      'next_step_choice',
    ],
    signals: [
      'customer_waiting_for_options',
      'seller_already_asked_open_question',
      'multiple_valid_options',
    ],
    when_to_use: [
      'Há duas ou três alternativas concretas e comparáveis.',
      'O cliente já demonstrou intenção suficiente para decidir entre opções.',
    ],
    when_not_to_use: [
      'Ainda falta descobrir um requisito que muda a recomendação.',
      'Uma das alternativas não é permitida pelas regras da empresa.',
    ],
    risks: [
      'Virar pressão artificial se a escolha for apresentada antes de entender o critério do cliente.',
    ],
    examples: [
      {
        situation:
          'Cliente quer agendar, mas ainda não escolheu entre dois horários disponíveis.',
        application:
          'Apresentar as duas opções reais e pedir escolha entre elas, sem repetir a pergunta aberta já feita.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.objection_diagnosis',
    kind: 'technique',
    title: 'Diagnóstico de objeção',
    objective:
      'Descobrir a causa real de uma objeção antes de prescrever argumento ou condição comercial.',
    description:
      'Separa sintoma de causa para evitar responder automaticamente a preço, pagamento, prazo ou confiança.',
    situations: [
      'payment_objection',
      'price_objection',
      'trust_objection',
      'timing_objection',
    ],
    signals: [
      'objection_open',
      'unclear_objection_cause',
      'customer_resistance',
    ],
    when_to_use: [
      'A objeção está clara, mas a causa ou restrição ainda não está comprovada.',
      'Existem regras ou alternativas da empresa que só fazem sentido depois do diagnóstico.',
    ],
    when_not_to_use: [
      'A causa já foi explicitamente confirmada e existe resposta factual direta.',
      'O cliente já tomou uma decisão final inequívoca que não depende de esclarecimento.',
    ],
    risks: [
      'Transformar diagnóstico em interrogatório.',
      'Responder com solução genérica que não atende à causa real.',
    ],
    examples: [
      {
        situation:
          'Cliente diz que não consegue pagar no cartão.',
        application:
          'Entender se o bloqueio é ausência de cartão, limite, preferência ou política antes de sugerir qualquer alternativa permitida.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.third_party_handoff',
    kind: 'technique',
    title: 'Handoff para o prospect real',
    objective:
      'Preservar o interlocutor como ponte sem confundi-lo com a pessoa que realmente decide ou usa a oferta.',
    description:
      'Quando alguém fala por outra pessoa, organiza a transição para obter identidade, contato e próximo passo do prospect correto.',
    situations: [
      'third_party_referral',
      'intermediary_contact',
    ],
    signals: [
      'third_party_prospect',
      'intermediary_detected',
    ],
    when_to_use: [
      'O interlocutor declara que a compra, uso ou decisão pertence a outra pessoa.',
      'É necessário continuar a oportunidade sem atribuir fatos ao interlocutor errado.',
    ],
    when_not_to_use: [
      'O interlocutor é também o comprador ou decisor comprovado.',
      'Não existe consentimento ou contexto suficiente para solicitar dados de terceiro.',
    ],
    risks: [
      'Misturar identidade do interlocutor com a do prospect.',
      'Registrar objetivo, objeção ou compromisso na pessoa errada.',
    ],
    examples: [
      {
        situation:
          'Contato diz que a irmã quer contratar.',
        application:
          'Tratar o contato como intermediário e conduzir a obtenção do nome/contato ou uma passagem clara para a irmã antes de completar etapas atribuídas a ela.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.discovery_before_prescription',
    kind: 'principle',
    title: 'Diagnosticar antes de prescrever',
    objective:
      'Evitar recomendações prematuras quando a decisão depende de contexto ainda não comprovado.',
    description:
      'Prioriza uma pergunta de alto valor informacional antes de apresentar produto, condição ou solução.',
    situations: [
      'discovery_gap',
      'complex_need',
      'health_or_sensitive_context',
    ],
    signals: [
      'missing_decision_criterion',
      'missing_need',
      'missing_context',
    ],
    when_to_use: [
      'Existe lacuna que muda materialmente a recomendação.',
    ],
    when_not_to_use: [
      'A pergunta já foi feita e o cliente ainda precisa responder.',
      'A informação já está disponível na memória canônica.',
    ],
    risks: [
      'Repetir descoberta já concluída.',
      'Virar questionário mecânico.',
    ],
    examples: [
      {
        situation:
          'Cliente menciona cirurgia ou limitação sem explicar impacto atual.',
        application:
          'Entender a condição relevante para a decisão antes de despejar regra técnica ou produto.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.commitment_wait',
    kind: 'technique',
    title: 'Espera disciplinada',
    objective:
      'Evitar follow-up redundante quando a próxima ação está claramente com o cliente.',
    description:
      'Distingue falta de movimento de um compromisso ainda em prazo e protege a conversa contra pressão desnecessária.',
    situations: [
      'customer_commitment_pending',
      'waiting_for_customer',
    ],
    signals: [
      'waiting_on_customer',
      'seller_action_already_performed',
      'customer_future_action',
    ],
    when_to_use: [
      'O cliente assumiu uma próxima ação concreta ou o vendedor acabou de fazer a pergunta necessária.',
    ],
    when_not_to_use: [
      'O prazo combinado venceu.',
      'O cliente trouxe nova pergunta ou nova objeção que exige resposta.',
    ],
    risks: [
      'Confundir espera disciplinada com abandono da oportunidade.',
    ],
    examples: [
      {
        situation:
          'Cliente diz que vai verificar o cartão e avisar.',
        application:
          'Não repetir a objeção nem inventar nova ação imediata; preservar o compromisso e agir quando houver resposta ou vencimento do prazo.',
      },
    ],
  }),

  generalEntry({
    id: 'anti_pattern.repeat_completed_action',
    kind: 'anti_pattern',
    title: 'Repetir ação já executada',
    objective:
      'Impedir que o vendedor refaça pergunta, envio ou orientação que já aconteceu na conversa.',
    description:
      'Anti-padrão que aparece quando o sistema confunde pendência da venda com pendência de ação do vendedor.',
    situations: [
      'duplicate_followup',
      'waiting_for_customer',
    ],
    signals: [
      'seller_action_already_performed',
      'waiting_on_customer',
    ],
    when_to_use: [
      'Como restrição de reasoning quando a mesma ação já está comprovada no histórico atual.',
    ],
    when_not_to_use: [
      'A ação anterior ficou incompleta, inválida ou precisa ser corrigida por fato novo.',
    ],
    risks: [
      'Gerar sensação de automação burra e pressionar o cliente.',
    ],
    examples: [
      {
        situation:
          'Vendedor já perguntou o horário e o cliente ainda não respondeu.',
        application:
          'Bloquear recomendação de repetir “qual horário prefere?” e considerar espera ou escolha guiada quando houver opções concretas.',
      },
    ],
  }),

  generalEntry({
    id: 'risk.premature_stage_advance',
    kind: 'risk',
    title: 'Avanço prematuro de etapa',
    objective:
      'Evitar que linguagem comercial superficial seja confundida com negociação real.',
    description:
      'Exige sinais combinados de jornada antes de promover estágio ou recomendar fechamento.',
    situations: [
      'stage_inference',
    ],
    signals: [
      'single_weak_signal',
      'missing_transaction_evidence',
    ],
    when_to_use: [
      'Como guard quando apenas uma palavra isolada como preço ou plano aparece.',
    ],
    when_not_to_use: [
      'Existem sinais fortes combinados de compra, pagamento, proposta, contrato ou fechamento.',
    ],
    risks: [
      'Inflar pipeline e produzir orientação agressiva sem base.',
    ],
    examples: [
      {
        situation:
          'Conversa pessoal menciona o preço do almoço.',
        application:
          'Não promover relevância ou estágio por palavra isolada.',
      },
    ],
  }),

  generalEntry({
    id: 'principle.company_rules_before_claim',
    kind: 'principle',
    title: 'Regra da empresa antes da afirmação',
    objective:
      'Garantir que condição, promessa, pagamento e limitação venham do conhecimento oficial da empresa.',
    description:
      'Toda resposta factual específica deve respeitar produtos, fatos, políticas, limites e objection guides publicados.',
    situations: [
      'company_policy',
      'payment_rule',
      'product_claim',
      'objection_handling',
    ],
    signals: [
      'claim_requires_company_knowledge',
      'policy_question',
    ],
    when_to_use: [
      'A orientação depende de regra, preço, condição, promessa ou capacidade do produto.',
    ],
    when_not_to_use: [
      'A decisão é puramente relacional e não exige afirmar regra específica.',
    ],
    risks: [
      'Inventar condição comercial ou funcionalidade.',
      'Usar técnica geral contra regra específica da empresa.',
    ],
    examples: [
      {
        situation:
          'Cliente pergunta por forma de pagamento alternativa.',
        application:
          'Consultar payment_conditions e fatos oficiais antes de sugerir qualquer alternativa.',
      },
    ],
  }),
] as const

function companyEntry({
  companyId,
  configVersionId,
  sourceType,
  sourceId,
  id,
  title,
  objective,
  description,
  situations,
  signals,
  whenToUse,
  whenNotToUse,
  risks,
  productId = null,
}: {
  companyId: string
  configVersionId: string | null
  sourceType:
    | 'commercial_config'
    | 'sales_method'
    | 'official_fact'
    | 'objection_guide'
    | 'seller_guideline'
    | 'product_profile'
  sourceId: string | null
  id: string
  title: string
  objective: string
  description: string
  situations: string[]
  signals: string[]
  whenToUse: string[]
  whenNotToUse: string[]
  risks: string[]
  productId?: string | null
}): CommercialIntelligenceEntry {
  return validateCommercialIntelligenceEntry({
    contract_version:
      COMMERCIAL_INTELLIGENCE_CONTRACT_VERSION,
    id,
    kind:
      'company_knowledge',
    scope:
      productId
        ? 'product'
        : 'company',
    title,
    objective,
    description,
    situations:
      unique(situations),
    signals:
      unique(signals),
    when_to_use:
      unique(whenToUse),
    when_not_to_use:
      unique(whenNotToUse),
    risks:
      unique(risks),
    examples: [],
    provenance: {
      source_type:
        sourceType,
      source_id:
        sourceId,
      company_id:
        companyId,
      product_id:
        productId,
      config_version_id:
        configVersionId,
    },
  })
}

function productName(
  product:
    CompanionDiagnosticInput[
      'commercial_context'
    ]['products'][number],
): string {
  return (
    product.name ??
    product.definition?.name ??
    product.product_id
  )
}

export function buildCompanyCommercialIntelligence(
  input: CompanionDiagnosticInput,
): CommercialIntelligenceEntry[] {
  const context =
    input.commercial_context

  const companyId =
    input.company_id

  const configVersionId =
    context.config_version_id

  const entries:
    CommercialIntelligenceEntry[] = []

  if (
    context.business_description ||
    context.target_audience ||
    context.value_proposition
  ) {
    entries.push(
      companyEntry({
        companyId,
        configVersionId,
        sourceType:
          'commercial_config',
        sourceId:
          configVersionId,
        id:
          `company.${companyId}.positioning`,
        title:
          'Posicionamento comercial publicado',
        objective:
          'Manter a condução alinhada ao negócio, público e proposta de valor da empresa.',
        description: [
          context.business_description,
          context.target_audience,
          context.value_proposition,
        ]
          .filter(Boolean)
          .join(' | '),
        situations: [
          'positioning',
          'value_explanation',
        ],
        signals: [
          'claim_requires_company_knowledge',
        ],
        whenToUse: [
          'Ao explicar valor, adequação ou posicionamento da oferta.',
        ],
        whenNotToUse: [],
        risks: [
          'Reduzir posicionamento a promessa não publicada.',
        ],
      }),
    )
  }

  if (context.sales_method.configured) {
    entries.push(
      companyEntry({
        companyId,
        configVersionId,
        sourceType:
          'sales_method',
        sourceId:
          context.config_version_id,
        id:
          `company.${companyId}.sales-method`,
        title:
          context.sales_method.name ??
          'Método comercial publicado',
        objective:
          'Respeitar a sequência, princípios e critérios do método comercial da empresa sem transformá-lo em roteiro rígido.',
        description: [
          context.sales_method.description,
          ...context.sales_method.principles,
        ]
          .filter(Boolean)
          .join(' | '),
        situations: [
          'method_alignment',
          'stage_reasoning',
        ],
        signals: [
          'method_configured',
        ],
        whenToUse: [
          'Ao avaliar qualidade da condução e decidir o próximo movimento comercial.',
        ],
        whenNotToUse: [
          'Quando a sessão atual não possui relevância comercial confirmada.',
        ],
        risks: [
          'Aplicar etapas de forma mecânica ignorando evidência espontânea.',
        ],
      }),
    )
  }

  context.required_behaviors.forEach(
    (behavior, index) => {
      entries.push(
        companyEntry({
          companyId,
          configVersionId,
          sourceType:
            'seller_guideline',
          sourceId:
            `required:${index + 1}`,
          id:
            `company.${companyId}.required-behavior.${index + 1}`,
          title:
            'Comportamento obrigatório do vendedor',
          objective:
            'Aplicar uma diretriz obrigatória publicada pela empresa.',
          description:
            behavior,
          situations: [
            'seller_behavior',
          ],
          signals: [
            'seller_guideline_relevant',
          ],
          whenToUse: [
            'Quando a conduta avaliada estiver no escopo desta diretriz.',
          ],
          whenNotToUse: [],
          risks: [
            'Ignorar uma regra explícita da empresa.',
          ],
        }),
      )
    },
  )

  context.prohibited_behaviors.forEach(
    (behavior, index) => {
      entries.push(
        companyEntry({
          companyId,
          configVersionId,
          sourceType:
            'seller_guideline',
          sourceId:
            `prohibited:${index + 1}`,
          id:
            `company.${companyId}.prohibited-behavior.${index + 1}`,
          title:
            'Comportamento proibido pela empresa',
          objective:
            'Bloquear conduta incompatível com a política comercial publicada.',
          description:
            behavior,
          situations: [
            'seller_behavior',
            'risk_control',
          ],
          signals: [
            'seller_guideline_relevant',
          ],
          whenToUse: [
            'Sempre que uma recomendação puder entrar em conflito com esta proibição.',
          ],
          whenNotToUse: [],
          risks: [
            'Recomendar uma ação explicitamente proibida.',
          ],
        }),
      )
    },
  )

  context.facts
    .filter(
      fact =>
        fact.validity_status ===
          'current',
    )
    .forEach(
      (fact) => {
        entries.push(
          companyEntry({
            companyId,
            configVersionId,
            sourceType:
              'official_fact',
            sourceId:
              fact.fact_key,
            id:
              `company.${companyId}.fact.${fact.fact_key}`,
            title:
              `Fato oficial: ${fact.fact_key}`,
            objective:
              'Groundear afirmações comerciais em informação oficial vigente.',
            description:
              `${fact.fact_value}${fact.source_note ? ` | Fonte: ${fact.source_note}` : ''}`,
            situations: [
              'company_policy',
              'factual_answer',
            ],
            signals: [
              'claim_requires_company_knowledge',
            ],
            whenToUse: [
              'Quando a pergunta ou orientação depender deste fato específico.',
            ],
            whenNotToUse: [
              'Quando o fato não responde ao assunto atual.',
            ],
            risks: [
              'Usar fato fora do contexto ou depois de perder validade.',
            ],
          }),
        )
      },
    )

  context.objection_guides.forEach(
    (guide, index) => {
      entries.push(
        companyEntry({
          companyId,
          configVersionId,
          sourceType:
            'objection_guide',
          sourceId:
            `objection:${index + 1}`,
          id:
            `company.${companyId}.objection.${index + 1}`,
          title:
            `Guia de objeção: ${guide.objection}`,
          objective:
            'Tratar a objeção respeitando descoberta, abordagem e limites publicados pela empresa.',
          description: [
            guide.recommended_approach,
            ...guide.discovery_questions,
          ]
            .filter(Boolean)
            .join(' | '),
          situations: [
            'objection_handling',
          ],
          signals: [
            ...guide.signals,
            'objection_open',
          ],
          whenToUse: [
            `Quando a objeção atual corresponder a: ${guide.objection}.`,
          ],
          whenNotToUse: [
            ...guide.response_limits,
          ],
          risks: [
            'Aplicar o guia a uma objeção diferente apenas por semelhança superficial.',
          ],
        }),
      )
    },
  )

  context.products.forEach(
    (product) => {
      const name =
        productName(product)

      entries.push(
        companyEntry({
          companyId,
          configVersionId,
          sourceType:
            'product_profile',
          sourceId:
            product.product_id,
          id:
            `company.${companyId}.product.${product.product_id}`,
          title:
            `Conhecimento do produto: ${name}`,
          objective:
            'Usar somente atributos, condições e limites publicados para este produto.',
          description: [
            ...product.needs_addressed,
            ...product.benefits,
            ...product.verified_differentiators,
            ...product.contract_conditions,
            ...product.payment_conditions,
          ]
            .filter(Boolean)
            .join(' | '),
          situations: [
            'product_fit',
            'product_claim',
            'payment_rule',
          ],
          signals: [
            'claim_requires_company_knowledge',
            `product:${product.product_id}`,
          ],
          whenToUse: [
            `Quando ${name} estiver realmente em discussão ou comparação.`,
          ],
          whenNotToUse: [
            ...product.limitations,
            ...product.forbidden_claims,
          ],
          risks: [
            'Inventar benefício, condição ou promessa não publicada.',
          ],
          productId:
            product.product_id,
        }),
      )
    },
  )

  return entries
}

function normalizeMatchText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function intersection(
  left: string[],
  right: string[],
): string[] {
  const normalizedRight =
    new Map(
      right.map(
        value => [
          normalizeMatchText(value),
          value,
        ],
      ),
    )

  return unique(
    left
      .map(value => ({
        original: value,
        normalized:
          normalizeMatchText(value),
      }))
      .filter(
        item =>
          normalizedRight.has(
            item.normalized,
          ),
      )
      .map(item => item.original),
  )
}

function objectiveMatches(
  entry: CommercialIntelligenceEntry,
  objectives: string[],
): string[] {
  const haystack =
    normalizeMatchText(
      `${entry.objective} ${entry.description} ${entry.title}`,
    )

  return unique(
    objectives.filter(
      objective => {
        const normalized =
          normalizeMatchText(objective)

        return (
          normalized.length >= 3 &&
          haystack.includes(normalized)
        )
      },
    ),
  )
}

function isEntryVisible(
  entry: CommercialIntelligenceEntry,
  query: CommercialIntelligenceQuery,
): boolean {
  if (entry.scope === 'general') {
    return true
  }

  if (
    entry.provenance.company_id !==
    query.company_id
  ) {
    return false
  }

  if (entry.scope === 'company') {
    return true
  }

  return Boolean(
    entry.provenance.product_id &&
    query.product_ids.includes(
      entry.provenance.product_id,
    ),
  )
}

export function rankCommercialIntelligence({
  entries,
  query,
}: {
  entries: readonly CommercialIntelligenceEntry[]
  query: CommercialIntelligenceQuery
}): RankedCommercialIntelligenceEntry[] {
  const limit =
    Math.max(
      1,
      Math.min(
        query.limit ?? 8,
        20,
      ),
    )

  return entries
    .filter(
      entry =>
        isEntryVisible(
          entry,
          query,
        ),
    )
    .map(
      (entry) => {
        const matchedSignals =
          intersection(
            entry.signals,
            query.signals,
          )

        const matchedSituations =
          intersection(
            entry.situations,
            query.situations,
          )

        const matchedObjectives =
          objectiveMatches(
            entry,
            query.objectives,
          )

        let score = 0
        const reasons: string[] = []

        if (matchedSignals.length > 0) {
          score +=
            matchedSignals.length * 5
          reasons.push(
            `Sinais compatíveis: ${matchedSignals.join(', ')}.`,
          )
        }

        if (matchedSituations.length > 0) {
          score +=
            matchedSituations.length * 4
          reasons.push(
            `Situações compatíveis: ${matchedSituations.join(', ')}.`,
          )
        }

        if (matchedObjectives.length > 0) {
          score +=
            matchedObjectives.length * 3
          reasons.push(
            `Objetivos compatíveis: ${matchedObjectives.join(', ')}.`,
          )
        }

        if (entry.scope === 'product') {
          score += 2
          reasons.push(
            'Conhecimento específico do produto em discussão.',
          )
        } else if (entry.scope === 'company') {
          score += 1
          reasons.push(
            'Conhecimento publicado da empresa.',
          )
        }

        return {
          entry,
          score,
          matched_signals:
            matchedSignals,
          matched_situations:
            matchedSituations,
          matched_objectives:
            matchedObjectives,
          ranking_reasons:
            reasons,
        }
      },
    )
    .filter(
      item => item.score > 0,
    )
    .sort(
      (left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score
        }

        if (
          left.entry.scope !==
          right.entry.scope
        ) {
          const scopeRank = {
            product: 3,
            company: 2,
            general: 1,
          } as const

          return (
            scopeRank[right.entry.scope] -
            scopeRank[left.entry.scope]
          )
        }

        return left.entry.id.localeCompare(
          right.entry.id,
          'en',
        )
      },
    )
    .slice(0, limit)
}

export function buildCommercialIntelligenceLibrary(
  input: CompanionDiagnosticInput,
): CommercialIntelligenceEntry[] {
  return [
    ...GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY,
    ...buildCompanyCommercialIntelligence(
      input,
    ),
  ]
}
