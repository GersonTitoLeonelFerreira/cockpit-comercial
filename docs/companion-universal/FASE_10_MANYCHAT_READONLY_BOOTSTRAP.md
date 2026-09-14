# Yolen Companion Universal — Fase 10

## Bootstrap read-only do runtime ManyChat

Data de referência: 2026-09-14

## Objetivo

Montar o primeiro coordenador de runtime do ManyChat capaz de ligar, de forma controlada:

```text
validated profile
    ↓
runtime admission
    ↓
ManyChat DOM reader
    ↓
ManyChat adapter
    ↓
snapshot read-only
```

A fase continua sem injetar scripts em `app.manychat.com`, sem alterar o `manifest.json`, sem persistir mensagens, sem chamar IA e sem habilitar escrita no composer.

O bootstrap só pode existir quando recebe um profile já validado pelas fases anteriores e admitido pelo gate da Fase 9.

## Implementado

Novo módulo:

```text
app/extension/yolen-companion/src/manychat-runtime-bootstrap.js
```

O módulo expõe:

```text
createManyChatReadOnlyRuntimeBootstrap()
```

A instância resultante possui:

```text
start()
snapshot()
stop()
getState()
```

## Gate de entrada

Antes de criar qualquer sessão, o bootstrap delega a validação para:

```text
YolenManyChatRuntimeAdmission
```

Portanto, continuam obrigatórias as garantias da Fase 9:

```text
approved_for_readonly_runtime = true
approved_for_runtime = false
capture_enabled = false
persistence_enabled = false
reasoning_enabled = false
composer_enabled = false
```

O bootstrap não possui caminho para relaxar essas regras.

## Profile do reader

Os seletores usados pelo DOM reader vêm exclusivamente do `validated profile`.

O bootstrap não permite substituir esses seletores por valores arbitrários no momento da execução.

As funções de interpretação do DOM continuam desacopladas e são fornecidas como readers:

```text
readChannel
readContact
readAssignment
readMessage
```

`readMessage` é obrigatório.

Mesmo que o chamador forneça `readComposer`, ele não é conectado ao runtime nesta fase.

## Capabilities

O runtime permanece limitado a:

```text
dom_read = true
capture = false
persistence = false
reasoning = false
composer = false
network_write = false
```

Nenhuma função do bootstrap envia mensagem, chama endpoint, persiste snapshot ou executa Commercial Reasoning.

## Isolamento de conversa

A Fase 10 adiciona uma segunda proteção contra contaminação A → B.

Antes de cada `snapshot()` o bootstrap reconsulta a surface atual e executa novamente o gate de admissão.

Isso significa que mesmo se um evento de DOM não chegar, chegar atrasado ou for perdido durante remount/virtualização, uma leitura não reutiliza silenciosamente a sessão da conversa anterior.

Fluxo:

```text
sessão admitida para A
    ↓
DOM muda silenciosamente para B
    ↓
snapshot()
    ↓
reconsulta surface
    ↓
readmite B
    ↓
só então lê o adapter
```

Se a surface atual não for admitida, o adapter não é consultado.

## Eventos seguros

O bootstrap acompanha os eventos já produzidos pelo DOM reader:

```text
conversation_changed
conversation_mutated
```

A saída diagnóstica não replica a `conversation_key` bruta.

Ela usa apenas a referência derivada pelo gate de admissão:

```text
mc-runtime-<hash>
```

## Snapshot read-only

O snapshot do bootstrap expõe apenas metadados operacionais necessários para validação:

```text
active
profile_fingerprint
conversation_ref
evidence_ready
missing_evidence
channel
assignment_known
visible_message_count
capabilities
```

O conteúdo das mensagens não é copiado para o snapshot do bootstrap.

Essa decisão reduz risco de vazamento diagnóstico e mantém o bootstrap separado do futuro pipeline de captura.

## Ciclo de vida

`start()`:

- admite a surface atual;
- cria reader e adapter;
- inicia observação de mudanças;
- retorna snapshot read-only.

`snapshot()`:

- revalida a surface atual;
- bloqueia leitura se a surface não for admitida;
- nunca persiste a leitura.

`stop()`:

- desconecta o observer;
- invalida a sessão;
- impede reinício da mesma instância.

## Testes

Novo arquivo:

```text
app/extension/yolen-companion/tests/manychat-runtime-bootstrap.test.mjs
```

Cobertura:

- inicia somente em read-only;
- conteúdo bruto de mensagens não aparece no snapshot;
- chave canônica da conversa não aparece no snapshot/evento;
- seletores do reader são exatamente os do profile validado;
- composer permanece desconectado;
- `readMessage` é obrigatório;
- profile perigoso é recusado pelo gate anterior;
- troca A → B readmite a nova surface;
- troca silenciosa A → B é detectada no próximo snapshot;
- surface não admitida bloqueia leitura antes do adapter;
- `stop()` encerra observer e impede reinício.

## O que não foi alterado

Nesta fase não houve alteração em:

- `manifest.json`;
- permissões da extensão;
- runtime do WhatsApp;
- Supabase;
- APIs do Companion;
- Vercel;
- Commercial Brain;
- Commercial Reasoning;
- composer do ManyChat;
- captura real de mensagens.

## Por que o manifest continua intacto

Ainda não existe, neste repositório, um profile real aprovado a partir de evidência da interface autenticada do ManyChat.

Adicionar `https://app.manychat.com/*` agora faria a extensão executar código em uma plataforma para a qual ainda não existe seletor de produção comprovado.

A Fase 10 prepara todo o caminho de execução sem cometer esse erro.

## Próximo gate técnico

O próximo passo é obter evidência real da interface autenticada, produzir o primeiro profile de produção, validar esse profile em múltiplas conversas e somente então autorizar uma injeção read-only no ManyChat.

A primeira ativação real deve provar, no mínimo:

```text
A → B
B → A
A → B → C
scroll
remount
virtualização
mudança durante mutação
```

antes de qualquer captura ou persistência.

## Gate de encerramento

Fase 10: **PASS arquitetural**.

O caminho read-only do ManyChat agora possui um bootstrap explícito, condicionado ao profile validado e ao runtime admission, com ressincronização de conversa antes de cada leitura e sem qualquer capability de escrita ou persistência.
