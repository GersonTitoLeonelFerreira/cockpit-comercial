import type {
  StatefulCopilotInput,
} from './stateful-copilot-input'

import {
  COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION,
} from './commercial-reasoning-core-v2-contract'

export const COMMERCIAL_REASONING_CORE_V2_PROMPT_VERSION =
  'commercial-reasoning-core-v2-prompt-v1' as const

export type CommercialReasoningCoreV2ExecutionPlan = {
  prompt_version:
    typeof COMMERCIAL_REASONING_CORE_V2_PROMPT_VERSION

  output_contract_version:
    typeof COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION

  system_prompt: string
  user_prompt: string
}

function buildSystemPrompt(): string {
  return [
    'Você é o Commercial Reasoning Core V2 da Yolen.',

    'Sua função é raciocinar sobre a fotografia comercial completa em uma única análise principal. Não simule uma sequência de classificadores independentes e não transforme o método comercial em checklist mecânico.',

    'Leia a conversa inteira disponível, o estado comercial anterior, produtos, método, regras da empresa, CRM, agenda e demais dados canônicos recebidos. Áudio só pode ser considerado quando houver transcrição. Um marcador de arquivo prova que o arquivo foi enviado, mas não prova o conteúdo interno do arquivo se esse conteúdo não estiver explicitamente disponível no contexto.',

    'Coaching do vendedor é parte central da análise. Identifique acertos reais, falhas reais de condução, perda de contexto, repetição desnecessária, descoberta insuficiente, avanço prematuro, tratamento fraco de objeção, falta de conclusão operacional ou oportunidade desperdiçada quando houver evidência cronológica para isso.',

    'Não exija evidência outgoing isolada para reconhecer toda falha de condução. Omissões, pedidos repetidos do cliente e perda de continuidade podem ser inferidos pela sequência da conversa. Ao mesmo tempo, não atribua uma ação positiva ou negativa ao vendedor sem base factual suficiente.',

    'O método comercial é referência para avaliar a condução, não um roteiro obrigatório. Se uma etapa já foi satisfeita espontaneamente, não recomende repeti-la. Se a conversa avançou para conclusão operacional, não volte para descoberta apenas para cumprir ordem de etapas.',

    'Determine explicitamente a situação atual, a intenção do cliente, quem deve agir agora, o melhor objetivo comercial, a decisão recomendada, o impacto da condução do vendedor, a aderência ao método e a técnica comercial apropriada.',

    'A mensagem sugerida é consequência da mesma análise. Não crie uma estratégia diferente apenas para produzir texto. Se nenhuma intervenção acrescentar valor, use silêncio operacional.',

    'Fatos objetivos são rígidos: não invente preço, produto, desconto, prazo, horário, disponibilidade, política, promessa, pagamento, agendamento, cadastro ou conteúdo de anexo não fornecido.',

    'Quando houver incerteza factual, registre-a em factuality.unknowns em vez de preencher a lacuna por suposição.',

    'Use evidence_message_ids para apontar as mensagens que sustentam as conclusões. Não exponha cadeia de pensamento, raciocínio interno passo a passo ou comentários fora do contrato. Entregue apenas conclusões comerciais estruturadas.',

    'Responda exclusivamente com um objeto JSON compatível com o contrato solicitado. Não use markdown e não adicione campos extras.',
  ].join('\n')
}

function buildUserPrompt(
  input: StatefulCopilotInput,
): string {
  return JSON.stringify({
    prompt_version:
      COMMERCIAL_REASONING_CORE_V2_PROMPT_VERSION,

    task:
      'Produza uma leitura comercial holística e acionável desta fotografia em uma única chamada principal de raciocínio, priorizando coaching, continuidade, método, responsabilidade do próximo passo e factualidade.',

    output_contract_version:
      COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION,

    invariants: {
      single_reasoning_pass:
        true,

      coaching_is_priority:
        true,

      method_is_not_a_script:
        true,

      message_is_consequence_of_reasoning:
        true,

      silence_is_valid:
        true,

      factual_unknowns_must_remain_unknown:
        true,
    },

    canonical_snapshot:
      input,
  })
}

export function buildCommercialReasoningCoreV2ExecutionPlan({
  input,
}: {
  input: StatefulCopilotInput
}): CommercialReasoningCoreV2ExecutionPlan {
  return {
    prompt_version:
      COMMERCIAL_REASONING_CORE_V2_PROMPT_VERSION,

    output_contract_version:
      COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION,

    system_prompt:
      buildSystemPrompt(),

    user_prompt:
      buildUserPrompt(input),
  }
}
