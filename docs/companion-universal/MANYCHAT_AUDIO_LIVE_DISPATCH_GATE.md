# ManyChat — Gate de dispatch autenticado real de áudio

Estado: runtime mínimo de ManyChat preparado para um probe manual e sem persistência esperada. A captura geral continua desligada.

## Objetivo

Provar no navegador real a cadeia:

ManyChat DOM → evidência estrutural validada → content script Yolen → background privilegiado → download do áudio → sessão autenticada do Companion → `/api/companion/transcribe-audio`.

Este gate NÃO tenta ainda associar automaticamente a conversa do ManyChat a um ciclo comercial real.

## Segurança do probe

O runtime não aceita comandos arbitrários do `page world` por `window.postMessage`.

O probe só aparece quando a página é aberta com o hash explícito:

`#yolen-audio-probe`

Mesmo nessa condição, nenhuma rede é disparada automaticamente. O download e o dispatch só acontecem depois de um clique real (`event.isTrusted === true`) no botão inserido pelo content script.

O probe usa deliberadamente o UUID inexistente:

`00000000-0000-4000-8000-000000000000`

Portanto o resultado esperado do backend é HTTP `404` em `sales_cycles`, depois de autenticação e transporte válidos. Isso prova o caminho de rede sem criar `cycle_events`, sem chamar a transcrição OpenAI e sem poluir um ciclo comercial real.

## Runtime ativado

O `manifest.json` passa a carregar em `https://app.manychat.com/*`, nesta ordem:

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

O botão exibirá:

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

## Próximo gate após PASS real

Resolver de forma segura a identidade da conversa/contato ManyChat para um ciclo Yolen. Só depois disso executar uma transcrição real associada ao ciclo correto e iniciar a integração das mensagens de texto no contrato universal.
