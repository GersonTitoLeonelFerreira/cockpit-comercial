import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_OBJECTION_CATEGORIES,
  COMMERCIAL_OBJECTION_NEIGHBORING_STATES,
  COMMERCIAL_OBJECTION_SCOPE_TYPES,
  validateCommercialObjectionDefinition,
} from './commercial-objection-contract.ts'

const ALL_NEIGHBORING_STATES = [
  ...COMMERCIAL_OBJECTION_NEIGHBORING_STATES,
]

function companyScope() {
  return {
    type:
      'company',

    product_id:
      null,

    variant_key:
      null,
  }
}

function productScope(
  productId,
) {
  return {
    type:
      'product',

    product_id:
      productId,

    variant_key:
      null,
  }
}

function variantScope(
  productId,
  variantKey,
) {
  return {
    type:
      'product_variant',

    product_id:
      productId,

    variant_key:
      variantKey,
  }
}

function buildObjection({
  objectionKey,
  objection,
  category,
  description,
  scope,
  signals,
  objectionWhen,
  notObjectionWhen,
  discoveryQuestions = [],
  recommendedApproach,
  responseLimits,
  resolutionCriteria,
  waitWhen = [],
  giveSpaceWhen = [],
  stopWhen = [],
}) {
  return {
    contract_version:
      'commercial-objection-v2',

    objection_kind:
      'commercial_objection',

    objection_key:
      objectionKey,

    objection,

    category,

    description,

    scope,

    signals,

    objection_when:
      objectionWhen,

    not_objection_when:
      notObjectionWhen,

    distinguish_from: [
      ...ALL_NEIGHBORING_STATES,
    ],

    discovery_questions:
      discoveryQuestions,

    recommended_approach:
      recommendedApproach,

    response_limits:
      responseLimits,

    resolution_criteria:
      resolutionCriteria,

    wait_when:
      waitWhen,

    give_space_when:
      giveSpaceWhen,

    stop_when:
      stopWhen,
  }
}

