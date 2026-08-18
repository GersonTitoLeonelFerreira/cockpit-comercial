import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_METHOD_CONTRACT_VERSION,
  validateCommercialMethodDefinition,
} from './commercial-method-contract.ts'

function buildAtoMethod() {
  return {
    contract_version:
      COMMERCIAL_METHOD_CONTRACT_VERSION,

    name:
      'Método ATO',

    description:
      'Acolher, compreender por meio do Tour e Obter o desfecho comercial adequado sem transformar o método em roteiro mecânico.',

    principles: [
      'Responder ao que o cliente realmente precisa antes de tentar avançar.',
      'Perguntar somente quando a resposta puder mudar a decisão comercial.',
      'Informação já comprovada não deve ser perguntada novamente.',
      'Esperar e não intervir são decisões comerciais válidas.',
    ],

    stages: [
      {
        key:
          'acolher',

        display_order:
          1,

        name:
          'Acolher',

        objective:
          'Criar continuidade humana e compreender o motivo imediato da interação sem gerar fricção desnecessária.',

        requirement:
          'required',

        completion_criteria: [
          'A intenção imediata do cliente foi compreendida.',
          'Perguntas ou demandas urgentes do cliente foram reconhecidas.',
        ],

        partial_completion_criteria: [
          'Existe contato estabelecido, mas a intenção atual ainda não está clara.',
        ],

        skip_conditions: [],

        recommended_questions: [
          'O que você está buscando hoje?',
        ],

        common_mistakes: [
          'Ignorar a pergunta atual para iniciar um roteiro de descoberta.',
          'Fazer várias perguntas de uma só vez.',
        ],

        deepen_when: [
          'A intenção do cliente permanece ambígua e muda materialmente a orientação.',
        ],

        sufficient_when: [
          'A intenção atual está clara o suficiente para decidir a próxima necessidade comercial.',
        ],

        advance_when: [
          'O cliente foi acolhido e existe contexto suficiente para compreender a necessidade.',
        ],

        wait_when: [
          'O cliente informou que retomará a conversa e não existe pendência do vendedor.',
        ],

        stop_asking_when: [
          'A pergunta atual já foi respondida e novas perguntas não alterariam a decisão comercial.',
        ],

        dimensions: [],
      },

      {
        key:
          'tour',

        display_order:
          2,

        name:
          'Tour',

        objective:
          'Compreender a situação comercial relevante do cliente e conectar somente as informações necessárias para orientar uma solução adequada.',

        requirement:
          'required',

        completion_criteria: [
          'A necessidade relevante para a decisão atual está compreendida.',
          'Existe evidência suficiente para decidir se uma solução pode ser apresentada com segurança.',
        ],

        partial_completion_criteria: [
          'A necessidade principal apareceu, mas ainda existe incerteza material para recomendar uma solução.',
        ],

        skip_conditions: [],

        recommended_questions: [
          'O que é mais importante para você nessa escolha?',
          'Como você pretende utilizar essa solução?',
        ],

        common_mistakes: [
          'Transformar descoberta em interrogatório.',
          'Perguntar novamente informações já presentes na conversa.',
          'Apresentar todos os benefícios sem relação com a necessidade real.',
        ],

        deepen_when: [
          'Falta uma informação que pode alterar produto, condição, compatibilidade ou recomendação.',
        ],

        sufficient_when: [
          'A necessidade, o contexto e os critérios relevantes já permitem responder ou recomendar com segurança.',
        ],

        advance_when: [
          'Existe correspondência comprovada entre necessidade e solução disponível.',
        ],

        wait_when: [
          'A decisão depende de uma informação ou manifestação futura do cliente e não existe ação útil do vendedor agora.',
        ],

        stop_asking_when: [
          'As informações já existentes são suficientes para responder ao que o cliente quer compreender.',
          'Uma nova pergunta serviria apenas para cumprir o método, sem alterar a decisão.',
        ],

        dimensions: [
          {
            key:
              'contexto',

            name:
              'Contexto',

            objective:
              'Entender a situação que influencia a decisão atual.',

            evidence_criteria: [
              'Existe contexto suficiente para interpretar a demanda atual.',
            ],
          },

          {
            key:
              'necessidade',

            name:
              'Necessidade',

            objective:
              'Compreender o problema, objetivo ou resultado buscado.',

            evidence_criteria: [
              'A necessidade relevante para a decisão está identificada.',
            ],
          },

          {
            key:
              'criterios_decisao',

            name:
              'Critérios de decisão',

            objective:
              'Compreender os critérios que realmente podem alterar a escolha.',

            evidence_criteria: [
              'Os critérios materiais para a escolha estão conhecidos quando necessários.',
            ],
          },
        ],
      },

      {
        key:
          'obter',

        display_order:
          3,

        name:
          'Obter',

        objective:
          'Reconhecer ou construir o desfecho comercial adequado ao momento, que pode incluir decisão, compromisso, espera ou ausência de intervenção.',

        requirement:
          'required',

        completion_criteria: [
          'O estado comercial atual possui um desfecho coerente e sustentado pelas evidências disponíveis.',
        ],

        partial_completion_criteria: [
          'Existe interesse ou intenção, mas ainda há uma pendência material antes de qualquer compromisso.',
        ],

        skip_conditions: [],

        recommended_questions: [
          'Faz sentido seguirmos por essa opção?',
        ],

        common_mistakes: [
          'Forçar reunião, agendamento ou fechamento sem necessidade.',
          'Criar próximo passo apenas para manter a conversa ativa.',
          'Enviar follow-up quando o próprio cliente já assumiu compromisso de retorno.',
        ],

        deepen_when: [
          'Uma objeção ou incerteza material impede uma decisão segura.',
        ],

        sufficient_when: [
          'Está claro se a negociação precisa avançar, aguardar, receber espaço ou encerrar.',
        ],

        advance_when: [
          'Existe decisão ou compromisso comercial apropriado e sustentado pelo contexto.',
        ],

        wait_when: [
          'O cliente assumiu explicitamente um compromisso de retorno e não há ação pendente do vendedor.',
          'Pressionar agora criaria mais risco do que valor.',
        ],

        stop_asking_when: [
          'A melhor decisão comercial é aguardar.',
          'O cliente já declarou sua decisão ou próximo compromisso com clareza.',
        ],

        dimensions: [],
      },
    ],
  }
}

