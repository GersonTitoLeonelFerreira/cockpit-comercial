# ManyChat — resultado live do gate de equivalência semântica de identidade

Estado: PASS live. O ManyChat expõe uma identidade interna de plataforma corroborada entre múltiplas famílias semânticas, enquanto `wa_id` permanece uma identidade distinta do canal WhatsApp.

## Evidência local

Antes da validação live foram executados:

- 16 testes;
- 16 aprovados;
- 0 falhas;
- pacote Chrome dev gerado;
- pacote Chrome prod gerado;
- pacote Firefox dev gerado;
- pacote Firefox prod gerado.

## Evidência live

O fluxo A → B → A foi repetido no ManyChat autenticado e produziu o relatório seguro:

`yolen-manychat-identity-semantic-report.json`

O relatório informou:

- `source_identity_pass = true`;
- `proven_locator_count = 91`;
- `pass = true`;
- `stage = semantic_equivalence_evaluated`.

## Famílias semânticas

Foram observadas as famílias:

- `subscriber_id` — estável e singleton;
- `thread_user_id` — estável;
- `user_object_user_id` — estável;
- `data_user_id` — estável;
- `last_event_user_id` — estável, mas contextual;
- `whatsapp_user_id` — estável e distinto da identidade de plataforma.

## Relações provadas

O relatório demonstrou:

- `subscriber_id == thread_user_id`;
- `subscriber_id == user_object_user_id`;
- `subscriber_id == data_user_id`;
- `subscriber_id == last_event_user_id` nos casos observados;
- `subscriber_id != whatsapp_user_id`.

Assim, `wa_id` não deve ser tratado como alias do identificador interno do assinante ManyChat.

## Decisão

A decisão segura produzida pelo gate foi:

- `platform_identity_candidate = subscriber_id`;
- `platform_identity_corroborated = true`;
- corroborado por `thread_user_id`, `user_object_user_id` e `data_user_id`;
- `channel_identity_candidate = whatsapp_user_id`;
- `ready_for_namespace_design = true`.

Isso autoriza avançar para o desenho da chave determinística namespaced da Yolen, mas ainda não habilita associação automática com lead/ciclo.

## Privacidade

O relatório confirmou:

- `raw_identity_value_exposed = false`;
- `hashes_exposed = false`;
- `raw_message_text_exposed = false`;
- `persisted = false`;
- `network_sent = false`.

Nenhum valor bruto de `subscriberId`, `user_id`, `wa_id` ou texto de mensagem foi exportado.

## Próximo gate

O próximo passo é definir e validar o contrato de chave namespaced da Yolen para identidade ManyChat, com derivação criptográfica determinística a partir da identidade de plataforma aprovada, sem persistir o valor bruto.