const corpus = [
  {
    id:
      'fitness-preco-alto',

    segment:
      'fitness',

    counterexample_state:
      'question',

    definition:
      buildObjection({
        objectionKey:
          'price_value',

        objection:
          'Preço percebido como alto',

        category:
          'price',

        description:
          'O preço ou a relação entre preço e valor percebido está bloqueando materialmente a decisão.',

        scope:
          companyScope(),

        signals: [
          'Está caro para mim.',
          'Achei o valor alto pelo que eu esperava.',
        ],

        objectionWhen: [
          'O contato apresenta o preço como motivo real para não avançar nas condições atuais.',
        ],

        notObjectionWhen: [
          'O contato apenas pergunta qual é o preço.',
          'O contato pede a composição do preço sem demonstrar resistência.',
        ],

        discoveryQuestions: [
          'Quando você diz que ficou alto, o que está pesando mais nessa comparação?',
        ],

        recommendedApproach:
          'Compreender a origem da resistência de valor antes de decidir se existe algo relevante a esclarecer.',

        responseLimits: [
          'Não presumir falta de dinheiro.',
          'Não oferecer desconto sem política comercial aplicável.',
        ],

        resolutionCriteria: [
          'Está claro se o preço continua sendo um bloqueio real para avançar.',
        ],

        giveSpaceWhen: [
          'O contato demonstra aumento de resistência diante de novas tentativas de convencimento.',
        ],
      }),
  },

  {
    id:
      'saas-orcamento-nao-aprovado',

    segment:
      'software-saas',

    counterexample_state:
      'information_request',

    definition:
      buildObjection({
        objectionKey:
          'budget_not_approved',

        objection:
          'Orçamento disponível insuficiente ou ainda não aprovado',

        category:
          'budget',

        description:
          'O limite orçamentário real impede o avanço mesmo quando existe interesse comercial.',

        scope:
          productScope(
            '11111111-1111-4111-8111-111111111111',
          ),

        signals: [
          'Não tenho essa verba aprovada.',
          'Meu orçamento ficou abaixo desse investimento.',
        ],

        objectionWhen: [
          'O contato confirma que o orçamento disponível ou aprovado é materialmente incompatível com a contratação pretendida.',
        ],

        notObjectionWhen: [
          'O contato apenas solicita uma estimativa para montar o orçamento.',
          'O contato pede informações para submeter internamente a proposta.',
        ],

        discoveryQuestions: [],

        recommendedApproach:
          'Separar limitação orçamentária comprovada de simples necessidade de informação ou aprovação interna.',

        responseLimits: [
          'Não inventar verba disponível.',
          'Não reduzir preço ou escopo sem condição comercial publicada.',
        ],

        resolutionCriteria: [
          'Está comprovado se existe orçamento compatível, alternativa válida ou impossibilidade real de avanço.',
        ],

        waitWhen: [
          'Existe uma revisão orçamentária concreta já assumida pelo contato e insistir antes dela não acrescentaria informação.',
        ],
      }),
  },

  {
    id:
      'ecommerce-forma-pagamento',

    segment:
      'ecommerce',

    counterexample_state:
      'condition',

    definition:
      buildObjection({
        objectionKey:
          'payment_terms',

        objection:
          'Condição de pagamento incompatível',

        category:
          'payment',

        description:
          'A forma, prazo ou estrutura de pagamento disponível representa bloqueio material para a compra.',

        scope:
          companyScope(),

        signals: [
          'Nessa forma de pagamento eu não consigo.',
          'Esse prazo de pagamento inviabiliza para nós.',
        ],

        objectionWhen: [
          'O contato declara que a condição de pagamento disponível impede concretamente o avanço.',
        ],

        notObjectionWhen: [
          'O contato apenas pergunta quais formas de pagamento são aceitas.',
          'O contato informa sua forma de pagamento preferida sem dizer que ela é condição impeditiva.',
        ],

        discoveryQuestions: [
          'Qual parte da condição atual é realmente impeditiva para vocês?',
        ],

        recommendedApproach:
          'Identificar o elemento impeditivo e responder somente com condições oficialmente disponíveis.',

        responseLimits: [
          'Não inventar parcelamento, prazo ou meio de pagamento.',
          'Não prometer exceção sem autorização comercial.',
        ],

        resolutionCriteria: [
          'A condição deixou de impedir a compra ou ficou comprovado que não existe alternativa aplicável.',
        ],
      }),
  },

  {
    id:
      'consultoria-momento-inadequado',

    segment:
      'consultoria-b2b',

    counterexample_state:
      'postponement',

    definition:
      buildObjection({
        objectionKey:
          'timing_priority',

        objection:
          'Momento inadequado para assumir a contratação',

        category:
          'timing',

        description:
          'O momento operacional ou estratégico torna a contratação inviável ou inadequada agora.',

        scope:
          productScope(
            '22222222-2222-4222-8222-222222222222',
          ),

        signals: [
          'Agora não é um bom momento para começar.',
          'Neste trimestre eu não consigo tocar isso.',
        ],

        objectionWhen: [
          'O contato apresenta o momento atual como bloqueio material, mesmo havendo aderência ou interesse na solução.',
        ],

        notObjectionWhen: [
          'O contato apenas sugere conversar novamente em outro período sem explicar resistência.',
          'O contato informa uma data futura desejada como condição normal de planejamento.',
        ],

        discoveryQuestions: [
          'O que precisa mudar no contexto para esse projeto voltar a fazer sentido?',
        ],

        recommendedApproach:
          'Entender se existe bloqueio temporal real ou apenas um adiamento sem resistência definida.',

        responseLimits: [
          'Não criar urgência artificial.',
          'Não transformar adiamento em compromisso futuro sem aceite concreto.',
        ],

        resolutionCriteria: [
          'Está claro se o impedimento temporal permanece e qual evento, se houver, altera esse cenário.',
        ],

        waitWhen: [
          'O contato assumiu retorno após um evento temporal concreto e não existe informação útil a acrescentar antes dele.',
        ],

        giveSpaceWhen: [
          'Novas tentativas antes da mudança de contexto apenas repetiriam pressão.',
        ],
      }),
  },

  {
    id:
      'educacao-autoridade-decisoria',

    segment:
      'educacao-corporativa',

    counterexample_state:
      'uncertainty',

    definition:
      buildObjection({
        objectionKey:
          'decision_authority',

        objection:
          'Ausência de autoridade suficiente para decidir',

        category:
          'authority',

        description:
          'A pessoa envolvida não possui autoridade ou acesso decisório suficiente e isso bloqueia materialmente o avanço.',

        scope:
          companyScope(),

        signals: [
          'Eu não consigo aprovar isso sozinho.',
          'Sem a diretoria eu não tenho como avançar.',
        ],

        objectionWhen: [
          'A falta de autoridade ou acesso ao decisor impede objetivamente a continuidade da decisão comercial.',
        ],

        notObjectionWhen: [
          'O contato apenas informa que outras pessoas participarão da decisão.',
          'O contato demonstra dúvida sobre quem aprova, sem afirmar que isso impede o processo.',
        ],

        discoveryQuestions: [
          'Como essa decisão costuma ser aprovada internamente?',
        ],

        recommendedApproach:
          'Compreender o processo decisório sem desqualificar o interlocutor nem presumir hierarquia inexistente.',

        responseLimits: [
          'Não pressionar o contato a contornar governança interna.',
          'Não inventar autoridade ou compromisso de terceiros.',
        ],

        resolutionCriteria: [
          'Existe caminho decisório claro ou ficou comprovado que a autoridade continua impedindo o avanço.',
        ],
      }),
  },

  {
    id:
      'logistica-confianca-fornecedor',

    segment:
      'logistica',

    counterexample_state:
      'rejection',

    definition:
      buildObjection({
        objectionKey:
          'supplier_trust',

        objection:
          'Confiança insuficiente na capacidade de entrega',

        category:
          'trust',

        description:
          'A percepção de confiabilidade da empresa é insuficiente e representa barreira real à contratação.',

        scope:
          companyScope(),

        signals: [
          'Ainda não confio que vocês consigam cumprir isso.',
          'Tenho receio de depender da operação de vocês.',
        ],

        objectionWhen: [
          'O contato expressa falta de confiança como razão material para não avançar.',
        ],

        notObjectionWhen: [
          'O contato apenas solicita referências, casos ou documentação comprobatória.',
          'O contato faz uma recusa explícita e definitiva sem indicar que confiança seja a resistência a investigar.',
        ],

        discoveryQuestions: [
          'Qual evidência seria necessária para avaliar essa segurança de forma objetiva?',
        ],

        recommendedApproach:
          'Tratar a preocupação com evidências verificáveis, sem prometer desempenho não comprovado.',

        responseLimits: [
          'Não inventar clientes, resultados, certificações ou garantias.',
          'Não transformar ausência de prova em promessa.',
        ],

        resolutionCriteria: [
          'A confiança deixou de ser bloqueio ou ficou claro que não existe evidência suficiente para resolver a preocupação.',
        ],

        stopWhen: [
          'O contato encerra explicitamente a avaliação e não solicita continuidade.',
        ],
      }),
  },

  {
    id:
      'industria-concorrente-preferido',

    segment:
      'automacao-industrial',

    counterexample_state:
      'information_request',

    definition:
      buildObjection({
        objectionKey:
          'competitor_preference',

        objection:
          'Preferência consolidada por solução concorrente',

        category:
          'competition',

        description:
          'Uma alternativa concorrente já possui preferência material e isso dificulta a mudança para a solução analisada.',

        scope:
          variantScope(
            '33333333-3333-4333-8333-333333333333',
            'industrial-pro-220v',
          ),

        signals: [
          'Hoje eu prefiro continuar com o fornecedor atual.',
          'O concorrente já está homologado aqui e vocês não.',
        ],

        objectionWhen: [
          'A preferência pelo concorrente é apresentada como barreira concreta para selecionar esta variante.',
        ],

        notObjectionWhen: [
          'O contato apenas pergunta como a variante se compara a um concorrente.',
          'O contato solicita uma tabela técnica comparativa sem declarar preferência impeditiva.',
        ],

        discoveryQuestions: [
          'Qual critério do fornecedor atual pesa mais nessa decisão?',
        ],

        recommendedApproach:
          'Compreender o critério real de preferência e comparar somente características verificáveis.',

        responseLimits: [
          'Não depreciar concorrentes com afirmações não verificadas.',
          'Não inventar equivalência técnica da variante.',
        ],

        resolutionCriteria: [
          'Está claro se a preferência concorrente continua sendo decisiva após comparação verificável.',
        ],
      }),
  },

  {
    id:
      'servicos-profissionais-aderencia',

    segment:
      'servicos-profissionais',

    counterexample_state:
      'question',

    definition:
      buildObjection({
        objectionKey:
          'solution_fit_uncertainty',

        objection:
          'Dúvida material sobre aderência da solução',

        category:
          'fit',

        description:
          'O contato percebe possível incompatibilidade entre sua necessidade e a solução e isso bloqueia a decisão.',

        scope:
          productScope(
            '44444444-4444-4444-8444-444444444444',
          ),

        signals: [
          'Não sei se isso funciona para a nossa operação.',
          'Tenho dúvida se esse serviço atende o nosso cenário.',
        ],

        objectionWhen: [
          'A dúvida de aderência é apresentada como resistência material para continuar a contratação.',
        ],

        notObjectionWhen: [
          'O contato apenas pergunta para quais cenários o produto é indicado.',
          'A conversa já comprova incompatibilidade objetiva que deve ser tratada como misfit e não como objeção a ser vencida.',
        ],

        discoveryQuestions: [
          'Qual requisito específico ainda parece não atendido?',
        ],

        recommendedApproach:
          'Verificar aderência real antes de persuadir e aceitar misfit quando os requisitos comprovarem incompatibilidade.',

        responseLimits: [
          'Não afirmar aderência sem evidência.',
          'Não ocultar limitações do produto.',
        ],

        resolutionCriteria: [
          'A aderência foi comprovada, permaneceu incerta ou a incompatibilidade objetiva ficou estabelecida.',
        ],
      }),
  },

  {
    id:
      'erp-esforco-implantacao',

    segment:
      'software-erp',

    counterexample_state:
      'question',

    definition:
      buildObjection({
        objectionKey:
          'implementation_effort',

        objection:
          'Esforço de implantação percebido como excessivo',

        category:
          'implementation',

        description:
          'O esforço, tempo ou complexidade de implantação percebidos representam resistência material à contratação.',

        scope:
          productScope(
            '55555555-5555-4555-8555-555555555555',
          ),

        signals: [
          'A implantação parece pesada demais para a nossa equipe.',
          'Não sei se conseguimos absorver esse projeto.',
        ],

        objectionWhen: [
          'O esforço de implementação é apresentado como razão concreta para não avançar.',
        ],

        notObjectionWhen: [
          'O contato apenas pergunta quanto tempo dura a implantação.',
          'O contato solicita o plano de implantação para organizar recursos.',
        ],

        discoveryQuestions: [
          'Qual parte da implantação gera maior impacto para a equipe hoje?',
        ],

        recommendedApproach:
          'Separar complexidade percebida de esforço comprovado e responder com informações operacionais verificáveis.',

        responseLimits: [
          'Não prometer prazo ou esforço não configurado.',
          'Não minimizar impacto conhecido da implantação.',
        ],

        resolutionCriteria: [
          'O esforço deixou de ser impeditivo ou ficou comprovado que permanece incompatível com a capacidade atual.',
        ],
      }),
  },

  {
    id:
      'financeiro-risco-operacional',

    segment:
      'servicos-financeiros-b2b',

    counterexample_state:
      'information_request',

    definition:
      buildObjection({
        objectionKey:
          'operational_risk',

        objection:
          'Risco operacional percebido como alto',

        category:
          'risk',

        description:
          'O risco percebido de falha, interrupção, segurança ou impacto operacional bloqueia materialmente a decisão.',

        scope:
          companyScope(),

        signals: [
          'O risco dessa mudança está alto demais para nós.',
          'Tenho receio do impacto se isso falhar.',
        ],

        objectionWhen: [
          'O contato apresenta risco percebido como motivo real para não aprovar ou avançar.',
        ],

        notObjectionWhen: [
          'O contato apenas solicita documentação de segurança ou continuidade.',
          'O contato faz perguntas de due diligence sem indicar resistência à contratação.',
        ],

        discoveryQuestions: [],

        recommendedApproach:
          'Responder com evidências verificáveis e preservar incerteza quando o risco não puder ser comprovadamente reduzido.',

        responseLimits: [
          'Não prometer risco zero.',
          'Não inventar garantia, certificação ou controle inexistente.',
        ],

        resolutionCriteria: [
          'O nível de risco aceitável ficou comprovado ou a preocupação permanece materialmente impeditiva.',
        ],

        giveSpaceWhen: [
          'A avaliação depende de análise técnica interna e novas mensagens não adicionariam evidência.',
        ],
      }),
  },

  {
    id:
      'juridico-clausula-contratual',

    segment:
      'servicos-juridicos-empresariais',

    counterexample_state:
      'condition',

    definition:
      buildObjection({
        objectionKey:
          'contract_terms',

        objection:
          'Termos contratuais considerados impeditivos',

        category:
          'contract',

        description:
          'Uma cláusula, prazo, obrigação ou condição contratual é percebida como barreira material à contratação.',

        scope:
          companyScope(),

        signals: [
          'Com essa cláusula não conseguimos assinar.',
          'Esse prazo contratual é um impeditivo para nós.',
        ],

        objectionWhen: [
          'O contato identifica termo contratual específico como motivo real para não concluir a contratação.',
        ],

        notObjectionWhen: [
          'O contato apenas solicita uma cópia do contrato para análise.',
          'O contato informa uma exigência jurídica ainda não avaliada, sem dizer que existe bloqueio.',
        ],

        discoveryQuestions: [
          'Qual cláusula ou obrigação precisa ser compreendida para avaliar se existe um bloqueio real?',
        ],

        recommendedApproach:
          'Identificar o termo específico e responder somente dentro das condições contratuais autorizadas.',

        responseLimits: [
          'Não alterar cláusula ou obrigação sem autorização.',
          'Não interpretar juridicamente além das informações oficiais disponíveis.',
        ],

        resolutionCriteria: [
          'O termo deixou de impedir a contratação ou ficou comprovado que a incompatibilidade permanece.',
        ],

        stopWhen: [
          'A condição contratual é definitivamente incompatível e o contato encerra a negociação.',
        ],
      }),
  },

  {
    id:
      'varejo-disponibilidade-variante',

    segment:
      'varejo',

    counterexample_state:
      'condition',

    definition:
      buildObjection({
        objectionKey:
          'variant_availability',

        objection:
          'Incerteza de disponibilidade bloqueia a decisão',

        category:
          'availability',

        description:
          'A disponibilidade da variante, janela ou capacidade de atendimento representa resistência material ao avanço.',

        scope:
          variantScope(
            '66666666-6666-4666-8666-666666666666',
            'premium-black',
          ),

        signals: [
          'Se essa versão não estiver disponível agora, não consigo fechar.',
          'A falta de previsão dessa variante está me impedindo de decidir.',
        ],

        objectionWhen: [
          'A incerteza ou indisponibilidade da variante é apresentada como bloqueio real à compra.',
        ],

        notObjectionWhen: [
          'O contato apenas pergunta se a variante está disponível.',
          'O contato informa uma data desejada de entrega sem demonstrar resistência ou bloqueio.',
        ],

        discoveryQuestions: [
          'Qual janela de disponibilidade é material para essa decisão?',
        ],

        recommendedApproach:
          'Verificar disponibilidade real e não converter estoque desconhecido em promessa.',

        responseLimits: [
          'Não inventar estoque ou prazo.',
          'Não prometer reserva sem confirmação operacional.',
        ],

        resolutionCriteria: [
          'A disponibilidade necessária foi confirmada ou ficou comprovado que permanece incompatível com a necessidade.',
        ],

        waitWhen: [
          'Existe uma verificação operacional em andamento e não há nova informação útil até sua conclusão.',
        ],
      }),
  },

  {
    id:
      'agencia-resistencia-mudanca',

    segment:
      'agencia-de-marketing',

    counterexample_state:
      'uncertainty',

    definition:
      buildObjection({
        objectionKey:
          'change_resistance',

        objection:
          'Resistência interna à mudança',

        category:
          'other',

        description:
          'Uma resistência comercial relevante não enquadrada nas categorias específicas impede a adoção da solução.',

        scope:
          companyScope(),

        signals: [
          'Minha equipe não quer mudar o processo atual.',
          'A resistência interna está travando essa decisão.',
        ],

        objectionWhen: [
          'O contato identifica resistência interna à mudança como bloqueio material à contratação ou adoção.',
        ],

        notObjectionWhen: [
          'O contato apenas pergunta se a equipe precisará de treinamento.',
          'O contato demonstra incerteza genérica sobre adaptação sem afirmar que isso esteja impedindo a decisão.',
        ],

        discoveryQuestions: [
          'O que exatamente na mudança está gerando resistência interna?',
        ],

        recommendedApproach:
          'Compreender a origem da resistência sem presumir causa, pessoa ou solução antes da evidência.',

        responseLimits: [
          'Não atribuir resistência a pessoas específicas sem evidência.',
          'Não prometer adesão automática da equipe.',
        ],

        resolutionCriteria: [
          'A resistência deixou de impedir o avanço ou sua causa e impacto ficaram suficientemente claros.',
        ],

        giveSpaceWhen: [
          'A equipe precisa discutir internamente e insistir imediatamente aumentaria a resistência.',
        ],

        stopWhen: [
          'O contato comunica decisão final de não prosseguir com a mudança.',
        ],
      }),
  },
]

