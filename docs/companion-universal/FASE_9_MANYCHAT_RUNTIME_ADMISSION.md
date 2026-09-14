# Yolen Companion Universal — Fase 9

## Gate de admissão do runtime read-only do ManyChat

Data de referência: 2026-09-14

## Objetivo

Criar a barreira final entre um `validated profile` do ManyChat e qualquer futura execução real dentro da interface autenticada.

A fase não injeta scripts no ManyChat, não altera o `manifest.json`, não lê mensagens reais, não grava no ledger, não chama IA e não habilita composer.

O objetivo é impedir que um profile incompleto, trocado ou com capabilities perigosas seja aceito silenciosamente por um runtime futuro.

## Estado de entrada

A Fase 8 passou a produzir, somente após múltiplas validações estruturais, um artefato com:

```text
schema_version = yolen-manychat-validated-profile-v1
approved_for_readonly_runtime = true
approved_for_runtime = false
capture_enabled = false
persistence_enabled = false
reasoning_enabled = false
composer_enabled = false
```

Ainda faltava um componente responsável por verificar esse artefato no momento da admissão ao runtime.

## Implementado

Novo módulo:

```text
app/extension/yolen-companion/src/manychat-runtime-admission.js
```

Responsabilidades:

- aceitar somente o schema validado da Fase 8;
- aceitar somente `platform = manychat`;
- exigir `source_fingerprint`;
- permitir somente profiles explicitamente aprovados para `readonly runtime`;
- recusar qualquer profile que habilite runtime completo, captura, persistência, reasoning ou composer;
- revalidar os thresholds gravados no próprio artefato;
- exigir `conversationRoot` e `messages`;
- preservar seletores opcionais como opcionais;
- permitir pinagem opcional por fingerprint para evitar troca silenciosa de profile;
- aceitar apenas surfaces namespaced como `manychat:`;
- criar sessão read-only sem expor a `conversation_key` bruta no estado diagnóstico.

## Capabilities liberadas

O gate libera somente:

```text
dom_read = true
capture = false
persistence = false
reasoning = false
composer = false
network_write = false
```

Isso significa que mesmo um profile estruturalmente validado ainda não está autorizado a produzir efeitos fora do navegador.

## Fingerprint pinning

O runtime pode informar um `expectedFingerprint`.

Se o profile validado possuir outro fingerprint, a admissão falha com:

```text
PROFILE_FINGERPRINT_MISMATCH
```

Essa regra impede que uma alteração de DOM ou troca de profile seja aceita por acidente sem uma nova validação explícita.

## Revalidação de thresholds

A admissão não confia apenas no booleano `approved_for_readonly_runtime`.

Também confere se:

```text
pass_count >= minimum_passes
```

E:

```text
distinct_conversation_count >= minimum_distinct_conversations
```

Um artefato inconsistente ou adulterado falha fechado.

## Isolamento da identidade

Uma surface real só é aceita se:

```text
supported = true
platform = manychat
conversation_key começa com manychat:
```

A sessão criada pelo gate usa apenas uma referência derivada:

```text
mc-runtime-<hash>
```

A chave bruta não é exposta no snapshot de admissão.

## Testes

Novo arquivo:

```text
app/extension/yolen-companion/tests/manychat-runtime-admission.test.mjs
```

Cobertura:

- profile validado é admitido em modo read-only;
- qualquer capability perigosa habilitada é rejeitada;
- ausência de aprovação read-only é rejeitada;
- thresholds inconsistentes são rejeitados;
- fingerprint diferente é rejeitado;
- namespace fora de ManyChat é rejeitado;
- sessão não expõe `conversation_key` bruta;
- seletores obrigatórios continuam obrigatórios.

## O que continua desligado

Nesta fase não houve alteração em:

- `manifest.json`;
- permissões da extensão;
- runtime do WhatsApp;
- Supabase;
- APIs do Companion;
- Commercial Brain;
- Commercial Reasoning;
- composer do ManyChat;
- captura real de mensagens.

## Próximo gate técnico

A próxima fase pode montar o `ManyChat read-only runtime bootstrap`, mas ele deve permanecer condicionado a um profile realmente validado e admitido por este gate.

A injeção no `app.manychat.com` só deve acontecer quando existir profile autenticado aprovado e testes reais de troca de conversa, remount, scroll e virtualização.

## Gate de encerramento

Fase 9: **PASS**.

Existe agora uma barreira explícita entre validação estrutural e futura execução do ManyChat, com fail-closed para capabilities, fingerprint, thresholds e namespace.