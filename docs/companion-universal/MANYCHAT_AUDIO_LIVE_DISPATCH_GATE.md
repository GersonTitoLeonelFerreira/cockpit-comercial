# ManyChat — Gate de dispatch autenticado real de áudio

Estado: **PASS real concluído em ambiente autenticado**. O runtime mínimo de ManyChat alcançou o backend pela cadeia completa de transporte, sem persistir ciclo real nem executar transcrição OpenAI. A captura geral continua desligada.

## Objetivo

Provar no navegador real a cadeia:

ManyChat DOM → evidência estrutural validada → content script Yolen → background privilegiado → download do áudio → sessão autenticada do Companion → `/api/companion/transcribe-audio`.

Este gate NÃO tenta ainda associar automaticamente a conversa do ManyChat a um ciclo comercial real.

## Evidência real de PASS

Validação executada no Firefox 155.0.1, no ManyChat autenticado, com uma conversa real contendo áudio.

O fluxo observado foi:

1. o content script ManyChat foi carregado no domínio `app.manychat.com`;
2. o probe `#yolen-audio-probe` foi instalado no contexto isolado do Firefox;
3. um clique humano real no botão `Yolen · validar transporte de áudio` iniciou o fluxo;
4. o áudio validado foi localizado no DOM;
5. o background privilegiado obteve a mídia no host `manybot-files.manychat.io`;
6. a sessão autenticada do Companion foi usada para alcançar `/api/companion/transcribe-audio`;
7. o backend respondeu `404` para o UUID deliberadamente inexistente;
8. o botão exibiu exatamente `Yolen · transporte OK (404 esperado)`.

Esse resultado fecha o gate porque o `404` só é considerado PASS quando `transport.ready === true` e a requisição autenticada já alcançou o backend. Nenhuma associação a ciclo real foi feita e nenhuma transcrição OpenAI foi executada.

## Segurança do probe

O runtime não aceita comandos arbitrários do `page world` por `window.postMessage`.

O probe só aparece quando a página é aberta com o hash explícito:

`#yolen-audio-probe`

Mesmo nessa condição, nenhuma rede é disparada automaticamente. O download e o dispatch só acontecem depois de um clique real (`event.isTrusted === true`) no botão inserido pelo content script.

O probe usa deliberadamente o UUID inexistente:

`00000000-0000-4000-8000-000000000000`

Portanto o resultado esperado do backend é HTTP `404` em `sales_cycles`, depois de autenticação e transporte válidos. Isso prova o caminho de rede sem criar `cycle_events`, sem chamar a transcrição OpenAI e sem poluir um ciclo comercial real.

## Runtime ativado

O `manifest.json` carrega em `https://app.manychat.com/*`, nesta ordem:

1. `manychat-message-semantics.js`;
2. `manychat-message-identity.js`;
3. `manychat-message-content.js`;
4. `manychat-audio-source.js`;
5. `manychat-audio-dispatch-runtime.js`.

Nenhum runtime de WhatsApp, CSS do painel, composer ou automação comercial é carregado no ManyChat.

## Identidade do áudio

O `data-mid` bruto continua restrito ao content script.

Antes de falar com o background, o runtime deriva:

`manychat:sha256:<SHA-256 do data-mid>`

Esse valor é enviado como `audio_target_key`. O identificador nativo bruto não é enviado ao backend nem exposto no resultado diagnóstico.

## Resultado seguro

O botão grava somente uma visão segura em:

`data-yolen-probe-result`

Ela pode informar:

- status HTTP;
- se o transporte do áudio ficou pronto;
- MIME/tamanho já sanitizados pelo background;
- se o backend foi alcançado;
- se houve transcrição.

Ela não contém:

- URL do áudio;
- `data-mid` bruto;
- base64 do áudio;
- SHA-256 bruto da mídia;
- texto da transcrição.

## Critério de PASS no ambiente real

Para este probe deliberadamente sem ciclo real, o PASS é:

- áudio validado único encontrado no DOM;
- background consegue baixar a mídia;
- `transport.ready === true`;
- backend responde `404` para o UUID inexistente;
- `error_present === true`;
- nenhuma transcrição é criada.

O PASS real foi observado com:

`Yolen · transporte OK (404 esperado)`

## O que continua desligado

- captura automática ManyChat;
- associação ManyChat → lead/ciclo;
- persistência de mensagens ManyChat;
- reasoning automático;
- composer;
- escrita no ManyChat;
- automações tratadas como fala humana;
- exclusão inferida por desaparecimento do DOM.

## Próximo gate

Resolver de forma segura a identidade da conversa/contato ManyChat para um ciclo Yolen. Só depois disso executar uma transcrição real associada ao ciclo correto e iniciar a integração das mensagens de texto no contrato universal.
