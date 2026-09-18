# ManyChat — gate da bridge segura de identidade

Estado: implementação preparada para validação local + live.

## Objetivo

Transportar a identidade canônica ManyChat do MAIN world para o isolated world sem cruzar a fronteira com `subscriber_id`, `wa_id`, telefone, texto de mensagem ou qualquer outro valor bruto.

O gate anterior definiu o namespace produtivo:

- identidade principal: `manychat:contact:v1:sha256:<digest>`;
- identidade secundária WhatsApp: `manychat:channel:whatsapp:v1:sha256:<digest>`;
- `workspace_key` participa do material canônico antes do SHA-256.

## Arquitetura

### MAIN world

`manychat-safe-identity-main.js`:

1. lê o estado React por meio do probe já validado;
2. exige `subscriber_id` singleton;
3. exige que esse valor seja corroborado por pelo menos uma família interna (`thread_user_id`, `user_object_user_id` ou `data_user_id`);
4. trata `whatsapp_user_id` apenas como identidade secundária do canal;
5. chama o contrato `manychat-identity-namespace.js`;
6. retorna somente chaves namespaced e metadados seguros.

O objeto público no MAIN world não expõe métodos que retornem os valores brutos.

### Background da extensão

`manychat-safe-identity-background.js`:

1. aceita apenas `GET_MANYCHAT_SAFE_IDENTITY` originado do content script da Yolen;
2. exige top frame em `https://app.manychat.com`;
3. usa `scripting.executeScript(..., world: "MAIN")` para chamar o resolver seguro;
4. valida rigorosamente os formatos das chaves;
5. reconstrói uma resposta allowlisted, descartando qualquer campo adicional vindo do MAIN world.

Assim o transporte MAIN → background não depende de `CustomEvent`, `postMessage` ou outro canal DOM falsificável pela página.

### Isolated world

`manychat-safe-identity-bridge.js`:

- chama o background via `runtime.sendMessage`;
- valida novamente o contrato;
- expõe ao restante do Companion somente as chaves pseudônimas;
- possui probe A → B → A sob o hash `#yolen-safe-identity-bridge-probe`.

## Privacidade

A bridge não deve publicar ou persistir:

- `workspace_key` bruto;
- `subscriber_id` bruto;
- `whatsapp_user_id`/`wa_id` bruto;
- telefone;
- texto da conversa;
- snapshot React bruto.

O SHA-256 é pseudonimização determinística para namespace/collision resistance. Não é tratado como anonimização de identificadores previsíveis.

## Gate live

Fluxo obrigatório:

1. abrir conversa A com `#yolen-safe-identity-bridge-probe`;
2. clicar em `Yolen · capturar bridge A`;
3. trocar para conversa B e clicar novamente;
4. voltar para A e clicar pela terceira vez;
5. resultado esperado: `Yolen · bridge de identidade PASS`.

PASS significa:

- identidade pseudônima A foi resolvida via MAIN → background → isolated;
- B gerou chave de plataforma diferente;
- retorno para A recuperou exatamente a chave pseudônima inicial;
- nenhum identificador bruto cruzou a resposta segura.

## Ainda desligado

Mesmo com PASS, este gate não ativa automaticamente:

- resolução ManyChat → lead;
- associação com `cycle_id`;
- persistência geral de mensagens ManyChat;
- reasoning produtivo;
- composer/escrita no ManyChat.

O próximo gate, após o PASS live, será usar a chave pseudônima validada para desenhar a associação determinística com lead/ciclo sem depender de nome ou telefone visível.