test(
  'corpus multissetorial inteiro respeita o contrato de objeções comerciais V2',
  () => {
    for (const scenario of corpus) {
      const result =
        validateCommercialObjectionDefinition(
          scenario.definition,
        )

      assert.equal(
        result.valid,
        true,
        `${scenario.id}: ${JSON.stringify(result.issues)}`,
      )

      assert.deepEqual(
        result.issues,
        [],
        scenario.id,
      )
    }
  },
)

test(
  'corpus cobre todas as categorias de objeção do contrato',
  () => {
    const categories = [
      ...new Set(
        corpus.map(
          scenario =>
            scenario
              .definition
              .category,
        ),
      ),
    ].sort()

    assert.deepEqual(
      categories,
      [
        ...COMMERCIAL_OBJECTION_CATEGORIES,
      ].sort(),
    )
  },
)

test(
  'corpus cobre todos os escopos de objeção do contrato',
  () => {
    const scopes = [
      ...new Set(
        corpus.map(
          scenario =>
            scenario
              .definition
              .scope
              .type,
        ),
      ),
    ].sort()

    assert.deepEqual(
      scopes,
      [
        ...COMMERCIAL_OBJECTION_SCOPE_TYPES,
      ].sort(),
    )
  },
)

test(
  'corpus distingue explicitamente todos os estados comerciais vizinhos',
  () => {
    const counterexamples = [
      ...new Set(
        corpus.map(
          scenario =>
            scenario
              .counterexample_state,
        ),
      ),
    ].sort()

    assert.deepEqual(
      counterexamples,
      [
        ...COMMERCIAL_OBJECTION_NEIGHBORING_STATES,
      ].sort(),
    )

    for (const scenario of corpus) {
      assert.ok(
        scenario
          .definition
          .distinguish_from
          .includes(
            scenario.counterexample_state,
          ),
        scenario.id,
      )
    }
  },
)

