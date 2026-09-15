# ManyChat — gate de namespace determinístico de identidade

Estado: desenho técnico fechado a partir do PASS live de equivalência semântica.

## Evidência de entrada

O gate anterior provou em sessão autenticada real que:

- `subscriber_id` é estável no fluxo A → B → A;
- `subscriber_id` é corroborado por `thread_user_id`, `user_object_user_id` e `data_user_id`;
- `whatsapp_user_id` é estável, mas representa uma identidade distinta de canal;
- a decisão semântica terminou com `ready_for_namespace_design = true`.

A superfície ManyChat já expõe `account_key` a partir da rota autenticada. Esse valor identifica o escopo da conta/workspace, mas não é tratado como identidade do contato.

Portanto, o namespace produtivo não deve usar nome, telefone visível, texto da conversa, índice DOM ou o token da rota da conversa como identidade do contato.

## Decisão

A identidade principal ManyChat passa a ter o seguinte desenho lógico:

`manychat:contact:v1:sha256:<digest>`

O `digest` é SHA-256 do material canônico:

```text
["yolen-manychat-contact-v1", <account_key>, <subscriber_id>]
```

A inclusão do `account_key` é obrigatória. Não assumimos que `subscriber_id` seja globalmente único entre contas/workspaces ManyChat.

Para o canal WhatsApp, quando `whatsapp_user_id` estiver disponível, a identidade secundária usa namespace separado:

`manychat:channel:whatsapp:v1:sha256:<digest>`

com material canônico:

```text
["yolen-manychat-channel-v1", <account_key>, "whatsapp", <whatsapp_user_id>]
```

Mesmo que os valores brutos coincidam por acaso, identidade da plataforma e identidade do canal não podem gerar a mesma chave.

## Propriedades obrigatórias

O módulo `manychat-identity-namespace.js` garante:

- determinismo para a mesma entrada;
- separação entre contas/workspaces;
- separação entre identidade ManyChat e identidade WhatsApp;
- nenhuma inclusão de valor bruto nas chaves finais;
- fail closed quando `account_key`, `subscriber_id` ou SHA-256 não estiverem disponíveis.

SHA-256 aqui é um pseudônimo determinístico e mecanismo de namespace/collision resistance. Não deve ser descrito como anonimização criptográfica contra brute force de identificadores previsíveis.

## Ativação

Este gate define o contrato e os testes, mas não ativa resolução automática de lead.

O novo módulo ainda não entra no `manifest.json` nem na allowlist do pacote porque nenhum runtime produtivo deve consumir identidade bruta antes do próximo gate de bridge seguro MAIN world → isolated/background.

Continuam desligados:

- associação automática ManyChat → lead;
- associação automática com `cycle_id`;
- persistência geral de mensagens ManyChat;
- reasoning produtivo ManyChat;
- composer/escrita no ManyChat.

## Próximo gate

Criar a bridge segura de identidade ManyChat:

1. ler `account_key` e `subscriber_id` somente no MAIN world;
2. gerar a chave namespaced ali, antes de cruzar fronteira de contexto;
3. publicar para o isolated world somente a chave pseudônima e metadados não sensíveis;
4. provar A → B → A com chaves diferentes em A/B e retorno exato em A;
5. não expor `subscriber_id`, `wa_id`, telefone ou texto bruto no evento/DOM/console.
