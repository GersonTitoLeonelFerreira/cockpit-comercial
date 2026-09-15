# ManyChat — gate de equivalência semântica da identidade

Estado: implementação diagnóstica preparada. Resolução automática de lead, associação com `cycle_id`, persistência geral de mensagens e reasoning produtivo continuam desligados.

## Evidência de entrada

O gate anterior provou em ambiente autenticado real que o estado React do ManyChat contém identidade interna estável. O relatório A → B → A retornou 91 locators estáveis, incluindo famílias como:

- `subscriberId`;
- `thread.user_id`;
- `thread.user.user_id`;
- `user.user_id`;
- `wa_id`;
- `last_lc_event.user_id`;
- `data.user_id`.

Essa evidência não autoriza escolher um locator arbitrário como chave produtiva.

## Objetivo

Este gate reduz os 91 locators a famílias semânticas e compara os valores somente em memória, sem exportar os valores brutos.

Famílias avaliadas:

- `subscriber_id`;
- `thread_user_id`;
- `user_object_user_id`;
- `whatsapp_user_id`;
- `last_event_user_id`;
- `data_user_id`.

Para uma família ser considerada `stable_singleton`, todos os locators aprovados usados na decisão precisam convergir para um único valor em A, mudar para um único valor em B e voltar exatamente ao valor de A no retorno A2.

## Equivalência

Quando duas famílias são `stable_singleton`, o gate compara seus valores em A, B e A2 e publica somente:

- `same_value`;
- `distinct_value`;
- `unavailable`.

Nenhum valor bruto ou hash é exportado.

## Critério para candidato de identidade da plataforma

`subscriber_id` só fica pronto para desenho de namespace quando:

1. é `stable_singleton`;
2. é corroborado como `same_value` por pelo menos uma família interna entre `thread_user_id`, `user_object_user_id` ou `data_user_id`.

`whatsapp_user_id`, quando estável, é tratado separadamente como candidato de identidade de canal. Ele não substitui automaticamente a identidade da plataforma.

## Segurança

O relatório seguro mantém:

- `raw_identity_value_exposed = false`;
- `hashes_exposed = false`;
- `raw_message_text_exposed = false`;
- `persisted = false`;
- `network_sent = false`.

Os valores usados para comparar equivalência existem somente em memória durante o fluxo A → B → A.

## Execução live

O mesmo probe já validado de identidade interna é reutilizado. O operador abre:

`#yolen-mainworld-identity-probe`

e executa novamente:

1. captura A;
2. abre conversa B distinta e captura B;
3. retorna para A e conclui.

O exporter acompanha os mesmos três cliques e, quando possui as três evidências, baixa:

`yolen-manychat-identity-semantic-report.json`

Resultado seller-facing esperado para PASS:

`Yolen · semântica PASS · relatório baixado`

## Gate de saída

O gate só pode ser encerrado depois de revisar o relatório live e confirmar:

- quais famílias estão `stable_singleton`;
- quais famílias são `same_value`;
- se `subscriber_id` ficou corroborado;
- se `whatsapp_user_id` é igual ou distinto da identidade ManyChat;
- se `ready_for_namespace_design = true`.

Mesmo com PASS, este gate ainda não habilita persistência ou resolução automática. O próximo gate deverá definir uma chave namespaced e criptograficamente derivada para a identidade produtiva.
