# ManyChat — Gate de wiring do áudio no background

Estado: transporte de áudio ManyChat conectado ao único listener de background da extensão, com permissão mínima para o host de mídia e dispatch autenticado preparado. O ManyChat ainda não é injetado como content script e nenhuma captura automática foi ativada.

## Evidência real que abriu este gate

A fonte de áudio observada no ManyChat foi validada previamente como HTTPS estável em `manybot-files.manychat.io`.

O arquivo real foi obtido fora da página e depois novamente pelo módulo `manychat-audio-background-transport.js`:

- `ready = true`;
- HTTP `200`;
- MIME `audio/ogg`;
- 59.817 bytes;
- SHA-256 igual ao probe anterior;
- base64 gerado;
- safe view sem URL, base64 ou digest bruto.

O `fetch()` feito no page world do ManyChat havia sido bloqueado pela CSP `connect-src`. Isso confirmou que a mídia precisa ser obtida pelo contexto privilegiado da extensão.

## Wiring implementado

### Manifest

`manifest.json` agora concede somente a permissão de host necessária para a mídia validada:

`https://manybot-files.manychat.io/*`

`app.manychat.com` ainda NÃO foi adicionado a `content_scripts` nem a `host_permissions` neste gate.

No Firefox, a ordem de scripts de background passa a ser:

1. `capture-transport.js`;
2. `manychat-audio-background-transport.js`;
3. `background.js`.

No Chrome, `background-service-worker.js` importa a mesma sequência antes de registrar o listener existente.

## Ação interna do background

O listener único já existente passa a reconhecer:

`TRANSCRIBE_MANYCHAT_AUDIO`

A ação executa, em ordem:

1. valida e baixa a URL de mídia pelo transporte ManyChat;
2. produz uma safe view sem material sensível;
3. monta o payload universal com `platform = manychat`;
4. preserva `channel`, `audio_target_key`, `audio_index` e `cycle_id`;
5. remove a URL de origem do payload enviado ao backend;
6. reutiliza `requestYolenWithToken`, portanto exige a sessão autenticada já usada pelo Companion;
7. envia somente o payload de transcrição para `/api/companion/transcribe-audio`.

Falha no download ou na construção do payload encerra o fluxo antes do backend.

## Release engineering

A allowlist de empacotamento agora inclui `manychat-audio-background-transport.js`.

`PRODUCTION_HOSTS` inclui o host de mídia do ManyChat, mantendo os validadores DEV/PROD coerentes com o manifest.

Os testes de manifest foram atualizados para a nova ordem do background e para o host adicional.

## Teste de wiring

`manychat-audio-background-wiring.test.mjs` cobre:

- ordem de carregamento no Firefox;
- ordem de `importScripts` no Chrome;
- host de mídia presente sem ativar `app.manychat.com`;
- coerência da allowlist de pacote;
- preservação da transformação PROD;
- ação `TRANSCRIBE_MANYCHAT_AUDIO` usando sessão autenticada;
- ausência de `audio_url` no body enviado ao backend;
- interrupção antes do backend quando o download falha.

## O que continua desligado

Continuam desligados neste gate:

- content script em `app.manychat.com`;
- captura automática ManyChat;
- persistência geral do adapter;
- reasoning automático;
- composer;
- escrita no ManyChat;
- interpretação de automações como fala humana;
- exclusão por desaparecimento do DOM.

## Próximo gate

O próximo gate deve ativar um runtime ManyChat mínimo e explícito no domínio `app.manychat.com`, ainda sem captura geral: ler a mensagem de áudio já validada, enviar `TRANSCRIBE_MANYCHAT_AUDIO` ao background e executar o primeiro dispatch autenticado real de ponta a ponta. Somente depois dessa prova o fluxo pode avançar para integração de mensagens de texto e captura normalizada.
