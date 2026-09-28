# Companion — Sales Expert Coherence Wave 3

## Origem

Esta onda nasce do live test da extensão 1.2.0 na conversa real de Lorena. O teste provou que aumentar repertório de técnicas não basta se diferentes projeções do mesmo estado comercial ainda puderem divergir.

## Falhas observadas em campo

1. AGORA reconhecia quebra de sequência, mas recomendava espera passiva.
2. Uma espera de dias era tratada da mesma forma que uma espera de minutos.
3. MENSAGEM chamou a cliente pelo nome da vendedora, inferido de uma mensagem outgoing.
4. A oferta que desviou a conversa podia aparecer como `Principal acerto` e como erro de sequência ao mesmo tempo.
5. `Evite agora` podia exibir uma condição hipotética de outra técnica como se fosse fato atual.
6. ANÁLISE ainda renderizava um headline legado de oportunidade junto do Coaching Diagnosis canônico.
7. O método podia mostrar `Apresentação` como etapa atual sem indicar a etapa anterior parcial que precisava ser recuperada.
8. CLIENTE chamava último emissor de `Situação` e status do CRM de `Etapa atual`, criando uma segunda leitura comercial aparente.
9. O preset genérico de MENSAGEM era tratado como override soberano do vendedor, mesmo quando ele apenas significava `gere a melhor resposta para esta conversa`.

## Correções de autoridade

### AGORA e Commercial Reasoning

`commitment_wait` continua correto para espera fresca. A espera se torna `stale_waiting_for_customer` após a janela fallback business-agnostic de 48h. Quando o contexto publicado da empresa ganhar cadência estruturada, esse limite deve ser substituído pelo dado da empresa.

Uma espera antiga não pode manter `Espera disciplinada` indefinidamente. Ela habilita `Retomada contextual`, preservando a regra de não repetir a mesma pergunta.

### ANÁLISE

Quando existe Coaching Diagnosis canônico, a UI não renderiza `renderOpportunityHeader` legado. Strengths/improvements legados já estavam suprimidos; esta onda remove também o headline concorrente.

Um seller strength é descartado quando a própria evidência usada para sustentá-lo pertence a um evento que quebrou o objetivo ativo, representa oferta prematura ou possui baixa relevância.

### Método

A UI continua mostrando onde a execução chegou, mas o coaching calcula também a etapa recomendada. Se uma etapa anterior está `partial` e uma etapa posterior já está ativa, a anterior pode ser apresentada como recuperação recomendada mesmo quando o método está `partially_on_method`, sem exigir `off_method`.

### CLIENTE

A aba CLIENTE exibe fatos, não prescrição:
- `Etapa no CRM` para status operacional;
- `Última direção da conversa` para quem enviou a mensagem mais recente;
- `Última mensagem foi do vendedor/cliente` em vez de `aguardando resposta` como conclusão comercial.

## Identidade de mensagem

MENSAGEM passa a receber participantes oficiais:
- `recipient_name`: `leads.name` da oportunidade atual;
- `seller_name`: `profiles.full_name` do usuário autenticado.

O gerador e o gate final recebem os dois nomes explicitamente. Se `recipient_name` não estiver disponível, a mensagem deve omitir o nome; nunca pode inferir o cliente a partir de mensagens outgoing. Um rascunho que começa tratando `seller_name` como destinatário é rejeitado e regenerado.

## Preset genérico de MENSAGEM

`Quero responder ao ponto principal desta conversa.` é um preset da interface, não uma decisão comercial específica do vendedor.

Ele recebe `seller_intent_mode=default_follow_reasoning` e deve obedecer Commercial Reasoning + Message Strategy. Apenas intenções específicas do usuário recebem `explicit_override` e podem contrariar a recomendação, mantendo grounding e segurança.

## Restrições

`no_new_customer_fact_after_action` é requisito de aplicabilidade de técnicas específicas. O fato de alguma técnica não atender esse requisito não prova que o cliente trouxe fato novo. Esse blocker hipotético não pode virar texto atual em `Evite agora`.

## Caso Lorena — aceite obrigatório

Na sequência experimental → confirmação breve → pergunta de dia/horário → oferta desconectada → dias sem resposta:

1. `Que ótimo` é confirmation e não quebra o objetivo;
2. a oferta posterior é a quebra relevante;
3. espera antiga não seleciona `commitment_wait` como técnica primária;
4. técnica primária pode ser `Retomada contextual`;
5. decisão é `follow_up`, não `wait`;
6. mensagem não repete dia/horário;
7. mensagem nunca chama Lorena de Mayara;
8. a oferta que desviou não é elogiada como principal acerto;
9. `Evite agora` não inventa fato novo do cliente;
10. ANÁLISE não mostra `Avançando Apresentação` como segunda autoridade;
11. método diferencia etapa observada da etapa recomendada para recuperação;
12. CLIENTE não apresenta último emissor/CRM como recomendação comercial.

## Gate

Antes de merge:
- `gate:coaching-engine-mvp` integralmente verde;
- paridade E3 WhatsApp/ManyChat verde;
- `next typegen` + `tsc --noEmit` verdes;
- Vercel do head verde;
- live test posterior com build identificável 1.3.0.