test(
  'contrato representa ATO com três etapas superiores sem roteiro mecânico',
  () => {
    const method =
      buildAtoMethod()

    const result =
      validateCommercialMethodDefinition(
        method,
      )

    assert.equal(
      result.valid,
      true,
      JSON.stringify(
        result.issues,
        null,
        2,
      ),
    )

    assert.equal(
      method.stages.length,
      3,
    )

    assert.deepEqual(
      method.stages.map(
        stage => stage.name,
      ),
      [
        'Acolher',
        'Tour',
        'Obter',
      ],
    )

    assert.equal(
      method.stages[1]
        .dimensions.length,
      3,
    )
  },
)

test(
  'perguntas recomendadas podem ficar vazias sem invalidar uma etapa',
  () => {
    const method =
      buildAtoMethod()

    method.stages[2]
      .recommended_questions = []

    const result =
      validateCommercialMethodDefinition(
        method,
      )

    assert.equal(
      result.valid,
      true,
    )
  },
)

test(
  'etapa obrigatória não pode declarar condição para ser pulada',
  () => {
    const method =
      buildAtoMethod()

    method.stages[0]
      .skip_conditions = [
        'Pular sempre.',
      ]

    const result =
      validateCommercialMethodDefinition(
        method,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.code ===
          'REQUIRED_STAGE_CANNOT_BE_SKIPPED',
      ),
      true,
    )
  },
)

test(
  'etapa condicional precisa declarar quando pode ser pulada',
  () => {
    const method =
      buildAtoMethod()

    method.stages[2]
      .requirement =
        'conditional'

    const result =
      validateCommercialMethodDefinition(
        method,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.code ===
          'CONDITIONAL_STAGE_REQUIRES_SKIP_CONDITION',
      ),
      true,
    )
  },
)

test(
  'chaves semânticas duplicadas são rejeitadas',
  () => {
    const method =
      buildAtoMethod()

    method.stages[1].key =
      method.stages[0].key

    const result =
      validateCommercialMethodDefinition(
        method,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.code ===
          'DUPLICATE_KEY',
      ),
      true,
    )
  },
)

test(
  'critério de suficiência é obrigatório para impedir descoberta infinita',
  () => {
    const method =
      buildAtoMethod()

    method.stages[1]
      .sufficient_when = []

    const result =
      validateCommercialMethodDefinition(
        method,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.path ===
          'stages[1].sufficient_when',
      ),
      true,
    )
  },
)

test(
  'regra de parar de perguntar é obrigatória',
  () => {
    const method =
      buildAtoMethod()

    method.stages[1]
      .stop_asking_when = []

    const result =
      validateCommercialMethodDefinition(
        method,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.path ===
          'stages[1].stop_asking_when',
      ),
      true,
    )
  },
)

test(
  'ATO consegue representar espera como decisão válida sem criar nova pergunta',
  () => {
    const method =
      buildAtoMethod()

    const obter =
      method.stages.find(
        stage =>
          stage.key ===
          'obter',
      )

    assert.ok(obter)

    assert.equal(
      obter.wait_when.some(
        condition =>
          condition.includes(
            'compromisso de retorno',
          ),
      ),
      true,
    )

    assert.equal(
      obter.stop_asking_when.some(
        condition =>
          condition.includes(
            'aguardar',
          ),
      ),
      true,
    )
  },
)
