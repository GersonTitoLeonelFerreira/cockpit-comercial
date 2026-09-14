# Yolen Companion Universal — Fase 11

## Harness de validação autenticada do ManyChat

Data de referência: 2026-09-14

## Objetivo

Transformar a cadeia construída nas Fases 3–10 em uma ferramenta executável manualmente dentro da interface autenticada do ManyChat, sem alterar o `manifest.json` e sem liberar captura, persistência, IA, composer ou escrita de rede.

A necessidade desta fase existe porque um profile real do ManyChat não pode ser criado a partir de documentação pública, fixtures sintéticos ou seletores inventados. Ele precisa nascer de evidência observada na interface autenticada.

Esta fase cria o mecanismo para obter essa evidência e validar um profile real sem colocar o runtime em produção antes da hora.

## Estado de entrada

A Fase 10 encerrou com a seguinte cadeia arquitetural pronta:

```text
validated profile
    ↓
runtime admission
    ↓
DOM reader
    ↓
ManyChat adapter
    ↓
read-only runtime bootstrap
```

Porém, o `manifest.json` continua sem `app.manychat.com`, corretamente.

Ainda faltava uma forma segura de executar o pipeline de descoberta e validação na interface autenticada sem instalar um profile ainda não comprovado no runtime da extensão.

## Implementado

### 1. Harness autenticado

Novo módulo:

```text
app/extension/yolen-companion/src/manychat-authenticated-validation-harness.js
```

Ele coordena:

```text
ManyChat Surface
    ↓
Evidence Probe
    ↓
Profile Gate
    ↓
Profile Validator
    ↓
Validated Read-only Profile
```

A ferramenta mantém todo o estado apenas em memória da página.

Ela não chama backend, não grava Supabase e não envia relatório automaticamente.

### 2. Bundle diagnóstico manual

Novo script:

```text
app/extension/yolen-companion/scripts/build-manychat-authenticated-validation-bundle.mjs
```

Ele concatena somente:

```text
manychat-surface.js
manychat-evidence-probe.js
manychat-profile-gate.js
manychat-profile-validator.js
manychat-authenticated-validation-harness.js
```

O resultado é salvo em:

```text
dist/yolen-companion-diagnostics/manychat-authenticated-validation.js
```

Esse arquivo é diagnóstico e não pertence ao pacote de produção da extensão.

## Como gerar o bundle

Na raiz do repositório:

```bash
node app/extension/yolen-companion/scripts/build-manychat-authenticated-validation-bundle.mjs
```

O comando imprime o caminho do arquivo gerado.

## Uso previsto na interface autenticada

Com o ManyChat Inbox autenticado e uma conversa real aberta, o bundle pode ser carregado manualmente pelo DevTools para disponibilizar:

```js
createYolenManyChatAuthenticatedValidation()
```

Exemplo conceitual:

```js
const yolenMC = createYolenManyChatAuthenticatedValidation()
```

### Etapa A — evidência estrutural

```js
yolenMC.collectEvidence()
```

O retorno mostra candidatos estruturais redigidos, suficientes para decidir os índices do mapping sem ler texto das mensagens.

### Etapa B — candidate baseado em evidência

Depois de selecionar somente atributos realmente observados:

```js
yolenMC.buildCandidate({
  conversationRoot: {
    candidate_index: 0,
    attribute: 'role',
  },
  messages: {
    candidate_index: 12,
    attribute: 'data-testid',
  },
})
```

Os índices acima são apenas exemplo de uso da API. Eles não representam a interface real do ManyChat.

### Etapa C — validação multi-conversa

```js
yolenMC.beginValidation()
```

Com conversas reais diferentes abertas ao longo do teste:

```js
yolenMC.observeCurrentConversation()
```

O threshold padrão continua sendo:

```text
3 PASS
2 conversas distintas
0 falhas
```

### Etapa D — finalizar o profile

```js
yolenMC.finalizeValidatedProfile()
```

O profile só é produzido se o validator da Fase 8 considerar o conjunto de observações pronto.

### Etapa E — exportar relatório seguro

```js
yolenMC.exportSafeReport()
```

Esse relatório é o artefato indicado para auditoria posterior.

## Privacidade

O harness não expõe no relatório seguro:

- `conversation_key` bruta;
- `external_conversation_id` bruto;
- conteúdo textual das mensagens;
- valores de inputs;
- nomes ou telefones coletados como texto livre.

A identidade da conversa vira somente:

```text
mc-auth-<fingerprint>
```

O relatório declara explicitamente:

```text
text_content_collected = false
input_values_collected = false
network_sent = false
persisted = false
raw_conversation_identity_exposed = false
```

## Fail-closed

A ordem operacional é obrigatória:

```text
collectEvidence
    ↓
buildCandidate
    ↓
beginValidation
    ↓
observeCurrentConversation
    ↓
finalizeValidatedProfile
```

Tentar pular uma etapa gera erro explícito.

Um novo `collectEvidence()` invalida candidate, validation session e validated profile anteriores.

`reset()` apaga todo o estado transitório do harness.

## O que esta fase NÃO afirma

Esta fase não afirma que já existe seletor real aprovado do ManyChat.

Também não afirma que direção, timestamp, texto, áudio, assignment ou canal já foram validados semanticamente no DOM autenticado.

O harness existe exatamente para impedir essa extrapolação.

## O que não foi alterado

Nesta fase não houve alteração em:

- `manifest.json`;
- `host_permissions`;
- content scripts do ManyChat;
- runtime do WhatsApp;
- Supabase;
- APIs do Companion;
- Commercial Brain;
- Commercial Reasoning;
- composer;
- captura real;
- persistência real.

## Testes

Novo arquivo:

```text
app/extension/yolen-companion/tests/manychat-authenticated-validation-harness.test.mjs
```

Cobertura:

- identidade bruta da conversa não aparece na view segura;
- pipeline evidence → candidate → validation → validated profile;
- ordem operacional fail-closed;
- reset de estado;
- bundle diagnóstico contém somente a cadeia necessária;
- bundle não carrega `content-script.js`, background ou transporte de captura.

## Próximo gate técnico

Agora existe uma forma controlada de produzir a primeira evidência autenticada real.

O próximo gate deixa de ser arquitetural e passa a depender de evidência de produto real:

```text
ManyChat autenticado
    ↓
evidence snapshot real
    ↓
mapping real
    ↓
3 PASS / 2 conversas
    ↓
validated profile real
```

Somente depois disso deve ser criada a camada de semântica real de mensagens e, posteriormente, a injeção no `manifest.json`.

## Gate de encerramento

Fase 11: **PASS arquitetural**.

Existe agora um harness reproduzível, read-only e sem rede para executar a validação do profile dentro da interface autenticada do ManyChat sem antecipar permissões de produção.