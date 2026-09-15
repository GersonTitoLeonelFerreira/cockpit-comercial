# ManyChat — Gate de identidade da conversa

Estado: probe seguro preparado para validação real A → B → A no Firefox autenticado. Ainda não existe associação automática ManyChat → lead/ciclo Yolen.

## Objetivo

Provar que a rota autenticada do ManyChat oferece um identificador de conversa estável o suficiente para distinguir duas conversas dentro do mesmo workspace, sem expor nem persistir os tokens nativos.

Rota observada no ambiente real:

`/workspace/chat/conversation`

Os valores reais de `workspace` e `conversation` são tratados como identificadores externos sensíveis e permanecem somente na memória isolada do content script durante o probe.

## Probe

O probe só aparece com o hash explícito:

`#yolen-conversation-probe`

Nenhuma chamada de rede é feita.

Nenhum valor bruto é gravado em `dataset`, `sessionStorage`, `localStorage`, backend ou logs.

O fluxo esperado é:

1. abrir uma conversa A e clicar em `Yolen · capturar conversa A`;
2. abrir uma conversa B no mesmo workspace e clicar novamente;
3. voltar para a conversa A e clicar uma terceira vez.

O PASS exige:

- a rota seguir `/workspace/chat/conversation`;
- o workspace permanecer igual entre A e B;
- o token de conversa mudar em B;
- ao voltar para A, o token voltar exatamente ao baseline mantido apenas em memória;
- nenhuma rede, persistência ou exposição de tokens ocorrer.

Resultado esperado no botão:

`Yolen · identidade da conversa PASS`

## Limites

Este gate não afirma ainda que o token de rota seja um telefone, contact id, subscriber id ou lead id do ManyChat. Ele é tratado apenas como `conversation route token` até existir evidência adicional.

Também continuam desligados:

- associação automática ao lead/ciclo Yolen;
- captura automática ManyChat;
- persistência de mensagens;
- reasoning automático;
- composer;
- escrita no ManyChat.

## Próximo passo após PASS real

Usar a identidade estável da conversa somente como chave externa opaca e validar como resolver essa conversa para um lead/ciclo Yolen sem depender de nome visível, texto de mensagem ou inferência por ordem da interface.
