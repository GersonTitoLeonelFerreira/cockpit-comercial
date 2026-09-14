# Yolen Companion Universal — Fase 5

## Reader DOM desacoplado + isolamento determinístico de conversa

Data de referência: 2026-09-14

## Objetivo

Criar a camada que permitirá ler o DOM autenticado do ManyChat sem contaminar o `ManyChatAdapter`, sem inventar seletores da interface real e sem permitir que troca de conversa A→B seja interpretada como simples mutação da conversa A.

Esta fase não ativa o ManyChat no `manifest.json`, não persiste mensagens e não roda Commercial Reasoning.

## Estado de entrada

A Fase 4 encerrou com:

```text
manychat-surface.js
    ↓
identidade estável pela rota

manychat-adapter.js
    ↓
composição read-only de evidências
    ↓
UniversalConversation somente quando pronta
```

Ainda faltava uma camada DOM substituível capaz de fornecer ao adapter:

- canal;
- contato;
- atribuição;
- mensagens visíveis;
- composer;
- eventos de mudança de interface.

## Implementado

Novo módulo:

```text
app/extension/yolen-companion/src/manychat-dom-reader.js
```

O reader recebe um `profile` explícito com seletores e funções de leitura.

O runtime do reader não contém seletor inventado do ManyChat.

Exemplo conceitual:

```text
ManyChat DOM real
    ↓
profile comprovado da interface
    ↓
manychat-dom-reader.js
    ↓
manychat-adapter.js
    ↓
UniversalConversation
```

## Contrato do profile

O profile informa:

```text
selectors.conversationRoot
selectors.channel
selectors.contact
selectors.assignment
selectors.messages
selectors.composer
```

E as funções:

```text
readChannel
readContact
readAssignment
readMessage
readComposer (opcional)
```

`conversationRoot`, `messages` e `readMessage` são obrigatórios para criar o reader.

A escolha dos seletores reais fica fora do engine e só será adicionada quando houver evidência obtida da interface autenticada do ManyChat.

## Fail-closed

O reader não converte ausência de evidência em fato.

### Canal

Sem nó ou função comprovada:

```text
unknown
```

### Contato

Sem leitura comprovada:

```text
name = null
phone = null
external_contact_id = ID já validado pela rota
```

### Assignment

Sem evidência suficiente:

```text
known = false
assigned = null
```

Nunca transforma estado desconhecido em `unassigned`.

### Exclusão

Desaparecer do DOM não significa mensagem excluída.

O reader só aceita:

```text
is_deleted = true
deletion_reason = explicit_deletion
```

qualquer outra tentativa falha alto.

Isso preserva a regra canônica já adotada pelo Companion: DOM é sensor, não fonte absoluta da verdade comercial.

## Isolamento A→B

`observeChanges()` mantém a última `conversation_key` conhecida e consulta novamente a superfície atual a cada evento do DOM.

Se a chave mudou:

```text
A
↓
B
```

emite:

```text
conversation_changed
previous_conversation_key = A
conversation_key = B
```

Não emite esse evento como uma mutação pertencente a A.

Se a chave continua igual, emite:

```text
conversation_mutated
conversation_key = A
```

Esse guard existe antes de qualquer integração com ledger ou reasoning.

## Integração com o adapter

O teste de integração prova que:

```text
DOM fixture
    ↓
ManyChatDomReader
    ↓
ManyChatAdapter
    ↓
UniversalConversation válida
```

continua em modo read-only:

```text
capture_enabled = false
persistence_enabled = false
reasoning_enabled = false
composer_enabled = false
```

## Importante sobre os fixtures de teste

Os seletores usados nos testes possuem prefixo:

```text
data-fixture-*
```

Eles existem exclusivamente dentro do HTML sintético da suíte.

Eles NÃO representam seletores reais do ManyChat e não devem ser copiados para o profile de produção.

## Testes

Novo arquivo:

```text
app/extension/yolen-companion/tests/manychat-dom-reader.test.mjs
```

Cobertura:

- leitura por profile explícito;
- integração reader → adapter → contrato universal;
- assignment desconhecido permanece desconhecido;
- desaparecimento visual não vira exclusão;
- exclusão sem evidência explícita é rejeitada;
- troca A→B emite `conversation_changed`;
- mutação dentro de A permanece vinculada a A;
- profile incompleto falha fechado.

## O que não foi alterado

Nesta fase não houve alteração em:

- `manifest.json`;
- permissões da extensão;
- runtime do WhatsApp;
- Supabase;
- Vercel;
- APIs do Companion;
- Commercial Brain;
- Commercial Reasoning;
- composer real do ManyChat.

O novo reader ainda não é injetado automaticamente em `app.manychat.com`.

## Próximo gate técnico

A próxima fase pode agora produzir o primeiro `profile` da interface autenticada do ManyChat com evidência real, conectar esse profile ao reader e só então ampliar o `manifest.json` para executar o caminho read-only dentro do Inbox.

A implementação deverá continuar sem persistência até passar por testes reais de:

```text
A → B
B → A
A → B → C
troca durante mutação
scroll
remount
virtualização
```

## Gate de encerramento

Fase 5: **PASS**.

Existe agora uma camada DOM substituível e testável entre ManyChat e o adapter, com isolamento explícito de conversa e sem qualquer seletor de produção inventado.
