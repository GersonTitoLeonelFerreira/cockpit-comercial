# ManyChat — Gate de evidência interna de identidade

Estado: probe diagnóstico preparado. Captura automática, persistência, reasoning e associação com lead/ciclo continuam desligados.

## Motivação

O gate anterior validou duas coisas em ambiente autenticado real:

- o canal da conversa pode ser reconhecido de forma estável;
- os escopos DOM observados não forneceram um identificador estruturado de contato suficientemente confiável.

Não é aceitável transformar nome visível, posição na lista ou texto da conversa em identidade de contato.

Este gate investiga uma fonte mais interna sem ainda consumir nenhum valor em produção: o estado React associado aos nós da conversa no `MAIN` world da página.

## Estratégia

O probe só é ativado quando a URL contém:

`#yolen-mainworld-identity-probe`

Ele procura a chave React dinâmica (`__reactFiber$...` ou equivalente legado) nos nós próximos ao `chat-messages-list` e percorre, de forma limitada, `memoizedProps`, `pendingProps` e `memoizedState`.

A busca considera apenas nomes de campos semanticamente específicos:

- `contactId` / `contact_id`;
- `subscriberId` / `subscriber_id`;
- `userId` / `user_id`;
- `customerId` / `customer_id`;
- `phone`;
- `phoneNumber` / `phone_number`;
- `mobile`;
- `whatsappId` / `whatsapp_id`;
- `waId` / `wa_id`.

O campo genérico `id` é deliberadamente ignorado.

## Critério A → B → A

O operador captura:

1. conversa A;
2. conversa B;
3. retorno para A.

Um locator interno só é considerado evidência quando:

- existe em A;
- muda em B;
- retorna exatamente ao mesmo valor quando volta para A.

O relatório publicado contém somente o caminho estrutural do locator e booleans/contagens. Os valores reais permanecem apenas em memória durante o teste.

## Privacidade

O relatório nunca expõe:

- telefone;
- contact/subscriber/user/customer id;
- hash desses valores;
- texto de mensagem;
- conteúdo do composer.

Também permanece:

- `persisted = false`;
- `network_sent = false`.

## Limites

Mesmo um PASS neste gate não habilita resolução automática de lead. Um locator aprovado ainda precisa ter sua semântica confirmada e ser integrado a um contrato de resolução seguro.

Se nenhum locator for provado, a próxima opção segura é uma associação determinística explícita da conversa ManyChat com um ciclo Yolen, em vez de inferência por nome ou conteúdo.
