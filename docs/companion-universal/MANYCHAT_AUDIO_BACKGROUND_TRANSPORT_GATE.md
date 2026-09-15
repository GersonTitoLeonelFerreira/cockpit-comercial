# ManyChat — Gate do transporte background de áudio

Estado: estratégia de transporte definida e módulo seguro de background preparado, ainda sem wiring produtivo no listener da extensão.

## Evidência autenticada

No ambiente real do ManyChat, a leitura do elemento `<audio>` comprovou uma fonte HTTPS estável em `manybot-files.manychat.io`.

O arquivo também foi obtido externamente com sucesso:

- HTTP `206`;
- `audio/ogg`;
- 59.817 bytes;
- suporte a `Accept-Ranges: bytes`;
- SHA-256 válido.

Depois disso, um `fetch()` executado no contexto da própria página `app.manychat.com` foi bloqueado pela Content Security Policy do ManyChat. O erro observado foi de `connect-src`, antes de qualquer resposta útil da mídia.

Conclusão: o runtime NÃO deve depender de `fetch()` executado no page world do ManyChat para obter áudio.

## Decisão de arquitetura

A obtenção dos bytes será feita fora do page world, usando o contexto privilegiado da extensão/background. O DOM do ManyChat continua responsável somente por fornecer a evidência estrutural já validada:

- identidade nativa `data-mid`;
- autoria;
- timestamp;
- classificação de conteúdo como áudio;
- URL HTTPS da fonte.

O transporte privilegiado é responsável por buscar e validar os bytes antes de qualquer dispatch à Yolen.

## Módulo preparado

Arquivo:

`app/extension/yolen-companion/src/manychat-audio-background-transport.js`

O módulo implementa:

- allowlist estrita do host `manybot-files.manychat.io`;
- HTTPS obrigatório;
- bloqueio de credenciais embutidas na URL;
- revalidação do host final depois de redirects;
- `credentials: omit`;
- `cache: no-store`;
- MIME obrigatório `audio/*`;
- limite máximo de 15 MiB;
- validação por `Content-Length` quando disponível e novamente pelo tamanho real;
- cálculo SHA-256 dos bytes;
- codificação base64;
- montagem do payload compatível com o backend universal já criado;
- `platform = manychat` e `channel` namespaced;
- `audio_target_key` obrigatoriamente iniciado por `manychat:`;
- safe view sem URL, base64 ou digest bruto.

## O que continua desligado

Este gate NÃO registra ainda um novo listener de mensagem no background e NÃO injeta runtime ManyChat no manifest.

Portanto continuam desligados:

- fetch produtivo disparado pela UI ManyChat;
- dispatch autenticado real;
- captura geral;
- persistência pelo adapter ManyChat;
- reasoning;
- composer;
- escrita no ManyChat.

O módulo é uma fronteira de segurança pronta para o próximo wiring, sem introduzir duas respostas concorrentes em `runtime.onMessage` e sem alterar o fluxo existente do WhatsApp.

## Testes adicionados

A suíte cobre:

- allowlist correta do host;
- rejeição de HTTP e hosts semelhantes maliciosos;
- fetch HTTP 206 de áudio;
- SHA-256 e base64;
- redirect para host não permitido;
- MIME não-áudio;
- limite de tamanho antes e depois da leitura dos bytes;
- montagem do payload universal ManyChat;
- namespace obrigatório da message key;
- privacidade da safe view.

## Próximo gate

Fazer o wiring desse módulo no background existente de forma determinística, sem listener concorrente, adicionar a permissão mínima de host necessária no pacote e então executar o primeiro fetch + dispatch autenticado real a partir do runtime ManyChat.
