import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialObjectionPromptRules,
  COMMERCIAL_OBJECTION_PROMPT_RULES_VERSION,
} from './commercial-objection-prompt-rules.ts'

function buildObjectionV2() {
  return {
    contract_version:
      'commercial-objection-v2',

    definition: {
      contract_version:
        'commercial-objection-v2',

      objection_kind:
        'commercial_objection',

      objection_key:
        'price_value',

      objection:
        'Preço percebido como alto',

      category:
        'price',

      description:
        'Resistência em que preço ou relação entre preço e valor percebido dificulta materialmente a decisão.',

      scope: {
        type:
          'company',

        product_id:
          null,

        variant_key:
          null,
      },

      signals: [
        'Está caro.',
        'Ficou acima do orçamento.',
      ],

      objection_when: [
        'O cliente apresenta o preço como bloqueio real para avançar.',
      ],

      not_objection_when: [
        'O cliente apenas pergunta qual é o preço.',
      ],

      distinguish_from: [
        'question',
        'information_request',
        'condition',
        'postponement',
        'rejection',
        'uncertainty',
      ],

      discovery_questions: [
        'O que está pesando mais nessa condição?',
      ],

      recommended_approach:
        'Compreender a resistência antes de responder.',

      response_limits: [
        'Não presumir falta de dinheiro.',
        'Não oferecer desconto inexistente.',
      ],

      resolution_criteria: [
        'Está claro se preço continua sendo bloqueio.',
      ],

      wait_when: [
        'O cliente pediu tempo com compromisso explícito de retorno.',
      ],

      give_space_when: [
        'Insistir agora aumentaria a resistência.',
      ],

      stop_when: [
        'O cliente recusou explicitamente a continuidade.',
      ],
    },

    sort_order:
      1,

    objection:
      'Preço percebido como alto',

    signals: [
      'Está caro.',
      'Ficou acima do orçamento.',
    ],

    discovery_questions: [
      'O que está pesando mais nessa condição?',
    ],

    recommended_approach:
      'Compreender a resistência antes de responder.',

    response_limits: [
      'Não presumir falta de dinheiro.',
      'Não oferecer desconto inexistente.',
    ],
  }
}

test(
  'ausência de guia não inventa objeção nem apaga objeção comprovada pela conversa',
  () => {
    const rules =
      buildCommercialObjectionPromptRules(
        [],
      )

    assert.equal(
      COMMERCIAL_OBJECTION_PROMPT_RULES_VERSION,
      'commercial-objection-prompt-rules-v1',
    )

    assert.match(
      rules,
      /A ausência de guia configurado não prova ausência de objeção na conversa/,
    )

    assert.match(
      rules,
      /Só reconheça uma objeção ativa quando mensagens do contato externo fornecerem evidência suficiente/,
    )

    assert.match(
      rules,
      /Não invente objeção, causa, categoria, escopo, resposta, contra-argumento ou próxima ação/,
    )
  },
)

test(
  'guia configurado e signal não viram evidência nem objeção automática',
  () => {
    const rules =
      buildCommercialObjectionPromptRules([
        buildObjectionV2(),
      ])

    assert.match(
      rules,
      /nunca são evidência da conversa e nunca podem aparecer como evidence_message_ids/,
    )

    assert.match(
      rules,
      /A existência de um guia configurado não prova que aquela objeção esteja ativa/,
    )

    assert.match(
      rules,
      /sinal isolado não basta para declarar active_objections/,
    )

    assert.match(
      rules,
      /precisa possuir evidence_message_ids de mensagens atuais válidas/,
    )
  },
)

test(
  'pergunta preço adiamento incerteza condição e recusa permanecem estados distintos',
  () => {
    const rules =
      buildCommercialObjectionPromptRules([
        buildObjectionV2(),
      ])

    assert.match(
      rules,
      /Perguntar preço, investimento, forma de pagamento ou condição comercial não é automaticamente objeção/,
    )

    assert.match(
      rules,
      /"Vou pensar" não é automaticamente objeção/,
    )

    assert.match(
      rules,
      /question, information_request, condition, postponement, rejection e uncertainty/,
    )

    assert.match(
      rules,
      /Uma recusa explícita não deve ser suavizada artificialmente para objeção/,
    )
  },
)

test(
  'V2 usa reconhecimento exclusões resolução e escopo sem generalizar',
  () => {
    const rules =
      buildCommercialObjectionPromptRules([
        buildObjectionV2(),
      ])

    assert.match(
      rules,
      /definition\.objection_when descreve quando a situação pode ser reconhecida como objeção/,
    )

    assert.match(
      rules,
      /definition\.not_objection_when contém exclusões vinculantes/,
    )

    assert.match(
      rules,
      /definition\.resolution_criteria ajuda a determinar se a resistência continua ativa/,
    )

    assert.match(
      rules,
      /definition\.scope\.type=product aplica o guia somente ao product_id indicado/,
    )

    assert.match(
      rules,
      /definition\.scope\.type=product_variant aplica o guia somente à combinação exata/,
    )
  },
)

test(
  'descoberta e abordagem não viram roteiro contra-argumento ou mensagem obrigatória',
  () => {
    const rules =
      buildCommercialObjectionPromptRules([
        buildObjectionV2(),
      ])

    assert.match(
      rules,
      /definition\.discovery_questions são opções de descoberta/,
    )

    assert.match(
      rules,
      /nunca transforme a lista em interrogatório ou checklist/,
    )

    assert.match(
      rules,
      /definition\.recommended_approach orienta raciocínio e abordagem; não é resposta obrigatória/,
    )

    assert.match(
      rules,
      /definition\.response_limits contém limites vinculantes/,
    )

    assert.match(
      rules,
      /Nenhum guia de objeção, isoladamente, obriga pergunta, contra-argumentação, mensagem, intervenção, alteração de CRM ou criação de Agenda/,
    )
  },
)

test(
  'esperar dar espaço encerrar e não intervir permanecem decisões válidas',
  () => {
    const rules =
      buildCommercialObjectionPromptRules([
        buildObjectionV2(),
      ])

    assert.match(
      rules,
      /definition\.wait_when pode indicar que esperar é a melhor decisão/,
    )

    assert.match(
      rules,
      /definition\.give_space_when pode indicar que insistir pioraria a interação/,
    )

    assert.match(
      rules,
      /definition\.stop_when pode indicar que a tentativa comercial deve ser encerrada/,
    )

    assert.match(
      rules,
      /WAIT, GIVE_SPACE, STOP e ausência de intervenção são consequências válidas/,
    )

    assert.match(
      rules,
      /não force suggested_message ou recommended_question/,
    )
  },
)

test(
  'guia legado permanece limitado à semântica explicitamente configurada',
  () => {
    const rules =
      buildCommercialObjectionPromptRules([
        {
          contract_version:
            'commercial-objection-v1',

          definition:
            null,

          sort_order:
            1,

          objection:
            'Preço',

          signals: [
            'Está caro.',
          ],

          discovery_questions: [
            'O que está pesando nessa decisão?',
          ],

          recommended_approach:
            'Entender antes de responder.',

          response_limits: [
            'Não inventar desconto.',
          ],
        },
      ])

    assert.match(
      rules,
      /commercial-objection-v1 é um guia legado/,
    )

    assert.match(
      rules,
      /Não invente regras V2 ausentes/,
    )

    assert.match(
      rules,
      /signals do guia legado continuam sendo pistas, nunca prova suficiente/,
    )

    assert.match(
      rules,
      /não perguntas obrigatórias nem roteiro/,
    )
  },
)