test(
  'corpus prova uso multissetorial sem transformar fitness em domínio do produto',
  () => {
    const segments =
      new Set(
        corpus.map(
          scenario =>
            scenario.segment,
        ),
      )

    assert.ok(
      segments.size >= 10,
    )

    assert.ok(
      segments.has(
        'fitness',
      ),
    )

    assert.ok(
      segments.has(
        'software-saas',
      ),
    )

    assert.ok(
      segments.has(
        'consultoria-b2b',
      ),
    )

    assert.ok(
      segments.has(
        'varejo',
      ),
    )

    assert.ok(
      segments.has(
        'automacao-industrial',
      ),
    )
  },
)

test(
  'pergunta informação condição adiamento recusa e incerteza não viram objeção automaticamente',
  () => {
    for (const scenario of corpus) {
      assert.ok(
        scenario
          .definition
          .not_objection_when
          .length > 0,
        scenario.id,
      )

      assert.ok(
        scenario
          .definition
          .distinguish_from
          .length > 0,
        scenario.id,
      )
    }

    const price =
      corpus.find(
        scenario =>
          scenario
            .definition
            .category ===
          'price',
      )

    assert.ok(price)

    assert.ok(
      price
        .definition
        .not_objection_when
        .some(
          item =>
            item.includes(
              'apenas pergunta qual é o preço',
            ),
        ),
    )
  },
)

