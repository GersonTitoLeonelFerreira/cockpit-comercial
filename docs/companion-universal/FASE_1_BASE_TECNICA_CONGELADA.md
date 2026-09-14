# Yolen Companion Universal — Fase 1

## Base técnica congelada

Data de referência: 2026-09-14

Esta fase existe para fixar a base oficial antes do início do suporte ao ManyChat e impedir que a expansão multicanal quebre o runtime já validado do WhatsApp.

## Resultado da fase

A Fase 1 está concluída com a seguinte decisão operacional:

- o trabalho do Companion Universal parte da `main` estável;
- o SHA de ancoragem pré-fase é `4b6a3a633bc32e065a60411a01f0d5217a1c3311`;
- os PRs `#296` e `#297` permanecem frentes independentes e não são incorporados à base do ManyChat enquanto continuarem draft;
- nenhuma mudança de runtime, Supabase ou Vercel foi necessária nesta fase;
- a expansão universal deve preservar integralmente o comportamento atual do WhatsApp até o ManyChat provar o novo contrato de plataforma.

## Estado do GitHub auditado

### `main`

SHA auditado:

```text
4b6a3a633bc32e065a60411a01f0d5217a1c3311
```

Esse commit corresponde ao fechamento da remediação factual da Fase 16.9.

### PR #296

Branch:

```text
chatgpt/phase16-9-hotfix-runtime
```

Estado:

```text
OPEN
DRAFT
```

O PR altera runtime da extensão, `yolen-api.js`, guards de DOM, retry/polling e testes reais de mutação de DOM. Por isso ele não deve ser misturado com a primeira implementação do ManyChat enquanto não houver decisão própria de merge.

O workflow remoto observado falhou antes de executar steps (`steps=[]`, `runner_id=0`). Portanto essa falha isolada não é usada como evidência de regressão funcional do código.

### PR #297

Branch:

```text
chatgpt/commercial-reasoning-core-v2
```

Estado:

```text
OPEN
DRAFT
```

Esse PR está empilhado sobre a branch do #296 e altera Commercial Reasoning Core V2, worker/background, reader seller-facing, persistência e migration. Não faz parte da fundação da captura ManyChat nesta fase.

O workflow remoto observado também encerrou antes de executar steps (`steps=[]`, `runner_id=0`).

## Estado do Companion atual

O `manifest.json` ainda representa o Companion como integração específica do WhatsApp Web:

- descrição específica para WhatsApp Web;
- `host_permissions` para `https://web.whatsapp.com/*`;
- content scripts injetados no WhatsApp Web;
- bridges específicos de identidade e áudio do WhatsApp.

Esse acoplamento é conhecido e será tratado por adaptação progressiva, não por reescrita do runtime atual.

Também existem módulos que ainda conhecem diretamente seletores do WhatsApp, incluindo `[data-pre-plain-text]`.

A decisão desta fase é não desmontar esse caminho antes de existir um segundo adapter funcionando.

## Estado do Supabase auditado

Projeto:

```text
Yolen - Cockpit Comercial
project_ref: gileobqwszwzlwgiwgyl
status: ACTIVE_HEALTHY
region: sa-east-1
```

Não existe branch de desenvolvimento do Supabase no momento; apenas a branch principal está disponível.

### Estruturas canônicas já existentes

Foram confirmadas, entre outras:

```text
conversation_messages
conversation_capture_state
conversation_message_device_state
conversation_message_reconciliation_state
companion_conversation_registrations
companion_commercial_states
companion_background_analysis_jobs
```

A RPC canônica de ingestão existente é:

```text
rpc_ingest_companion_messages
```

Ela já opera por:

```text
company_id
cycle_id
conversation_key
device_key
messages
```

O contrato persistido já trabalha com:

```text
message_key
direction = incoming | outgoing
occurred_at
observed_at
content_type = text | audio
text_content
audio_transcription
versionamento causal
edição/exclusão
```

Portanto, não existe necessidade arquitetural comprovada de criar `manychat_messages` ou outro ledger paralelo.

### Segurança confirmada

As estruturas críticas auditadas possuem RLS ativo e `FORCE ROW LEVEL SECURITY`.

A execução de `rpc_ingest_companion_messages` está restrita a `postgres` e `service_role`.

Nenhuma DDL foi aplicada nesta fase.

## Estado da Vercel auditado

O status associado ao commit estável no GitHub está `success` para Vercel.

O conector direto da Vercel não expôs o projeto na listagem da equipe durante esta auditoria. Isso é registrado como limitação operacional do acesso da ferramenta, não como evidência de indisponibilidade do deploy.

Nenhuma configuração de ambiente ou deploy foi alterada.

## Decisão arquitetural congelada

O objetivo do Companion Universal é este:

```text
PLATAFORMA
    ↓
PLATFORM ADAPTER
    ↓
CONTRATO UNIVERSAL DE CONVERSA
    ↓
CAPTURE / LEDGER CANÔNICO
    ↓
COMMERCIAL BRAIN
    ↓
COMMERCIAL REASONING
    ↓
AGORA / ANÁLISE / CLIENTE / MENSAGEM
```

O WhatsApp atual continua funcionando pelo caminho existente enquanto o ManyChat é usado para provar o contrato universal.

A ordem arquitetural aprovada é:

```text
preservar WhatsApp atual
        ↓
definir contrato universal mínimo
        ↓
construir ManyChatAdapter isolado
        ↓
provar captura e isolamento
        ↓
conectar ao ledger existente
        ↓
provar Companion seller-facing no ManyChat
        ↓
só depois adaptar internamente o WhatsApp ao mesmo contrato
```

## Regras permanentes para as próximas fases

1. Não criar um segundo Companion para ManyChat.
2. Não duplicar o ledger por plataforma.
3. Não colocar regras ManyChat dentro do Commercial Brain.
4. Não transformar `content-script.js` em uma cadeia de `if/else` por plataforma.
5. Não alterar o Reasoning apenas para fazer o ManyChat funcionar.
6. DOM é sensor; ledger + estado canônico continuam sendo a verdade da conversa.
7. Toda identidade de conversa deve ser namespaced por plataforma/canal para evitar colisões.
8. Nenhuma migration será criada sem necessidade demonstrada por um caso real.
9. O primeiro alvo do ManyChat será uma conversa de WhatsApp dentro do Inbox, reduzindo variáveis de identidade.
10. A compatibilidade universal é construída por adapters validados, não por permissão irrestrita para ler qualquer site.

## Gate de encerramento

Fase 1: **PASS**.

Não houve alteração de runtime, banco ou infraestrutura produtiva. A base técnica, os limites de escopo e a estratégia de coexistência com as frentes #296/#297 ficaram congelados para iniciar a implementação do contrato universal na fase seguinte.