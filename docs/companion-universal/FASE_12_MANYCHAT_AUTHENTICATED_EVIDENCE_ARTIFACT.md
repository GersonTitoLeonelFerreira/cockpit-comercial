# Yolen Companion Universal — Fase 12

## Artefato verificável de evidência autenticada do ManyChat

Data de referência: 2026-09-14

## Objetivo

Transformar o relatório seguro produzido pelo harness autenticado da Fase 11 em um artefato determinístico e auditável antes de qualquer avanço para semântica de mensagens, manifest, captura, persistência ou Commercial Reasoning.

A Fase 11 criou a ferramenta para observar a interface autenticada. Ainda faltava um gate que recebesse o relatório exportado e provasse que:

- a evidência é realmente do ManyChat;
- o relatório continua sem identidade bruta da conversa;
- o profile candidate e o validated profile são o mesmo profile;
- os thresholds de validação estão satisfeitos;
- não existe nenhuma falha registrada;
- as referências de conversa são anonimizadas;
- nenhuma capability perigosa foi ligada no caminho.

Esta fase fecha esse problema.

## Implementado

### 1. Verificador do artefato autenticado

Novo módulo:

```text
app/extension/yolen-companion/src/manychat-authenticated-evidence-artifact.js
```

Entrada esperada:

```text
yolen-manychat-authenticated-validation-harness-v1
```

Saída validada:

```text
yolen-manychat-authenticated-evidence-artifact-v1
```

O artefato só é produzido quando todo o relatório passa pelas invariantes desta fase.

## Invariantes obrigatórias

### Plataforma

O relatório, evidence snapshot, validation state, observations e validated profile precisam permanecer em:

```text
platform = manychat
```

### Privacidade

O relatório precisa declarar:

```text
text_content_collected = false
input_values_collected = false
network_sent = false
persisted = false
raw_conversation_identity_exposed = false
```

Além disso, o verificador percorre o relatório inteiro e rejeita a presença de campos proibidos como:

```text
conversation_key
external_conversation_id
text_content
audio_transcription
input_value
raw_text
message_text
```

Assim, um relatório supostamente seguro que carregue identidade bruta ou conteúdo não é promovido para artefato.

### Evidência segura

A surface do relatório precisa usar somente:

```text
mc-auth-<hash>
```

A chave real da conversa não pode aparecer.

### Candidate

O candidate precisa manter:

```text
approved_for_runtime = false
capture_enabled = false
persistence_enabled = false
reasoning_enabled = false
```

E precisa conter, no mínimo:

```text
conversationRoot
messages
```

### Validação autenticada

O estado precisa estar pronto:

```text
ready = true
failure_count = 0
```

E satisfazer:

```text
pass_count >= minimum_passes
```

```text
distinct_conversation_count >= minimum_distinct_conversations
```

As observações precisam ser todas `PASS` e usar somente referências anonimizadas:

```text
mc-conv-<hash>
```

A quantidade de conversas distintas declarada também precisa existir de fato nas observações.

### Validated profile

O profile final precisa:

- usar `yolen-manychat-validated-profile-v1`;
- manter o mesmo fingerprint do candidate;
- preservar exatamente os mesmos seletores;
- preservar o mesmo resumo de validação;
- estar aprovado somente para runtime read-only;
- manter runtime completo, captura, persistência, reasoning e composer desligados.

## Fingerprint do artefato

Quando o relatório passa no gate, o módulo gera:

```text
mc-evidence-<hash>
```

Esse fingerprint é calculado a partir da prova estrutural relevante:

- platform;
- profile fingerprint;
- selectors;
- contagens e thresholds de validação.

Horários de exportação não alteram o fingerprint.

Isso permite comparar duas exportações do mesmo profile sem depender da hora em que foram produzidas.

## Elegibilidade resultante

O artefato aprovado declara explicitamente:

```text
semantic_validation = true
readonly_runtime = true
manifest_injection = false
capture = false
persistence = false
reasoning = false
composer = false
network_write = false
```

Portanto, **PASS nesta fase não autoriza produção**.

Ele apenas significa que existe evidência estrutural autenticada suficiente para iniciar a validação semântica real das mensagens.

## Verificador local

Novo script:

```text
app/extension/yolen-companion/scripts/verify-manychat-authenticated-evidence.mjs
```

Uso:

```bash
node app/extension/yolen-companion/scripts/verify-manychat-authenticated-evidence.mjs <report.json>
```

Também é possível fixar o fingerprint esperado:

```bash
node app/extension/yolen-companion/scripts/verify-manychat-authenticated-evidence.mjs <report.json> mc-profile-xxxxxxxx
```

Se o fingerprint divergir, o processo falha fechado.

O script apenas lê um arquivo local e imprime o artefato em stdout. Ele não envia dados e não grava backend.

## Testes

Novo arquivo:

```text
app/extension/yolen-companion/tests/manychat-authenticated-evidence-artifact.test.mjs
```

Cobertura:

- relatório válido gera artefato verificável;
- fingerprint do artefato é determinístico;
- identidade bruta é rejeitada;
- conteúdo textual é rejeitado;
- falha de validação é rejeitada;
- contagem falsa de conversas distintas é rejeitada;
- troca de seletor após validação é rejeitada;
- capability perigosa é rejeitada;
- fingerprint esperado pode ser pinado.

## O que não foi alterado

A Fase 12 não altera:

- `manifest.json`;
- `host_permissions`;
- content scripts;
- runtime do WhatsApp;
- Supabase;
- APIs do Companion;
- Commercial Brain;
- Commercial Reasoning;
- captura;
- persistência;
- composer;
- envio automático.

## Limite desta fase

Esta fase não fabrica evidência real.

O artefato só poderá ser produzido com um relatório obtido de uma sessão autenticada real do ManyChat usando o harness da Fase 11.

Fixtures de teste validam o contrato do gate, não substituem a prova do produto real.

## Próximo gate técnico

Depois de existir um artefato autenticado real aprovado, o próximo passo é validar a semântica dos elementos de mensagem, incluindo:

```text
direction
occurred_at
content_type
message_key
explicit deletion
channel
assignment
```

Nenhuma dessas semânticas deve ser inferida a partir de classes ou seletores não comprovados.

## Gate de encerramento

Fase 12: **PASS arquitetural**.

Existe agora uma fronteira reproduzível entre o relatório seguro obtido no ManyChat autenticado e qualquer futura validação semântica. O sistema continua fail-closed para manifest, captura, persistência, reasoning, composer e escrita de rede.