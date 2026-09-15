# ManyChat — Gate de surface opaca da conversa

Estado: preparado sobre evidência autenticada real A → B → A. Captura automática, persistência, reasoning e resolução de lead continuam desligados.

## Evidência que mudou a semântica

A validação real no Firefox autenticado confirmou que a rota do ManyChat segue o formato:

`/workspace/chat/conversation`

E confirmou por A → B → A que o segundo token da rota é estável para identificar a conversa dentro do mesmo workspace.

Essa evidência NÃO prova que o token seja `contact_id`, `subscriber_id`, telefone, lead id ou qualquer outro identificador de pessoa.

Por isso a implementação deixa de tratar o token de rota como `external_contact_id`.

## Contrato adotado

Para uma rota válida:

- `platform = manychat`;
- `channel = unknown` enquanto o canal não vier de evidência independente;
- `account_key` continua sendo o token do workspace da rota;
- `external_contact_id = null`;
- `contact_identity_ready = false`;
- `external_conversation_id` é derivado apenas da identidade da rota;
- `conversation_key` continua namespaced por `manychat` e `unknown`;
- `identity_source = authenticated_route`.

O token da rota é, portanto, identidade de conversa opaca. Ele não é promovido para identidade de contato.

## Runtime

O bloco ManyChat do `manifest.json` passa a carregar, antes dos módulos de mensagem:

1. `platform-contract.js`;
2. `manychat-surface.js`;
3. módulos já validados de semântica, identidade, conteúdo e áudio.

Isso disponibiliza uma identidade canônica da conversa dentro do content script sem ativar captura ou escrita.

## Segurança

Continuam explicitamente `false`:

- `capture_enabled`;
- `persistence_enabled`;
- `reasoning_enabled`;
- `lead_resolution_enabled`.

A rota sozinha não autoriza resolver um lead Yolen.

Nome visível, posição na lista, texto das mensagens e ordem do DOM não podem ser usados para inventar associação com um lead/ciclo.

## Regressões bloqueadas

Os testes passam a exigir que:

- `external_contact_id` permaneça `null` para identidade proveniente apenas da rota;
- A → B → A preserve a mesma `conversation_key` para A e uma chave diferente para B;
- query string e hash não mudem a identidade canônica;
- o adapter não transforme o token da rota em contato implícito;
- o evidence probe continue sem inventar identidade de contato;
- o pacote produtivo carregue `platform-contract.js` e `manychat-surface.js` antes dos módulos ManyChat dependentes.

## Próximo gate

Descobrir uma evidência independente e estruturada que permita resolver a conversa ManyChat para um lead/ciclo Yolen.

O próximo gate deve preferir identificadores estruturados do contato ou telefone comprovado. Se essa evidência não existir de forma estável, a associação automática deve permanecer desligada em vez de usar nome, texto ou heurística visual.
