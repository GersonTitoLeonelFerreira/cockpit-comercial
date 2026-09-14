# Yolen Companion Universal — Fase 4

## ManyChatAdapter read-only com gates de evidência

Data de referência: 2026-09-14

## Objetivo

Criar o primeiro adapter formal do ManyChat sobre o contrato universal sem ativar captura produtiva, persistência, reasoning ou escrita no composer.

A fase não inventa seletores de DOM. O adapter aceita uma camada `reader` separada e só constrói uma `UniversalConversation` quando as evidências mínimas estiverem explicitamente disponíveis.

## Implementado

Novo módulo:

```text
app/extension/yolen-companion/src/manychat-adapter.js
```

O módulo implementa a interface mínima exigida por `platform-contract.js`:

```text
getPlatform
getCurrentConversation
collectVisibleMessages
getContact
getAssignment
observeChanges
getComposer
```

E acrescenta:

```text
getChannel
getEvidenceState
buildUniversalConversation
createReadOnlySnapshot
```

## Regra fail-closed

Sem um reader comprovado, o adapter usa somente a identidade já validada pela rota do ManyChat.

Ele não inventa:

- canal;
- nome;
- telefone;
- atribuição;
- vendedor;
- mensagens;
- composer.

Nesse estado:

```text
channel = unknown
assignment.known = false
messages = []
evidence_ready = false
```

A diferença entre `assignment desconhecido` e `unassigned` é preservada. Um estado desconhecido nunca é convertido silenciosamente em `assigned = false`.

## Gate para produzir UniversalConversation

`buildUniversalConversation()` só libera uma conversa universal quando existem simultaneamente:

1. rota de conversa ManyChat suportada;
2. canal identificado por evidência;
3. estado de atribuição conhecido;
4. reader de mensagens presente.

Quando qualquer item estiver ausente, retorna `ready = false` e lista `missing` sem produzir conversa canônica.

Quando todos estiverem presentes, o adapter usa o contrato universal existente para validar a saída antes de liberá-la.

## Segurança operacional

A fase permanece estritamente read-only:

```text
capture_enabled = false
persistence_enabled = false
reasoning_enabled = false
composer_enabled = false
```

Não houve alteração em:

- `manifest.json`;
- runtime do WhatsApp;
- Supabase;
- Vercel;
- APIs do Companion;
- Commercial Brain;
- Commercial Reasoning.

O arquivo ainda não é injetado automaticamente no ManyChat. Isso é intencional: o próximo passo técnico precisa ligar um reader de DOM autenticado e comprovado antes de ampliar permissões da extensão.

## Testes

Novo arquivo:

```text
app/extension/yolen-companion/tests/manychat-adapter.test.mjs
```

Cobertura adicionada:

- adapter satisfaz o contrato mínimo universal;
- ausência de reader não fabrica fatos;
- contato mínimo usa somente o ID da rota validada;
- evidência suficiente produz `UniversalConversation` válida;
- assignment desconhecido não vira conversa não atribuída;
- rota fora de conversa falha fechada antes de chamar readers.

## Decisão arquitetural

O ManyChat agora possui duas camadas separadas:

```text
manychat-surface.js
    ↓
identidade estável da conversa

manychat-adapter.js
    ↓
composição de evidências
    ↓
UniversalConversation somente quando pronta
```

A próxima camada será o reader real da interface autenticada. Ele deverá ser substituível e isolado do adapter, para que uma mudança de DOM do ManyChat não contamine ledger, Commercial Brain ou Reasoning.

## Gate de encerramento

Fase 4: **PASS**.

Existe um `ManyChatAdapter` formal, read-only e fail-closed, capaz de transformar evidência comprovada em contrato universal sem alterar o produto atual do WhatsApp nem persistir dados incompletos.