test(
  'corpus permite esperar dar espaço encerrar e também não fazer descoberta obrigatória',
  () => {
    assert.ok(
      corpus.some(
        scenario =>
          scenario
            .definition
            .wait_when
            .length > 0,
      ),
    )

    assert.ok(
      corpus.some(
        scenario =>
          scenario
            .definition
            .give_space_when
            .length > 0,
      ),
    )

    assert.ok(
      corpus.some(
        scenario =>
          scenario
            .definition
            .stop_when
            .length > 0,
      ),
    )

    assert.ok(
      corpus.some(
        scenario =>
          scenario
            .definition
            .discovery_questions
            .length === 0,
      ),
    )
  },
)

test(
  'nenhuma definição de objeção carrega automação operacional ou mensagem obrigatória',
  () => {
    const prohibitedFields = [
      'suggested_message',
      'recommended_message',
      'mandatory_response',
      'crm_status',
      'crm_stage',
      'next_action_at',
      'agenda',
      'confidence',
      'probability',
    ]

    for (const scenario of corpus) {
      for (
        const field of
        prohibitedFields
      ) {
        assert.equal(
          Object.hasOwn(
            scenario.definition,
            field,
          ),
          false,
          `${scenario.id}: ${field}`,
        )
      }
    }
  },
)

