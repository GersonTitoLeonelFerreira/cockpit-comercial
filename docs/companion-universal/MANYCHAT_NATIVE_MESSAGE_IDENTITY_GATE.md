# ManyChat — Gate de identidade nativa da mensagem

Estado: identidade estrutural validada para mensagens de cliente e atendente humano em ambiente autenticado real.

Este gate NÃO ativa o ManyChat em produção. Manifest, captura, persistência, reasoning e composer continuam desligados.

## Evidência autenticada

Conversa real observada no Inbox do ManyChat:

- 20 mensagens estruturais visíveis;
- 6 mensagens `customer`;
- 12 mensagens `human_agent`;
- 2 mensagens `automation`;
- 20/20 wrappers com `data-title` parseável como timestamp;
- 6/6 mensagens `customer` com exatamente um descendente `[data-mid]`;
- 12/12 mensagens `human_agent` com exatamente um descendente `[data-mid]`;
- 18 identidades `data-mid` humanas/cliente distintas;
- nenhuma duplicidade entre as 18 identidades;
- 0/2 mensagens de automação com `data-mid`.

## Estabilidade após remount

Foi criado um baseline seguro das 18 identidades, usando somente hash diagnóstico e comprimento do valor.

A conversa foi desmontada ao navegar para outra conversa e depois renderizada novamente ao retornar.

Resultado:

- `baselineCount: 18`;
- `currentCount: 18`;
- `stable: true`;
- `missingAfterRerenderCount: 0`;
- `newAfterRerenderCount: 0`.

Conclusão: para mensagens de cliente e atendente humano, `data-mid` demonstrou identidade estável através de remount real do DOM e pode ser tratado como fonte nativa de identidade dentro do gate read-only.

## Timestamp

O atributo estrutural `data-title` esteve presente e foi parseável nas 20 mensagens observadas.

O módulo normaliza esse valor para ISO apenas quando `Date.parse` comprova uma data válida. Timestamp ausente ou inválido falha fechado.

## Automação

Mensagens `automation` permaneceram sem `data-mid` no cenário observado.

Portanto:

- não recebem identidade nativa inventada;
- não recebem fallback baseado em texto;
- não recebem fallback baseado em posição no DOM;
- não ficam elegíveis para `message_key` neste gate;
- continuam fora de reasoning como já definido no gate semântico de autoria.

A identidade de automações precisa de evidência separada antes de qualquer inclusão no ledger.

## Implementação

Arquivo:

`app/extension/yolen-companion/src/manychat-message-identity.js`

Regras:

- `customer` e `human_agent` exigem exatamente um `[data-mid]`;
- mais de um `[data-mid]` => `native_message_id_ambiguous`;
- nenhum `[data-mid]` => `native_message_id_missing`;
- `automation` => `automation_native_identity_not_validated`;
- timestamp ausente/inválido => falha fechada;
- o safe view nunca expõe o valor bruto de `data-mid`;
- nenhuma escrita de rede ou persistência é ativada.

O bundle autenticado de diagnóstico passa a incluir:

- `manychat-message-semantics.js`;
- `manychat-message-identity.js`.

Isso permite os próximos testes autenticados sem alterar o manifest.

## Próximo gate

Validar conteúdo real de mensagem com separação entre:

- texto;
- mídia/attachment;
- áudio;
- automação.

A extração de conteúdo não deve usar `wrapper.textContent` indiscriminadamente como contrato produtivo. O próximo passo é identificar o nó semântico de conteúdo e garantir que timestamp, avatar, metadados e labels não contaminem `text_content`.
