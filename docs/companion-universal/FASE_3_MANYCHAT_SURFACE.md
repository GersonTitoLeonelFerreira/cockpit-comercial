# Yolen Companion Universal — Fase 3

## Reconhecimento seguro da superfície ManyChat

Data de referência: 2026-09-14

## Objetivo

Iniciar o suporte técnico real ao ManyChat sem tocar no runtime validado do WhatsApp, sem enviar dados ao backend e sem inventar seletores de DOM que ainda não foram comprovados em uma conta autenticada.

A fase transforma uma URL de conversa conhecida do ManyChat em uma identidade estável e namespaced que poderá alimentar o adapter da próxima fase.

## Evidência usada

A superfície web pública do ManyChat utiliza `app.manychat.com` e existem exemplos públicos de links diretos de conversa no formato:

```text
https://app.manychat.com/fb{account_id}/chat/{contact_id}
```

A implementação desta fase usa somente esse fato de roteamento. Ela não presume estrutura interna do DOM, canal, telefone, nome, mensagens, atribuição ou composer.

## Implementado

Novo módulo:

```text
app/extension/yolen-companion/src/manychat-surface.js
```

Responsabilidades:

- aceitar somente HTTPS em `app.manychat.com`;
- reconhecer somente rota direta de conversa `/fb.../chat/...`;
- extrair `account_key` e `external_contact_id` da rota;
- construir `external_conversation_id` estável;
- gerar `conversation_key` pelo contrato universal já criado;
- manter `channel = unknown` enquanto o canal real não estiver comprovado;
- rejeitar rotas, hosts e URLs não suportados sem fallback permissivo;
- expor snapshot diagnóstico que deixa explicitamente desligados captura, persistência e reasoning.

## Identidade produzida

Exemplo:

```text
https://app.manychat.com/fb871594/chat/1443150072
```

produz conceitualmente:

```text
platform = manychat
channel = unknown
account_key = fb871594
external_contact_id = 1443150072
external_conversation_id = fb871594:chat:1443150072
conversation_key = manychat:unknown:<identidade codificada>
```

O canal não é inferido da URL. Uma conversa não vira `whatsapp`, `instagram`, `messenger` ou `telegram` sem evidência da interface real.

## Segurança

Nesta fase:

```text
capture_enabled = false
persistence_enabled = false
reasoning_enabled = false
```

Nenhuma mensagem é lida.
Nenhum contato é criado.
Nenhum ciclo é resolvido.
Nenhuma chamada ao Supabase é feita.
Nenhuma chamada de IA é feita.
Nenhuma permissão nova é adicionada ao manifest.
Nenhum código do WhatsApp é alterado.

Isso mantém o ManyChat isolado até o adapter possuir evidência suficiente da interface autenticada.

## Testes

Novo arquivo:

```text
app/extension/yolen-companion/tests/manychat-surface.test.mjs
```

Os testes cobrem:

- rota válida de conversa;
- estabilidade da identidade com query/hash;
- proibição de inventar canal;
- rota ManyChat que não representa conversa;
- host incorreto;
- URL inválida;
- snapshot diagnóstico incapaz de ativar captura/persistência/reasoning.

## Decisão arquitetural

A primeira identidade do ManyChat nasce da rota, não do texto visível da tela.

Isso reduz um risco crítico já conhecido no Companion: troca visual de conversa ou remount de DOM não deve ser capaz de trocar silenciosamente a identidade canônica.

O DOM continuará sendo usado como sensor para conteúdo e metadados quando o `ManyChatAdapter` for implementado, mas a conversa precisa primeiro possuir uma chave estável independente de scroll.

## Gate de encerramento

Fase 3: **PASS**.

Existe agora um reconhecedor específico do ManyChat que produz identidade universal estável e fail-closed sem alterar o runtime produtivo existente. A próxima fase pode implementar o `ManyChatAdapter` de leitura sobre essa fundação, mantendo captura e persistência separadas até o adapter passar pelos gates de isolamento.