test(
  'todo cenário possui critério positivo negativo limite de resposta e resolução',
  () => {
    for (const scenario of corpus) {
      assert.ok(
        scenario
          .definition
          .signals
          .length > 0,
        scenario.id,
      )

      assert.ok(
        scenario
          .definition
          .objection_when
          .length > 0,
        scenario.id,
      )

      assert.ok(
        scenario
          .definition
          .not_objection_when
          .length > 0,
        scenario.id,
      )

      assert.ok(
        scenario
          .definition
          .response_limits
          .length > 0,
        scenario.id,
      )

      assert.ok(
        scenario
          .definition
          .resolution_criteria
          .length > 0,
        scenario.id,
      )
    }
  },
)

test(
  'escopos de produto e variante permanecem explícitos e não contaminam o escopo de empresa',
  () => {
    for (const scenario of corpus) {
      const scope =
        scenario
          .definition
          .scope

      if (
        scope.type ===
        'company'
      ) {
        assert.equal(
          scope.product_id,
          null,
          scenario.id,
        )

        assert.equal(
          scope.variant_key,
          null,
          scenario.id,
        )

        continue
      }

      assert.ok(
        typeof scope.product_id ===
          'string' &&
          scope.product_id.length > 0,
        scenario.id,
      )

      if (
        scope.type ===
        'product'
      ) {
        assert.equal(
          scope.variant_key,
          null,
          scenario.id,
        )

        continue
      }

      assert.ok(
        typeof scope.variant_key ===
          'string' &&
          scope.variant_key.length > 0,
        scenario.id,
      )
    }
  },
)

test(
  'chaves semânticas permanecem únicas dentro do corpus',
  () => {
    const keys =
      corpus.map(
        scenario =>
          [
            scenario
              .definition
              .scope
              .type,

            scenario
              .definition
              .scope
              .product_id ??
              '',

            scenario
              .definition
              .scope
              .variant_key ??
              '',

            scenario
              .definition
              .objection_key,
          ].join('|'),
      )

    assert.equal(
      new Set(keys).size,
      keys.length,
    )
  },
)

test(
  'signals permanecem pistas e nunca substituem critérios de reconhecimento',
  () => {
    for (const scenario of corpus) {
      assert.notDeepEqual(
        scenario
          .definition
          .signals,

        scenario
          .definition
          .objection_when,

        scenario.id,
      )

      assert.ok(
        scenario
          .definition
          .objection_when
          .every(
            rule =>
              typeof rule ===
                'string' &&
              rule.length > 0,
          ),
        scenario.id,
      )
    }
  },
)
