# Companion — Sales Expert Integration

## Objetivo

Esta frente não cria outro Core, outro renderer por canal ou uma Fase 7 de fine-tuning.

Ela corrige a última milha entre o Commercial Reasoning já construído e o comportamento que o vendedor realmente vê. O Companion deve operar como especialista comercial contextual: entender a conversa, avaliar a execução do vendedor, respeitar o método publicado da empresa, selecionar técnica adequada, usar conhecimento oficial de empresa/produto e transformar isso em uma única próxima ação e em uma mensagem coerente.

## Autoridade seller-facing

Quando o Commercial Reasoning estiver `ready` ou `limited`, ele governa o conteúdo da próxima ação. Decision State continua fornecendo prioridade, urgência e provenance operacional, mas não pode substituir a ação comercial por uma recomendação legada contraditória.

## Continuidade comercial

Intenção forte do cliente não é apagada por uma resposta curta e semanticamente neutra. Uma conversa pode permanecer em intenção de agendamento, fechamento ou outra intenção comprovada mesmo quando a mensagem seguinte do cliente não repete as mesmas palavras.

A técnica `Retomada contextual` cobre o cenário em que:
- havia intenção comercial comprovada;
- o vendedor já executou a pergunta/ação necessária;
- houve silêncio, repetição ou quebra de sequência;
- é preciso reabrir a oportunidade sem refazer a mesma ação.

## Método, empresa e produtos

O Commercial Intelligence recebe descrição e princípios do método, etapas/objetivos/critérios/perguntas recomendadas, posicionamento da empresa, fatos oficiais vigentes, guias de objeção e conteúdo publicado de produtos. O conteúdo oficial selecionado passa ao Message Strategy como grounding real, não apenas como explicação de ranking.

## UX

ANÁLISE não empilha mais o novo Coaching Diagnosis com strengths/improvements legados quando o diagnóstico canônico existe. A técnica selecionada aparece como `Técnica recomendada` na ANÁLISE e o nome da técnica fica visível no resumo recolhido de AGORA.

## Regressão do live test

1. cliente demonstra intenção de agendar;
2. vendedor pergunta dia/horário;
3. cliente não resolve o compromisso;
4. vendedor muda para oferta/produto;
5. Companion não pode recomendar repetir a pergunta de dia/horário;
6. deve recuperar continuidade com técnica adequada;
7. uma mensagem semanticamente equivalente à pergunta já feita deve ser bloqueada;
8. uma retomada contextual diferente deve permanecer permitida.
